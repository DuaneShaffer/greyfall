import type {
  Ability,
  Encounter,
  Facing,
  GameMap,
  Item,
  ItemStack,
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
export type ConsumableItem = Extract<Item, { slot: "consumable" }>;

/**
 * One team's shared field kit for this battle. FFT's item pool: whoever can
 * reach the target spends from the same satchel, and what is spent is gone.
 */
export interface TeamSatchel {
  team: Team;
  /** Sorted by item id; a stack that hits zero is removed. */
  items: ItemStack[];
}

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

/**
 * The mutable state of one grid node. The isolator is *not* duplicated here —
 * it lives on `object.powered`, where everything that writes power already
 * writes it. Energization is derived from the graph and stored nowhere.
 */
export interface GridNodeRuntime {
  objectId: string;
  /** A cut span. Reversible by a splice, unlike destruction. */
  severed: boolean;
  /** A source whose protection has latched open. Cleared by a reclose. */
  tripped: boolean;
}

/** A timed draw hung on a node by an `addLoad` effect. */
export interface GridLoad {
  id: string;
  nodeObjectId: string;
  /** null when nothing with a turn clock cast it; such a load never expires. */
  casterUnitId: string | null;
  amount: number;
  turnsRemaining: number | null;
}

/** Live state of one declared grid. Sorted collections; integer arithmetic only. */
export interface GridRuntime {
  gridId: string;
  /** Sorted by object id. */
  nodes: GridNodeRuntime[];
  /** Sorted by load id. */
  loads: GridLoad[];
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

/** Everything about a battle except the content snapshot, which never changes. */
export type BattleSnapshot = Omit<GameState, "content" | "moveUndo">;

/**
 * The one-step undo slot (COMBAT_RULES §10b). Holds the whole pre-move battle
 * as it stood before the accepted `move`, so `undoMove` is a wholesale restore
 * rather than a hand-written inverse of everything a walk can set off. Any
 * command other than a `move` clears it, which is what keeps the depth at one.
 */
export interface MoveUndoSlot {
  unitId: string;
  /** True when the move produced events beyond its own `UnitMoved`/facing pair. */
  consequential: boolean;
  state: BattleSnapshot;
}

/** The whole battle. JSON-serializable; nothing here is a class or a closure. */
export interface GameState {
  version: 2;
  content: BattleContent;
  rng: RngState;
  map: MapState;
  /** One per grid the map declares, sorted by grid id. Empty on an ungridded map. */
  grids: GridRuntime[];
  /** Sorted by unit id — the canonical iteration order for every rule. */
  units: BattleUnit[];
  /** Carry pools by team, sorted by team name. Consumption is permanent. */
  satchels: TeamSatchel[];
  charges: ChargedAction[];
  /** Ticks elapsed since battle start. */
  clock: number;
  /** Number of unit turns that have begun. */
  turn: number;
  activeTurn: ActiveTurn | null;
  firedTriggerIds: string[];
  result: BattleResult | null;
  nextOrdinal: number;
  /** Pre-move rollback for `undoMove`; never itself part of a snapshot. */
  moveUndo: MoveUndoSlot | null;
}
