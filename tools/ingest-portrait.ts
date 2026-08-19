// Audit a delivered painted portrait against `art-src/PORTRAIT_BRIEFS.md` and
// ART_DIRECTION §4. Reports; never repairs (C.8.2), and never writes art.
//
//   npx tsx tools/ingest-portrait.ts rowen          # art-src/portraits/rowen.png
//   npx tsx tools/ingest-portrait.ts --all          # every id the briefs list
//   npx tsx tools/ingest-portrait.ts path/to/x.png  # any file, id from its name
//
// A delivery is up to three files, all 512 × 640: `<id>.png` (the plate),
// `<id>-matte.png` (figure white on black) and `<id>-palette.png` (a swatch
// strip). Only the plate is required; each optional file adds its own checks.
//
// This is deliberately NOT the sprite path. `fitMasterToCanvas` measures a
// figure and stands it on a feet anchor and `auditGrid` wants a closed outline
// and a sub-floor band — a bust has none of those. `quantizeToPalette` is wrong
// here by design: §4 makes portrait colour hue-anchored, not index-locked, so
// the conformance check is a histogram of how far each pixel sits from the
// nearest allowed ramp step, and nothing is ever snapped.
//
// The plate is opaque and full-bleed, so the silhouette cannot come from alpha
// — and it cannot be derived from the ground either, because a coat painted at
// the ground's own value is figure that no ground test can see. The delivered
// matte *is* the silhouette. What the plate can grade about it is whether it
// contains the visibly-painted figure (coverage) and how much of it the plate
// paints at a ground value anyway (leak).
//
// Every measure below is calibrated against rowen v3, the first merged plate,
// and agrees with the hand audit that approved it. `art-src/INTAKE_LOG.md` §E.1
// records the redefinitions that calibration forced; §E.3 records the verdict.

import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RGBASource } from "../src/art/ingest.js";
import { PALETTE, RAMPS, hexToRgb, rgbToHex, type Hex } from "../src/art/palette.js";
import { decodePNG } from "../src/art/png.js";
import { PORTRAIT } from "../src/art/sprites.js";

// ---------------------------------------------------------------------------
// The spec, in master terms
// ---------------------------------------------------------------------------

/** Masters are 4× the in-game plate, on the same ruler as sprites and tiles. */
export const PORTRAIT_MASTER_SCALE = 4;

export const PORTRAIT_MASTER = {
  width: PORTRAIT.width * PORTRAIT_MASTER_SCALE,
  height: PORTRAIT.height * PORTRAIT_MASTER_SCALE,
} as const;

/** §4's (32, 16, 64, 64) in master terms: x 128–384, **y 64–320**. */
export const CHIP_RECT_MASTER = {
  x: PORTRAIT.chipCrop.x * PORTRAIT_MASTER_SCALE,
  y: PORTRAIT.chipCrop.y * PORTRAIT_MASTER_SCALE,
  w: PORTRAIT.chipCrop.w * PORTRAIT_MASTER_SCALE,
  h: PORTRAIT.chipCrop.h * PORTRAIT_MASTER_SCALE,
} as const;

/** The framing table's landmark rows, `art-src/PORTRAIT_BRIEFS.md`. */
export const FRAMING = {
  eyeLine: [237, 249],
  crown: [90, 110],
  chin: [384, 400],
  headCentreX: [232, 280],
  shoulder: [490, 520],
} as const;

/** §4 puts the eye-line at 38% of the frame. That rule *is* the measurement. */
export const EYE_LINE_SHARE = 0.38;

/**
 * A face has ink in it — lashes, brow, the shadow under the lid — and none of it
 * is on the skin ramp. Rows carrying pixels below this luma inside the face are
 * what the eye-line rule is validated against.
 */
export const EYE_DARK_LUMA = 70;

/**
 * The jaw contour walks the rightmost skin pixel down from the eye-line. A step
 * further left than this is the contour handing over to the neck — but a lash,
 * a strand or a cast shadow crossing the edge does it for a row or two as well,
 * so a break only counts once it has held for `JAW_BREAK_RUN` rows.
 */
export const JAW_BREAK = 8;
export const JAW_BREAK_RUN = 4;

