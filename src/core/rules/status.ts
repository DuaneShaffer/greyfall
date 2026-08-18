import type { DamageType, StatMods } from "../../data/index.js";
import { applyStatMods, clampStats, type DerivedStats } from "../progression/stats.js";
import { statusById } from "../state/content.js";
import type { BattleUnit, GameState } from "../state/types.js";

export interface StatusHooks {
  preventsAction: boolean;
  preventsMove: boolean;
  preventsReaction: boolean;
  statMods: StatMods[];
  ctMultiplierPercents: number[];
  tickDamage: { damageType: DamageType; amount: number }[];
}

/** Statuses in status-id order — the stable order every hook aggregation uses. */
export function sortedStatusIds(unit: BattleUnit): string[] {
  return unit.statuses.map((s) => s.statusId).sort();
}

/** Union of every hook the unit's statuses contribute, in status-id order. */
export function statusHooks(state: GameState, unit: BattleUnit): StatusHooks {
  const hooks: StatusHooks = {
    preventsAction: false,
    preventsMove: false,
    preventsReaction: false,
    statMods: [],
    ctMultiplierPercents: [],
    tickDamage: [],
  };
  for (const id of sortedStatusIds(unit)) {
    const status = statusById(state, id);
    if (status === undefined) continue;
    const h = status.hooks;
    if (h.preventsAction === true) hooks.preventsAction = true;
    if (h.preventsMove === true) hooks.preventsMove = true;
    if (h.preventsReaction === true) hooks.preventsReaction = true;
    if (h.statMods !== undefined) hooks.statMods.push(h.statMods);
    if (h.ctMultiplierPercent !== undefined) hooks.ctMultiplierPercents.push(h.ctMultiplierPercent);
    if (h.tickDamage !== undefined) hooks.tickDamage.push(h.tickDamage);
  }
  return hooks;
}

/** Base stats plus status stat mods plus timed `modifyStats` mods. */
export function effectiveStats(state: GameState, unit: BattleUnit): DerivedStats {
  const stats: DerivedStats = { ...unit.stats };
  for (const mods of statusHooks(state, unit).statMods) applyStatMods(stats, mods);
  for (const temp of [...unit.tempMods].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    applyStatMods(stats, temp.mods);
  }
  return clampStats(stats);
}

export function maxHp(state: GameState, unit: BattleUnit): number {
  return effectiveStats(state, unit).hp;
}

export function maxCharge(state: GameState, unit: BattleUnit): number {
  return effectiveStats(state, unit).charge;
}

/**
 * CT gained per tick. Each `ctMultiplierPercent` status is folded in one at a
 * time with a floor between them (Haste/Slow stacking), never below 1.
 */
export function ctPerTick(state: GameState, unit: BattleUnit): number {
  let speed = effectiveStats(state, unit).speed;
  for (const percent of statusHooks(state, unit).ctMultiplierPercents) {
    speed = Math.floor((speed * percent) / 100);
  }
  return Math.max(1, speed);
}

export function canAct(state: GameState, unit: BattleUnit): boolean {
  return !unit.downed && !statusHooks(state, unit).preventsAction;
}

export function canMove(state: GameState, unit: BattleUnit): boolean {
  return !unit.downed && !statusHooks(state, unit).preventsMove;
}

export function canReact(state: GameState, unit: BattleUnit): boolean {
  return !unit.downed && !statusHooks(state, unit).preventsReaction;
}
