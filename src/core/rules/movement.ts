import type { TerrainType, TileCoord } from "../../data/index.js";
import type { BattleUnit, GameState, MovementAbility } from "../state/types.js";
import {
  areEnemies,
  coordEq,
  inBounds,
  isDecked,
  isStandable,
  neighbors,
  standHeight,
  tileAt,
  tileFromIndex,
  tileIndex,
  unitAt,
} from "./grid.js";
import { effectiveStats } from "./status.js";

/** Extra tile cost multipliers for slow terrain. */
export const TERRAIN_COST_MULTIPLIER: Readonly<Partial<Record<TerrainType, number>>> = {
  rough: 2,
  water: 2,
};

export interface MoveProfile {
  move: number;
  jump: number;
  /** Rail tiles cost 1 while every other tile costs this much (Railrunner). */
  railMultiplier: number;
  /** Skips the water cost multiplier. */
  ignoresHazardTiles: boolean;
  moveThroughEnemies: boolean;
  /** Added to Jump for an upward step leaving a tile an ally is standing on. */
  allyVaultHeight: number;
  /** Added to Jump for an upward step onto an object's deck (catwalk, lift). */
  deckVaultHeight: number;
  /** Hostile-occupied tiles may be passed through while the tile is rail. */
  moveThroughEnemiesOnRail: boolean;
}

function movementPassive(state: GameState, unit: BattleUnit): MovementAbility["passive"] | undefined {
  const id = unit.unit.movementAbilityId;
  if (id === undefined) return undefined;
  const ability = state.content.abilities[id];
  if (ability === undefined || ability.slot !== "movement") return undefined;
  return ability.passive;
}

export function moveProfile(state: GameState, unit: BattleUnit): MoveProfile {
  const stats = effectiveStats(state, unit);
  const passive = movementPassive(state, unit);
  return {
    move: stats.move,
    jump: stats.jump,
    railMultiplier: passive?.railMoveMultiplier ?? 1,
    ignoresHazardTiles: passive?.ignoresHazardTiles ?? false,
    moveThroughEnemies: passive?.moveThroughEnemies ?? false,
    allyVaultHeight: passive?.allyVaultHeight ?? 0,
    deckVaultHeight: passive?.deckVaultHeight ?? 0,
    moveThroughEnemiesOnRail: passive?.moveThroughEnemiesOnRail ?? false,
  };
}

/**
 * Height a unit may clear on one step. Descents are always plain Jump — a boost
 * lifts you, it does not catch you. Vault allowances stack when a unit somehow
 * carries both; a single movement slot means shipped content never does.
 */
function stepClearance(
  state: GameState,
  unit: BattleUnit,
  profile: MoveProfile,
  from: TileCoord,
  to: TileCoord,
  rise: number,
): number {
  if (rise <= 0) return profile.jump;
  let clearance = profile.jump;
  if (profile.allyVaultHeight > 0) {
    const boost = unitAt(state, from);
    if (boost !== undefined && boost.id !== unit.id && boost.team === unit.team) {
      clearance += profile.allyVaultHeight;
    }
  }
  if (profile.deckVaultHeight > 0 && isDecked(state, to)) clearance += profile.deckVaultHeight;
  return clearance;
}

/** Whether a standing hostile on `tile` stops this unit from passing through it. */
function hostileBlocks(state: GameState, unit: BattleUnit, tile: TileCoord, profile: MoveProfile): boolean {
  const occupant = unitAt(state, tile);
  if (occupant === undefined || !areEnemies(occupant, unit)) return false;
  if (profile.moveThroughEnemies) return false;
  if (profile.moveThroughEnemiesOnRail && tileAt(state.content.map, tile)?.terrain === "rail") return false;
  return true;
}

/**
 * Cost of entering a tile, in the scaled units `MoveProfile.railMultiplier`
 * defines. Rail tiles always cost 1, so a rail multiplier of N lets a unit
 * cover N rail tiles for every ordinary tile.
 */
