import type { Amount, TileCoord } from "../../data/index.js";
import { weaponPower } from "../state/content.js";
import type { BattleUnit, GameState } from "../state/types.js";
import { attackAngle } from "./grid.js";
import { effectiveStats, maxHp } from "./status.js";

/** Divisor on `phys x weaponPower x power` at level 1; `D(1)`. */
export const WEAPON_DAMAGE_DIVISOR = 400;
/** Growth in the damage divisor per caster level above 1, holding TTK flat. */
export const DAMAGE_DIVISOR_PER_LEVEL = 250;
/** Numerator on `stat x power`; `200 / D(1)` is the historical `1/2`. */
export const STAT_AMOUNT_NUMERATOR = 200;

/**
 * `D(level)` — the divisor stat-derived amounts are scaled by. HP grows
 * sub-linearly while phys and mag grow linearly, so a constant divisor makes
 * time-to-kill collapse as levels rise (`docs/BALANCE_REPORT.md` F1). Scaling
 * the divisor with the *caster's* level holds swings-to-down roughly flat, and
 * `D(1) === WEAPON_DAMAGE_DIVISOR` keeps every level-1 number identical.
 */
export function damageDivisor(level: number): number {
  return WEAPON_DAMAGE_DIVISOR + DAMAGE_DIVISOR_PER_LEVEL * Math.max(0, level - 1);
}

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
 * - `weapon`   floor(phys * weaponPower * power / D(L))       — power is a percentage
 * - `phys`     floor(phys * power * 200 / D(L))               — power is a multiplier
 * - `mag`      floor(mag * power * 200 / D(L))                — power is a multiplier
 * - `fixed`    power
 * - `maxHpPercent` floor(target maxHp * power / 100)
 *
 * `L` is the acting unit's level; a caster-less amount (an `onDestroyed`
 * payload, a spawned object's attack) uses `D(1)` and its stat-derived bases
 * resolve to 0, exactly as before.
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
  const divisor = damageDivisor(actor === null ? 1 : actor.unit.level);
  let value: number;
  switch (amount.base) {
    case "weapon": {
      const phys = stats === null ? 0 : stats.phys;
      const power = actor === null ? 0 : weaponPower(state, actor);
      value = Math.floor((phys * power * amount.power) / divisor);
      break;
    }
    case "phys":
      value = Math.floor(((stats === null ? 0 : stats.phys) * amount.power * STAT_AMOUNT_NUMERATOR) / divisor);
      break;
    case "mag":
      value = Math.floor(((stats === null ? 0 : stats.mag) * amount.power * STAT_AMOUNT_NUMERATOR) / divisor);
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
