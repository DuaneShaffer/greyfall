import type { AbilityRequirement, Effect, Targeting, TileCoord } from "../../data/index.js";
import type { ActionAbility, BattleUnit, GameState, ObjectRuntime, TargetRef } from "../state/types.js";
import {
  FACING_VECTORS,
  allTiles,
  coordEq,
  facingToward,
  inBounds,
  manhattan,
  objectBlocksLos,
  objectById,
  standHeight,
  tileAt,
} from "./board.js";
import { gridNodeOf, isEnergized } from "./power.js";

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

/**
 * The tiles that decide whether a target is in reach. A multi-tile object
 * answers on **any** of its own tiles: the overlay lights all of them, and an
 * order sent at the far end of a two-tile run must not be re-judged against the
 * end the object happens to list first.
 */
export function targetReachTiles(state: GameState, target: TargetRef): TileCoord[] {
  if (target.kind === "object") {
    const obj = state.map.objects.find((o) => o.def.id === target.objectId);
    return obj === undefined ? [] : obj.def.tiles;
  }
  const tile = aimedTile(state, target);
  return tile === undefined ? [] : [tile];
}

const OBJECT_EFFECT_KINDS = new Set([
  "setPower",
  "damageObject",
  "repairObject",
  "addLoad",
  "severLine",
]);

/** Whether one object-scoped effect has anything to do to this object at all. */
function effectReaches(state: GameState, effect: Effect, obj: ObjectRuntime): boolean {
  switch (effect.kind) {
    // The isolator flag is the whole of what `setPower` writes: an object with
    // no flag is not switched off, it is not electrical.
    case "setPower":
      return obj.powered !== null;
    case "addLoad":
      return gridNodeOf(state, obj.def.id) !== null;
    case "severLine":
      return gridNodeOf(state, obj.def.id)?.node.role === "line";
    default:
      return true;
  }
}

/**
 * Whether an object-verb ability would do nothing whatever to this object.
 *
 * Throw the Breaker offered a stack of drums as a target, forecast "Power
 * switched", and spent the action and the charge on a wall. An order the rules
 * cannot carry out must not be offered and must not be accepted — the same
 * class of bug the aim-legality layer was built for.
 */
export function objectTargetIsInert(
  state: GameState,
  ability: ActionAbility,
  obj: ObjectRuntime,
): boolean {
  const reaching = ability.effects.filter((effect) => OBJECT_EFFECT_KINDS.has(effect.kind));
  if (reaching.length === 0) return false;
  return reaching.every((effect) => !effectReaches(state, effect, obj));
}

/** Objects that decide `targetPowered`: the aimed-at one plus any covering the tile. */
function targetedObjects(state: GameState, target: TargetRef): ObjectRuntime[] {
  if (target.kind === "object") {
    const obj = state.map.objects.find((o) => o.def.id === target.objectId);
    return obj === undefined ? [] : [obj];
  }
  const tile = aimedTile(state, target);
  if (tile === undefined) return [];
  return state.map.objects.filter((o) => o.def.tiles.some((t) => coordEq(t, tile)));
}

function requirementMet(
  state: GameState,
  actor: BattleUnit,
  requirement: AbilityRequirement,
  target: TargetRef | null,
): boolean {
  switch (requirement) {
    case "railUnderfoot":
      return tileAt(state.content.map, actor.position)?.terrain === "rail";
    case "adjacentPoweredObject":
      return state.map.objects.some(
        (o) =>
          !o.destroyed &&
          isEnergized(state, o.def.id) &&
          o.def.tiles.some((t) => manhattan(t, actor.position) <= 1),
      );
    // Synonyms: `targetEnergized` is the grid-native spelling and `targetPowered`
    // is kept so shipped JSON does not churn to say the same thing (§1.3).
    case "targetPowered":
    case "targetEnergized":
      if (target === null) return true;
      return targetedObjects(state, target).some((o) => !o.destroyed && isEnergized(state, o.def.id));
    case "targetLine":
    case "targetSource":
    case "targetBreaker": {
      if (target === null) return true;
      const role = requirement === "targetLine" ? "line" : requirement === "targetSource" ? "source" : "breaker";
      return targetedObjects(state, target).some(
        (o) => !o.destroyed && gridNodeOf(state, o.def.id)?.node.role === role,
      );
    }
  }
}

/**
 * The first `requires` entry the battlefield does not satisfy, or null.
 *
 * With `target` null only the actor-scoped requirements are checked, which is
 * what a menu needs: `targetPowered` cannot be answered until something is
 * aimed at.
 */
export function unmetRequirement(
  state: GameState,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef | null,
): AbilityRequirement | null {
  for (const requirement of ability.requires ?? []) {
    if (!requirementMet(state, actor, requirement, target)) return requirement;
  }
  return null;
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

/** Why an aimed action is illegal. The codes are `CommandErrorCode` spellings. */
export interface AimRefusal {
  code: "invalid-target" | "object-destroyed" | "out-of-range" | "no-line-of-sight" | "requirement-unmet";
  message: string;
}

/**
 * The one aim-legality gate, asked from `from` rather than from the actor's own
 * tile so the AI can weigh an action it would take after moving. The command
 * layer refuses by this and the AI's search offers by it: a divergence here is a
 * plan the rules reject, so there is deliberately only the one copy.
 */
export function aimRefusal(
  state: GameState,
  actor: BattleUnit,
  ability: ActionAbility,
  target: TargetRef,
  from: TileCoord,
): AimRefusal | null {
  if (aimedTile(state, target) === undefined) {
    return { code: "invalid-target", message: "target does not exist" };
  }
  if (!isValidTargetKind(state, actor, ability, target)) {
    return { code: "invalid-target", message: `${ability.name} cannot target that` };
  }
  const object = target.kind === "object" ? objectById(state, target.objectId) : undefined;
  if (object?.destroyed === true) {
    return { code: "object-destroyed", message: "target object is destroyed" };
  }
  // An object is in reach on any of its own tiles: the aim overlay lights all
  // of them, so committing through one of them must not be re-judged against
  // whichever tile the object lists first.
  const reach = targetReachTiles(state, target).filter((tile) =>
    inRange(state, from, tile, ability.targeting.range),
  );
  if (reach.length === 0) {
    return { code: "out-of-range", message: `${ability.name} cannot reach that tile` };
  }
  if (ability.targeting.requiresLos && !reach.some((tile) => hasLos(state, from, tile))) {
    return { code: "no-line-of-sight", message: "nothing in sight there" };
  }
  const requirement = unmetRequirement(state, actor, ability, target);
  if (requirement !== null) {
    return { code: "requirement-unmet", message: `${ability.id} needs ${requirement}` };
  }
  // Last, so an ability that states its own gate refuses by that gate's name.
  if (object !== undefined && objectTargetIsInert(state, ability, object)) {
    return { code: "invalid-target", message: `${ability.name} has nothing to work on there` };
  }
  return null;
}
