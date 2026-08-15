import type { Effect, TileCoord } from "../../data/index.js";
import { resolveArea } from "../rules/abilities.js";
import { inertAmountTarget, resolveAmount, unitAmountTarget } from "../rules/damage.js";
import { objectMaxHp } from "../rules/effects.js";
import { manhattan, objectById, unitAt, unitById } from "../rules/grid.js";
import { getStatus } from "../state/content.js";
import { maxCharge, maxHp } from "../rules/status.js";
import { aimedTile, hasLos, inRange, isValidTargetKind, unmetRequirement } from "../rules/targeting.js";
import { forecast, turnOrderPreview, type ForecastEntry } from "../selectors.js";
import type { ActionAbility, BattleUnit, GameState, ObjectRuntime, TargetRef } from "../state/types.js";
import { damageBite, effectiveHp, type AiContext } from "./context.js";

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
          harm += Math.floor((statusValue(ctx, state, effect.statusId) * effect.chance) / 100);
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

/** What blowing an object up is worth right now, payload and footprint alike. */
export function destroyValue(ctx: AiContext, state: GameState, obj: ObjectRuntime): number {
  let value = 0;
  const payload = obj.def.onDestroyed;
  if (payload !== undefined) value += payloadValue(ctx, state, payload.effects, payload.targetTiles);
  if (obj.def.blocksMovement || obj.def.blocksLos) value += ctx.weights.objectStructurePoint;
  return Math.floor((value * ctx.profile.objectPercent) / 100);
}

/**
 * Worth of flipping an object's power. The modelled consequence is the deck:
 * a lift or catwalk that loses power drops the tile back to terrain height,
 * which is how a unit parked out of reach on a raised deck gets pulled back
 * into everyone's range — and how an ally gets stranded if the AI is careless.
 */
function powerSwingValue(ctx: AiContext, state: GameState, obj: ObjectRuntime, mode: "on" | "off" | "toggle"): number {
  if (obj.destroyed || obj.powered === null) return 0;
  const next = mode === "toggle" ? !obj.powered : mode === "on";
  if (next === obj.powered) return 0;
  if (obj.def.surfaceHeight === undefined) return 0;

  let value = 0;
  for (const tile of obj.def.tiles) {
    const occupant = unitAt(state, tile);
    if (occupant === undefined) continue;
    const gain = next ? 1 : -1;
    const side = occupant.team === ctx.actor.team ? 1 : -1;
    value += gain * side * ctx.weights.deckPoint;
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
      harm += Math.floor((statusValue(ctx, state, status.statusId) * status.chance) / 100);
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

/**
 * What putting a deployable on the board is worth: the obstacle itself, plus
 * its payload measured against the hostile it is most likely to meet. A mine
 * pays out once; a turret keeps firing, hence the two percentages.
 */
function spawnValue(
  ctx: AiContext,
  state: GameState,
  effect: Extract<Effect, { kind: "spawnObject" }>,
): number {
  const w = ctx.weights;
  let value = w.spawnObjectPoint;
  const victim = ctx.quarry ?? ctx.hostiles[0];
  if (victim === undefined) return value;

  if (effect.onContact !== undefined) {
    const bite = damageBite(state, effect.onContact.effects, victim);
    value += Math.floor((bite * w.damagePerHp * w.contactPayloadPercent) / 100);
  }
  if (effect.attack !== undefined) {
    const shot = resolveAmount(state, effect.attack.amount, ctx.actor, unitAmountTarget(state, victim));
    value += Math.floor((shot * w.damagePerHp * w.autoAttackPercent) / 100);
  }
  return value;
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
  areaObjectIds: readonly string[] = [],
): number {
  let gross = 0;
  for (const entry of forecast(view, ctx.actor.id, ability.id, target)) {
    gross += entryValue(ctx, view, ability, entry);
  }
  for (const effect of ability.effects) {
    if (effect.kind !== "spawnObject") continue;
    gross += Math.floor((spawnValue(ctx, view, effect) * ctx.profile.objectPercent) / 100);
  }
  for (const effect of ability.effects) {
    if (effect.kind !== "setPower") continue;
    for (const objectId of areaObjectIds) {
      const obj = objectById(view, objectId);
      if (obj !== undefined) gross += powerSwingValue(ctx, view, obj, effect.mode);
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
    value -= ability.chargeCost * w.chargePoint;
    // Proportional, not a cliff: a flat penalty below the threshold deleted
    // every cheap utility ability at low level (BALANCE_REPORT F3/C1).
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
  objectId: string | null;
  target: TargetRef | null;
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
      const aimed = aimedTile(view, target);
      if (aimed === undefined) continue;
      if (!inRange(view, at, aimed, ability.targeting.range)) continue;
      if (!isValidTargetKind(view, actor, ability, target)) continue;
      if (target.kind === "object" && objectById(view, target.objectId)?.destroyed === true) continue;
      if (ability.targeting.requiresLos && !hasLos(view, at, aimed)) continue;
      if (unmetRequirement(view, actor, ability, target) !== null) continue;
      const area = resolveArea(view, actor, ability, target);
      if (area.tiles.length === 0) continue;
      const score = abilityValue(ctx, view, ability, target, area.objectIds);
      if (score > ctx.weights.actThreshold) {
        out.push({ score, abilityId: ability.id, objectId: null, target });
      }
    }
  }

  for (const obj of view.map.objects) {
    if (obj.destroyed || obj.def.operable === null) continue;
    if (obj.def.operable.requiresPower && obj.powered !== true) continue;
    if (!obj.def.tiles.some((tile) => manhattan(tile, at) <= 1)) continue;
    const score = activateValue(ctx, view, obj);
    if (score > ctx.weights.actThreshold) {
      out.push({ score, abilityId: null, objectId: obj.def.id, target: null });
    }
  }
  return out;
}