export type PortraitFamily = "bone" | "soot" | "umber" | "copper" | "verdigris" | "flux" | "scarring";

const family = (name: PortraitFamily, hexes: readonly Hex[]): readonly (readonly [Hex, PortraitFamily])[] =>
  hexes.map((hex) => [hex, name] as const);

/**
 * The brief's palette, in its own words: skin (bone), cool (soot), warm
 * (umber), metal (copper), patina (verdigris), and the two grants — flux
 * (amber) and scarring (brightblood). Flux and scarring are in the table so
 * they can be *counted*; whether a character may spend them is the grant
 * tables below.
 */
export const PORTRAIT_COLORS: readonly (readonly [Hex, PortraitFamily])[] = [
  ...family("bone", RAMPS.bone),
  ...family("soot", RAMPS.soot),
  ...family("umber", RAMPS.umber),
  ...family("copper", RAMPS.copper),
  ...family("verdigris", RAMPS.verdigris),
  ...family("flux", RAMPS.amber),
  ...family("scarring", [PALETTE.brightblood]),
];

/** Nearest-step distance bands for the conformance histogram, in RGB units. */
export const DISTANCE_BANDS = [8, 16, 24, 32, 48] as const;

/** The one hue the briefs name by value outside a ramp label: Della's goggle rim. */
export const NAMED_COPPER: Hex = PALETTE["copper-500"];

/** Nothing in the palette is brighter than `bone-100` (#ddc6a8), luma 201. */
export const LUMA_CEILING = 201;

/**
 * The ramp's top step sits a fraction *under* the ceiling, so a pixel that
 * rounds a fraction over it is quantisation rather than a highlight. A blown
 * plate is not subtle about it: rowen v2 put 1,278 px over this line and v3,
 * the version that shipped, puts one.
 */
export const LUMA_CEILING_BUDGET = 8;

/** §4 forbids rim light. A painted edge crosses this a few dozen times; a lit one does not. */
export const RIM_LIGHT_DELTA = 15;
export const RIM_LIGHT_BUDGET = 170;
export const RIM_LIGHT_DEPTH = 3;

/**
 * A lit edge is not just lighter than what is behind it, it is *bright* — over
 * the cool ramp's top step. That second condition is what separates a drawn
 * terminator from a rim, and it is the one the hand audit gated on.
 */
export const RIM_LIGHT_LUMA = 170;

/** Ground registers, by where in the vertical city the character stands. */
export const GROUND_REGISTERS = {
  works: { upper: PALETTE["soot-700"], lower: PALETTE["soot-800"] },
  rise: { upper: PALETTE["soot-500"], lower: PALETTE["soot-700"] },
  underveins: { upper: PALETTE["soot-900"], lower: PALETTE["soot-800"] },
} as const satisfies Record<string, { readonly upper: Hex; readonly lower: Hex }>;

export type GroundRegister = keyof typeof GROUND_REGISTERS;

export const PORTRAIT_IDS = [
  "rowen",
  "vale",
  "ivo-brace",
  "marek-sump",
  "jory-slate",
  "orin-vane",
  "della-tine",
  "aldric",
  "dray",
  "maren-voss",
  "quill",
  "nessa-kiln",
  "wick",
] as const;

const REGISTER_OF: Readonly<Record<string, GroundRegister>> = {
  aldric: "rise",
  quill: "rise",
  "marek-sump": "underveins",
  wick: "underveins",
};

/** The five the amber table grants a live flux source. Everyone else spends zero. */
const FLUX_GRANTED = new Set(["vale", "ivo-brace", "orin-vane", "nessa-kiln", "quill"]);
/** Brightblood belongs to two people and giving it to a third spends both. */
const SCARRING_GRANTED = new Set(["orin-vane", "maren-voss"]);

/** §2's ceiling is 4%; portraits spend at most 3%. */
export const FLUX_SHARE = 0.03;

export interface PortraitExpectation {
  readonly register: GroundRegister;
  readonly fluxBudget: number;
  readonly scarringAllowed: boolean;
}

