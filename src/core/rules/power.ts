/**
 * Energization: power as a graph rather than a flag per object
 * (`docs/design/FLUX_GRID.md`).
 *
 * `MapObject.powered` keeps its meaning as the node's own **isolator** — this
 * node's switch is closed — and everything that wrote power before still writes
 * exactly that. What is derived is whether a node is actually being fed, and it
 * falls out of a connectivity pass from the sources.
 *
 * The degeneracy rule is the whole safety net: an object that is not a node of
 * any declared grid is energized exactly when its isolator is closed and it is
 * standing, which is what `powered` meant before this file existed. The five
 * slice maps (e1-e5) declare no grid — only `meter-house` does — so every slice
 * battle must replay byte for byte.
 *
 * Nothing here is cached. A recompute is one BFS over at most 32 nodes and 64
 * edges on integers, and the invalidation bugs a cache would buy cost more than
 * the recompute ever will (`docs/ARCHITECTURE.md` §3).
 */

import type { GameMap, Grid, GridNode } from "../../data/index.js";
import type { PowerCause } from "../events/types.js";
import { emit, nextOrdinal, type Ctx } from "../state/ctx.js";
import type { GameState, GridLoad, GridNodeRuntime, GridRuntime, ObjectRuntime } from "../state/types.js";

// Resolved here rather than through `rules/board.ts`, which reads energization
// back off this module.
function objectById(state: GameState, id: string): ObjectRuntime | undefined {
  return state.map.objects.find((o) => o.def.id === id);
}

export type PowerReason = PowerCause["reason"];

/** What moved the graph, so a `PowerChanged` can name the verb that answers it. */
export interface PowerTrigger {
  nodeObjectId: string;
  reason: PowerReason;
}

/** One component that blew: the numbers the annunciator names it by. */
export interface GridTrip {
  capacity: number;
  load: number;
  sources: string[];
}

/**
 * One electrically joined piece of the grid as the switches currently stand.
 *
 * The trip latch is deliberately ignored by `capacity` and `load`: a blown
 * component keeps its shape and still reads what it was carrying against what
 * it is rated for. Every number a player reads is a component's, never a
 * grid's — a house split in two by an open tie is two buses at 10 of 14, and
 * summing them to 20 of 28 is an arithmetic claim about a circuit that does not
 * exist.
 *
 * `held` is the half the latch does own, and it exists because a rating alone
 * lies on a multi-source bus: two mains latched one after the other read 18
 * against 28, which is true only of a house whose every main has been reclosed.
 */
export interface GridComponent {
  /** Object ids in it, ascending. The lowest is the component's identity. */
  nodes: string[];
  /** Sources feeding it, ascending. Empty means nothing does. */
  sources: string[];
  capacity: number;
  /** Rating still closed: the sources in it that have not latched open. */
  held: number;
  load: number;
  /** A source in it is latched open. */
  tripped: boolean;
  /** The grid is actually feeding it. */
  live: boolean;
}

export interface GridSolution {
  /** Object ids of every node currently being fed, ascending. */
  live: string[];
  /** Rated capacity on the network, ignoring the trip latch — what the register reads against. */
  capacity: number;
  load: number;
  /** Object ids of every source latched open, ascending. */
  tripped: string[];
  /** Components that tripped during this solve, in discovery order. */
  trips: GridTrip[];
  /**
   * The grid as it is actually wired right now, by ascending lowest node id.
   * Nodes conducting nothing — isolated, cut, wrecked — are in none of them.
   */
  components: GridComponent[];
  /** Fixed-point passes taken. Bounded by the source count plus one. */
  passes: number;
}

interface GridSummary {
  capacity: number;
  load: number;
  live: string;
  tripped: boolean;
  /** Component shape, so a bus splitting in two is a change even at equal totals. */
  components: string;
}

export interface PowerSnapshot {
  /** Energization before the mutation, by object id. Electrical objects only. */
  energized: Map<string, boolean>;
  grids: Map<string, GridSummary>;
}

// --- topology -------------------------------------------------------------

