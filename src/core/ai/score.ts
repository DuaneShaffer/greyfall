import type { Effect, Grid, TileCoord } from "../../data/index.js";
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
import { gridNodeOf, gridNodeRuntimeOf, isEnergized, resolveLoadAmount, solveGrid } from "../rules/power.js";
import { getStatus } from "../state/content.js";
import { maxCharge, maxHp } from "../rules/status.js";
import { aimRefusal, aimedTile, unmetRequirement } from "../rules/targeting.js";
import { forecast, turnOrderPreview, usableItems, type ForecastEntry } from "../selectors.js";
import type { ActionAbility, BattleUnit, GameState, ObjectRuntime, TargetRef } from "../state/types.js";
import { damageBite, effectiveHp, fieldDistance, type AiContext, type GridBase, type GridSwing } from "./context.js";
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
 * it. Re-applying refreshes the clock rather than stacking (`COMBAT_RULES` §8),
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
function taperPercent(horizon: number, distance: number): number {
  if (distance >= UNREACHABLE) return 0;
  return Math.floor((100 * (horizon - Math.min(distance, horizon) + 1)) / (horizon + 1));
}

const horizonPercent = (w: AiWeights, distance: number): number => taperPercent(w.objectHorizon, distance);

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

/**
 * The mirror of `machineDenial`: what a machine is worth in *our* hands. Same
 * payload, both tapers swapped — how near a hostile stands to what the machine
 * covers, and how far our own people have to walk to reach a tile it can be
 * worked from.
 *
 * This is the whole of `gridRestore` (`FLUX_GRID` §4.5): without it a reclose, a
 * splice and a tie-close all price at zero, the AI can cut and can never put
 * anything back, and §3's tug-of-war never happens on the enemy side. It is
 * asked only about nodes of a declared grid, which is what keeps it exactly
 * zero on the five slice maps.
 */
function machineUtility(ctx: AiContext, state: GameState, obj: ObjectRuntime): number {
  return memo(ctx, `utility:${obj.def.id}`, () => {
    const operable = obj.def.operable;
    const victim = ctx.quarry;
    if (operable === null || obj.destroyed || victim === null) return 0;
    const w = ctx.weights;

    let harm = damageBite(state, operable.effects, victim) * w.damagePerHp;
    for (const effect of operable.effects) {
      if (effect.kind !== "applyStatus") continue;
      harm += Math.floor((statusValue(ctx, state, effect.statusId) * effect.chance) / 100);
    }
    if (harm <= 0) return 0;

    let ourReach = UNREACHABLE;
    for (const friend of [ctx.actor, ...ctx.allies]) {
      for (const tile of obj.def.tiles) {
        for (const stand of [tile, ...neighbors(tile)]) {
          ourReach = Math.min(ourReach, manhattan(friend.position, stand));
        }
      }
    }
    let enemyExposed = UNREACHABLE;
    for (const hostile of ctx.hostiles) {
      for (const tile of operable.targetTiles) {
        enemyExposed = Math.min(enemyExposed, fieldDistance(ctx, hostile.id, tile));
      }
    }
    const exposed = operable.targetTiles.length === 0 ? 100 : taperPercent(w.gridHorizon, enemyExposed);
    const reach = taperPercent(w.gridHorizon, ourReach);
    return Math.floor((harm * w.gridRestorePercent * reach * exposed) / 1000000);
  });
}

/**
 * Denial and utility answer for a machine whose controls are dead without
 * power. A machine that works either way is denied nothing by a switch, which
 * is the gate `powerSwingValue` has always applied.
 */
function poweredMachine(
  ctx: AiContext,
  state: GameState,
  obj: ObjectRuntime,
): { denial: number; utility: number } {
  if (obj.def.operable?.requiresPower !== true) return { denial: 0, utility: 0 };
  return { denial: machineDenial(ctx, state, obj), utility: machineUtility(ctx, state, obj) };
}

