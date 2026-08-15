import { emit, type Ctx } from "../state/ctx.js";
import type { BattleResult, GameState } from "../state/types.js";
import { coordEq, unitById } from "./grid.js";
import { maxHp } from "./status.js";

export function endBattle(ctx: Ctx, result: BattleResult): void {
  if (ctx.state.result !== null) return;
  ctx.state.result = result;
  ctx.state.activeTurn = null;
  emit(ctx, { type: "BattleEnded", result });
}

function teamRouted(state: GameState, team: "player" | "enemy"): boolean {
  const members = state.units.filter((u) => u.team === team);
  return members.length > 0 && members.every((u) => u.downed);
}

/**
 * Apply the encounter's win/loss conditions to the current state. Loss is
 * checked first, so a turn that both routs the enemy and downs a
 * must-survive unit is a loss.
 */
export function evaluateOutcome(ctx: Ctx): void {
  const state = ctx.state;
  if (state.result !== null) return;
  const encounter = state.content.encounter;

  for (const condition of encounter.lossConditions) {
    switch (condition.kind) {
      case "partyRout":
        if (teamRouted(state, "player")) return endBattle(ctx, "loss");
        break;
      case "unitDowned":
        if (unitById(state, condition.unitId)?.downed === true) return endBattle(ctx, "loss");
        break;
      case "turnLimit":
        if (state.turn > condition.turns) return endBattle(ctx, "loss");
        break;
    }
  }

  for (const condition of encounter.winConditions) {
    switch (condition.kind) {
      case "rout":
        if (teamRouted(state, "enemy")) return endBattle(ctx, "win");
        break;
      case "defeatUnit":
        if (unitById(state, condition.unitId)?.downed === true) return endBattle(ctx, "win");
        break;
      case "surviveTurns":
        if (state.turn >= condition.turns) return endBattle(ctx, "win");
        break;
      case "reachTiles": {
        const candidates =
          condition.unitId === undefined
            ? state.units.filter((u) => u.team === "player" && !u.downed)
            : state.units.filter((u) => u.id === condition.unitId && !u.downed);
        if (candidates.some((u) => condition.tiles.some((t) => coordEq(t, u.position)))) {
          return endBattle(ctx, "win");
        }
        break;
      }
    }
  }
}

/** Fraction of a unit's max HP remaining, as an integer percentage. */
export function hpPercent(state: GameState, unitId: string): number | null {
  const unit = unitById(state, unitId);
  if (unit === undefined) return null;
  const cap = maxHp(state, unit);
  return cap === 0 ? 0 : Math.floor((unit.hp * 100) / cap);
}