/** Grids the map declares, by ascending grid id. */
function gridDefs(map: GameMap): Grid[] {
  return [...map.grids].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Nodes by ascending object id — the canonical iteration order for a grid. */
function sortedNodes(grid: Grid): GridNode[] {
  return [...grid.nodes].sort((a, b) => (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0));
}

export function gridOf(state: GameState, objectId: string): Grid | null {
  if (state.content.map.grids.length === 0) return null;
  for (const grid of gridDefs(state.content.map)) {
    if (grid.nodes.some((n) => n.objectId === objectId)) return grid;
  }
  return null;
}

export function gridNodeOf(state: GameState, objectId: string): { grid: Grid; node: GridNode } | null {
  const grid = gridOf(state, objectId);
  if (grid === null) return null;
  const node = grid.nodes.find((n) => n.objectId === objectId);
  return node === undefined ? null : { grid, node };
}

function runtimeOf(state: GameState, gridId: string): GridRuntime | undefined {
  return state.grids.find((g) => g.gridId === gridId);
}

function nodeRuntime(runtime: GridRuntime | undefined, objectId: string): GridNodeRuntime | undefined {
  return runtime?.nodes.find((n) => n.objectId === objectId);
}

/** The mutable state of the node an object is, if it is one. */
export function gridNodeRuntimeOf(state: GameState, objectId: string): GridNodeRuntime | undefined {
  const grid = gridOf(state, objectId);
  return grid === null ? undefined : nodeRuntime(runtimeOf(state, grid.id), objectId);
}

/** The runtime a battle starts with: nothing severed, nothing tripped, no loads. */
export function initialGrids(map: GameMap): GridRuntime[] {
  return gridDefs(map).map((grid) => ({
    gridId: grid.id,
    nodes: sortedNodes(grid).map((node) => ({ objectId: node.objectId, severed: false, tripped: false })),
    loads: [],
  }));
}

// --- the recompute --------------------------------------------------------

/**
 * Energization for one grid.
 *
 * A component with no capacity is dead; one drawing past its capacity trips
 * every source in it and the pass runs again. The trip is total and it latches:
 * shedding by priority is more faithful and a legibility disaster, and an
 * auto-reset would re-trip on the same pass.
 *
 * Pure — the caller decides whether to write the latch back.
 */
export function solveGrid(state: GameState, grid: Grid): GridSolution {
  const runtime = runtimeOf(state, grid.id);
  const nodes = sortedNodes(grid);
  const roles = new Map(nodes.map((n) => [n.objectId, n]));

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.objectId, []);
  for (const edge of grid.edges) {
    adjacency.get(edge.a)?.push(edge.b);
    adjacency.get(edge.b)?.push(edge.a);
  }

  const latched = new Set<string>();
  for (const node of nodes) {
    if (nodeRuntime(runtime, node.objectId)?.tripped === true) latched.add(node.objectId);
  }

  const loadsByNode = new Map<string, number>();
  for (const load of runtime?.loads ?? []) {
    loadsByNode.set(load.nodeObjectId, (loadsByNode.get(load.nodeObjectId) ?? 0) + load.amount);
  }

  /** Everything but the trip latch: destroyed, isolated open, or cut all stop conduction. */
  const closed = (objectId: string): boolean => {
    const obj = objectById(state, objectId);
    if (obj === undefined || obj.destroyed || obj.powered !== true) return false;
    return nodeRuntime(runtime, objectId)?.severed !== true;
  };
  const conducts = (node: GridNode): boolean =>
    closed(node.objectId) && !(node.role === "source" && latched.has(node.objectId));

  /** Connected components over the nodes a predicate admits, in node-id order. */
  const componentsOver = (admits: (node: GridNode) => boolean): string[][] => {
    const open = new Set(nodes.filter(admits).map((n) => n.objectId));
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const start of nodes) {
      if (!open.has(start.objectId) || seen.has(start.objectId)) continue;
      const component: string[] = [];
      const queue = [start.objectId];
      seen.add(start.objectId);
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        for (const neighbour of adjacency.get(current) ?? []) {
          if (!open.has(neighbour) || seen.has(neighbour)) continue;
          seen.add(neighbour);
          queue.push(neighbour);
        }
      }
      out.push(component);
    }
    return out;
  };

  const sourceCount = nodes.filter((n) => n.role === "source").length;
  const trips: GridTrip[] = [];
  let live: string[] = [];
  let passes = 0;
  /** What a set of nodes is rated for and what it is drawing. */
  const meter = (component: readonly string[]): { capacity: number; load: number } => {
    let capacity = 0;
    let load = 0;
    for (const objectId of component) {
      const node = roles.get(objectId)!;
      if (node.role === "source") capacity += node.capacity;
      if (node.role === "sink") load += node.draw;
      load += loadsByNode.get(objectId) ?? 0;
    }
    return { capacity, load };
  };

  for (let pass = 0; pass <= sourceCount; pass += 1) {
    passes = pass + 1;
    const fed: string[] = [];
    let trippedThisPass = false;

    for (const component of componentsOver(conducts)) {
      const { capacity, load } = meter(component);
      if (capacity === 0) continue;
      if (load > capacity) {
        const sources = component.filter((objectId) => roles.get(objectId)!.role === "source").sort();
        for (const objectId of sources) latched.add(objectId);
        trips.push({ capacity, load, sources });
        trippedThisPass = true;
        continue;
      }
      fed.push(...component);
    }
    if (!trippedThisPass) {
      live = fed.sort();
      break;
    }
  }

  // Readout numbers ignore the latch, so a tripped component still reads what
  // it was carrying against what it is rated for: `LOAD 16/14 TRIPPED`. What
  // the latch does own is `held` — the rating that is actually standing behind
  // the bus right now, and the number a second latching main would otherwise
  // hide behind the first one's capacity.
  const liveSet = new Set(live);
  const components: GridComponent[] = componentsOver((node) => closed(node.objectId)).map(
    (component) => {
      const sorted = [...component].sort();
      const sources = sorted.filter((objectId) => roles.get(objectId)!.role === "source");
      let held = 0;
      for (const objectId of sources) {
        const node = roles.get(objectId)!;
        if (node.role === "source" && !latched.has(objectId)) held += node.capacity;
      }
      return {
        nodes: sorted,
        sources,
        held,
        ...meter(sorted),
        tripped: sources.some((objectId) => latched.has(objectId)),
        live: sorted.some((objectId) => liveSet.has(objectId)),
      };
    },
  );

  let capacity = 0;
  let load = 0;
  for (const component of components) {
    capacity += component.capacity;
    load += component.load;
  }

  return { live, capacity, load, tripped: [...latched].sort(), trips, components, passes };
}