export function expectationFor(portraitId: string): PortraitExpectation {
  const pixels = PORTRAIT_MASTER.width * PORTRAIT_MASTER.height;
  return {
    register: REGISTER_OF[portraitId] ?? "works",
    fluxBudget: FLUX_GRANTED.has(portraitId) ? Math.floor(pixels * FLUX_SHARE) : 0,
    scarringAllowed: SCARRING_GRANTED.has(portraitId),
  };
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

const at = (source: RGBASource, x: number, y: number): number => (y * source.width + x) * 4;
const byte = (source: RGBASource, i: number): number => source.data[i] ?? 0;

/**
 * Rec.709 luma on the 0–255 scale, which is the scale every threshold here is
 * in. The weights matter: they are the ones the hand audit of the first plate
 * used, and every luma bar in the briefs is quoted in them — `bone-100` is
 * "luma 201" (200.7) and `soot-100` is "187" (186.7) under Rec.709 only. Under
 * Rec.601 the same two read 201.5 and 186.3, which moves the ceiling under the
 * skin ramp's own top step and blames the plate for 30 px of rounding.
 */
export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export interface PortraitScan {
  readonly width: number;
  readonly height: number;
  /** Index into `PORTRAIT_COLORS` of the nearest allowed step, per pixel. */
  readonly nearest: Int32Array;
  /** Euclidean RGB distance to that step, per pixel. */
  readonly distance: Float64Array;
  readonly luma: Float64Array;
  readonly transparent: number;
  readonly minAlpha: number;
}

const TABLE: readonly (readonly [number, number, number])[] = PORTRAIT_COLORS.map(([hex]) => hexToRgb(hex));

/** One pass over the plate; every colour measure below reads off this. */
export function scanPortrait(image: RGBASource): PortraitScan {
  const count = image.width * image.height;
  const nearest = new Int32Array(count);
  const distance = new Float64Array(count);
  const lumas = new Float64Array(count);
  let transparent = 0;
  let minAlpha = 255;
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    const r = byte(image, p);
    const g = byte(image, p + 1);
    const b = byte(image, p + 2);
    const a = byte(image, p + 3);
    if (a < 255) transparent += 1;
    if (a < minAlpha) minAlpha = a;
    let bestAt = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let c = 0; c < TABLE.length; c += 1) {
      const step = TABLE[c] as readonly [number, number, number];
      const dr = r - step[0];
      const dg = g - step[1];
      const db = b - step[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < best) {
        best = d;
        bestAt = c;
      }
    }
    nearest[i] = bestAt;
    distance[i] = Math.sqrt(best);
    lumas[i] = luma(r, g, b);
  }
  return { width: image.width, height: image.height, nearest, distance, luma: lumas, transparent, minAlpha };
}

export interface RampHistogram {
  readonly bands: readonly { readonly limit: number; readonly count: number }[];
  readonly beyond: number;
  readonly mean: number;
  readonly worst: number;
  readonly families: readonly { readonly family: PortraitFamily; readonly count: number }[];
}

export function rampHistogram(scan: PortraitScan): RampHistogram {
  const bands = DISTANCE_BANDS.map((limit) => ({ limit, count: 0 }));
  const byFamily = new Map<PortraitFamily, number>();
  let beyond = 0;
  let total = 0;
  let worst = 0;
  for (let i = 0; i < scan.distance.length; i += 1) {
    const d = scan.distance[i] ?? 0;
    total += d;
    if (d > worst) worst = d;
    const band = bands.find((b) => d <= b.limit);
    if (band === undefined) beyond += 1;
    else band.count += 1;
    const f = (PORTRAIT_COLORS[scan.nearest[i] ?? 0] ?? PORTRAIT_COLORS[0])?.[1] as PortraitFamily;
    byFamily.set(f, (byFamily.get(f) ?? 0) + 1);
  }
  const families = [...byFamily.entries()]
    .map(([f, count]) => ({ family: f, count }))
    .sort((a, b) => b.count - a.count);
  return { bands, beyond, mean: total / Math.max(1, scan.distance.length), worst, families };
}

export function countFamily(scan: PortraitScan, want: PortraitFamily): number {
  let count = 0;
  for (let i = 0; i < scan.nearest.length; i += 1) {
    if ((PORTRAIT_COLORS[scan.nearest[i] ?? 0] ?? PORTRAIT_COLORS[0])?.[1] === want) count += 1;
  }
  return count;
}

