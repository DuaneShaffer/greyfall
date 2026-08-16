// Unit sheet textures. One 256x576 sheet per job/team is generated once from
// `src/art` (pure palette-index grids), painted to a canvas via ImageData, and
// sampled with NearestFilter so it stays crisp. Frame selection is a UV window
// into that sheet — see `cellUV` — so playback costs nothing per frame and a
// mirrored view is a negative horizontal repeat.
//
// Geometry comes from the frozen sprite spec (`src/art/sprites.ts`): a 32x48
// cell, feet anchor at (16, 44), 32 px per world tile edge, so the billboard is
// exactly 1.0 x 1.5 world units.

import * as THREE from "three";
import { isJobId, type JobId } from "../art/jobs.js";
import { writeGridToImageData } from "../art/pixel.js";
import { buildJobSheet, cellUV, sheetCell, sheetKey } from "../art/sheet.js";
import {
  PIXELS_PER_TILE,
  SHEET_LAYOUT,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  type AnimState,
  type DrawnView,
} from "../art/sprites.js";
import type { Team } from "../data/schemas/common.js";

export const SPRITE_PIXELS_X = SPRITE_WIDTH;
export const SPRITE_PIXELS_Y = SPRITE_HEIGHT;
export const SPRITE_PIXELS_PER_TILE = PIXELS_PER_TILE;
/** Row of the feet anchor, measured from the top of the canvas. */
export const SPRITE_ANCHOR_Y = SPRITE_ANCHOR.y;

const DEFAULT_JOB: JobId = "enforcer";

const sheets = new Map<string, THREE.Texture>();
const clones = new Set<THREE.Texture>();

/** Sprite ids follow job ids; unknown ids fall back to the melee baseline. */
export const jobForSprite = (spriteId: string): JobId =>
  isJobId(spriteId) ? spriteId : DEFAULT_JOB;

const configure = (texture: THREE.Texture): THREE.Texture => {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

/** The shared sheet for a job/team. Built once, cached for the session. */
export const unitSheet = (spriteId: string, team: Team): THREE.Texture => {
  const jobId = jobForSprite(spriteId);
  const key = sheetKey(jobId, team);
  const cached = sheets.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = SHEET_LAYOUT.width;
  canvas.height = SHEET_LAYOUT.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable for unit sheet");
  const image = ctx.createImageData(SHEET_LAYOUT.width, SHEET_LAYOUT.height);
  writeGridToImageData(image, buildJobSheet(jobId, team));
  ctx.putImageData(image, 0, 0);

  const texture = configure(new THREE.CanvasTexture(canvas));
  sheets.set(key, texture);
  return texture;
};

/**
 * A per-unit view onto a shared sheet. Clones carry their own UV window, which
 * is what lets two units of the same job play different frames.
 */
export const unitSheetView = (spriteId: string, team: Team): THREE.Texture => {
  const view = unitSheet(spriteId, team).clone();
  configure(view);
  view.needsUpdate = true;
  clones.add(view);
  return view;
};

export const applyCellUV = (
  texture: THREE.Texture,
  state: AnimState,
  view: DrawnView,
  frame: number,
  mirrored: boolean,
): void => {
  const uv = cellUV(sheetCell(state, view, frame), mirrored);
  texture.offset.set(uv.offsetX, uv.offsetY);
  texture.repeat.set(uv.repeatX, uv.repeatY);
};

export const releaseSheetView = (texture: THREE.Texture): void => {
  if (clones.delete(texture)) texture.dispose();
};

export const disposeSpriteCache = (): void => {
  for (const texture of clones) texture.dispose();
  clones.clear();
  for (const texture of sheets.values()) texture.dispose();
  sheets.clear();
};