/**
 * Whether an object is being fed. For an object on no declared grid this is the
 * isolator flag itself, which is what `powered` has always meant.
 */
export function isEnergized(state: GameState, objectId: string): boolean {
  const obj = objectById(state, objectId);
  if (obj === undefined || obj.destroyed || obj.powered === null) return false;
  const grid = gridOf(state, objectId);
  if (grid === null) return obj.powered === true;
  return solveGrid(state, grid).live.includes(objectId);
}

function summarize(solution: GridSolution): GridSummary {
  return {
    capacity: solution.capacity,
    load: solution.load,
    live: solution.live.join(","),
    tripped: solution.tripped.length > 0,
    components: solution.components
      .map((c) => `${c.nodes.join("+")}=${c.load}/${c.capacity}`)
      .join("|"),
  };
}

/** Energization and grid readouts as they stand, for a settle pass to diff against. */
export function powerSnapshot(state: GameState): PowerSnapshot {
  const energized = new Map<string, boolean>();
  const grids = new Map<string, GridSummary>();
  if (state.content.map.grids.length === 0) {
    for (const obj of state.map.objects) {
      if (obj.powered === null) continue;
      energized.set(obj.def.id, !obj.destroyed && obj.powered === true);
    }
    return { energized, grids };
  }
  const solutions = new Map<string, string[]>();
  for (const grid of gridDefs(state.content.map)) {
    const solution = solveGrid(state, grid);
    grids.set(grid.id, summarize(solution));
    solutions.set(grid.id, solution.live);
  }
  for (const obj of state.map.objects) {
    if (obj.powered === null) continue;
    const grid = gridOf(state, obj.def.id);
    energized.set(
      obj.def.id,
      grid === null
        ? !obj.destroyed && obj.powered === true
        : (solutions.get(grid.id)?.includes(obj.def.id) ?? false),
    );
  }
  return { energized, grids };
}

