// Thin adapter over `src/art/palette.ts` (ART_DIRECTION §10 migration table).
// `src/art` is the single source of color; this module only converts the
// canonical hex strings into the numeric form Three.js materials want and
// exposes the renderer's historical names. No hex is authored here.

import type { Team } from "../data/schemas/common.js";
import type { TerrainType } from "../data/schemas/map.js";
import {
  AMBER_300,
  AMBER_500,
  AMBER_GLOW,
  FACE_SHADE,
  HIGHLIGHT,
  OBJECT_STATE_PAINT,
  OPERABLE_AFFORDANCE_COLOR,
  OVERLOAD_100,
  OVERLOAD_500,
  SOOT_100,
  SOOT_500,
  SOOT_700,
  SOOT_800,
  TEAM_TINT,
  TERRAIN_COLOR,
  UMBER_500,
  VEINGLASS_500,
  VERDIGRIS_500,
  hexToNumber,
  shade,
} from "../art/palette.js";

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
  fluxAmber: hexToNumber(AMBER_500),
  fluxGlow: hexToNumber(AMBER_GLOW),
  overloadViolet: hexToNumber(OVERLOAD_500),
  overloadCore: hexToNumber(OVERLOAD_100),
  veinGlass: hexToNumber(VEINGLASS_500),
  soot: hexToNumber(SOOT_800),
  coalUmber: hexToNumber(UMBER_500),
  oxidizedCopper: hexToNumber(VERDIGRIS_500),
  daylight: hexToNumber(SOOT_100),
  skyGrey: hexToNumber(SOOT_500),
  teamPlayer: hexToNumber(TEAM_TINT.player.base),
  teamEnemy: hexToNumber(TEAM_TINT.enemy.base),
  teamNeutral: hexToNumber(TEAM_TINT.neutral.base),
  highlightMove: hexToNumber(HIGHLIGHT.move),
  highlightTarget: hexToNumber(HIGHLIGHT.target),
  highlightCursor: hexToNumber(HIGHLIGHT.cursor),
  highlightPath: hexToNumber(HIGHLIGHT.path),
  highlightDeployment: hexToNumber(HIGHLIGHT.deployment),
  highlightHazard: hexToNumber(HIGHLIGHT.hazard),
} as const;

export type TerrainFace = "top" | "sideNorthSouth" | "sideEastWest";

/**
 * Face color for a terrain type. Side faces are derived from the authored side
 * color through `FACE_SHADE`; a second hand-authored side table is forbidden
 * (ART_DIRECTION §10) because it drifts from the tops.
 */
export const terrainFaceColor = (terrain: TerrainType, face: TerrainFace): number => {
  const paint = TERRAIN_COLOR[terrain];
  if (face === "top") return hexToNumber(shade(paint.top, FACE_SHADE.top));
  return hexToNumber(shade(paint.side, FACE_SHADE[face]));
};

export const terrainTopColor: Record<TerrainType, number> = {
  plain: terrainFaceColor("plain", "top"),
  rail: terrainFaceColor("rail", "top"),
  rough: terrainFaceColor("rough", "top"),
  water: terrainFaceColor("water", "top"),
  impassable: terrainFaceColor("impassable", "top"),
  void: terrainFaceColor("void", "top"),
};

export const terrainAccentColor: Record<TerrainType, number> = {
  plain: hexToNumber(TERRAIN_COLOR.plain.accent),
  rail: hexToNumber(TERRAIN_COLOR.rail.accent),
  rough: hexToNumber(TERRAIN_COLOR.rough.accent),
  water: hexToNumber(TERRAIN_COLOR.water.accent),
  impassable: hexToNumber(TERRAIN_COLOR.impassable.accent),
  void: hexToNumber(TERRAIN_COLOR.void.accent),
};

// Inset strip drawn on rail tops so rails read as rails before textures exist.
export const railStripColor = terrainAccentColor.rail;

export const teamColor: Record<Team, number> = {
  player: hexToNumber(TEAM_TINT.player.base),
  enemy: hexToNumber(TEAM_TINT.enemy.base),
  neutral: hexToNumber(TEAM_TINT.neutral.base),
};

export const teamShadeColor: Record<Team, number> = {
  player: hexToNumber(TEAM_TINT.player.shadow),
  enemy: hexToNumber(TEAM_TINT.enemy.shadow),
  neutral: hexToNumber(TEAM_TINT.neutral.shadow),
};

export const objectColor = {
  frame: hexToNumber(SOOT_500),
  frameDark: hexToNumber(SOOT_800),
  powered: hexToNumber(OBJECT_STATE_PAINT.powered.seam),
  poweredCore: hexToNumber(OBJECT_STATE_PAINT.powered.core),
  poweredHalo: hexToNumber(OBJECT_STATE_PAINT.powered.halo),
  unpowered: hexToNumber(OBJECT_STATE_PAINT.unpowered.seam),
  overloading: hexToNumber(OBJECT_STATE_PAINT.overloading.core),
  overloadingSeam: hexToNumber(OBJECT_STATE_PAINT.overloading.seam),
  /** Dead seams on a destroyed object. */
  destroyed: hexToNumber(OBJECT_STATE_PAINT.destroyed.seam),
  /** The rubble form the silhouette collapses into (ART_DIRECTION §6). */
  rubble: hexToNumber(OBJECT_STATE_PAINT.destroyed.core),
  cellGlass: hexToNumber(AMBER_300),
  catwalkGrate: hexToNumber(SOOT_700),
  /** Reserved for operable controls only (ART_DIRECTION §6). */
  operable: hexToNumber(OPERABLE_AFFORDANCE_COLOR),
} as const;
