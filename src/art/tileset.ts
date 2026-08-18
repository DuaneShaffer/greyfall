// The shipped tile faces, decoded. `src/art/masters/tiles.ts` holds the nine
// palette-index grids the intake produced from the delivered sheet; this module
// hands them back as grids and as ready mip chains.
//
// Split from `tiles.ts` on purpose: `tools/ingest-tiles.ts` writes the masters
// file and must be runnable when that file is stale or absent, so the spec and
// the audit it imports may not depend on the generated data.

import * as MASTERS from "./masters/tiles.js";
import { bytesFromBase64, createGrid, type PixelGrid } from "./pixel.js";
import { sheetTextureLevels, type TextureLevel } from "./sheet.js";
import { TILE_TEXTURE, type TileTextureId } from "./tiles.js";

const BASE64: Readonly<Record<TileTextureId, string>> = {
  "plain-top": MASTERS.PLAIN_TOP_BASE64,
  "plain-side": MASTERS.PLAIN_SIDE_BASE64,
  "impassable-top": MASTERS.IMPASSABLE_TOP_BASE64,
  "impassable-side": MASTERS.IMPASSABLE_SIDE_BASE64,
  "rail-top": MASTERS.RAIL_TOP_BASE64,
  "rough-top": MASTERS.ROUGH_TOP_BASE64,
  "rough-side": MASTERS.ROUGH_SIDE_BASE64,
  "water-top": MASTERS.WATER_TOP_BASE64,
  "water-side": MASTERS.WATER_SIDE_BASE64,
};

const grids = new Map<TileTextureId, PixelGrid>();

/** The shipped palette-index grid for a tile face. Cached; do not mutate. */
export function tileGrid(id: TileTextureId): PixelGrid {
  const cached = grids.get(id);
  if (cached) return cached;
  const spec = TILE_TEXTURE[id];
  const bytes = bytesFromBase64(BASE64[id]);
  if (bytes.length !== spec.width * spec.height) {
    throw new Error(`tileGrid: ${id} decoded to ${bytes.length} px, spec is ${spec.width}x${spec.height}`);
  }
  const grid = createGrid(spec.width, spec.height);
  grid.data.set(bytes);
  grids.set(id, grid);
  return grid;
}

/**
 * The full mip chain for a tile face, level 0 at the shipped size, down to 1x1.
 * Supplied rather than left to `gl.generateMipmap` for the same reason the sprite
 * sheet supplies its own: the GPU's reduction clamps at the texture edge, and a
 * face that is about to be laid 300 times edge to edge is exactly where that
 * clamp shows. Every level here divides evenly (32 and 16 are powers of two), so
 * no 2x2 box ever straddles an edge and the wrap stays honest all the way down.
 */
export function tileTextureLevels(id: TileTextureId): readonly TextureLevel[] {
  return sheetTextureLevels(tileGrid(id), 1);
}
