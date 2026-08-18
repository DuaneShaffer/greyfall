// The board in world space: tile centres, the height step the art is drawn to,
// and the yaw that turns a mesh toward a facing.

import { HEIGHT_STEP_PX, TILE_TEXTURE_SIZE } from "../art/sprites.js";
import { coordEq, tileAt } from "../data/coords.js";
import type { Facing, TileCoord } from "../data/schemas/common.js";
import type { GameMap } from "../data/schemas/map.js";

/** One world unit per tile edge — the unit the art's texel density is quoted in. */
export const TILE_SIZE = 1;
/**
 * FFT-style half-step elevation: one height unit is half a tile edge. Derived
 * from the authoring ruler so a side face keeps the ground's texel density —
 * `HEIGHT_STEP_PX` texels span this rise where `TILE_TEXTURE_SIZE` span a tile.
 */
export const HEIGHT_STEP = (TILE_SIZE * HEIGHT_STEP_PX) / TILE_TEXTURE_SIZE;
// How far the outermost columns hang below the lowest tile.
export const SKIRT_DEPTH = 1.5;

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export const tileHeight = (map: GameMap, tile: TileCoord): number =>
  tileAt(map, tile)?.height ?? 0;

export const minTileHeight = (map: GameMap): number => {
  const lowest = map.tiles.reduce(
    (best, tile) => Math.min(best, tile.height),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(lowest) ? lowest : 0;
};

export const baseY = (map: GameMap): number => minTileHeight(map) * HEIGHT_STEP - SKIRT_DEPTH;

/** World-space centre of a tile's top surface (y = the walkable surface). */
export const tileCenter = (map: GameMap, x: number, y: number): WorldPoint => ({
  x: (x - (map.width - 1) / 2) * TILE_SIZE,
  y: tileHeight(map, { x, y }) * HEIGHT_STEP,
  z: (y - (map.depth - 1) / 2) * TILE_SIZE,
});

/** Surface a unit stands on: object surfaces (lift/catwalk) win over terrain. */
export const standingHeight = (map: GameMap, tile: TileCoord): number => {
  let height = tileHeight(map, tile);
  for (const object of map.objects) {
    if (object.surfaceHeight === undefined) continue;
    if (!object.tiles.some((t) => coordEq(t, tile))) continue;
    height = Math.max(height, object.surfaceHeight);
  }
  return height;
};

const FACING_VECTORS: Record<Facing, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/** Y-rotation that turns a +Z-facing object toward `facing`. */
export const facingYaw = (facing: Facing): number => {
  const [dx, dz] = FACING_VECTORS[facing];
  return Math.atan2(dx, dz);
};

