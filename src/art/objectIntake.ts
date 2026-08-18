// Wave 1 object delivery intake, cell location half (ART_DIRECTION D.6).
//
// The flux main arrived as `art-src/flux_main.png` (576 × 328): three painted
// cells side by side on transparent ground, corner guide brackets outside them,
// and a row of flat swatches along the bottom. It is a very different sheet from
// the terrain one and the difference decides the method.
//
// The terrain sheet was labelled, framed and drawn at preview sizes, so its
// intake had to find nine boxes by their warm frame rules and then check
// hand-measured interiors against a near-black inset line. This sheet needs
// none of that, because it answers the brief literally:
//
//  1. **The cells are at exactly nominal size.** 256 × 192, 128 × 192, 128 × 256
//     — the brief's 4× numbers to the pixel. So a declared rect is checkable
//     against the spec rather than only against the file.
//  2. **The fence is the alpha channel.** Every cell is fully opaque and every
//     gutter is fully transparent, alpha strictly 0 or 255 with nothing between.
//     That makes the fence check exact instead of a luma comparison: the 1px ring
//     just outside a correct rect is transparent on all four edges, and a rect
//     off by one anywhere fails.
//  3. **The painting fills its cell.** A cell's opaque bounding box *is* its
//     rect, so a rect that is too large shows as slack and one that is too small
//     shows as a fence breach. The two checks together pin all four edges.
//
// So the rects below are still hand-measured and **declared** — the same honesty
// `tileIntake.ts` and `tools/ingest-master.ts` use — while an automatic opaque-run
// sweep, the fence check and the fill check say whether the declaration is true.
// The palette strip is declared too, as *reference and not a cell*, which is what
// lets the intake cross-check the swatches against the colours actually used.

import { contentBounds, type RGBASource, type Rect } from "./ingest.js";
import type { Hex } from "./palette.js";
import { rgbToHex } from "./palette.js";
import { masterSize, OBJECT_ART, type ObjectFaceId, type ObjectSpriteId } from "./objects.js";

/** One contiguous run of opaque pixels along an axis, found automatically. */
export interface OpaqueRun {
  readonly from: number;
  readonly to: number;
}

export interface SheetContent {
  readonly columns: readonly OpaqueRun[];
  readonly rows: readonly OpaqueRun[];
}

const ALPHA_THRESHOLD = 127;

const alphaAt = (source: RGBASource, x: number, y: number): number =>
  source.data[(y * source.width + x) * 4 + 3] ?? 0;

const opaque = (source: RGBASource, x: number, y: number): boolean =>
  alphaAt(source, x, y) > ALPHA_THRESHOLD;

const runs = (length: number, on: (i: number) => boolean): OpaqueRun[] => {
  const out: OpaqueRun[] = [];
  let start = -1;
  for (let i = 0; i <= length; i += 1) {
    const hit = i < length && on(i);
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) {
      out.push({ from: start, to: i - 1 });
      start = -1;
    }
  }
  return out;
};

/**
 * The sheet's opaque column and row runs. Deterministic and automatic; used to
 * check that the declared rects sit inside content the file actually has, and to
 * account for every opaque pixel on the sheet.
 */
export function findObjectSheetContent(source: RGBASource): SheetContent {
  return {
    columns: runs(source.width, (x) => {
      for (let y = 0; y < source.height; y += 1) if (opaque(source, x, y)) return true;
      return false;
    }),
    rows: runs(source.height, (y) => {
      for (let x = 0; x < source.width; x += 1) if (opaque(source, x, y)) return true;
      return false;
    }),
  };
}

export interface DeclaredObjectCell {
  readonly sprite: ObjectSpriteId;
  readonly face: ObjectFaceId;
  readonly rect: Rect;
}

/**
 * Hand-measured off `art-src/flux_main.png` (576 × 328). Cells are laid out left
 * to right at nominal 4× size on a 16px margin, with 16px gutters and the corner
 * guide brackets outside every rect. The palette strip sits below them and is
 * reference, not a cell.
 */
export const FLUX_MAIN_SHEET_CELLS: readonly DeclaredObjectCell[] = [
  { sprite: "flux-main", face: "long", rect: { x: 16, y: 16, w: 256, h: 192 } },
  { sprite: "flux-main", face: "end", rect: { x: 288, y: 16, w: 128, h: 192 } },
  { sprite: "flux-main", face: "top", rect: { x: 432, y: 16, w: 128, h: 256 } },
];

/** The reference swatch row: nine flat 24 × 24 squares of the colours used. */
export const FLUX_MAIN_PALETTE_STRIP = { rect: { x: 180, y: 288, w: 216, h: 24 }, swatch: 24 } as const;

export interface ObjectCellCheck {
  readonly sprite: ObjectSpriteId;
  readonly face: ObjectFaceId;
  readonly rect: Rect;
  /** Opaque pixels found on the 1px ring just outside the rect, per edge. */
  readonly fence: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  };
  readonly fenceOk: boolean;
  /** The rect's own opaque bounding box, relative to the rect. */
  readonly fill: Rect | null;
  readonly fillsRect: boolean;
  /** Alpha values strictly between the two modes: counted, never guessed (C.8.2). */
  readonly partialAlpha: number;
  readonly image: RGBASource;
}

export interface ObjectSheetCut {
  readonly content: SheetContent;
  readonly cells: readonly ObjectCellCheck[];
  /** The declared swatch row, read at each square's centre. */
  readonly swatches: readonly Hex[];
  /**
   * Opaque pixels belonging to neither a cell nor the swatch row: the corner
   * guide brackets, and nothing else if the sheet is what it claims to be.
   */
  readonly unaccountedOpaque: number;
}