// --- the grid -------------------------------------------------------------

/** One node-state override, in exactly the terms `solveGrid` reads them. */
interface GridEdit {
  objectId: string;
  powered?: boolean;
  severed?: boolean;
  destroyed?: boolean;
  load?: number;
}

/**
 * A hypothetical world for the recompute to run on. `solveGrid` reads the grid
 * runtime and each node object's `powered` and `destroyed` flags and nothing
 * else, so those are all that is cloned — and it is the *real* solver that runs
 * on it, never a second heuristic model of the graph, which is the only way the
 * search and the rules can be guaranteed to agree about what a move does
 * (`FLUX_GRID` §4.5).
 */
function hypothetical(view: GameState, grid: Grid, edits: readonly GridEdit[]): GameState {
  const runtime = view.grids.find((g) => g.gridId === grid.id);
  if (runtime === undefined) return view;
  const nodes = runtime.nodes.map((node) => ({ ...node }));
  const loads = runtime.loads.map((load) => ({ ...load }));
  const roles = new Map(grid.nodes.map((node) => [node.objectId, node.role] as const));
  const swapped = new Map<string, ObjectRuntime>();

  for (const edit of edits) {
    const obj = swapped.get(edit.objectId) ?? objectById(view, edit.objectId);
    if (obj !== undefined) {
      let next = obj;
      if (edit.powered !== undefined) next = { ...next, powered: edit.powered };
      if (edit.destroyed === true) next = { ...next, destroyed: true, hp: 0 };
      if (next !== obj) swapped.set(edit.objectId, next);
    }
    const node = nodes.find((n) => n.objectId === edit.objectId);
    if (node !== undefined) {
      if (edit.severed !== undefined) node.severed = edit.severed;
      // Closing a tripped source's isolator is the reclose, the one verb that
      // clears a latch (`rules/effects.ts`, `setObjectPower`).
      if (edit.powered === true && roles.get(edit.objectId) === "source") node.tripped = false;
    }
    if (edit.load !== undefined && edit.load > 0) {
      loads.push({
        id: `hypothetical-${edit.objectId}`,
        nodeObjectId: edit.objectId,
        casterUnitId: null,
        amount: edit.load,
        turnsRemaining: null,
      });
    }
  }

  loads.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const objects =
    swapped.size === 0 ? view.map.objects : view.map.objects.map((o) => swapped.get(o.def.id) ?? o);
  const grids = view.grids.map((g) => (g.gridId === grid.id ? { gridId: g.gridId, nodes, loads } : g));
  return { ...view, map: { ...view.map, objects }, grids };
}

/**
 * What a move does to energization, answered by the real recompute on both
 * sides of it. Memoised per (verb, target node) rather than per candidate tile:
 * every input is a per-decision invariant, since `viewAt` replaces only the
 * unit list (`FLUX_GRID` §5.2).
 */
function gridSwing(
  ctx: AiContext,
  view: GameState,
  grid: Grid,
  verb: string,
  edits: readonly GridEdit[],
): GridSwing {
  const key = `${grid.id}|${verb}`;
  const cached = ctx.gridMemo.get(key);
  if (cached !== undefined) return cached;

  let before: GridBase | undefined = ctx.gridBase.get(grid.id);
  if (before === undefined) {
    const solved = solveGrid(view, grid);
    before = { live: solved.live, tripped: solved.tripped };
    ctx.gridBase.set(grid.id, before);
  }
  const after = solveGrid(hypothetical(view, grid, edits), grid);
  const wasLive = new Set(before.live);
  const nowLive = new Set(after.live);
  const wasTripped = new Set(before.tripped);
  const nowTripped = new Set(after.tripped);
  const swing: GridSwing = {
    dark: before.live.filter((id) => !nowLive.has(id)),
    lit: after.live.filter((id) => !wasLive.has(id)),
    trips: after.tripped.filter((id) => !wasTripped.has(id)).length,
    resets: before.tripped.filter((id) => !nowTripped.has(id)).length,
  };
  ctx.gridMemo.set(key, swing);
  return swing;
}

