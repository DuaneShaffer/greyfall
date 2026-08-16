/**
 * Synthetic battles: a bare arena map built in code, unit templates built from
 * `data/jobs` and `data/items`, and encounters assembled programmatically so a
 * kit-versus-kit read is not confounded by any authored map's objects.
 *
 * Nothing here writes to `data/`. Everything is handed to `createBattle` through
 * a library assembled by `withContent`.
 */

import type { Deployment } from "../core/index.js";
import type {
  Ability,
  Encounter,
  Facing,
  GameMap,
  Item,
  Job,
  TileCoord,
  Unit,
} from "../data/index.js";
import type { ContentLibrary } from "../core/index.js";
import { withContent } from "./content.js";

export const ARENA_SIZE = 12;
export const ARENA_MAP_ID = "sim-arena";

/** Player band sits at high y, enemy band at low y; both are deployable so sides can swap. */
export const ARENA_SOUTH_Y = ARENA_SIZE - 3;
export const ARENA_NORTH_Y = 2;

/**
 * A bare NxN plain at height 0 with no objects. Height, terrain cost, cover,
 * line of sight, and destructible payloads are all removed, so a matchup run
 * here measures the kits and nothing else.
 */
export function arenaMap(size: number = ARENA_SIZE): GameMap {
  const tiles = Array.from({ length: size * size }, () => ({ height: 0, terrain: "plain" as const }));
  const band = (y: number): TileCoord[] =>
    Array.from({ length: size - 2 }, (_, i) => ({ x: i + 1, y }));
  return {
    schemaVersion: 1,
    id: ARENA_MAP_ID,
    name: "Simulation Arena",
    width: size,
    depth: size,
    tiles,
    objects: [],
    deploymentTiles: [...band(ARENA_NORTH_Y), ...band(size - 3)],
    grids: [],
  };
}

/** `count` tiles centred on row `y`, left to right. */
export function bandPositions(count: number, y: number, size: number = ARENA_SIZE): TileCoord[] {
  const start = Math.max(1, Math.floor((size - count) / 2));
  return Array.from({ length: count }, (_, i) => ({ x: start + i, y }));
}

// ---------------------------------------------------------------------------
// Unit templates
// ---------------------------------------------------------------------------

function abilitiesOfSlot(
  library: ContentLibrary,
  ids: readonly string[],
  slot: Ability["slot"],
): string[] {
  return [...ids]
    .sort()
    .filter((id) => library.abilities[id]?.slot === slot);
}

/** Sort key that reads as "tier": weapon power, or the sum of an armour piece's stat mods. */
function itemPower(item: Item): number {
  if (item.slot === "weapon") return item.power;
  const mods: Record<string, number | undefined> = "statMods" in item ? (item.statMods ?? {}) : {};
  return Object.values(mods).reduce((n: number, value) => n + (value ?? 0), 0);
}

function equippable(library: ContentLibrary, job: Job, slot: Item["slot"]): Item[] {
  const tags = new Set(job.equipTags);
  return Object.keys(library.items)
    .sort()
    .map((id) => library.items[id]!)
    .filter((item) => item.slot === slot && item.equipTags.some((tag) => tags.has(tag)))
    .sort((a, b) => itemPower(a) - itemPower(b) || (a.id < b.id ? -1 : 1));
}

export interface KitOptions {
  /** 0 = cheapest weapon, 1 = the next one up. Clamped to what exists. */
  weaponTier?: number;
  /** Give the unit every action ability its job can learn (default true). */
  fullKit?: boolean;
  /** Slot the job's first reaction, support, and movement ability (default true). */
  passives?: boolean;
  withArmor?: boolean;
  resolve?: number;
  attunement?: number;
}

/**
 * A representative member of `jobId` at `level`: the job's whole learnable
 * action list, its first reaction/support/movement ability, and tier-appropriate
 * gear. The full action list is deliberate — a sweep can only call an ability
 * dead if the AI was actually holding it.
 */
