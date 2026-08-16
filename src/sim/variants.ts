/**
 * Core-formula candidates, simulated without touching `src/core`.
 *
 * Every candidate changes a constant in `deriveStats` or `damage.ts`. Because a
 * sweep run fixes the level, each one has an exact equivalent expressed as a
 * synthetic job clone, which the harness injects through `withContent`:
 *
 * - `STAT_BASE.hp = H`: `raw = H + growth*L` equals `40 + growth'*L` for
 *   `growth' = growth + (H - 40)/L`, exact whenever `L` divides `H - 40`.
 * - `STAT_BASE.phys = P`: same identity from a base of 0.
 * - A different per-level divisor slope: every damage and heal amount with base
 *   `weapon`, `phys`, or `mag` is linear in the caster's phys/mag, so dividing
 *   by `D'(L)` instead of the engine's own `D(L)` is the same as scaling those
 *   two stats by `D(L)/D'(L)` — carried on the job's `multiplierPercent`.
 *   `fixed` and `maxHpPercent` amounts are untouched, as a real change would be.
 *
 * **Every variant here is a delta against the shipped engine, not against a
 * hypothetical unscaled one.** `damageDivisor` already scales with level
 * (`D(L) = 400 + 250(L-1)`, applied by the engine pass), so `divisorVariant`
 * emulates only the *difference* between a candidate slope and the live one;
 * `divisorVariant(DAMAGE_DIVISOR_PER_LEVEL)` is the shipped game and returns an
 * unchanged library at every level. `hpBaseVariant` and `statBaseVariant` are
 * kept as the rejected alternatives to that fix — `STAT_BASE.hp` is still 40
 * and `STAT_BASE.phys` still 0, so they remain honest deltas too.
 *
 * The identities are asserted against the engine in `tests/sim/variants.test.ts`.
 */

import { DAMAGE_DIVISOR_PER_LEVEL, WEAPON_DAMAGE_DIVISOR, damageDivisor, type ContentLibrary } from "../core/index.js";
import type { Job } from "../data/index.js";
import { withContent } from "./content.js";

/** `D(1)`, shared by the engine and every candidate slope. */
export const BASE_DIVISOR = WEAPON_DAMAGE_DIVISOR;

/** The engine's own slope; `divisorVariant` at this value is the identity. */
export const LIVE_PER_LEVEL = DAMAGE_DIVISOR_PER_LEVEL;

/** `D(level)` for a candidate per-level slope. */
export function scaledDivisor(level: number, perLevel: number): number {
  return BASE_DIVISOR + perLevel * (level - 1);
}

export interface Variant {
  id: string;
  label: string;
  /** Job table for this variant at this level; empty means "unchanged". */
  jobs(library: ContentLibrary, level: number): Job[];
  /** True when the variant is exactly expressible at this level. */
  exactAt(level: number): boolean;
}

function curve(job: Job, key: "hp" | "charge" | "speed" | "phys" | "mag") {
  return job.statCurve[key] ?? { growth: 0, multiplierPercent: 100 };
}

function jobList(library: ContentLibrary): Job[] {
  return Object.keys(library.jobs)
    .sort()
    .map((id) => library.jobs[id]!);
}

export const BASELINE: Variant = {
  id: "baseline",
  label: "shipped constants",
  jobs: () => [],
  exactAt: () => true,
};

/**
 * The percent that lands `floor(raw * percent / 100)` exactly on `target`.
 * Scaling the multiplier naively would floor twice and lose up to a point of
 * stat; solving for the percent instead keeps the emulation on the number.
 */
function percentFor(raw: number, target: number, fallback: number): number {
  if (raw <= 0) return fallback;
  const percent = Math.ceil((target * 100) / raw);
  return Math.max(1, percent);
}

function scaledCurve(job: Job, key: "phys" | "mag", level: number, factor: number) {
  const c = curve(job, key);
  const raw = c.growth * level;
  const base = Math.floor((raw * c.multiplierPercent) / 100);
  const target = Math.round(base * factor);
  return { ...c, multiplierPercent: percentFor(raw, target, c.multiplierPercent) };
}

/**
 * The per-level growth in the damage divisor set to `perLevel` instead of the
 * engine's `LIVE_PER_LEVEL`. Expressed relative to the live engine, so
 * `divisorVariant(LIVE_PER_LEVEL)` is a no-op at every level.
 */
export function divisorVariant(perLevel: number): Variant {
  return {
    id: perLevel === LIVE_PER_LEVEL ? `divisor+${perLevel}-live` : `divisor+${perLevel}`,
    label:
      perLevel === LIVE_PER_LEVEL
        ? `damage divisor 400 + ${perLevel}*(level-1) — the shipped engine, control`
        : `damage divisor 400 + ${perLevel}*(level-1), against the live ${LIVE_PER_LEVEL}`,
    exactAt: () => true,
    jobs(library, level) {
      const factor = damageDivisor(level) / scaledDivisor(level, perLevel);
      if (factor === 1) return [];
      return jobList(library).map((job) => ({
        ...structuredClone(job),
        statCurve: {
          ...structuredClone(job.statCurve),
          phys: scaledCurve(job, "phys", level, factor),
          mag: scaledCurve(job, "mag", level, factor),
        },
      }));
    },
  };
}

/**
 * `STAT_BASE.hp` raised from 40 to `base`. Historical: a rejected alternative
 * to the divisor fix, kept as the evidence that decision was argued from
 * (`docs/BALANCE_REPORT.md` §4(b)).
 */
export function hpBaseVariant(base: number): Variant {
  return {
    id: `hp-base-${base}`,
    label: `STAT_BASE.hp ${base} (rejected alternative)`,
    exactAt: (level) => (base - 40) % level === 0,
    jobs(library, level) {
      const bump = Math.round((base - 40) / level);
      return jobList(library).map((job) => ({
        ...structuredClone(job),
        statCurve: {
          ...structuredClone(job.statCurve),
          hp: { ...curve(job, "hp"), growth: curve(job, "hp").growth + bump },
        },
      }));
    },
  };
}

/**
 * `STAT_BASE.phys` (and `.mag`, so caster kits move with weapon kits) raised
 * from 0. Historical, for the same reason as `hpBaseVariant`.
 */
export function statBaseVariant(base: number): Variant {
  return {
    id: `phys-base-${base}`,
    label: `STAT_BASE.phys/mag ${base} (rejected alternative)`,
    exactAt: (level) => base % level === 0,
    jobs(library, level) {
      const bump = Math.round(base / level);
      return jobList(library).map((job) => ({
        ...structuredClone(job),
        statCurve: {
          ...structuredClone(job.statCurve),
          phys: { ...curve(job, "phys"), growth: curve(job, "phys").growth + bump },
          mag: { ...curve(job, "mag"), growth: curve(job, "mag").growth + bump },
        },
      }));
    },
  };
}

export function applyVariant(library: ContentLibrary, variant: Variant, level: number): ContentLibrary {
  const jobs = variant.jobs(library, level);
  return jobs.length === 0 ? library : withContent(library, { jobs });
}
