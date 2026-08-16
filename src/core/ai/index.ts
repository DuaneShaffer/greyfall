/**
 * Enemy decision-making: `chooseCommand` picks one legal `Command` for whoever
 * is taking a turn. Pure and deterministic — the same state always yields the
 * same command, no randomness is drawn, and nothing is remembered between
 * calls. `docs/AI_DESIGN.md` describes the evaluation model.
 */

import type { TileCoord } from "../../data/index.js";
import type { Command } from "../commands/types.js";
import { coordEq, unitById } from "../rules/grid.js";
import { reachableTiles } from "../rules/movement.js";
import { canAct, canMove } from "../rules/status.js";
import type { BattleUnit, GameState } from "../state/types.js";
import { buildContext, fieldDistance, type AiContext } from "./context.js";
import { UNREACHABLE } from "./field.js";
import { bestFacing, positionValue } from "./positioning.js";
import { actionOptions, type ActionOption } from "./score.js";
import { WEIGHTS, type AiWeights } from "./weights.js";

export { WEIGHTS, PROFILES, OBJECT_AFFINITY_BONUS, type AiWeights, type Archetype } from "./weights.js";
export { buildContext, type AiContext, type Kit, type Threat } from "./context.js";

/** The actor standing somewhere else, with everything else shared by reference. */
function viewAt(state: GameState, actor: BattleUnit, tile: TileCoord): GameState {
  if (coordEq(actor.position, tile)) return state;
  const moved: BattleUnit = { ...actor, position: { ...tile } };
  return { ...state, units: state.units.map((unit) => (unit.id === actor.id ? moved : unit)) };
}

interface Plan {
  score: number;
  tile: TileCoord;
  moves: boolean;
  action: ActionOption | null;
}

function better(candidate: Plan, incumbent: Plan | null): boolean {
  return incumbent === null || candidate.score > incumbent.score;
}

/** Tiles the unit may end its turn on, current tile included, in tile order. */
function standTiles(ctx: AiContext, mayMove: boolean): TileCoord[] {
  if (!mayMove) return [{ ...ctx.actor.position }];
  const tiles = reachableTiles(ctx.state, ctx.actor)
    .filter((reachable) => reachable.canStop)
    .map((reachable) => reachable.tile);
  if (!tiles.some((tile) => coordEq(tile, ctx.actor.position))) tiles.push({ ...ctx.actor.position });
  return tiles;
}

function search(ctx: AiContext, mayMove: boolean, mayAct: boolean): Plan | null {
  let best: Plan | null = null;
  for (const tile of standTiles(ctx, mayMove)) {
    const moves = !coordEq(tile, ctx.actor.position);
    const view = viewAt(ctx.state, ctx.actor, tile);
    const place = positionValue(ctx, view, tile) - (moves ? ctx.weights.moveCost : 0);

    if (mayAct) {
      for (const option of actionOptions(ctx, view, tile)) {
        const plan: Plan = { score: place + option.score, tile, moves, action: option };
        if (better(plan, best)) best = plan;
      }
    }
    const idle: Plan = { score: place, tile, moves, action: null };
    if (better(idle, best)) best = idle;
  }
  return best;
}

/**
 * Stalemate valve. Once `urgency` has ramped, a unit that would otherwise hold
 * still takes the reachable tile that is genuinely closer to its quarry, so a
 * standoff between two cautious kits always collapses into contact.
 */
function forcedAdvance(ctx: AiContext): TileCoord | null {
  if (ctx.urgency < ctx.weights.forceAdvanceUrgency) return null;
  const quarry = ctx.quarry;
  if (quarry === null) return null;
  let best: TileCoord | null = null;
  let bestDistance = fieldDistance(ctx, quarry.id, ctx.actor.position);
  if (bestDistance >= UNREACHABLE) return null;
  for (const tile of standTiles(ctx, true)) {
    const distance = fieldDistance(ctx, quarry.id, tile);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

function commandFor(ctx: AiContext, plan: Plan | null, mayMove: boolean): Command {
  const actor = ctx.actor;
  if (plan !== null && plan.action !== null) {
    if (plan.moves) return { kind: "move", unitId: actor.id, to: { ...plan.tile } };
    if (plan.action.abilityId !== null && plan.action.target !== null) {
      return {
        kind: "act",
        unitId: actor.id,
        abilityId: plan.action.abilityId,
        target: plan.action.target,
      };
    }
    if (plan.action.itemId !== null && plan.action.target !== null) {
      return {
        kind: "useItem",
        unitId: actor.id,
        itemId: plan.action.itemId,
        target: plan.action.target,
      };
    }
    if (plan.action.objectId !== null) {
      return { kind: "activateObject", unitId: actor.id, objectId: plan.action.objectId };
    }
  }
  if (plan !== null && plan.moves) return { kind: "move", unitId: actor.id, to: { ...plan.tile } };

  if (mayMove) {
    const advance = forcedAdvance(ctx);
    if (advance !== null) return { kind: "move", unitId: actor.id, to: { ...advance } };
  }
  const tile = plan === null ? actor.position : plan.tile;
  return { kind: "wait", unitId: actor.id, facing: bestFacing(ctx, tile) };
}

/**
 * One command for the unit currently taking a turn. Callers apply it and call
 * again: a turn resolves as at most move, act, and `wait`, so the loop always
 * terminates. Throws only when no unit is taking a turn.
 */
export function chooseCommand(state: GameState, weights: AiWeights = WEIGHTS): Command {
  const turn = state.activeTurn;
  if (turn === null) throw new Error("chooseCommand: no unit is taking a turn");
  const actor = unitById(state, turn.unitId);
  if (actor === undefined) throw new Error(`chooseCommand: no unit ${turn.unitId}`);

  const ctx = buildContext(state, actor, weights);
  const mayMove = !turn.moved && canMove(state, actor);
  const mayAct = !turn.acted && canAct(state, actor);
  if (!mayMove && !mayAct) {
    return { kind: "wait", unitId: actor.id, facing: bestFacing(ctx, actor.position) };
  }
  return commandFor(ctx, search(ctx, mayMove, mayAct), mayMove);
}

/**
 * `chooseCommand` for AI-controlled units only: null when the battle is over,
 * nobody is acting, or the active unit belongs to the player.
 */
export function enemyCommand(state: GameState, weights: AiWeights = WEIGHTS): Command | null {
  if (state.result !== null || state.activeTurn === null) return null;
  const actor = unitById(state, state.activeTurn.unitId);
  if (actor === undefined || actor.team === "player") return null;
  return chooseCommand(state, weights);
}