const crop = (source: RGBASource, rect: Rect): RGBASource => {
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    const from = ((rect.y + y) * source.width + rect.x) * 4;
    data.set(source.data.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  // §3 has no partial coverage and neither does a machine face: alpha is binary.
  for (let i = 3; i < data.length; i += 4) data[i] = (data[i] as number) > ALPHA_THRESHOLD ? 255 : 0;
  return { width: rect.w, height: rect.h, data };
};

const inside = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;

const sampleHex = (source: RGBASource, x: number, y: number): Hex => {
  const at = (y * source.width + x) * 4;
  return rgbToHex(source.data[at] ?? 0, source.data[at + 1] ?? 0, source.data[at + 2] ?? 0);
};

/**
 * Cut the declared cells out of a delivered object sheet, checking each rect
 * against its spec size, its transparent fence and its own fill, and accounting
 * for every opaque pixel on the sheet.
 */
export function cutObjectSheet(
  source: RGBASource,
  cells: readonly DeclaredObjectCell[] = FLUX_MAIN_SHEET_CELLS,
  strip: { rect: Rect; swatch: number } | null = FLUX_MAIN_PALETTE_STRIP,
): ObjectSheetCut {
  const checks = cells.map((cell): ObjectCellCheck => {
    const spec = OBJECT_ART[cell.sprite].faces[cell.face];
    const nominal = masterSize(spec);
    const r = cell.rect;
    if (r.w !== nominal.width || r.h !== nominal.height) {
      throw new Error(
        `cutObjectSheet: ${cell.sprite}/${cell.face} rect is ${r.w}x${r.h}, the brief delivers ${nominal.width}x${nominal.height}`,
      );
    }
    if (r.x < 1 || r.y < 1 || r.x + r.w >= source.width || r.y + r.h >= source.height) {
      throw new Error(
        `cutObjectSheet: ${cell.sprite}/${cell.face} rect ${JSON.stringify(r)} leaves no room for a fence in a ${source.width}x${source.height} sheet`,
      );
    }
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    for (let y = r.y; y < r.y + r.h; y += 1) {
      if (opaque(source, r.x - 1, y)) left += 1;
      if (opaque(source, r.x + r.w, y)) right += 1;
    }
    for (let x = r.x; x < r.x + r.w; x += 1) {
      if (opaque(source, x, r.y - 1)) top += 1;
      if (opaque(source, x, r.y + r.h)) bottom += 1;
    }
    let partialAlpha = 0;
    for (let y = r.y; y < r.y + r.h; y += 1) {
      for (let x = r.x; x < r.x + r.w; x += 1) {
        const alpha = alphaAt(source, x, y);
        if (alpha !== 0 && alpha !== 255) partialAlpha += 1;
      }
    }
    const bounds = contentBounds(source, r, ALPHA_THRESHOLD);
    const fill = bounds ? { x: bounds.x - r.x, y: bounds.y - r.y, w: bounds.w, h: bounds.h } : null;
    return {
      sprite: cell.sprite,
      face: cell.face,
      rect: r,
      fence: { left, right, top, bottom },
      fenceOk: left + right + top + bottom === 0,
      fill,
      fillsRect: fill !== null && fill.x === 0 && fill.y === 0 && fill.w === r.w && fill.h === r.h,
      partialAlpha,
      image: crop(source, r),
    };
  });

  const swatches: Hex[] = [];
  if (strip) {
    for (let x = strip.rect.x; x + strip.swatch <= strip.rect.x + strip.rect.w; x += strip.swatch) {
      const cx = x + Math.floor(strip.swatch / 2);
      const cy = strip.rect.y + Math.floor(strip.rect.h / 2);
      if (opaque(source, cx, cy)) swatches.push(sampleHex(source, cx, cy));
    }
  }

  let unaccountedOpaque = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (!opaque(source, x, y)) continue;
      if (strip && inside(strip.rect, x, y)) continue;
      if (cells.some((cell) => inside(cell.rect, x, y))) continue;
      unaccountedOpaque += 1;
    }
  }

  return { content: findObjectSheetContent(source), cells: checks, swatches, unaccountedOpaque };
}

export function formatObjectSheetCut(cut: ObjectSheetCut): string {
  const run = (r: OpaqueRun) => `${r.from}..${r.to}(${r.to - r.from + 1})`;
  const lines = [
    `opaque columns: ${cut.content.columns.map(run).join(" ")}`,
    `opaque rows:    ${cut.content.rows.map(run).join(" ")}`,
    `swatch row (${cut.swatches.length}): ${cut.swatches.join(" ")}`,
    `opaque outside the cells and the swatch row: ${cut.unaccountedOpaque} px (the corner guides)`,
  ];
  for (const cell of cut.cells) {
    const f = cell.fence;
    lines.push(
      `  ${`${cell.sprite}/${cell.face}`.padEnd(20)} ${cell.rect.w}x${cell.rect.h} at (${cell.rect.x},${cell.rect.y})` +
        ` — fence L${f.left} R${f.right} T${f.top} B${f.bottom} ${cell.fenceOk ? "ok" : "BREACHED"}` +
        `, fill ${cell.fill ? `${cell.fill.w}x${cell.fill.h} at (${cell.fill.x},${cell.fill.y})` : "empty"} ${cell.fillsRect ? "flush" : "SLACK"}` +
        `, partial alpha ${cell.partialAlpha}`,
    );
  }
  return lines.join("\n");
}
