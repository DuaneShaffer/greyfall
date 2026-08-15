import type { TileCoord } from "../../data/index.js";
import { inBounds, isStandable, neighbors, standHeight, tileFromIndex, tileIndex } from "../rules/grid.js";
import { stepCost, type MoveProfile } from "../rules/movement.js";
import type { GameState } from "../state/types.js";

/** Distance stand-in for a tile no path reaches. */
export const UNREACHABLE = 9999;

function push(heap: number[], value: number): void {
  heap.push(value);
  let child = heap.length - 1;
  while (child > 0) {
    const parent = (child - 1) >> 1;
    const above = heap[parent] ?? 0;
    const below = heap[child] ?? 0;
    if (above <= below) break;
    heap[parent] = below;
    heap[child] = above;
    child = parent;
  }
}

function pop(heap: number[]): number {
  const top = heap[0] ?? -1;
  const last = heap.pop();
  if (last !== undefined && heap.length > 0) {
    heap[0] = last;
    let parent = 0;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < heap.length && (heap[left] ?? 0) < (heap[smallest] ?? 0)) smallest = left;
      if (right < heap.length && (heap[right] ?? 0) < (heap[smallest] ?? 0)) smallest = right;
      if (smallest === parent) break;
      const a = heap[parent] ?? 0;
      heap[parent] = heap[smallest] ?? 0;
      heap[smallest] = a;
      parent = smallest;
    }
  }
  return top;
}

/**
 * Travel cost from `from` to every tile, using the given unit's terrain and
 * jump rules and ignoring who is standing where. This is the AI's "how far is
 * that really" primitive: unlike Manhattan distance it sees the crate stack
 * and the height wall, and unlike `reachableTiles` it is not capped by Move.
 *
 * Costs are packed as `cost * tileCount + tileIndex` in one numeric heap, so
 * ties break on tile index and the walk order never varies.
 */
export function distanceField(state: GameState, profile: MoveProfile, from: TileCoord): number[] {
  const map = state.content.map;
  const count = map.width * map.depth;
  const dist = new Array<number>(count).fill(UNREACHABLE);
  if (!inBounds(map, from)) return dist;

  const start = tileIndex(map, from);
  dist[start] = 0;
  const heap: number[] = [];
  push(heap, start);

  while (heap.length > 0) {
    const packed = pop(heap);
    const index = packed % count;
    const cost = (packed - index) / count;
    if (cost > (dist[index] ?? UNREACHABLE)) continue;
    const tile = tileFromIndex(map, index);
    const height = standHeight(state, tile);
    for (const next of neighbors(tile)) {
      if (!inBounds(map, next)) continue;
      if (!isStandable(state, next)) continue;
      if (Math.abs(standHeight(state, next) - height) > profile.jump) continue;
      const nextIndex = tileIndex(map, next);
      const nextCost = cost + stepCost(state, next, profile);
      if (nextCost >= (dist[nextIndex] ?? UNREACHABLE)) continue;
      dist[nextIndex] = nextCost;
      push(heap, nextCost * count + nextIndex);
    }
  }
  return dist;
}
