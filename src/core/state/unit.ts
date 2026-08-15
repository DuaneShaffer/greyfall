import type { Facing, Team, TileCoord, Unit } from "../../data/index.js";
import { deriveStats } from "../progression/stats.js";
import { equippedItems } from "../progression/stats.js";
import { passiveAbilities } from "./content.js";
import type { BattleContent, BattleUnit } from "./types.js";

/**
 * Put a roster unit on the battlefield: derive its battle stats from job curve,
 * equipment, and passive abilities, then start it at full HP and flux.
 */
export function createBattleUnit(
  content: BattleContent,
  unit: Unit,
  team: Team,
  position: TileCoord,
  facing: Facing,
): BattleUnit {
  const job = content.jobs[unit.jobId];
  if (job === undefined) throw new Error(`unknown job ${unit.jobId} for unit ${unit.id}`);
  const stats = deriveStats(
    unit,
    job,
    equippedItems(unit, content.items),
    passiveAbilities(content.abilities, unit.supportAbilityId, unit.movementAbilityId),
  );
  return {
    id: unit.id,
    unit: structuredClone(unit),
    team,
    position: { ...position },
    facing,
    hp: stats.hp,
    charge: stats.charge,
    stats,
    ct: 0,
    statuses: [],
    tempMods: [],
    downed: false,
    standingEarned: 0,
  };
}

export function sortUnits(units: BattleUnit[]): BattleUnit[] {
  return units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
