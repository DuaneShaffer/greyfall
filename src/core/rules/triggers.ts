import type { Encounter, TileCoord } from "../../data/index.js";
import { emit, type Ctx } from "../state/ctx.js";
import type { GameState } from "../state/types.js";
import { createBattleUnit, sortUnits } from "../state/unit.js";
import { checkContact, destroyObject, emptyOutcome, setObjectPower } from "./effects.js";
import { coordEq, isStandable, objectById, unitAt, unitById } from "./grid.js";
import { hpPercent, endBattle } from "./outcome.js";
import { isEnergized } from "./power.js";
import { endActiveTurn } from "./turn.js";

type Trigger = Encounter["triggers"][number];
type TriggerCondition = Trigger["when"];

/** Passes over the trigger list per event batch, so a trigger may fire another. */
export const MAX_TRIGGER_PASSES = 8;

/**
 * Conditions read current state rather than the event batch, so a trigger fires
 * whenever its condition holds — `once: false` triggers refire at most once per
 * command.
 */
export function isConditionMet(state: GameState, when: TriggerCondition): boolean {
  switch (when.kind) {
    case "battleStart":
      return state.turn === 0;
    case "turnStart":
      // Reaches-or-passes, not equals: `state.turn` counts individual unit
      // turns and a turn consumed entirely inside `advanceClock` (a stunned
      // unit auto-ending) is never seen at its own index, so `===` silently
      // skips. COMBAT_RULES §15.
      return state.turn >= when.turn;
    case "unitDowned":
      return unitById(state, when.unitId)?.downed === true;
    case "objectDestroyed":
      return objectById(state, when.objectId)?.destroyed === true;
    case "objectPowered":
      // Energization, not the isolator flag — FLUX_GRID §1.3. A tripped source
      // still reads `powered: true` and is feeding nothing, and that is exactly
      // the state an author means by "the house went dark".
      return isEnergized(state, when.objectId) === when.powered;
    case "unitEntersTiles":
      return state.units.some(
        (u) =>
          !u.downed &&
          (when.team === undefined || u.team === when.team) &&
          when.tiles.some((t) => coordEq(t, u.position)),
      );
    case "unitHpBelowPercent": {
      // A downed unit reads 0% and so is below every authorable threshold, which
      // is how an overkill blow still fires the beats it skipped past — in
      // author order, ahead of the `unitDowned` trigger. ENCOUNTER_NOTES §e5.
      const percent = hpPercent(state, when.unitId);
      return percent !== null && percent < when.percent;
    }
  }
}

/**
 * Scripted repositioning. Move, Jump and path length are ignored — this is
 * authoring, not a walk — but the destination must be standable and free, so a
 * script can never park two units on one tile. A downed unit does not move: when
 * the killing blow opens a withdrawal beat, the dialogue lands and the walk
 * does not.
 */
function moveUnit(ctx: Ctx, unitId: string, to: TileCoord): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined || unit.downed) return;
  if (coordEq(unit.position, to)) return;
  if (!isStandable(ctx.state, to) || unitAt(ctx.state, to) !== undefined) return;
  const from = { ...unit.position };
  unit.position = { ...to };
  emit(ctx, { type: "UnitForcedMove", unitId, from, to: { ...to } });
  checkContact(ctx, unitId, emptyOutcome());
}

/**
 * Take a unit off the field without downing it. Its charges are cancelled and
 * its turn, if it is taking one, is closed first so the clock keeps running.
 * A removed unit is no longer counted by `rout` or `partyRout` — see
 * COMBAT_RULES §16.
 */
function removeUnit(ctx: Ctx, unitId: string): void {
  const unit = unitById(ctx.state, unitId);
  if (unit === undefined) return;
  if (ctx.state.activeTurn?.unitId === unitId) endActiveTurn(ctx);
  for (const charge of ctx.state.charges.filter((c) => c.actorId === unitId)) {
    emit(ctx, {
      type: "AbilityChargeCancelled",
      unitId: charge.actorId,
      abilityId: charge.abilityId,
      chargeId: charge.id,
    });
  }
  ctx.state.charges = ctx.state.charges.filter((c) => c.actorId !== unitId);
  ctx.state.units = ctx.state.units.filter((u) => u.id !== unitId);
  emit(ctx, { type: "UnitRemoved", unitId });
}

function runActions(ctx: Ctx, trigger: Trigger): void {
  for (const action of trigger.actions) {
    switch (action.kind) {
      case "dialogue":
        emit(ctx, { type: "DialogueRequested", triggerId: trigger.id, lines: action.lines });
        break;
      case "spawnUnits":
        for (const placed of action.units) {
          if (unitById(ctx.state, placed.unit.id) !== undefined) continue;
          const unit = createBattleUnit(
            ctx.state.content,
            placed.unit,
            placed.team,
            placed.position,
            placed.facing,
          );
          ctx.state.units.push(unit);
          sortUnits(ctx.state.units);
          emit(ctx, {
            type: "UnitSpawned",
            unitId: unit.id,
            team: unit.team,
            position: { ...unit.position },
          });
        }
        break;
      case "setPower":
        setObjectPower(ctx, action.objectId, action.powered ? "on" : "off");
        break;
      case "destroyObject":
        destroyObject(ctx, action.objectId, emptyOutcome());
        break;
      case "moveUnit":
        moveUnit(ctx, action.unitId, action.to);
        break;
      case "removeUnit":
        removeUnit(ctx, action.unitId);
        break;
      case "endBattle":
        endBattle(ctx, action.result);
        break;
    }
  }
}

/**
 * A trigger's `afterTriggerId` gate. `firedTriggerIds` records every trigger
 * that has ever fired, `once` or not, so the gate reads "has happened at least
 * once" whichever kind of trigger it names.
 */
function hasFired(state: GameState, triggerId: string | undefined): boolean {
  return triggerId === undefined || state.firedTriggerIds.includes(triggerId);
}

/**
 * Evaluate every encounter trigger against the current state. Trigger actions
 * go through the same effect functions commands do — there is no side channel
 * into `GameState`.
 *
 * Ordering: triggers are tried in author order and the pass repeats, so a
 * trigger gated behind one listed after it still fires in the same batch, one
 * pass later — always after the trigger it waits on.
 */
export function evaluateTriggers(ctx: Ctx): void {
  const firedThisBatch = new Set<string>();
  for (let pass = 0; pass < MAX_TRIGGER_PASSES; pass += 1) {
    let fired = false;
    for (const trigger of ctx.state.content.encounter.triggers) {
      if (firedThisBatch.has(trigger.id)) continue;
      if (trigger.once && ctx.state.firedTriggerIds.includes(trigger.id)) continue;
      if (!hasFired(ctx.state, trigger.afterTriggerId)) continue;
      if (!isConditionMet(ctx.state, trigger.when)) continue;
      firedThisBatch.add(trigger.id);
      if (!ctx.state.firedTriggerIds.includes(trigger.id)) {
        ctx.state.firedTriggerIds.push(trigger.id);
      }
      emit(ctx, { type: "TriggerFired", triggerId: trigger.id });
      runActions(ctx, trigger);
      fired = true;
    }
    if (!fired) return;
  }
}
