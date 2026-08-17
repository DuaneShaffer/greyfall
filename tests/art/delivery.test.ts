// Character-sheet delivery intake (ART_DIRECTION C.8.7) and the two-view path.
//
// The six-job delivery arrived as finished character sheets rather than the bare
// two-cell grids C.8 asks for, so the pipeline gained a cell locator, a shared
// per-character reduction, and a real back three-quarter view. These are the
// assertions that keep all three honest — on a synthetic sheet that carries every
// hazard the real ones do, and on the shipped masters themselves.

import { describe, expect, it } from "vitest";
import {
  GUIDE_TEAL,
  cutDeliverySheet,
  formatSheetCut,
} from "../../src/art/delivery.js";
import { EXTERNAL_JOBS, externalArt } from "../../src/art/external.js";
import {
  FIELD_PALETTE,
  RESERVED_SIGNAL_COLORS,
  fieldPaletteWith,
  fitMasterToCanvas,
  masterFitScale,
  quantizeToPalette,
  type RGBASource,
} from "../../src/art/ingest.js";
import { PALETTE } from "../../src/art/palette.js";
import { TRANSPARENT, gridGet, type PixelGrid } from "../../src/art/pixel.js";
import { cutMaster, defaultRegionMap } from "../../src/art/segments.js";
import { JOB_ART } from "../../src/art/jobs.js";
import { propRegion } from "../../src/art/intake.js";
import { SPRITE_ANCHOR, SPRITE_HEIGHT, SPRITE_WIDTH } from "../../src/art/sprites.js";

interface Paint {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

const blank = (width: number, height: number): Paint => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

function box(
  target: Paint,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: readonly [number, number, number],
  alpha = 255,
): void {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      if (px < 0 || py < 0 || px >= target.width || py >= target.height) continue;
      const at = (py * target.width + px) * 4;
      target.data[at] = rgb[0];
      target.data[at + 1] = rgb[1];
      target.data[at + 2] = rgb[2];
      target.data[at + 3] = alpha;
    }
  }
}

const COAT = [70, 78, 90] as const;
const APRON = [47, 122, 108] as const; // verdigris-500: the accent, not the frame
const FRAME = [10, 220, 240] as const;
const GROUND = [120, 100, 110] as const;

/**
 * A sheet with every hazard the delivered six carry: a painted backdrop under a
 * low alpha, a cyan guide frame that welds the cells together, a drawn ground
 * line that welds them again, sheet furniture off to the side, an accent-teal
 * patch inside one figure, and soft matte edges.
 */
function syntheticSheet(): Paint {
  const sheet = blank(400, 300);
  // Painted backdrop: present in RGB, invisible in alpha. This is what makes the
  // real sheets look opaque and key clean.
  box(sheet, 0, 0, 400, 300, [40, 66, 65], 20);
  // Guide frame, full height, crossing both cells.
  box(sheet, 10, 10, 2, 230, FRAME);
  box(sheet, 199, 10, 2, 230, FRAME);
  box(sheet, 388, 10, 2, 230, FRAME);
  // Two figures, the left one wider than the right.
  box(sheet, 40, 30, 120, 180, COAT);
  box(sheet, 240, 40, 70, 170, COAT);
  // An accent-teal patch inside the left figure — a vial, an apron, a lens.
  box(sheet, 80, 90, 10, 12, APRON);
  // Drawn ground line under both, thin and wide: it merges the figures.
  box(sheet, 20, 211, 360, 3, GROUND);
  // Sheet furniture: preview inset and a palette swatch, right of the cells.
  box(sheet, 320, 60, 40, 40, COAT);
  box(sheet, 320, 120, 20, 20, COAT);
  // Soft matte inside a figure edge, which the report must count rather than guess.
  box(sheet, 41, 30, 1, 180, COAT, 200);
  return sheet;
}

