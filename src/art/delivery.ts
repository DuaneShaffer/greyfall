// Character-sheet delivery intake (ART_DIRECTION C.8.7).
//
// C.8 asks for a bare two-cell grid on transparent ground. The six-job delivery
// arrived as finished character *sheets*: two figure cells plus a title block, a
// 64x96 preview inset, a proportion silhouette, a palette strip, caption text,
// cyan guide frames and a painted backdrop — at a different size and layout per
// sheet. This file finds the two figure cells in such a sheet and hands each
// back as a bounds-sized RGBA cutout with binary alpha, ready for
// `fitMasterToCanvas`.
//
// Three facts about the delivery drive the method, and all three were measured
// off the files rather than assumed:
//
//  1. The alpha channel is already a clean matte of everything the artist drew.
//     The painted backdrop lives in RGB at alpha 0-40; figures, text, swatches
//     and guide lines sit at alpha 250+. So the key is an alpha threshold, not
//     an edge-crispness or flood-fill heuristic — those would be guessing where
//     the file states the answer. Pixels landing between the two modes are
//     counted as `ambiguousAlpha` and never silently resolved (C.8.2).
//  2. Every sheet draws a thin ground line under the feet, and on three of six
//     it runs across both cells and welds the two figures into one blob. It is
//     cut by its shape — a horizontal run wider than a third of the sheet and
//     no thicker than a dozen rows is a line, not a body.
//  3. The guide frames are saturated cyan, far enough from the verdigris and
//     steel accents to key on color — but not far enough to trust blindly, so
//     guide-colored pixels within `reclaimRadius` of a kept figure are given
//     back (a goggle lens, a teal vial) and the rest are reported as
//     collisions rather than assumed to be frame.
//
// With the ground line cut and the guide stripped, the two figures fall out as
// the two largest connected components of the matte — no per-sheet crop
// rectangles needed. Everything else on the sheet (preview inset, silhouette,
// swatches, glyphs) is an order of magnitude smaller and is reported as
// discarded rather than dropped in silence.

import type { RGBASource, Rect } from "./ingest.js";

/** A color test for guide-frame pixels, in 0-255 RGB. */
export type GuideTest = (r: number, g: number, b: number) => boolean;

/**
 * Saturated cyan: the frame lines run from #0be5fb down to #0c707d across the
 * six sheets. The `b >= g - 8` clause is what keeps `verdigris-500` (#2f7a6c,
 * greener than it is blue) and `verdigris-300` out of it — Jory's apron and
 * Marek's rag are the accent family and must survive.
 */
export const GUIDE_TEAL: GuideTest = (r, g, b) =>
  r < 80 && g > 100 && b > 100 && (g + b) / 2 - r > 60 && b >= g - 8;

export interface SheetCutOptions {
  /** Alpha above this is drawn art. */
  readonly alphaThreshold?: number;
  /** Alpha strictly inside this band is neither matte nor art; counted, not guessed. */
  readonly ambiguousLow?: number;
  readonly ambiguousHigh?: number;
  /**
   * Share of the sheet height searched for figure cells, from the top. The
   * palette strip and the dimension rule live below the cells on every sheet.
   */
  readonly bandShare?: number;
  readonly guide?: GuideTest;
  /** Minimum share of the sheet width for a run to read as a drawn ground line. */
  readonly groundLineShare?: number;
  /** Maximum median thickness, in rows, for that run to be a line and not a body. */
  readonly groundLineThickness?: number;
  /** Guide-colored pixels this close to a kept figure are the figure's own. */
  readonly reclaimRadius?: number;
}

export interface CellCut {
  /** Where the cell sits in the delivered sheet. */
  readonly bounds: Rect;
  /** `bounds`-sized, alpha strictly 0 or 255, RGB carried through untouched. */
  readonly image: RGBASource;
  readonly figurePixels: number;
  /** Guide-colored pixels handed back to the figure (lens glass, vial fluid). */
  readonly reclaimedGuidePixels: number;
  /**
   * Guide-colored pixels still touching the figure after the reclaim. Non-zero
   * means the frame crosses the art, or an accent collided with the frame color;
   * either way it is named in the log rather than absorbed.
   */
  readonly guideCollisions: number;
  /** Pixels whose alpha fell between the matte and the art. */
  readonly ambiguousAlpha: number;
}

export interface DiscardedBlob {
  readonly size: number;
  readonly bounds: Rect;
}

export interface SheetCutReport {
  readonly width: number;
  readonly height: number;
  readonly bandBottom: number;
  readonly guidePixels: number;
  readonly groundLineRows: readonly number[];
  readonly componentCount: number;
  /** Sheet furniture: preview inset, silhouette, swatches, glyphs. */
  readonly discarded: readonly DiscardedBlob[];
  readonly discardedPixels: number;
}