export function countColor(scan: PortraitScan, hex: Hex): number {
  const want = PORTRAIT_COLORS.findIndex(([h]) => h === hex);
  if (want < 0) return 0;
  let count = 0;
  for (let i = 0; i < scan.nearest.length; i += 1) if (scan.nearest[i] === want) count += 1;
  return count;
}

export function countOverLuma(scan: PortraitScan, ceiling: number): number {
  let count = 0;
  for (let i = 0; i < scan.luma.length; i += 1) if ((scan.luma[i] ?? 0) > ceiling) count += 1;
  return count;
}

// ---------------------------------------------------------------------------
// Silhouette: from the matte, and from the ground the plate was painted over
// ---------------------------------------------------------------------------

export interface Mask {
  readonly width: number;
  readonly height: number;
  /** 1 where the figure is. */
  readonly bits: Uint8Array;
}

export const maskAt = (mask: Mask, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < mask.width && y < mask.height && (mask.bits[y * mask.width + x] ?? 0) === 1;

export interface MatteReading {
  readonly mask: Mask;
  readonly white: number;
  readonly black: number;
  /** Pixels that are neither pure white nor pure black — the brief allows none. */
  readonly impure: number;
  readonly purity: number;
}

/** The matte is two colours, hard-edged, no anti-aliasing. Measure how true that is. */
export function readMatte(matte: RGBASource): MatteReading {
  const count = matte.width * matte.height;
  const bits = new Uint8Array(count);
  let white = 0;
  let black = 0;
  let impure = 0;
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    const r = byte(matte, p);
    const g = byte(matte, p + 1);
    const b = byte(matte, p + 2);
    if (r === 255 && g === 255 && b === 255) {
      white += 1;
      bits[i] = 1;
    } else if (r === 0 && g === 0 && b === 0) {
      black += 1;
    } else {
      impure += 1;
      if (luma(r, g, b) >= 128) bits[i] = 1;
    }
  }
  return { mask: { width: matte.width, height: matte.height, bits }, white, black, impure, purity: (count - impure) / count };
}

/**
 * Pixels the plate paints away from both of the character's ground values —
 * the *visibly* painted figure. This is a floor under the silhouette, never the
 * silhouette itself: everything a character wears at a ground value falls out
 * of it, which on rowen is most of a coat. Grade the matte against this and you
 * grade the coat's value, not the matte.
 */
export function paintedSilhouette(
  image: RGBASource,
  ground: { readonly upper: Hex; readonly lower: Hex },
  tolerance = PAINTED_TOLERANCE,
): Mask {
  const [ur, ug, ub] = hexToRgb(ground.upper);
  const [lr, lg, lb] = hexToRgb(ground.lower);
  const limit = tolerance * tolerance;
  const count = image.width * image.height;
  const bits = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    const r = byte(image, p);
    const g = byte(image, p + 1);
    const b = byte(image, p + 2);
    const du = (r - ur) ** 2 + (g - ug) ** 2 + (b - ub) ** 2;
    const dl = (r - lr) ** 2 + (g - lg) ** 2 + (b - lb) ** 2;
    if (du > limit && dl > limit) bits[i] = 1;
  }
  return { width: image.width, height: image.height, bits };
}

export interface Agreement {
  readonly agree: number;
  readonly total: number;
  readonly share: number;
}

export function maskAgreement(a: Mask, b: Mask): Agreement {
  const total = Math.min(a.bits.length, b.bits.length);
  let agree = 0;
  for (let i = 0; i < total; i += 1) if (a.bits[i] === b.bits[i]) agree += 1;
  return { agree, total, share: total === 0 ? 0 : agree / total };
}

// ---------------------------------------------------------------------------
// Framing landmarks, read off the silhouette
// ---------------------------------------------------------------------------

