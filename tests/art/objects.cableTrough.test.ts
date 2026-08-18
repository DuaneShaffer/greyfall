// The cable trough's delivery, `art-src/cable_trough.png` (OBJECT_BRIEFS §2) and
// its cut state, `art-src/severed_span.png` (§4).
//
// §4 is a **state of §2 and not a fourth object**, which is the fact these two
// sheets are read together to hold. Three states of the same run have to be
// separable across a room — live (a warm filament), dark (the same channel, grey
// line) and severed (the run visibly does not reach) — and dark and severed are
// the pair most easily confused, because they take different verbs to answer. So
// what is measured here is exactly that: the filament is one pure pixel wide and
// unbroken along the run, the dead run is the same channel with the light out and
// *nothing else moved*, and the break is a different set of colours entirely
// because it is absence of material rather than absence of light.

import { describe, expect, it } from "vitest";
import { PALETTE } from "../../src/art/palette.js";
import { INDEXED_PALETTE, gridGet, paletteIndex, type PixelGrid } from "../../src/art/pixel.js";
import { OBJECT_ART, objectFaceIds } from "../../src/art/objects.js";
import { objectCarrierGrid, objectFaceGrid } from "../../src/art/objectset.js";
import { auditOf, base64, registerObjectSheetSuite, specOf } from "./objectsSuite.js";

registerObjectSheetSuite({
  file: "cable_trough.png",
  columns: [
    { from: 4, to: 4 },
    { from: 16, to: 432 },
    { from: 443, to: 443 },
  ],
  rows: [
    { from: 4, to: 4 },
    { from: 16, to: 144 },
    { from: 155, to: 155 },
    { from: 168, to: 199 },
  ],
  guides: 216,
  swatches: [
    PALETTE["soot-800"],
    PALETTE["soot-700"],
    PALETTE["soot-500"],
    PALETTE["umber-700"],
    PALETTE["amber-700"],
    PALETTE["amber-500"],
  ],
  // The recess step the main spends on its column. The trough's brief keeps the
  // flanks in the tray's own dark umber instead, so this swatch is offered and
  // never used. Reported, not repaired (C.8.2).
  swatchedUnused: [PALETTE["amber-700"]],
  cells: [
    { face: "top", opaque: 128 * 128 },
    { face: "cap", opaque: 128 * 128 },
    { face: "long", opaque: 128 * 32 },
  ],
});

registerObjectSheetSuite({
  file: "severed_span.png",
  columns: [
    { from: 11, to: 11 },
    { from: 16, to: 287 },
    { from: 292, to: 292 },
  ],
  rows: [
    { from: 11, to: 11 },
    { from: 16, to: 143 },
    { from: 148, to: 148 },
    { from: 168, to: 199 },
  ],
  guides: 144,
  swatches: [
    PALETTE["soot-900"],
    PALETTE["umber-900"],
    PALETTE["soot-800"],
    PALETTE["umber-700"],
    PALETTE["soot-700"],
    PALETTE["soot-500"],
    PALETTE["soot-300"],
  ],
  swatchedUnused: [],
  cells: [
    { face: "top", state: "severed", opaque: 128 * 128 },
    { face: "top", state: "unpowered", opaque: 128 * 128 },
  ],
});

const AMBER_500 = paletteIndex(PALETTE["amber-500"]);