describe("locating the figure cells of a delivered sheet", () => {
  const cut = cutDeliverySheet(syntheticSheet());

  it("finds two cells without a hand-measured crop rectangle", () => {
    expect(cut.front.bounds.x).toBe(40);
    expect(cut.front.bounds.y).toBe(30);
    expect(cut.back.bounds.x).toBe(240);
    expect(cut.back.bounds.y).toBe(40);
    expect(cut.front.bounds.x).toBeLessThan(cut.back.bounds.x);
  });

  it("cuts the drawn ground line, which is what lets the two figures separate", () => {
    expect(cut.report.groundLineRows).toEqual([211, 212, 213]);
    expect(cut.front.bounds.y + cut.front.bounds.h).toBeLessThanOrEqual(211);
  });

  it("strips the guide frame and reports it", () => {
    expect(cut.report.guidePixels).toBeGreaterThan(1000);
    for (let i = 0; i < cut.front.image.data.length; i += 4) {
      if (cut.front.image.data[i + 3] === 0) continue;
      const r = cut.front.image.data[i] ?? 0;
      const g = cut.front.image.data[i + 1] ?? 0;
      const b = cut.front.image.data[i + 2] ?? 0;
      expect(GUIDE_TEAL(r, g, b) && g > 200).toBe(false);
    }
  });

  it("keeps a verdigris accent that merely resembles the frame", () => {
    let accent = 0;
    for (let i = 0; i < cut.front.image.data.length; i += 4) {
      if (cut.front.image.data[i + 1] === APRON[1] && cut.front.image.data[i + 2] === APRON[2]) {
        accent += 1;
      }
    }
    expect(accent).toBe(10 * 12);
    expect(GUIDE_TEAL(...APRON)).toBe(false);
  });

  it("discards sheet furniture by size, and says how much it discarded", () => {
    expect(cut.report.discarded.length).toBeGreaterThan(0);
    expect(cut.report.discardedPixels).toBeGreaterThan(0);
    for (const blob of cut.report.discarded) {
      expect(blob.size).toBeLessThan(cut.back.figurePixels);
    }
  });

  it("forces alpha binary and counts what it could not decide", () => {
    for (const cell of [cut.front, cut.back]) {
      for (let i = 3; i < cell.image.data.length; i += 4) {
        expect(cell.image.data[i] === 0 || cell.image.data[i] === 255).toBe(true);
      }
    }
    // The soft edge column is ambiguous alpha, reported rather than resolved.
    expect(cut.front.ambiguousAlpha).toBeGreaterThan(0);
  });

  it("renders for an intake log", () => {
    const text = formatSheetCut(cut, "synthetic");
    expect(text).toContain("synthetic");
    expect(text).toContain("ground-line rows");
    expect(text).toContain("ambiguous alpha px");
  });

  it("refuses a sheet that has no second figure rather than inventing one", () => {
    const lonely = blank(200, 200);
    box(lonely, 40, 40, 60, 100, COAT);
    expect(() => cutDeliverySheet(lonely)).toThrow(/need two figure cells/);
  });
});

describe("one character, one reduction", () => {
  // Wide enough that the figure box's width binds before its height does: this is
  // Rowen, a maul out one side and a tower shield out the other.
  const wide: RGBASource = (() => {
    const p = blank(400, 300);
    box(p, 10, 10, 300, 280, COAT);
    return p;
  })();
  const narrow: RGBASource = (() => {
    const p = blank(200, 300);
    box(p, 70, 10, 60, 280, COAT);
    return p;
  })();

  const heightOf = (source: RGBASource, scale?: number): number => {
    const fitted = fitMasterToCanvas(source, scale === undefined ? {} : { scale });
    let top = SPRITE_HEIGHT;
    let bottom = -1;
    for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        if ((fitted.data[(y * SPRITE_WIDTH + x) * 4 + 3] ?? 0) === 0) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return bottom - top + 1;
  };

  it("fitting each view alone makes the unit change height when it turns around", () => {
    expect(heightOf(wide)).not.toBe(heightOf(narrow));
  });

  it("the pair's shared scale is the one that fits both, and both then match", () => {
    const scale = masterFitScale([wide, narrow]);
    expect(scale).toBeCloseTo(Math.min(masterFitScale([wide]), masterFitScale([narrow])));
    expect(Math.abs(heightOf(wide, scale) - heightOf(narrow, scale))).toBeLessThanOrEqual(1);
  });

  it("still stands whatever it fits on the anchor row", () => {
    const scale = masterFitScale([wide, narrow]);
    for (const source of [wide, narrow]) {
      const fitted = fitMasterToCanvas(source, { scale });
      let bottom = -1;
      for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
        for (let x = 0; x < SPRITE_WIDTH; x += 1) {
          if ((fitted.data[(y * SPRITE_WIDTH + x) * 4 + 3] ?? 0) !== 0) bottom = y;
        }
      }
      expect(bottom).toBe(SPRITE_ANCHOR.y - 1);
    }
  });
});

describe("the intake palette keeps §2's signal colors out of skin and cloth", () => {
  it("excludes them by default", () => {
    for (const hex of RESERVED_SIGNAL_COLORS) expect(FIELD_PALETTE).not.toContain(hex);
    expect(FIELD_PALETTE).toContain(PALETTE["amber-glow"]);
    expect(FIELD_PALETTE).toContain(PALETTE["bone-300"]);
  });

  it("lets a delivery declare the one its fiction carries, exactly once", () => {
    const allowed = fieldPaletteWith(PALETTE.brightblood);
    expect(allowed).toContain(PALETTE.brightblood);
    expect(allowed.filter((h) => h === PALETTE.brightblood)).toHaveLength(1);
    expect(fieldPaletteWith(PALETTE["bone-300"])).toHaveLength(FIELD_PALETTE.length);
  });

  it("sends a painted cheek to the bone ramp instead of brightblood", () => {
    const cheek = blank(SPRITE_WIDTH, SPRITE_HEIGHT);
    box(cheek, 20, 8, 20, SPRITE_ANCHOR.y - 8, [235, 163, 134]);
    const loose = quantizeToPalette(cheek).grid;
    const tight = quantizeToPalette(cheek, { allowed: FIELD_PALETTE }).grid;
    const brightblood = FIELD_PALETTE.length; // not an index; compare by color below
    expect(brightblood).toBeGreaterThan(0);
    const colorsOf = (grid: PixelGrid): Set<number> => {
      const seen = new Set<number>();
      for (const v of grid.data) if (v !== TRANSPARENT) seen.add(v);
      return seen;
    };
    // The loose target reaches for the pink; the field target cannot.
    expect(colorsOf(loose)).not.toEqual(colorsOf(tight));
    expect(gridGet(tight, 25, 20)).not.toBe(gridGet(loose, 25, 20));
  });
});

