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

/** Standability, stand height and step cost for every tile, in tile order. */
export interface TerrainGrid {
  standable: boolean[];
  height: number[];
  cost: number[];
}

/**
 * All three of those read only the map, the objects on it and the walking
 * unit's own movement profile — never who is standing where — so one grid
 * serves every distance field a decision runs. Building it once turns the
 * per-hostile Dijkstra from three map queries per edge into three array reads,
 * which was half of all AI time (`BALANCE_REPORT` G9).
 */
export function terrainGrid(state: GameState, profile: MoveProfile): TerrainGrid {
  const map = state.content.map;
  const count = map.width * map.depth;
  const standable = new Array<boolean>(count);
  const height = new Array<number>(count);
  const cost = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    const tile = tileFromIndex(map, index);
    standable[index] = isStandable(state, tile);
    height[index] = standHeight(state, tile);
    cost[index] = stepCost(state, tile, profile);
  }
  return { standable, height, cost };
}

/**
 * Travel cost from `from` to every tile, using the given unit's terrain and
 * jump rules and ignoring who is standing where. This is the AI's "how far is
 * that really" primitive: unlike Manhattan distance it sees the crate stack
 * and the height wall, and unlike `reachableTiles` it is not capped by Move.
 *
 * Several origins seed one walk, so the field reads "cost to the nearest of
 * them" — what an objective made of a row of tiles actually asks.
 *
 * Costs are packed as `cost * tileCount + tileIndex` in one numeric heap, so
 * ties break on tile index and the walk order never varies.
 */
export function distanceField(
  state: GameState,
  profile: MoveProfile,
  from: TileCoord | readonly TileCoord[],
  grid: TerrainGrid = terrainGrid(state, profile),
): number[] {
  const map = state.content.map;
  const count = map.width * map.depth;
  const dist = new Array<number>(count).fill(UNREACHABLE);
  const origins = Array.isArray(from) ? (from as readonly TileCoord[]) : [from as TileCoord];

  const heap: number[] = [];
  for (const origin of origins) {
    if (!inBounds(map, origin)) continue;
    const start = tileIndex(map, origin);
    if (dist[start] === 0) continue;
    dist[start] = 0;
    push(heap, start);
  }

  while (heap.length > 0) {
    const packed = pop(heap);
    const index = packed % count;
    const cost = (packed - index) / count;
    if (cost > (dist[index] ?? UNREACHABLE)) continue;
    const tile = tileFromIndex(map, index);
    const height = grid.height[index] ?? 0;
    for (const next of neighbors(tile)) {
      if (!inBounds(map, next)) continue;
      const nextIndex = tileIndex(map, next);
      if (grid.standable[nextIndex] !== true) continue;
      if (Math.abs((grid.height[nextIndex] ?? 0) - height) > profile.jump) continue;
      const nextCost = cost + (grid.cost[nextIndex] ?? 1);
      if (nextCost >= (dist[nextIndex] ?? UNREACHABLE)) continue;
      dist[nextIndex] = nextCost;
      push(heap, nextCost * count + nextIndex);
    }
  }
  return dist;
}