export interface SheetCut {
  /** Leftmost figure. Every sheet captions it "Front 3/4 (facing left)". */
  readonly front: CellCut;
  /** Rightmost figure, captioned "Back 3/4 (same shoulder)". */
  readonly back: CellCut;
  readonly report: SheetCutReport;
}

interface Component {
  readonly id: number;
  readonly size: number;
  readonly bounds: Rect;
}

const alphaAt = (source: RGBASource, index: number): number => source.data[index * 4 + 3] ?? 0;

/**
 * Rows carrying a wide, thin horizontal run: the drawn ground line, plus the
 * dimension rule below the cells. Cutting them is what lets the two figures
 * separate on the sheets where the line runs through both.
 */
function groundLineRows(
  mask: Uint8Array,
  width: number,
  bandBottom: number,
  minRun: number,
  maxThickness: number,
): number[] {
  const rows: number[] = [];
  for (let y = 0; y < bandBottom; y += 1) {
    let run = 0;
    let best = 0;
    let bestStart = 0;
    let start = 0;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 1) {
        if (run === 0) start = x;
        run += 1;
        if (run > best) {
          best = run;
          bestStart = start;
        }
      } else {
        run = 0;
      }
    }
    if (best < minRun) continue;
    const step = Math.max(1, Math.floor(best / 40));
    const thickness: number[] = [];
    for (let x = bestStart; x < bestStart + best; x += step) {
      let up = y;
      let down = y;
      while (up > 0 && mask[(up - 1) * width + x] === 1) up -= 1;
      while (down < bandBottom - 1 && mask[(down + 1) * width + x] === 1) down += 1;
      thickness.push(down - up + 1);
    }
    thickness.sort((a, b) => a - b);
    if ((thickness[thickness.length >> 1] ?? 0) <= maxThickness) rows.push(y);
  }
  return rows;
}

function label(
  mask: Uint8Array,
  width: number,
  bandBottom: number,
): { labels: Int32Array; components: Component[] } {
  const labels = new Int32Array(width * bandBottom).fill(-1);
  const components: Component[] = [];
  const stack: number[] = [];
  let id = 0;
  for (let seed = 0; seed < width * bandBottom; seed += 1) {
    if (mask[seed] !== 1 || (labels[seed] as number) >= 0) continue;
    labels[seed] = id;
    stack.push(seed);
    let size = 0;
    let x0 = width;
    let y0 = bandBottom;
    let x1 = -1;
    let y1 = -1;
    while (stack.length > 0) {
      const at = stack.pop() as number;
      const x = at % width;
      const y = (at - x) / width;
      size += 1;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= bandBottom) continue;
        const next = ny * width + nx;
        if (mask[next] === 1 && (labels[next] as number) < 0) {
          labels[next] = id;
          stack.push(next);
        }
      }
    }
    components.push({ id, size, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
    id += 1;
  }
  return { labels, components };
}

function touchesKeep(
  keep: Uint8Array,
  width: number,
  bandBottom: number,
  x: number,
  y: number,
): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= bandBottom) continue;
      if (keep[ny * width + nx] === 1) return true;
    }
  }
  return false;
}

/**
 * Grow a component into guide-colored pixels, up to `radius` steps. A cyan
 * goggle lens or a vial of teal fluid is inside the figure and reads as guide
 * color; a frame line that merely crosses the figure does not survive two
 * steps, so the radius is the whole distinction.
 */
function reclaimGuide(
  keep: Uint8Array,
  guide: Uint8Array,
  width: number,
  bandBottom: number,
  bounds: Rect,
  radius: number,
): number {
  let reclaimed = 0;
  for (let pass = 0; pass < radius; pass += 1) {
    const gained: number[] = [];
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
        const at = y * width + x;
        if (guide[at] !== 1 || keep[at] === 1) continue;
        if (touchesKeep(keep, width, bandBottom, x, y)) gained.push(at);
      }
    }
    if (gained.length === 0) break;
    for (const at of gained) keep[at] = 1;
    reclaimed += gained.length;
  }
  return reclaimed;
}

/**
 * Locate the two figure cells of a delivered character sheet and cut each out
 * with a binary alpha. Deterministic: every decision is a threshold or a
 * connected-component ordering, no sampling and no iteration over object keys.
 */
