// Tile-coordinate arithmetic shared by every layer. It lives beside the schemas
// rather than in `core` because `src/render` may not import `core` — only the
// adapter crosses that seam — and both sides need the same tie-break rules.

import type { Facing, TileCoord } from "./schemas/common.js";

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
