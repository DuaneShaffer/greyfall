import { coordEq } from "../data/coords.js";
import type { Facing, TileCoord } from "../data/schemas/common.js";
import type { GameMap, Tile } from "../data/schemas/map.js";

export const TILE_SIZE = 1;
// FFT-style half-step elevation: one height unit is half a tile edge.
export const HEIGHT_STEP = 0.5;
// How far the outermost columns hang below the lowest tile.
export const SKIRT_DEPTH = 1.5;

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export const tileIndex = (map: { width: number }, x: number, y: number): number =>
  y * map.width + x;

export const inBounds = (map: { width: number; depth: number }, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < map.width && y < map.depth;

export const tileAt = (map: GameMap, x: number, y: number): Tile | undefined =>
  inBounds(map, x, y) ? map.tiles[tileIndex(map, x, y)] : undefined;

export const tileHeight = (map: GameMap, x: number, y: number): number =>
  tileAt(map, x, y)?.height ?? 0;

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
  y: tileHeight(map, x, y) * HEIGHT_STEP,
  z: (y - (map.depth - 1) / 2) * TILE_SIZE,
});

/** Surface a unit stands on: object surfaces (lift/catwalk) win over terrain. */
export const standingHeight = (map: GameMap, tile: TileCoord): number => {
  let height = tileHeight(map, tile.x, tile.y);
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

export { facingToward as facingBetween } from "../data/coords.js";
