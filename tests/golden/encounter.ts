/**
 * One encounter's replay checks, sharded into its own test file so the sixteen
 * fixtures do not queue behind each other in a single vitest worker.
 */

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GOLDEN_ENCOUNTERS,
  GOLDEN_SEEDS,
  fixturePath,
  readFixture,
  replay,
  serialize,
  writeFixture,
} from "./replays.js";

export type GoldenEncounterId = (typeof GOLDEN_ENCOUNTERS)[number];

const recording = process.env["GREYFALL_RECORD_GOLDENS"] === "1";

export function goldenEncounterSuite(encounterId: GoldenEncounterId): void {
  describe("golden replays", () => {
    for (const seed of GOLDEN_SEEDS) {
      it(`${encounterId} @ ${seed} reproduces its recorded event stream`, () => {
        const body = serialize(replay(encounterId, seed));
        if (recording) {
          writeFixture(encounterId, seed, body);
          return;
        }
        expect(existsSync(fixturePath(encounterId, seed))).toBe(true);
        expect(body).toBe(readFixture(encounterId, seed));
      });
    }
  });
}
