// Wave 1 terrain intake (ART_DIRECTION §5, D.4, `art-src/TERRAIN_BRIEFS.md`).
//
// Three things are worth locking down here and they are different in kind:
//
//  1. **The cut is reproducible.** The nine crop rects are hand-measured off one
//     delivered file, so the check that keeps them honest is the automatic one:
//     the frame sweep finds the same nine boxes, and every rect is fenced by the
//     inset line on all four edges.
//  2. **The committed grids are what the tool produces.** The whole path is run
//     against the delivered PNG and compared byte for byte with
//     `src/art/masters/tiles.ts`. That is what makes the base64 in that file
//     data rather than a claim.
//  3. **The audit numbers are pinned.** Seam ratios, colour counts and strata
//     bands are the delivery's report card. Pinning them means a change in the
//     art or in the reducer has to be looked at, which is the point — the intake
//     reports and never repairs (C.8.2).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { quantizeGrid, resampleRGBA, type RGBASource } from "../../src/art/ingest.js";
import * as MASTERS from "../../src/art/masters/tiles.js";
import { PALETTE, RAMPS, type Hex } from "../../src/art/palette.js";
import { decodePNG } from "../../src/art/png.js";
import { cloneGrid, createGrid, gridGet, paletteIndex, type PixelGrid } from "../../src/art/pixel.js";
import {
  MAX_TILE_COLORS,
  SEAM_RATIO_LIMIT,
  STRATA_BAND_ROWS,
  TILE_MASTER_SCALE,
  TILE_TEXTURE,
  TILE_TEXTURE_IDS,
  auditTile,
  tileTextureFor,
  type TileAudit,
  type TileTextureId,
} from "../../src/art/tiles.js";
import { TERRAIN_SHEET_CELLS, cutTerrainSheet, findSheetFrames } from "../../src/art/tileIntake.js";
import { tileGrid, tileTextureLevels } from "../../src/art/tileset.js";

const SHEET = resolve(import.meta.dirname, "../../art-src/greyfall_terrain.png");
const sheet = decodePNG(readFileSync(SHEET));

/** The shipped path, start to finish, exactly as `tools/ingest-tiles.ts` runs it. */
const ingest = (image: RGBASource, id: TileTextureId): PixelGrid => {
  const spec = TILE_TEXTURE[id];
  const master = resampleRGBA(image, spec.width * TILE_MASTER_SCALE, spec.height * TILE_MASTER_SCALE);
  const shipped = resampleRGBA(master, spec.width, spec.height);
  return quantizeGrid(shipped, { allowed: spec.allowed, alphaThreshold: 127 }).grid;
};

describe("terrain sheet cell location", () => {
  it("reads the delivered sheet at its stated size", () => {
    expect([sheet.width, sheet.height]).toEqual([1535, 1024]);
  });

  it("finds the two bands of cell boxes and their dividing rules", () => {
    const frames = findSheetFrames(sheet);

    expect(frames.tops).toMatchObject({ top: 170, bottom: 541 });
    expect(frames.tops.dividers).toEqual([17, 314, 609, 919, 1210, 1518]);
    expect(frames.sides).toMatchObject({ top: 583, bottom: 880 });
    expect(frames.sides.dividers).toEqual([17, 364, 733, 1119, 1518]);
  });

  it("declares nine cells, five tops and four sides, one per tile texture", () => {
    expect(TERRAIN_SHEET_CELLS).toHaveLength(9);
    expect(TERRAIN_SHEET_CELLS.map((c) => c.id).sort()).toEqual([...TILE_TEXTURE_IDS].sort());
    expect(TERRAIN_SHEET_CELLS.filter((c) => c.band === "tops")).toHaveLength(5);
    expect(TERRAIN_SHEET_CELLS.filter((c) => c.band === "sides")).toHaveLength(4);
  });

  it("crops inside the frame on all four edges of all nine cells", () => {
    for (const cell of cutTerrainSheet(sheet).cells) {
      expect(cell.insetOk, `${cell.id} ${JSON.stringify(cell.insetMargin)}`).toBe(true);
      expect(cell.rect.x).toBeGreaterThan(cell.box.x0);
      expect(cell.rect.x + cell.rect.w - 1).toBeLessThan(cell.box.x1);
    }
  });

  it("cuts the tops on one row band and the sides on another", () => {
    const cells = cutTerrainSheet(sheet).cells;
    const tops = cells.filter((c) => TILE_TEXTURE[c.id].face === "top");
    const sides = cells.filter((c) => TILE_TEXTURE[c.id].face === "side");

    expect(new Set(tops.map((c) => `${c.rect.y}+${c.rect.h}`))).toEqual(new Set(["204+270"]));
    expect(new Set(sides.map((c) => `${c.rect.y}+${c.rect.h}`))).toEqual(new Set(["618+185"]));
  });

  it("rejects a rect that has wandered out of its box", () => {
    expect(() =>
      cutTerrainSheet(sheet, [
        { id: "plain-top", band: "tops", box: 0, rect: { x: 29, y: 204, w: 400, h: 270 } },
      ]),
    ).toThrow(/not inside box/);
  });

  it("cuts the same pixels twice", () => {
    const a = cutTerrainSheet(sheet).cells;
    const b = cutTerrainSheet(sheet).cells;
    for (let i = 0; i < a.length; i += 1) {
      expect(Array.from((b[i] as (typeof b)[number]).image.data)).toEqual(
        Array.from((a[i] as (typeof a)[number]).image.data),
      );
    }
  });
});

