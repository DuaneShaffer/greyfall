import type { Effect, TileCoord } from "../../data/index.js";
import { resolveArea } from "../rules/abilities.js";
import { inertAmountTarget, resolveAmount, unitAmountTarget } from "../rules/damage.js";
import { FORCED_MOVE_HEIGHT_LIMIT, objectMaxHp, SPAWNED_OBJECT_SHAPES } from "../rules/effects.js";
import {
  coordEq,
  facingToward,
  FACING_VECTORS,
  inBounds,
  isStandable,
  manhattan,
  neighbors,
  objectById,
  objectsAt,
  standHeight,
  tileIndex,
  unitAt,
  unitById,
} from "../rules/grid.js";
import { consumableItem, itemAbility } from "../rules/items.js";
import { isEnergized } from "../rules/power.js";
import { getStatus } from "../state/content.js";
import { maxCharge, maxHp } from "../rules/status.js";
import { aimedTile, hasLos, inRange, isValidTargetKind, unmetRequirement } from "../rules/targeting.js";
import { forecast, turnOrderPreview, usableItems, type ForecastEntry } from "../selectors.js";
import type { ActionAbility, BattleUnit, GameState, ObjectRuntime, TargetRef } from "../state/types.js";
import { damageBite, effectiveHp, fieldDistance, type AiContext } from "./context.js";
import { UNREACHABLE } from "./field.js";
import { positionValue } from "./positioning.js";
import type { AiWeights } from "./weights.js";

/** One value per object id, computed once per decision and reused by every candidate. */
function memo(ctx: AiContext, key: string, compute: () => number): number {
  const cached = ctx.objectMemo.get(key);
  if (cached !== undefined) return cached;
  const value = compute();
  ctx.objectMemo.set(key, value);
  return value;
}

/** How much a status is worth landing on a hostile; negative means it helps. */
export function statusValue(ctx: AiContext, state: GameState, statusId: string): number {
  const status = getStatus(state, statusId);
  if (status === undefined) return 0;
  const w = ctx.weights;
  const hooks = status.hooks;
  let value = 0;
  if (hooks.preventsAction === true) value += w.statusPreventAction;
  if (hooks.preventsMove === true) value += w.statusPreventMove;
  if (hooks.preventsReaction === true) value += w.statusPreventReaction;
  if (hooks.ctMultiplierPercent !== undefined) {
    value += (100 - hooks.ctMultiplierPercent) * w.statusCtPerPercent;
  }
  if (hooks.tickDamage !== undefined) value += hooks.tickDamage.amount * w.damagePerHp;
  if (hooks.statMods !== undefined) {
    for (const key of Object.keys(hooks.statMods).sort()) {
      const mod = hooks.statMods[key as keyof typeof hooks.statMods];
      if (mod !== undefined) value -= mod * w.statusStatPoint;
    }
  }
  if (value === 0) value = status.category === "debuff" ? w.statusFallback : -w.statusFallback;

  const turns = status.duration.kind === "turns" ? Math.min(status.duration.turns, w.statusTurnCap) : w.statusTurnCap;
  return Math.floor((value * (100 + (turns - 1) * 50)) / 100);
}

/**
 * Share of a status's value still on the table for a target that already holds
 * it. Re-applying refreshes the clock rather than stacking (`COMBAT_RULES` §9),
 * so all a second cast buys is the turns the first one has already burned: a
 * full-duration hold is worth nothing, one about to lapse is worth most of it.
 * Without this the search re-buys its own buffs every idle turn
 * (`BALANCE_REPORT` G2).
 */
function heldPercent(ctx: AiContext, state: GameState, statusId: string, unit: BattleUnit): number {
  const held = unit.statuses.find((s) => s.statusId === statusId);
  if (held === undefined) return 100;
  const floor = ctx.weights.heldStatusFloorPercent;
  if (held.turnsRemaining === null) return floor;
  const status = getStatus(state, statusId);
  const full = status?.duration.kind === "turns" ? status.duration.turns : 0;
  if (full <= 0) return floor;
  const gained = Math.max(0, full - held.turnsRemaining);
  return Math.max(floor, Math.min(100, Math.floor((gained * 100) / full)));
}