describe("cable trough audit, as delivered", () => {
  it("pins the colour count of every cell", () => {
    expect(objectFaceIds(OBJECT_ART["cable-trough"]).map((face) => auditOf("cable-trough", face).colorCount)).toEqual(
      [4, 4, 5, 5],
    );
    expect(auditOf("cable-trough", "top", "severed").colorCount).toBe(7);
  });

  it("runs one pure filament, one game pixel wide, dead centre and unbroken", () => {
    // §2: four master columns all pure `#d98a1b`, aligned to the 4px game grid, so
    // the reduction lands one pure amber column and nothing half-lit beside it.
    const top = auditOf("cable-trough", "top");
    expect(top.column.columns).toEqual([16]);
    expect(top.column.rows).toBe(32);
    expect(top.column.continuous).toBe(true);
    expect([top.amberPixels, top.amberBudget]).toEqual([32, 40]);
    expect(top.amberShare).toBeCloseTo(0.03125, 5);
    expect(top.colors).toContain(PALETTE["amber-500"]);
    expect(top.colors).not.toContain(PALETTE["amber-300"]);
    expect(top.colors).not.toContain(PALETTE["amber-glow"]);
  });

  it("tiles the run top head to tail: every row of the cell is the same row", () => {
    // A run is up to three of this cell in a line, and a seam or a findable
    // landmark becomes wallpaper. Rows identical is the strongest form of that:
    // the filament crosses the tile boundary because there is nothing to cross.
    const grid = objectFaceGrid("cable-trough", "top");
    const first = [...grid.data.subarray(0, grid.width)];
    for (let y = 1; y < grid.height; y += 1) {
      expect([...grid.data.subarray(y * grid.width, (y + 1) * grid.width)], `row ${y}`).toEqual(first);
    }
    expect(first[16]).toBe(AMBER_500);
    expect(first.filter((index) => index === AMBER_500)).toHaveLength(1);
  });

  it("keeps the flanks of the channel cold so nothing averages into the filament", () => {
    // §2 is explicit: the recess either side stays in the tray's own dark umber and
    // its shadow, never amber. Under 4:1 a warm flank would bleed into the one
    // pixel that means "live".
    const grid = objectFaceGrid("cable-trough", "top");
    for (let x = 0; x < grid.width; x += 1) {
      if (x === 16) continue;
      const hex = INDEXED_PALETTE[gridGet(grid, x, 0)];
      expect([PALETTE["soot-800"], PALETTE["soot-700"], PALETTE["soot-500"], PALETTE["umber-700"]], `x ${x}`)
        .toContain(hex);
    }
  });

  it("passes the filament under the gland box on the cap, and nowhere else", () => {
    // Cell B is the run's box: a cover plate over the channel with the filament
    // going under it and out the other side, which is why its carrier is 23 rows of
    // 32 and is not asked to be continuous.
    const cap = auditOf("cable-trough", "cap");
    expect(cap.column.columns).toEqual([16]);
    expect(cap.column.rows).toBe(23);
    expect(cap.column.continuous).toBe(false);
    expect(specOf("cable-trough", "cap").amberColumn).toBe(false);
    expect([cap.amberPixels, cap.amberBudget]).toEqual([23, 40]);
    expect(cap.warnings).toEqual([]);
  });

  it("leaves the lip dark, and answers both sides of the run with it", () => {
    // Eight horizontal bands, uniform across the cell, which is what lets one
    // delivered cell be the run's flank and its end alike.
    const grid = objectFaceGrid("cable-trough", "long");
    expect([grid.width, grid.height]).toEqual([32, 8]);
    for (let y = 0; y < grid.height; y += 1) {
      const row = new Set(grid.data.subarray(y * grid.width, (y + 1) * grid.width));
      expect(row.size, `row ${y}`).toBe(1);
    }
    for (const face of ["long", "end"] as const) {
      const audit = auditOf("cable-trough", face);
      expect(audit.amberPixels, face).toBe(0);
      expect(audit.colorCount, face).toBe(4);
      expect(specOf("cable-trough", face).amber, face).toBe(false);
    }
    expect(base64(objectFaceGrid("cable-trough", "end"))).toBe(base64(objectFaceGrid("cable-trough", "long")));
  });

  it("shows no copper-500 anywhere: a trough is not operable", () => {
    for (const face of objectFaceIds(OBJECT_ART["cable-trough"])) {
      expect(auditOf("cable-trough", face).control.pixels, face).toBe(0);
    }
    expect(auditOf("cable-trough", "top", "severed").control.pixels).toBe(0);
  });
});

