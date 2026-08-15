import type { Ability, Encounter, GameMap, Item, Job, Status, TileCoord } from "../data/index.js";
import type { DerivedStats } from "./progression/stats.js";
import { resolveArea } from "./rules/abilities.js";
import { hitChance, inertAmountTarget, resolveAmount, unitAmountTarget } from "./rules/damage.js";
import { objectMaxHp } from "./rules/effects.js";
import { areEnemies, attackAngle, manhattan, objectById, unitById, type AttackAngle } from "./rules/grid.js";
import { reachableTiles as computeReachable, type ReachableTile } from "./rules/movement.js";
import {
  CT_COST_MOVE_AND_ACT,
  MAX_TICKS_PER_ADVANCE,
  readyCharges,
  readyUnits,
} from "./rules/turn.js";
import { canAct, canMove, ctPerTick, effectiveStats, maxCharge, maxHp } from "./rules/status.js";
import { hasLos, targetableTiles as computeTargetable, unmetRequirement } from "./rules/targeting.js";
import { getAbility, getItem, getJob, getStatus, knownActionAbilityIds } from "./state/content.js";
import { cloneState } from "./state/ctx.js";
import type {
  ActiveTurn,
  BattleResult,
  BattleUnit,
  ChargedAction,
  GameState,
  ObjectRuntime,
  TargetRef,
} from "./state/types.js";

/** The unit whose turn it is, or null between turns. */
export function activeUnit(state: GameState): BattleUnit | null {
  const turn = state.activeTurn;
  if (turn === null) return null;
  return unitById(state, turn.unitId) ?? null;
}

export function getUnit(state: GameState, unitId: string): BattleUnit | null {
  return unitById(state, unitId) ?? null;
}

/** Every unit in the battle, downed included, in unit-id order. */
export function allUnits(state: GameState): readonly BattleUnit[] {
  return state.units;
}

/** Every map object, destroyed included, in object-id order. */
export function allObjects(state: GameState): readonly ObjectRuntime[] {
  return state.map.objects;
}

/** Abilities currently mid-cast, in the order they were started. */
export function allCharges(state: GameState): readonly ChargedAction[] {
  return state.charges;
}

export function battleMap(state: GameState): GameMap {
  return state.content.map;
}

export function battleEncounter(state: GameState): Encounter {
  return state.content.encounter;
}

/** Ticks elapsed since the battle began. */
export function battleClock(state: GameState): number {
  return state.clock;
}

/** Number of unit turns that have begun. */
export function turnNumber(state: GameState): number {
  return state.turn;
}

export function battleResult(state: GameState): BattleResult | null {
  return state.result;
}

/** The active turn's move/act bookkeeping, or null between turns. */
export function activeTurnState(state: GameState): ActiveTurn | null {
  return state.activeTurn;
}

/** False when a status such as Stunned is holding the unit still. */
export function unitCanMove(state: GameState, unitId: string): boolean {
  const unit = unitById(state, unitId);
  return unit === undefined ? false : canMove(state, unit);
}

/** False when a status such as Stunned is suppressing the unit's action. */
export function unitCanAct(state: GameState, unitId: string): boolean {
  const unit = unitById(state, unitId);
  return unit === undefined ? false : canAct(state, unit);
}

/**
 * Definition of an ability as this unit would use it, including the engine's
 * synthesized `basic-attack` (which is not a content file).
 */
export function abilityInfo(state: GameState, unitId: string, abilityId: string): Ability | null {
  const unit = unitById(state, unitId);
  if (unit === undefined) return null;
  return getAbility(state, unit, abilityId) ?? null;
}

export function jobInfo(state: GameState, jobId: string): Job | null {
  return getJob(state, jobId) ?? null;
}

export function statusInfo(state: GameState, statusId: string): Status | null {
  return getStatus(state, statusId) ?? null;
}

export function itemInfo(state: GameState, itemId: string): Item | null {
  return getItem(state, itemId) ?? null;
}