/** `statusValue` discounted for what the target is already carrying. */
function landedStatusValue(
  ctx: AiContext,
  state: GameState,
  statusId: string,
  unit: BattleUnit,
  chance: number,
): number {
  const base = statusValue(ctx, state, statusId);
  if (base === 0) return 0;
  return Math.floor((base * chance * heldPercent(ctx, state, statusId, unit)) / 10000);
}

/**
 * Value of one unit taking `harm` and `aid`, signed for the actor's team.
 *
 * A neutral bystander scores zero — the AI neither hunts nor shields it.
 * On a friendly, *negative* harm is a buff rather than an inverted injury:
 * crediting it as capped utility keeps `selfHarmPercent` (written to make the
 * AI protective) from doubling the value of helping itself, which is what made
 * self-buffs outscore kills (BALANCE_REPORT F4).
 */
function sideValue(ctx: AiContext, unit: BattleUnit, harm: number, aid: number): number {
  const w = ctx.weights;
  if (unit.team === "neutral" && unit.team !== ctx.actor.team) return 0;
  if (unit.team !== ctx.actor.team) return harm - aid;
  const percent = unit.id === ctx.actor.id ? w.selfHarmPercent : w.friendlyHarmPercent;
  const injury = Math.max(0, harm);
  const benefit = Math.min(Math.max(0, -harm), w.buffValueCap);
  return (
    Math.floor(((aid + benefit) * ctx.profile.allyAidPercent) / 100) - Math.floor((injury * percent) / 100)
  );
}

/** Diminishing returns on a hostile several allies can already reach. */
function crowdingPercent(ctx: AiContext, unit: BattleUnit): number {
  if (unit.team === ctx.actor.team) return 100;
  const engaged = ctx.crowding.get(unit.id) ?? 0;
  return Math.max(40, 100 - engaged * ctx.weights.crowdingPercent);
}

function extraEffectValue(
  ctx: AiContext,
  state: GameState,
  effect: Effect,
  unit: BattleUnit,
  hitChance: number,
): { harm: number; aid: number } {
  const w = ctx.weights;
  switch (effect.kind) {
    case "forceMove":
      return { harm: Math.floor((w.forceMovePoint * hitChance) / 100), aid: 0 };
    case "modifyCharge": {
      if (effect.amount > 0) {
        const room = Math.max(0, maxCharge(state, unit) - unit.charge);
        const gained = Math.min(effect.amount, room);
        return { harm: 0, aid: Math.floor((gained * w.chargePoint * hitChance) / 100) };
      }
      const drain = -effect.amount;
      return { harm: Math.floor((drain * w.chargePoint * w.drainChargePercent) / 100), aid: 0 };
    }
    case "removeStatus": {
      const held = unit.statuses.some((s) => s.statusId === effect.statusId);
      if (!held) return { harm: 0, aid: 0 };
      const value = statusValue(ctx, state, effect.statusId);
      return value >= 0 ? { harm: 0, aid: value } : { harm: -value, aid: 0 };
    }
    case "modifyStats": {
      let value = 0;
      for (const key of Object.keys(effect.mods).sort()) {
        const mod = effect.mods[key as keyof typeof effect.mods];
        if (mod !== undefined) value -= mod * w.statusStatPoint;
      }
      return value >= 0 ? { harm: value, aid: 0 } : { harm: 0, aid: -value };
    }
    default:
      return { harm: 0, aid: 0 };
  }
}

/** Value of an `onDestroyed` or `operable` payload landing on a set of tiles. */
export function payloadValue(
  ctx: AiContext,
  state: GameState,
  effects: readonly Effect[],
  tiles: readonly TileCoord[],
): number {
  const w = ctx.weights;
  let total = 0;
  for (const tile of tiles) {
    const unit = unitAt(state, tile);
    if (unit === undefined) continue;
    let harm = 0;
    let aid = 0;
    const hp = Math.max(0, effectiveHp(ctx, unit));
    let damage = 0;
    for (const effect of effects) {
      switch (effect.kind) {
        case "damage":
          damage += resolveAmount(state, effect.amount, null, unitAmountTarget(state, unit));
          break;
        case "heal":
          aid +=
            Math.min(
              resolveAmount(state, effect.amount, null, unitAmountTarget(state, unit)),
              Math.max(0, maxHp(state, unit) - unit.hp),
            ) * w.healPerHp;
          break;
        case "applyStatus":
          harm += landedStatusValue(ctx, state, effect.statusId, unit, effect.chance);
          break;
        default: {
          const extra = extraEffectValue(ctx, state, effect, unit, 100);
          harm += extra.harm;
          aid += extra.aid;
        }
      }
    }
    harm += Math.min(damage, hp) * w.damagePerHp;
    if (damage >= hp && hp > 0) harm += w.killBonus;
    total += Math.floor((sideValue(ctx, unit, harm, aid) * crowdingPercent(ctx, unit)) / 100);
  }
  return total;
}