describe("terrain intake determinism", () => {
  const cut = cutTerrainSheet(sheet);

  it("reproduces every committed grid byte for byte from the delivered PNG", () => {
    for (const cell of cut.cells) {
      const fresh = ingest(cell.image, cell.id);
      expect(Array.from(fresh.data), cell.id).toEqual(Array.from(tileGrid(cell.id).data));
    }
  });

  it("produces the same grid on a second run", () => {
    const first = ingest((cut.cells[0] as (typeof cut.cells)[number]).image, "plain-top");
    const second = ingest((cut.cells[0] as (typeof cut.cells)[number]).image, "plain-top");
    expect(Array.from(second.data)).toEqual(Array.from(first.data));
  });

  it("ships every face at the size §5 fixes", () => {
    for (const id of TILE_TEXTURE_IDS) {
      const spec = TILE_TEXTURE[id];
      const grid = tileGrid(id);
      expect([grid.width, grid.height], id).toEqual([spec.width, spec.height]);
    }
  });

  it("has a base64 constant for every texture and no others", () => {
    const exported = Object.keys(MASTERS).filter((key) => key.endsWith("_BASE64"));
    expect(exported).toHaveLength(TILE_TEXTURE_IDS.length);
  });
});

describe("terrain texture identity", () => {
  it("dresses rail sides in plain's cut face, and draws nothing for void", () => {
    expect(tileTextureFor("rail", "side")).toBe("plain-side");
    expect(tileTextureFor("rail", "top")).toBe("rail-top");
    expect(tileTextureFor("void", "top")).toBeNull();
    expect(tileTextureFor("void", "side")).toBeNull();
  });

  it("covers the five drawn terrain types and nothing more", () => {
    const drawn = ["plain", "rail", "rough", "water", "impassable"] as const;
    const ids = new Set(drawn.flatMap((t) => [tileTextureFor(t, "top"), tileTextureFor(t, "side")]));
    expect([...ids].sort()).toEqual([...TILE_TEXTURE_IDS].sort());
  });
});

