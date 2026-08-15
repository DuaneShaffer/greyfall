/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentRegistry, type ContentKind } from "../../src/data/index.js";
import { realContent } from "../../src/ui/mock.js";

const DATA_DIR = join(import.meta.dirname, "..", "..", "data");

// The harness and the UI tests are only honest if the content they draw is the
// content that ships. This fails the moment data/*.json drifts from the mocks.
describe("mock content fidelity", () => {
  for (const [kind, records] of Object.entries(realContent) as [ContentKind, Record<string, unknown>][]) {
    for (const [id, mocked] of Object.entries(records)) {
      it(`${kind}/${id} matches the authored JSON`, () => {
        const raw = JSON.parse(readFileSync(join(DATA_DIR, kind, `${id}.json`), "utf8"));
        expect(contentRegistry[kind].parse(mocked)).toEqual(contentRegistry[kind].parse(raw));
      });
    }
  }
});