/**
 * What the map loses when a blocker comes down: the detour it was imposing on
 * the actor's path to its quarry. Reads the live map and the distance fields
 * only, never the candidate tile, so it is computed once per decision
 * (`BALANCE_REPORT` G4).
 */
function structuralValue(ctx: AiContext, obj: ObjectRuntime): number {
  const w = ctx.weights;
  if (!obj.def.blocksMovement || obj.def.surfaceHeight !== undefined) return 0;

  const quarry = ctx.quarry;
  const field = quarry === null ? undefined : ctx.fields.get(quarry.id);
  if (field === undefined) return 0;

  const map = ctx.state.content.map;
  const home = ctx.actor.position;
  const here = field[tileIndex(map, home)] ?? UNREACHABLE;
  let saved = 0;
  for (const tile of obj.def.tiles) {
    let near = UNREACHABLE;
    for (const step of neighbors(tile)) {
      if (!inBounds(map, step)) continue;
      const distance = field[tileIndex(map, step)] ?? UNREACHABLE;
      if (distance < near) near = distance;
    }
    if (near >= UNREACHABLE) continue;
    // Walking to this tile and out the far side, against what the way round
    // costs today. A blocker the actor is already on the near side of saves it
    // nothing; one walling the quarry off entirely is worth the whole cap.
    const through = manhattan(home, tile) + near + 1;
    saved = Math.max(saved, here >= UNREACHABLE ? w.objectPathCap : here - through);
  }
  return Math.min(Math.max(0, saved), w.objectPathCap) * w.objectPathPoint;
}

const structureOf = (ctx: AiContext, obj: ObjectRuntime): number =>
  memo(ctx, `structure:${obj.def.id}`, () => structuralValue(ctx, obj));

/** Share of a consequence left once it is `distance` steps away from the fight. */
function horizonPercent(w: AiWeights, distance: number): number {
  const horizon = w.objectHorizon;
  if (distance >= UNREACHABLE) return 0;
  return Math.floor((100 * (horizon - Math.min(distance, horizon) + 1)) / (horizon + 1));
}

/**
 * What a machine would do to us in enemy hands. `floor-nine-mains` exists to
 * turn a press line off; before this the search could not see any reason to
 * (`BALANCE_REPORT` G5).
 *
 * A press line hurts whoever is standing at its business end, whoever pulls the
 * lever, so the credit is the payload tapered twice: by how near our own people
 * are to the tiles it covers, and by how far a hostile has to walk to reach a
 * tile it can be worked from. Levers are pulled from beside the machine, not
 * from on top of it — the footprint itself is usually not even standable.
 */
function machineDenial(ctx: AiContext, state: GameState, obj: ObjectRuntime): number {
  return memo(ctx, `denial:${obj.def.id}`, () => {
    const operable = obj.def.operable;
    if (operable === null || obj.destroyed) return 0;
    const w = ctx.weights;

    let harm = damageBite(state, operable.effects, ctx.actor) * w.damagePerHp;
    for (const effect of operable.effects) {
      if (effect.kind !== "applyStatus") continue;
      harm += Math.floor((statusValue(ctx, state, effect.statusId) * effect.chance) / 100);
    }
    if (harm <= 0) return 0;

    let enemyNear = UNREACHABLE;
    for (const hostile of ctx.hostiles) {
      for (const tile of obj.def.tiles) {
        for (const stand of [tile, ...neighbors(tile)]) {
          enemyNear = Math.min(enemyNear, fieldDistance(ctx, hostile.id, stand));
        }
      }
    }
    let friendNear = UNREACHABLE;
    for (const friend of [ctx.actor, ...ctx.allies]) {
      for (const tile of operable.targetTiles) friendNear = Math.min(friendNear, manhattan(friend.position, tile));
    }
    const exposed = operable.targetTiles.length === 0 ? 100 : horizonPercent(w, friendNear);
    const reach = horizonPercent(w, enemyNear);
    return Math.floor((harm * w.machineDenialPercent * reach * exposed) / 1000000);
  });
}

