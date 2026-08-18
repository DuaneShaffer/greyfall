// The tile texture set: identity, the quantization target per material, and the
// terrain audit (ART_DIRECTION §5 and D.4, `art-src/TERRAIN_BRIEFS.md`).
//
// §5 fixes nine faces — five tops and four sides, because `rail` shares `plain`'s
// sides — at 32x32 and 32x16, delivered at 4x and box-filtered down. This module
// is the art side of that: what each face is allowed to be made of, and what a
// finished grid is measured against.
//
// The audit is deliberately NOT `auditGrid`. That one checks a figure box, a feet
// anchor row, a closed silhouette outline and a sub-floor band; a tile face has
// none of those. What a tile face has instead is a seam that must not show when
// it is laid 300 times, a strata band the player counts height with, and a very
// short list of colours it is allowed to be made of. Like every other intake step
// here, it **reports and never repairs** (C.8.2).

import type { TerrainType } from "../data/schemas/map.js";
import { PALETTE, RAMPS, hexToRgb, relativeLuminance, type Hex } from "./palette.js";
import {
  AMBER_INDICES,
  COPPER_300_INDEX,
  INDEXED_PALETTE,
  RESERVED_INDICES,
  distinctColors,
  gridGet,
  histogram,
  paletteIndex,
  type PixelGrid,
} from "./pixel.js";
import { HEIGHT_STEP_PX, TILE_TEXTURE_SIZE } from "./sprites.js";

export type TileFace = "top" | "side";

export type TileTextureId =
  | "plain-top"
  | "plain-side"
  | "impassable-top"
  | "impassable-side"
  | "rail-top"
  | "rough-top"
  | "rough-side"
  | "water-top"
  | "water-side";

/** Delivery is 4x the shipped size (ART_DIRECTION D.4). */
export const TILE_MASTER_SCALE = 4;

/** §5: the top 2 shipped rows of a side face are the strata cut line. */
export const STRATA_BAND_ROWS = 2;

/** §5's ceiling on a tile face. A face over it declares its own `colorCeiling`. */
export const MAX_TILE_COLORS = 6;

export type StrataRule = "flat" | "interrupted" | "none";

export interface TileTextureSpec {
  readonly id: TileTextureId;
  readonly terrain: Exclude<TerrainType, "void">;
  readonly face: TileFace;
  readonly width: number;
  readonly height: number;
  /** Quantization target: this material's own ramps and nothing else. */
  readonly allowed: readonly Hex[];
  readonly strata: StrataRule;
  /** True only where §5 puts the ground plane's one shine: the rail head. */
  readonly railMetal: boolean;
  /** Edges that must wrap for the face to tile without a visible grid of seams. */
  readonly wraps: { readonly horizontal: boolean; readonly vertical: boolean };
  /**
   * Per-face raise of `MAX_TILE_COLORS`, for a delivered face whose reduction
   * lands over §5's ceiling and ships anyway. Declared here so the overage is a
   * named exception on a named face rather than a warning nobody reads: a face
   * with no ceiling of its own, or one that climbs past the one it declares,
   * fails the audit.
   */
  readonly colorCeiling?: number;
}

const SOOT = RAMPS.soot;
const UMBER = RAMPS.umber;

/**
 * The soot + umber materials plus the `soot-300` strata band: what every ground
 * face in the set is made of. Passing this as `allowed` is not a nicety — it is
 * the documented defence against the `soot-900`/`umber-900` near-collision of
 * C.8.2, and terrain is the surface with the most near-black in it. It also
 * makes "zero amber" and "no overload/veinglass/blood/steel/bone" true by
 * construction rather than by inspection.
 */
export const TERRAIN_RAMP: readonly Hex[] = [...SOOT, ...UMBER];
/** Rail is the one material with metal in it, and the only `copper-300` in the set. */
export const RAIL_RAMP: readonly Hex[] = [...TERRAIN_RAMP, ...RAMPS.copper];
/** Water is the one material with the damp ramp in it. */
export const WATER_RAMP: readonly Hex[] = [...TERRAIN_RAMP, ...RAMPS.verdigris];

