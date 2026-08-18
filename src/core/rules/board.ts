// The battle board: what a tile is made of, what stands on it, how high that
// stands, and who on it is hostile to whom. "Grid" in this codebase is the flux
// graph (`rules/power.ts`), never the tile lattice.

import {
  coordEq,
  facingToward,
  inBounds,
  manhattan,
  tileAt,
  tileFromIndex,
  tileIndex,
} from "../../data/coords.js";
import type { Facing, GameMap, Team, TileCoord } from "../../data/index.js";
import type { BattleUnit, GameState, ObjectRuntime } from "../state/types.js";
import { isEnergized } from "./power.js";

/** Terrain a unit can never stand on or move through. */
export const IMPASSABLE_TERRAIN = new Set(["impassable", "void"]);

/** North is -y, south is +y, east is +x, west is -x. */
export const FACING_VECTORS: Readonly<Record<Facing, { dx: number; dy: number }>> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

/** Neighbour order is fixed (N, E, S, W) so search results never vary. */
export const NEIGHBOR_ORDER: readonly Facing[] = ["north", "east", "south", "west"];

export { coordEq, facingToward, inBounds, manhattan, tileAt, tileFromIndex, tileIndex };

export function neighbors(c: TileCoord): TileCoord[] {
  return NEIGHBOR_ORDER.map((f) => ({ x: c.x + FACING_VECTORS[f].dx, y: c.y + FACING_VECTORS[f].dy }));
}

/** Objects covering a tile, in object-id order. Includes destroyed ones. */
export function objectsAt(state: GameState, c: TileCoord): ObjectRuntime[] {
  return state.map.objects.filter((o) => o.def.tiles.some((t) => coordEq(t, c)));
}

export function objectById(state: GameState, id: string): ObjectRuntime | undefined {
  return state.map.objects.find((o) => o.def.id === id);
}

/** A destroyed object stops blocking, powering, and providing a surface. */
export function isObjectActive(obj: ObjectRuntime): boolean {
  return !obj.destroyed;
}

/** True when the object currently provides a walkable deck (catwalk/lift). */
export function providesSurface(state: GameState, obj: ObjectRuntime): boolean {
  if (!isObjectActive(obj)) return false;
  if (obj.def.surfaceHeight === undefined) return false;
  return obj.powered === null || isEnergized(state, obj.def.id);
}

/**
 * Height a unit standing on this tile occupies: the highest active
 * catwalk/lift deck over it, otherwise the terrain height.
 */
export function standHeight(state: GameState, c: TileCoord): number {
  const tile = tileAt(state.content.map, c);
  let height = tile === undefined ? 0 : tile.height;
  for (const obj of objectsAt(state, c)) {
    if (!providesSurface(state, obj)) continue;
    const surface = obj.def.surfaceHeight;
    if (surface !== undefined && surface > height) height = surface;
  }
  return height;
}

/** True when the tile is stood on an object's deck rather than on its terrain. */
export function isDecked(state: GameState, c: TileCoord): boolean {
  const terrain = tileAt(state.content.map, c);
  if (terrain === undefined) return false;
  return standHeight(state, c) > terrain.height;
}

/** True when an active object on this tile blocks movement without decking it. */
export function objectBlocksMovement(state: GameState, c: TileCoord): boolean {
  for (const obj of objectsAt(state, c)) {
    if (!isObjectActive(obj)) continue;
    if (providesSurface(state, obj)) continue;
    if (obj.def.blocksMovement) return true;
  }
  return false;
}

export function objectBlocksLos(state: GameState, c: TileCoord): boolean {
  for (const obj of objectsAt(state, c)) {
    if (!isObjectActive(obj)) continue;
    if (obj.def.blocksLos) return true;
  }
  return false;
}

/** Terrain and objects permit standing here (occupancy is checked separately). */
export function isStandable(state: GameState, c: TileCoord): boolean {
  const tile = tileAt(state.content.map, c);
  if (tile === undefined) return false;
  for (const obj of objectsAt(state, c)) {
    if (providesSurface(state, obj)) return true;
  }
  if (IMPASSABLE_TERRAIN.has(tile.terrain)) return false;
  return !objectBlocksMovement(state, c);
}

export function unitById(state: GameState, id: string): BattleUnit | undefined {
  return state.units.find((u) => u.id === id);
}

/** The standing unit occupying a tile; downed units do not occupy. */
export function unitAt(state: GameState, c: TileCoord): BattleUnit | undefined {
  return state.units.find((u) => !u.downed && coordEq(u.position, c));
}

/**
 * Hostility. `neutral` is non-combatant: never hostile to anyone and never
 * hostile *from* anyone, so bystanders can stand on the map (COMBAT_RULES §18).
 * Only same-team units are allies.
 */
export function areEnemies(a: BattleUnit, b: BattleUnit): boolean {
  return teamsHostile(a.team, b.team);
}

/** Same rule for a side with no unit behind it — a deployed turret's owner. */
export function teamsHostile(a: Team, b: Team): boolean {
  if (a === "neutral" || b === "neutral") return false;
  return a !== b;
}

export type AttackAngle = "front" | "side" | "back";

/**
 * Where the attacker stands relative to the target's facing. A perfect diagonal
 * counts as a side attack.
 */
export function attackAngle(attackerPos: TileCoord, target: BattleUnit): AttackAngle {
  const dx = attackerPos.x - target.position.x;
  const dy = attackerPos.y - target.position.y;
  if (dx === 0 && dy === 0) return "front";
  if (Math.abs(dx) === Math.abs(dy)) return "side";
  const from: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
  if (from === target.facing) return "front";
  const opposite: Record<Facing, Facing> = { north: "south", south: "north", east: "west", west: "east" };
  if (from === opposite[target.facing]) return "back";
  return "side";
}

/** All in-bounds tiles in row-major order — the canonical tile iteration order. */
export function allTiles(map: GameMap): TileCoord[] {
  const out: TileCoord[] = [];
  for (let y = 0; y < map.depth; y += 1) {
    for (let x = 0; x < map.width; x += 1) out.push({ x, y });
  }
  return out;
}