/** Objects the destroyed object's own payload would take out with it. */
function chainValue(
  ctx: AiContext,
  state: GameState,
  source: ObjectRuntime,
  payload: NonNullable<ObjectRuntime["def"]["onDestroyed"]>,
): number {
  if (!payload.effects.some((effect) => effect.kind === "damageObject")) return 0;
  let total = 0;
  const seen = new Set<string>([source.def.id]);
  for (const tile of payload.targetTiles) {
    for (const other of objectsAt(state, tile)) {
      if (other.destroyed || seen.has(other.def.id) || !other.def.integrity.destructible) continue;
      seen.add(other.def.id);
      let damage = 0;
      for (const effect of payload.effects) {
        if (effect.kind !== "damageObject") continue;
        damage += resolveAmount(state, effect.amount, null, inertAmountTarget(objectMaxHp(other)));
      }
      if (damage < other.hp) continue;
      const knock = other.def.onDestroyed;
      let worth = structureOf(ctx, other) + machineDenial(ctx, state, other);
      if (knock !== undefined) worth += payloadValue(ctx, state, knock.effects, knock.targetTiles);
      if (worth > 0) total += Math.floor((worth * ctx.weights.objectChainPercent) / 100);
    }
  }
  return total;
}

/** What blowing an object up is worth right now, payload and footprint alike. */
export function destroyValue(ctx: AiContext, state: GameState, obj: ObjectRuntime): number {
  let value = structureOf(ctx, obj) + machineDenial(ctx, state, obj);
  const payload = obj.def.onDestroyed;
  if (payload !== undefined) {
    value += payloadValue(ctx, state, payload.effects, payload.targetTiles);
    value += chainValue(ctx, state, obj, payload);
  }
  if (obj.def.blocksMovement || obj.def.blocksLos) value += ctx.weights.objectStructurePoint;
  return Math.floor((value * ctx.profile.objectPercent) / 100);
}

/**
 * Worth of flipping an object's power. Two consequences are modelled: the deck
 * — a lift or catwalk that loses power drops the tile back to terrain height,
 * pulling a unit parked out of reach back into everyone's range and stranding
 * an ally if the AI is careless — and the machine itself, which only works
 * while it is live.
 */
function powerSwingValue(ctx: AiContext, state: GameState, obj: ObjectRuntime, mode: "on" | "off" | "toggle"): number {
  if (obj.destroyed || obj.powered === null) return 0;
  const next = mode === "toggle" ? !obj.powered : mode === "on";
  if (next === obj.powered) return 0;

  let value = 0;
  if (obj.def.surfaceHeight !== undefined) {
    for (const tile of obj.def.tiles) {
      const occupant = unitAt(state, tile);
      if (occupant === undefined) continue;
      const gain = next ? 1 : -1;
      const side = occupant.team === ctx.actor.team ? 1 : -1;
      value += gain * side * ctx.weights.deckPoint;
    }
  }
  if (obj.def.operable?.requiresPower === true) {
    const denial = machineDenial(ctx, state, obj);
    value += next ? -denial : denial;
  }
  return Math.floor((value * ctx.profile.objectPercent) / 100);
}

function objectHitValue(ctx: AiContext, state: GameState, objectId: string, damage: number, heal: number): number {
  const obj = objectById(state, objectId);
  if (obj === undefined || obj.destroyed) return 0;
  if (!obj.def.integrity.destructible) return 0;
  const remaining = obj.hp;
  if (heal > 0 && damage === 0) {
    // Map-authored objects carry `owner: null`; repairing them is worth doing
    // too, or a repair kit can only ever mend what its own team deployed.
    const owned = obj.owner === null || obj.owner === ctx.actor.team;
    const repaired = Math.min(heal, objectMaxHp(obj) - remaining);
    return owned ? repaired * ctx.weights.damagePerHp : 0;
  }
  if (damage <= 0) return 0;
  const full = destroyValue(ctx, state, obj);
  if (damage >= remaining) return full;
  if (full <= 0) return 0;
  return Math.floor((full * damage * ctx.weights.objectChipPercent) / (remaining * 100));
}

