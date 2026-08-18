import type {
  Ability,
  Effect,
  Encounter,
  GameMap,
  Grid,
  GridNode,
  GridRole,
  Item,
  ItemStack,
  Job,
  StatMods,
  Status,
  Team,
  TileCoord,
} from "../data/index.js";
import type { DerivedStats } from "./progression/stats.js";
import { activateObject as fireObject, resolveArea } from "./rules/abilities.js";
import { hitChance, inertAmountTarget, resolveAmount, unitAmountTarget } from "./rules/damage.js";
import { damageObject, emptyOutcome, objectMaxHp, setObjectPower } from "./rules/effects.js";
import {
  canCarryItem,
  carriedItemIds,
  consumableItem,
  itemAbilityId,
  satchelCount,
  teamSatchel as satchelOf,
} from "./rules/items.js";
import { areEnemies, attackAngle, coordEq, manhattan, objectById, unitById, type AttackAngle } from "./rules/board.js";
import { reachableTiles as computeReachable, type ReachableTile } from "./rules/movement.js";
import {
  attachLoad,
  gridNodeOf,
  gridNodeRuntimeOf,
  gridOf,
  isEnergized,
  powerSnapshot,
  severLine,
  solveGrid,
} from "./rules/power.js";
import {
  CT_COST_MOVE_AND_ACT,
  MAX_TICKS_PER_ADVANCE,
  readyCharges,
  readyUnits,
} from "./rules/turn.js";
import { canAct, canMove, ctPerTick, effectiveStats, maxCharge, maxHp } from "./rules/status.js";
import {
  aimRefusal,
  hasLos,
  isValidTargetKind,
  objectTargetIsInert,
  targetableTiles as computeTargetable,
  unmetRequirement,
  type AimRefusal,
} from "./rules/targeting.js";
import { abilityById, itemById, jobById, knownActionAbilityIds, statusById } from "./state/content.js";
import { cloneState, type Ctx } from "./state/ctx.js";
import type {
  ActionAbility,
  ActiveTurn,
  BattleResult,
  BattleUnit,
  ChargedAction,
  GameState,
  ObjectRuntime,
  TargetRef,
} from "./state/types.js";

/** The unit whose turn it is, or null between turns. */
export function activeUnit(state: GameState): BattleUnit | null {
  const turn = state.activeTurn;
  if (turn === null) return null;
  return unitById(state, turn.unitId) ?? null;
}

export function getUnit(state: GameState, unitId: string): BattleUnit | null {
  return unitById(state, unitId) ?? null;
}

/** Every unit in the battle, downed included, in unit-id order. */
export function allUnits(state: GameState): readonly BattleUnit[] {
  return state.units;
}

/** Every map object, destroyed included, in object-id order. */
export function allObjects(state: GameState): readonly ObjectRuntime[] {
  return state.map.objects;
}

/** Abilities currently mid-cast, in the order they were started. */
export function allCharges(state: GameState): readonly ChargedAction[] {
  return state.charges;
}

export function battleMap(state: GameState): GameMap {
  return state.content.map;
}

export function battleEncounter(state: GameState): Encounter {
  return state.content.encounter;
}

/** Ticks elapsed since the battle began. */
export function battleClock(state: GameState): number {
  return state.clock;
}

/** Number of unit turns that have begun. */
export function turnNumber(state: GameState): number {
  return state.turn;
}

export function battleResult(state: GameState): BattleResult | null {
  return state.result;
}

/** The active turn's move/act bookkeeping, or null between turns. */
export function activeTurnState(state: GameState): ActiveTurn | null {
  return state.activeTurn;
}

/**
 * Whether `undoMove` would be accepted for this unit right now — the button's
 * enabled state, and the same test the command layer applies (COMBAT_RULES §10b).
 */
export function canUndoMove(state: GameState, unitId: string): boolean {
  return state.result === null && state.moveUndo?.unitId === unitId;
}

/** False when a status such as Stunned is holding the unit still. */
export function unitCanMove(state: GameState, unitId: string): boolean {
  const unit = unitById(state, unitId);
  return unit === undefined ? false : canMove(state, unit);
}

/** False when a status such as Stunned is suppressing the unit's action. */
export function unitCanAct(state: GameState, unitId: string): boolean {
  const unit = unitById(state, unitId);
  return unit === undefined ? false : canAct(state, unit);
}

/**
 * Definition of an ability as this unit would use it, including the engine's
 * synthesized `basic-attack` (which is not a content file).
 */