/**
 * Recompute every grid, latch whatever tripped, and emit what moved: the
 * network-level events first, in grid-id order, then one `PowerChanged` per
 * object whose energization flipped, in object-id order.
 *
 * Idempotent, and it emits only where something actually changed, which is what
 * makes calling it after every graph-mutating primitive safe.
 */
export function settlePower(ctx: Ctx, before: PowerSnapshot, trigger: PowerTrigger | null): void {
  const state = ctx.state;
  const causeGrid = trigger === null ? null : gridOf(state, trigger.nodeObjectId);
  const trippedGrids = new Set<string>();

  for (const grid of gridDefs(state.content.map)) {
    const solution = solveGrid(state, grid);
    const runtime = runtimeOf(state, grid.id);
    const wasTripped = new Set(
      (runtime?.nodes ?? []).filter((n) => n.tripped).map((n) => n.objectId),
    );
    for (const node of runtime?.nodes ?? []) node.tripped = solution.tripped.includes(node.objectId);

    // One event per component that blew, naming what it was carrying against
    // what it is rated for — the numbers the annunciator reads out.
    for (const trip of solution.trips) {
      if (trip.sources.every((objectId) => wasTripped.has(objectId))) continue;
      trippedGrids.add(grid.id);
      emit(ctx, { type: "GridTripped", gridId: grid.id, capacity: trip.capacity, load: trip.load });
    }
    const summary = summarize(solution);
    const previous = before.grids.get(grid.id);
    if (
      previous === undefined ||
      previous.capacity !== summary.capacity ||
      previous.load !== summary.load ||
      previous.live !== summary.live ||
      previous.tripped !== summary.tripped ||
      previous.components !== summary.components
    ) {
      emit(ctx, {
        type: "GridChanged",
        gridId: grid.id,
        capacity: solution.capacity,
        load: solution.load,
        liveNodes: [...solution.live],
        tripped: solution.tripped.length > 0,
      });
    }
  }

  const after = powerSnapshot(state);
  for (const objectId of [...after.energized.keys()].sort()) {
    const now = after.energized.get(objectId)!;
    if (before.energized.get(objectId) === now) continue;
    const grid = gridOf(state, objectId);
    if (grid === null) {
      emit(ctx, { type: "PowerChanged", objectId, powered: now });
      continue;
    }
    const reason: PowerReason =
      !now && trippedGrids.has(grid.id) ? "tripped" : (trigger?.reason ?? "restored");
    const nodeId = causeGrid?.id === grid.id && trigger !== null ? trigger.nodeObjectId : objectId;
    emit(ctx, {
      type: "PowerChanged",
      objectId,
      powered: now,
      cause: { gridId: grid.id, nodeId, reason },
    });
  }
}

/** Latch whatever an authored grid trips on turn zero, without announcing it. */
export function initializePower(state: GameState): void {
  for (const grid of gridDefs(state.content.map)) {
    const solution = solveGrid(state, grid);
    const runtime = runtimeOf(state, grid.id);
    for (const node of runtime?.nodes ?? []) node.tripped = solution.tripped.includes(node.objectId);
  }
}

// --- the primitives -------------------------------------------------------

/**
 * Cut a span, or splice one back. Only `line` nodes carry the state: the cut is
 * the reversible verb and it belongs to the geometry that carries, while
 * destruction stays permanent and stays `damageObject`.
 */