export function jobUnit(
  library: ContentLibrary,
  jobId: string,
  level: number,
  id: string,
  opts: KitOptions = {},
): Unit {
  const job = library.jobs[jobId];
  if (job === undefined) throw new Error(`sim: unknown job ${jobId}`);
  const learnable = job.learnableAbilityIds;
  const actions = opts.fullKit === false ? [] : abilitiesOfSlot(library, learnable, "action");
  const innate = abilitiesOfSlot(library, job.innateAbilityIds, "action");
  const passives = opts.passives !== false;
  const reaction = passives ? abilitiesOfSlot(library, learnable, "reaction")[0] : undefined;
  const support = passives ? abilitiesOfSlot(library, learnable, "support")[0] : undefined;
  const movement = passives ? abilitiesOfSlot(library, learnable, "movement")[0] : undefined;

  const tier = opts.weaponTier ?? 0;
  const weapons = equippable(library, job, "weapon");
  const weapon = weapons[Math.min(tier, weapons.length - 1)];
  const equipment: Unit["equipment"] = {};
  if (weapon !== undefined) equipment.weapon = weapon.id;
  if (opts.withArmor !== false) {
    const body = equippable(library, job, "body")[Math.min(tier, 1)] ?? equippable(library, job, "body")[0];
    const head = equippable(library, job, "head")[Math.min(tier, 1)] ?? equippable(library, job, "head")[0];
    if (body !== undefined) equipment.body = body.id;
    if (head !== undefined) equipment.head = head.id;
  }

  return {
    schemaVersion: 1,
    id,
    name: `${job.name} ${id}`,
    spriteId: job.spriteId,
    level,
    jobId,
    disposition: { resolve: opts.resolve ?? 50, attunement: opts.attunement ?? 50 },
    learnedAbilityIds: [...new Set([...actions, ...innate])].sort(),
    ...(reaction === undefined ? {} : { reactionAbilityId: reaction }),
    ...(support === undefined ? {} : { supportAbilityId: support }),
    ...(movement === undefined ? {} : { movementAbilityId: movement }),
    equipment,
  };
}

/** A roster unit re-levelled (and optionally re-kitted) without touching `data/`. */
export function respec(unit: Unit, overrides: Partial<Unit>): Unit {
  return { ...structuredClone(unit), ...structuredClone(overrides) };
}

// ---------------------------------------------------------------------------
// Encounter assembly
// ---------------------------------------------------------------------------

export interface MatchupSide {
  units: readonly Unit[];
  positions: readonly TileCoord[];
  facing: Facing;
}

export interface Matchup {
  id: string;
  map: GameMap;
  encounter: Encounter;
  party: readonly Unit[];
  deployment: readonly Deployment[];
  /** Library with the matchup's map and encounter folded in. */
  library: ContentLibrary;
}

export interface MatchupOptions {
  /** Loss when `state.turn` passes this. Keeps a stalled matchup from running to the command cap. */
  turnLimit?: number;
  seed?: number;
}

/**
 * Build a battle-ready encounter from two sides. The player side is deployed
 * through `createBattle`'s deployment list, so its tiles must be deployment
 * tiles on `map`; the enemy side is written into the encounter.
 */
export function buildMatchup(
  library: ContentLibrary,
  id: string,
  map: GameMap,
  player: MatchupSide,
  enemy: MatchupSide,
  opts: MatchupOptions = {},
): Matchup {
  if (player.units.length > player.positions.length) throw new Error(`${id}: not enough player tiles`);
  if (enemy.units.length > enemy.positions.length) throw new Error(`${id}: not enough enemy tiles`);

  const encounter: Encounter = {
    schemaVersion: 1,
    id,
    name: id,
    mapId: map.id,
    rngSeed: opts.seed ?? 0,
    maxDeployedUnits: Math.max(1, player.units.length),
    enemies: enemy.units.map((unit, i) => ({
      unit: structuredClone(unit),
      team: "enemy" as const,
      position: { ...enemy.positions[i]! },
      facing: enemy.facing,
    })),
    winConditions: [{ kind: "rout" }],
    lossConditions:
      opts.turnLimit === undefined
        ? [{ kind: "partyRout" }]
        : [{ kind: "partyRout" }, { kind: "turnLimit", turns: opts.turnLimit }],
    triggers: [],
  };

  return {
    id,
    map,
    encounter,
    party: player.units.map((u) => structuredClone(u)),
    deployment: player.units.map((unit, i) => ({
      unitId: unit.id,
      position: { ...player.positions[i]! },
      facing: player.facing,
    })),
    library: withContent(library, { maps: [map], encounters: [encounter] }),
  };
}

