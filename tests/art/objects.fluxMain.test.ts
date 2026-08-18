// The flux main's delivery, `art-src/flux_main.png` (OBJECT_BRIEFS §1).
//
// The generic sweep is in `objectsSuite.ts`; what is here is what only this
// object has. It is the legibility-critical one: the amber column up its long
// face is the single strongest amber in the game, and it is how a player picks
// out where the floor's power comes from without hovering anything.

import { describe, expect, it } from "vitest";
import { PALETTE } from "../../src/art/palette.js";
import { OBJECT_AMBER_SHARE, OBJECT_ART, objectFaceIds } from "../../src/art/objects.js";
import { auditOf, registerObjectSheetSuite } from "./objectsSuite.js";

registerObjectSheetSuite({
  file: "flux_main.png",
  columns: [
    { from: 4, to: 12 },
    { from: 16, to: 415 },
    { from: 420, to: 428 },
    { from: 432, to: 559 },
    { from: 564, to: 572 },
  ],
  rows: [
    { from: 4, to: 12 },
    { from: 16, to: 271 },
    { from: 276, to: 284 },
    { from: 288, to: 311 },
  ],
  guides: 177,
  swatches: [
    PALETTE["soot-800"],
    PALETTE["soot-700"],
    PALETTE["soot-500"],
    PALETTE["copper-700"],
    PALETTE["copper-500"],
    PALETTE["amber-700"],
    PALETTE["amber-500"],
    PALETTE["amber-300"],
    PALETTE["amber-glow"],
  ],
  swatchedUnused: [],
  cells: [
    { face: "long", opaque: 256 * 192 },
    { face: "end", opaque: 128 * 192 },
    { face: "top", opaque: 128 * 256 },
  ],
});

const spec = OBJECT_ART["flux-main"];

describe("flux main audit, as delivered", () => {
  it("paints every face solid: a main is a mass and has no daylight in it", () => {
    for (const face of objectFaceIds(spec)) {
      expect(auditOf("flux-main", face).transparentPixels, face).toBe(0);
    }
  });

  it("pins the colour count of every face", () => {
    expect(objectFaceIds(spec).map((face) => auditOf("flux-main", face).colorCount)).toEqual([8, 4, 7]);
  });

  it("spends amber inside the budget on the two faces that carry any", () => {
    const long = auditOf("flux-main", "long");
    expect([long.amberPixels, long.amberBudget]).toEqual([96, 122]);
    expect(long.amberShare).toBeCloseTo(0.03125, 5);
    expect(long.amberShare).toBeLessThan(OBJECT_AMBER_SHARE);

    expect(auditOf("flux-main", "end").amberPixels).toBe(0);
    const top = auditOf("flux-main", "top");
    expect(top.amberPixels).toBe(16);
    expect(top.amberShare).toBeLessThan(OBJECT_AMBER_SHARE);
  });

  it("runs a continuous carrier column the full height of the long face, and nowhere else", () => {
    const long = auditOf("flux-main", "long");
    expect(long.column.rows).toBe(48);
    expect(long.column.continuous).toBe(true);
    // Two game pixels wide: a recess and a body, dead centre of the 2-tile run.
    expect(long.column.columns).toEqual([31, 32]);
    expect(auditOf("flux-main", "end").column.rows).toBe(0);
    expect(auditOf("flux-main", "top").column.continuous).toBe(false);
  });

  it("carries one copper-500 handle, low on the long face, and none anywhere else", () => {
    const long = auditOf("flux-main", "long");
    expect(long.control.pixels).toBe(26);
    expect(long.control.clusters).toBe(1);
    expect(long.control.rows).toEqual({ from: 33, to: 40 });
    expect(long.control.reachable).toBe(true);
    expect(auditOf("flux-main", "end").control.pixels).toBe(0);
    expect(auditOf("flux-main", "top").control.pixels).toBe(0);
  });

  it("reports the three amber-glow pixels drawn off the core", () => {
    // The brief puts the halo colour on core pixels only; the column's core is
    // drawn as intermittent ticks and three glow pixels land between them. A
    // warning, not an error — the intake reports and never repairs (C.8.2).
    expect(auditOf("flux-main", "long").glowOffCore).toBe(3);
    expect(auditOf("flux-main", "long").warnings).toHaveLength(1);
    expect(auditOf("flux-main", "end").glowOffCore).toBe(0);
    expect(auditOf("flux-main", "top").glowOffCore).toBe(0);
  });
});
