import type { Ability, Item, Job, StatKey, StatMods, Unit } from "../../data/index.js";

/** A unit's battle stats after job curve, equipment, and passive ability mods. */
export interface DerivedStats {
  hp: number;
  charge: number;
  speed: number;
  phys: number;
  mag: number;
  move: number;
  jump: number;
  evade: number;
}

export const STAT_KEYS = ["hp", "charge", "speed", "phys", "mag", "move", "jump", "evade"] as const;

/** Stats a job's `statCurve` grows with level. Move/jump/evade are per-job flats. */
export const GROWN_STAT_KEYS = ["hp", "charge", "speed", "phys", "mag"] as const;
export type GrownStatKey = (typeof GROWN_STAT_KEYS)[number];

/**
 * Level-independent floor each grown stat starts from, before the job curve.
 * Without it a level-1 unit would have stats equal to a single growth step.
 */
export const STAT_BASE: Readonly<Record<GrownStatKey, number>> = {
  hp: 40,
  charge: 8,
  speed: 2,
  phys: 0,
  mag: 0,
};

export const STAT_MINIMUMS: Readonly<Record<StatKey, number>> = {
  hp: 1,
  charge: 0,
  speed: 1,
  phys: 0,
  mag: 0,
  move: 1,
  jump: 1,
  evade: 0,
};

export const MAX_EVADE = 95;

/** Equipment is applied in this fixed order so stat mods never depend on key order. */
export const EQUIPMENT_SLOT_ORDER = ["weapon", "shield", "head", "body", "accessory"] as const;

/** Items a unit has equipped, in `EQUIPMENT_SLOT_ORDER`; unknown ids are skipped. */
export function equippedItems(unit: Unit, items: Readonly<Record<string, Item>>): Item[] {
  const out: Item[] = [];
  for (const slot of EQUIPMENT_SLOT_ORDER) {
    const id = unit.equipment[slot];
    if (id === undefined) continue;
    const item = items[id];
    if (item !== undefined) out.push(item);
  }
  return out;
}

/** Stat mods an item contributes (consumables contribute none). */
export function itemStatMods(item: Item): StatMods | undefined {
  return item.slot === "consumable" ? undefined : item.statMods;
}

/** Stat mods a passive (support/movement) ability contributes. */
export function passiveStatMods(ability: Ability): StatMods | undefined {
  if (ability.slot !== "support" && ability.slot !== "movement") return undefined;
  return ability.passive.statMods;
}

export function applyStatMods(stats: DerivedStats, mods: StatMods | undefined): void {
  if (mods === undefined) return;
  for (const key of STAT_KEYS) {
    const delta = mods[key];
    if (delta !== undefined) stats[key] += delta;
  }
}

export function clampStats(stats: DerivedStats): DerivedStats {
  for (const key of STAT_KEYS) {
    stats[key] = Math.max(STAT_MINIMUMS[key], stats[key]);
  }
  stats.evade = Math.min(MAX_EVADE, stats.evade);
  return stats;
}

/**
 * Battle stats for a roster unit.
 *
 * Grown stats: `floor((STAT_BASE + growth * level) * multiplierPercent / 100)`.
 * Move/jump/evade come from the job's flat bases. Equipment mods are applied in
 * `EQUIPMENT_SLOT_ORDER`, then passive ability mods in the order given, then
 * every stat is clamped to `STAT_MINIMUMS` (evade additionally to `MAX_EVADE`).
 *
 * All arithmetic is integer; the function is pure and has no battle dependency,
 * so progression screens can call it directly.
 */
export function deriveStats(
  unit: Unit,
  job: Job,
  equipment: readonly Item[] = [],
  passives: readonly Ability[] = [],
): DerivedStats {
  const stats: DerivedStats = {
    hp: 0,
    charge: 0,
    speed: 0,
    phys: 0,
    mag: 0,
    move: job.baseMove,
    jump: job.baseJump,
    evade: job.baseEvade,
  };

  for (const key of GROWN_STAT_KEYS) {
    const curve: { growth: number; multiplierPercent: number } | undefined = job.statCurve[key];
    const growth = curve === undefined ? 0 : curve.growth;
    const multiplier = curve === undefined ? 100 : curve.multiplierPercent;
    stats[key] = Math.floor(((STAT_BASE[key] + growth * unit.level) * multiplier) / 100);
  }

  for (const item of equipment) applyStatMods(stats, itemStatMods(item));
  for (const ability of passives) applyStatMods(stats, passiveStatMods(ability));

  return clampStats(stats);
}
