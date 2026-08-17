// Wave 1 map-object intake (ART_DIRECTION §6, D.6, `art-src/OBJECT_BRIEFS.md`).
//
// The same three things `tiles.test.ts` locks down for the ground, for the
// machinery, and a fourth that only this set has:
//
//  1. **The cut is reproducible.** The three crop rects are hand-measured off one
//     delivered file, so the checks that keep them honest are automatic: an
//     opaque-run sweep finds the same content without being told where it is,
//     every rect is fenced by transparency on all four edges, every rect is
//     filled flush by its painting, and every opaque pixel on the sheet is
//     accounted for.
//  2. **The committed grids are what the tool produces.** The whole path is run
//     against the delivered PNG and compared byte for byte with
//     `src/art/masters/objects.ts`.
//  3. **The audit numbers are pinned.** Amber share, the carrier column, the
//     `copper-500` affordance and the `copper-300` reservation are what §6 makes
//     binding and what a human cannot count by eye.
//  4. **The state substitution is a substitution.** §6's unpowered row is the
//     powered painting with the light taken out and *nothing else moved*, which is
//     the whole reason the player learns that the seam is the power indicator. A
//     test can hold that exactly: every non-amber pixel must be untouched and
//     every amber pixel must have changed.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { quantizeGrid, resampleRGBA, type RGBASource } from "../../src/art/ingest.js";
import * as MASTERS from "../../src/art/masters/objects.js";
import { PALETTE, RAMPS } from "../../src/art/palette.js";
import { decodePNG } from "../../src/art/png.js";
import { cloneGrid, gridGet, gridSet, paletteIndex, type PixelGrid } from "../../src/art/pixel.js";
import {
  MAX_OBJECT_COLORS,
  OBJECT_AMBER_SHARE,
  OBJECT_ART,
  OBJECT_ART_IDS,
  OBJECT_FACE_IDS,
  OBJECT_MASTER_SCALE,
  OBJECT_POWER_STATES,
  OBJECT_TEXELS_PER_UNIT,
  auditObjectFace,
  faceInState,
  objectArtFor,
  type ObjectFaceId,
} from "../../src/art/objects.js";
import {
  FLUX_MAIN_PALETTE_STRIP,
  FLUX_MAIN_SHEET_CELLS,
  cutObjectSheet,
  findObjectSheetContent,
} from "../../src/art/objectSheet.js";
import { objectCarrierGrid, objectFaceGrid, objectFaceLevels } from "../../src/art/objectset.js";
import { HEIGHT_STEP_PX, TILE_TEXTURE_SIZE } from "../../src/art/sprites.js";

const SHEET = resolve(import.meta.dirname, "../../art-src/flux_main.png");
const sheet = decodePNG(readFileSync(SHEET));
const spec = OBJECT_ART["flux-main"];

/** The shipped path, start to finish, exactly as `tools/ingest-objects.ts` runs it. */
const ingest = (image: RGBASource, face: ObjectFaceId): PixelGrid => {
  const faceSpec = spec.faces[face];
  const shipped = resampleRGBA(image, faceSpec.width, faceSpec.height);
  return quantizeGrid(shipped, { allowed: faceSpec.allowed, alphaThreshold: 127 }).grid;
};

const cut = cutObjectSheet(sheet);
const cellFor = (face: ObjectFaceId) => cut.cells.find((c) => c.face === face) as (typeof cut.cells)[number];
const auditOf = (face: ObjectFaceId) => auditObjectFace(objectFaceGrid("flux-main", face), "flux-main", spec.faces[face]);

