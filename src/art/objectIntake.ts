// Wave 1 object delivery intake, cell location half (ART_DIRECTION D.6).
//
// One delivered file per brief, three of them so far. The flux main arrived as
// `art-src/flux_main.png` (576 × 328); the cable trough, the charge hoist and the
// trough's cut state followed as `cable_trough.png` (448 × 216),
// `charge_hoist.png` (576 × 344) and `severed_span.png` (304 × 216). They are all
// the same kind of sheet — painted cells side by side on transparent ground,
// corner guide brackets outside them, a row of flat swatches along the bottom —
// and that shape is what decides the method.
//
// It is a very different sheet from the terrain one. The terrain sheet was
// labelled, framed and drawn at preview sizes, so its intake had to find nine
// boxes by their warm frame rules and then check hand-measured interiors against
// a near-black inset line. These sheets need none of that, because they answer
// the brief literally:
//
//  1. **The cells are at exactly nominal size.** The brief's 4× numbers to the
//     pixel. So a declared rect is checkable against the spec rather than only
//     against the file.
//  2. **The fence is the alpha channel.** Every gutter is fully transparent,
//     alpha strictly 0 or 255 with nothing between. That makes the fence check
//     exact instead of a luma comparison: the 1px ring just outside a correct rect
//     is transparent on all four edges, and a rect off by one anywhere fails.
//  3. **The painting fills its cell.** A cell's opaque bounding **box** is its
//     rect, so a rect that is too large shows as slack and one that is too small
//     shows as a fence breach. The two checks together pin all four edges.
//
// Note (3) is a statement about the bounding box and not about coverage, and the
// hoist is why that distinction is load-bearing. An A-frame gantry is **open** —
// the brief makes the daylight under the beam the silhouette — so its cells reach
// all four edges while only half their pixels are opaque. Interior transparency is
// the delivery, not a defect: the renderer cuts the hole with `alphaTest 0.5`, and
// a fill check that demanded solid coverage would reject the one thing that stops
// a hoist reading as a hydraulic press.
//
// So the rects below are still hand-measured and **declared** — the same honesty
// `tileIntake.ts` and `tools/ingest-master.ts` use — while an automatic opaque-run
// sweep, the fence check and the fill check say whether the declaration is true.
// The palette strip is declared too, as *reference and not a cell*, which is what
// lets the intake cross-check the swatches against the colours actually used.

import { contentBounds, type RGBASource, type Rect } from "./ingest.js";
import type { Hex } from "./palette.js";
import { rgbToHex } from "./palette.js";
import {
  masterSize,
  objectCellSpec,
  type ObjectFaceId,
  type ObjectFaceState,
  type ObjectSpriteId,
} from "./objects.js";

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
  /**
   * The §6 state this painting is of; absent for the powered painting. A state
   * painting is the same face at the same size — that is what makes it a state —
   * so it is checked against the same rect the powered cell would be.
   */
  readonly state?: ObjectFaceState;
  readonly rect: Rect;
}

export interface DeclaredPaletteStrip {
  readonly rect: Rect;
  readonly swatch: number;
}

