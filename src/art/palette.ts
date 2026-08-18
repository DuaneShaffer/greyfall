import type { DamageType, Team } from "../data/schemas/common.js";
import type { TerrainType } from "../data/schemas/map.js";

export type Hex = `#${string}`;

export const SOOT_900 = "#0b0d10";
export const SOOT_800 = "#171c22";
export const SOOT_700 = "#2b333d";
export const SOOT_500 = "#4a545f";
export const SOOT_300 = "#78828e";
export const SOOT_100 = "#b3bcc5";

export const UMBER_900 = "#150e09";
export const UMBER_700 = "#2c1d12";
export const UMBER_500 = "#4e3320";
export const UMBER_300 = "#7a5230";

export const COPPER_700 = "#6b3a1e";
export const COPPER_500 = "#a5622f";
export const COPPER_300 = "#c98a4b";

export const VERDIGRIS_700 = "#1e4640";
export const VERDIGRIS_500 = "#2f7a6c";
export const VERDIGRIS_300 = "#63b49e";

export const AMBER_900 = "#4a2a06";
export const AMBER_700 = "#8c5411";
export const AMBER_500 = "#d98a1b";
export const AMBER_300 = "#f3b94a";
export const AMBER_GLOW = "#ffe7a8";

export const OVERLOAD_700 = "#4e2e86";
export const OVERLOAD_500 = "#9b7be3";
export const OVERLOAD_100 = "#efe4ff";

export const VEINGLASS_700 = "#17362a";
export const VEINGLASS_500 = "#5fbe95";
export const VEINGLASS_100 = "#c4f0da";

export const BLOOD_900 = "#3e0d12";
export const BLOOD_500 = "#8e2029";
export const BLOOD_300 = "#c64a47";

export const STEEL_600 = "#2e7a94";
export const STEEL_400 = "#6fc3d9";

/**
 * Warm neutrals. Flesh, bone, bandage, raw canvas: the low-saturation warms
 * that sit between the umber ramp and `soot-100`. Without them the nearest
 * palette step to a mid skin tone is either `copper-300` (orange metal) or
 * `soot-100` (cold grey), which is how an external master's faces arrive
 * looking either rusted or dead.
 */
export const BONE_500 = "#8b7156";
export const BONE_300 = "#b99b7a";
export const BONE_100 = "#ddc6a8";

export const HAZARD = "#e8622a";
export const BRIGHTBLOOD = "#ff9db1";

export const PALETTE = {
  "soot-900": SOOT_900,
  "soot-800": SOOT_800,
  "soot-700": SOOT_700,
  "soot-500": SOOT_500,
  "soot-300": SOOT_300,
  "soot-100": SOOT_100,
  "umber-900": UMBER_900,
  "umber-700": UMBER_700,
  "umber-500": UMBER_500,
  "umber-300": UMBER_300,
  "copper-700": COPPER_700,
  "copper-500": COPPER_500,
  "copper-300": COPPER_300,
  "verdigris-700": VERDIGRIS_700,
  "verdigris-500": VERDIGRIS_500,
  "verdigris-300": VERDIGRIS_300,
  "amber-900": AMBER_900,
  "amber-700": AMBER_700,
  "amber-500": AMBER_500,
  "amber-300": AMBER_300,
  "amber-glow": AMBER_GLOW,
  "overload-700": OVERLOAD_700,
  "overload-500": OVERLOAD_500,
  "overload-100": OVERLOAD_100,
  "veinglass-700": VEINGLASS_700,
  "veinglass-500": VEINGLASS_500,
  "veinglass-100": VEINGLASS_100,
  "blood-900": BLOOD_900,
  "blood-500": BLOOD_500,
  "blood-300": BLOOD_300,
  "steel-600": STEEL_600,
  "steel-400": STEEL_400,
  "bone-500": BONE_500,
  "bone-300": BONE_300,
  "bone-100": BONE_100,
  hazard: HAZARD,
  brightblood: BRIGHTBLOOD,
} as const satisfies Record<string, Hex>;

export type ColorName = keyof typeof PALETTE;

export const PALETTE_SIZE = 37;

export type RampName =
  | "soot"
  | "umber"
  | "copper"
  | "verdigris"
  | "amber"
  | "overload"
  | "veinglass"
  | "blood"
  | "steel"
  | "bone";

/** Ordered darkest → lightest. */
export const RAMPS = {
  soot: [SOOT_900, SOOT_800, SOOT_700, SOOT_500, SOOT_300, SOOT_100],
  umber: [UMBER_900, UMBER_700, UMBER_500, UMBER_300],
  copper: [COPPER_700, COPPER_500, COPPER_300],
  verdigris: [VERDIGRIS_700, VERDIGRIS_500, VERDIGRIS_300],
  amber: [AMBER_900, AMBER_700, AMBER_500, AMBER_300, AMBER_GLOW],
  overload: [OVERLOAD_700, OVERLOAD_500, OVERLOAD_100],
  veinglass: [VEINGLASS_700, VEINGLASS_500, VEINGLASS_100],
  blood: [BLOOD_900, BLOOD_500, BLOOD_300],
  steel: [STEEL_600, STEEL_400],
  bone: [BONE_500, BONE_300, BONE_100],
} as const satisfies Record<RampName, readonly Hex[]>;

/** Colors the post chain is permitted to bloom. */
export const EMISSIVE_COLORS = [AMBER_GLOW, OVERLOAD_100, VEINGLASS_100] as const;

export const OUTLINE_COLOR = SOOT_900;

export interface TeamTint {
  readonly base: Hex;
  readonly shadow: Hex;
  readonly rim: Hex;
}

