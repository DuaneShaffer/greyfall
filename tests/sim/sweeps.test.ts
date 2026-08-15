import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { CANDIDATE_VARIANTS, CANDIDATE_WEIGHTS, runSweepReport } from "../../src/sim/main.js";

const FULL = process.env["GREYFALL_SIM"] === "full";
const OUT = process.env["GREYFALL_SIM_OUT"];

describe("sweeps", () => {
  it(
    FULL ? "runs the full measurement sweep" : "runs a CI-sized smoke sweep",
    () => {
      const { report, bundle } = runSweepReport({
        ...(FULL ? { full: true, variants: CANDIDATE_VARIANTS, weightTables: CANDIDATE_WEIGHTS } : {}),
      });
      const total =
        bundle.duels.length +
        bundle.comps.length +
        bundle.encounters.length +
        bundle.variants.length +
        bundle.weights.length +
        bundle.tempo.length;
      expect(total).toBeGreaterThan(0);
      expect(bundle.duels.every((b) => b.record.commands > 0)).toBe(true);
      expect(report).toContain("Job duel round robin");

      if (OUT !== undefined) {
        mkdirSync(dirname(OUT), { recursive: true });
        writeFileSync(OUT, `${report}\n`, "utf8");
      }
      console.log(report);
    },
    FULL ? 3_600_000 : 300_000,
  );
});
