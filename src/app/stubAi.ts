// PLACEHOLDER ENEMY AI — to be deleted by the Phase 2 AI workstream.
//
// Deliberately dumb and deliberately shallow: no threat maps, no positioning,
// no ability sequencing, no self-preservation. It exists only so a battle can
// be played end to end in the browser. It touches nothing but the public core
// API and its selectors, and it emits ordinary `Command`s, so replacing it with
// the real AI is a one-file swap.
//
// Policy, in order:
//   1. If it can damage a hostile unit this turn, use the highest-forecast
//      option available.
//   2. Otherwise step toward the nearest hostile unit.
//   3. Otherwise wait, facing the nearest hostile unit.

import {
  abilityInfo,
  activeTurnState,
  activeUnit,
  allUnits,
  availableAbilities,
  forecast,
  getUnit,
  reachableTiles,
  targetableTiles,
  type BattleUnit,
  type Command,
  type GameState,
  type TargetRef,
} from "../core/index.js";
import type { Facing, TileCoord } from "../data/index.js";

const manhattan = (a: TileCoord, b: TileCoord): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const facingToward = (from: TileCoord, to: TileCoord): Facing => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
};

const hostilesTo = (state: GameState, actor: BattleUnit): BattleUnit[] =>
  allUnits(state).filter((unit) => !unit.downed && unit.team !== actor.team);

const nearestHostile = (state: GameState, actor: BattleUnit): BattleUnit | null => {
  let best: BattleUnit | null = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const unit of hostilesTo(state, actor)) {
    const distance = manhattan(actor.position, unit.position);
    if (distance < bestDistance) {
      best = unit;
      bestDistance = distance;
    }
  }
  return best;
};

interface Attack {
  abilityId: string;
  target: TargetRef;
  expected: number;
}

function bestAttack(state: GameState, actor: BattleUnit): Attack | null {
  let best: Attack | null = null;
  for (const abilityId of availableAbilities(state, actor.id)) {
    const ability = abilityInfo(state, actor.id, abilityId);
    if (ability === null || ability.slot !== "action") continue;
    if (actor.charge < ability.chargeCost) continue;
    const hpCost = ability.hpCost ?? 0;
    if (hpCost > 0 && actor.hp <= hpCost) continue;

    const reachable = targetableTiles(state, actor.id, abilityId);
    for (const victim of hostilesTo(state, actor)) {
      if (!reachable.some((tile) => tile.x === victim.position.x && tile.y === victim.position.y)) {
        continue;
      }
      const target: TargetRef = { kind: "unit", unitId: victim.id };
      let expected = 0;
      for (const entry of forecast(state, actor.id, abilityId, target)) {
        if (entry.unitId === null) continue;
        const other = getUnit(state, entry.unitId);
        if (other === null) continue;
        expected += other.team === actor.team ? -entry.expectedDamage : entry.expectedDamage;
      }
      if (expected <= 0) continue;
      if (best === null || expected > best.expected) best = { abilityId, target, expected };
    }
  }
  return best;
}

function approach(state: GameState, actor: BattleUnit, quarry: BattleUnit): Command | null {
  let bestTile: TileCoord | null = null;
  let bestDistance = manhattan(actor.position, quarry.position);
  for (const reachable of reachableTiles(state, actor.id)) {
    if (!reachable.canStop) continue;
    const distance = manhattan(reachable.tile, quarry.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTile = reachable.tile;
    }
  }
  return bestTile === null ? null : { kind: "move", unitId: actor.id, to: bestTile };
}

/**
 * One command for the acting non-player unit, or null when it is not an
 * AI-controlled unit's turn. Always terminates a turn eventually: after acting
 * and moving are both spent it can only return `wait`.
 */
export function stubAiCommand(state: GameState): Command | null {
  const actor = activeUnit(state);
  const turn = activeTurnState(state);
  if (actor === null || turn === null || actor.team === "player") return null;

  if (!turn.acted) {
    const attack = bestAttack(state, actor);
    if (attack !== null) {
      return { kind: "act", unitId: actor.id, abilityId: attack.abilityId, target: attack.target };
    }
  }

  const quarry = nearestHostile(state, actor);
  if (!turn.moved && quarry !== null) {
    const move = approach(state, actor, quarry);
    if (move !== null) return move;
  }

  return {
    kind: "wait",
    unitId: actor.id,
    facing: quarry === null ? actor.facing : facingToward(actor.position, quarry.position),
  };
}
