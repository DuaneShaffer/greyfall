import type { Encounter } from "../../data/index.js";
import { emit, type Ctx } from "../state/ctx.js";
import type { GameState } from "../state/types.js";
import { createBattleUnit, sortUnits } from "../state/unit.js";
import { destroyObject, emptyOutcome, setObjectPower } from "./effects.js";
import { coordEq, objectById, unitById } from "./grid.js";
import { hpPercent, endBattle } from "./outcome.js";

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
      return state.turn === when.turn;
    case "unitDowned":
      return unitById(state, when.unitId)?.downed === true;
    case "objectDestroyed":
      return objectById(state, when.objectId)?.destroyed === true;
    case "unitEntersTiles":
      return state.units.some(
        (u) =>
          !u.downed &&
          (when.team === undefined || u.team === when.team) &&
          when.tiles.some((t) => coordEq(t, u.position)),
      );
    case "unitHpBelowPercent": {
      const unit = unitById(state, when.unitId);
      if (unit === undefined || unit.downed) return false;
      const percent = hpPercent(state, when.unitId);
      return percent !== null && percent < when.percent;
    }
  }
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
      case "endBattle":
        endBattle(ctx, action.result);
        break;
    }
  }
}

/**
 * Evaluate every encounter trigger against the current state. Trigger actions
 * go through the same effect functions commands do — there is no side channel
 * into `GameState`.
 */
export function evaluateTriggers(ctx: Ctx): void {
  const firedThisBatch = new Set<string>();
  for (let pass = 0; pass < MAX_TRIGGER_PASSES; pass += 1) {
    let fired = false;
    for (const trigger of ctx.state.content.encounter.triggers) {
      if (firedThisBatch.has(trigger.id)) continue;
      if (trigger.once && ctx.state.firedTriggerIds.includes(trigger.id)) continue;
      if (!isConditionMet(ctx.state, trigger.when)) continue;
      firedThisBatch.add(trigger.id);
      if (trigger.once) ctx.state.firedTriggerIds.push(trigger.id);
      emit(ctx, { type: "TriggerFired", triggerId: trigger.id });
      runActions(ctx, trigger);
      fired = true;
    }
    if (!fired) return;
  }
}