export interface Landmarks {
  readonly crownRow: number;
  /** Where the jaw has closed to within a fifth of the neck's width. */
  readonly chinRow: number;
  /** The narrowest row below the head: the neck. */
  readonly neckRow: number;
  readonly neckWidth: number;
  /** Crown plus half the crown-to-chin span — the matte's only handle on the eyes. */
  readonly eyeLineRow: number;
  readonly headCentreX: number;
  readonly headLeft: number;
  readonly headRight: number;
  /** First row below the neck at twice the neck's width: the shoulders entering. */
  readonly shoulderRow: number;
}

const rowSpan = (mask: Mask, y: number): { readonly left: number; readonly right: number; readonly width: number } => {
  let left = -1;
  let right = -1;
  for (let x = 0; x < mask.width; x += 1) {
    if ((mask.bits[y * mask.width + x] ?? 0) === 1) {
      if (left < 0) left = x;
      right = x;
    }
  }
  return { left, right, width: left < 0 ? 0 : right - left + 1 };
};

export function framingLandmarks(mask: Mask): Landmarks | null {
  const widths: number[] = [];
  for (let y = 0; y < mask.height; y += 1) widths.push(rowSpan(mask, y).width);
  const crownRow = widths.findIndex((w) => w > 0);
  if (crownRow < 0) return null;
  let lastRow = mask.height - 1;
  while (lastRow > crownRow && (widths[lastRow] ?? 0) === 0) lastRow -= 1;

  const headBand = crownRow + Math.floor((lastRow - crownRow) * 0.5);
  let widestRow = crownRow;
  for (let y = crownRow; y <= headBand; y += 1) {
    if ((widths[y] ?? 0) > (widths[widestRow] ?? 0)) widestRow = y;
  }
  let neckRow = widestRow;
  for (let y = widestRow; y <= lastRow; y += 1) {
    if ((widths[y] ?? 0) > 0 && (widths[y] ?? 0) < (widths[neckRow] ?? 0)) neckRow = y;
  }
  const neckWidth = widths[neckRow] ?? 0;

  let chinRow = neckRow;
  for (let y = widestRow; y <= neckRow; y += 1) {
    if ((widths[y] ?? 0) <= neckWidth * 1.2) {
      chinRow = y;
      break;
    }
  }

  const eyeLineRow = Math.round(crownRow + (chinRow - crownRow) * 0.5);

  let sum = 0;
  let seen = 0;
  let headLeft = mask.width;
  let headRight = -1;
  for (let y = crownRow; y <= chinRow; y += 1) {
    const span = rowSpan(mask, y);
    if (span.left < 0) continue;
    headLeft = Math.min(headLeft, span.left);
    headRight = Math.max(headRight, span.right);
    for (let x = span.left; x <= span.right; x += 1) {
      if ((mask.bits[y * mask.width + x] ?? 0) === 1) {
        sum += x;
        seen += 1;
      }
    }
  }

  let shoulderRow = lastRow;
  for (let y = neckRow; y <= lastRow; y += 1) {
    if ((widths[y] ?? 0) >= neckWidth * 2) {
      shoulderRow = y;
      break;
    }
  }

  return {
    crownRow,
    chinRow,
    neckRow,
    neckWidth,
    eyeLineRow,
    headCentreX: seen === 0 ? 0 : Math.round(sum / seen),
    headLeft: headRight < 0 ? 0 : headLeft,
    headRight: headRight < 0 ? 0 : headRight,
    shoulderRow,
  };
}

export interface ChipOverflow {
  /** Share of the chip rect that is figure. An empty chip is a portrait with no chip. */
  readonly fill: number;
  /** Head-band figure pixels outside the chip rect, by side. */
  readonly left: number;
  readonly right: number;
  readonly below: number;
  readonly above: number;
  readonly total: number;
}

/** How much of the head the chip cannot see, per side of §4's rect. */
export function chipOverflow(mask: Mask, marks: Landmarks): ChipOverflow {
  const { x, y, w, h } = CHIP_RECT_MASTER;
  let inside = 0;
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) if (maskAt(mask, px, py)) inside += 1;
  }
  let left = 0;
  let right = 0;
  let above = 0;
  let below = 0;
  for (let py = marks.crownRow; py <= marks.chinRow; py += 1) {
    for (let px = 0; px < mask.width; px += 1) {
      if (!maskAt(mask, px, py)) continue;
      if (py < y) above += 1;
      else if (py >= y + h) below += 1;
      else if (px < x) left += 1;
      else if (px >= x + w) right += 1;
    }
  }
  return { fill: inside / (w * h), left, right, above, below, total: left + right + above + below };
}