/** A deck that gains or loses its power, priced against whoever is standing on it. */
function deckSwingValue(ctx: AiContext, view: GameState, obj: ObjectRuntime, gain: 1 | -1): number {
  if (obj.def.surfaceHeight === undefined) return 0;
  let value = 0;
  for (const tile of obj.def.tiles) {
    const occupant = unitAt(view, tile);
    if (occupant === undefined) continue;
    const side = occupant.team === ctx.actor.team ? 1 : -1;
    value += gain * side * ctx.weights.deckPoint;
  }
  return value;
}

/**
 * What a change in energization is worth, over however many objects it moves:
 * every deck that rises or drops, and every machine that arms or goes quiet.
 *
 * On a map with no declared grid the set is the one object the order names and
 * this is exactly the arithmetic G5 shipped. On a grid it is the same sum over
 * the whole component, plus the latch's tempo, plus `gridSelfHarmPercent` on
 * whatever half of it lands on us — and the whole of it scaled by the kit's
 * grid affinity.
 */
function energizationValue(ctx: AiContext, view: GameState, swing: GridSwing, onGrid: boolean): number {
  const w = ctx.weights;
  let credit = 0;
  let debit = 0;
  const bank = (value: number): void => {
    if (value >= 0) credit += value;
    else debit -= value;
  };

  for (const objectId of swing.dark) {
    const obj = objectById(view, objectId);
    if (obj === undefined) continue;
    const machine = poweredMachine(ctx, view, obj);
    bank(deckSwingValue(ctx, view, obj, -1));
    bank(machine.denial);
    if (onGrid) bank(-machine.utility);
  }
  for (const objectId of swing.lit) {
    const obj = objectById(view, objectId);
    if (obj === undefined) continue;
    const machine = poweredMachine(ctx, view, obj);
    bank(deckSwingValue(ctx, view, obj, 1));
    bank(-machine.denial);
    if (onGrid) bank(machine.utility);
  }
  if (!onGrid) return credit - debit;

  credit += swing.trips * w.gridTripPoint + swing.resets * w.gridResetPoint;
  const total = credit - Math.floor((debit * w.gridSelfHarmPercent) / 100);
  return Math.floor((total * ctx.profile.gridPercent) / 100);
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
  value += gridDestroyValue(ctx, state, obj);
  return Math.floor((value * ctx.profile.objectPercent) / 100);
}

/**
 * Worth of flipping an object's power. Two consequences are modelled: the deck
 * — a lift or catwalk that loses power drops the tile back to terrain height,
 * pulling a unit parked out of reach back into everyone's range and stranding
 * an ally if the AI is careless — and the machine itself, which only works
 * while it is live.
 *
 * Under a grid the switch is a topology edit rather than a flag flip, so the set
 * of objects it moves comes out of the recompute: opening the mains drops every
 * sink downstream of it in one action, and closing a tie can bring a whole dead
 * branch back. Off a grid the set is the one object, and the arithmetic is
 * identical to what it has always been.
 */
function powerSwingValue(ctx: AiContext, state: GameState, obj: ObjectRuntime, mode: "on" | "off" | "toggle"): number {
  if (obj.destroyed || obj.powered === null) return 0;
  const next = mode === "toggle" ? !obj.powered : mode === "on";
  const found = gridNodeOf(state, obj.def.id);
  // Closing an already-closed isolator on a latched source is the reclose, and
  // it is the one power order that does something while changing no flag.
  const reclose =
    next && found?.node.role === "source" && gridNodeRuntimeOf(state, obj.def.id)?.tripped === true;
  if (next === obj.powered && reclose !== true) return 0;

  const id = obj.def.id;
  const swing: GridSwing =
    found === null
      ? { dark: next ? [] : [id], lit: next ? [id] : [], trips: 0, resets: 0 }
      : gridSwing(ctx, state, found.grid, `power:${next ? "on" : "off"}:${id}`, [
          { objectId: id, powered: next },
        ]);
  return Math.floor((energizationValue(ctx, state, swing, found !== null) * ctx.profile.objectPercent) / 100);
}

