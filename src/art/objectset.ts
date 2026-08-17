// The shipped object faces, decoded. `src/art/masters/objects.ts` holds the
// palette-index grid the intake produced for each delivered cell; this module
// hands them back as grids and as ready mip chains, in any of §6's power states.
//
// Split from `objects.ts` for the same reason `tileset.ts` is split from
// `tiles.ts`: `tools/ingest-objects.ts` writes the masters file and must be
// runnable when that file is stale or absent, so the spec and the audit it
// imports may not depend on the generated data.
//
// **Only the powered face is stored.** Every other state is `faceInState`'s
// five-step substitution over the amber ramp, computed here, so there is exactly
// one painting per face on disk and no way for a state to drift out of register
// with the art it is a state of.

import * as MASTERS from "./masters/objects.js";
import { createGrid, type PixelGrid } from "./pixel.js";
import { sheetTextureLevels, type TextureLevel } from "./sheet.js";
import {
  OBJECT_ART,
  carrierMask,
  faceInState,
  type ObjectFaceId,
  type ObjectPowerState,
  type ObjectSpriteId,
} from "./objects.js";

const BASE64: Readonly<Record<ObjectSpriteId, Readonly<Record<ObjectFaceId, string>>>> = {
  "flux-main": {
    long: MASTERS.FLUX_MAIN_LONG_BASE64,
    end: MASTERS.FLUX_MAIN_END_BASE64,
    top: MASTERS.FLUX_MAIN_TOP_BASE64,
  },
};

const decode = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const key = (sprite: ObjectSpriteId, face: ObjectFaceId, state: ObjectPowerState): string =>
  `${sprite}:${face}:${state}`;

const grids = new Map<string, PixelGrid>();

/** The shipped palette-index grid for an object face. Cached; do not mutate. */
export function objectFaceGrid(
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectPowerState = "powered",
): PixelGrid {
  const cacheKey = key(sprite, face, state);
  const cached = grids.get(cacheKey);
  if (cached) return cached;
  const spec = OBJECT_ART[sprite].faces[face];
  const bytes = decode(BASE64[sprite][face]);
  if (bytes.length !== spec.width * spec.height) {
    throw new Error(
      `objectFaceGrid: ${sprite}/${face} decoded to ${bytes.length} px, the brief fixes ${spec.width}x${spec.height}`,
    );
  }
  const powered = createGrid(spec.width, spec.height);
  powered.data.set(bytes);
  const grid = faceInState(powered, state);
  grids.set(cacheKey, grid);
  return grid;
}

/**
 * The full mip chain for an object face, level 0 at the shipped size down to
 * 1×1. Supplied rather than left to `gl.generateMipmap` for the same reason the
 * tile faces and the sprite sheet supply theirs: the reduction is a box filter
 * over premultiplied alpha here, which is what keeps a thin bus riser from
 * dissolving into the plinth behind it two levels down. Unlike a tile face these
 * do not wrap — a machine face is laid once, on one side of one box — so the
 * chain's only job is to stop a board pulled out to 40 screen px per tile from
 * crawling.
 */
export function objectFaceLevels(
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectPowerState = "powered",
): readonly TextureLevel[] {
  return sheetTextureLevels(objectFaceGrid(sprite, face, state), 1);
}

const masks = new Map<string, PixelGrid | null>();

/**
 * The carrier's own pixels, for the face's emissive map — `null` where §6 gives
 * the state no halo, and on every face that carries nothing. Derived from the
 * powered painting's amber positions rather than from the state grid's colours,
 * because an unpowered seam is `soot-700` and so is half the cast frame.
 */
export function objectCarrierGrid(
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectPowerState,
): PixelGrid | null {
  const cacheKey = key(sprite, face, state);
  if (masks.has(cacheKey)) return masks.get(cacheKey) ?? null;
  const mask = carrierMask(objectFaceGrid(sprite, face, "powered"), state);
  masks.set(cacheKey, mask);
  return mask;
}

export function objectCarrierLevels(
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectPowerState,
): readonly TextureLevel[] | null {
  const grid = objectCarrierGrid(sprite, face, state);
  return grid === null ? null : sheetTextureLevels(grid, 1);
}
