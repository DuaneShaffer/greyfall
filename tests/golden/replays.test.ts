import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOLDEN_ENCOUNTERS, GOLDEN_SEEDS, readFixture, replay, serialize } from "./replays.js";

const recording = process.env["GREYFALL_RECORD_GOLDENS"] === "1";

describe("golden replays", () => {
  it("shards every encounter into its own test file", () => {
    for (const encounterId of GOLDEN_ENCOUNTERS) {
      expect(existsSync(join(import.meta.dirname, `${encounterId}.test.ts`)), encounterId).toBe(true);
    }
  });

  it("every recorded battle actually played", () => {
    for (const encounterId of GOLDEN_ENCOUNTERS) {
      for (const seed of GOLDEN_SEEDS) {
        // While re-recording, the shard files are rewriting these fixtures in
        // other workers, so read the run rather than the half-written file.
        const body = recording ? serialize(replay(encounterId, seed)) : readFixture(encounterId, seed);
        const record = JSON.parse(body) as { commands: number; events: unknown[] };
        expect(record.commands).toBeGreaterThan(10);
        expect(record.events.length).toBeGreaterThan(50);
      }
    }
  });
});
