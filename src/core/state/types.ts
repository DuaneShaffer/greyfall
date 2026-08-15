import type {
  Ability,
  Encounter,
  Facing,
  GameMap,
  Item,
  Job,
  MapObject,
  Status,
  StatMods,
  Team,
  TileCoord,
  Unit,
} from "../../data/index.js";
import type { DerivedStats } from "../progression/stats.js";
import type { RngState } from "../rng/mulberry32.js";

export type ActionAbility = Extract<Ability, { slot: "action" }>;
export type ReactionAbility = Extract<Ability, { slot: "reaction" }>;
export type SupportAbility = Extract<Ability, { slot: "support" }>;
export type MovementAbility = Extract<Ability, { slot: "movement" }>;
export type WeaponItem = Extract<Item, { slot: "weapon" }>;

/** What a command or effect points at. Serializable; never holds object refs. */
export type TargetRef =
  | { kind: "tile"; tile: TileCoord }
  | { kind: "unit"; unitId: string }
  | { kind: "object"; objectId: string };

/**
 * The content a battle needs, snapshotted into `GameState` at `createBattle`.
 * Embedding it keeps save/load and replay exact even if `data/` changes later,
 * and keeps `applyCommand(state, cmd)` a two-argument pure function.
 */
export interface BattleContent {
  jobs: Readonly<Record<string, Job>>;
  abilities: Readonly<Record<string, Ability>>;
  items: Readonly<Record<string, Item>>;
  statuses: Readonly<Record<string, Status>>;
  map: GameMap;
  encounter: Encounter;
}

export interface ActiveStatus {
  statusId: string;
  /** null = `untilRemoved`. Counts the afflicted unit's own turns. */
  turnsRemaining: number | null;
}

/** A timed stat change from a `modifyStats` effect. */
export interface TempStatMod {
  id: string;
  mods: StatMods;
  turnsRemaining: number | null;
}

/** A unit as it exists on the battlefield. */
export interface BattleUnit {
  id: string;
  /** Roster definition: level, job, disposition, equipment, ability loadout. */
  unit: Unit;
  team: Team;
  position: TileCoord;
  facing: Facing;
  hp: number;
  charge: number;
  /** Base stats from `deriveStats`; statuses and temp mods layer on top. */
  stats: DerivedStats;
  ct: number;
  statuses: ActiveStatus[];
  tempMods: TempStatMod[];
  downed: boolean;
  standingEarned: number;
}

/** Live state of one map object, including runtime-spawned turrets/mines/drones. */
export interface ObjectRuntime {
  /** Definition copied from the map (or synthesized for spawned objects). */
  def: MapObject;
  /** Remaining integrity; 0 and meaningless for indestructible objects. */
  hp: number;
  destroyed: boolean;
  powered: boolean | null;
  /** Team that spawned it, or null for objects authored into the map. */
  owner: Team | null;
  /** Unit that deployed it; the actor its `autoAttack` amounts resolve against. */
  ownerUnitId: string | null;
  /** CT banked toward the next `autoAttack`. Meaningless without one. */
  ct: number;
}

export interface MapState {
  /** Sorted by object id. */
  objects: ObjectRuntime[];
}

/** An ability mid-cast, riding its own CT timeline at `castSpeed` per tick. */
export interface ChargedAction {
  id: string;
  actorId: string;
  abilityId: string;
  target: TargetRef;
  castSpeed: number;
  ct: number;
}

export interface ActiveTurn {
  unitId: string;
  moved: boolean;
  acted: boolean;
}

export type BattleResult = "win" | "loss";

/** The whole battle. JSON-serializable; nothing here is a class or a closure. */
export interface GameState {
  version: 1;
  content: BattleContent;
  rng: RngState;
  map: MapState;
  /** Sorted by unit id — the canonical iteration order for every rule. */
  units: BattleUnit[];
  charges: ChargedAction[];
  /** Ticks elapsed since battle start. */
  clock: number;
  /** Number of unit turns that have begun. */
  turn: number;
  activeTurn: ActiveTurn | null;
  firedTriggerIds: string[];
  result: BattleResult | null;
  nextOrdinal: number;
}
