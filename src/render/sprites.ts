// Placeholder unit art, painted from `src/art/placeholders.ts` shape data onto
// a small canvas and sampled with NearestFilter so it stays crisp and pixel-y.
// Geometry comes from the frozen sprite spec (`src/art/sprites.ts`): a 32x48
// canvas, feet anchor at (16, 44), 32 px per world tile edge, so the billboard
// is exactly 1.0 x 1.5 world units.
//
// TODO(art): swap `unitTexture` for a sheet loader + frame picker when real
// sheets land; the billboard code in `units.ts` should not change.

import * as THREE from "three";
import {
  JOB_IDS,
  buildPlaceholder,
  drawToCanvas,
  type Canvas2DLike,
  type JobId,
} from "../art/placeholders.js";
import {
  ANIMATIONS,
  PIXELS_PER_TILE,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  type DrawnView,
} from "../art/sprites.js";
import type { Team } from "../data/schemas/common.js";

export const SPRITE_PIXELS_X = SPRITE_WIDTH;
export const SPRITE_PIXELS_Y = SPRITE_HEIGHT;
export const SPRITE_PIXELS_PER_TILE = PIXELS_PER_TILE;
/** Row of the feet anchor, measured from the top of the canvas. */
export const SPRITE_ANCHOR_Y = SPRITE_ANCHOR.y;

const DEFAULT_JOB: JobId = "enforcer";
const DEFAULT_VIEW: DrawnView = "se";

const cache = new Map<string, THREE.Texture>();

/** Sprite ids follow job ids while art is placeholder; unknown ids fall back. */
export const jobForSprite = (spriteId: string): JobId =>
  (JOB_IDS as readonly string[]).includes(spriteId) ? (spriteId as JobId) : DEFAULT_JOB;

export const unitTexture = (spriteId: string, team: Team, downed: boolean): THREE.Texture => {
  const jobId = jobForSprite(spriteId);
  const key = `${jobId}:${team}:${downed ? "downed" : "idle"}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_PIXELS_X;
  canvas.height = SPRITE_PIXELS_Y;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable for unit sprite");
  ctx.clearRect(0, 0, SPRITE_PIXELS_X, SPRITE_PIXELS_Y);

  // `Canvas2DLike` narrows fillStyle to string; forward through a shim rather
  // than widening the art-side contract.
  const painter: Canvas2DLike = {
    get fillStyle(): string {
      return String(ctx.fillStyle);
    },
    set fillStyle(value: string) {
      ctx.fillStyle = value;
    },
    fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
  };

  const state = downed ? "downed" : "idle";
  const clip = buildPlaceholder(jobId, team, state, DEFAULT_VIEW);
  drawToCanvas(painter, clip, downed ? ANIMATIONS.downed.frames - 1 : 0);

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
