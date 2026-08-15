import { getAbility, knownActionAbilityIds } from "../state/content.js";
import { cloneState, emit, type Ctx } from "../state/ctx.js";
import type { ActionAbility, BattleUnit, GameState } from "../state/types.js";
import {
  activateObject as fireObject,
  awardStanding,
  executeAbility,
  faceUnit,
  startCharge,
  STANDING_PER_ACTION,
} from "../rules/abilities.js";
import { spendCharge } from "../rules/effects.js";
import { coordEq, facingToward, manhattan, objectById, unitById } from "../rules/grid.js";
import { findPath } from "../rules/movement.js";
import { evaluateOutcome } from "../rules/outcome.js";
import { canAct, canMove } from "../rules/status.js";
import { aimedTile, hasLos, inRange, isValidTargetKind } from "../rules/targeting.js";
import { evaluateTriggers } from "../rules/triggers.js";
import { advanceClock, endActiveTurn } from "../rules/turn.js";
import { commandError, type Command, type CommandError, type CommandResult } from "./types.js";

interface Actor {
  unit: BattleUnit;
  error: null;
}

function resolveActor(state: GameState, cmd: Command): Actor | { unit: null; error: CommandError } {
  if (state.result !== null) {
    return { unit: null, error: commandError("battle-over", "the battle is already decided") };
  }
  const turn = state.activeTurn;
  if (turn === null) {
    return { unit: null, error: commandError("no-active-turn", "no unit is taking a turn") };
  }
  const unit = unitById(state, cmd.unitId);
  if (unit === undefined) {
    return { unit: null, error: commandError("unknown-unit", `no unit ${cmd.unitId}`) };
  }
  if (unit.id !== turn.unitId) {
    return { unit: null, error: commandError("not-active-unit", `${unit.id} is not the active unit`) };
  }
  if (unit.downed) {
    return { unit: null, error: commandError("unit-downed", `${unit.id} is down`) };
  }
  return { unit, error: null };
}

function validateAct(
  state: GameState,
  unit: BattleUnit,
  cmd: Extract<Command, { kind: "act" }>,
): { ability: ActionAbility; error: null } | { ability: null; error: CommandError } {
  const turn = state.activeTurn;
  if (turn !== null && turn.acted) {
    return { ability: null, error: commandError("already-acted", `${unit.id} has already acted`) };
  }
  if (!canAct(state, unit)) {
    return { ability: null, error: commandError("action-prevented", `${unit.id} cannot act`) };
  }
  const ability = getAbility(state, unit, cmd.abilityId);
  if (ability === undefined || ability.slot !== "action") {
    return { ability: null, error: commandError("unknown-ability", `no action ability ${cmd.abilityId}`) };
  }
  if (!knownActionAbilityIds(state, unit).includes(cmd.abilityId)) {
    return {
      ability: null,
      error: commandError("ability-not-available", `${unit.id} has not learned ${cmd.abilityId}`),
    };
  }
  if (unit.charge < ability.chargeCost) {
    return { ability: null, error: commandError("insufficient-charge", `${cmd.abilityId} needs more flux`) };
  }
  const hpCost = ability.hpCost ?? 0;
  if (hpCost > 0 && unit.hp <= hpCost) {
    return { ability: null, error: commandError("insufficient-hp", `${cmd.abilityId} would down ${unit.id}`) };
  }
  const aimed = aimedTile(state, cmd.target);
  if (aimed === undefined) {
    return { ability: null, error: commandError("invalid-target", "target does not exist") };
  }
  if (!isValidTargetKind(state, unit, ability, cmd.target)) {
    return { ability: null, error: commandError("invalid-target", `${cmd.abilityId} cannot target that`) };
  }
  if (cmd.target.kind === "object" && objectById(state, cmd.target.objectId)?.destroyed === true) {
    return { ability: null, error: commandError("object-destroyed", "target object is destroyed") };
  }
  if (!inRange(state, unit.position, aimed, ability.targeting.range)) {
    return { ability: null, error: commandError("out-of-range", `${cmd.abilityId} cannot reach that tile`) };
  }
  if (ability.targeting.requiresLos && !hasLos(state, unit.position, aimed)) {
    return { ability: null, error: commandError("no-line-of-sight", "nothing in sight there") };
  }
  return { ability, error: null };
}