function entryValue(ctx: AiContext, state: GameState, ability: ActionAbility, entry: ForecastEntry): number {
  const w = ctx.weights;
  if (entry.unitId === null) {
    if (entry.objectId === null) return 0;
    return objectHitValue(ctx, state, entry.objectId, entry.damage, entry.heal);
  }
  const unit = unitById(state, entry.unitId);
  if (unit === undefined || unit.downed) return 0;

  const hp = effectiveHp(ctx, unit);
  const doomed = hp <= 0;
  const useful = Math.min(entry.damage, Math.max(0, hp));
  const kills = entry.damage >= hp && hp > 0;

  let harm = Math.floor((useful * w.damagePerHp * entry.hitChance) / 100);
  if (kills) harm += Math.floor((w.killBonus * entry.hitChance) / 100);
  let aid = Math.min(entry.heal, Math.max(0, maxHp(state, unit) - unit.hp)) * w.healPerHp;

  if (!kills) {
    for (const status of entry.statusChances) {
      harm += landedStatusValue(ctx, state, status.statusId, unit, status.chance);
    }
  }
  for (const effect of ability.effects) {
    if (effect.kind === "damage" || effect.kind === "heal" || effect.kind === "applyStatus") continue;
    const extra = extraEffectValue(ctx, state, effect, unit, entry.hitChance);
    harm += extra.harm;
    aid += extra.aid;
  }

  let value = sideValue(ctx, unit, harm, aid);
  if (doomed && value > 0) value = Math.floor((value * w.doomedTargetPercent) / 100);
  return Math.floor((value * crowdingPercent(ctx, unit)) / 100);
}

/** Share of a deployable's payload left once the nearest hostile is out of reach. */
function reachTaper(w: AiWeights, overshoot: number): number {
  return Math.max(w.deployableReachFloor, 100 - Math.max(0, overshoot) * w.deployableReachStep);
}

/**
 * What putting a deployable on the board is worth: the obstacle itself, plus
 * its payload measured against the hostile it is most likely to meet.
 *
 * A deployable cannot walk. Everything here is a discount on the flat 2.5 shots
 * the old table credited (`BALANCE_REPORT` G6): a turret only earns its keep if
 * something hostile is inside the range it will *never* leave, it forfeits a
 * shot to the CT clock it starts at zero on (`COMBAT_RULES` §14), and it has to
 * live long enough against whoever on the other side can break machinery.
 */
function spawnValue(
  ctx: AiContext,
  state: GameState,
  effect: Extract<Effect, { kind: "spawnObject" }>,
  tiles: readonly TileCoord[],
): number {
  const w = ctx.weights;
  const spot = tiles[0];
  if (spot === undefined) return 0;
  let value = SPAWNED_OBJECT_SHAPES[effect.object].blocksMovement ? w.spawnObjectPoint : 0;

  let near = UNREACHABLE;
  let victim: BattleUnit | undefined;
  for (const hostile of ctx.hostiles) {
    const distance = fieldDistance(ctx, hostile.id, spot);
    if (distance < near) {
      near = distance;
      victim = hostile;
    }
  }
  if (victim === undefined || near >= UNREACHABLE) return value;

  if (effect.onContact !== undefined) {
    // Contact fires on the tile a unit *ends* its move on, so a mine is only
    // worth what it is worth to somebody about to stand there.
    const bite = damageBite(state, effect.onContact.effects, victim);
    const percent = reachTaper(w, near - 1);
    value += Math.floor((bite * w.damagePerHp * w.contactPayloadPercent * percent) / 10000);
  }
  if (effect.attack !== undefined) {
    let breakers = 0;
    for (const threat of ctx.threats) breakers += threat.objectStrike;
    const survival =
      breakers <= 0 ? 100 : Math.min(100, Math.floor((100 * effect.hp) / (breakers * w.deployableLifeTurns)));
    const reach = reachTaper(w, near - effect.attack.range.max);
    let shots = Math.floor((w.autoAttackPercent * reach * survival) / 10000);
    shots = Math.max(0, shots - w.deployableSetupPercent);
    const shot = resolveAmount(state, effect.attack.amount, ctx.actor, unitAmountTarget(state, victim));
    value += Math.floor((shot * w.damagePerHp * shots) / 100);
  }
  return value;
}

