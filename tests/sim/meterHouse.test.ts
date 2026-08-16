/**
 * The balance instrument for `s1-meter-house`, in the shape every §7.8.x
 * addendum is measured with: one `encounterRuns` call per seed set, tuned on
 * the primary only and confirmed on the disjoint alt.
 *
 * Set GREYFALL_METER=1 to print the table this reads into
 * `docs/BALANCE_REPORT.md`; the assertions below are the landing itself.
 */

import { describe, expect, it } from "vitest";
import { simContent } from "../../src/sim/content.js";
import {
  ALT_ENCOUNTER_SEEDS,
  PRIMARY_ENCOUNTER_SEEDS,
  encounterRuns,
  type SweepBattle,
} from "../../src/sim/sweeps.js";
import { encounterReports, objectiveFindings } from "../../src/sim/analysis.js";

const ENCOUNTER = "s1-meter-house";
const REPORT = process.env.GREYFALL_METER === "1";

function run(seeds: readonly number[]): SweepBattle[] {
  return encounterRuns(simContent(), [ENCOUNTER], seeds, { commandCap: 4000 });
}

function summarize(label: string, battles: readonly SweepBattle[]) {
  const row = encounterReports(battles)[0]!;
  const c = row.counters;
  const side = (t: { player: number; enemy: number; scripted: number }) =>
    `p${t.player}/e${t.enemy}/s${t.scripted}`;
  if (REPORT) {
    const findings = objectiveFindings(simContent().library, battles);
    console.log(
      [
        `--- ${label} (${row.battles} runs) ---`,
        `win ${(row.winRate * 100).toFixed(1)}%  turns ${row.meanTurns.toFixed(1)}  losses ${row.meanPartyLosses.toFixed(1)}/6  survivorHp ${row.meanSurvivingHpPercent.toFixed(1)}%  stalemates ${row.stalemates}`,
        `trips ${side(c.gridTrips)}  resets ${side(c.gridResets)}  cut ${side(c.linesCut)}  spliced ${side(c.linesSpliced)}  ties ${side(c.tiesThrown)}  gridPower ${side(c.gridPowerChanges)}`,
        `energizedMachineTurnShare ${(c.energizedMachineTurnShare * 100).toFixed(1)}%  meanHeadroom ${JSON.stringify(c.meanHeadroomPercent)}`,
        `runsGridDark ${c.runsGridDark}/${row.battles}  darkByTurn ${c.darkByTurn}  machineryOperated ${side(c.machineryOperated)}`,
        `findings: ${findings.map((f) => `${f.severity}:${f.code}`).join(", ") || "none"}`,
      ].join("\n"),
    );
  }
  return { row, c };
}

describe("s1-meter-house on two disjoint seed sets", () => {
  const primary = run(PRIMARY_ENCOUNTER_SEEDS);
  const alt = run(ALT_ENCOUNTER_SEEDS);
  const p = summarize("primary", primary);
  const a = summarize("alt", alt);

  it("lands inside the 40-83% band on both sets and pooled", () => {
    const pooled = [...primary, ...alt];
    const pooledRate = encounterReports(pooled)[0]!.winRate;
    for (const rate of [p.row.winRate, a.row.winRate, pooledRate]) {
      expect(rate).toBeGreaterThanOrEqual(0.4);
      expect(rate).toBeLessThanOrEqual(0.83);
    }
  });

  it("reads the same fight on both sets", () => {
    expect(Math.abs(p.row.winRate - a.row.winRate)).toBeLessThanOrEqual(0.25);
  });

  it("contests the grid: state flips, and the enemy puts power back", () => {
    for (const c of [p.c, a.c]) {
      const flips =
        c.gridTrips.total + c.gridResets.total + c.linesCut.total + c.linesSpliced.total +
        c.tiesThrown.total + c.gridPowerChanges.total;
      expect(flips).toBeGreaterThan(0);
      // gridRestore firing on the enemy side is the whole reason the term exists.
      expect(c.gridResets.enemy + c.linesSpliced.enemy + c.tiesThrown.enemy).toBeGreaterThan(0);
    }
  });

  it("does not let either side delete the thesis", () => {
    for (const battles of [primary, alt]) {
      const codes = objectiveFindings(simContent().library, battles).map((f) => f.code);
      expect(codes).not.toContain("grid-dark-by-turn-N");
      expect(codes).not.toContain("grid-never-contested");
      expect(codes).not.toContain("grid-never-restored");
    }
  });
});
