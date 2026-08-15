import { emit, type Ctx } from "../state/ctx.js";
import type { ActiveTurn, BattleUnit, ChargedAction, GameState } from "../state/types.js";
import { resolveCharge } from "./abilities.js";
import { damageUnit, emptyOutcome } from "./effects.js";
import { unitById } from "./grid.js";
import { canAct, canMove, ctPerTick, statusHooks } from "./status.js";

/** CT a unit must bank before it acts, and a charge before it fires. */
export const CT_TURN_THRESHOLD = 100;

/** FFT's end-of-turn CT costs, by what the unit spent its turn on. */
export const CT_COST_MOVE_AND_ACT = 100;
export const CT_COST_SINGLE = 80;
export const CT_COST_NEITHER = 60;

/** Safety valve: a battle where nothing can ever reach 100 CT must not hang. */
export const MAX_TICKS_PER_ADVANCE = 10000;

/** Bound on turns/charges resolving inside one tick before the clock moves. */
export const MAX_DRAIN_PER_TICK = 64;

export function turnCtCost(turn: ActiveTurn): number {
  if (turn.moved && turn.acted) return CT_COST_MOVE_AND_ACT;
  if (turn.moved || turn.acted) return CT_COST_SINGLE;
  return CT_COST_NEITHER;
}

/** Units in CT order: highest CT first, unit id breaking ties. */
export function readyUnits(state: GameState): BattleUnit[] {
  return state.units
    .filter((u) => !u.downed && u.ct >= CT_TURN_THRESHOLD)
    .sort((a, b) => (b.ct === a.ct ? (a.id < b.id ? -1 : 1) : b.ct - a.ct));
}

export function readyCharges(state: GameState): ChargedAction[] {
  return state.charges
    .filter((c) => c.ct >= CT_TURN_THRESHOLD)
    .sort((a, b) => (b.ct === a.ct ? (a.id < b.id ? -1 : 1) : b.ct - a.ct));
}

export function startTurn(ctx: Ctx, unit: BattleUnit): void {
  ctx.state.turn += 1;
  ctx.state.activeTurn = { unitId: unit.id, moved: false, acted: false };
  emit(ctx, { type: "TurnStarted", unitId: unit.id, turn: ctx.state.turn, clock: ctx.state.clock });

  const outcome = emptyOutcome();
  for (const tick of statusHooks(ctx.state, unit).tickDamage) {
    damageUnit(ctx, unit.id, tick.amount, tick.damageType, null, outcome);
  }

  if (unit.downed || (!canAct(ctx.state, unit) && !canMove(ctx.state, unit))) {
    endActiveTurn(ctx);
  }
}

/**
 * Close the active turn: spend CT by what the unit did, then age its statuses
 * and timed stat mods by one of its own turns.
 */
export function endActiveTurn(ctx: Ctx): void {
  const turn = ctx.state.activeTurn;
  if (turn === null) return;
  const unit = unitById(ctx.state, turn.unitId);
  ctx.state.activeTurn = null;
  if (unit === undefined) return;

  const cost = turnCtCost(turn);
  unit.ct = Math.max(0, unit.ct - cost);
  emit(ctx, { type: "TurnEnded", unitId: unit.id, ctSpent: cost });

  const expired: string[] = [];
  for (const status of unit.statuses) {
    if (status.turnsRemaining === null) continue;
    status.turnsRemaining -= 1;
    if (status.turnsRemaining <= 0) expired.push(status.statusId);
  }
  if (expired.length > 0) {
    unit.statuses = unit.statuses.filter((s) => !expired.includes(s.statusId));
    for (const statusId of expired.sort()) emit(ctx, { type: "StatusRemoved", unitId: unit.id, statusId });
  }

  for (const mod of unit.tempMods) {
    if (mod.turnsRemaining === null) continue;
    mod.turnsRemaining -= 1;
  }
  unit.tempMods = unit.tempMods.filter((m) => m.turnsRemaining === null || m.turnsRemaining > 0);
}

/**
 * Run the clocktick loop until someone has a turn or the battle is over.
 * Each tick every standing unit banks CT equal to its Speed (after Haste/Slow
 * style `ctMultiplierPercent` statuses) and every charge banks its `castSpeed`.
 * Charges that reach 100 fire before any unit whose CT arrived on the same tick.
 */
export function advanceClock(ctx: Ctx): void {
  let announcedClock = ctx.state.clock;
  const announce = (): void => {
    if (ctx.state.clock === announcedClock) return;
    announcedClock = ctx.state.clock;
    emit(ctx, { type: "ClockAdvanced", clock: ctx.state.clock });
  };

  for (let ticks = 0; ticks <= MAX_TICKS_PER_ADVANCE; ticks += 1) {
    // Everything already at 100 CT resolves before the clock moves again.
    for (let drain = 0; drain < MAX_DRAIN_PER_TICK; drain += 1) {
      if (ctx.state.result !== null || ctx.state.activeTurn !== null) break;
      const firing = readyCharges(ctx.state);
      for (const charge of firing) {
        announce();
        ctx.state.charges = ctx.state.charges.filter((c) => c.id !== charge.id);
        resolveCharge(ctx, charge);
      }
      if (ctx.state.result !== null) break;
      const next = readyUnits(ctx.state)[0];
      if (next === undefined) {
        if (firing.length === 0) break;
        continue;
      }
      announce();
      startTurn(ctx, next);
    }
    if (ctx.state.result !== null || ctx.state.activeTurn !== null) break;
    if (ticks === MAX_TICKS_PER_ADVANCE) break;

    ctx.state.clock += 1;
    for (const unit of ctx.state.units) {
      if (unit.downed) continue;
      unit.ct += ctPerTick(ctx.state, unit);
    }
    for (const charge of ctx.state.charges) charge.ct += charge.castSpeed;
  }
  announce();
}