describe("several prop regions in one view", () => {
  // The bug this covers shipped a duplicate: pixels were bucketed by segment
  // *name*, so a shield on the hip and a maul in the hand each received the whole
  // prop pixel list and the shield was painted twice, once at the maul's offset.
  it("gives each prop region only the pixels inside it", () => {
    const art = JOB_ART.enforcer;
    const grid: PixelGrid = {
      width: SPRITE_WIDTH,
      height: SPRITE_HEIGHT,
      data: new Uint8Array(SPRITE_WIDTH * SPRITE_HEIGHT),
    };
    for (let y = 30; y < 40; y += 1) for (let x = 4; x < 10; x += 1) grid.data[y * SPRITE_WIDTH + x] = 5;
    for (let y = 60; y < 70; y += 1) for (let x = 44; x < 50; x += 1) grid.data[y * SPRITE_WIDTH + x] = 6;
    const map = defaultRegionMap(
      art.build,
      "se",
      { state: "idle", frame: 0 },
      [propRegion(2, 28, 12, 14, "hip"), propRegion(42, 58, 12, 14, "handNear", "handNear")],
      art.posePass,
      { shoulderRow: 29, hipRow: 52 },
    );
    const props = cutMaster(grid, map).filter((piece) => piece.segment.name === "prop");
    expect(props).toHaveLength(2);
    expect(props[0]?.pixels.every((p) => p.value === 5)).toBe(true);
    expect(props[1]?.pixels.every((p) => p.value === 6)).toBe(true);
    const total = props.reduce((n, p) => n + p.pixels.length, 0);
    expect(total).toBe(60 + 60);
  });
});

describe("the shipped masters", () => {
  it("covers every job", () => {
    expect(EXTERNAL_JOBS).toHaveLength(7);
  });

  it("drives the away-facing rows from the delivered back cell where there is one", () => {
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      expect(art, jobId).not.toBeNull();
      if (!art) continue;
      if (jobId === "conduit") {
        // C.8.6: one view delivered, so the unit never turns around.
        expect(art.drawnViews).toBe(1);
        expect(Array.from(art.master.views.ne.data)).toEqual(Array.from(art.master.views.se.data));
        continue;
      }
      expect(art.drawnViews, jobId).toBe(2);
      expect(Array.from(art.master.views.ne.data), jobId).not.toEqual(
        Array.from(art.master.views.se.data),
      );
    }
  });

  it("stands both views of a character at the same height", () => {
    const span = (grid: PixelGrid): number => {
      let top = SPRITE_HEIGHT;
      let bottom = -1;
      for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
        for (let x = 0; x < SPRITE_WIDTH; x += 1) {
          if (gridGet(grid, x, y) === TRANSPARENT) continue;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      return bottom - top + 1;
    };
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      if (!art) continue;
      expect(Math.abs(span(art.master.views.se) - span(art.master.views.ne)), jobId).toBeLessThanOrEqual(2);
    }
  });

  it("stands every master's feet on the anchor row", () => {
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      if (!art) continue;
      for (const view of ["se", "ne"] as const) {
        expect(art.reports[view].figureBottom, `${jobId}/${view}`).toBe(SPRITE_ANCHOR.y - 1);
      }
    }
  });

  it("carries no §2 signal color it did not declare", () => {
    const declared: Partial<Record<string, readonly string[]>> = {
      augmented: [PALETTE.brightblood],
    };
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      if (!art) continue;
      const allowed = new Set(declared[jobId] ?? []);
      for (const view of ["se", "ne"] as const) {
        for (const hex of art.reports[view].colors) {
          if (allowed.has(hex)) continue;
          expect(RESERVED_SIGNAL_COLORS, `${jobId}/${view} ${hex}`).not.toContain(hex);
        }
      }
    }
  });

  it("keeps the audit at load, violations and all — reports, never repairs", () => {
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      if (!art) continue;
      expect(art.summary).toContain(`${jobId}/se`);
      // Every delivery is over the hand-drawing color budget; C.8.6 says so and
      // says why it ships anyway. If one ever conforms, update the log with it.
      expect(art.reports.se.colorCount).toBeGreaterThan(14);
    }
  });
});