describe("the object set's one ruler", () => {
  it("spends the same texels per world unit as the ground plane", () => {
    expect(OBJECT_TEXELS_PER_UNIT).toBe(TILE_TEXTURE_SIZE);
    // A height step is half a world unit, so its texel count doubles to the same.
    expect(HEIGHT_STEP_PX * 2).toBe(OBJECT_TEXELS_PER_UNIT);
  });

  it("lands the flux main on the brief's own table of face sizes", () => {
    // OBJECT_BRIEFS §1: A long side 64 x 48, B short end 32 x 48, C top 32 x 64,
    // for a 1 x 2 tile footprint standing 1.5 world units. The spec derives these
    // from the massing; this is the independent statement of what it must derive.
    expect([spec.along, spec.across, spec.heightUnits]).toEqual([2, 1, 1.5]);
    expect([spec.faces.long.width, spec.faces.long.height]).toEqual([64, 48]);
    expect([spec.faces.end.width, spec.faces.end.height]).toEqual([32, 48]);
    expect([spec.faces.top.width, spec.faces.top.height]).toEqual([32, 64]);
  });

  it("sizes every face off its object's own footprint and height", () => {
    for (const id of OBJECT_ART_IDS) {
      const art = OBJECT_ART[id];
      const px = OBJECT_TEXELS_PER_UNIT;
      expect([art.faces.long.width, art.faces.long.height], `${id} long`).toEqual([
        art.along * px,
        art.heightUnits * px,
      ]);
      expect([art.faces.end.width, art.faces.end.height], `${id} end`).toEqual([
        art.across * px,
        art.heightUnits * px,
      ]);
      expect([art.faces.top.width, art.faces.top.height], `${id} top`).toEqual([
        art.across * px,
        art.along * px,
      ]);
    }
  });

  it("puts the copper-500 affordance on exactly one face of an operable object", () => {
    for (const id of OBJECT_ART_IDS) {
      const art = OBJECT_ART[id];
      const controls = OBJECT_FACE_IDS.filter((face) => art.faces[face].control);
      expect(controls.length, `${id} control faces`).toBe(art.operable ? 1 : 0);
    }
  });

  it("gives the carrier column to at most one face, and only where a main has one", () => {
    for (const id of OBJECT_ART_IDS) {
      const columns = OBJECT_FACE_IDS.filter((face) => OBJECT_ART[id].faces[face].amberColumn);
      expect(columns.length, `${id} column faces`).toBeLessThanOrEqual(1);
    }
    expect(OBJECT_FACE_IDS.filter((f) => spec.faces[f].amberColumn)).toEqual(["long"]);
  });

  it("answers only spriteIds with delivered art", () => {
    expect(objectArtFor("flux-main")).toBe(spec);
    for (const unpainted of ["switch-board", "gantry-grate", "hydraulic-press", "switch-lever"]) {
      expect(objectArtFor(unpainted), unpainted).toBeNull();
    }
  });
});