/** Where a `moveSelf` effect would actually put the actor, blockers included. */
function moveSelfDestination(
  view: GameState,
  actor: BattleUnit,
  from: TileCoord,
  effect: Extract<Effect, { kind: "moveSelf" }>,
  aimed: TileCoord | undefined,
): TileCoord {
  const facing =
    effect.direction === "forward" || aimed === undefined || coordEq(aimed, from)
      ? actor.facing
      : effect.direction === "toward-target"
        ? facingToward(from, aimed)
        : facingToward(aimed, from);
  const step = FACING_VECTORS[facing];
  let current = from;
  for (let i = 0; i < effect.distance; i += 1) {
    const next: TileCoord = { x: current.x + step.dx, y: current.y + step.dy };
    if (!inBounds(view.content.map, next)) break;
    if (!isStandable(view, next)) break;
    if (unitAt(view, next) !== undefined) break;
    if (Math.abs(standHeight(view, next) - standHeight(view, current)) > FORCED_MOVE_HEIGHT_LIMIT) break;
    current = next;
  }
  return current;
}

/**
 * What the repositioning half of an ability is worth: the tile it lands on
 * against the tile it leaves, capped so a lunge can never outbid a kill.
 * Priced at zero, an ability whose point is the movement could never be chosen
 * for the movement (`BALANCE_REPORT` G1).
 */
function repositionValue(
  ctx: AiContext,
  view: GameState,
  actor: BattleUnit,
  effect: Extract<Effect, { kind: "moveSelf" }>,
  target: TargetRef,
): number {
  const from = actor.position;
  const dest = moveSelfDestination(view, actor, from, effect, aimedTile(view, target));
  if (coordEq(dest, from)) return 0;
  const swing = positionValue(ctx, view, dest) - positionValue(ctx, view, from);
  const cap = ctx.weights.repositionCap;
  return Math.max(-cap, Math.min(cap, swing));
}

/** Unit turns the aimed-at unit gets before a cast at this speed lands. */
function turnsBeforeLanding(state: GameState, castSpeed: number, unitId: string): number {
  const ticks = Math.ceil(100 / castSpeed);
  const landing = state.clock + ticks;
  let turns = 0;
  for (const entry of turnOrderPreview(state, 12)) {
    if (entry.clock >= landing) break;
    if (entry.kind === "unit" && entry.id === unitId) turns += 1;
  }
  return turns;
}

/** The tiles and objects an aimed ability covers; `actionOptions` already has these. */
export interface ShapedArea {
  tiles: readonly TileCoord[];
  objectIds: readonly string[];
}

function targetKey(target: TargetRef): string {
  if (target.kind === "unit") return `u${target.unitId}`;
  if (target.kind === "object") return `o${target.objectId}`;
  return `t${target.tile.x},${target.tile.y}`;
}

/** `resolveArea`, memoised for every footprint that does not read the actor's tile. */
function shapedArea(
  ctx: AiContext,
  view: GameState,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
): ShapedArea {
  if (ability.targeting.area.shape === "line") return resolveArea(view, actor, ability, target);
  const key = `${ability.id}|${targetKey(target)}`;
  const cached = ctx.areaMemo.get(key);
  if (cached !== undefined) return cached;
  const resolved = resolveArea(view, actor, ability, target);
  const shaped: ShapedArea = { tiles: resolved.tiles, objectIds: resolved.objectIds };
  ctx.areaMemo.set(key, shaped);
  return shaped;
}

/**
 * Score one legal (ability, target) pair from wherever the actor is standing in
 * `view`. Positive means "worth doing"; costs, chip-damage flux waste, and the
 * chance a charged cast lands on empty ground are all already subtracted.
 */