export function cutDeliverySheet(source: RGBASource, options: SheetCutOptions = {}): SheetCut {
  const threshold = options.alphaThreshold ?? 127;
  const low = options.ambiguousLow ?? 32;
  const high = options.ambiguousHigh ?? 224;
  const guideTest = options.guide ?? GUIDE_TEAL;
  const bandBottom = Math.round(source.height * (options.bandShare ?? 0.8));
  const minRun = Math.round(source.width * (options.groundLineShare ?? 0.3));
  const maxThickness = options.groundLineThickness ?? 12;
  const radius = options.reclaimRadius ?? 2;
  const { width } = source;

  const mask = new Uint8Array(width * bandBottom);
  const guide = new Uint8Array(width * bandBottom);
  let guidePixels = 0;
  for (let at = 0; at < width * bandBottom; at += 1) {
    if (alphaAt(source, at) <= threshold) continue;
    const r = source.data[at * 4] ?? 0;
    const g = source.data[at * 4 + 1] ?? 0;
    const b = source.data[at * 4 + 2] ?? 0;
    if (guideTest(r, g, b)) {
      guide[at] = 1;
      guidePixels += 1;
      continue;
    }
    mask[at] = 1;
  }

  const rows = groundLineRows(mask, width, bandBottom, minRun, maxThickness);
  for (const y of rows) for (let x = 0; x < width; x += 1) mask[y * width + x] = 0;

  const { labels, components } = label(mask, width, bandBottom);
  if (components.length < 2) {
    throw new Error(`cutDeliverySheet: found ${components.length} blobs, need two figure cells`);
  }
  const bySize = [...components].sort((a, b) => b.size - a.size || a.bounds.x - b.bounds.x);
  const figures = [bySize[0] as Component, bySize[1] as Component].sort(
    (a, b) => a.bounds.x - b.bounds.x,
  );
  const discarded = bySize
    .slice(2)
    .filter((c) => c.size >= 15)
    .map((c) => ({ size: c.size, bounds: c.bounds }));

  const cut = (component: Component): CellCut => {
    const keep = new Uint8Array(width * bandBottom);
    for (let at = 0; at < labels.length; at += 1) if (labels[at] === component.id) keep[at] = 1;
    const reclaimedGuidePixels = reclaimGuide(
      keep,
      guide,
      width,
      bandBottom,
      component.bounds,
      radius,
    );

    const b = component.bounds;
    const data = new Uint8ClampedArray(b.w * b.h * 4);
    let figurePixels = 0;
    let guideCollisions = 0;
    let ambiguousAlpha = 0;
    for (let y = 0; y < b.h; y += 1) {
      for (let x = 0; x < b.w; x += 1) {
        const from = (b.y + y) * width + (b.x + x);
        const alpha = alphaAt(source, from);
        if (alpha > low && alpha < high) ambiguousAlpha += 1;
        if (keep[from] !== 1) {
          if (guide[from] === 1 && touchesKeep(keep, width, bandBottom, b.x + x, b.y + y)) {
            guideCollisions += 1;
          }
          continue;
        }
        const to = (y * b.w + x) * 4;
        data[to] = source.data[from * 4] ?? 0;
        data[to + 1] = source.data[from * 4 + 1] ?? 0;
        data[to + 2] = source.data[from * 4 + 2] ?? 0;
        // C.8.1: alpha is 0 or 255, never a coverage fraction.
        data[to + 3] = 255;
        figurePixels += 1;
      }
    }
    return {
      bounds: b,
      image: { width: b.w, height: b.h, data },
      figurePixels,
      reclaimedGuidePixels,
      guideCollisions,
      ambiguousAlpha,
    };
  };

  return {
    front: cut(figures[0] as Component),
    back: cut(figures[1] as Component),
    report: {
      width: source.width,
      height: source.height,
      bandBottom,
      guidePixels,
      groundLineRows: rows,
      componentCount: components.length,
      discarded,
      discardedPixels: discarded.reduce((n, c) => n + c.size, 0),
    },
  };
}

/** The cut rendered for an intake log. */
export function formatSheetCut(cut: SheetCut, name = "sheet"): string {
  const lines: string[] = [];
  const r = cut.report;
  lines.push(
    `${name}: ${r.width}x${r.height}, searched rows 0..${r.bandBottom - 1}, ${r.componentCount} blobs`,
  );
  lines.push(
    `  guide-teal ${r.guidePixels} px stripped, ground-line rows [${r.groundLineRows.join(",")}]`,
  );
  lines.push(
    `  discarded ${r.discarded.length} blobs / ${r.discardedPixels} px (preview inset, silhouette, swatches, glyphs)`,
  );
  for (const [name, cell] of [
    ["front", cut.front],
    ["back", cut.back],
  ] as const) {
    lines.push(
      `  ${name} cell ${cell.bounds.w}x${cell.bounds.h} at (${cell.bounds.x},${cell.bounds.y}): ` +
        `${cell.figurePixels} px, ${cell.reclaimedGuidePixels} guide px reclaimed, ` +
        `${cell.guideCollisions} guide collisions, ${cell.ambiguousAlpha} ambiguous alpha px`,
    );
  }
  return lines.join("\n");
}