describe("the severed span: §4 as a state of §2", () => {
  it("carries no amber and no copper at all — a cut span is not live", () => {
    const severed = auditOf("cable-trough", "top", "severed");
    expect(severed.amberPixels).toBe(0);
    expect(severed.control.pixels).toBe(0);
    expect(severed.column.rows).toBe(0);
    for (const hex of [
      PALETTE["amber-900"],
      PALETTE["amber-700"],
      PALETTE["amber-500"],
      PALETTE["amber-300"],
      PALETTE["amber-glow"],
      PALETTE["copper-500"],
    ]) {
      expect(severed.colors, hex).not.toContain(hex);
    }
    expect(objectCarrierGrid("cable-trough", "top", "severed")).toBeNull();
  });

  it("reads as absence of material: torn bright metal and a black gap", () => {
    // §4's whole job is that severed and dark are not confused, and the separation
    // is material and not light. Two colours no other trough cell spends carry it.
    const severed = auditOf("cable-trough", "top", "severed");
    expect(severed.colors).toContain(PALETTE["soot-300"]);
    expect(severed.colors).toContain(PALETTE["soot-900"]);
    expect(severed.colors).toContain(PALETTE["umber-900"]);
    for (const face of objectFaceIds(OBJECT_ART["cable-trough"])) {
      expect(auditOf("cable-trough", face).colors, face).not.toContain(PALETTE["soot-300"]);
      expect(auditOf("cable-trough", face).colors, face).not.toContain(PALETTE["soot-900"]);
    }
  });

  it("is the dead run with material missing, not the dead run recoloured", () => {
    const dead = objectFaceGrid("cable-trough", "top", "unpowered");
    const broken = objectFaceGrid("cable-trough", "top", "severed");
    expect([broken.width, broken.height]).toEqual([dead.width, dead.height]);
    let moved = 0;
    for (let i = 0; i < dead.data.length; i += 1) if (dead.data[i] !== broken.data[i]) moved += 1;
    // The only pixels a substitution can move are the ones the amber ramp
    // occupies: 32 on this cell, one column of the run. The break moves 160, five
    // times as many, and into colours no amber step maps to — which is why it has
    // to be a second painting and not a state of the first.
    const live = objectFaceGrid("cable-trough", "top");
    let amber = 0;
    for (const index of live.data) if (index === AMBER_500) amber += 1;
    expect(amber).toBe(32);
    expect(moved).toBe(160);
  });

  it("takes the light out of the run without moving anything else", () => {
    // §4 cell B: the same channel, unlit, its centre line in `soot-700` where the
    // amber was, so a splice can put it back and the player can see it is the same
    // run. The engine's own unpowered substitution says exactly that, and the
    // suite above pins that the artist's cell is the same 1024 pixels.
    const live = objectFaceGrid("cable-trough", "top");
    const dead = objectFaceGrid("cable-trough", "top", "unpowered");
    const soot700 = paletteIndex(PALETTE["soot-700"]);
    for (let i = 0; i < live.data.length; i += 1) {
      if (live.data[i] === AMBER_500) expect(dead.data[i], `px ${i}`).toBe(soot700);
      else expect(dead.data[i], `px ${i}`).toBe(live.data[i]);
    }
    expect(objectCarrierGrid("cable-trough", "top", "unpowered")).toBeNull();
  });

  it("lights the filament as its own source while the run is live", () => {
    const mask = objectCarrierGrid("cable-trough", "top", "powered") as PixelGrid;
    let lit = 0;
    for (const index of mask.data) {
      if (index === 0) continue;
      lit += 1;
      expect(index).toBe(AMBER_500);
    }
    // One column of 32, which is the whole point: the line either runs the whole
    // way or does not run at all.
    expect(lit).toBe(32);
  });
});