const TOP = { width: TILE_TEXTURE_SIZE, height: TILE_TEXTURE_SIZE } as const;
const SIDE = { width: TILE_TEXTURE_SIZE, height: HEIGHT_STEP_PX } as const;
const TOP_WRAPS = { horizontal: true, vertical: true } as const;
/**
 * A side face wraps horizontally and is *measured* vertically, but not required
 * to wrap there. §5 puts a lighter cut line across the top 2 rows and nothing
 * across the bottom, so a face stacked on a copy of itself must step from dark
 * masonry to light cut line at every height unit — that discontinuity is not a
 * seam, it is the thing the player counts steps with, and warning about it would
 * be warning about the spec.
 */
const SIDE_WRAPS = { horizontal: true, vertical: false } as const;

export const TILE_TEXTURE: Readonly<Record<TileTextureId, TileTextureSpec>> = {
  "plain-top": {
    id: "plain-top",
    terrain: "plain",
    face: "top",
    ...TOP,
    allowed: TERRAIN_RAMP,
    strata: "none",
    railMetal: false,
    wraps: TOP_WRAPS,
  },
  "plain-side": {
    id: "plain-side",
    terrain: "plain",
    face: "side",
    ...SIDE,
    allowed: TERRAIN_RAMP,
    strata: "flat",
    railMetal: false,
    wraps: SIDE_WRAPS,
  },
  "impassable-top": {
    id: "impassable-top",
    terrain: "impassable",
    face: "top",
    ...TOP,
    allowed: TERRAIN_RAMP,
    strata: "none",
    railMetal: false,
    wraps: TOP_WRAPS,
  },
  "impassable-side": {
    id: "impassable-side",
    terrain: "impassable",
    face: "side",
    ...SIDE,
    allowed: TERRAIN_RAMP,
    strata: "none",
    railMetal: false,
    wraps: SIDE_WRAPS,
    // The delivered painting spends the whole dark half of soot and umber on
    // this face: `soot-900` for the deepest cavity is the seventh colour.
    colorCeiling: 7,
  },
  "rail-top": {
    id: "rail-top",
    terrain: "rail",
    face: "top",
    ...TOP,
    allowed: RAIL_RAMP,
    strata: "none",
    railMetal: true,
    wraps: TOP_WRAPS,
    // Same seven as `impassable-side`: the ballast shadow between the ties
    // reaches `soot-900`.
    colorCeiling: 7,
  },
  "rough-top": {
    id: "rough-top",
    terrain: "rough",
    face: "top",
    ...TOP,
    allowed: TERRAIN_RAMP,
    strata: "none",
    railMetal: false,
    wraps: TOP_WRAPS,
  },
  "rough-side": {
    id: "rough-side",
    terrain: "rough",
    face: "side",
    ...SIDE,
    allowed: TERRAIN_RAMP,
    strata: "interrupted",
    railMetal: false,
    wraps: SIDE_WRAPS,
  },
  "water-top": {
    id: "water-top",
    terrain: "water",
    face: "top",
    ...TOP,
    allowed: WATER_RAMP,
    strata: "none",
    railMetal: false,
    wraps: TOP_WRAPS,
  },
  "water-side": {
    id: "water-side",
    terrain: "water",
    face: "side",
    ...SIDE,
    allowed: WATER_RAMP,
    strata: "flat",
    railMetal: false,
    wraps: SIDE_WRAPS,
  },
};

export const TILE_TEXTURE_IDS = Object.keys(TILE_TEXTURE) as readonly TileTextureId[];

/**
 * Which texture a terrain face wears. `void` is a hole and draws nothing; `rail`
 * has no side of its own — §5 gives it `plain`'s, and the briefs say so again —
 * so the set is nine textures, not ten.
 */