export function getAbility(state: GameState, unitId: string, abilityId: string): Ability | null {
  const unit = unitById(state, unitId);
  if (unit === undefined) return null;
  return abilityById(state, unit, abilityId) ?? null;
}

export function getJob(state: GameState, jobId: string): Job | null {
  return jobById(state, jobId) ?? null;
}

export function getStatus(state: GameState, statusId: string): Status | null {
  return statusById(state, statusId) ?? null;
}

export function getItem(state: GameState, itemId: string): Item | null {
  return itemById(state, itemId) ?? null;
}

/** Where an attacker stands relative to the target's facing. */
export function attackAngleAgainst(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
): AttackAngle | null {
  const attacker = unitById(state, attackerUnitId);
  const target = unitById(state, targetUnitId);
  if (attacker === undefined || target === undefined) return null;
  return attackAngle(attacker.position, target);
}

/**
 * Objects the unit could `activateObject` right now: undestroyed, operable,
 * powered when the controls need it, and within one tile of the unit.
 */
export function activatableObjects(state: GameState, unitId: string): readonly ObjectRuntime[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  return state.map.objects.filter((obj) => {
    if (obj.destroyed || obj.def.operable === null) return false;
    if (obj.def.operable.requiresPower && !isEnergized(state, obj.def.id)) return false;
    return obj.def.tiles.some((tile) => manhattan(tile, unit.position) <= 1);
  });
}

export function getObject(state: GameState, objectId: string): ObjectRuntime | null {
  return objectById(state, objectId) ?? null;
}

export interface PoweredObject {
  objectId: string;
  name: string;
  powered: boolean;
}

/**
 * Electrical machinery whose power is something the battle is fought over: it
 * has controls of its own, a switch somewhere on the map throws it, or it is a
 * node of a declared grid. Feeder cells and other scenery carry a `powered`
 * flag nobody can move and are left out — the readout is a list of live
 * questions, not an inventory. `powered` here is the derived value the register
 * lights, not the isolator flag underneath it.
 */
export function poweredObjects(state: GameState): PoweredObject[] {
  const switched = new Set<string>();
  for (const object of state.map.objects) {
    for (const id of object.def.operable?.targetObjectIds ?? []) switched.add(id);
  }
  const out: PoweredObject[] = [];
  for (const object of state.map.objects) {
    if (object.destroyed || object.powered === null) continue;
    const networked = gridNodeOf(state, object.def.id) !== null;
    if (object.def.operable === null && !switched.has(object.def.id) && !networked) continue;
    out.push({
      objectId: object.def.id,
      name: object.def.name,
      powered: isEnergized(state, object.def.id),
    });
  }
  return out;
}

/** Whether the grid is currently feeding this object. `powered` is its isolator. */
export function objectEnergized(state: GameState, objectId: string): boolean {
  return isEnergized(state, objectId);
}

/**
 * Whether this object is a cut span. It lives on the node rather than on the
 * object, and the renderer has to be able to rebuild it from state like every
 * other visual — a cut that only exists in the animation that made it is a cut
 * that disappears the next time the scene is built.
 */
export function objectSevered(state: GameState, objectId: string): boolean {
  return gridNodeRuntimeOf(state, objectId)?.severed === true;
}

/**
 * What this object does on its grid (FLUX_GRID §1.2), or null for an object on
 * no declared grid. Read-only and authored-topology only: a role never changes
 * during a battle, so this is a lookup, not a solve.
 */
export function objectGridRole(state: GameState, objectId: string): GridRole | null {
  return gridNodeOf(state, objectId)?.node.role ?? null;
}

// --- the power register ---------------------------------------------------

/**
 * The one word the register's right column prints for a node. `destroyed` is
 * its own word for the same reason `cut` is: a wreck and a node the grid merely
 * stopped feeding are different problems, and only one of them has an answer.
 */
export type GridNodeState =
  | "live"
  | "dead"
  | "open"
  | "cut"
  | "destroyed"
  | "tripped"
  | "tie-open"
  | "tie-closed";

export interface GridRegisterNode {
  objectId: string;
  name: string;
  role: GridRole;
  state: GridNodeState;
}

/** One bus on the register: its own rating, its own draw, its own nodes. */
export interface GridRegisterComponent {
  /** Lowest object id in the component — a stable identity for the group. */
  id: string;
  /** What feeds it, named. Empty when nothing does. */
  sources: string[];
  /** Rating and draw ignoring the trip latch: a blown bus still reads 16/14. */
  capacity: number;
  /**
   * The part of that rating still closed. It equals `capacity` on any bus that
   * has not tripped; on one that has, it is what the reclose actually has to
   * beat, and on a bus whose second main latched after the first it is the only
   * honest denominator there is.
   */
  held: number;
  load: number;
  state: "live" | "tripped" | "dead";
  nodes: GridRegisterNode[];
}