export function stepCost(state: GameState, c: TileCoord, profile: MoveProfile): number {
  const tile = tileAt(state.content.map, c);
  if (tile === undefined) return Number.MAX_SAFE_INTEGER;
  let cost = tile.terrain === "rail" ? 1 : profile.railMultiplier;
  if (tile.terrain === "rough") cost *= TERRAIN_COST_MULTIPLIER.rough ?? 1;
  if (tile.terrain === "water" && !profile.ignoresHazardTiles) cost *= TERRAIN_COST_MULTIPLIER.water ?? 1;
  return cost;
}

export interface MoveNode {
  /** Scaled cost from the unit's origin. */
  cost: number;
  /** Tile index stepped from, or -1 at the origin. */
  from: number;
}

/**
 * Uniform-cost search over the live map. Returns every tile the unit can enter
 * within its Move budget, keyed by tile index. Tiles it may pass through but
 * not stop on (allies, other units) are included with `canStop` false via
 * `reachableTiles`.
 */
export function moveField(state: GameState, unit: BattleUnit): Map<number, MoveNode> {
  const map = state.content.map;
  const profile = moveProfile(state, unit);
  const budget = profile.move * profile.railMultiplier;
  const origin = tileIndex(map, unit.position);
  const best = new Map<number, MoveNode>([[origin, { cost: 0, from: -1 }]]);
  const frontier: number[] = [origin];

  while (frontier.length > 0) {
    frontier.sort((a, b) => {
      const ca = best.get(a)?.cost ?? 0;
      const cb = best.get(b)?.cost ?? 0;
      return ca === cb ? a - b : ca - cb;
    });
    const current = frontier.shift();
    if (current === undefined) break;
    const node = best.get(current);
    if (node === undefined) continue;
    const from = tileFromIndex(map, current);
    const fromHeight = standHeight(state, from);

    for (const next of neighbors(from)) {
      if (!inBounds(map, next)) continue;
      if (!isStandable(state, next)) continue;
      const rise = standHeight(state, next) - fromHeight;
      if (Math.abs(rise) > stepClearance(state, unit, profile, from, next, rise)) continue;
      if (hostileBlocks(state, unit, next, profile)) continue;
      const cost = node.cost + stepCost(state, next, profile);
      if (cost > budget) continue;
      const index = tileIndex(map, next);
      const existing = best.get(index);
      if (existing !== undefined && existing.cost <= cost) continue;
      best.set(index, { cost, from: current });
      frontier.push(index);
    }
  }
  return best;
}

export interface ReachableTile {
  tile: TileCoord;
  cost: number;
  /** False for tiles that are only pass-through (occupied by another unit). */
  canStop: boolean;
}

/** Every tile in the unit's Move range, in row-major tile order. */
export function reachableTiles(state: GameState, unit: BattleUnit): ReachableTile[] {
  const map = state.content.map;
  const field = moveField(state, unit);
  const out: ReachableTile[] = [];
  for (const [index, node] of [...field.entries()].sort((a, b) => a[0] - b[0])) {
    const tile = tileFromIndex(map, index);
    const occupant = unitAt(state, tile);
    out.push({
      tile,
      cost: node.cost,
      canStop: occupant === undefined || occupant.id === unit.id,
    });
  }
  return out;
}

/**
 * Tile-by-tile path from the unit's position to `to`, inclusive of both ends,
 * or null when `to` is out of range or cannot be stood on.
 */
export function findPath(state: GameState, unit: BattleUnit, to: TileCoord): TileCoord[] | null {
  const map = state.content.map;
  if (!inBounds(map, to)) return null;
  const occupant = unitAt(state, to);
  if (occupant !== undefined && occupant.id !== unit.id) return null;
  const field = moveField(state, unit);
  const target = tileIndex(map, to);
  if (!field.has(target)) return null;

  const path: TileCoord[] = [];
  let cursor = target;
  while (cursor !== -1) {
    path.push(tileFromIndex(map, cursor));
    const node = field.get(cursor);
    if (node === undefined) break;
    cursor = node.from;
  }
  path.reverse();
  if (path.length === 0 || !coordEq(path[0] as TileCoord, unit.position)) return null;
  return path;
}
