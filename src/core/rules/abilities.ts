import type { Facing, TileCoord } from "../../data/index.js";
import { chanceRoll } from "../rng/mulberry32.js";
import { getAbility } from "../state/content.js";
import { emit, nextOrdinal, type Ctx } from "../state/ctx.js";
import type { ActionAbility, BattleUnit, ChargedAction, GameState, ObjectRuntime, TargetRef } from "../state/types.js";
import { hitChance, reactionChance } from "./damage.js";
import {
  applyEffects,
  collectTargets,
  emptyOutcome,
  mergeOutcome,
  spendCharge,
  type EffectOutcome,
} from "./effects.js";
import { areEnemies, coordEq, facingToward, unitById } from "./grid.js";
import { canReact, maxHp } from "./status.js";
import { aimedTile, areaTiles } from "./targeting.js";

/** Flat Standing awarded to a unit for each action it resolves. */
export const STANDING_PER_ACTION = 10;

/** HP fraction below which the `hpCritical` reaction trigger arms, in percent. */
export const CRITICAL_HP_PERCENT = 25;

export function faceUnit(ctx: Ctx, unit: BattleUnit, facing: Facing): void {
  if (unit.facing === facing) return;
  unit.facing = facing;
  emit(ctx, { type: "UnitFacingChanged", unitId: unit.id, facing });
}

export function awardStanding(ctx: Ctx, unit: BattleUnit, amount: number): void {
  if (amount <= 0) return;
  unit.standingEarned += amount;
  emit(ctx, { type: "StandingAwarded", unitId: unit.id, amount, total: unit.standingEarned });
}

export interface ResolvedArea {
  tiles: TileCoord[];
  unitIds: string[];
  objectIds: string[];
}

/** Tiles an ability covers plus the units and objects standing in them. */
export function resolveArea(
  state: GameState,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
): ResolvedArea {
  const aimed = aimedTile(state, target);
  if (aimed === undefined) return { tiles: [], unitIds: [], objectIds: [] };
  const tiles = areaTiles(state, ability.targeting, actor.position, aimed);
  const explicitObjects = target.kind === "object" ? [target.objectId] : [];
  const collected = collectTargets(state, tiles, explicitObjects);
  return { tiles, unitIds: collected.unitIds, objectIds: collected.objectIds };
}

/**
 * Run an ability's effects. Accuracy is rolled once per hostile unit in the
 * area (allies and the caster are never missed); objects are always affected.
 */
export function executeAbility(
  ctx: Ctx,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
  allowReactions: boolean,
): EffectOutcome {
  const area = resolveArea(ctx.state, actor, ability, target);
  const aimed = aimedTile(ctx.state, target);
  if (aimed !== undefined && !coordEq(aimed, actor.position)) {
    faceUnit(ctx, actor, facingToward(actor.position, aimed));
  }
  emit(ctx, {
    type: "AbilityUsed",
    unitId: actor.id,
    abilityId: ability.id,
    target,
    tiles: area.tiles,
  });

  const hitUnitIds: string[] = [];
  for (const unitId of area.unitIds) {
    const unit = unitById(ctx.state, unitId);
    if (unit === undefined) continue;
    if (!areEnemies(unit, actor)) {
      hitUnitIds.push(unitId);
      continue;
    }
    const chance = hitChance(ctx.state, actor.position, unit);
    if (chanceRoll(ctx.state.rng, chance)) hitUnitIds.push(unitId);
    else emit(ctx, { type: "AbilityMissed", unitId: actor.id, abilityId: ability.id, targetUnitId: unitId });
  }

  const outcome = applyEffects(ctx, ability.effects, actor.id, {
    unitIds: hitUnitIds,
    objectIds: area.objectIds,
    tiles: area.tiles,
  });

  if (allowReactions) triggerReactions(ctx, actor, area.unitIds, outcome);
  return outcome;
}

/**
 * Reaction abilities fire at a rate equal to the reacting unit's Resolve.
 * Reactions never trigger further reactions.
 */
export function triggerReactions(
  ctx: Ctx,
  actor: BattleUnit,
  targetedUnitIds: readonly string[],
  outcome: EffectOutcome,
): void {
  const damaged = new Set(outcome.damagedUnitIds);
  const downed = new Set(outcome.downedUnitIds);
  const candidates = [...new Set([...targetedUnitIds, ...outcome.damagedUnitIds])].sort();

  for (const unitId of candidates) {
    const unit = unitById(ctx.state, unitId);
    if (unit === undefined || unit.downed || unit.id === actor.id) continue;
    fireReaction(ctx, unit, actor, damaged.has(unitId));
  }

  for (const downedId of [...downed].sort()) {
    const fallen = unitById(ctx.state, downedId);
    if (fallen === undefined) continue;
    for (const ally of ctx.state.units.filter((u) => !u.downed && u.team === fallen.team && u.id !== fallen.id)) {
      fireAllyDownedReaction(ctx, ally, actor);
    }
  }
}

