import type { Amount, TileCoord } from "../../data/index.js";
import { weaponPower } from "../state/content.js";
import type { BattleUnit, GameState } from "../state/types.js";
import { attackAngle } from "./grid.js";
import { effectiveStats, maxHp } from "./status.js";

/** Divisor on `phys x weaponPower x power`, tuning weapon hits to ~3 per kill. */
export const WEAPON_DAMAGE_DIVISOR = 400;
/** Divisor on `stat x power` for raw phys- and mag-based amounts. */
export const STAT_AMOUNT_DIVISOR = 2;

/** Attunement of a non-unit target (objects, tiles): unscaled. */
export const INERT_ATTUNEMENT = 100;

export const MIN_HIT_CHANCE = 5;
export const MAX_HIT_CHANCE = 100;

/** Evade retained by the target depending on where the attack comes from. */
export function evadeAgainst(evade: number, attackerPos: TileCoord, target: BattleUnit): number {
  const angle = attackAngle(attackerPos, target);
  if (angle === "back") return 0;
  if (angle === "side") return Math.floor(evade / 2);
  return evade;
}

/**
 * Chance an action lands on a unit, as a percentage.
 * `100 - facing-adjusted evade`, clamped to `[MIN_HIT_CHANCE, MAX_HIT_CHANCE]`.
 */
export function hitChance(
  state: GameState,
  attackerPos: TileCoord,
  target: BattleUnit,
): number {
  const evade = evadeAgainst(effectiveStats(state, target).evade, attackerPos, target);
  return Math.min(MAX_HIT_CHANCE, Math.max(MIN_HIT_CHANCE, 100 - evade));
}

/** Reaction abilities fire at a rate equal to the reacting unit's Resolve. */
export function reactionChance(unit: BattleUnit): number {
  return Math.min(100, Math.max(0, unit.unit.disposition.resolve));
}

export interface AmountTarget {
  /** 0-100; `INERT_ATTUNEMENT` for objects and tiles. */
  attunement: number;
  maxHp: number;
}

export function unitAmountTarget(state: GameState, unit: BattleUnit): AmountTarget {
  return { attunement: unit.unit.disposition.attunement, maxHp: maxHp(state, unit) };
}

export function inertAmountTarget(maxHpValue: number): AmountTarget {
  return { attunement: INERT_ATTUNEMENT, maxHp: maxHpValue };
}

/** `mag` amounts are Attunement-scaled unless the content opts out. */
export function isAttunementScaled(amount: Amount): boolean {
  return amount.attunementScaled ?? amount.base === "mag";
}

/**
 * Magnitude of a damage/heal/integrity `Amount`, in integer math throughout.
 *
 * - `weapon`   floor(phys * weaponPower * power / 400)  — power is a percentage
 * - `phys`     floor(phys * power / 2)                  — power is a multiplier
 * - `mag`      floor(mag * power / 2)                   — power is a multiplier
 * - `fixed`    power
 * - `maxHpPercent` floor(target maxHp * power / 100)
 *
 * Attunement scaling (default on for `mag`) then applies the acting unit's
 * Attunement and the target's in turn, flooring after each: Attunement is both
 * how hard you hit with flux and how hard flux hits you.
 */
export function resolveAmount(
  state: GameState,
  amount: Amount,
  actor: BattleUnit | null,
  target: AmountTarget,
): number {
  const stats = actor === null ? null : effectiveStats(state, actor);
  let value: number;
  switch (amount.base) {
    case "weapon": {
      const phys = stats === null ? 0 : stats.phys;
      const power = actor === null ? 0 : weaponPower(state, actor);
      value = Math.floor((phys * power * amount.power) / WEAPON_DAMAGE_DIVISOR);
      break;
    }
    case "phys":
      value = Math.floor(((stats === null ? 0 : stats.phys) * amount.power) / STAT_AMOUNT_DIVISOR);
      break;
    case "mag":
      value = Math.floor(((stats === null ? 0 : stats.mag) * amount.power) / STAT_AMOUNT_DIVISOR);
      break;
    case "fixed":
      value = amount.power;
      break;
    case "maxHpPercent":
      value = Math.floor((target.maxHp * amount.power) / 100);
      break;
  }

  if (isAttunementScaled(amount)) {
    if (actor !== null) value = Math.floor((value * actor.unit.disposition.attunement) / 100);
    value = Math.floor((value * target.attunement) / 100);
  }
  return Math.max(0, value);
}