export interface GridRegisterSection {
  gridId: string;
  name: string;
  /** The buses the switches currently make, by ascending lowest node id. */
  components: GridRegisterComponent[];
  /** Nodes conducting nothing: switched out, cut, or wrecked. */
  outOfCircuit: GridRegisterNode[];
  tripped: boolean;
}

export interface PowerRegister {
  grids: GridRegisterSection[];
  ungridded: PoweredObject[];
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Sources, then breakers and ties, then lines, then sinks (FLUX_GRID §2.5a). */
const ROLE_ORDER: Record<GridRole, number> = { source: 0, breaker: 1, line: 2, sink: 3 };

function gridEdgeDegree(grid: Grid, objectId: string): number {
  return grid.edges.filter((edge) => edge.a === objectId || edge.b === objectId).length;
}

/** Whether pulling `objectId` out of the authored graph strands one source from another. */
function splitsSources(grid: Grid, objectId: string, sources: readonly string[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const node of grid.nodes) adjacency.set(node.objectId, []);
  for (const edge of grid.edges) {
    if (edge.a === objectId || edge.b === objectId) continue;
    adjacency.get(edge.a)?.push(edge.b);
    adjacency.get(edge.b)?.push(edge.a);
  }
  const start = sources[0];
  if (start === undefined) return false;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (seen.has(neighbour)) continue;
      seen.add(neighbour);
      queue.push(neighbour);
    }
  }
  return sources.some((source) => !seen.has(source));
}

/**
 * The breakers that are ties: exactly two edges, and removing the node leaves
 * two sources in different components — "a two-ended switch between two feeds",
 * which is the shape §1.7 makes every grid carry.
 *
 * Read off the authored topology alone and never off runtime state, so a tie
 * cannot stop being one mid-battle. The schema has no `tie` role today; the day
 * one is authored this function becomes a field read.
 */
function tieNodes(grid: Grid): Set<string> {
  const out = new Set<string>();
  const sources = grid.nodes
    .filter((node) => node.role === "source")
    .map((node) => node.objectId)
    .sort(byId);
  if (sources.length < 2) return out;
  for (const node of grid.nodes) {
    if (node.role !== "breaker" || gridEdgeDegree(grid, node.objectId) !== 2) continue;
    if (splitsSources(grid, node.objectId, sources)) out.add(node.objectId);
  }
  return out;
}

interface NodeContext {
  live: Set<string>;
  tripped: Set<string>;
  ties: Set<string>;
}

function nodeState(state: GameState, node: GridNode, ctx: NodeContext): GridNodeState {
  const object = objectById(state, node.objectId);
  if (object === undefined || object.destroyed) return "destroyed";
  const fed = ctx.live.has(node.objectId);
  const open = object.powered !== true;
  switch (node.role) {
    case "source":
      if (ctx.tripped.has(node.objectId)) return "tripped";
      return open ? "open" : fed ? "live" : "dead";
    case "line":
      if (gridNodeRuntimeOf(state, node.objectId)?.severed === true) return "cut";
      return fed ? "live" : open ? "open" : "dead";
    case "breaker":
      if (ctx.ties.has(node.objectId)) return open ? "tie-open" : "tie-closed";
      return fed ? "live" : open ? "open" : "dead";
    case "sink":
      return fed ? "live" : open ? "open" : "dead";
  }
}

/**
 * The floor's power as one readable ledger: a section per declared grid, a
 * group per bus inside it carrying that bus's own rating and draw, then the
 * loose machinery on no grid at all.
 *
 * **Load is a component's, never a grid's.** A house split by an open tie is
 * two buses at 10 of 14; printing their sum as 20 of 28 describes a circuit
 * nobody is standing in, and the number a player plans a trip against would be
 * wrong by exactly the amount that matters.
 *
 * Ordering is binding (FLUX_GRID §2.5a, COMBAT_RULES §17): sections in grid-id
 * order, components by their lowest node id, nodes by role then object id. The
 * register must never reshuffle under the player's eye.
 */
