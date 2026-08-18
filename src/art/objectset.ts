// The shipped object faces, decoded. `src/art/masters/objects.ts` holds the
// palette-index grid the intake produced for each delivered cell; this module
// hands them back as grids and as ready mip chains, in any of §6's power states.
//
// Split from `objects.ts` for the same reason `tileset.ts` is split from
// `tiles.ts`: `tools/ingest-objects.ts` writes the masters file and must be
// runnable when that file is stale or absent, so the spec and the audit it
// imports may not depend on the generated data.
//
// **The powered face is stored, and so is a state no substitution can reach.**
// Every other state is `faceInState`'s five-step substitution over the amber
// ramp, computed here, so there is one painting per face on disk and no way for a
// state to drift out of register with the art it is a state of. The one exception
// is the trough's break: a cut reads as *absence of material*, and no colour swap
// makes material go missing, so §4's break top is a second painting and is stored
// as one. Its sibling — §4's dead run — is not, because the substitution already
// produces it to the pixel (`tests/art/objects.trough.test.ts` holds the two
// against each other).

import * as MASTERS from "./masters/objects.js";
import { bytesFromBase64, createGrid, type PixelGrid } from "./pixel.js";
import { sheetTextureLevels, type TextureLevel } from "./sheet.js";
import {
  carrierMask,
  faceInState,
  objectCellSpec,
  type ObjectFaceId,
  type ObjectFaceState,
  type ObjectSpriteId,
} from "./objects.js";

const key = (sprite: ObjectSpriteId, face: ObjectFaceId, state: ObjectFaceState): string =>
  `${sprite}:${face}:${state}`;

/**
 * Every stored painting, by the cell it is: sprite, face, and the §6 state it was
 * delivered in. A face with no entry of its own wears the painting its spec
 * points at (`paintedAs` — a trough's ends are its lip), and a state with no
 * entry is the substitution.
 */
const STORED: Readonly<Record<string, string>> = {
  "flux-main:long:powered": MASTERS.FLUX_MAIN_LONG_BASE64,
  "flux-main:end:powered": MASTERS.FLUX_MAIN_END_BASE64,
  "flux-main:top:powered": MASTERS.FLUX_MAIN_TOP_BASE64,
  "cable-trough:long:powered": MASTERS.CABLE_TROUGH_LONG_BASE64,
  "cable-trough:top:powered": MASTERS.CABLE_TROUGH_TOP_BASE64,
  "cable-trough:cap:powered": MASTERS.CABLE_TROUGH_CAP_BASE64,
  "cable-trough:top:severed": MASTERS.CABLE_TROUGH_TOP_SEVERED_BASE64,
  "charge-hoist:long:powered": MASTERS.CHARGE_HOIST_LONG_BASE64,
  "charge-hoist:end:powered": MASTERS.CHARGE_HOIST_END_BASE64,
  "charge-hoist:top:powered": MASTERS.CHARGE_HOIST_TOP_BASE64,
};

const grids = new Map<string, PixelGrid>();

const decode = (base64: string, label: string, width: number, height: number): PixelGrid => {
  const bytes = bytesFromBase64(base64);
  if (bytes.length !== width * height) {
    throw new Error(
      `objectFaceGrid: ${label} decoded to ${bytes.length} px, the brief fixes ${width}x${height}`,
    );
  }
  const grid = createGrid(width, height);
  grid.data.set(bytes);
  return grid;
};

/** The shipped palette-index grid for an object face. Cached; do not mutate. */
export function objectFaceGrid(
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectFaceState = "powered",
): PixelGrid {
  const cacheKey = key(sprite, face, state);
  const cached = grids.get(cacheKey);
  if (cached) return cached;
  const spec = objectCellSpec(sprite, face, state);
  if (spec === null) throw new Error(`objectFaceGrid: ${sprite} wears no ${face} face`);
  const stored = STORED[key(sprite, spec.paintedAs, state)];
  if (stored === undefined && state === "powered") {
    throw new Error(`objectFaceGrid: no painting stored for ${sprite}/${spec.paintedAs}`);
  }
  const grid =
    stored === undefined
      ? faceInState(objectFaceGrid(sprite, face, "powered"), state)
      : decode(stored, `${sprite}/${face}`, spec.width, spec.height);
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
  state: ObjectFaceState = "powered",
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
  state: ObjectFaceState,
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
  state: ObjectFaceState,
): readonly TextureLevel[] | null {
  const grid = objectCarrierGrid(sprite, face, state);
  return grid === null ? null : sheetTextureLevels(grid, 1);
}