export function abilityValue(
  ctx: AiContext,
  view: GameState,
  ability: ActionAbility,
  target: TargetRef,
  area?: ShapedArea,
): number {
  const actor = unitById(view, ctx.actor.id) ?? ctx.actor;
  let gross = 0;
  for (const entry of forecast(view, ctx.actor.id, ability.id, target)) {
    gross += entryValue(ctx, view, ability, entry);
  }

  let shaped = area;
  for (const effect of ability.effects) {
    switch (effect.kind) {
      case "spawnObject": {
        shaped ??= shapedArea(ctx, view, actor, ability, target);
        gross += Math.floor((spawnValue(ctx, view, effect, shaped.tiles) * ctx.profile.objectPercent) / 100);
        break;
      }
      case "setPower": {
        shaped ??= shapedArea(ctx, view, actor, ability, target);
        for (const objectId of shaped.objectIds) {
          const obj = objectById(view, objectId);
          if (obj !== undefined) gross += powerSwingValue(ctx, view, obj, effect.mode);
        }
        break;
      }
      case "moveSelf":
        gross += repositionValue(ctx, view, actor, effect, target);
        break;
      default:
        break;
    }
  }

  let value = gross;
  if (ability.castSpeed !== null) {
    if (target.kind === "unit" && gross > 0) {
      const turns = turnsBeforeLanding(view, ability.castSpeed, target.unitId);
      for (let i = 0; i < turns; i += 1) {
        value = Math.floor((value * ctx.weights.castEscapePercent) / 100);
      }
    }
    value -= ctx.weights.castTurnCost;
  }

  if (ability.chargeCost > 0) {
    const w = ctx.weights;
    // Flux does not regenerate: a battle is one pool, so a point spent now is a
    // point the rest of the battle does without. The price per point therefore
    // rises with the share of the pool *still in hand* that this cast eats,
    // which is what makes a Machinist's 12-of-18 frame expensive and a
    // Conduit's 5-of-53 arc cheap. The old flat gross-value gate priced both
    // the same and deleted every cheap utility ability (`BALANCE_REPORT` G3).
    const pool = Math.max(1, actor.charge);
    const scarcity = 100 + Math.floor((w.fluxScarcityPercent * ability.chargeCost) / pool);
    value -= Math.floor((ability.chargeCost * w.chargePoint * scarcity) / 100);
    // What is left of the chip guard: buying trivia with flux is still worse
    // than doing nothing, but the bar is a nudge rather than a cliff.
    const shortfall = Math.max(0, w.chipThreshold - Math.max(0, gross));
    if (shortfall > 0 && w.chipThreshold > 0) {
      value -= Math.floor((w.chipPenalty * shortfall) / w.chipThreshold);
    }
  }
  value -= (ability.hpCost ?? 0) * ctx.weights.hpPoint;
  return value;
}

/** Value of pulling an operable object's lever from an adjacent tile. */
export function activateValue(ctx: AiContext, view: GameState, obj: ObjectRuntime): number {
  const operable = obj.def.operable;
  if (operable === null) return 0;
  let value = payloadValue(ctx, view, operable.effects, operable.targetTiles);
  for (const objectId of operable.targetObjectIds) {
    const other = objectById(view, objectId);
    if (other === undefined || other.destroyed) continue;
    let damage = 0;
    for (const effect of operable.effects) {
      if (effect.kind === "setPower") value += powerSwingValue(ctx, view, other, effect.mode);
      if (effect.kind !== "damageObject") continue;
      damage += resolveAmount(view, effect.amount, null, inertAmountTarget(objectMaxHp(other)));
    }
    if (damage > 0) value += objectHitValue(ctx, view, objectId, damage, 0);
  }
  return value;
}

/** Every target reference worth considering for one ability, in a fixed order. */
export function targetCandidates(ctx: AiContext, view: GameState, ability: ActionAbility): TargetRef[] {
  const allowed = ability.targeting.validTargets;
  const out: TargetRef[] = [];
  if (allowed.includes("enemy")) {
    for (const unit of ctx.hostiles) out.push({ kind: "unit", unitId: unit.id });
  }
  if (allowed.includes("ally")) {
    for (const unit of ctx.allies) out.push({ kind: "unit", unitId: unit.id });
  }
  if (allowed.includes("self") || allowed.includes("ally")) {
    out.push({ kind: "unit", unitId: ctx.actor.id });
  }
  if (allowed.includes("object")) {
    for (const obj of view.map.objects) {
      if (obj.destroyed) continue;
      out.push({ kind: "object", objectId: obj.def.id });
    }
  }
  if (allowed.includes("emptyTile")) {
    const map = view.content.map;
    const seen = new Set<number>();
    const area = ability.targeting.area;
    const spread = area.shape === "radius" ? area.size : 0;
    const anchors: TileCoord[] = [ctx.actor.position, ...ctx.hostiles.map((u) => u.position)];
    for (const anchor of anchors) {
      for (let y = anchor.y - spread - 1; y <= anchor.y + spread + 1; y += 1) {
        for (let x = anchor.x - spread - 1; x <= anchor.x + spread + 1; x += 1) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.depth) continue;
          if (manhattan({ x, y }, anchor) > spread + 1) continue;
          const index = y * map.width + x;
          if (seen.has(index)) continue;
          seen.add(index);
        }
      }
    }
    for (const index of [...seen].sort((a, b) => a - b)) {
      out.push({ kind: "tile", tile: { x: index % map.width, y: Math.floor(index / map.width) } });
    }
  }
  return out;
}