/** Where an attacker stands relative to the target's facing. */
export function attackAngleAgainst(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
): AttackAngle | null {
  const attacker = unitById(state, attackerUnitId);
  const target = unitById(state, targetUnitId);
  if (attacker === undefined || target === undefined) return null;
  return attackAngle(attacker.position, target);
}

/**
 * Objects the unit could `activateObject` right now: undestroyed, operable,
 * powered when the controls need it, and within one tile of the unit.
 */
export function activatableObjects(state: GameState, unitId: string): readonly ObjectRuntime[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  return state.map.objects.filter((obj) => {
    if (obj.destroyed || obj.def.operable === null) return false;
    if (obj.def.operable.requiresPower && obj.powered !== true) return false;
    return obj.def.tiles.some((tile) => manhattan(tile, unit.position) <= 1);
  });
}

export function getObject(state: GameState, objectId: string): ObjectRuntime | null {
  return objectById(state, objectId) ?? null;
}

/** Stats after statuses and timed modifiers, which is what the rules use. */
export function unitStats(state: GameState, unitId: string): DerivedStats | null {
  const unit = unitById(state, unitId);
  return unit === undefined ? null : effectiveStats(state, unit);
}

export function unitMaxHp(state: GameState, unitId: string): number | null {
  const unit = unitById(state, unitId);
  return unit === undefined ? null : maxHp(state, unit);
}

export function unitMaxCharge(state: GameState, unitId: string): number | null {
  const unit = unitById(state, unitId);
  return unit === undefined ? null : maxCharge(state, unit);
}

/**
 * Action ability ids the unit may issue right now, including `basic-attack`.
 * Abilities whose actor-scoped `requires` the battlefield does not satisfy are
 * dropped; `targetPowered` cannot be judged until something is aimed at, so it
 * is left to `targetableTiles` and `forecast`.
 */
export function availableAbilities(state: GameState, unitId: string): string[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  return knownActionAbilityIds(state, unit).filter((id) => {
    const ability = getAbility(state, unit, id);
    if (ability === undefined || ability.slot !== "action") return false;
    return unmetRequirement(state, unit, ability, null) === null;
  });
}

/** Every tile the unit can move to, with its path cost. */
export function reachableTiles(state: GameState, unitId: string): ReachableTile[] {
  const unit = unitById(state, unitId);
  return unit === undefined ? [] : computeReachable(state, unit);
}