export function severLine(ctx: Ctx, objectId: string, mode: "sever" | "splice", actorId: string | null): void {
  const state = ctx.state;
  const found = gridNodeOf(state, objectId);
  if (found === null || found.node.role !== "line") return;
  const obj = objectById(state, objectId);
  if (obj === undefined || obj.destroyed) return;
  const node = nodeRuntime(runtimeOf(state, found.grid.id), objectId);
  if (node === undefined) return;
  const severed = mode === "sever";
  if (node.severed === severed) return;

  const before = powerSnapshot(state);
  node.severed = severed;
  emit(ctx, {
    type: severed ? "LineSevered" : "LineSpliced",
    objectId,
    unitId: actorId,
  });
  settlePower(ctx, before, { nodeObjectId: objectId, reason: severed ? "cut" : "restored" });
}

/**
 * What a licensed draw actually puts on the bus: Rated Draw's whole effect
 * (`docs/design/FLUX_GRID.md` §3). Resolved here rather than at each effect
 * site so the rules, the aim-time preview and the AI's hypothetical all read
 * one number.
 */
export function resolveLoadAmount(state: GameState, actorId: string | null, amount: number): number {
  if (actorId === null) return amount;
  const unit = state.units.find((u) => u.id === actorId);
  const supportId = unit?.unit.supportAbilityId;
  if (supportId === undefined) return amount;
  const support = state.content.abilities[supportId];
  if (support === undefined || support.slot !== "support") return amount;
  return Math.max(0, amount - (support.passive.gridLoadReduction ?? 0));
}

/**
 * Hang a timed draw on a node's component. The load rides the caster's own
 * turns, the clock statuses and `modifyStats` already use; a load nothing with a
 * turn clock cast never expires on its own.
 */
export function attachLoad(
  ctx: Ctx,
  objectId: string,
  amount: number,
  durationTurns: number,
  actorId: string | null,
): void {
  const state = ctx.state;
  const found = gridNodeOf(state, objectId);
  if (found === null) return;
  const runtime = runtimeOf(state, found.grid.id);
  if (runtime === undefined) return;

  const drawn = resolveLoadAmount(state, actorId, amount);
  const before = powerSnapshot(state);
  const load: GridLoad = {
    id: `load-${nextOrdinal(state)}`,
    nodeObjectId: objectId,
    casterUnitId: actorId,
    amount: drawn,
    turnsRemaining: actorId === null ? null : durationTurns,
  };
  runtime.loads.push(load);
  runtime.loads.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  emit(ctx, {
    type: "LoadAttached",
    gridId: found.grid.id,
    nodeId: objectId,
    amount: drawn,
    turns: load.turnsRemaining,
    unitId: actorId,
  });
  // The only way a load darkens anything is by blowing the component it lands on.
  settlePower(ctx, before, { nodeObjectId: objectId, reason: "tripped" });
}

function dropLoads(ctx: Ctx, doomed: readonly GridLoad[]): void {
  if (doomed.length === 0) return;
  const state = ctx.state;
  const before = powerSnapshot(state);
  const ids = new Set(doomed.map((l) => l.id));
  for (const runtime of state.grids) {
    runtime.loads = runtime.loads.filter((l) => !ids.has(l.id));
  }
  for (const id of [...ids].sort()) emit(ctx, { type: "LoadExpired", loadId: id });
  settlePower(ctx, before, { nodeObjectId: doomed[0]!.nodeObjectId, reason: "restored" });
}

/** Age this unit's loads by one of its own turns, in load-id order. */
export function ageLoads(ctx: Ctx, unitId: string): void {
  if (ctx.state.grids.length === 0) return;
  const expired: GridLoad[] = [];
  for (const runtime of ctx.state.grids) {
    for (const load of runtime.loads) {
      if (load.casterUnitId !== unitId || load.turnsRemaining === null) continue;
      load.turnsRemaining -= 1;
      if (load.turnsRemaining <= 0) expired.push(load);
    }
  }
  dropLoads(ctx, expired.sort((a, b) => (a.id < b.id ? -1 : 1)));
}

/** A load dies with its caster, the same rule that cancels a charge in flight. */
export function dropLoadsOfCaster(ctx: Ctx, unitId: string): void {
  if (ctx.state.grids.length === 0) return;
  const doomed = ctx.state.grids
    .flatMap((runtime) => runtime.loads)
    .filter((load) => load.casterUnitId === unitId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  dropLoads(ctx, doomed);
}
