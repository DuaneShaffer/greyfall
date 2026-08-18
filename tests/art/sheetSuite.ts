import { describe, expect, it } from "vitest";
import { EXTERNAL_JOBS, externalArt, hasExternalArt } from "../../src/art/external.js";
import { JOB_IDS } from "../../src/art/jobs.js";
import { jobFrame } from "../../src/art/jobs.js";
import type { JobId } from "../../src/art/jobs.js";
import { gridGet, opaqueCount } from "../../src/art/pixel.js";
import { buildJobSheet, sheetKey } from "../../src/art/sheet.js";
import { SPRITE_ANCHOR, SPRITE_HEIGHT, SPRITE_WIDTH } from "../../src/art/sprites.js";
import { registerDeliveredMasterSuite } from "./ingestSuite.js";

// One `sheet.<job>.test.ts` file per entry; the coverage guard in sheet.test.ts
// checks this against JOB_IDS and EXTERNAL_JOBS so a dropped roster entry fails.
export const SHARDED_JOBS = [
  "enforcer",
  "machinist",
  "conduit",
  "saboteur",
  "chemist",
  "augmented",
  "railrunner",
] as const satisfies readonly JobId[];

export function describeJobSheet(job: JobId): void {
  describe("assembly", () => {
    it("builds a non-empty sheet for every job and team", () => {
      for (const jobId of JOB_IDS.filter((id) => id === job)) {
        for (const team of ["player", "enemy", "neutral"] as const) {
          expect(opaqueCount(buildJobSheet(jobId, team)), sheetKey(jobId, team)).toBeGreaterThan(2000);
        }
      }
    });
  });

  describe("external masters", () => {
    it("derives the sheet from delivered art where there is any", () => {
      expect(EXTERNAL_JOBS.length).toBeGreaterThan(0);
      for (const jobId of EXTERNAL_JOBS.filter((id) => id === job)) {
        expect(hasExternalArt(jobId)).toBe(true);
        const sheet = buildJobSheet(jobId, "player");
        const composited = jobFrame({
          jobId,
          team: "player",
          state: "idle",
          view: "se",
          frame: 0,
        });
        let same = 0;
        for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
          for (let x = 0; x < SPRITE_WIDTH; x += 1) {
            if (gridGet(sheet, x, y) === gridGet(composited, x, y)) same += 1;
          }
        }
        // The delivered art is not the compositor's placeholder for this job.
        expect(same / (SPRITE_WIDTH * SPRITE_HEIGHT), jobId).toBeLessThan(0.9);
      }
    });

    it("keeps the audit available at load, violations and all", () => {
      for (const jobId of EXTERNAL_JOBS.filter((id) => id === job)) {
        const art = externalArt(jobId);
        expect(art, jobId).not.toBeNull();
        if (!art) continue;
        // Reports, never repairs: a rejected master still loads and still says so.
        expect(art.summary).toContain(jobId);
        expect(art.reports.se.figureBottom, jobId).toBe(SPRITE_ANCHOR.y - 1);
      }
    });

    it("caches, so a sheet is deterministic", () => {
      for (const jobId of EXTERNAL_JOBS.filter((id) => id === job)) {
        expect(buildJobSheet(jobId, "enemy").data).toEqual(buildJobSheet(jobId, "enemy").data);
      }
    });
  });

  registerDeliveredMasterSuite(job);
}
