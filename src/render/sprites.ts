// Placeholder unit art: a chunky FFT-register silhouette painted onto a small
// canvas, sampled with NearestFilter so it stays crisp and pixel-y.
//
// Geometry follows the frozen sprite spec (docs/ART_DIRECTION.md §3): a 32×48
// canvas, feet anchor at (16, 44), 32 px per world tile edge, so the billboard
// is exactly 1.0 × 1.5 world units.
//
// TODO(art-seam): real sprite sheets (per job, per facing, per animation frame)
// arrive from `src/art`. When they do, replace `unitTexture` with a sheet
// loader + frame picker; the billboard code in `units.ts` should not change.

import * as THREE from "three";
import type { Team } from "../data/schemas/common.js";
import { teamColor, teamShadeColor } from "./palette.js";

export const SPRITE_PIXELS_X = 32;
export const SPRITE_PIXELS_Y = 48;
export const SPRITE_PIXELS_PER_TILE = 32;
/** Row of the feet anchor, measured from the top of the canvas. */
export const SPRITE_ANCHOR_Y = 44;

const cache = new Map<string, THREE.Texture>();

const hex = (value: number): string => `#${value.toString(16).padStart(6, "0")}`;

const paintUnit = (ctx: CanvasRenderingContext2D, team: Team, downed: boolean): void => {
  const body = hex(teamColor[team]);
  const shade = hex(teamShadeColor[team]);
  const outline = "#171614";
  const skin = "#c9a887";
  const boot = "#26241f";
  const px = (x: number, y: number, w: number, h: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  ctx.clearRect(0, 0, SPRITE_PIXELS_X, SPRITE_PIXELS_Y);
  if (downed) {
    px(6, 36, 20, 8, outline);
    px(7, 37, 18, 6, shade);
    px(9, 38, 6, 3, skin);
    return;
  }

  // ~3 heads tall: 13px head over a 40px figure, symmetric about x = 16.
  px(10, 4, 12, 13, outline);
  px(11, 5, 10, 11, skin);
  px(11, 5, 10, 4, shade);
  px(8, 17, 16, 15, outline);
  px(9, 18, 14, 13, body);
  px(9, 18, 14, 4, shade);
  px(16, 22, 7, 9, shade);
  px(5, 18, 4, 12, outline);
  px(23, 18, 4, 12, outline);
  px(6, 19, 2, 10, shade);
  px(24, 19, 2, 10, shade);
  px(10, 32, 6, 13, outline);
  px(16, 32, 6, 13, outline);
  px(11, 33, 4, 8, body);
  px(17, 33, 4, 8, body);
  px(10, 41, 6, 3, boot);
  px(16, 41, 6, 3, boot);
};

export const unitTexture = (team: Team, downed: boolean): THREE.Texture => {
  const key = `${team}:${downed ? "downed" : "up"}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_PIXELS_X;
  canvas.height = SPRITE_PIXELS_Y;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable for unit sprite");
  paintUnit(ctx, team, downed);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
};

export const disposeSpriteCache = (): void => {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
};
