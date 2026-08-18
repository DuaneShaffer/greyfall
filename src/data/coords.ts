// Tile-coordinate arithmetic shared by every layer, indexing a map's tile array
// included. It lives beside the schemas rather than in `core` because
// `src/render` may not import `core` — only the adapter crosses that seam — and
// both sides need the same tie-break rules and the same row-major order.

import type { Facing, TileCoord } from "./schemas/common.js";
import type { GameMap, Tile } from "./schemas/map.js";

export function coordEq(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Direction from `from` to `to`; ties resolve to the x axis. */
export function facingToward(from: TileCoord, to: TileCoord): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

export function tileIndex(map: GameMap, c: TileCoord): number {
  return c.y * map.width + c.x;
}

export function tileFromIndex(map: GameMap, index: number): TileCoord {
  return { x: index % map.width, y: Math.floor(index / map.width) };
}

export function inBounds(map: GameMap, c: TileCoord): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < map.width && c.y < map.depth;
}

export function tileAt(map: GameMap, c: TileCoord): Tile | undefined {
  if (!inBounds(map, c)) return undefined;
  return map.tiles[tileIndex(map, c)];
}