export function tileTextureFor(terrain: TerrainType, face: TileFace): TileTextureId | null {
  if (terrain === "void") return null;
  if (terrain === "rail" && face === "side") return "plain-side";
  return `${terrain}-${face}` as TileTextureId;
}

const rgbOf = (index: number): readonly [number, number, number] => {
  const hex = INDEXED_PALETTE[index];
  return hex === null || hex === undefined ? [0, 0, 0] : hexToRgb(hex);
};

const channelDelta = (a: number, b: number): number => {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  return (Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)) / 3;
};

export interface SeamMeasure {
  /**
   * Mean per-channel step across the wrap join: pixel (w-1,y) laid beside (0,y).
   * The number that matters is not this on its own but its ratio to the
   * texture's own internal step — a grainy material has a big step everywhere.
   */
  readonly edgeStep: number;
  /** Mean per-channel step between neighbouring interior pixels, same axis. */
  readonly interiorStep: number;
  /** `edgeStep / interiorStep`. 1 is invisible; the eye starts finding 2. */
  readonly ratio: number;
  /** Pixels across the join that are not the same palette index. */
  readonly mismatches: number;
  readonly length: number;
}

const measureSeam = (grid: PixelGrid, axis: "horizontal" | "vertical"): SeamMeasure => {
  const { width, height } = grid;
  let edge = 0;
  let interior = 0;
  let interiorTaps = 0;
  let mismatches = 0;
  const length = axis === "horizontal" ? height : width;
  for (let i = 0; i < length; i += 1) {
    const a = axis === "horizontal" ? gridGet(grid, width - 1, i) : gridGet(grid, i, height - 1);
    const b = axis === "horizontal" ? gridGet(grid, 0, i) : gridGet(grid, i, 0);
    edge += channelDelta(a, b);
    if (a !== b) mismatches += 1;
  }
  const span = axis === "horizontal" ? width : height;
  for (let i = 0; i < length; i += 1) {
    for (let j = 0; j + 1 < span; j += 1) {
      const a = axis === "horizontal" ? gridGet(grid, j, i) : gridGet(grid, i, j);
      const b = axis === "horizontal" ? gridGet(grid, j + 1, i) : gridGet(grid, i, j + 1);
      interior += channelDelta(a, b);
      interiorTaps += 1;
    }
  }
  const edgeStep = edge / length;
  const interiorStep = interiorTaps === 0 ? 0 : interior / interiorTaps;
  return {
    edgeStep,
    interiorStep,
    ratio: interiorStep === 0 ? (edgeStep === 0 ? 1 : Number.POSITIVE_INFINITY) : edgeStep / interiorStep,
    mismatches,
    length,
  };
};

export interface BandMeasure {
  readonly rows: readonly number[];
  /** Rows in the band that are a single palette index end to end. */
  readonly flatRows: number;
  readonly colors: readonly Hex[];
  /** Share of band pixels sitting on `soot-300`, the §5 cut-line colour. */
  readonly cutLineShare: number;
  /** Share of band pixels lighter than the body's mean — the band as drawn. */
  readonly lighterShare: number;
  readonly meanLuminance: number;
  readonly bodyMeanLuminance: number;
}

const STRATA_COLOR = PALETTE["soot-300"];
const STRATA_INDEX = paletteIndex(STRATA_COLOR);

