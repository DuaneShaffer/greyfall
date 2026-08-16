/**
 * Empirical time-to-kill: one unit stands adjacent to another and swings its
 * weapon until the other falls. No AI, no positioning, no abilities — the
 * commands are scripted so the number that comes out is the damage pipeline and
 * the evade roll, and nothing else.
 *
 * This is the measured counterpart of the projected table in
 * `docs/CONTENT_NOTES.md` §6.
 */

import {
  BASIC_ATTACK_ID,
  activeTurnState,
  applyCommand,
  battleResult,
  createBattle,
  getUnit,
  unitMaxHp,
  type ContentLibrary,
  type GameState,
} from "../core/index.js";
import type { Encounter, GameMap, Unit } from "../data/index.js";
import { withContent } from "./content.js";
import { jobUnit } from "./matchup.js";

const DUEL_MAP_ID = "sim-duel";
const ATTACKER_TILE = { x: 2, y: 3 };
const DEFENDER_TILE = { x: 2, y: 2 };

function duelMap(): GameMap {
  return {
    schemaVersion: 1,
    id: DUEL_MAP_ID,
    name: "Scripted Duel",
    width: 5,
    depth: 5,
    tiles: Array.from({ length: 25 }, () => ({ height: 0, terrain: "plain" as const })),
    objects: [],
    deploymentTiles: [ATTACKER_TILE],
    grids: [],
  };
}

function duelEncounter(defender: Unit, seed: number): Encounter {
  return {
    schemaVersion: 1,
    id: "sim-duel",
    name: "Scripted Duel",
    mapId: DUEL_MAP_ID,
    rngSeed: seed,
    maxDeployedUnits: 1,
    enemies: [{ unit: structuredClone(defender), team: "enemy", position: { ...DEFENDER_TILE }, facing: "south" }],
    winConditions: [{ kind: "rout" }],
    lossConditions: [{ kind: "partyRout" }],
    triggers: [],
  };
}

export interface DuelResult {
  attackerJob: string;
  defenderJob: string;
  level: number;
  /** Weapon attacks issued before the defender fell. */
  attacks: number;
  hits: number;
  misses: number;
  totalDamage: number;
  /** Damage of a single landed swing; constant for a given pairing. */
  damagePerHit: number;
  defenderMaxHp: number;
  downed: boolean;
}

/**
 * One scripted duel. The defender never acts; it only re-faces its attacker, so
 * every swing is a front attack and the defender's full evade applies.
 */
export function scriptedDuel(
  library: ContentLibrary,
  attackerJobId: string,
  defenderJobId: string,
  level: number,
  seed: number,
  attackCap = 200,
): DuelResult {
  const attacker = jobUnit(library, attackerJobId, level, "sim-a-attacker", {
    fullKit: false,
    passives: false,
    withArmor: false,
  });
  const defender = jobUnit(library, defenderJobId, level, "sim-b-defender", {
    fullKit: false,
    passives: false,
    withArmor: false,
  });
  const map = duelMap();
  const encounter = duelEncounter(defender, seed);
  const content = withContent(library, { maps: [map], encounters: [encounter] });

  let state: GameState = createBattle(content, encounter.id, [attacker], [
    { unitId: attacker.id, position: { ...ATTACKER_TILE }, facing: "north" },
  ]).state;

  const defenderMaxHp = unitMaxHp(state, defender.id) ?? 0;
  let attacks = 0;
  let hits = 0;
  let misses = 0;
  let totalDamage = 0;
  let damagePerHit = 0;

  while (battleResult(state) === null && attacks < attackCap) {
    const turn = activeTurnState(state);
    if (turn === null) break;
    if (turn.unitId === attacker.id && !turn.acted) {
      attacks += 1;
      const result = applyCommand(state, {
        kind: "act",
        unitId: attacker.id,
        abilityId: BASIC_ATTACK_ID,
        target: { kind: "unit", unitId: defender.id },
      });
      if (result.error !== null) break;
      state = result.state;
      let landed = false;
      for (const event of result.events) {
        if (event.type === "DamageDealt" && event.unitId === defender.id) {
          landed = true;
          totalDamage += event.amount;
          damagePerHit = event.amount;
        }
      }
      if (landed) hits += 1;
      else misses += 1;
      continue;
    }
    const facing = turn.unitId === attacker.id ? "north" : "south";
    const result = applyCommand(state, { kind: "wait", unitId: turn.unitId, facing });
    if (result.error !== null) break;
    state = result.state;
  }

  return {
    attackerJob: attackerJobId,
    defenderJob: defenderJobId,
    level,
    attacks,
    hits,
    misses,
    totalDamage,
    damagePerHit,
    defenderMaxHp,
    downed: getUnit(state, defender.id)?.downed === true,
  };
}

export interface TtkCell {
  attackerJob: string;
  defenderJob: string;
  level: number;
  damagePerHit: number;
  defenderMaxHp: number;
  /** `ceil(maxHp / damagePerHit)` — swings needed with no misses. */
  hitsToDown: number;
  /** Mean swings actually issued across the seeds, misses included. */
  meanAttacks: number;
  seeds: number;
}

export function ttkCell(
  library: ContentLibrary,
  attackerJobId: string,
  defenderJobId: string,
  level: number,
  seeds: readonly number[],
): TtkCell {
  const duels = seeds.map((seed) => scriptedDuel(library, attackerJobId, defenderJobId, level, seed));
  const first = duels[0]!;
  const damagePerHit = first.damagePerHit;
  const total = duels.reduce((n, d) => n + d.attacks, 0);
  return {
    attackerJob: attackerJobId,
    defenderJob: defenderJobId,
    level,
    damagePerHit,
    defenderMaxHp: first.defenderMaxHp,
    hitsToDown: damagePerHit > 0 ? Math.ceil(first.defenderMaxHp / damagePerHit) : Infinity,
    meanAttacks: total / duels.length,
    seeds: duels.length,
  };
}

export function ttkMatrix(
  library: ContentLibrary,
  jobIds: readonly string[],
  levels: readonly number[],
  seeds: readonly number[],
): TtkCell[] {
  const out: TtkCell[] = [];
  for (const level of levels) {
    for (const attacker of jobIds) {
      for (const defender of jobIds) {
        out.push(ttkCell(library, attacker, defender, level, seeds));
      }
    }
  }
  return out;
}