describe("object sheet cell location", () => {
  it("reads the delivered sheet at its stated size", () => {
    expect([sheet.width, sheet.height]).toEqual([576, 328]);
  });

  it("finds the sheet's content runs without being told where the cells are", () => {
    const content = findObjectSheetContent(sheet);
    expect(content.columns).toEqual([
      { from: 4, to: 12 },
      { from: 16, to: 415 },
      { from: 420, to: 428 },
      { from: 432, to: 559 },
      { from: 564, to: 572 },
    ]);
    expect(content.rows).toEqual([
      { from: 4, to: 12 },
      { from: 16, to: 271 },
      { from: 276, to: 284 },
      { from: 288, to: 311 },
    ]);
  });

  it("declares three cells at exactly the brief's 4x sizes", () => {
    expect(FLUX_MAIN_SHEET_CELLS).toHaveLength(3);
    for (const cell of FLUX_MAIN_SHEET_CELLS) {
      const faceSpec = OBJECT_ART[cell.sprite].faces[cell.face];
      expect([cell.rect.w, cell.rect.h], cell.face).toEqual([
        faceSpec.width * OBJECT_MASTER_SCALE,
        faceSpec.height * OBJECT_MASTER_SCALE,
      ]);
    }
    expect(FLUX_MAIN_SHEET_CELLS.map((c) => [c.face, c.rect.x, c.rect.y])).toEqual([
      ["long", 16, 16],
      ["end", 288, 16],
      ["top", 432, 16],
    ]);
  });

  it("fences every cell with transparency and fills every cell flush", () => {
    for (const cell of cut.cells) {
      expect(cell.fence, cell.face).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
      expect(cell.fenceOk, cell.face).toBe(true);
      expect(cell.fillsRect, cell.face).toBe(true);
      // Alpha is binary on the whole delivery: no soft edge to resolve by guess.
      expect(cell.partialAlpha, cell.face).toBe(0);
    }
  });

  it("accounts for every opaque pixel: three cells, a swatch row, and the corner guides", () => {
    expect(cut.unaccountedOpaque).toBe(177);
  });

  it("reads a swatch row carrying exactly the colours the cells use", () => {
    expect(cut.swatches).toEqual([
      PALETTE["soot-800"],
      PALETTE["soot-700"],
      PALETTE["soot-500"],
      PALETTE["copper-700"],
      PALETTE["copper-500"],
      PALETTE["amber-700"],
      PALETTE["amber-500"],
      PALETTE["amber-300"],
      PALETTE["amber-glow"],
    ]);
    const used = new Set(OBJECT_FACE_IDS.flatMap((face) => auditOf(face).colors));
    expect([...used].sort()).toEqual([...cut.swatches].sort());
  });

  it("rejects a rect that is not the size the brief delivers", () => {
    expect(() =>
      cutObjectSheet(sheet, [{ sprite: "flux-main", face: "long", rect: { x: 16, y: 16, w: 255, h: 192 } }], null),
    ).toThrow(/the brief delivers 256x192/);
  });

  it("catches a rect off by one: the fence breaks and the fill goes slack", () => {
    const shifted = cutObjectSheet(
      sheet,
      [{ sprite: "flux-main", face: "long", rect: { x: 15, y: 16, w: 256, h: 192 } }],
      null,
    ).cells[0] as (typeof cut.cells)[number];
    expect(shifted.fenceOk).toBe(false);
    expect(shifted.fillsRect).toBe(false);
  });

  it("cuts the same pixels twice", () => {
    const again = cutObjectSheet(sheet);
    for (const face of OBJECT_FACE_IDS) {
      expect([...cellFor(face).image.data]).toEqual([...(again.cells.find((c) => c.face === face) as (typeof cut.cells)[number]).image.data]);
    }
  });

  it("declares the swatch row as reference, outside every cell", () => {
    const strip = FLUX_MAIN_PALETTE_STRIP.rect;
    for (const cell of FLUX_MAIN_SHEET_CELLS) {
      const overlaps =
        strip.x < cell.rect.x + cell.rect.w &&
        cell.rect.x < strip.x + strip.w &&
        strip.y < cell.rect.y + cell.rect.h &&
        cell.rect.y < strip.y + strip.h;
      expect(overlaps, cell.face).toBe(false);
    }
  });
});

describe("object intake determinism", () => {
  const BASE64: Record<ObjectFaceId, string> = {
    long: MASTERS.FLUX_MAIN_LONG_BASE64,
    end: MASTERS.FLUX_MAIN_END_BASE64,
    top: MASTERS.FLUX_MAIN_TOP_BASE64,
  };

  it("reproduces every committed grid byte for byte from the delivered PNG", () => {
    for (const face of OBJECT_FACE_IDS) {
      const grid = ingest(cellFor(face).image, face);
      expect(Buffer.from(grid.data).toString("base64"), face).toBe(BASE64[face]);
    }
  });

  it("reduces 4:1 with nothing to quantize and nothing ambiguous", () => {
    // The one delivery in the set that meets C.8.2's bar literally: the art is
    // already palette-exact at 4x, so the box filter is lossless and the
    // `ambiguous` list is empty rather than merely small.
    for (const face of OBJECT_FACE_IDS) {
      const faceSpec = spec.faces[face];
      const shipped = resampleRGBA(cellFor(face).image, faceSpec.width, faceSpec.height);
      const { stats } = quantizeGrid(shipped, { allowed: faceSpec.allowed, alphaThreshold: 127 });
      expect(stats.movedCount, face).toBe(0);
      expect(stats.ambiguous, face).toEqual([]);
      expect(stats.opaqueCount, face).toBe(faceSpec.width * faceSpec.height);
    }
  });

  it("ships every face at the size the brief fixes, fully opaque", () => {
    for (const face of OBJECT_FACE_IDS) {
      const grid = objectFaceGrid("flux-main", face);
      expect([grid.width, grid.height], face).toEqual([spec.faces[face].width, spec.faces[face].height]);
      expect(auditOf(face).transparentPixels, face).toBe(0);
    }
  });

  it("has a base64 constant for every face and no others", () => {
    expect(Object.keys(MASTERS).sort()).toEqual(
      OBJECT_FACE_IDS.map((face) => `FLUX_MAIN_${face.toUpperCase()}_BASE64`).sort(),
    );
  });
});