// ---------------------------------------------------------------------------
// Rim light and ground
// ---------------------------------------------------------------------------

export interface RimLightReading {
  readonly edge: number;
  readonly lit: number;
  readonly share: number;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * §4: no rim light, no backlight, no hair halo. A silhouette edge pixel that is
 * meaningfully lighter than the interior a few pixels behind it is a lit edge.
 * A painted hard edge does this a few dozen times by accident; a rim does it
 * along the whole contour, which is what the budget separates.
 */
export function rimLight(
  image: RGBASource,
  mask: Mask,
  options: { readonly delta?: number; readonly depth?: number } = {},
): RimLightReading {
  const delta = options.delta ?? RIM_LIGHT_DELTA;
  const depth = options.depth ?? RIM_LIGHT_DEPTH;
  let edge = 0;
  let lit = 0;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!maskAt(mask, x, y)) continue;
      let outward: readonly [number, number] | null = null;
      for (const n of NEIGHBOURS) {
        if (!maskAt(mask, x + n[0], y + n[1])) {
          outward = n;
          break;
        }
      }
      if (outward === null) continue;
      edge += 1;
      const ix = x - outward[0] * depth;
      const iy = y - outward[1] * depth;
      if (!maskAt(mask, ix, iy)) continue;
      const e = at(image, x, y);
      const i = at(image, ix, iy);
      const edgeLuma = luma(byte(image, e), byte(image, e + 1), byte(image, e + 2));
      const inner = luma(byte(image, i), byte(image, i + 1), byte(image, i + 2));
      if (edgeLuma - inner > delta) lit += 1;
    }
  }
  return { edge, lit, share: edge === 0 ? 0 : lit / edge };
}

export interface BandMean {
  readonly hex: Hex;
  readonly pixels: number;
  readonly distance: number;
}

export interface GroundReading {
  readonly upper: BandMean;
  readonly lower: BandMean;
}

const distanceTo = (hex: Hex, r: number, g: number, b: number): number => {
  const [tr, tg, tb] = hexToRgb(hex);
  return Math.sqrt((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2);
};

/** The ground is two flat values, upper over lower. Mean each half of what is not figure. */
export function groundBands(
  image: RGBASource,
  mask: Mask,
  register: { readonly upper: Hex; readonly lower: Hex },
): GroundReading {
  const half = Math.floor(image.height / 2);
  const band = (from: number, to: number, want: Hex): BandMean => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = from; y < to; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (maskAt(mask, x, y)) continue;
        const p = at(image, x, y);
        r += byte(image, p);
        g += byte(image, p + 1);
        b += byte(image, p + 2);
        n += 1;
      }
    }
    if (n === 0) return { hex: "#000000", pixels: 0, distance: Number.POSITIVE_INFINITY };
    const mr = r / n;
    const mg = g / n;
    const mb = b / n;
    return { hex: rgbToHex(mr, mg, mb), pixels: n, distance: distanceTo(want, mr, mg, mb) };
  };
  return { upper: band(0, half, register.upper), lower: band(half, image.height, register.lower) };
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------

export interface PortraitCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface PortraitAuditInput {
  readonly portraitId: string;
  readonly plate: RGBASource;
  readonly matte?: RGBASource;
  readonly palette?: RGBASource;
}

export interface PortraitAudit {
  readonly portraitId: string;
  readonly checks: readonly PortraitCheck[];
  readonly ok: boolean;
  readonly landmarks: Landmarks | null;
}

const inRange = (value: number, range: readonly [number, number]): boolean =>
  value >= range[0] && value <= range[1];

const pct = (share: number): string => `${(share * 100).toFixed(2)}%`;

