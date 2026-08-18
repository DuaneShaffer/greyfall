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
import { EMISSIVE_COLORS } from "../art/palette.js";
import { buildJobSheet, cellUV, sheetCell, sheetKey, sheetTextureLevels } from "../art/sheet.js";
import {
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_PIXELS_PER_TILE as SPEC_PIXELS_PER_TILE,
  SPRITE_WIDTH,
  type AnimState,
  type DrawnView,
} from "../art/sprites.js";
import type { Team } from "../data/schemas/common.js";
import { configureTexture, mippedTexture } from "./textures.js";

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

const configure = (texture: THREE.Texture): THREE.Texture =>
  configureTexture(texture, THREE.ClampToEdgeWrapping);

/** The shared sheet for a job/team. Built once, cached for the session. */
export const unitSheet = (spriteId: string, team: Team): THREE.Texture => {
  const jobId = jobForSprite(spriteId);
  const key = sheetKey(jobId, team);
  const cached = sheets.get(key);
  if (cached) return cached;

  const texture = mippedTexture(
    sheetTextureLevels(buildJobSheet(jobId, team)),
    THREE.ClampToEdgeWrapping,
  );
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

/**
 * Wide enough to survive a mip level's rounding, far narrower than the gap
 * between an emissive step and the ramp step under it (the closest pair,
 * amber-glow against amber-300, sits 0.48 apart in linear space).
 */
const BLOOM_KEY_TOLERANCE = 0.15;

const bloomKeyTest = (): string => {
  const color = new THREE.Color();
  return EMISSIVE_COLORS.map((hex) => {
    color.setStyle(hex, THREE.SRGBColorSpace);
    const rgb = [color.r, color.g, color.b].map((c) => c.toFixed(5)).join(", ");
    return `\tkeyed += step(distance(diffuseColor.rgb, vec3(${rgb})), ${BLOOM_KEY_TOLERANCE});`;
  }).join("\n");
};

/**
 * Draws only the sheet pixels painted in the three colors ART_DIRECTION §2 lets
 * the post chain bloom, so a sprite's emissive detail can be blurred without a
 * second sheet: it samples the unit's own texture and its own UV window, and
 * discards everything that is not a key color. Renders in the bloom pass alone.
 */
export const emissiveKeyMaterial = (map: THREE.Texture): THREE.MeshBasicMaterial => {
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: false,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
\tfloat keyed = 0.0;
${bloomKeyTest()}
\tif ( keyed < 0.5 ) discard;`,
    );
  };
  return material;
};

export const releaseSheetView = (texture: THREE.Texture): void => {
  if (clones.delete(texture)) texture.dispose();
};