export function powerRegister(state: GameState): PowerRegister {
  const grids: GridRegisterSection[] = [];
  for (const grid of [...state.content.map.grids].sort((a, b) => byId(a.id, b.id))) {
    const solution = solveGrid(state, grid);
    const ctx: NodeContext = {
      live: new Set(solution.live),
      tripped: new Set(solution.tripped),
      ties: tieNodes(grid),
    };
    const rows = new Map<string, GridRegisterNode>();
    for (const node of [...grid.nodes].sort(
      (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byId(a.objectId, b.objectId),
    )) {
      rows.set(node.objectId, {
        objectId: node.objectId,
        name: objectById(state, node.objectId)?.def.name ?? node.objectId,
        role: node.role,
        state: nodeState(state, node, ctx),
      });
    }
    const grouped = new Set<string>();
    const components: GridRegisterComponent[] = solution.components.map((component) => {
      for (const objectId of component.nodes) grouped.add(objectId);
      return {
        id: component.nodes[0] ?? grid.id,
        sources: component.sources.map((objectId) => rows.get(objectId)?.name ?? objectId),
        capacity: component.capacity,
        held: component.held,
        load: component.load,
        state: component.tripped ? "tripped" : component.live ? "live" : "dead",
        nodes: [...rows.values()].filter((row) => component.nodes.includes(row.objectId)),
      };
    });
    grids.push({
      gridId: grid.id,
      name: grid.name,
      components,
      outOfCircuit: [...rows.values()].filter((row) => !grouped.has(row.objectId)),
      tripped: solution.tripped.length > 0,
    });
  }
  const ungridded = poweredObjects(state).filter(
    (entry) => gridOf(state, entry.objectId) === null,
  );
  return { grids, ungridded };
}

export interface GridComponentNodes {
  /** Object ids on this bus, ascending. */
  nodes: string[];
  capacity: number;
  load: number;
}

/**
 * Every node of a grid grouped by the bus it is on, with what is on no bus at
 * all last, rated and drawing nothing. The renderer paints strain off this:
 * strain is a property of a component, and a node that has left the circuit is
 * not straining with the bus it left.
 */
export function gridComponents(state: GameState, gridId: string): GridComponentNodes[] {
  const grid = state.content.map.grids.find((candidate) => candidate.id === gridId);
  if (grid === undefined) return [];
  const solution = solveGrid(state, grid);
  const grouped = new Set(solution.components.flatMap((component) => component.nodes));
  const loose = grid.nodes
    .map((node) => node.objectId)
    .filter((objectId) => !grouped.has(objectId))
    .sort(byId);
  return [
    ...solution.components.map((component) => ({
      nodes: [...component.nodes],
      capacity: component.capacity,
      load: component.load,
    })),
    ...(loose.length === 0 ? [] : [{ nodes: loose, capacity: 0, load: 0 }]),
  ];
}

/**
 * Objects the effect touches. `damageObject` is here because destroying a main
 * is the one permanent grid verb, and it was the only one with no preview: the
 * order that cannot be undone was the order the player could not see coming.
 */
const GRID_EFFECT_KINDS = new Set(["setPower", "severLine", "addLoad", "damageObject"]);

/**
 * Which nodes an order would flip, asked of the same recompute the rules run:
 * the grid-mutating effects are replayed against a throwaway clone and the
 * energization is diffed. There is no second model of the graph here, and the
 * hypothetical consumes no RNG and mutates nothing the caller can see.
 *
 * Both previews answer on a gridless map too, and must: `powerSnapshot` reads a
 * lone `powered` object as its own one-node circuit, resolution flips it, and
 * five of the six maps declare no grid. Short-circuiting on `grids.length === 0`
 * made every one of those maps forecast that nothing would happen.
 */
export function gridFlipPreview(
  state: GameState,
  unitId: string,
  abilityId: string,
  target: TargetRef,
): string[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  const ability = abilityById(state, unit, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  if (!ability.effects.some((effect) => GRID_EFFECT_KINDS.has(effect.kind))) return [];
  if (unmetRequirement(state, unit, ability, target) !== null) return [];

  const before = powerSnapshot(state).energized;
  const sim = cloneState(state);
  const actor = unitById(sim, unitId);
  if (actor === undefined) return [];
  const ctx: Ctx = { state: sim, events: [] };
  const area = resolveArea(sim, actor, ability, target);
  const outcome = emptyOutcome();
  for (const effect of ability.effects) {
    for (const objectId of area.objectIds) {
      if (effect.kind === "setPower") setObjectPower(ctx, objectId, effect.mode, unitId);
      else if (effect.kind === "severLine") severLine(ctx, objectId, effect.mode, unitId);
      else if (effect.kind === "addLoad") {
        attachLoad(ctx, objectId, effect.amount, effect.durationTurns, unitId);
      } else if (effect.kind === "damageObject") {
        const obj = objectById(sim, objectId);
        if (obj === undefined) continue;
        const amount = resolveAmount(sim, effect.amount, actor, inertAmountTarget(objectMaxHp(obj)));
        damageObject(ctx, objectId, amount, unitId, outcome);
      }
    }
  }
  const after = powerSnapshot(sim).energized;
  return [...before.keys()].filter((id) => before.get(id) !== after.get(id)).sort(byId);
}

/**
 * Which nodes working this machine's controls would flip, replayed against a
 * throwaway clone the way a staged ability's are. Operate is the one order the
 * player sends with no aim step, so it was also the one with no preview — and
 * on a grid map it is the cheapest and commonest grid verb there is.
 */
export function objectOperationPreview(
  state: GameState,
  unitId: string,
  objectId: string,
): string[] {
  const unit = unitById(state, unitId);
  const object = objectById(state, objectId);
  if (unit === undefined || object === undefined || object.def.operable === null) return [];

  const before = powerSnapshot(state).energized;
  const sim = cloneState(state);
  const actor = unitById(sim, unitId);
  const target = objectById(sim, objectId);
  if (actor === undefined || target === undefined) return [];
  fireObject({ state: sim, events: [] }, actor, target);
  const after = powerSnapshot(sim).energized;
  return [...before.keys()].filter((id) => before.get(id) !== after.get(id)).sort(byId);
}

/**
 * Open ties on this grid that would bring something dark back up if they were
 * closed. The annunciator names the verb that answers a cut, and it may only
 * name one that actually works — so it asks rather than guesses.
 */
export function gridRestoringTies(state: GameState, gridId: string): string[] {
  const grid = state.content.map.grids.find((candidate) => candidate.id === gridId);
  if (grid === undefined) return [];
  const before = powerSnapshot(state).energized;
  const out: string[] = [];
  for (const objectId of [...tieNodes(grid)].sort(byId)) {
    const object = objectById(state, objectId);
    if (object === undefined || object.destroyed || object.powered === true) continue;
    const sim = cloneState(state);
    setObjectPower({ state: sim, events: [] }, objectId, "on", null);
    const after = powerSnapshot(sim).energized;
    // The tie lighting up is not relief: closing it always feeds the tie. What
    // makes it an answer is something else coming back with it.
    const relieves = [...before.keys()].some(
      (id) => id !== objectId && before.get(id) === false && after.get(id) === true,
    );
    if (relieves) out.push(objectId);
  }
  return out;
}

/** Stats after statuses and timed modifiers, which is what the rules use. */
export function unitStats(state: GameState, unitId: string): DerivedStats | null {
  const unit = unitById(state, unitId);
  return unit === undefined ? null : effectiveStats(state, unit);
}

export function unitMaxHp(state: GameState, unitId: string): number | null {
  const unit = unitById(state, unitId);
  return unit === undefined ? null : maxHp(state, unit);
}

export function unitMaxCharge(state: GameState, unitId: string): number | null {
  const unit = unitById(state, unitId);
  return unit === undefined ? null : maxCharge(state, unit);
}

/**
 * Action ability ids the unit may issue right now, including `basic-attack`.
 * Abilities whose actor-scoped `requires` the battlefield does not satisfy are
 * dropped; `targetPowered` cannot be judged until something is aimed at, so it
 * is left to `targetableTiles` and `forecast`.
 */
export function availableAbilities(state: GameState, unitId: string): string[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  return knownActionAbilityIds(state, unit).filter((id) => {
    const ability = abilityById(state, unit, id);
    if (ability === undefined || ability.slot !== "action") return false;
    return unmetRequirement(state, unit, ability, null) === null;
  });
}

/** One team's shared field kit, in item-id order. */
export function teamSatchel(state: GameState, team: Team): readonly ItemStack[] {
  return satchelOf(state, team);
}

export interface UsableItemEntry {
  itemId: string;
  name: string;
  description: string;
  /** Stock left in the team satchel. */
  count: number;
  /** Ability id this item resolves through: `targetableTiles`, `forecast`. */
  abilityId: string;
  /** Set when the unit cannot use it right now; the entry still lists. */
  unavailableReason?: string;
}

/**
 * The unit's satchel as a menu: everything its team is carrying, with the
 * reason greyed out when this unit in particular cannot reach for it.
 */
export function usableItems(state: GameState, unitId: string): UsableItemEntry[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  const turn = state.activeTurn;
  const spent = turn !== null && turn.unitId === unitId && turn.acted;
  const held = !canAct(state, unit);

  const out: UsableItemEntry[] = [];
  for (const itemId of carriedItemIds(state, unit)) {
    const item = consumableItem(state, itemId);
    if (item === undefined) continue;
    const reason = !canCarryItem(state, unit, item)
      ? "Not issued to this job"
      : held
        ? "Cannot act"
        : spent
          ? "Action already spent"
          : undefined;
    out.push({
      itemId,
      name: item.name,
      description: item.description,
      count: satchelCount(state, unit.team, itemId),
      abilityId: itemAbilityId(itemId),
      ...(reason === undefined ? {} : { unavailableReason: reason }),
    });
  }
  return out;
}

/** Every tile the unit can move to, with its path cost. */
export function reachableTiles(state: GameState, unitId: string): ReachableTile[] {
  const unit = unitById(state, unitId);
  return unit === undefined ? [] : computeReachable(state, unit);
}

/** Tiles the unit may aim an ability at, honouring range, height, and LoS. */
export function targetableTiles(state: GameState, unitId: string, abilityId: string): TileCoord[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  const ability = abilityById(state, unit, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  if (unmetRequirement(state, unit, ability, null) !== null) return [];
  return computeTargetable(state, unit.position, ability.targeting).filter(
    (tile) => unmetRequirement(state, unit, ability, { kind: "tile", tile }) === null,
  );
}

/**
 * What an ability aimed at `tile` would actually take, or null when it may not
 * be aimed there at all. Machinery wins the tile whenever the ability targets
 * objects; otherwise whoever is standing on it; otherwise the bare tile.
 *
 * Every ref this returns is one `applyCommand` accepts, so a cursor gets the
 * same answer the command layer would give.
 */
export function aimTarget(
  state: GameState,
  unitId: string,
  abilityId: string,
  tile: TileCoord,
): TargetRef | null {
  const unit = unitById(state, unitId);
  if (unit === undefined) return null;
  const ability = abilityById(state, unit, abilityId);
  if (ability === undefined || ability.slot !== "action") return null;

  const candidates: TargetRef[] = [];
  if (ability.targeting.validTargets.includes("object")) {
    for (const object of state.map.objects) {
      if (object.destroyed) continue;
      // An order with nothing to do to this machine is not an order aimed at
      // it: the tile stays unlit and the click refuses by name.
      if (objectTargetIsInert(state, ability, object)) continue;
      if (object.def.tiles.some((covered) => coordEq(covered, tile))) {
        candidates.push({ kind: "object", objectId: object.def.id });
      }
    }
  }
  const occupant = state.units.find((u) => !u.downed && coordEq(u.position, tile));
  if (occupant !== undefined) candidates.push({ kind: "unit", unitId: occupant.id });
  candidates.push({ kind: "tile", tile: { ...tile } });

  for (const candidate of candidates) {
    if (!isValidTargetKind(state, unit, ability, candidate)) continue;
    if (unmetRequirement(state, unit, ability, candidate) !== null) continue;
    return candidate;
  }
  return null;
}

/**
 * The tiles an ability may actually be sent at: in reach, and holding something
 * its `validTargets` accepts. `targetableTiles` answers reach alone, which is
 * what a range overlay wants; this is what a cursor may commit on.
 */
export function legalTargetTiles(state: GameState, unitId: string, abilityId: string): TileCoord[] {
  return targetableTiles(state, unitId, abilityId).filter(
    (tile) => aimTarget(state, unitId, abilityId, tile) !== null,
  );
}

/** The aim gate's verdict on one tile in reach. */
export interface TileAimVerdict {
  tile: TileCoord;
  /** What an order aimed here would take, or null when none may be sent. */
  target: TargetRef | null;
  /** Why not, in the command layer's own words. Null when the tile is legal. */
  refusal: AimRefusal | null;
}

/**
 * Every tile in reach with the aim gate's verdict on it. `legalTargetTiles`
 * answers the same question as a filter; this keeps the refusal, because a range
 * overlay that paints an unusable tile as a target is the overlay lying.
 *
 * It asks the one gate the command layer refuses by rather than a second copy of
 * the rule. The candidate it judges is the claim the tile makes on the order —
 * machinery first when the ability works on objects, then whoever stands there,
 * then the bare tile — and unlike `aimTarget` it keeps machinery the order has
 * nothing to do to, so the refusal can say that instead of degenerating into
 * "cannot target that".
 */
export function aimVerdicts(
  state: GameState,
  unitId: string,
  abilityId: string,
): TileAimVerdict[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  const ability = abilityById(state, unit, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  return targetableTiles(state, unitId, abilityId).map((tile) => {
    const target = aimTarget(state, unitId, abilityId, tile);
    if (target !== null) return { tile, target, refusal: null };
    const candidate = refusalCandidate(state, ability, tile);
    return {
      tile,
      target: null,
      refusal: aimRefusal(state, unit, ability, candidate, unit.position),
    };
  });
}

/** The claim a tile makes on an order, for the sake of naming a refusal. */
function refusalCandidate(state: GameState, ability: ActionAbility, tile: TileCoord): TargetRef {
  if (ability.targeting.validTargets.includes("object")) {
    const object = state.map.objects.find(
      (candidate) => !candidate.destroyed && candidate.def.tiles.some((covered) => coordEq(covered, tile)),
    );
    if (object !== undefined) return { kind: "object", objectId: object.def.id };
  }
  const occupant = state.units.find((u) => !u.downed && coordEq(u.position, tile));
  if (occupant !== undefined) return { kind: "unit", unitId: occupant.id };
  return { kind: "tile", tile: { ...tile } };
}

/** Tiles an ability would actually cover once aimed at `target`. */
export function affectedTiles(
  state: GameState,
  unitId: string,
  abilityId: string,
  target: TargetRef,
): TileCoord[] {
  const unit = unitById(state, unitId);
  if (unit === undefined) return [];
  const ability = abilityById(state, unit, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  return resolveArea(state, unit, ability, target).tiles;
}

export function lineOfSight(state: GameState, from: TileCoord, to: TileCoord): boolean {
  return hasLos(state, from, to);
}

/**
 * Everything an ability does that is not a number of damage, a number of
 * healing, or a status roll — the effects the forecast used to swallow, so a
 * pure buff read as "Damage —, no status effects".
 */
export type ForecastOutcome =
  | { kind: "statMods"; mods: StatMods; durationTurns: number | null }
  | { kind: "removeStatus"; statusId: string }
  | { kind: "charge"; amount: number; siphonedToActor: boolean }
  | { kind: "disposition"; stat: "resolve" | "attunement"; amount: number }
  | { kind: "forceMove"; direction: "push" | "pull" | "toward-actor-facing"; distance: number }
  | { kind: "power"; mode: "on" | "off" | "toggle" }
  | { kind: "moveSelf"; direction: "toward-target" | "away-from-target" | "forward"; distance: number }
  | { kind: "spawn"; object: "turret" | "mine" | "drone"; hp: number };

export interface ForecastEntry {
  unitId: string | null;
  objectId: string | null;
  /** Percentage; objects are never missed. */
  hitChance: number;
  /** Damage on a hit. */
  damage: number;
  /** Healing on a hit. */
  heal: number;
  /** `floor(damage * hitChance / 100)`. */
  expectedDamage: number;
  statusChances: { statusId: string; chance: number }[];
  outcomes: ForecastOutcome[];
}

/** What an effect does to a unit standing in the area, beyond damage and status. */
function unitOutcome(effect: Effect): ForecastOutcome | null {
  switch (effect.kind) {
    case "modifyStats":
      return { kind: "statMods", mods: effect.mods, durationTurns: effect.duration ?? null };
    case "removeStatus":
      return { kind: "removeStatus", statusId: effect.statusId };
    case "modifyCharge":
      return {
        kind: "charge",
        amount: effect.amount,
        siphonedToActor: effect.siphonToActor ?? false,
      };
    case "modifyDisposition":
      return { kind: "disposition", stat: effect.stat, amount: effect.amount };
    case "forceMove":
      return { kind: "forceMove", direction: effect.direction, distance: effect.distance };
    default:
      return null;
  }
}

/**
 * Consequences aimed at nobody in particular: the actor's own step, and the
 * machine an ability leaves behind. An ability with only these — a turret laid
 * on an empty tile — has no forecast rows at all, and without them the panel
 * had nothing to report and no reason to offer its stamp.
 */
export function abilityOutcomes(
  state: GameState,
  unitId: string,
  abilityId: string,
): ForecastOutcome[] {
  const actor = unitById(state, unitId);
  if (actor === undefined) return [];
  const ability = abilityById(state, actor, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  const out: ForecastOutcome[] = [];
  for (const effect of ability.effects) {
    if (effect.kind === "moveSelf") {
      out.push({ kind: "moveSelf", direction: effect.direction, distance: effect.distance });
    } else if (effect.kind === "spawnObject") {
      out.push({ kind: "spawn", object: effect.object, hp: effect.hp });
    }
  }
  return out;
}

/**
 * What an ability would do to everything in its area, without rolling dice.
 * This is the attack-forecast panel's data source; it consumes no RNG and
 * mutates nothing.
 */
export function forecast(
  state: GameState,
  unitId: string,
  abilityId: string,
  target: TargetRef,
): ForecastEntry[] {
  const actor = unitById(state, unitId);
  if (actor === undefined) return [];
  const ability = abilityById(state, actor, abilityId);
  if (ability === undefined || ability.slot !== "action") return [];
  if (unmetRequirement(state, actor, ability, target) !== null) return [];
  const area = resolveArea(state, actor, ability, target);
  const out: ForecastEntry[] = [];

  for (const id of area.unitIds) {
    const unit = unitById(state, id);
    if (unit === undefined) continue;
    const chance = areEnemies(unit, actor) ? hitChance(state, actor.position, unit) : 100;
    const entry: ForecastEntry = {
      unitId: id,
      objectId: null,
      hitChance: chance,
      damage: 0,
      heal: 0,
      expectedDamage: 0,
      statusChances: [],
      outcomes: [],
    };
    for (const effect of ability.effects) {
      if (effect.kind === "damage") {
        entry.damage += resolveAmount(state, effect.amount, actor, unitAmountTarget(state, unit));
      } else if (effect.kind === "heal") {
        entry.heal += resolveAmount(state, effect.amount, actor, unitAmountTarget(state, unit));
      } else if (effect.kind === "applyStatus") {
        entry.statusChances.push({
          statusId: effect.statusId,
          chance: Math.floor((effect.chance * chance) / 100),
        });
      } else {
        const outcome = unitOutcome(effect);
        if (outcome !== null) entry.outcomes.push(outcome);
      }
    }
    entry.expectedDamage = Math.floor((entry.damage * chance) / 100);
    out.push(entry);
  }

  for (const id of area.objectIds) {
    const obj = objectById(state, id);
    if (obj === undefined) continue;
    let damage = 0;
    let heal = 0;
    const outcomes: ForecastOutcome[] = [];
    for (const effect of ability.effects) {
      if (effect.kind === "damageObject") {
        damage += resolveAmount(state, effect.amount, actor, inertAmountTarget(objectMaxHp(obj)));
      } else if (effect.kind === "repairObject") {
        heal += resolveAmount(state, effect.amount, actor, inertAmountTarget(objectMaxHp(obj)));
      } else if (effect.kind === "setPower") {
        outcomes.push({ kind: "power", mode: effect.mode });
      }
    }
    if (damage === 0 && heal === 0 && outcomes.length === 0) continue;
    out.push({
      unitId: null,
      objectId: id,
      hitChance: 100,
      damage,
      heal,
      expectedDamage: damage,
      statusChances: [],
      outcomes,
    });
  }
  return out;
}

export interface TurnOrderEntry {
  kind: "unit" | "charge";
  /** Unit id, or charge id for a charged ability about to fire. */
  id: string;
  /** Clock tick the turn or charge lands on. */
  clock: number;
}

/**
 * Who acts next, assuming every unit spends a full move-and-act turn. Runs on a
 * throwaway copy of the state and draws no randomness, so calling it is free of
 * side effects.
 */
export function turnOrderPreview(state: GameState, count = 8): TurnOrderEntry[] {
  const sim = cloneState(state);
  const out: TurnOrderEntry[] = [];

  if (sim.activeTurn !== null) {
    const unit = unitById(sim, sim.activeTurn.unitId);
    out.push({ kind: "unit", id: sim.activeTurn.unitId, clock: sim.clock });
    if (unit !== undefined) unit.ct = Math.max(0, unit.ct - CT_COST_MOVE_AND_ACT);
    sim.activeTurn = null;
  }

  for (let guard = 0; guard < MAX_TICKS_PER_ADVANCE && out.length < count; guard += 1) {
    const firing = readyCharges(sim);
    if (firing.length > 0) {
      for (const charge of firing) {
        out.push({ kind: "charge", id: charge.id, clock: sim.clock });
        sim.charges = sim.charges.filter((c) => c.id !== charge.id);
      }
      continue;
    }
    const next = readyUnits(sim)[0];
    if (next !== undefined) {
      out.push({ kind: "unit", id: next.id, clock: sim.clock });
      next.ct = Math.max(0, next.ct - CT_COST_MOVE_AND_ACT);
      continue;
    }
    sim.clock += 1;
    for (const unit of sim.units) {
      if (unit.downed) continue;
      unit.ct += ctPerTick(sim, unit);
    }
    for (const charge of sim.charges) charge.ct += charge.castSpeed;
  }
  return out.slice(0, count);
}