/** Two teams facing off across the bare arena, player at high y. */
export function arenaMatchup(
  library: ContentLibrary,
  id: string,
  playerUnits: readonly Unit[],
  enemyUnits: readonly Unit[],
  opts: MatchupOptions = {},
): Matchup {
  const map = arenaMap();
  return buildMatchup(
    library,
    id,
    map,
    { units: playerUnits, positions: bandPositions(playerUnits.length, ARENA_SOUTH_Y), facing: "north" },
    { units: enemyUnits, positions: bandPositions(enemyUnits.length, ARENA_NORTH_Y), facing: "south" },
    opts,
  );
}

// ---------------------------------------------------------------------------
// Real maps
// ---------------------------------------------------------------------------

function objectAt(map: GameMap, tile: TileCoord) {
  return map.objects.find((obj) => obj.tiles.some((t) => t.x === tile.x && t.y === tile.y));
}

/** Tiles a unit could conceivably stand on, ignoring reachability. */
export function standableTiles(map: GameMap): TileCoord[] {
  const out: TileCoord[] = [];
  for (let y = 0; y < map.depth; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.tiles[y * map.width + x];
      if (tile === undefined) continue;
      if (tile.terrain === "impassable" || tile.terrain === "void") continue;
      const obj = objectAt(map, { x, y });
      if (obj !== undefined && obj.blocksMovement && obj.surfaceHeight === undefined) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** Deployment tiles in a stable order, so the same battle always deploys the same way. */
export function orderedDeployTiles(map: GameMap): TileCoord[] {
  return [...map.deploymentTiles].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * `count` standable tiles as far as possible from the deployment band — where an
 * encounter author would put the opposition on a map whose deployment side is fixed.
 */
export function farStations(map: GameMap, count: number): TileCoord[] {
  const deploy = orderedDeployTiles(map);
  const cx = deploy.reduce((n, t) => n + t.x, 0) / Math.max(1, deploy.length);
  const cy = deploy.reduce((n, t) => n + t.y, 0) / Math.max(1, deploy.length);
  const scored = standableTiles(map)
    .map((tile) => ({ tile, d: Math.abs(tile.x - cx) + Math.abs(tile.y - cy) }))
    .sort((a, b) => b.d - a.d || a.tile.y - b.tile.y || a.tile.x - b.tile.x);
  const taken: TileCoord[] = [];
  for (const entry of scored) {
    if (taken.length >= count) break;
    if (taken.some((t) => t.x === entry.tile.x && t.y === entry.tile.y)) continue;
    taken.push(entry.tile);
  }
  return taken;
}

/** A matchup on an authored map: player on its deployment tiles, enemy at the far end. */
export function mapMatchup(
  library: ContentLibrary,
  id: string,
  map: GameMap,
  playerUnits: readonly Unit[],
  enemyUnits: readonly Unit[],
  opts: MatchupOptions = {},
): Matchup {
  const deploy = orderedDeployTiles(map);
  if (deploy.length < playerUnits.length) throw new Error(`${map.id}: too few deployment tiles`);
  return buildMatchup(
    library,
    id,
    map,
    { units: playerUnits, positions: deploy.slice(0, playerUnits.length), facing: "north" },
    { units: enemyUnits, positions: farStations(map, enemyUnits.length), facing: "south" },
    opts,
  );
}