export interface ActionOption {
  score: number;
  abilityId: string | null;
  /** Set instead of `abilityId` when the action is spending a consumable. */
  itemId: string | null;
  objectId: string | null;
  target: TargetRef | null;
}

/** Whether an aimed action is legal from `at`; the gate both action loops share. */
function aimable(
  view: GameState,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
  at: TileCoord,
): boolean {
  const aimed = aimedTile(view, target);
  if (aimed === undefined) return false;
  if (!inRange(view, at, aimed, ability.targeting.range)) return false;
  if (!isValidTargetKind(view, actor, ability, target)) return false;
  if (target.kind === "object" && objectById(view, target.objectId)?.destroyed === true) return false;
  if (ability.targeting.requiresLos && !hasLos(view, at, aimed)) return false;
  return unmetRequirement(view, actor, ability, target) === null;
}

/**
 * Every action the actor could take standing on `at`, scored. `view` must be
 * the state with the actor already placed there, so range, line of sight, and
 * the facing-adjusted hit chance are all measured from the tile it would use.
 */
export function actionOptions(ctx: AiContext, view: GameState, at: TileCoord): ActionOption[] {
  const out: ActionOption[] = [];
  const actor = unitById(view, ctx.actor.id);
  if (actor === undefined) return out;

  for (const ability of ctx.kit.abilities) {
    if (actor.charge < ability.chargeCost) continue;
    const hpCost = ability.hpCost ?? 0;
    if (hpCost > 0 && actor.hp <= hpCost) continue;
    if (unmetRequirement(view, actor, ability, null) !== null) continue;
    for (const target of targetCandidates(ctx, view, ability)) {
      if (!aimable(view, actor, ability, target, at)) continue;
      const area = shapedArea(ctx, view, actor, ability, target);
      if (area.tiles.length === 0) continue;
      const score = abilityValue(ctx, view, ability, target, area);
      if (score > ctx.weights.actThreshold) {
        out.push({ score, abilityId: ability.id, itemId: null, objectId: null, target });
      }
    }
  }

  // The satchel. An item costs no flux and no cast, so the only thing holding
  // the search back from spending one on chip damage is `itemUsePoint`: what is
  // drunk here is gone for the rest of the chapter.
  for (const entry of usableItems(view, actor.id)) {
    if (entry.unavailableReason !== undefined) continue;
    const item = consumableItem(view, entry.itemId);
    if (item === undefined) continue;
    const ability = itemAbility(view, actor, item);
    for (const target of targetCandidates(ctx, view, ability)) {
      if (!aimable(view, actor, ability, target, at)) continue;
      const area = shapedArea(ctx, view, actor, ability, target);
      if (area.tiles.length === 0) continue;
      const score = abilityValue(ctx, view, ability, target, area) - ctx.weights.itemUsePoint;
      if (score > ctx.weights.actThreshold) {
        out.push({ score, abilityId: null, itemId: entry.itemId, objectId: null, target });
      }
    }
  }

  for (const obj of view.map.objects) {
    if (obj.destroyed || obj.def.operable === null) continue;
    if (obj.def.operable.requiresPower && !isEnergized(view, obj.def.id)) continue;
    if (!obj.def.tiles.some((tile) => manhattan(tile, at) <= 1)) continue;
    const score = activateValue(ctx, view, obj);
    if (score > ctx.weights.actThreshold) {
      out.push({ score, abilityId: null, itemId: null, objectId: obj.def.id, target: null });
    }
  }
  return out;
}