describe("flux main audit, as delivered", () => {
  it("conforms on all three faces", () => {
    for (const face of OBJECT_FACE_IDS) {
      const audit = auditOf(face);
      expect(audit.ok, `${face}: ${audit.errors.join("; ")}`).toBe(true);
    }
  });

  it("pins the colour count of every face", () => {
    expect(OBJECT_FACE_IDS.map((face) => auditOf(face).colorCount)).toEqual([8, 4, 7]);
    for (const face of OBJECT_FACE_IDS) {
      expect(auditOf(face).colorCount, face).toBeLessThanOrEqual(MAX_OBJECT_COLORS);
    }
  });

  it("spends amber inside the budget on the two faces that carry any", () => {
    const long = auditOf("long");
    expect([long.amberPixels, long.amberBudget]).toEqual([96, 122]);
    expect(long.amberShare).toBeCloseTo(0.03125, 5);
    expect(long.amberShare).toBeLessThan(OBJECT_AMBER_SHARE);

    expect(auditOf("end").amberPixels).toBe(0);
    const top = auditOf("top");
    expect(top.amberPixels).toBe(16);
    expect(top.amberShare).toBeLessThan(OBJECT_AMBER_SHARE);
  });

  it("runs a continuous carrier column the full height of the long face, and nowhere else", () => {
    const long = auditOf("long");
    expect(long.column.rows).toBe(spec.faces.long.height);
    expect(long.column.continuous).toBe(true);
    // Two game pixels wide: a recess and a body, dead centre of the 2-tile run.
    expect(long.column.columns).toEqual([31, 32]);
    expect(auditOf("end").column.rows).toBe(0);
    expect(auditOf("top").column.continuous).toBe(false);
  });

  it("carries one copper-500 handle, low on the long face, and none anywhere else", () => {
    const long = auditOf("long");
    expect(long.control.pixels).toBe(26);
    expect(long.control.clusters).toBe(1);
    expect(long.control.rows).toEqual({ from: 33, to: 40 });
    expect(long.control.reachable).toBe(true);
    expect(auditOf("end").control.pixels).toBe(0);
    expect(auditOf("top").control.pixels).toBe(0);
  });

  it("spends copper-300 nowhere: the rail head specular is not this object's", () => {
    for (const face of OBJECT_FACE_IDS) expect(auditOf(face).copper300Pixels, face).toBe(0);
  });

  it("keeps every reserved signal ramp off the machinery", () => {
    for (const face of OBJECT_FACE_IDS) {
      expect(auditOf(face).reservedPixels, face).toBe(0);
      expect(auditOf(face).outsideRampPixels, face).toBe(0);
    }
  });

  it("reports the three amber-glow pixels drawn off the core", () => {
    // The brief puts the halo colour on core pixels only; the column's core is
    // drawn as intermittent ticks and three glow pixels land between them. A
    // warning, not an error — the intake reports and never repairs (C.8.2).
    expect(auditOf("long").glowOffCore).toBe(3);
    expect(auditOf("long").warnings).toHaveLength(1);
    expect(auditOf("end").glowOffCore).toBe(0);
    expect(auditOf("top").glowOffCore).toBe(0);
  });
});

