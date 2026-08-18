// Wave 1 terrain delivery intake, cell location half (ART_DIRECTION D.4).
//
// The nine tile faces arrived as ONE labelled sheet: a title block, a
// "wave 1 includes" panel, a delivery checklist, two captioned rows of framed
// cells (five tops, four sides), and every cell drawn as a *preview* at
// larger-than-nominal size. So intake starts by finding nine rectangles of
// painting inside nine frames and throwing away the titles, captions and rules.
//
// Two things about this sheet decide the method, and both were measured off the
// file rather than assumed:
//
//  1. **The frames are findable, the cell interiors are not.** Each cell box is
//     drawn with a warm 1px rule running its full height; those rules stand out
//     as the only near-full-height runs of light pixels in either band, and
//     `findSheetFrames` reads all nine boxes off them. The painting *inside* a
//     box does not separate as cleanly: `rail-top`'s ballast is as dark as the
//     panel behind it and `water-top`'s lower half is nearly flat, so a
//     variance or luma sweep finds their edges 100+ px in from the truth. An
//     automatic interior locator that works on seven of nine cells and lies
//     about two is worse than a measured number.
//  2. **Every cell interior is fenced by a 1px near-black inset line.** That is
//     what makes hand-measured rects checkable rather than merely asserted:
//     `cutTerrainSheet` verifies, for all four edges of all nine cells, that the
//     pixel just outside the rect is darker than the painting just inside it,
//     and reports the margin. A rect off by one fails that check.
//
// So the crop rects below are hand-measured for this one delivered file and are
// declared, not sniffed — the same honesty `tools/ingest-master.ts` uses for
// Vale's sheet — while the frame sweep and the inset check are automatic and
// say so in the log.

import type { RGBASource, Rect } from "./ingest.js";
import type { TileTextureId } from "./tiles.js";

/** Rec. 601 luma, 0..255. */
export const luma = (source: RGBASource, x: number, y: number): number => {
  const at = (y * source.width + x) * 4;
  return (
    0.299 * (source.data[at] ?? 0) + 0.587 * (source.data[at + 1] ?? 0) + 0.114 * (source.data[at + 2] ?? 0)
  );
};

export interface SheetBand {
  /** Frame rule rows bounding the row of cells. */
  readonly top: number;
  readonly bottom: number;
  /** Frame rule columns, left edge of the first cell to right edge of the last. */
  readonly dividers: readonly number[];
}

export interface SheetFrames {
  readonly tops: SheetBand;
  readonly sides: SheetBand;
}

export interface FrameSweepOptions {
  /** Luma above which a pixel counts as frame rule rather than panel. */
  readonly rule?: number;
  /** Share of the band a light run must cover to be a vertical frame rule. */
  readonly runShare?: number;
  /**
   * Share of the sheet width a light run must cover to be a horizontal rule. The
   * top rule of the tops band is drawn short — the section header sits on it — so
   * the bar is below the full width on purpose.
   */
  readonly ruleShare?: number;
  /** Columns closer together than this are the two halves of one 2px rule. */
  readonly mergeWithin?: number;
}

