// External master intake (ART_DIRECTION Appendix C.8). Takes a 64x96 RGBA
// master drawn outside this pipeline — colors approximately right, not
// palette-exact — and turns it into an internal palette-index grid, together
// with a conformance report saying exactly what moved and what the result
// violates.
//
// The one rule this file lives by: **quantization reports, it does not repair**.
// Snapping a color to the nearest palette step is unavoidable and is recorded
// per pixel. Everything else — an open outline, an over-budget amber, a face
// with no eyes, a thirteenth color — is reported as a violation and left in
// place, because silently "fixing" incoming art is how a pipeline starts
// lying about what the artist drew.

import {
  EMISSIVE_COLORS,
  OUTLINE_COLOR,
  PALETTE,
  RAMPS,
  TEAM_TINT,
  hexToRgb,
  type Hex,
} from "./palette.js";
import {
  INDEXED_PALETTE,
  OUTLINE_INDEX,
  TRANSPARENT,
  colorClusters,
  createGrid,
  distinctColors,
  gridBounds,
  gridGet,
  histogram,
  isEmissiveIndex,
  paletteIndex,
  type PixelGrid,
  type Point,
} from "./pixel.js";
import {
  FIGURE_BOX_BOTTOM,
  MAX_COLORS_PER_SPRITE,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  TEAM_TINT_INDEX_COUNT,
} from "./sprites.js";

export interface RGBASource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const sampleAlpha = (source: RGBASource, x: number, y: number): number =>
  source.data[(y * source.width + x) * 4 + 3] ?? 0;

/**
 * Box-filter resample to an exact size, averaging color weighted by alpha so a
 * transparent pixel cannot drag its neighbours toward whatever RGB it stores.
 * Every source pixel lands in exactly one destination box, which is what keeps
 * a 4:1 reduction of a delivered master from dropping thin gear.
 */
export function resampleRGBA(source: RGBASource, width: number, height: number): RGBASource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy0 = Math.floor((y * source.height) / height);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * source.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx0 = Math.floor((x * source.width) / width);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * source.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let taps = 0;
      for (let sy = sy0; sy < sy1 && sy < source.height; sy += 1) {
        for (let sx = sx0; sx < sx1 && sx < source.width; sx += 1) {
          const at = (sy * source.width + sx) * 4;
          const alpha = source.data[at + 3] ?? 0;
          r += (source.data[at] ?? 0) * alpha;
          g += (source.data[at + 1] ?? 0) * alpha;
          b += (source.data[at + 2] ?? 0) * alpha;
          a += alpha;
          taps += 1;
        }
      }
      const out = (y * width + x) * 4;
      data[out] = a === 0 ? 0 : r / a;
      data[out + 1] = a === 0 ? 0 : g / a;
      data[out + 2] = a === 0 ? 0 : b / a;
      data[out + 3] = taps === 0 ? 0 : a / taps;
    }
  }
  return { width, height, data };
}

export interface FitOptions {
  /** Source rectangle to take. Defaults to the whole image. */
  readonly crop?: Rect;
  /** Alpha at or below this is background when measuring the figure. */
  readonly alphaThreshold?: number;
  /** Canvas rows left clear above the figure. The outline ring needs one. */
  readonly headroom?: number;
  /**
   * Reduction ratio to use instead of the one measured off this image. A
   * front/back pair is one character and must not change size when it turns
   * around, so both views are fitted at the pair's shared scale — see
   * `masterFitScale`.
   */
  readonly scale?: number;
}

