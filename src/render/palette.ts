// TODO(art-seam): the art agent's authored palette lands in `src/art`. When it
// does, this module becomes a thin re-export/adapter so the renderer keeps a
// single import site for colors. Values below are Greyfall bible §10 stand-ins:
// soot greys, oxidized copper, coal umber, flux amber as the scarce accent.

import type { TerrainType } from "../data/schemas/map.js";
import type { Team } from "../data/schemas/common.js";

export type Rgb = readonly [number, number, number];

export const hexToRgb = (hex: number): Rgb => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

export const scaleRgb = (rgb: Rgb, factor: number): Rgb => [
  Math.min(1, Math.max(0, rgb[0] * factor)),
  Math.min(1, Math.max(0, rgb[1] * factor)),
  Math.min(1, Math.max(0, rgb[2] * factor)),
];

export const palette = {
  fluxAmber: 0xf0a02c,
  overloadViolet: 0xd6c2f0,
  veinGlass: 0xa8d8b0,
  soot: 0x2b2a28,
  coalUmber: 0x4a4038,
  oxidizedCopper: 0x5f8a7d,
  daylight: 0xd8d2c6,
  skyGrey: 0x6d6a66,
  teamPlayer: 0x4d86c4,
  teamEnemy: 0xc2543c,
  teamNeutral: 0xb0a894,
  highlightMove: 0x4d86c4,
  highlightTarget: 0xc2543c,
  highlightCursor: 0xf0e6cf,
  highlightDeployment: 0x8fb87a,
} as const;

export const terrainTopColor: Record<TerrainType, number> = {
  plain: 0x6b6357,
  rail: 0x565049,
  rough: 0x5c4f42,
  water: 0x3d5a63,
  impassable: 0x3a352f,
  void: 0x141312,
};

export const terrainSideColor: Record<TerrainType, number> = {
  plain: 0x4b463d,
  rail: 0x3e3a35,
  rough: 0x40372e,
  water: 0x2c4048,
  impassable: 0x282420,
  void: 0x0f0e0e,
};

// Inset strip drawn on rail tops so rails read as rails before textures exist.
export const railStripColor = 0x8a8175;

export const teamColor: Record<Team, number> = {
  player: palette.teamPlayer,
  enemy: palette.teamEnemy,
  neutral: palette.teamNeutral,
};

export const teamShadeColor: Record<Team, number> = {
  player: 0x2c4f78,
  enemy: 0x73301f,
  neutral: 0x6a6355,
};

export const objectColor = {
  frame: 0x4f4a42,
  frameDark: 0x35312c,
  powered: palette.fluxAmber,
  unpowered: 0x6a655c,
  destroyed: 0x241f1c,
  cellGlass: 0xffc563,
  catwalkGrate: 0x585249,
} as const;