const measureBand = (grid: PixelGrid, rows: readonly number[]): BandMeasure => {
  const bodyRows: number[] = [];
  for (let y = 0; y < grid.height; y += 1) if (!rows.includes(y)) bodyRows.push(y);
  const lum = (index: number) => {
    const hex = INDEXED_PALETTE[index];
    return hex === null || hex === undefined ? 0 : relativeLuminance(hex);
  };
  const mean = (ys: readonly number[]) => {
    let sum = 0;
    let n = 0;
    for (const y of ys)
      for (let x = 0; x < grid.width; x += 1) {
        sum += lum(gridGet(grid, x, y));
        n += 1;
      }
    return n === 0 ? 0 : sum / n;
  };
  const bodyMean = mean(bodyRows);
  const colors = new Set<number>();
  let flatRows = 0;
  let cutLine = 0;
  let lighter = 0;
  let n = 0;
  for (const y of rows) {
    let uniform = true;
    const first = gridGet(grid, 0, y);
    for (let x = 0; x < grid.width; x += 1) {
      const index = gridGet(grid, x, y);
      colors.add(index);
      if (index !== first) uniform = false;
      if (index === STRATA_INDEX) cutLine += 1;
      if (lum(index) > bodyMean) lighter += 1;
      n += 1;
    }
    if (uniform) flatRows += 1;
  }
  return {
    rows,
    flatRows,
    colors: [...colors].sort((a, b) => a - b).map((i) => INDEXED_PALETTE[i] as Hex),
    cutLineShare: n === 0 ? 0 : cutLine / n,
    lighterShare: n === 0 ? 0 : lighter / n,
    meanLuminance: mean(rows),
    bodyMeanLuminance: bodyMean,
  };
};