function reactionOf(ctx: Ctx, unit: BattleUnit) {
  const id = unit.unit.reactionAbilityId;
  if (id === undefined) return undefined;
  const ability = getAbility(ctx.state, unit, id);
  if (ability === undefined || ability.slot !== "reaction") return undefined;
  return ability;
}

function fireReaction(ctx: Ctx, unit: BattleUnit, against: BattleUnit, wasDamaged: boolean): void {
  const ability = reactionOf(ctx, unit);
  if (ability === undefined || !canReact(ctx.state, unit)) return;
  const critical = unit.hp * 100 < maxHp(ctx.state, unit) * CRITICAL_HP_PERCENT;
  const armed =
    (ability.trigger === "damaged" && wasDamaged) ||
    ability.trigger === "targetedByAction" ||
    (ability.trigger === "hpCritical" && critical);
  if (!armed) return;
  if (!chanceRoll(ctx.state.rng, reactionChance(unit))) return;

  emit(ctx, { type: "ReactionTriggered", unitId: unit.id, abilityId: ability.id, againstUnitId: against.id });
  const selfTargeted = ability.trigger === "hpCritical";
  const targetUnit = selfTargeted ? unit : against;
  applyEffects(ctx, ability.effects, unit.id, {
    unitIds: [targetUnit.id],
    objectIds: [],
    tiles: [{ ...targetUnit.position }],
  });
}

function fireAllyDownedReaction(ctx: Ctx, unit: BattleUnit, against: BattleUnit): void {
  const ability = reactionOf(ctx, unit);
  if (ability === undefined || ability.trigger !== "allyDowned") return;
  if (!canReact(ctx.state, unit)) return;
  if (!chanceRoll(ctx.state.rng, reactionChance(unit))) return;
  emit(ctx, { type: "ReactionTriggered", unitId: unit.id, abilityId: ability.id, againstUnitId: against.id });
  applyEffects(ctx, ability.effects, unit.id, {
    unitIds: [unit.id],
    objectIds: [],
    tiles: [{ ...unit.position }],
  });
}

/**
 * Begin a charged ability. Flux is spent up front and unit targets are snapped
 * to their tile, so a charge lands where it was aimed, not where the target
 * ended up (FFT convention).
 */
export function startCharge(
  ctx: Ctx,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
  castSpeed: number,
): void {
  spendCharge(ctx, actor, ability.chargeCost, ability.hpCost ?? 0);
  const aimed = aimedTile(ctx.state, target);
  if (aimed !== undefined && !coordEq(aimed, actor.position)) {
    faceUnit(ctx, actor, facingToward(actor.position, aimed));
  }
  const snapped: TargetRef =
    target.kind === "unit" && aimed !== undefined ? { kind: "tile", tile: { ...aimed } } : target;
  const charge: ChargedAction = {
    id: `charge-${nextOrdinal(ctx.state)}`,
    actorId: actor.id,
    abilityId: ability.id,
    target: snapped,
    castSpeed,
    ct: 0,
  };
  ctx.state.charges.push(charge);
  emit(ctx, {
    type: "AbilityCharging",
    unitId: actor.id,
    abilityId: ability.id,
    target: snapped,
    chargeId: charge.id,
    castSpeed,
  });
}

/** Fire a charge whose own CT reached 100. */
export function resolveCharge(ctx: Ctx, charge: ChargedAction): EffectOutcome {
  const outcome = emptyOutcome();
  const actor = unitById(ctx.state, charge.actorId);
  if (actor === undefined || actor.downed) return outcome;
  const ability = getAbility(ctx.state, actor, charge.abilityId);
  if (ability === undefined || ability.slot !== "action") return outcome;
  mergeOutcome(outcome, executeAbility(ctx, actor, ability, charge.target, true));
  awardStanding(ctx, actor, STANDING_PER_ACTION);
  return outcome;
}

/** Fire an operable object's payload onto the objects and tiles it names. */
export function activateObject(ctx: Ctx, actor: BattleUnit, obj: ObjectRuntime): EffectOutcome {
  const operable = obj.def.operable;
  if (operable === null) return emptyOutcome();
  const anchor = obj.def.tiles[0];
  if (anchor !== undefined && !coordEq(anchor, actor.position)) {
    faceUnit(ctx, actor, facingToward(actor.position, anchor));
  }
  emit(ctx, { type: "ObjectActivated", unitId: actor.id, objectId: obj.def.id });
  const targets = collectTargets(ctx.state, operable.targetTiles, operable.targetObjectIds);
  return applyEffects(ctx, operable.effects, actor.id, targets);
}
