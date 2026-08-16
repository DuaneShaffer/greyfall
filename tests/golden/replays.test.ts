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

const recording = process.env["GREYFALL_RECORD_GOLDENS"] === "1";

describe("golden replays", () => {
  for (const encounterId of GOLDEN_ENCOUNTERS) {
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
  }

  it("every recorded battle actually played", () => {
    for (const encounterId of GOLDEN_ENCOUNTERS) {
      for (const seed of GOLDEN_SEEDS) {
        const record = JSON.parse(readFixture(encounterId, seed)) as { commands: number; events: unknown[] };
        expect(record.commands).toBeGreaterThan(10);
        expect(record.events.length).toBeGreaterThan(50);
      }
    }
  });
});