/** Tight bounds of the pixels above `threshold`, within `crop`. */
export function contentBounds(
  source: RGBASource,
  crop: Rect,
  threshold: number,
): Rect | null {
  let x0 = crop.x + crop.w;
  let y0 = crop.y + crop.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = crop.y; y < crop.y + crop.h; y += 1) {
    for (let x = crop.x; x < crop.x + crop.w; x += 1) {
      if (sampleAlpha(source, x, y) <= threshold) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const FIT_BOX_WIDTH = SPRITE_WIDTH - 2;

/**
 * The largest reduction ratio at which every one of these cells still fits the
 * figure box whole. Fitting each view of a character independently would make
 * it change height when it turns around — a front three-quarter holding a maul
 * out to one side and a shield out to the other is *wider* than the back view
 * of the same figure, and width is what binds here — so the pair is measured
 * together and reduced together.
 *
 * Nothing is clipped to buy height. A delivery whose outstretched gear costs it
 * canvas height keeps all of its gear and stands shorter, and the intake log
 * says by how much; cropping the artist's maul off would be a repair.
 */
export function masterFitScale(cells: readonly RGBASource[], options: FitOptions = {}): number {
  const threshold = options.alphaThreshold ?? 127;
  const boxHeight = SPRITE_ANCHOR.y - (options.headroom ?? 1);
  let scale = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const crop = options.crop ?? { x: 0, y: 0, w: cell.width, h: cell.height };
    const bounds = contentBounds(cell, crop, threshold);
    if (!bounds) throw new Error("masterFitScale: nothing above the alpha threshold");
    scale = Math.min(scale, boxHeight / bounds.h, FIT_BOX_WIDTH / bounds.w);
  }
  if (!Number.isFinite(scale)) throw new Error("masterFitScale: no cells");
  return scale;
}

/**
 * Bring a delivered master onto the sprite canvas: crop to its content, reduce
 * it to the figure box, center it on the seam and stand it on the anchor row.
 *
 * The briefs ask for 256x384 per figure and the spec is 64x96, so a delivery is
 * a 4:1 reduction — but an artist's crop is never exactly the box, and the
 * reduction is measured off the art rather than assumed. This is placement and
 * resampling only; it makes no judgement about the result, which is still
 * `quantizeToPalette`'s report to give.
 */
export function fitMasterToCanvas(source: RGBASource, options: FitOptions = {}): RGBASource {
  const threshold = options.alphaThreshold ?? 127;
  const headroom = options.headroom ?? 1;
  const crop = options.crop ?? { x: 0, y: 0, w: source.width, h: source.height };
  const bounds = contentBounds(source, crop, threshold);
  if (!bounds) throw new Error("fitMasterToCanvas: nothing above the alpha threshold");

  const boxHeight = SPRITE_ANCHOR.y - headroom;
  const scale = options.scale ?? Math.min(boxHeight / bounds.h, FIT_BOX_WIDTH / bounds.w);
  const width = Math.max(1, Math.round(bounds.w * scale));
  const height = Math.max(1, Math.round(bounds.h * scale));

  const cut: RGBASource = {
    width: bounds.w,
    height: bounds.h,
    data: new Uint8ClampedArray(bounds.w * bounds.h * 4),
  };
  for (let y = 0; y < bounds.h; y += 1) {
    const from = ((bounds.y + y) * source.width + bounds.x) * 4;
    (cut.data as Uint8ClampedArray).set(
      source.data.subarray(from, from + bounds.w * 4),
      y * bounds.w * 4,
    );
  }
  const scaled = resampleRGBA(cut, width, height);

  const out = new Uint8ClampedArray(SPRITE_WIDTH * SPRITE_HEIGHT * 4);
  const originX = Math.round(SPRITE_ANCHOR.x - width / 2);
  const originY = SPRITE_ANCHOR.y - height;
  for (let y = 0; y < height; y += 1) {
    const ty = originY + y;
    if (ty < 0 || ty >= SPRITE_HEIGHT) continue;
    for (let x = 0; x < width; x += 1) {
      const tx = originX + x;
      if (tx < 0 || tx >= SPRITE_WIDTH) continue;
      const from = (y * width + x) * 4;
      const to = (ty * SPRITE_WIDTH + tx) * 4;
      // Alpha is forced to 0 or 255: §3 has no partial coverage.
      const alpha = scaled.data[from + 3] ?? 0;
      if (alpha <= threshold) continue;
      out[to] = scaled.data[from] ?? 0;
      out[to + 1] = scaled.data[from + 1] ?? 0;
      out[to + 2] = scaled.data[from + 2] ?? 0;
      out[to + 3] = 255;
    }
  }
  return { width: SPRITE_WIDTH, height: SPRITE_HEIGHT, data: out };
}

/** One pixel the quantizer had to move, and how far it moved it. */
export interface MovedPixel {
  readonly x: number;
  readonly y: number;
  readonly from: Hex;
  readonly to: Hex;
  readonly index: number;
  /** Euclidean RGB distance, 0..441. */
  readonly distance: number;
}

export interface QuantizeOptions extends AuditOptions {
  /** Alpha at or below this becomes transparent; above it becomes opaque. */
  readonly alphaThreshold?: number;
  /**
   * Distance above which a move is called out individually. 24 is about one
   * ramp step in this palette — beyond that the artist meant another color.
   */
  readonly reportDistance?: number;
  /** Palette subset to quantize into. Defaults to all 34. */
  readonly allowed?: readonly Hex[];
}

export interface ConformanceReport {
  readonly ok: boolean;
  readonly width: number;
  readonly height: number;
  /** Pixels whose source color was not already an exact palette value. */
  readonly movedCount: number;
  readonly opaqueCount: number;
  readonly maxDistance: number;
  readonly meanDistance: number;
  /** Every move further than `reportDistance`, worst first. */
  readonly farMoves: readonly MovedPixel[];
  /**
   * Pixels the quantizer could plausibly have sent elsewhere: the move was
   * further than the gap to the runner-up. `soot-900` and `umber-900` sit 12
   * units apart in a palette whose steps are otherwise ~40, so a master with
   * drifting blacks lands here — and a misread outline breaks everything
   * downstream. Non-zero means clean the source or pass `allowed`.
   */
  readonly ambiguous: readonly AmbiguousPixel[];
  readonly colorCount: number;
  readonly colors: readonly Hex[];
  readonly amberPixels: number;
  readonly amberBudget: number;
  readonly teamTintPixels: number;
  /** Interior pixels touching transparency — the outline of §3 is not closed. */
  readonly outlineGaps: readonly Point[];
  /** Non-emissive pixels sitting on the reserved canvas ring. */
  readonly edgeBleed: readonly Point[];
  /** Emissive pixels wearing a `soot-900` edge instead of their halo. */
  readonly haloViolations: readonly Point[];
  /** Lowest occupied row of the figure box; must be the anchor row minus one. */
  readonly figureBottom: number | null;
  readonly subFloorIntruders: readonly Point[];
  /** Same-color 4-connected regions of 1px, excluding permitted singletons. */
  readonly orphanClusters: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** A quantization that was nearly a different decision. */
export interface AmbiguousPixel extends MovedPixel {
  readonly runnerUp: Hex;
  /** How much closer the winner was than the runner-up. */
  readonly margin: number;
}

export interface QuantizeResult {
  readonly grid: PixelGrid;
  readonly report: ConformanceReport;
}

const ALL_HEXES = Object.values(PALETTE) as readonly Hex[];

/**
 * §2's reserved signal colors: an overload aura, a vein-glass deposit, a hazard
 * marker, and the augmented job's brightblood scarring. Each one is loud on
 * purpose and each one sits within a ramp step of some skin or cloth tone in
 * painted art — `#eba386` cheek is 47 units from `brightblood` and 51 from
 * `bone-100`, so a face quantized against the whole palette lands on the pink
 * and then gets an emissive halo instead of an outline. They are excluded from
 * the default intake target; a delivery whose fiction actually carries one
 * declares it back in (C.8.7).
 */
export const RESERVED_SIGNAL_COLORS: readonly Hex[] = [
  PALETTE["overload-700"],
  PALETTE["overload-500"],
  PALETTE["overload-100"],
  PALETTE["veinglass-700"],
  PALETTE["veinglass-500"],
  PALETTE["veinglass-100"],
  PALETTE.hazard,
  PALETTE.brightblood,
];

/** The quantizer's target for a delivered field sprite: §2 minus the signals. */
export const FIELD_PALETTE: readonly Hex[] = ALL_HEXES.filter(
  (hex) => !RESERVED_SIGNAL_COLORS.includes(hex),
);

/** `FIELD_PALETTE` with named signal colors declared back in. */
export const fieldPaletteWith = (...extra: readonly Hex[]): readonly Hex[] => [
  ...FIELD_PALETTE,
  ...extra.filter((hex) => !FIELD_PALETTE.includes(hex)),
];
const AMBER_INDICES = new Set(RAMPS.amber.map((hex) => paletteIndex(hex)));
const EMISSIVE_INDICES = new Set(EMISSIVE_COLORS.map((hex) => paletteIndex(hex)));
/**
 * Only the player and enemy tints are countable: §2 draws them from steel and
 * blood, hues the world does not otherwise use. The neutral tint is soot-100
 * over soot-700 — ordinary body colors — so a neutral master must declare its
 * mask explicitly via `AuditOptions.tint` rather than have it guessed.
 */
const DEFAULT_TINT_INDICES: readonly number[] = [
  paletteIndex(TEAM_TINT.player.base),
  paletteIndex(TEAM_TINT.player.shadow),
  paletteIndex(TEAM_TINT.enemy.base),
  paletteIndex(TEAM_TINT.enemy.shadow),
];
const CANVAS_PIXELS = SPRITE_WIDTH * SPRITE_HEIGHT;
/**
 * §2: amber is scarce. The budget is an *area* share, because the billboard's
 * world size did not change with the sprite density — what a player sees is the
 * fraction of the figure that glows, not a pixel count.
 *
 * Re-derived at 64x96 rather than carried over: the worst frame in the roster
 * (conduit/cast, the emissive peak) now spends 174 of 6144 px, 2.8%. The old
 * 5% was measured against 32x48 areas and left more slack than it looked like;
 * 4% is the tightest round share that still clears the cast peak.
 */
export const AMBER_SHARE = 0.04;
export const AMBER_BUDGET = Math.floor(CANVAS_PIXELS * AMBER_SHARE);
export const MAX_FRAME_COLORS = MAX_COLORS_PER_SPRITE + TEAM_TINT_INDEX_COUNT;

const rgbTable = (hexes: readonly Hex[]): readonly (readonly [number, number, number])[] =>
  hexes.map((hex) => hexToRgb(hex));

function nearest(
  r: number,
  g: number,
  b: number,
  hexes: readonly Hex[],
  table: readonly (readonly [number, number, number])[],
): { hex: Hex; distance: number; runnerUp: Hex; margin: number } {
  let bestAt = 0;
  let best = Number.POSITIVE_INFINITY;
  let secondAt = 0;
  let second = Number.POSITIVE_INFINITY;
  for (let i = 0; i < table.length; i += 1) {
    const c = table[i] as readonly [number, number, number];
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < best) {
      second = best;
      secondAt = bestAt;
      best = d;
      bestAt = i;
    } else if (d < second) {
      second = d;
      secondAt = i;
    }
  }
  return {
    hex: hexes[bestAt] as Hex,
    distance: Math.sqrt(best),
    runnerUp: hexes[secondAt] as Hex,
    margin: Math.sqrt(second) - Math.sqrt(best),
  };
}

/**
 * Snap every pixel of an external master to the nearest palette index and
 * report on the result. The grid comes back whatever the report says: callers
 * decide whether a master is acceptable, this function does not.
 */
export function quantizeToPalette(
  source: RGBASource,
  options: QuantizeOptions = {},
): QuantizeResult {
  const { grid, stats } = quantizeGrid(source, options);
  return { grid, report: auditGrid(grid, stats, options) };
}

/**
 * The snap on its own, without the sprite audit. A tile face has no figure box,
 * no feet anchor and no silhouette outline, so it takes this and runs its own
 * audit (`src/art/tiles.ts`) over the same numbers.
 */
export function quantizeGrid(
  source: RGBASource,
  options: QuantizeOptions = {},
): { grid: PixelGrid; stats: QuantizeStats } {
  const alphaThreshold = options.alphaThreshold ?? 127;
  const reportDistance = options.reportDistance ?? 24;
  const hexes = options.allowed ?? ALL_HEXES;
  const table = rgbTable(hexes);

  const grid = createGrid(source.width, source.height);
  const moves: MovedPixel[] = [];
  const ambiguous: AmbiguousPixel[] = [];
  let movedCount = 0;
  let opaque = 0;
  let distanceSum = 0;
  let maxDistance = 0;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const at = (y * source.width + x) * 4;
      const alpha = source.data[at + 3] ?? 0;
      if (alpha <= alphaThreshold) continue;
      const r = source.data[at] ?? 0;
      const g = source.data[at + 1] ?? 0;
      const b = source.data[at + 2] ?? 0;
      const hit = nearest(r, g, b, hexes, table);
      const index = paletteIndex(hit.hex);
      grid.data[y * source.width + x] = index;
      opaque += 1;
      if (hit.distance > 0) {
        movedCount += 1;
        distanceSum += hit.distance;
        if (hit.distance > maxDistance) maxDistance = hit.distance;
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}` as Hex;
        const move: MovedPixel = { x, y, from: hex, to: hit.hex, index, distance: hit.distance };
        if (hit.distance > reportDistance) moves.push(move);
        if (hit.margin < hit.distance) {
          ambiguous.push({ ...move, runnerUp: hit.runnerUp, margin: hit.margin });
        }
      }
    }
  }

  moves.sort((a, b) => b.distance - a.distance);
  return {
    grid,
    stats: {
      movedCount,
      opaqueCount: opaque,
      maxDistance,
      meanDistance: movedCount === 0 ? 0 : distanceSum / movedCount,
      farMoves: moves,
      ambiguous,
    },
  };
}

export interface QuantizeStats {
  readonly movedCount: number;
  readonly opaqueCount: number;
  readonly maxDistance: number;
  readonly meanDistance: number;
  readonly farMoves: readonly MovedPixel[];
  readonly ambiguous: readonly AmbiguousPixel[];
}

const NO_STATS: QuantizeStats = {
  movedCount: 0,
  opaqueCount: 0,
  maxDistance: 0,
  meanDistance: 0,
  farMoves: [],
  ambiguous: [],
};

/**
 * The spec half of the report: everything §2, §3 and Appendix C can be checked
 * on a finished grid, whether it came from the generator or from outside.
 */
export interface AuditOptions {
  /** Palette indices that carry the team tint. Defaults to steel and blood. */
  readonly tint?: readonly number[];
}

export function auditGrid(
  grid: PixelGrid,
  stats: QuantizeStats = NO_STATS,
  options: AuditOptions = {},
): ConformanceReport {
  const tintIndexSet = new Set(options.tint ?? DEFAULT_TINT_INDICES);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (grid.width !== SPRITE_WIDTH || grid.height !== SPRITE_HEIGHT) {
    errors.push(`canvas is ${grid.width}x${grid.height}, spec is ${SPRITE_WIDTH}x${SPRITE_HEIGHT}`);
  }

  const counts = histogram(grid);
  const colorIndices = [...distinctColors(grid)];
  const colors = colorIndices.map((index) => INDEXED_PALETTE[index] as Hex);
  if (colorIndices.length > MAX_FRAME_COLORS) {
    errors.push(`${colorIndices.length} colors, budget is ${MAX_FRAME_COLORS} (12 + 2 tint)`);
  }

  let amberPixels = 0;
  for (const [index, count] of counts) if (AMBER_INDICES.has(index)) amberPixels += count;
  if (amberPixels > AMBER_BUDGET) {
    errors.push(
      `${amberPixels} amber pixels, budget is ${AMBER_BUDGET} (${AMBER_SHARE * 100}% of the canvas)`,
    );
  }

  let teamTintPixels = 0;
  for (const [index, count] of counts) if (tintIndexSet.has(index)) teamTintPixels += count;
  const opaque = stats.opaqueCount || counts.get(TRANSPARENT) !== undefined
    ? [...counts].reduce((n, [index, count]) => (index === TRANSPARENT ? n : n + count), 0)
    : 0;
  if (opaque > 0) {
    const share = teamTintPixels / opaque;
    if (share < 0.03) warnings.push(`team tint is ${(share * 100).toFixed(1)}% of the body (5-12% expected)`);
    if (share > 0.16) errors.push(`team tint is ${(share * 100).toFixed(1)}% of the body — §2 forbids repainting a unit`);
  }

  const outlineGaps: Point[] = [];
  const edgeBleed: Point[] = [];
  const haloViolations: Point[] = [];
  const subFloorIntruders: Point[] = [];
  const edgeSafe = new Set<number>([OUTLINE_INDEX, ...EMISSIVE_INDICES]);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const value = gridGet(grid, x, y);
      if (value === TRANSPARENT) continue;
      if (y > FIGURE_BOX_BOTTOM) {
        if (value !== OUTLINE_INDEX) subFloorIntruders.push({ x, y });
        continue;
      }
      if (x === 0 || y === 0 || x === grid.width - 1) {
        if (!edgeSafe.has(value)) edgeBleed.push({ x, y });
      }
      if (edgeSafe.has(value)) continue;
      // Interior colors must be fenced by the closed outline of §3.
      for (let ny = -1; ny <= 1; ny += 1) {
        for (let nx = -1; nx <= 1; nx += 1) {
          if (nx === 0 && ny === 0) continue;
          const sy = y + ny;
          const sample = sy > FIGURE_BOX_BOTTOM ? OUTLINE_INDEX : gridGet(grid, x + nx, sy);
          if (sample === TRANSPARENT) {
            outlineGaps.push({ x, y });
            ny = 2;
            break;
          }
        }
      }
    }
  }

  // §3: light does not have a black edge.
  for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!isEmissiveIndex(gridGet(grid, x, y))) continue;
      for (const [nx, ny] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (gridGet(grid, x + nx, y + ny) === OUTLINE_INDEX) haloViolations.push({ x, y });
      }
    }
  }

  const bounds = gridBounds(grid);
  let figureBottom: number | null = null;
  for (let y = FIGURE_BOX_BOTTOM; y >= 0 && figureBottom === null; y -= 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (gridGet(grid, x, y) !== TRANSPARENT) {
        figureBottom = y;
        break;
      }
    }
  }
  if (figureBottom !== SPRITE_ANCHOR.y - 1) {
    errors.push(
      `figure bottom is row ${figureBottom}, must be ${SPRITE_ANCHOR.y - 1} so the feet meet the anchor`,
    );
  }
  if (bounds === null) errors.push("master is empty");

  const orphanClusters = colorClusters(grid).filter(
    (c) => c.size === 1 && c.color !== OUTLINE_INDEX && !EMISSIVE_INDICES.has(c.color),
  ).length;
  if (orphanClusters > CLUSTER_ALLOWANCE) {
    warnings.push(
      `${orphanClusters} orphan 1px clusters (Appendix C.2 allows ${CLUSTER_ALLOWANCE}: eyes, line-step ticks)`,
    );
  }

  if (outlineGaps.length > 0) errors.push(`${outlineGaps.length} interior pixels touch transparency — the outline is open`);
  if (edgeBleed.length > 0) errors.push(`${edgeBleed.length} body pixels on the reserved 1px canvas ring`);
  if (haloViolations.length > 0) errors.push(`${haloViolations.length} emissive pixels carry a soot-900 edge instead of a halo`);
  if (subFloorIntruders.length > 0) errors.push(`${subFloorIntruders.length} non-outline pixels in the sub-floor band`);
  if (!colorIndices.includes(OUTLINE_INDEX)) errors.push(`no ${OUTLINE_COLOR} outline present`);
  if (stats.ambiguous.length > 0) {
    warnings.push(
      `${stats.ambiguous.length} pixels quantized by a margin smaller than the move itself — the source colors are drifting far enough to change decisions`,
    );
  }

  return {
    ok: errors.length === 0,
    width: grid.width,
    height: grid.height,
    movedCount: stats.movedCount,
    opaqueCount: opaque,
    maxDistance: stats.maxDistance,
    meanDistance: stats.meanDistance,
    farMoves: stats.farMoves,
    ambiguous: stats.ambiguous,
    colorCount: colorIndices.length,
    colors,
    amberPixels,
    amberBudget: AMBER_BUDGET,
    teamTintPixels,
    outlineGaps,
    edgeBleed,
    haloViolations,
    figureBottom,
    subFloorIntruders,
    orphanClusters,
    errors,
    warnings,
  };
}

/**
 * Appendix C.2 permits singletons only for eye dots, line-step ticks and
 * emissive cores. Two eyes plus a handful of ticks is the working allowance.
 */
export const CLUSTER_ALLOWANCE = 12;

/** A human-readable conformance report, for a build log or a review comment. */
export function formatReport(report: ConformanceReport, label = "master"): string {
  const lines: string[] = [];
  lines.push(`${label}: ${report.ok ? "CONFORMS" : "REJECTED"} (${report.width}x${report.height})`);
  lines.push(
    `  quantized ${report.movedCount}/${report.opaqueCount} px, mean move ${report.meanDistance.toFixed(1)}, worst ${report.maxDistance.toFixed(1)}`,
  );
  lines.push(`  colors ${report.colorCount}/${MAX_FRAME_COLORS}: ${report.colors.join(" ")}`);
  lines.push(`  amber ${report.amberPixels}/${report.amberBudget}, team tint ${report.teamTintPixels} px`);
  lines.push(`  figure bottom row ${report.figureBottom}, orphan clusters ${report.orphanClusters}`);
  if (report.ambiguous.length > 0) {
    const worst = report.ambiguous[0];
    lines.push(
      `  ambiguous ${report.ambiguous.length} px, e.g. ${worst?.from} -> ${worst?.to} (runner-up ${worst?.runnerUp}, margin ${worst?.margin.toFixed(1)})`,
    );
  }
  for (const move of report.farMoves.slice(0, 12)) {
    lines.push(`  moved (${move.x},${move.y}) ${move.from} -> ${move.to} by ${move.distance.toFixed(1)}`);
  }
  if (report.farMoves.length > 12) lines.push(`  ... and ${report.farMoves.length - 12} more far moves`);
  for (const error of report.errors) lines.push(`  ERROR ${error}`);
  for (const warning of report.warnings) lines.push(`  warn  ${warning}`);
  return lines.join("\n");
}

/** Swap one team's tint indices for another's, and nothing else. */
export function retint(grid: PixelGrid, from: readonly number[], to: readonly number[]): PixelGrid {
  const map = new Map<number, number>();
  for (let i = 0; i < from.length; i += 1) map.set(from[i] as number, to[i] as number);
  const out = createGrid(grid.width, grid.height);
  for (let i = 0; i < grid.data.length; i += 1) {
    const value = grid.data[i] ?? TRANSPARENT;
    out.data[i] = map.get(value) ?? value;
  }
  return out;
}