/** Tiles the unit may aim an ability at, honouring range, height, and LoS. */
export function targetableTiles(state: GameState, unitId: string, abilityId: string): TileCoord[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  const ability = getAbility(state, unit, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  if (unmetRequirement(state, unit, ability, null) !== null) return [];
  return computeTargetable(state, unit.position, ability.targeting).filter(
    (tile) => unmetRequirement(state, unit, ability, { kind: "tile", tile }) === null,
  );
}

/** Tiles an ability would actually cover once aimed at `target`. */
export function affectedTiles(
  state: GameState,
  unitId: string,
  abilityId: string,
  target: TargetRef,
): TileCoord[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  const ability = getAbility(state, unit, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  return resolveArea(state, unit, ability, target).tiles;
}

export function lineOfSight(state: GameState, from: TileCoord, to: TileCoord): boolean {
  return hasLos(state, from, to);
}

export interface ForecastEntry {
  unitId: string | null;
  objectId: string | null;
  /** Percentage; objects are never missed. */
  hitChance: number;
  /** Damage on a hit. */
  damage: number;
  /** Healing on a hit. */
  heal: number;
  /** `floor(damage * hitChance / 100)`. */
  expectedDamage: number;
  statusChances: { statusId: string; chance: number }[];
}

/**
 * What an ability would do to everything in its area, without rolling dice.
 * This is the attack-forecast panel's data source; it consumes no RNG and
 * mutates nothing.
 */
export function forecast(
  state: GameState,
  unitId: string,
  abilityId: string,
  target: TargetRef,
): ForecastEntry[] {
  const actor = unitById(state, unitId);
  if (actor === undefined) return [];
  const ability = getAbility(state, actor, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  if (unmetRequirement(state, actor, ability, target) !== null) return [];
  const area = resolveArea(state, actor, ability, target);
  const out: ForecastEntry[] = [];

  for (const id of area.unitIds) {
    const unit = unitById(state, id);
    if (unit === undefined) continue;
    const chance = areEnemies(unit, actor) ? hitChance(state, actor.position, unit) : 100;
    const entry: ForecastEntry = {
      unitId: id,
      objectId: null,
      hitChance: chance,
      damage: 0,
      heal: 0,
      expectedDamage: 0,
      statusChances: [],
    };
    for (const effect of ability.effects) {
      if (effect.kind === "damage") {
        entry.damage += resolveAmount(state, effect.amount, actor, unitAmountTarget(state, unit));
      } else if (effect.kind === "heal") {
        entry.heal += resolveAmount(state, effect.amount, actor, unitAmountTarget(state, unit));
      } else if (effect.kind === "applyStatus") {
        entry.statusChances.push({
          statusId: effect.statusId,
          chance: Math.floor((effect.chance * chance) / 100),
        });
      }
    }
    entry.expectedDamage = Math.floor((entry.damage * chance) / 100);
    out.push(entry);
  }

  for (const id of area.objectIds) {
    const obj = objectById(state, id);
    if (obj === undefined) continue;
    let damage = 0;
    let heal = 0;
    for (const effect of ability.effects) {
      if (effect.kind === "damageObject") {
        damage += resolveAmount(state, effect.amount, actor, inertAmountTarget(objectMaxHp(obj)));
      } else if (effect.kind === "repairObject") {
        heal += resolveAmount(state, effect.amount, actor, inertAmountTarget(objectMaxHp(obj)));
      }
    }
    if (damage === 0 && heal === 0) continue;
    out.push({
      unitId: null,
      objectId: id,
      hitChance: 100,
      damage,
      heal,
      expectedDamage: damage,
      statusChances: [],
    });
  }
  return out;
}

export interface TurnOrderEntry {
  kind: "unit" | "charge";
  /** Unit id, or charge id for a charged ability about to fire. */
  id: string;
  /** Clock tick the turn or charge lands on. */
  clock: number;
}

/**
 * Who acts next, assuming every unit spends a full move-and-act turn. Runs on a
 * throwaway copy of the state and draws no randomness, so calling it is free of
 * side effects.
 */
export function turnOrderPreview(state: GameState, count = 8): TurnOrderEntry[] {
  const sim = cloneState(state);
  const out: TurnOrderEntry[] = [];

  if (sim.activeTurn !== null) {
    const unit = unitById(sim, sim.activeTurn.unitId);
    out.push({ kind: "unit", id: sim.activeTurn.unitId, clock: sim.clock });
    if (unit !== undefined) unit.ct = Math.max(0, unit.ct - CT_COST_MOVE_AND_ACT);
    sim.activeTurn = null;
  }

  for (let guard = 0; guard < MAX_TICKS_PER_ADVANCE && out.length < count; guard += 1) {
    const firing = readyCharges(sim);
    if (firing.length > 0) {
      for (const charge of firing) {
        out.push({ kind: "charge", id: charge.id, clock: sim.clock });
        sim.charges = sim.charges.filter((c) => c.id !== charge.id);
      }
      continue;
    }
    const next = readyUnits(sim)[0];
    if (next !== undefined) {
      out.push({ kind: "unit", id: next.id, clock: sim.clock });
      next.ct = Math.max(0, next.ct - CT_COST_MOVE_AND_ACT);
      continue;
    }
    sim.clock += 1;
    for (const unit of sim.units) {
      if (unit.downed) continue;
      unit.ct += ctPerTick(sim, unit);
    }
    for (const charge of sim.charges) charge.ct += charge.castSpeed;
  }
  return out.slice(0, count);
}