export const TEAM_TINT = {
  player: { base: STEEL_400, shadow: STEEL_600, rim: STEEL_400 },
  enemy: { base: BLOOD_300, shadow: BLOOD_900, rim: BLOOD_300 },
  neutral: { base: SOOT_100, shadow: SOOT_700, rim: SOOT_300 },
} as const satisfies Record<Team, TeamTint>;

export interface TerrainPaint {
  readonly top: Hex;
  readonly side: Hex;
  readonly accent: Hex;
  /** Strata cut line on side faces; null where height is deliberately uncountable. */
  readonly strataLine: Hex | null;
  readonly drawn: boolean;
}

export const TERRAIN_COLOR = {
  plain: { top: SOOT_500, side: UMBER_700, accent: UMBER_900, strataLine: SOOT_300, drawn: true },
  rail: { top: UMBER_700, side: UMBER_700, accent: COPPER_700, strataLine: SOOT_300, drawn: true },
  rough: { top: SOOT_700, side: UMBER_900, accent: UMBER_500, strataLine: SOOT_300, drawn: true },
  water: {
    top: VERDIGRIS_700,
    side: UMBER_900,
    accent: VERDIGRIS_500,
    strataLine: SOOT_300,
    drawn: true,
  },
  impassable: { top: SOOT_900, side: SOOT_900, accent: SOOT_900, strataLine: null, drawn: true },
  void: { top: SOOT_900, side: SOOT_900, accent: SOOT_900, strataLine: null, drawn: false },
} as const satisfies Record<TerrainType, TerrainPaint>;

/** Flat-shading multipliers. No dynamic lights in the slice. */
export const FACE_SHADE = {
  top: 1.0,
  sideNorthSouth: 0.78,
  sideEastWest: 0.62,
} as const;

export interface VfxPaint {
  readonly core: Hex;
  readonly body: Hex;
  readonly spread: Hex;
  readonly frames: number;
  readonly ticksPerFrame: number;
}

export const DAMAGE_TYPE_VFX = {
  kinetic: { core: SOOT_100, body: SOOT_300, spread: SOOT_700, frames: 3, ticksPerFrame: 4 },
  arc: { core: OVERLOAD_100, body: OVERLOAD_500, spread: OVERLOAD_700, frames: 4, ticksPerFrame: 3 },
  thermal: { core: AMBER_300, body: HAZARD, spread: BLOOD_500, frames: 5, ticksPerFrame: 5 },
  chemical: {
    core: VERDIGRIS_300,
    body: VERDIGRIS_500,
    spread: VERDIGRIS_700,
    frames: 6,
    ticksPerFrame: 10,
  },
} as const satisfies Record<DamageType, VfxPaint>;

export const DAMAGE_NUMBER_COLOR = {
  normal: SOOT_100,
  crit: AMBER_300,
  heal: VERDIGRIS_300,
  arc: OVERLOAD_100,
  miss: SOOT_300,
  outline: SOOT_900,
} as const;

/** Object power-state seam language (see ART_DIRECTION §6). */
export const OBJECT_STATE_PAINT = {
  powered: { seam: AMBER_500, core: AMBER_300, halo: AMBER_GLOW, pulseTicks: 30 },
  unpowered: { seam: SOOT_700, core: SOOT_700, halo: null, pulseTicks: 0 },
  overloading: { seam: OVERLOAD_500, core: OVERLOAD_100, halo: OVERLOAD_100, pulseTicks: 8 },
  destroyed: { seam: UMBER_900, core: SOOT_700, halo: null, pulseTicks: 0 },
} as const;

/** Reserved: no non-operable object exterior may use this. */
export const OPERABLE_AFFORDANCE_COLOR = COPPER_500;

export const STATUS_CATEGORY_COLOR = {
  buff: VERDIGRIS_500,
  debuff: BLOOD_500,
  flux: OVERLOAD_500,
  environmental: HAZARD,
} as const;

/** Tile overlay colors. Cursor is the one place amber is spent on UI. */
export const HIGHLIGHT = {
  move: STEEL_400,
  target: BLOOD_300,
  cursor: AMBER_300,
  path: AMBER_GLOW,
  deployment: VERDIGRIS_300,
  hazard: HAZARD,
} as const;

export const UI = {
  ink: SOOT_900,
  panel: SOOT_800,
  panelRaised: SOOT_700,
  edge: SOOT_300,
  text: SOOT_100,
  textDim: SOOT_300,
  accent: AMBER_300,
  warning: HAZARD,
  danger: BLOOD_500,
  good: VERDIGRIS_300,
} as const;

/** Ambient wash and key-light color per city stratum (ART_DIRECTION §1). */
export const STRATUM_LIGHT = {
  rise: { ambient: SOOT_100, key: SOOT_100, ambientStrength: 0.35 },
  works: { ambient: UMBER_500, key: AMBER_700, ambientStrength: 0.45 },
  underveins: { ambient: SOOT_900, key: VEINGLASS_700, ambientStrength: 0.15 },
} as const;

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

export function isHex(value: string): value is Hex {
  return HEX_PATTERN.test(value);
}

export function hexToRgb(hex: Hex): readonly [number, number, number] {
  if (!isHex(hex)) throw new Error(`not a palette hex: ${hex}`);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): Hex {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const part = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance; used to verify ramp ordering. */
export function relativeLuminance(hex: Hex): number {
  const [r, g, b] = hexToRgb(hex);
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Multiply a color by a face-shade factor. Terrain faces only; sprites are unshaded. */
export function shade(hex: Hex, factor: number): Hex {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

/** Numeric form for Three.js material colors. */
export function hexToNumber(hex: Hex): number {
  const [r, g, b] = hexToRgb(hex);
  return (r << 16) | (g << 8) | b;
}