export interface TileAudit {
  readonly id: TileTextureId;
  readonly ok: boolean;
  readonly width: number;
  readonly height: number;
  readonly colors: readonly Hex[];
  readonly colorCount: number;
  /** `MAX_TILE_COLORS`, or the face's own declared raise of it. */
  readonly colorCeiling: number;
  readonly amberPixels: number;
  readonly reservedPixels: number;
  readonly copper300Pixels: number;
  readonly outsideRampPixels: number;
  readonly seamHorizontal: SeamMeasure;
  readonly seamVertical: SeamMeasure;
  /** Top `STRATA_BAND_ROWS` rows — where §5 puts the cut line. */
  readonly bandTop: BandMeasure;
  /** Bottom `STRATA_BAND_ROWS` rows — where this delivery drew it. */
  readonly bandBottom: BandMeasure;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** A wrap join this much worse than the material's own grain reads as a seam. */
export const SEAM_RATIO_LIMIT = 2;

/**
 * Measure a finished tile grid against §5. Everything here is a measurement plus
 * a verdict on that measurement; nothing is altered.
 */
export function auditTile(grid: PixelGrid, spec: TileTextureSpec): TileAudit {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (grid.width !== spec.width || grid.height !== spec.height) {
    errors.push(`face is ${grid.width}x${grid.height}, §5 fixes ${spec.width}x${spec.height}`);
  }

  const counts = histogram(grid);
  const colorIndices = [...distinctColors(grid)].sort((a, b) => a - b);
  const colors = colorIndices.map((index) => INDEXED_PALETTE[index] as Hex);
  const colorCeiling = spec.colorCeiling ?? MAX_TILE_COLORS;
  if (colors.length > colorCeiling) {
    errors.push(
      `${colors.length} colours, the brief's ceiling is ${MAX_TILE_COLORS}` +
        (spec.colorCeiling === undefined ? "" : ` and this face declares ${spec.colorCeiling}`),
    );
  }

  const allowedIndices = new Set(spec.allowed.map((hex) => paletteIndex(hex)));
  let amberPixels = 0;
  let reservedPixels = 0;
  let copper300Pixels = 0;
  let outsideRampPixels = 0;
  for (const [index, count] of counts) {
    if (AMBER_INDICES.has(index)) amberPixels += count;
    if (RESERVED_INDICES.has(index)) reservedPixels += count;
    if (index === COPPER_300_INDEX) copper300Pixels += count;
    if (!allowedIndices.has(index)) outsideRampPixels += count;
  }
  if (amberPixels > 0) errors.push(`${amberPixels} amber pixels — the ground is never powered`);
  if (reservedPixels > 0) errors.push(`${reservedPixels} pixels from a reserved signal ramp`);
  if (outsideRampPixels > 0) errors.push(`${outsideRampPixels} pixels outside this material's ramp`);
  if (copper300Pixels > 0 && !spec.railMetal) {
    errors.push(`${copper300Pixels} copper-300 pixels — the rail head is the only shine on the ground plane`);
  }

  const seamHorizontal = measureSeam(grid, "horizontal");
  const seamVertical = measureSeam(grid, "vertical");
  if (spec.wraps.horizontal && seamHorizontal.ratio > SEAM_RATIO_LIMIT) {
    warnings.push(`east/west wrap steps ${seamHorizontal.ratio.toFixed(2)}x the material's own grain`);
  }
  if (spec.wraps.vertical && seamVertical.ratio > SEAM_RATIO_LIMIT) {
    warnings.push(`north/south wrap steps ${seamVertical.ratio.toFixed(2)}x the material's own grain`);
  }

  const topRows = Array.from({ length: Math.min(STRATA_BAND_ROWS, grid.height) }, (_, i) => i);
  const bottomRows = topRows.map((i) => grid.height - 1 - i).reverse();
  const bandTop = measureBand(grid, topRows);
  const bandBottom = measureBand(grid, bottomRows);

  if (spec.face === "side") {
    if (spec.strata === "flat") {
      if (bandTop.flatRows < topRows.length) {
        warnings.push(
          `strata band is not flat: ${bandTop.flatRows}/${topRows.length} top rows are one colour (${bandTop.colors.join(" ")})`,
        );
      }
      if (bandTop.meanLuminance <= bandTop.bodyMeanLuminance) {
        errors.push("strata band is not lighter than the body — height is not countable from the cut face");
      }
    }
    if (spec.strata === "interrupted" && bandTop.lighterShare > 0.9) {
      warnings.push("strata band runs unbroken; rough ground's tell is a band broken into segments");
    }
    if (spec.strata === "none" && bandTop.meanLuminance > bandTop.bodyMeanLuminance * 1.5) {
      warnings.push("a cut line is showing on a face whose height must be uncountable");
    }
  }

  return {
    id: spec.id,
    ok: errors.length === 0,
    width: grid.width,
    height: grid.height,
    colors,
    colorCount: colors.length,
    colorCeiling,
    amberPixels,
    reservedPixels,
    copper300Pixels,
    outsideRampPixels,
    seamHorizontal,
    seamVertical,
    bandTop,
    bandBottom,
    errors,
    warnings,
  };
}

export function formatTileAudit(audit: TileAudit): string {
  const seam = (name: string, m: SeamMeasure) =>
    `  ${name} wrap: edge step ${m.edgeStep.toFixed(1)}, interior step ${m.interiorStep.toFixed(1)}, ratio ${m.ratio.toFixed(2)}, ${m.mismatches}/${m.length} px differ`;
  const band = (name: string, m: BandMeasure) =>
    `  ${name} rows ${m.rows.join(",")}: ${m.flatRows} flat, ${m.colors.join(" ")}, soot-300 ${(m.cutLineShare * 100).toFixed(0)}%, lighter-than-body ${(m.lighterShare * 100).toFixed(0)}%, luminance ${m.meanLuminance.toFixed(4)} vs body ${m.bodyMeanLuminance.toFixed(4)}`;
  const lines = [
    `${audit.id}: ${audit.ok ? "CONFORMS" : "REJECTED"} (${audit.width}x${audit.height})`,
    `  colours ${audit.colorCount}/${audit.colorCeiling}: ${audit.colors.join(" ")}`,
    `  amber ${audit.amberPixels}, reserved ramps ${audit.reservedPixels}, copper-300 ${audit.copper300Pixels}, off-ramp ${audit.outsideRampPixels}`,
    seam("east/west", audit.seamHorizontal),
    seam("north/south", audit.seamVertical),
    band("band top", audit.bandTop),
    band("band bottom", audit.bandBottom),
  ];
  for (const error of audit.errors) lines.push(`  ERROR ${error}`);
  for (const warning of audit.warnings) lines.push(`  warn  ${warning}`);
  return lines.join("\n");
}