function validate(state: GameState, cmd: Command, unit: BattleUnit): CommandError | null {
  const turn = state.activeTurn;
  switch (cmd.kind) {
    case "move": {
      if (turn !== null && turn.moved) return commandError("already-moved", `${unit.id} has already moved`);
      if (!canMove(state, unit)) return commandError("move-prevented", `${unit.id} cannot move`);
      if (findPath(state, unit, cmd.to) === null) {
        return commandError("unreachable", `(${cmd.to.x},${cmd.to.y}) is out of Move range`);
      }
      return null;
    }
    case "act":
      return validateAct(state, unit, cmd).error;
    case "activateObject": {
      if (turn !== null && turn.acted) return commandError("already-acted", `${unit.id} has already acted`);
      if (!canAct(state, unit)) return commandError("action-prevented", `${unit.id} cannot act`);
      const obj = objectById(state, cmd.objectId);
      if (obj === undefined) return commandError("unknown-object", `no object ${cmd.objectId}`);
      if (obj.destroyed) return commandError("object-destroyed", `${cmd.objectId} is destroyed`);
      if (obj.def.operable === null) return commandError("not-operable", `${cmd.objectId} has no controls`);
      const adjacent = obj.def.tiles.some((t) => manhattan(t, unit.position) <= 1);
      if (!adjacent) return commandError("not-adjacent", `${unit.id} is not beside ${cmd.objectId}`);
      if (obj.def.operable.requiresPower && obj.powered !== true) {
        return commandError("object-unpowered", `${cmd.objectId} has no power`);
      }
      return null;
    }
    case "wait":
    case "endTurn":
      return null;
  }
}

function settle(ctx: Ctx): void {
  evaluateTriggers(ctx);
  evaluateOutcome(ctx);
}

function finish(ctx: Ctx, turnEnded: boolean): void {
  settle(ctx);
  let ended = turnEnded;
  const active = ctx.state.activeTurn;
  if (!ended && active !== null) {
    const unit = unitById(ctx.state, active.unitId);
    if (unit === undefined || unit.downed) {
      endActiveTurn(ctx);
      ended = true;
    }
  }
  if (ended && ctx.state.result === null) {
    advanceClock(ctx);
    settle(ctx);
  }
}

/**
 * The only mutation path into a battle. Pure: `state` is never touched, and a
 * rejected command returns it unchanged alongside a typed error.
 *
 * When the command ends the unit's turn, the returned events also cover the
 * clocktick advance up to the next turn, including any charged abilities that
 * fired along the way.
 */
export function applyCommand(state: GameState, cmd: Command): CommandResult {
  const actor = resolveActor(state, cmd);
  if (actor.unit === null) return { state, events: [], error: actor.error };
  const error = validate(state, cmd, actor.unit);
  if (error !== null) return { state, events: [], error };

  const ctx: Ctx = { state: cloneState(state), events: [] };
  const unit = unitById(ctx.state, cmd.unitId);
  const turn = ctx.state.activeTurn;
  if (unit === undefined || turn === null) return { state, events: [], error: actor.error };

  let turnEnded = false;
  switch (cmd.kind) {
    case "move": {
      const path = findPath(ctx.state, unit, cmd.to);
      if (path === null) break;
      const from = { ...unit.position };
      unit.position = { ...cmd.to };
      turn.moved = true;
      emit(ctx, { type: "UnitMoved", unitId: unit.id, from, to: { ...cmd.to }, path });
      const previous = path[path.length - 2];
      if (previous !== undefined && !coordEq(previous, cmd.to)) {
        faceUnit(ctx, unit, facingToward(previous, cmd.to));
      }
      break;
    }
    case "act": {
      const resolved = validateAct(ctx.state, unit, cmd);
      if (resolved.ability === null) break;
      const ability = resolved.ability;
      turn.acted = true;
      if (ability.castSpeed !== null) {
        startCharge(ctx, unit, ability, cmd.target, ability.castSpeed);
        endActiveTurn(ctx);
        turnEnded = true;
      } else {
        spendCharge(ctx, unit, ability.chargeCost, ability.hpCost ?? 0);
        executeAbility(ctx, unit, ability, cmd.target, true);
        awardStanding(ctx, unit, STANDING_PER_ACTION);
      }
      break;
    }
    case "activateObject": {
      const obj = objectById(ctx.state, cmd.objectId);
      if (obj === undefined) break;
      turn.acted = true;
      fireObject(ctx, unit, obj);
      awardStanding(ctx, unit, STANDING_PER_ACTION);
      break;
    }
    case "wait": {
      faceUnit(ctx, unit, cmd.facing);
      endActiveTurn(ctx);
      turnEnded = true;
      break;
    }
    case "endTurn": {
      endActiveTurn(ctx);
      turnEnded = true;
      break;
    }
  }

  finish(ctx, turnEnded);
  return { state: ctx.state, events: ctx.events, error: null };
}
