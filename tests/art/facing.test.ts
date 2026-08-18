// Facing normalization (ART_DIRECTION C.8, facing convention): a drawn `se`
// cell must face down-screen-right and a drawn `ne` cell must face
// up-screen-right, so `sprites.ts`'s facing table always lands a unit on its
// intended side. A delivery that violates this on one view carries a declared
// `mirror` flag (`external.ts`'s `Delivery.mirror`), applied once at derive
// time (`segments.ts`) rather than to the committed master pixels.

import { describe, expect, it } from "vitest";
import { externalArt } from "../../src/art/external.js";
import { JOB_IDS, type JobId } from "../../src/art/jobs.js";
import { mirrorGrid, type PixelGrid } from "../../src/art/pixel.js";
import { deriveExternalFrame, type ExternalMaster } from "../../src/art/segments.js";
import { ANIMATIONS, ANIM_STATES, DRAWN_VIEWS, type DrawnView } from "../../src/art/sprites.js";
import { importFallback } from "./ingestSuite.js";

/**
 * The whole roster's declared corrections, pinned so a future master swap or
 * a fat-fingered edit to `external.ts` shows up here rather than as a unit
 * that quietly renders backwards again.
 */
const EXPECTED_MIRROR: Partial<Record<JobId, Partial<Record<DrawnView, boolean>>>> = {
  enforcer: { se: true },
  machinist: { se: true },
  conduit: { se: true, ne: true },
  saboteur: { se: true },
  chemist: { se: true },
  augmented: { se: true },
  railrunner: { se: true },
};

describe("facing normalization — declared flags", () => {
  it("pins exactly which job/view corrections are declared", () => {
    for (const jobId of JOB_IDS) {
      const art = externalArt(jobId);
      if (!art) continue;
      expect(art.master.mirror ?? {}, jobId).toEqual(EXPECTED_MIRROR[jobId] ?? {});
    }
  });

  it("leaves every other delivered view undeclared", () => {
    for (const jobId of JOB_IDS) {
      const art = externalArt(jobId);
      if (!art) continue;
      const expected = EXPECTED_MIRROR[jobId] ?? {};
      for (const view of DRAWN_VIEWS) {
        if (expected[view]) continue;
        expect(art.master.mirror?.[view], `${jobId}/${view}`).toBeFalsy();
      }
    }
  });
});

const gridsEqual = (a: PixelGrid, b: PixelGrid): boolean =>
  a.width === b.width && a.height === b.height && Array.from(a.data).every((v, i) => v === b.data[i]);

describe("facing normalization — mirrored derivation", () => {
  const base = importFallback("enforcer").master;
  const mirrored: ExternalMaster = { ...base, mirror: { se: true } };

  it("flips every derived se frame against the unmirrored derivation, and leaves ne alone", () => {
    for (const state of ANIM_STATES) {
      for (let frame = 0; frame < ANIMATIONS[state].frames; frame += 1) {
        const plain = deriveExternalFrame(base, { state, view: "se", frame });
        const flipped = deriveExternalFrame(mirrored, { state, view: "se", frame });
        expect(gridsEqual(flipped, mirrorGrid(plain)), `${state}/se/${frame}`).toBe(true);

        const plainNe = deriveExternalFrame(base, { state, view: "ne", frame });
        const untouchedNe = deriveExternalFrame(mirrored, { state, view: "ne", frame });
        expect(gridsEqual(untouchedNe, plainNe), `${state}/ne/${frame}`).toBe(true);
      }
    }
  });

  it("is its own inverse: mirroring both views round-trips a frame", () => {
    const bothMirrored: ExternalMaster = { ...base, mirror: { se: true, ne: true } };
    for (const view of DRAWN_VIEWS) {
      const plain = deriveExternalFrame(base, { state: "idle", view, frame: 0 });
      const flipped = deriveExternalFrame(bothMirrored, { state: "idle", view, frame: 0 });
      expect(gridsEqual(mirrorGrid(flipped), plain), view).toBe(true);
    }
  });
});

describe("facing normalization — applies through the real pipeline", () => {
  it("enforcer's built se sheet rows are the horizontal flip of the unmirrored master derivation", () => {
    const art = externalArt("enforcer");
    expect(art).not.toBeNull();
    if (!art) return;
    const plain: ExternalMaster = { ...art.master, mirror: {} };
    for (const state of ANIM_STATES) {
      for (let frame = 0; frame < ANIMATIONS[state].frames; frame += 1) {
        const shipped = deriveExternalFrame(art.master, { state, view: "se", frame });
        const unmirrored = deriveExternalFrame(plain, { state, view: "se", frame });
        expect(gridsEqual(shipped, mirrorGrid(unmirrored)), `${state}/se/${frame}`).toBe(true);
      }
    }
  });

});
