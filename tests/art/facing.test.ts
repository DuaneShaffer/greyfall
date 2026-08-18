// Facing normalization (ART_DIRECTION C.8, facing convention): a drawn `se`
// cell must face down-screen-right and a drawn `ne` cell must face
// up-screen-right, so `sprites.ts`'s facing table always lands a unit on its
// intended side. A delivery that violates this on one view carries a declared
// `mirror` flag (`external.ts`'s `Delivery.mirror`), applied once at derive
// time (`segments.ts`) rather than to the committed master pixels.
//
// The flags are pinned here, and then measured against the art itself: which
// side of its own head each figure's face sits on, on the committed cell and on
// the corrected frame. A delivery that arrives facing the wrong way fails that
// measurement whether or not anyone remembered to declare a flag for it.

import { describe, expect, it } from "vitest";
import { EXTERNAL_JOBS, externalArt } from "../../src/art/external.js";
import { JOB_IDS, type JobId } from "../../src/art/jobs.js";
import { RAMPS } from "../../src/art/palette.js";
import { TRANSPARENT, gridGet, mirrorGrid, paletteIndex, type PixelGrid } from "../../src/art/pixel.js";
import { deriveExternalFrame, type ExternalMaster } from "../../src/art/segments.js";
import { ANIMATIONS, ANIM_STATES, DRAWN_VIEWS, SPRITE_WIDTH, type DrawnView } from "../../src/art/sprites.js";
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

/**
 * Painted skin quantizes onto the bone ramp (the intake palette has no other
 * flesh tone), so bone pixels inside the head band are the face — and where they
 * sit inside the head tells which way the figure looks.
 */
const BONE_INDICES = new Set(RAMPS.bone.map((hex) => paletteIndex(hex)));

/**
 * The head band is rows 0..shoulderRow-1, and the delivery's shoulder row is
 * the height of the head region the segment map was built with — the landmark
 * as the pipeline itself read it.
 */
const headBandRows = (master: ExternalMaster): number => {
  const head = master.maps.se.segments.find((segment) => segment.name === "head");
  expect(head, `${master.id} has no head region`).toBeDefined();
  return head?.rect.h ?? 0;
};

/**
 * How far the face sits from the centre of the head, in pixels, positive to
 * screen-right. The head is the connected cluster inside the band that carries
 * the most bone: a whip antenna, a coil staff or a pack shoulder also reaches
 * into the band, and measuring against a bounding box drawn around all of it
 * would report the gear's asymmetry instead of the figure's.
 */
function faceSideOffset(grid: PixelGrid, bandRows: number): number {
  const seen = new Uint8Array(SPRITE_WIDTH * bandRows);
  let best = { bone: 0, boneSum: 0, x0: 0, x1: 0 };
  for (let y0 = 0; y0 < bandRows; y0 += 1) {
    for (let x0 = 0; x0 < SPRITE_WIDTH; x0 += 1) {
      if (seen[y0 * SPRITE_WIDTH + x0] === 1 || gridGet(grid, x0, y0) === TRANSPARENT) continue;
      const cluster = { bone: 0, boneSum: 0, x0, x1: x0 };
      const stack = [x0, y0];
      seen[y0 * SPRITE_WIDTH + x0] = 1;
      while (stack.length > 0) {
        const y = stack.pop() as number;
        const x = stack.pop() as number;
        if (x < cluster.x0) cluster.x0 = x;
        if (x > cluster.x1) cluster.x1 = x;
        if (BONE_INDICES.has(gridGet(grid, x, y))) {
          cluster.bone += 1;
          cluster.boneSum += x;
        }
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= SPRITE_WIDTH || ny >= bandRows) continue;
            if (seen[ny * SPRITE_WIDTH + nx] === 1 || gridGet(grid, nx, ny) === TRANSPARENT) continue;
            seen[ny * SPRITE_WIDTH + nx] = 1;
            stack.push(nx, ny);
          }
        }
      }
      if (cluster.bone > best.bone) best = cluster;
    }
  }
  expect(best.bone, "no skin pixels in the head band").toBeGreaterThan(0);
  return best.boneSum / best.bone - (best.x0 + best.x1) / 2;
}

/**
 * A whole pixel of lean, which no rounding in the reduction can invent. The
 * corrected frames measure +1.4 (the conduit, whose single-view crop is the
 * tightest) to +9.0; the committed cells lean the same distance the other way.
 */
const FACE_SIDE_MARGIN = 1;

describe("facing normalization — measured on the delivered art", () => {
  it("lands the face on the screen-right side of every corrected se frame", () => {
    expect(EXTERNAL_JOBS).toHaveLength(7);
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      expect(art, jobId).not.toBeNull();
      if (!art) continue;
      const band = headBandRows(art.master);
      const corrected = deriveExternalFrame(art.master, { state: "idle", view: "se", frame: 0 });
      expect(faceSideOffset(corrected, band), `${jobId} corrected se`).toBeGreaterThanOrEqual(
        FACE_SIDE_MARGIN,
      );
    }
  });

  it("measures every committed se cell facing the other way, so the flip earns its flag", () => {
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      if (!art) continue;
      expect(art.master.mirror?.se, jobId).toBe(true);
      expect(
        faceSideOffset(art.master.views.se, headBandRows(art.master)),
        `${jobId} committed se`,
      ).toBeLessThanOrEqual(-FACE_SIDE_MARGIN);
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
