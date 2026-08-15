import type { TileCoord } from "../../data/index.js";
// `Targeting` is not re-exported from src/data/index.ts; take it from the schema.
import type { Targeting } from "../../data/schemas/ability.js";
import type { ActionAbility, BattleUnit, GameState, TargetRef } from "../state/types.js";
import {
  FACING_VECTORS,
  allTiles,
  coordEq,
  facingToward,
  inBounds,
  manhattan,
  objectBlocksLos,
  standHeight,
} from "./grid.js";

/** Height a unit's eyes and a tile's blocking silhouette sit above its surface. */
export const EYE_HEIGHT = 1;

export interface RangeSpec {
  min: number;
  max: number;
  vertical: number;
}

/** Manhattan distance inside `[min, max]` and height delta inside `vertical`. */
export function inRange(state: GameState, from: TileCoord, to: TileCoord, range: RangeSpec): boolean {
  const distance = manhattan(from, to);
  if (distance < range.min || distance > range.max) return false;
  return Math.abs(standHeight(state, to) - standHeight(state, from)) <= range.vertical;
}

/**
 * Height-aware line of sight. The sight line runs from eye height above the
 * origin surface to eye height above the destination surface; an intermediate
 * tile blocks when its own surface rises above that line, or when an
 * undestroyed `blocksLos` object stands on it.
 *
 * Comparisons are scaled by the step count so no floating point is involved.
 */
export function hasLos(state: GameState, from: TileCoord, to: TileCoord): boolean {
  if (coordEq(from, to)) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const eyeFrom = standHeight(state, from) + EYE_HEIGHT;
  const eyeTo = standHeight(state, to) + EYE_HEIGHT;

  for (let i = 1; i < steps; i += 1) {
    const sample: TileCoord = {
      x: from.x + Math.round((dx * i) / steps),
      y: from.y + Math.round((dy * i) / steps),
    };
    if (coordEq(sample, from) || coordEq(sample, to)) continue;
    if (!inBounds(state.content.map, sample)) continue;
    if (objectBlocksLos(state, sample)) return false;
    const lineScaled = eyeFrom * steps + (eyeTo - eyeFrom) * i;
    if (standHeight(state, sample) * steps > lineScaled) return false;
  }
  return true;
}

/** Tiles an ability may be aimed at from `origin`, in row-major order. */
export function targetableTiles(state: GameState, origin: TileCoord, targeting: Targeting): TileCoord[] {
  const out: TileCoord[] = [];
  for (const tile of allTiles(state.content.map)) {
    if (!inRange(state, origin, tile, targeting.range)) continue;
    if (targeting.requiresLos && !hasLos(state, origin, tile)) continue;
    out.push(tile);
  }
  return out;
}

/**
 * Tiles an ability actually covers once aimed. `single` is the aimed tile,
 * `radius` is a Manhattan disc filtered by height delta, and `line` runs from
 * the actor toward the aimed tile for `length` tiles.
 */
export function areaTiles(
  state: GameState,
  targeting: Targeting,
  actorPos: TileCoord,
  aimed: TileCoord,
): TileCoord[] {
  const map = state.content.map;
  const area = targeting.area;
  if (area.shape === "single") return inBounds(map, aimed) ? [aimed] : [];

  if (area.shape === "radius") {
    const centerHeight = standHeight(state, aimed);
    const out: TileCoord[] = [];
    for (const tile of allTiles(map)) {
      if (manhattan(tile, aimed) > area.size) continue;
      if (Math.abs(standHeight(state, tile) - centerHeight) > area.vertical) continue;
      out.push(tile);
    }
    return out;
  }

  const step = FACING_VECTORS[facingToward(actorPos, aimed)];
  const out: TileCoord[] = [];
  for (let i = 1; i <= area.length; i += 1) {
    const tile: TileCoord = { x: actorPos.x + step.dx * i, y: actorPos.y + step.dy * i };
    if (!inBounds(map, tile)) break;
    out.push(tile);
  }
  return out;
}

/** The tile an ability is aimed at, resolving unit and object targets. */
export function aimedTile(state: GameState, target: TargetRef): TileCoord | undefined {
  if (target.kind === "tile") return target.tile;
  if (target.kind === "unit") return state.units.find((u) => u.id === target.unitId)?.position;
  return state.map.objects.find((o) => o.def.id === target.objectId)?.def.tiles[0];
}

/** Whether a target reference satisfies the ability's `validTargets` list. */
export function isValidTargetKind(
  state: GameState,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
): boolean {
  const allowed = ability.targeting.validTargets;
  if (target.kind === "object") return allowed.includes("object");
  if (target.kind === "unit") {
    const unit = state.units.find((u) => u.id === target.unitId);
    if (unit === undefined || unit.downed) return false;
    if (unit.id === actor.id) return allowed.includes("self") || allowed.includes("ally");
    if (unit.team === actor.team) return allowed.includes("ally");
    return allowed.includes("enemy");
  }
  const occupant = state.units.find((u) => !u.downed && coordEq(u.position, target.tile));
  if (occupant !== undefined) {
    return isValidTargetKind(state, actor, ability, { kind: "unit", unitId: occupant.id });
  }
  return allowed.includes("emptyTile");
}