describe("terrain audit, as delivered", () => {
  const audits = TILE_TEXTURE_IDS.map((id) => auditTile(tileGrid(id), TILE_TEXTURE[id]));
  const of = (id: TileTextureId) => audits.find((a) => a.id === id) as (typeof audits)[number];

  it("keeps amber and every reserved signal ramp off the ground plane", () => {
    for (const audit of audits) {
      expect(audit.amberPixels, audit.id).toBe(0);
      expect(audit.reservedPixels, audit.id).toBe(0);
      expect(audit.outsideRampPixels, audit.id).toBe(0);
    }
  });

  it("spends copper-300 nowhere — the rail head specular was not delivered", () => {
    for (const audit of audits) expect(audit.copper300Pixels, audit.id).toBe(0);
    // The rail top is the one face allowed it, and the one face that needed it.
    expect(TILE_TEXTURE["rail-top"].railMetal).toBe(true);
    expect(TILE_TEXTURE["rail-top"].allowed).toContain(PALETTE["copper-300"]);
    expect(of("rail-top").colors).not.toContain(PALETTE["copper-300"]);
    expect(RAMPS.copper.some((hex) => of("rail-top").colors.includes(hex))).toBe(false);
  });

  it("conforms on every delivered face", () => {
    for (const audit of audits) {
      expect(audit.ok, `${audit.id}: ${audit.errors.join("; ")}`).toBe(true);
    }
  });

  it("pins the colour count of every face, and every overage is declared per face", () => {
    expect(Object.fromEntries(audits.map((a) => [a.id, a.colorCount]))).toEqual({
      "plain-top": 3,
      "plain-side": 5,
      "impassable-top": 6,
      "impassable-side": 7,
      "rail-top": 7,
      "rough-top": 5,
      "rough-side": 6,
      "water-top": 4,
      "water-side": 6,
    });
    const over = audits.filter((a) => a.colorCount > MAX_TILE_COLORS).map((a) => a.id);
    expect(over).toEqual(["impassable-side", "rail-top"]);
    for (const audit of audits) {
      expect(TILE_TEXTURE[audit.id].colorCeiling, audit.id).toBe(over.includes(audit.id) ? 7 : undefined);
      expect(audit.colorCeiling, audit.id).toBe(over.includes(audit.id) ? 7 : MAX_TILE_COLORS);
    }
  });

  it("fails a face that goes over its ceiling, declared or not", () => {
    const extra = (id: TileTextureId, hexes: readonly Hex[]): TileAudit => {
      const grid = cloneGrid(tileGrid(id));
      hexes.forEach((hex, i) => {
        grid.data[i] = paletteIndex(hex);
      });
      return auditTile(grid, TILE_TEXTURE[id]);
    };
    // A seventh colour on a face with no declared raise, and an eighth on one
    // that declares seven: both are errors, so `ok` moves.
    const seventh = extra("impassable-top", [PALETTE["soot-900"]]);
    expect(seventh.colorCount).toBe(7);
    expect(seventh.ok).toBe(false);
    expect(seventh.errors.join(" ")).toMatch(/7 colours, the brief's ceiling is 6$/);

    const eighth = extra("rail-top", [PALETTE["copper-300"]]);
    expect(eighth.colorCount).toBe(8);
    expect(eighth.ok).toBe(false);
    expect(eighth.errors.join(" ")).toMatch(/8 colours, the brief's ceiling is 6 and this face declares 7/);
  });

  it("pins the wrap-edge measurements per face", () => {
    const round = (n: number) => Number(n.toFixed(2));
    expect(
      Object.fromEntries(
        audits.map((a) => [a.id, [round(a.seamHorizontal.ratio), round(a.seamVertical.ratio)]]),
      ),
    ).toEqual({
      "plain-top": [1.1, 2.6],
      "plain-side": [0.71, 5.49],
      "impassable-top": [1.47, 0.82],
      "impassable-side": [1.48, 2.79],
      "rail-top": [0.52, 0.33],
      "rough-top": [1.18, 1.27],
      "rough-side": [0.89, 5.33],
      "water-top": [2.06, 1.45],
      "water-side": [1.23, 5.87],
    });
  });

  it("names the two tops whose wrap the eye can find", () => {
    const tops = audits.filter((a) => TILE_TEXTURE[a.id].face === "top");
    const seamy = tops
      .filter((a) => a.seamHorizontal.ratio > SEAM_RATIO_LIMIT || a.seamVertical.ratio > SEAM_RATIO_LIMIT)
      .map((a) => a.id);
    expect(seamy).toEqual(["plain-top", "water-top"]);
  });

  it("does not hold a side face's vertical join against it: the cut line is that join", () => {
    for (const audit of audits) {
      const spec = TILE_TEXTURE[audit.id];
      if (spec.face !== "side") continue;
      expect(spec.wraps.vertical, audit.id).toBe(false);
      expect(audit.warnings.some((w) => w.includes("north/south wrap")), audit.id).toBe(false);
    }
  });

  it("finds the strata band drawn across the top rows of all four side faces", () => {
    for (const id of ["plain-side", "impassable-side", "rough-side", "water-side"] as const) {
      const audit = of(id);
      expect(audit.bandTop.rows, id).toEqual([0, 1]);
      // The delivery's captions say "strata band at bottom"; the paint says top.
      expect(audit.bandTop.lighterShare, id).toBe(1);
      expect(audit.bandBottom.lighterShare, id).toBe(0);
      expect(audit.bandTop.meanLuminance, id).toBeGreaterThan(audit.bandTop.bodyMeanLuminance);
    }
    expect(STRATA_BAND_ROWS).toBe(2);
  });

  it("records the band colour per face, and that none of them is soot-300", () => {
    expect(
      Object.fromEntries(
        audits
          .filter((a) => TILE_TEXTURE[a.id].face === "side")
          .map((a) => [a.id, [a.bandTop.flatRows, a.bandTop.colors.join(" ")]]),
      ),
    ).toEqual({
      "plain-side": [2, PALETTE["soot-500"]],
      "impassable-side": [0, `${PALETTE["soot-700"]} ${PALETTE["soot-500"]} ${PALETTE["umber-500"]}`],
      "rough-side": [2, PALETTE["umber-500"]],
      "water-side": [0, `${PALETTE["soot-700"]} ${PALETTE["soot-500"]}`],
    });
    for (const audit of audits) expect(audit.bandTop.cutLineShare, audit.id).toBe(0);
  });

  it("reports rough's unbroken band and impassable's unwanted one", () => {
    expect(of("rough-side").warnings).toContain(
      "strata band runs unbroken; rough ground's tell is a band broken into segments",
    );
    expect(of("impassable-side").warnings).toContain(
      "a cut line is showing on a face whose height must be uncountable",
    );
  });

  it("catches amber, an off-ramp colour and a copper-300 outside the rail", () => {
    const spec = TILE_TEXTURE["plain-top"];
    const grid = createGrid(spec.width, spec.height);
    grid.data.fill(paletteIndex(PALETTE["soot-500"]));
    grid.data[0] = paletteIndex(PALETTE["amber-500"]);
    grid.data[1] = paletteIndex(PALETTE["copper-300"]);
    const audit = auditTile(grid, spec);

    expect(audit.ok).toBe(false);
    expect(audit.amberPixels).toBe(1);
    expect(audit.copper300Pixels).toBe(1);
    expect(audit.outsideRampPixels).toBe(2);
    expect(audit.errors.join(" ")).toMatch(/amber/);
    expect(audit.errors.join(" ")).toMatch(/rail head/);
  });

  it("calls a hand-made seamless face seamless and a split one seamy", () => {
    const spec = TILE_TEXTURE["plain-top"];
    const flat = createGrid(spec.width, spec.height);
    flat.data.fill(paletteIndex(PALETTE["soot-500"]));
    for (let i = 0; i < flat.data.length; i += 7) flat.data[i] = paletteIndex(PALETTE["soot-700"]);
    expect(auditTile(flat, spec).seamHorizontal.mismatches).toBeLessThan(spec.height);

    const split = createGrid(spec.width, spec.height);
    for (let y = 0; y < spec.height; y += 1)
      for (let x = 0; x < spec.width; x += 1)
        split.data[y * spec.width + x] = paletteIndex(
          x < spec.width / 2 ? PALETTE["soot-900"] : PALETTE["soot-100"],
        );
    const audit = auditTile(split, spec);
    expect(audit.seamHorizontal.mismatches).toBe(spec.height);
    expect(audit.seamHorizontal.ratio).toBeGreaterThan(SEAM_RATIO_LIMIT);
  });
});

describe("tile mip chains", () => {
  it("runs every face down to 1x1, halving both axes", () => {
    for (const id of TILE_TEXTURE_IDS) {
      const levels = tileTextureLevels(id);
      const spec = TILE_TEXTURE[id];
      expect([levels[0]?.width, levels[0]?.height], id).toEqual([spec.width, spec.height]);
      const last = levels[levels.length - 1];
      expect([last?.width, last?.height], id).toEqual([1, 1]);
      levels.forEach((level, i) => {
        if (i === 0) return;
        const prev = levels[i - 1] as (typeof levels)[number];
        expect([level.width, level.height], `${id} level ${i}`).toEqual([
          Math.max(1, prev.width >> 1),
          Math.max(1, prev.height >> 1),
        ]);
        expect(level.data.length).toBe(level.width * level.height * 4);
      });
    }
  });

  it("keeps level 0 exactly the shipped grid, fully opaque", () => {
    const grid = tileGrid("plain-top");
    const level = tileTextureLevels("plain-top")[0] as { data: Uint8ClampedArray };
    for (let i = 0; i < grid.width * grid.height; i += 1) {
      expect(level.data[i * 4 + 3]).toBe(255);
      expect(gridGet(grid, i % grid.width, Math.floor(i / grid.width))).toBeGreaterThan(0);
    }
  });

  it("box-filters a level without reaching past an edge", () => {
    // Every dimension in the set is a power of two, so no 2x2 box ever straddles
    // a wrap edge and the reduction stays honest all the way down.
    for (const id of TILE_TEXTURE_IDS) {
      const spec = TILE_TEXTURE[id];
      expect(Number.isInteger(Math.log2(spec.width)), id).toBe(true);
      expect(Number.isInteger(Math.log2(spec.height)), id).toBe(true);
    }
  });
});