const longestRun = (n: number, on: (i: number) => boolean): number => {
  let run = 0;
  let best = 0;
  for (let i = 0; i < n; i += 1) {
    if (on(i)) {
      run += 1;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
};

/** Full-width light rules: the horizontal edges of a band of cell boxes. */
function ruleRows(source: RGBASource, y0: number, y1: number, rule: number, share: number): number[] {
  const need = source.width * share;
  const rows: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    if (longestRun(source.width, (x) => luma(source, x, y) > rule) >= need) rows.push(y);
  }
  return rows;
}

/** Near-full-height light rules inside a band: the vertical edges of its boxes. */
function ruleColumns(
  source: RGBASource,
  y0: number,
  y1: number,
  rule: number,
  runShare: number,
  mergeWithin: number,
): number[] {
  const need = (y1 - y0 + 1) * runShare;
  const hits: number[] = [];
  for (let x = 0; x < source.width; x += 1) {
    if (longestRun(y1 - y0 + 1, (i) => luma(source, x, y0 + i) > rule) >= need) hits.push(x);
  }
  const merged: number[] = [];
  for (const x of hits) {
    const last = merged[merged.length - 1];
    if (last !== undefined && x - last <= mergeWithin) continue;
    merged.push(x);
  }
  return merged;
}

/**
 * Locate the two bands of cell boxes and their dividing rules. Deterministic and
 * automatic; used to check the declared crop rects sit in the boxes they claim.
 */
export function findSheetFrames(source: RGBASource, options: FrameSweepOptions = {}): SheetFrames {
  const rule = options.rule ?? 60;
  const runShare = options.runShare ?? 0.85;
  const mergeWithin = options.mergeWithin ?? 3;
  // Below the title block, above the checklist panel: the two rows of cells.
  const rows = ruleRows(
    source,
    Math.round(source.height * 0.16),
    Math.round(source.height * 0.87),
    rule,
    options.ruleShare ?? 0.72,
  );
  const bands: SheetBand[] = [];
  for (let i = 0; i + 1 < rows.length; i += 1) {
    const top = rows[i] as number;
    const bottom = rows[i + 1] as number;
    if (bottom - top < source.height * 0.15) continue;
    bands.push({ top, bottom, dividers: ruleColumns(source, top, bottom, rule, runShare, mergeWithin) });
  }
  const tops = bands[0];
  const sides = bands[1];
  if (!tops || !sides) {
    throw new Error(`findSheetFrames: found ${bands.length} cell bands, need two (tops and sides)`);
  }
  return { tops, sides };
}

/** One declared cell: which band it sits in, which box, and the painting's rect. */
export interface DeclaredCell {
  readonly id: TileTextureId;
  readonly band: "tops" | "sides";
  /** Index into the band's divider list of the box's left rule. */
  readonly box: number;
  readonly rect: Rect;
}

/**
 * Hand-measured off `art-src/greyfall_terrain.png` (1535×1024). Each rect is the
 * painting only: the caption, the cell title and the 1px inset line are outside
 * it on every edge. Both rows are drawn at a constant height (tops 270 rows from
 * y=204, sides 185 rows from y=618) and a per-cell width, which is why the
 * delivered aspect ratios differ from the nominal ones — see the intake log.
 */
export const TERRAIN_SHEET_CELLS: readonly DeclaredCell[] = [
  { id: "plain-top", band: "tops", box: 0, rect: { x: 29, y: 204, w: 277, h: 270 } },
  { id: "impassable-top", band: "tops", box: 1, rect: { x: 325, y: 204, w: 276, h: 270 } },
  { id: "rail-top", band: "tops", box: 2, rect: { x: 621, y: 204, w: 289, h: 270 } },
  { id: "rough-top", band: "tops", box: 3, rect: { x: 930, y: 204, w: 271, h: 270 } },
  { id: "water-top", band: "tops", box: 4, rect: { x: 1223, y: 204, w: 284, h: 270 } },
  { id: "plain-side", band: "sides", box: 0, rect: { x: 28, y: 618, w: 328, h: 185 } },
  { id: "impassable-side", band: "sides", box: 1, rect: { x: 375, y: 618, w: 349, h: 185 } },
  { id: "rough-side", band: "sides", box: 2, rect: { x: 744, y: 618, w: 366, h: 185 } },
  { id: "water-side", band: "sides", box: 3, rect: { x: 1130, y: 618, w: 377, h: 185 } },
];

export interface CellCheck {
  readonly id: TileTextureId;
  readonly rect: Rect;
  /** The cell box the rect landed in, from the automatic frame sweep. */
  readonly box: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };
  /**
   * Per edge, mean luma just outside the rect minus mean luma just inside it.
   * The inset line is near-black, so every entry is expected to be negative;
   * a non-negative one means the rect has eaten frame or lost painting.
   */
  readonly insetMargin: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  };
  readonly insetOk: boolean;
  readonly image: RGBASource;
}

