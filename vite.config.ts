import { resolve } from "node:path";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

const root = import.meta.dirname;

/**
 * `npm run test:fast` drops the conformance sweeps — the per-job art shards and
 * the two sim sweeps — and runs everything else, golden replays included. The
 * full `npx vitest run` remains the gate; this lane is for the inner loop.
 */
const FAST_LANE_SKIPS = [
  "tests/art/sheet.*.test.ts",
  "tests/art/figures.*.test.ts",
  "tests/art/ingest.*.test.ts",
  "tests/sim/sweeps.test.ts",
  "tests/sim/meterHouse.test.ts",
];

const fastLane = process.env["GREYFALL_TEST_FAST"] === "1";

export default defineConfig({
  // Sprite conformance sweeps run over 4x the pixels since the 64x96 re-spec.
  test: {
    testTimeout: 30_000,
    exclude: [...configDefaults.exclude, ...(fastLane ? FAST_LANE_SKIPS : [])],
  },
  build: {
    rollupOptions: {
      input: {
        battle: resolve(root, "index.html"),
        harness: resolve(root, "ui-harness.html"),
        spritePreview: resolve(root, "src/art/preview.html"),
      },
    },
  },
});
