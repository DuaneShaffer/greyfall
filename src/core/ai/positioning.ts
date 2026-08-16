import type { Facing, TileCoord } from "../../data/index.js";
import { attackAngle, facingToward, manhattan, standHeight, tileIndex } from "../rules/grid.js";
import { maxHp } from "../rules/status.js";
import { hasLos } from "../rules/targeting.js";
import type { BattleUnit, GameState } from "../state/types.js";
import { fieldDistance, tileHazard, type AiContext } from "./context.js";
import { UNREACHABLE } from "./field.js";

const FACINGS: readonly Facing[] = ["north", "east", "south", "west"];

/** Scales the pull toward the enemy as a stalemate drags on. */
function urgencyPercent(ctx: AiContext): number {
  return 100 + ctx.urgency * 50;
}

function approachValue(ctx: AiContext, tile: TileCoord): number {
  const quarry = ctx.quarry;
  if (quarry === null) return 0;
  const distance = fieldDistance(ctx, quarry.id, tile);
  if (distance >= UNREACHABLE) return -ctx.weights.unreachablePenalty;

  const standoff = ctx.urgency >= ctx.weights.forceAdvanceUrgency ? 0 : ctx.profile.standoff;
  const far = Math.max(0, distance - standoff);
  const near = Math.max(0, standoff - distance);
  const pull = Math.floor(
    (far * ctx.weights.approachPoint * ctx.profile.approachPercent * urgencyPercent(ctx)) / 10000,
  );
  return -pull - near * ctx.weights.standoffPoint;
}

function exposureValue(ctx: AiContext, tile: TileCoord): number {
  let penalty = 0;
  for (const threat of ctx.threats) {
    if (threat.strike <= 0) continue;
    const travel = fieldDistance(ctx, threat.unit.id, tile);
    const direct = manhattan(threat.unit.position, tile);
    const near = Math.min(travel, direct);
    let percent = 0;
    if (near <= threat.reach) percent = 100;
    else if (near <= threat.reach * 2) percent = 40;
    if (percent === 0) continue;
    penalty += Math.floor((threat.strike * ctx.weights.exposurePoint * percent) / 100);
  }
  return -Math.floor((penalty * ctx.profile.exposurePercent) / 100);
}

function coverValue(ctx: AiContext, view: GameState, tile: TileCoord): number {
  let value = 0;
  for (const threat of ctx.threats) {
    if (!threat.ranged || threat.strike <= 0) continue;
    if (hasLos(view, threat.unit.position, tile)) continue;
    value += ctx.weights.coverPoint;
  }
  return Math.floor((value * ctx.profile.coverPercent) / 100);
}

function heightValue(ctx: AiContext, view: GameState, tile: TileCoord): number {
  return Math.floor((standHeight(view, tile) * ctx.weights.heightPoint * ctx.profile.heightPercent) / 100);
}

function clumpValue(ctx: AiContext, tile: TileCoord): number {
  let penalty = 0;
  for (const ally of ctx.allies) {
    if (manhattan(ally.position, tile) <= ctx.weights.clumpRadius) penalty += ctx.weights.clumpPoint;
  }
  return -penalty;
}

/** Support kits want to stand where the hurt allies are still reachable. */
function guardValue(ctx: AiContext, view: GameState, tile: TileCoord): number {
  if (!ctx.kit.healsAllies) return 0;
  let value = 0;
  for (const ally of ctx.allies) {
    const missing = Math.max(0, maxHp(view, ally) - ally.hp);
    if (missing <= 0) continue;
    if (manhattan(ally.position, tile) > ctx.kit.bestRange) continue;
    value += Math.floor((missing * ctx.weights.guardPoint * ctx.profile.allyAidPercent) / 10000);
  }
  return value;
}

function computeValue(ctx: AiContext, view: GameState, tile: TileCoord): number {
  return (
    approachValue(ctx, tile) +
    exposureValue(ctx, tile) +
    coverValue(ctx, view, tile) +
    heightValue(ctx, view, tile) +
    clumpValue(ctx, tile) +
    guardValue(ctx, view, tile) -
    tileHazard(ctx, tile)
  );
}

/**
 * What the tile itself is worth to end a turn on, before any action taken from
 * it: distance to the fight, standing danger, exposure to who can hit back,
 * cover, height, and not bunching up into somebody's area effect.
 *
 * Memoised for the decision. Every term above reads the map, the hostiles, the
 * allies and the distance fields — none of them reads where the *actor* is
 * standing — so a tile has one value for the whole turn whichever candidate
 * view asks for it. That invariant is what makes pricing a `moveSelf`
 * destination cost nothing.
 */
export function positionValue(ctx: AiContext, view: GameState, tile: TileCoord): number {
  const index = tileIndex(ctx.state.content.map, tile);
  const cached = ctx.placeMemo.get(index);
  if (cached !== undefined) return cached;
  const value = computeValue(ctx, view, tile);
  ctx.placeMemo.set(index, value);
  return value;
}

/**
 * The facing to end the turn in: the one that shows the fewest backs and sides
 * to whoever can still reach the unit, weighted by how hard they hit. Ties go
 * to the earlier facing in N/E/S/W order, then to the nearest hostile.
 */
export function bestFacing(ctx: AiContext, tile: TileCoord): Facing {
  const w = ctx.weights;
  let best: Facing | null = null;
  let bestPenalty = Number.MAX_SAFE_INTEGER;

  for (const facing of FACINGS) {
    const mock: BattleUnit = { ...ctx.actor, position: tile, facing };
    let penalty = 0;
    for (const threat of ctx.threats) {
      if (threat.strike <= 0) continue;
      const near = Math.min(fieldDistance(ctx, threat.unit.id, tile), manhattan(threat.unit.position, tile));
      const weight = near <= threat.reach ? 100 : near <= threat.reach * 2 ? 40 : 10;
      const angle = attackAngle(threat.unit.position, mock);
      const exposure = angle === "back" ? w.backExposure : angle === "side" ? w.sideExposure : 0;
      penalty += Math.floor((threat.strike * exposure * weight) / 100);
    }
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = facing;
    }
  }

  if (best !== null && ctx.threats.some((threat) => threat.strike > 0)) return best;
  const quarry = ctx.quarry;
  return quarry === null ? ctx.actor.facing : facingToward(tile, quarry.position);
}
