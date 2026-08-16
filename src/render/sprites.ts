// Unit sheet textures. One sheet per job/team is generated once from `src/art`
// (pure palette-index grids) and uploaded as a data texture with its whole mip
// chain. Frame selection is a UV window into that sheet — see `cellUV` — so
// playback costs nothing per frame and a mirrored view is a negative horizontal
// repeat.
//
// Filtering: NearestFilter on magnification, because the default camera zoom
// sits just above the texture's own density and a sprite must show hard pixel
// edges there; trilinear on minification, because a sheet sampled below its
// density with nearest filtering crawls as the camera moves. The chain is
// supplied rather than generated so level 0 can be a hard enlargement while the
// levels under it are properly box-filtered.
//
// Geometry comes from the frozen sprite spec (`src/art/sprites.ts`): a 64x96
// cell, feet anchor at (32, 88), 64 sprite px per world tile edge, so the
// billboard is exactly 1.0 x 1.5 world units — unchanged by the density.

import * as THREE from "three";
import { isJobId, type JobId } from "../art/jobs.js";
import {
  buildJobSheet,
  cellUV,
  flipRows,
  sheetCell,
  sheetKey,
  sheetTextureLevels,
} from "../art/sheet.js";
import {
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_PIXELS_PER_TILE as SPEC_PIXELS_PER_TILE,
  SPRITE_WIDTH,
  type AnimState,
  type DrawnView,
} from "../art/sprites.js";
import type { Team } from "../data/schemas/common.js";

export const SPRITE_PIXELS_X = SPRITE_WIDTH;
export const SPRITE_PIXELS_Y = SPRITE_HEIGHT;
export const SPRITE_PIXELS_PER_TILE = SPEC_PIXELS_PER_TILE;
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
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

const asBytes = (data: Uint8ClampedArray): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

/** The shared sheet for a job/team. Built once, cached for the session. */
export const unitSheet = (spriteId: string, team: Team): THREE.Texture => {
  const jobId = jobForSprite(spriteId);
  const key = sheetKey(jobId, team);
  const cached = sheets.get(key);
  if (cached) return cached;

  // WebGL ignores flipY for buffer uploads, so every level ships bottom-up.
  const levels = sheetTextureLevels(buildJobSheet(jobId, team)).map(flipRows);
  const base = levels[0] as (typeof levels)[number];
  const texture = new THREE.DataTexture(
    asBytes(base.data),
    base.width,
    base.height,
    THREE.RGBAFormat,
  );
  texture.mipmaps = levels.map((level) => ({
    data: asBytes(level.data),
    width: level.width,
    height: level.height,
  }));
  texture.needsUpdate = true;
  configure(texture);
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
