import { describe, expect, it } from "vitest";
import { STAT_BASE, damageDivisor, deriveStats } from "../../src/core/index.js";
import { simContent } from "../../src/sim/content.js";
import { jobUnit } from "../../src/sim/matchup.js";
import { scriptedDuel } from "../../src/sim/ttk.js";
import {
  BASE_DIVISOR,
  LIVE_PER_LEVEL,
  applyVariant,
  divisorVariant,
  hpBaseVariant,
  scaledDivisor,
  statBaseVariant,
} from "../../src/sim/variants.js";

const { library } = simContent();
const JOBS = ["augmented", "chemist", "conduit", "enforcer", "machinist", "railrunner", "saboteur"];

function hpOf(lib: typeof library, jobId: string, level: number): number {
  const unit = jobUnit(lib, jobId, level, `sim-a-${jobId}-0`, { fullKit: false, passives: false, withArmor: false });
  return deriveStats(unit, lib.jobs[jobId]!).hp;
}

function physOf(lib: typeof library, jobId: string, level: number): number {
  const unit = jobUnit(lib, jobId, level, `sim-a-${jobId}-0`, { fullKit: false, passives: false, withArmor: false });
  return deriveStats(unit, lib.jobs[jobId]!).phys;
}

describe("formula variants", () => {
  it("the hp-base variant reproduces a raised STAT_BASE.hp exactly", () => {
    const base = 160;
    const variant = hpBaseVariant(base);
    for (const level of [1, 3, 5]) {
      expect(variant.exactAt(level)).toBe(true);
      const lib = applyVariant(library, variant, level);
      for (const jobId of JOBS) {
        const curve = library.jobs[jobId]!.statCurve.hp!;
        const expected = Math.floor(((base + curve.growth * level) * curve.multiplierPercent) / 100);
        expect(hpOf(lib, jobId, level), `${jobId} L${level}`).toBe(expected);
      }
    }
  });

  it("the stat-base variant reproduces a raised STAT_BASE.phys exactly", () => {
    const base = 15;
    const variant = statBaseVariant(base);
    for (const level of [1, 3, 5]) {
      expect(variant.exactAt(level)).toBe(true);
      const lib = applyVariant(library, variant, level);
      for (const jobId of JOBS) {
        const curve = library.jobs[jobId]!.statCurve.phys!;
        const expected = Math.floor(((base + curve.growth * level) * curve.multiplierPercent) / 100);
        expect(physOf(lib, jobId, level), `${jobId} L${level}`).toBe(expected);
      }
    }
  });

  it("the baseline library is unchanged by STAT_BASE, so the emulation starts from the shipped numbers", () => {
    expect(STAT_BASE.hp).toBe(40);
    expect(STAT_BASE.phys).toBe(0);
    for (const jobId of JOBS) {
      const curve = library.jobs[jobId]!.statCurve.hp!;
      expect(hpOf(library, jobId, 1)).toBe(Math.floor(((40 + curve.growth) * curve.multiplierPercent) / 100));
    }
  });

  it("the divisor variant scales weapon damage by D(level)/D'(level), against the live engine", () => {
    const perLevel = 175;
    const variant = divisorVariant(perLevel);
    for (const level of [1, 3, 5]) {
      const lib = applyVariant(library, variant, level);
      for (const jobId of JOBS) {
        const baseline = scriptedDuel(library, jobId, "enforcer", level, 1).damagePerHit;
        const scaled = scriptedDuel(lib, jobId, "enforcer", level, 1).damagePerHit;
        // The engine already divides by damageDivisor(level); the variant only
        // carries the difference between its slope and that one.
        const target = (baseline * damageDivisor(level)) / scaledDivisor(level, perLevel);
        // Percent multipliers are integers, so the emulation lands within a point of the target.
        expect(Math.abs(scaled - target), `${jobId} L${level}: ${scaled} vs ${target.toFixed(2)}`).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("the live slope is a provable no-op: the variant hands back the library untouched", () => {
    expect(BASE_DIVISOR).toBe(damageDivisor(1));
    expect(scaledDivisor(4, LIVE_PER_LEVEL)).toBe(damageDivisor(4));
    const variant = divisorVariant(LIVE_PER_LEVEL);
    for (const level of [1, 2, 3, 4, 5]) {
      expect(variant.jobs(library, level), `L${level} job overrides`).toEqual([]);
      // Same object, not merely equal content: nothing was injected at all.
      expect(applyVariant(library, variant, level)).toBe(library);
    }
  });

  it("at level 1 every divisor slope is the shipped game", () => {
    const lib = applyVariant(library, divisorVariant(175), 1);
    for (const jobId of JOBS) {
      expect(scriptedDuel(lib, jobId, "enforcer", 1, 1).damagePerHit).toBe(
        scriptedDuel(library, jobId, "enforcer", 1, 1).damagePerHit,
      );
      expect(hpOf(lib, jobId, 1)).toBe(hpOf(library, jobId, 1));
    }
  });
});