/**
 * Worth of cutting a span or splicing one back, priced entirely through what
 * actually goes dark. A cut the tie or the second main already covers moves
 * nothing and scores zero, which is the whole reason `lineCut` is not a flat
 * value (`FLUX_GRID` §4.5).
 */
function severSwingValue(ctx: AiContext, view: GameState, objectId: string, mode: "sever" | "splice"): number {
  const found = gridNodeOf(view, objectId);
  if (found === null || found.node.role !== "line") return 0;
  const obj = objectById(view, objectId);
  if (obj === undefined || obj.destroyed) return 0;
  const severed = mode === "sever";
  if (gridNodeRuntimeOf(view, objectId)?.severed === severed) return 0;
  const swing = gridSwing(ctx, view, found.grid, `${mode}:${objectId}`, [{ objectId, severed }]);
  return Math.floor((energizationValue(ctx, view, swing, true) * ctx.profile.objectPercent) / 100);
}

/**
 * Worth of hanging a timed draw on a node. Whether it trips is not estimated
 * from headroom: the same recompute runs on the same node-state vector with the
 * load attached, so the search's answer and the rules' answer are one answer.
 */
function loadSwingValue(ctx: AiContext, view: GameState, objectId: string, amount: number): number {
  const found = gridNodeOf(view, objectId);
  if (found === null) return 0;
  const obj = objectById(view, objectId);
  if (obj === undefined || obj.destroyed) return 0;
  const swing = gridSwing(ctx, view, found.grid, `load:${amount}:${objectId}`, [{ objectId, load: amount }]);
  return Math.floor((energizationValue(ctx, view, swing, true) * ctx.profile.objectPercent) / 100);
}

/**
 * What killing a node takes off the network with it. The object's own machine
 * value is already collected by `destroyValue`, so only the rest of the
 * component is counted here — which is what makes destroying a redundant source
 * score near nothing and destroying the only feed score everything behind it.
 */
function gridDestroyValue(ctx: AiContext, view: GameState, obj: ObjectRuntime): number {
  const found = gridNodeOf(view, obj.def.id);
  if (found === null) return 0;
  const swing = gridSwing(ctx, view, found.grid, `destroy:${obj.def.id}`, [
    { objectId: obj.def.id, destroyed: true },
  ]);
  const rest: GridSwing = {
    ...swing,
    dark: swing.dark.filter((id) => id !== obj.def.id),
    lit: swing.lit.filter((id) => id !== obj.def.id),
  };
  return energizationValue(ctx, view, rest, true);
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
      case "severLine": {
        shaped ??= shapedArea(ctx, view, actor, ability, target);
        for (const objectId of shaped.objectIds) {
          gross += severSwingValue(ctx, view, objectId, effect.mode);
        }
        break;
      }
      case "addLoad": {
        shaped ??= shapedArea(ctx, view, actor, ability, target);
        for (const objectId of shaped.objectIds) {
          gross += loadSwingValue(ctx, view, objectId, resolveLoadAmount(view, actor.id, effect.amount));
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
      if (effect.kind === "severLine") value += severSwingValue(ctx, view, objectId, effect.mode);
      if (effect.kind === "addLoad") {
        value += loadSwingValue(ctx, view, objectId, resolveLoadAmount(view, ctx.actor.id, effect.amount));
      }
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

/**
 * Whether an aimed action is legal from `at`; the gate both action loops share.
 * It asks the command layer's own question, so an option the search offers is an
 * order `applyCommand` accepts.
 */
function aimable(
  view: GameState,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
  at: TileCoord,
): boolean {
  return aimRefusal(view, actor, ability, target, at) === null;
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