export interface TerrainSheetCut {
  readonly frames: SheetFrames;
  readonly cells: readonly CellCheck[];
}

const crop = (source: RGBASource, rect: Rect): RGBASource => {
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    const from = ((rect.y + y) * source.width + rect.x) * 4;
    data.set(source.data.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  // The sheet is fully opaque; a tile face has no transparency to carry.
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width: rect.w, height: rect.h, data };
};

const meanLuma = (source: RGBASource, rect: Rect): number => {
  let sum = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1)
    for (let x = rect.x; x < rect.x + rect.w; x += 1) sum += luma(source, x, y);
  return sum / (rect.w * rect.h);
};

/**
 * Cut the nine tile-face previews out of the delivered sheet, checking each
 * declared rect against the automatically found cell box and the inset line.
 */
export function cutTerrainSheet(
  source: RGBASource,
  cells: readonly DeclaredCell[] = TERRAIN_SHEET_CELLS,
  options: FrameSweepOptions = {},
): TerrainSheetCut {
  const frames = findSheetFrames(source, options);
  const checks = cells.map((cell): CellCheck => {
    const band = cell.band === "tops" ? frames.tops : frames.sides;
    const x0 = band.dividers[cell.box];
    const x1 = band.dividers[cell.box + 1];
    if (x0 === undefined || x1 === undefined) {
      throw new Error(`cutTerrainSheet: ${cell.id} claims box ${cell.box}, band has ${band.dividers.length - 1}`);
    }
    const r = cell.rect;
    if (r.x <= x0 || r.x + r.w - 1 >= x1 || r.y <= band.top || r.y + r.h - 1 >= band.bottom) {
      throw new Error(
        `cutTerrainSheet: ${cell.id} rect ${JSON.stringify(r)} is not inside box x ${x0}..${x1} y ${band.top}..${band.bottom}`,
      );
    }
    const insetMargin = {
      left: meanLuma(source, { x: r.x - 1, y: r.y, w: 1, h: r.h }) - meanLuma(source, { x: r.x, y: r.y, w: 1, h: r.h }),
      right:
        meanLuma(source, { x: r.x + r.w, y: r.y, w: 1, h: r.h }) -
        meanLuma(source, { x: r.x + r.w - 1, y: r.y, w: 1, h: r.h }),
      top: meanLuma(source, { x: r.x, y: r.y - 1, w: r.w, h: 1 }) - meanLuma(source, { x: r.x, y: r.y, w: r.w, h: 1 }),
      bottom:
        meanLuma(source, { x: r.x, y: r.y + r.h, w: r.w, h: 1 }) -
        meanLuma(source, { x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }),
    };
    return {
      id: cell.id,
      rect: r,
      box: { x0, x1, y0: band.top, y1: band.bottom },
      insetMargin,
      insetOk: Object.values(insetMargin).every((v) => v < 0),
      image: crop(source, r),
    };
  });
  return { frames, cells: checks };
}

export function formatTerrainSheetCut(cut: TerrainSheetCut): string {
  const lines: string[] = [];
  for (const [name, band] of [
    ["tops", cut.frames.tops],
    ["sides", cut.frames.sides],
  ] as const) {
    lines.push(`${name} band: rules y ${band.top}/${band.bottom}, box edges x [${band.dividers.join(",")}]`);
  }
  for (const cell of cut.cells) {
    const m = cell.insetMargin;
    lines.push(
      `  ${cell.id.padEnd(16)} ${cell.rect.w}x${cell.rect.h} at (${cell.rect.x},${cell.rect.y}) in box x ${cell.box.x0}..${cell.box.x1}` +
        ` — inset margins L${m.left.toFixed(1)} R${m.right.toFixed(1)} T${m.top.toFixed(1)} B${m.bottom.toFixed(1)}` +
        ` ${cell.insetOk ? "ok" : "SUSPECT"}`,
    );
  }
  return lines.join("\n");
}