describe("what the object audit would reject", () => {
  const poison = (face: ObjectFaceId, x: number, y: number, hex: string): PixelGrid => {
    const grid = cloneGrid(objectFaceGrid("flux-main", face));
    gridSet(grid, x, y, paletteIndex(hex as `#${string}`));
    return grid;
  };

  it("fails a copper-500 pixel on a face with no authored control", () => {
    const audit = auditObjectFace(poison("end", 4, 4, PALETTE["copper-500"]), "flux-main", spec.faces.end);
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/copper-500 pixels on a face with no authored control/);
  });

  it("fails an operable object whose control face lost its handle", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "long"));
    const handle = paletteIndex(PALETTE["copper-500"]);
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        if (gridGet(grid, x, y) === handle) gridSet(grid, x, y, paletteIndex(PALETTE["copper-700"]));
      }
    }
    const audit = auditObjectFace(grid, "flux-main", spec.faces.long);
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/no copper-500 handle/);
  });

  it("fails a copper-300 specular anywhere on the set", () => {
    const audit = auditObjectFace(poison("top", 4, 4, PALETTE["copper-300"]), "flux-main", spec.faces.top);
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/copper-300/);
  });

  it("fails a broken carrier column", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "long"));
    for (const x of [31, 32]) gridSet(grid, x, 20, paletteIndex(PALETTE["soot-700"]));
    const audit = auditObjectFace(grid, "flux-main", spec.faces.long);
    expect(audit.ok).toBe(false);
    expect(audit.errors.join(" ")).toMatch(/the carrier column reaches 47\/48 rows/);
  });

  it("fails an over-budget amber and an amber on a face allowed none", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "long"));
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < 8; x += 1) gridSet(grid, x, y, paletteIndex(PALETTE["amber-500"]));
    }
    expect(auditObjectFace(grid, "flux-main", spec.faces.long).errors.join(" ")).toMatch(/budget is 122/);

    const dark = { ...spec.faces.end, amber: false };
    const lit = poison("end", 4, 4, PALETTE["amber-500"]);
    expect(auditObjectFace(lit, "flux-main", dark).errors.join(" ")).toMatch(/amber means live/);
  });

  it("warns when a face is over the colour ceiling", () => {
    const grid = cloneGrid(objectFaceGrid("flux-main", "end"));
    const extras = [
      PALETTE["soot-900"],
      PALETTE["soot-300"],
      PALETTE["soot-100"],
      PALETTE["umber-700"],
      PALETTE["umber-500"],
    ];
    extras.forEach((hex, i) => gridSet(grid, i, 0, paletteIndex(hex)));
    const audit = auditObjectFace(grid, "flux-main", spec.faces.end);
    expect(audit.colorCount).toBe(9);
    expect(audit.warnings.join(" ")).toMatch(/9 colours, the brief's ceiling is 8/);
  });
});