export interface ObjectSheet {
  /** Path under the repo root. The delivered art in `art-src/` is read-only. */
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly DeclaredObjectCell[];
  readonly strip: DeclaredPaletteStrip;
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
export const FLUX_MAIN_PALETTE_STRIP: DeclaredPaletteStrip = {
  rect: { x: 180, y: 288, w: 216, h: 24 },
  swatch: 24,
};

/**
 * `art-src/cable_trough.png` (448 × 216), brief §2. A run's top and its side are
 * one tile each and the third cell is the gland box that lands on one tile of the
 * run — so cells A and B are the same size and only B is `cap`. There is no
 * fourth cell for the short end because a trough has no distinct one: the tray
 * wall is eight horizontal bands, uniform along its length, so the run's flanks
 * and its ends are the lip (see `paintedAs` in `objects.ts`).
 */
export const CABLE_TROUGH_SHEET_CELLS: readonly DeclaredObjectCell[] = [
  { sprite: "cable-trough", face: "top", rect: { x: 16, y: 16, w: 128, h: 128 } },
  { sprite: "cable-trough", face: "cap", rect: { x: 160, y: 16, w: 128, h: 128 } },
  { sprite: "cable-trough", face: "long", rect: { x: 304, y: 16, w: 128, h: 32 } },
];

export const CABLE_TROUGH_PALETTE_STRIP: DeclaredPaletteStrip = {
  rect: { x: 128, y: 168, w: 192, h: 32 },
  swatch: 32,
};

/**
 * `art-src/charge_hoist.png` (576 × 344), brief §3. The set's only delivery with
 * interior transparency: the gap under the beam is the silhouette, so each cell
 * fills its rect edge to edge at roughly half coverage.
 */
export const CHARGE_HOIST_SHEET_CELLS: readonly DeclaredObjectCell[] = [
  { sprite: "charge-hoist", face: "long", rect: { x: 16, y: 16, w: 256, h: 224 } },
  { sprite: "charge-hoist", face: "end", rect: { x: 288, y: 16, w: 128, h: 224 } },
  { sprite: "charge-hoist", face: "top", rect: { x: 432, y: 16, w: 128, h: 256 } },
];

export const CHARGE_HOIST_PALETTE_STRIP: DeclaredPaletteStrip = {
  rect: { x: 176, y: 300, w: 224, h: 28 },
  swatch: 28,
};

/**
 * `art-src/severed_span.png` (304 × 216), brief §4 — the **cut state of the
 * trough**, not a fourth object, which is why both cells declare `cable-trough`
 * and the trough's own `top` face. Cell A is the break; cell B is the dead run,
 * declared so the sheet is fully accounted for and so the intake can hold the
 * artist's dead run against the substitution the engine already computes.
 */
export const SEVERED_SPAN_SHEET_CELLS: readonly DeclaredObjectCell[] = [
  { sprite: "cable-trough", face: "top", state: "severed", rect: { x: 16, y: 16, w: 128, h: 128 } },
  { sprite: "cable-trough", face: "top", state: "unpowered", rect: { x: 160, y: 16, w: 128, h: 128 } },
];

export const SEVERED_SPAN_PALETTE_STRIP: DeclaredPaletteStrip = {
  rect: { x: 40, y: 168, w: 224, h: 32 },
  swatch: 32,
};

/**
 * Every delivered object sheet, in delivery order. One table, so the ingest tool
 * and the tests read the same declaration rather than each carrying half of it.
 */
export const OBJECT_SHEETS: readonly ObjectSheet[] = [
  {
    source: "art-src/flux_main.png",
    width: 576,
    height: 328,
    cells: FLUX_MAIN_SHEET_CELLS,
    strip: FLUX_MAIN_PALETTE_STRIP,
  },
  {
    source: "art-src/cable_trough.png",
    width: 448,
    height: 216,
    cells: CABLE_TROUGH_SHEET_CELLS,
    strip: CABLE_TROUGH_PALETTE_STRIP,
  },
  {
    source: "art-src/charge_hoist.png",
    width: 576,
    height: 344,
    cells: CHARGE_HOIST_SHEET_CELLS,
    strip: CHARGE_HOIST_PALETTE_STRIP,
  },
  {
    source: "art-src/severed_span.png",
    width: 304,
    height: 216,
    cells: SEVERED_SPAN_SHEET_CELLS,
    strip: SEVERED_SPAN_PALETTE_STRIP,
  },
];

export interface ObjectCellCheck {
  readonly sprite: ObjectSpriteId;
  readonly face: ObjectFaceId;
  readonly state: ObjectFaceState;
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
  /**
   * Opaque pixels inside the rect. Less than its area on a delivery whose
   * silhouette is a hole rather than an outline — the hoist's open frame — which
   * `fillsRect` deliberately does not care about.
   */
  readonly opaquePixels: number;
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
  strip: DeclaredPaletteStrip | null = FLUX_MAIN_PALETTE_STRIP,
): ObjectSheetCut {
  const checks = cells.map((cell): ObjectCellCheck => {
    const state = cell.state ?? "powered";
    const spec = objectCellSpec(cell.sprite, cell.face, state);
    if (spec === null) {
      throw new Error(`cutObjectSheet: ${cell.sprite} wears no ${cell.face} face in ${state}`);
    }
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
    let opaquePixels = 0;
    for (let y = r.y; y < r.y + r.h; y += 1) {
      for (let x = r.x; x < r.x + r.w; x += 1) {
        const alpha = alphaAt(source, x, y);
        if (alpha !== 0 && alpha !== 255) partialAlpha += 1;
        if (alpha > ALPHA_THRESHOLD) opaquePixels += 1;
      }
    }
    const bounds = contentBounds(source, r, ALPHA_THRESHOLD);
    const fill = bounds ? { x: bounds.x - r.x, y: bounds.y - r.y, w: bounds.w, h: bounds.h } : null;
    return {
      sprite: cell.sprite,
      face: cell.face,
      state,
      rect: r,
      fence: { left, right, top, bottom },
      fenceOk: left + right + top + bottom === 0,
      fill,
      fillsRect: fill !== null && fill.x === 0 && fill.y === 0 && fill.w === r.w && fill.h === r.h,
      opaquePixels,
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
    const area = cell.rect.w * cell.rect.h;
    const label = cell.state === "powered" ? `${cell.sprite}/${cell.face}` : `${cell.sprite}/${cell.face}:${cell.state}`;
    lines.push(
      `  ${label.padEnd(28)} ${cell.rect.w}x${cell.rect.h} at (${cell.rect.x},${cell.rect.y})` +
        ` — fence L${f.left} R${f.right} T${f.top} B${f.bottom} ${cell.fenceOk ? "ok" : "BREACHED"}` +
        `, fill ${cell.fill ? `${cell.fill.w}x${cell.fill.h} at (${cell.fill.x},${cell.fill.y})` : "empty"} ${cell.fillsRect ? "flush" : "SLACK"}` +
        `, opaque ${cell.opaquePixels}/${area} (${Math.round((100 * cell.opaquePixels) / area)}%)` +
        `, partial alpha ${cell.partialAlpha}`,
    );
  }
  return lines.join("\n");
}