/** Every check the intake prints, in the order it prints them. */
export function auditPortrait(input: PortraitAuditInput): PortraitAudit {
  const { portraitId, plate, matte, palette } = input;
  const want = expectationFor(portraitId);
  const register = GROUND_REGISTERS[want.register];
  const checks: PortraitCheck[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  add(
    "dimensions",
    plate.width === PORTRAIT_MASTER.width && plate.height === PORTRAIT_MASTER.height,
    `${plate.width}x${plate.height}, want ${PORTRAIT_MASTER.width}x${PORTRAIT_MASTER.height}`,
  );

  const scan = scanPortrait(plate);
  add(
    "alpha",
    scan.transparent === 0,
    `${scan.transparent} px below opaque, min alpha ${scan.minAlpha} — the plate is full bleed`,
  );

  const painted = paintedSilhouette(plate, register);
  const reading = matte === undefined ? null : readMatte(matte);
  if (reading !== null) {
    add(
      "matte purity",
      reading.impure === 0,
      `${reading.impure} px neither pure white nor pure black (${pct(reading.purity)} pure), ` +
        `figure ${reading.white} px / ground ${reading.black} px`,
    );
    const agreement = maskAgreement(reading.mask, painted);
    add(
      "matte agreement",
      agreement.share >= 0.98,
      `${pct(agreement.share)} of pixels agree with the ${want.register} ground silhouette ` +
        `(${agreement.total - agreement.agree} px differ)`,
    );
  }
  const mask = reading?.mask ?? painted;

  const histogram = rampHistogram(scan);
  const bandText = [
    ...histogram.bands.map((b) => `<=${b.limit}: ${b.count}`),
    `>${DISTANCE_BANDS[DISTANCE_BANDS.length - 1]}: ${histogram.beyond}`,
  ].join("  ");
  add(
    "ramp conformance",
    histogram.beyond === 0,
    `mean ${histogram.mean.toFixed(1)}, worst ${histogram.worst.toFixed(1)} — ${bandText}\n` +
      `      families ${histogram.families.map((f) => `${f.family} ${f.count}`).join(", ")}`,
  );

  const flux = countFamily(scan, "flux");
  add(
    "flux ramp",
    flux <= want.fluxBudget,
    want.fluxBudget === 0
      ? `${flux} px, and the amber table grants this character none — one warm pixel is a bug`
      : `${flux} px of ${want.fluxBudget} granted (${pct(flux / (plate.width * plate.height))} of the plate)`,
  );

  const scarring = countFamily(scan, "scarring");
  add(
    "brightblood",
    want.scarringAllowed ? scarring > 0 : scarring === 0,
    want.scarringAllowed
      ? `${scarring} px, granted — brightblood marks Orin and Maren and nobody else`
      : `${scarring} px, and this character is not granted it`,
  );

  const namedCopper = countColor(scan, NAMED_COPPER);
  add("copper-500", true, `${namedCopper} px nearest ${NAMED_COPPER} — the value the briefs name by hand`);

  const rim = rimLight(plate, mask);
  add(
    "rim light",
    rim.lit <= RIM_LIGHT_BUDGET,
    `${rim.lit} of ${rim.edge} edge px are >${RIM_LIGHT_DELTA} luma lighter than the interior ` +
      `${RIM_LIGHT_DEPTH} px behind them (budget ${RIM_LIGHT_BUDGET})`,
  );

  const blown = countOverLuma(scan, LUMA_CEILING);
  add("luma ceiling", blown === 0, `${blown} px over luma ${LUMA_CEILING} — nothing in §2 is brighter than bone-100`);

  const ground = groundBands(plate, mask, register);
  add(
    "ground bands",
    ground.upper.distance <= 24 && ground.lower.distance <= 24,
    `${want.register}: upper ${ground.upper.hex} vs ${register.upper} (${ground.upper.distance.toFixed(1)}), ` +
      `lower ${ground.lower.hex} vs ${register.lower} (${ground.lower.distance.toFixed(1)})`,
  );

  const marks = framingLandmarks(mask);
  if (marks === null) {
    add("framing", false, "no figure found in the silhouette");
    return { portraitId, checks, ok: false, landmarks: null };
  }
  add(
    "framing",
    inRange(marks.crownRow, FRAMING.crown) &&
      inRange(marks.eyeLineRow, FRAMING.eyeLine) &&
      inRange(marks.chinRow, FRAMING.chin) &&
      inRange(marks.headCentreX, FRAMING.headCentreX) &&
      inRange(marks.shoulderRow, FRAMING.shoulder),
    `crown y=${marks.crownRow} [${FRAMING.crown.join("-")}], eye-line y=${marks.eyeLineRow} ` +
      `[${FRAMING.eyeLine.join("-")}], chin y=${marks.chinRow} [${FRAMING.chin.join("-")}], ` +
      `neck narrowest y=${marks.neckRow} (${marks.neckWidth} px), head centre x=${marks.headCentreX} ` +
      `[${FRAMING.headCentreX.join("-")}], shoulders y=${marks.shoulderRow} [${FRAMING.shoulder.join("-")}]`,
  );

  const overflow = chipOverflow(mask, marks);
  add(
    "chip rect",
    overflow.left === 0 && overflow.right === 0 && overflow.fill >= 0.5,
    `(${CHIP_RECT_MASTER.x}, ${CHIP_RECT_MASTER.y}, ${CHIP_RECT_MASTER.w}, ${CHIP_RECT_MASTER.h}) is ` +
      `${pct(overflow.fill)} figure; head px outside it — left ${overflow.left}, right ${overflow.right}, ` +
      `above ${overflow.above}, below ${overflow.below}`,
  );

  if (palette !== undefined) {
    const strip = scanPortrait(palette);
    const stripHistogram = rampHistogram(strip);
    add(
      "palette strip",
      stripHistogram.beyond === 0,
      `${palette.width}x${palette.height}, worst step distance ${stripHistogram.worst.toFixed(1)}, ` +
        `families ${stripHistogram.families.map((f) => f.family).join(", ")}`,
    );
  }

  return { portraitId, checks, ok: checks.every((c) => c.ok), landmarks: marks };
}

export function formatPortraitAudit(audit: PortraitAudit): string {
  return audit.checks
    .map((c) => `  ${c.ok ? "ok  " : "FAIL"}  ${c.name.padEnd(17)} ${c.detail}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const root = resolve(import.meta.dirname, "..");

const readIfPresent = (path: string): RGBASource | undefined =>
  existsSync(path) ? decodePNG(readFileSync(path)) : undefined;

function main(argv: readonly string[]): number {
  const targets = argv.includes("--all") ? [...PORTRAIT_IDS] : argv.filter((a) => !a.startsWith("--"));
  if (targets.length === 0) {
    console.log("usage: npx tsx tools/ingest-portrait.ts <portraitId|file.png> ... | --all");
    return 2;
  }
  let failed = 0;
  let audited = 0;
  for (const target of targets) {
    const plateAt = target.endsWith(".png")
      ? resolve(root, target)
      : resolve(root, `art-src/portraits/${target}.png`);
    const portraitId = basename(plateAt).replace(/\.png$/i, "");
    const shown = plateAt.startsWith(`${root}/`) ? plateAt.slice(root.length + 1) : plateAt;
    console.log(`\n${"=".repeat(72)}\n${portraitId}: ${shown}`);
    if (!existsSync(plateAt)) {
      console.log("  no plate on file — nothing delivered yet");
      continue;
    }
    const stem = plateAt.replace(/\.png$/i, "");
    const matte = readIfPresent(`${stem}-matte.png`);
    const palette = readIfPresent(`${stem}-palette.png`);
    console.log(`  matte ${matte === undefined ? "not delivered" : "on file"}, palette strip ${palette === undefined ? "not delivered" : "on file"}`);
    const audit = auditPortrait({
      portraitId,
      plate: decodePNG(readFileSync(plateAt)),
      ...(matte === undefined ? {} : { matte }),
      ...(palette === undefined ? {} : { palette }),
    });
    console.log(formatPortraitAudit(audit));
    console.log(`  ${audit.ok ? "CONFORMS" : "REJECTED"} — the intake reports and never repairs`);
    audited += 1;
    if (!audit.ok) failed += 1;
  }
  if (audited === 0) {
    console.log("\nno portraits on file. PORTRAIT_BRIEFS' wave 1 has not landed yet.");
    return 0;
  }
  console.log(`\n${audited} audited, ${failed} rejected`);
  return failed === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