describe("§6's states on a painted face", () => {
  const AMBER = new Set(RAMPS.amber.map((hex) => paletteIndex(hex)));

  it("leaves the powered painting exactly as delivered", () => {
    for (const face of OBJECT_FACE_IDS) {
      const grid = objectFaceGrid("flux-main", face);
      expect(faceInState(grid, "powered")).toBe(grid);
    }
  });

  it("moves the amber ramp and nothing else, in every state", () => {
    for (const state of OBJECT_POWER_STATES) {
      if (state === "powered") continue;
      const powered = objectFaceGrid("flux-main", "long");
      const other = objectFaceGrid("flux-main", "long", state);
      expect([other.width, other.height]).toEqual([powered.width, powered.height]);
      let changed = 0;
      for (let i = 0; i < powered.data.length; i += 1) {
        const from = powered.data[i] as number;
        const to = other.data[i] as number;
        if (AMBER.has(from)) {
          expect(to, `${state} at ${i}`).not.toBe(from);
          changed += 1;
        } else {
          expect(to, `${state} at ${i}`).toBe(from);
        }
      }
      expect(changed, state).toBe(96);
    }
  });

  it("takes every amber pixel out of an unpowered main — identical shapes, dead", () => {
    const audit = auditObjectFace(
      objectFaceGrid("flux-main", "long", "unpowered"),
      "flux-main",
      { ...spec.faces.long, amber: false, amberColumn: false },
    );
    expect(audit.amberPixels).toBe(0);
    expect(audit.colors).toContain(PALETTE["soot-700"]);
    // The handle is not a power indicator and does not go out with the light.
    expect(audit.control.pixels).toBe(26);
  });

  it("carries a bloom-eligible halo only where §6 gives the state one", () => {
    const glow = paletteIndex(PALETTE["amber-glow"]);
    const overloadCore = paletteIndex(PALETTE["overload-100"]);
    const countOf = (state: (typeof OBJECT_POWER_STATES)[number], index: number): number => {
      const grid = objectFaceGrid("flux-main", "long", state);
      let n = 0;
      for (let i = 0; i < grid.data.length; i += 1) if (grid.data[i] === index) n += 1;
      return n;
    };
    expect(countOf("powered", glow)).toBe(3);
    expect(countOf("unpowered", glow)).toBe(0);
    expect(countOf("destroyed", glow)).toBe(0);
    expect(countOf("overloading", glow)).toBe(0);
    // Overload moves the readout to its own ramp rather than putting it out.
    expect(countOf("overloading", overloadCore)).toBe(12);
  });

  it("lights the seam, its core and its halo, and leaves the recess a shadow", () => {
    // The half of §6 a diffuse texture cannot say: on a painted face the carrier
    // has to be its own light source or it is an ochre stripe at 62% shade.
    const powered = objectFaceGrid("flux-main", "long");
    const mask = objectCarrierGrid("flux-main", "long", "powered") as PixelGrid;
    const recess = paletteIndex(PALETTE["amber-700"]);
    let lit = 0;
    for (let i = 0; i < mask.data.length; i += 1) {
      const on = (mask.data[i] as number) !== 0;
      if (!on) continue;
      lit += 1;
      // Every lit texel is one the artist drew as seam, core or halo.
      expect(AMBER.has(powered.data[i] as number)).toBe(true);
      expect(powered.data[i]).not.toBe(recess);
      expect(mask.data[i]).toBe(powered.data[i]);
    }
    // One column of 48: the `amber-500` body with its core ticks and glow taps.
    expect(lit).toBe(48);
  });

  it("gives the carrier no light in the states §6 gives no halo, and none to a dark face", () => {
    expect(objectCarrierGrid("flux-main", "long", "unpowered")).toBeNull();
    expect(objectCarrierGrid("flux-main", "long", "destroyed")).toBeNull();
    expect(objectCarrierGrid("flux-main", "end", "powered")).toBeNull();
    const straining = objectCarrierGrid("flux-main", "long", "overloading") as PixelGrid;
    const violet = new Set([paletteIndex(PALETTE["overload-500"]), paletteIndex(PALETTE["overload-100"])]);
    let lit = 0;
    for (const index of straining.data) {
      if (index === 0) continue;
      lit += 1;
      expect(violet.has(index)).toBe(true);
    }
    expect(lit).toBe(48);
  });

  it("caches a state's grid rather than rebuilding it", () => {
    expect(objectFaceGrid("flux-main", "top", "unpowered")).toBe(
      objectFaceGrid("flux-main", "top", "unpowered"),
    );
  });
});

describe("object face mip chains", () => {
  it("runs every face down to 1x1, halving both axes", () => {
    for (const face of OBJECT_FACE_IDS) {
      const levels = objectFaceLevels("flux-main", face);
      const last = levels[levels.length - 1] as (typeof levels)[number];
      expect([last.width, last.height], face).toEqual([1, 1]);
      for (let i = 1; i < levels.length; i += 1) {
        const above = levels[i - 1] as (typeof levels)[number];
        const level = levels[i] as (typeof levels)[number];
        expect(level.width, `${face} level ${i}`).toBe(Math.max(1, above.width >> 1));
        expect(level.height, `${face} level ${i}`).toBe(Math.max(1, above.height >> 1));
      }
    }
  });

  it("keeps level 0 exactly the shipped grid, fully opaque", () => {
    for (const face of OBJECT_FACE_IDS) {
      const grid = objectFaceGrid("flux-main", face);
      const base = objectFaceLevels("flux-main", face)[0] as { width: number; height: number; data: Uint8ClampedArray };
      expect([base.width, base.height], face).toEqual([grid.width, grid.height]);
      for (let i = 3; i < base.data.length; i += 4) expect(base.data[i], face).toBe(255);
    }
  });
});
