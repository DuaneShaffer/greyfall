// External master intake (ART_DIRECTION Appendix C.8). Takes a 32x48 RGBA
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
/** §2: no more than ~5% of a frame's pixels from the amber ramp. */
export const AMBER_BUDGET = Math.floor(CANVAS_PIXELS * 0.05);
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
    report: auditGrid(grid, {
      movedCount,
      opaqueCount: opaque,
      maxDistance,
      meanDistance: movedCount === 0 ? 0 : distanceSum / movedCount,
      farMoves: moves,
      ambiguous,
    }, options),
  };
}

interface QuantizeStats {
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
    errors.push(`${amberPixels} amber pixels, budget is ${AMBER_BUDGET} (~5% of the canvas)`);
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
