// The charge hoist's delivery, `art-src/charge_hoist.png` (OBJECT_BRIEFS §3).
//
// Two things only this object has, and they pull in opposite directions.
//
// It is the set's only **open** frame: the space under the beam is the
// silhouette, so its cells reach all four edges of their rects while under half
// their pixels are opaque. That is the delivery and not a defect — the renderer
// cuts the hole with `alphaTest 0.5` — and it is the whole of the hoist's
// identity at distance, because a press is solid and closes downward and a hoist
// is open and lifts.
//
// And it is a **sink**: it draws and does not supply. The rule the whole set
// turns on is that a player can tell where power comes from, so a consumer gets
// one indicator at the winch head under a ceiling of 1%, a quarter of what the
// set allows. Its own brief is the tighter of the two and the audit is held to it.

import { describe, expect, it } from "vitest";
import { PALETTE } from "../../src/art/palette.js";
import type { PixelGrid } from "../../src/art/pixel.js";
import { OBJECT_ART, objectFaceIds } from "../../src/art/objects.js";
import { objectCarrierGrid, objectFaceGrid } from "../../src/art/objectset.js";
import { auditOf, registerObjectSheetSuite, specOf } from "./objectsSuite.js";

registerObjectSheetSuite({
  file: "charge_hoist.png",
  columns: [
    { from: 11, to: 11 },
    { from: 16, to: 415 },
    { from: 420, to: 420 },
    { from: 427, to: 427 },
    { from: 432, to: 559 },
    { from: 564, to: 564 },
  ],
  rows: [
    { from: 11, to: 11 },
    { from: 16, to: 271 },
    { from: 276, to: 276 },
    { from: 300, to: 327 },
  ],
  guides: 216,
  swatches: [
    PALETTE["umber-900"],
    PALETTE["soot-700"],
    PALETTE["soot-500"],
    PALETTE["copper-700"],
    PALETTE["umber-300"],
    PALETTE["copper-500"],
    PALETTE["amber-500"],
    PALETTE["amber-300"],
  ],
  swatchedUnused: [],
  cells: [
    // Edge to edge on all four sides, and roughly half air. The gap is the read.
    { face: "long", opaque: 28800 },
    { face: "end", opaque: 17440 },
    { face: "top", opaque: 15040 },
  ],
});

const spec = OBJECT_ART["charge-hoist"];

describe("charge hoist audit, as delivered", () => {
  it("pins the colour count of every face", () => {
    expect(objectFaceIds(spec).map((face) => auditOf("charge-hoist", face).colorCount)).toEqual([8, 8, 7]);
  });

  it("keeps the frame open: daylight through it, and every hole a whole game pixel", () => {
    const coverage = [
      ["long", 1800, 64 * 56],
      ["end", 1090, 32 * 56],
      ["top", 940, 32 * 64],
    ] as const;
    for (const [face, opaque, area] of coverage) {
      const audit = auditOf("charge-hoist", face);
      expect(audit.opaquePixels, face).toBe(opaque);
      expect(audit.transparentPixels, face).toBe(area - opaque);
      // A press would be solid here. Anything above ~two-thirds stops reading as
      // a frame with something hanging in it (§3, identity at distance).
      expect(audit.opaquePixels / area, face).toBeLessThan(0.7);
    }
    // The alpha lands on the 4px game grid, so the reduction neither closes a gap
    // nor leaves a half-lit fringe for `alphaTest 0.5` to guess at.
    const grid = objectFaceGrid("charge-hoist", "long");
    expect(grid.data.filter((index) => index === 0)).toHaveLength(64 * 56 - 1800);
  });

  it("spends one indicator's worth of amber, under the sink's own 1% ceiling", () => {
    // §3: one small `#d98a1b` indicator at the winch head with an `#f3b94a` core
    // pixel, no seam network and no column. Four pixels a face is that indicator.
    const pins = [
      ["long", 4, 18, [39, 40]],
      ["end", 4, 10, [20, 21]],
      ["top", 4, 9, [21, 22]],
    ] as const;
    for (const [face, amber, budget, columns] of pins) {
      const audit = auditOf("charge-hoist", face);
      expect([audit.amberPixels, audit.amberBudget], face).toEqual([amber, budget]);
      expect(audit.amberCeiling, face).toBe(0.01);
      expect(audit.amberShare, face).toBeLessThan(0.01);
      expect(audit.column.columns, face).toEqual(columns);
      // Two rows of a fifty-six row face: an indicator, not a seam network.
      expect(audit.column.rows, face).toBe(2);
      expect(audit.column.continuous, face).toBe(false);
      expect(specOf("charge-hoist", face).amberColumn, face).toBe(false);
      expect(audit.colors, face).toContain(PALETTE["amber-500"]);
      expect(audit.colors, face).toContain(PALETTE["amber-300"]);
      // No painted halo: the bloom keys on `amber-glow` and it is the engine's.
      expect(audit.colors, face).not.toContain(PALETTE["amber-glow"]);
      expect(audit.glowOffCore, face).toBe(0);
    }
  });

  it("carries one control lever, reachable, on the two faces it stands at the corner of", () => {
    // §3: a `#a5622f` lever or wheel on the frame at standing height. One lever at
    // the corner of a frame shows on the long side and on the end alike; the top
    // face has none, and §6 forbids `copper-500` on any face with no control.
    const pins = [
      ["long", 30, { from: 24, to: 33 }],
      ["end", 29, { from: 26, to: 34 }],
    ] as const;
    for (const [face, pixels, rows] of pins) {
      const audit = auditOf("charge-hoist", face);
      expect(audit.control.pixels, face).toBe(pixels);
      expect(audit.control.clusters, face).toBe(1);
      expect(audit.control.rows, face).toEqual(rows);
      expect(audit.control.reachable, face).toBe(true);
      expect(specOf("charge-hoist", face).control, face).toBe(true);
    }
    expect(auditOf("charge-hoist", "top").control.pixels).toBe(0);
    expect(specOf("charge-hoist", "top").control).toBe(false);
  });

  it("lights the indicator and nothing else, in the states §6 gives a halo", () => {
    const powered = objectCarrierGrid("charge-hoist", "long", "powered") as PixelGrid;
    let lit = 0;
    for (const index of powered.data) if (index !== 0) lit += 1;
    // The indicator's seam body and its core; the recess is a shadow and stays one.
    expect(lit).toBe(4);
    expect(objectCarrierGrid("charge-hoist", "long", "unpowered")).toBeNull();
    expect(objectCarrierGrid("charge-hoist", "long", "destroyed")).toBeNull();
    expect(objectCarrierGrid("charge-hoist", "long", "severed")).toBeNull();
  });

  it("keeps a state change inside the frame it is a state of", () => {
    // Interior transparency has to survive the substitution or an unpowered hoist
    // would come back solid, and the gap is the object's whole identity.
    for (const face of objectFaceIds(spec)) {
      const powered = objectFaceGrid("charge-hoist", face);
      for (const state of ["unpowered", "overloading", "destroyed", "severed"] as const) {
        const grid = objectFaceGrid("charge-hoist", face, state);
        for (let i = 0; i < powered.data.length; i += 1) {
          if (powered.data[i] !== 0) continue;
          expect(grid.data[i], `${face}/${state} px ${i}`).toBe(0);
        }
      }
    }
  });
});
