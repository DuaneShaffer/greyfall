/**
 * The Meter House is the first grid-native shipped map, so its arithmetic is
 * content that has to hold rather than a number in a design doc. Everything
 * below runs against the engine's own `solveGrid` and its own standability
 * rules — nothing here reimplements the model it is checking.
 *
 * `docs/MAP_NOTES.md` §6 states the claims; this file is the proof of them.
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  solveGrid,
  standHeight,
  type BattleEvent,
  type GameState,
} from "../../src/core/index.js";
import { inBounds, isStandable, neighbors } from "../../src/core/rules/grid.js";
import { evaluateTriggers } from "../../src/core/rules/triggers.js";
import type { Grid, MapObject, TileCoord } from "../../src/data/index.js";
import { loadContent, loadUnits } from "../core/fixtures.js";

const MAP_ID = "meter-house";
const ENCOUNTER_ID = "s1-meter-house";
const GRID_ID = "meter-house-grid";

const WEST_HALF = [
  "charge-hoist-west",
  "gallery-run",
  "meter-lift",
  "west-board",
  "west-feeder",
  "west-lamps",
  "west-main",
];
const EAST_HALF = [
  "charge-hoist-east",
  "east-board",
  "east-feeder",
  "east-lamps",
  "east-main",
  "feed-pump",
  "sump-run",
];
const LINE_RUNS = ["east-feeder", "gallery-run", "sump-run", "west-feeder"];
const LANDING: TileCoord[] = [
  { x: 7, y: 7 },
  { x: 8, y: 7 },
  { x: 7, y: 8 },
  { x: 8, y: 8 },
];

const content = loadContent();
const map = content.maps[MAP_ID]!;
const encounter = content.encounters[ENCOUNTER_ID]!;

function battle(): GameState {
  const rowen = loadUnits()["rowen"]!;
  const tile = map.deploymentTiles[0]!;
  return createBattle(content, ENCOUNTER_ID, [rowen], [
    { unitId: rowen.id, position: { ...tile }, facing: "north" },
  ]).state;
}

function gridDef(state: GameState): Grid {
  return state.content.map.grids.find((g) => g.id === GRID_ID)!;
}

function solve(state: GameState) {
  return solveGrid(state, gridDef(state));
}

function object(state: GameState, id: string) {
  return state.map.objects.find((o) => o.def.id === id)!;
}

function isolate(state: GameState, id: string, closed: boolean): void {
  object(state, id).powered = closed;
}

function sever(state: GameState, id: string, cut: boolean): void {
  state.grids[0]!.nodes.find((n) => n.objectId === id)!.severed = cut;
}

function demolish(state: GameState, id: string): void {
  object(state, id).destroyed = true;
}

/** A flat draw on a node's component, the way `addLoad` hangs one. */
function load(state: GameState, nodeId: string, amount: number): void {
  state.grids[0]!.loads.push({
    id: `load-${state.grids[0]!.loads.length}`,
    nodeObjectId: nodeId,
    casterUnitId: null,
    amount,
    turnsRemaining: null,
  });
}

/** Latch whatever tripped, which is what `settlePower` writes back after a solve. */
function settle(state: GameState) {
  const solution = solve(state);
  for (const node of state.grids[0]!.nodes) {
    node.tripped = solution.tripped.includes(node.objectId);
  }
  return solution;
}

/** Every tile reachable from `starts` at this Jump, with no Move budget. */
function reach(state: GameState, starts: readonly TileCoord[], jump: number): Set<string> {
  const key = (c: TileCoord) => `${c.x},${c.y}`;
  const seen = new Set<string>();
  const queue: TileCoord[] = [];
  for (const start of starts) {
    if (!isStandable(state, start) || seen.has(key(start))) continue;
    seen.add(key(start));
    queue.push(start);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    const height = standHeight(state, current);
    for (const next of neighbors(current)) {
      if (!inBounds(state.content.map, next) || seen.has(key(next))) continue;
      if (!isStandable(state, next)) continue;
      if (Math.abs(standHeight(state, next) - height) > jump) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/** Tiles a unit can operate this object from: its footprint and everything adjacent. */
function controlTiles(state: GameState, object: MapObject): TileCoord[] {
  const out = new Map<string, TileCoord>();
  for (const tile of object.tiles) {
    for (const candidate of [tile, ...neighbors(tile)]) {
      if (!inBounds(state.content.map, candidate) || !isStandable(state, candidate)) continue;
      out.set(`${candidate.x},${candidate.y}`, candidate);
    }
  }
  return [...out.values()];
}

describe("the Meter House grid, as authored", () => {
  it("declares fifteen nodes and fourteen edges, every edge stored with a < b", () => {
    const grid = gridDef(battle());
    expect(grid.nodes).toHaveLength(15);
    expect(grid.edges).toHaveLength(14);
    for (const edge of grid.edges) expect(edge.a < edge.b).toBe(true);
  });

  it("opens with the tie open and both halves fed", () => {
    const state = battle();
    expect(object(state, "gallery-tie").powered).toBe(false);
    const solution = solve(state);
    expect(solution.tripped).toEqual([]);
    expect(solution.live.sort()).toEqual([...WEST_HALF, ...EAST_HALF].sort());
  });

  // The two halves are separate components, which is only observable through
  // what killing one main leaves standing.
  it("runs as two components while the tie is open", () => {
    const state = battle();
    demolish(state, "west-main");
    expect(settle(state).live.sort()).toEqual([...EAST_HALF].sort());
  });

  it("carries 10 of 14 on each half — a load of 4 fits and a load of 5 does not", () => {
    for (const [board, main] of [
      ["west-board", "west-main"],
      ["east-board", "east-main"],
    ] as const) {
      const fits = battle();
      load(fits, board, 4);
      expect(settle(fits).tripped).toEqual([]);

      const blows = battle();
      load(blows, board, 5);
      expect(settle(blows).tripped).toEqual([main]);
    }
  });

  it("carries 20 of 28 with the tie closed — headroom of exactly 8", () => {
    const state = battle();
    isolate(state, "gallery-tie", true);
    const solution = solve(state);
    expect(solution.capacity).toBe(28);
    expect(solution.load).toBe(20);
    expect(solution.live).toHaveLength(15);

    const fits = battle();
    isolate(fits, "gallery-tie", true);
    load(fits, "gallery-tie", 8);
    expect(settle(fits).tripped).toEqual([]);

    const blows = battle();
    isolate(blows, "gallery-tie", true);
    load(blows, "gallery-tie", 9);
    expect(settle(blows).tripped).toEqual(["east-main", "west-main"]);
  });

  // The knife edge §1.7 quotes Overdraw and the 70-85% band together for.
  it("an Overdraw of 8 trips a half on its own and does not trip the tied bus", () => {
    const half = battle();
    load(half, "west-board", 8);
    expect(settle(half).tripped).toEqual(["west-main"]);

    const bus = battle();
    isolate(bus, "gallery-tie", true);
    load(bus, "gallery-tie", 8);
    expect(settle(bus).tripped).toEqual([]);
  });

  // Rated Draw takes 2 off every load she hangs, which is exactly the step
  // between a Backfeed this house absorbs and one that blacks out her own half.
  it("a licensed Backfeed of 4 sits on the rating where an unlicensed 6 blows it", () => {
    const greedy = battle();
    load(greedy, "west-board", 6);
    expect(settle(greedy).tripped).toEqual(["west-main"]);

    const rated = battle();
    load(rated, "west-board", 4);
    expect(settle(rated).tripped).toEqual([]);
  });

  it("shedding one 4-draw machine saves the half instead", () => {
    const state = battle();
    isolate(state, "charge-hoist-west", false);
    load(state, "west-board", 8);
    expect(settle(state).tripped).toEqual([]);
    expect(settle(state).live).not.toContain("charge-hoist-west");
  });
});

describe("the conjunction the graph exists to express", () => {
  it("killing a main with the tie open blacks out that half only", () => {
    const state = battle();
    demolish(state, "west-main");
    const solution = settle(state);
    expect(solution.tripped).toEqual([]);
    for (const id of EAST_HALF) expect(solution.live).toContain(id);
    for (const id of WEST_HALF.filter((n) => n !== "west-main")) {
      expect(solution.live).not.toContain(id);
    }
  });

  it("killing a main with the tie closed trips the whole house", () => {
    const state = battle();
    isolate(state, "gallery-tie", true);
    demolish(state, "west-main");
    const solution = settle(state);
    expect(solution.tripped).toEqual(["east-main"]);
    expect(solution.live).toEqual([]);
  });

  it("reclosing without opening the tie re-trips it; opening it first restores half the floor", () => {
    const state = battle();
    isolate(state, "gallery-tie", true);
    demolish(state, "west-main");
    settle(state);

    // One action, spent wrong: 20 against 14 is still 20 against 14.
    isolate(state, "east-main", true);
    state.grids[0]!.nodes.find((n) => n.objectId === "east-main")!.tripped = false;
    expect(settle(state).tripped).toEqual(["east-main"]);
    expect(settle(state).live).toEqual([]);

    // Two actions, spent in order: open the tie, then reclose the survivor.
    isolate(state, "gallery-tie", false);
    state.grids[0]!.nodes.find((n) => n.objectId === "east-main")!.tripped = false;
    const solution = settle(state);
    expect(solution.tripped).toEqual([]);
    expect(solution.live.sort()).toEqual([...EAST_HALF].sort());
  });
});

describe("cut and splice", () => {
  it("every line run's cut takes something down, and a splice puts it back", () => {
    const state = battle();
    const before = solve(state).live.sort();
    for (const id of LINE_RUNS) {
      sever(state, id, true);
      const cut = solve(state).live;
      expect(cut.length, `${id}: cutting it changed nothing`).toBeLessThan(before.length);
      expect(cut).not.toContain(id);
      sever(state, id, false);
      expect(solve(state).live.sort(), `${id}: the splice did not restore it`).toEqual(before);
    }
  });

  it("a cut never trips a source — capacity leaves with the load", () => {
    for (const id of LINE_RUNS) {
      const state = battle();
      sever(state, id, true);
      expect(settle(state).tripped, `${id}`).toEqual([]);
    }
  });
});

describe("the floor under the grid", () => {
  const deployment = map.deploymentTiles;
  const enemyStarts = encounter.enemies.map((placed) => placed.position);

  it("deploys along one edge through three distinct mouths", () => {
    expect(deployment.every((c) => c.y >= 14)).toBe(true);
    const columns = new Set(deployment.map((c) => c.x));
    const doors = [2, 3, 7, 8, 12, 13].filter((x) => columns.has(x));
    expect(doors.length).toBeGreaterThanOrEqual(6);
  });

  it("no trigger tile sits on a deployment tile", () => {
    const deployed = new Set(deployment.map((c) => `${c.x},${c.y}`));
    for (const trigger of encounter.triggers) {
      if (trigger.when.kind !== "unitEntersTiles") continue;
      for (const tile of trigger.when.tiles) {
        expect(deployed.has(`${tile.x},${tile.y}`), `${trigger.id}`).toBe(false);
      }
    }
  });

  it("every enemy stands on a standable tile nobody else holds", () => {
    const state = battle();
    const held = new Set<string>();
    for (const placed of encounter.enemies) {
      const key = `${placed.position.x},${placed.position.y}`;
      expect(isStandable(state, placed.position), `${placed.unit.id}`).toBe(true);
      expect(held.has(key), `${placed.unit.id}: two bodies on one tile`).toBe(false);
      held.add(key);
    }
  });

  // MAP_NOTES' rule, restated for a deck that drops on power rather than on
  // damage: the lift is a shortcut over a longer legal path, never the path.
  it("every objective is reachable at Jump 1 with the meter lift's deck dropped", () => {
    const state = battle();
    isolate(state, "meter-lift", false);
    expect(solve(state).live).not.toContain("meter-lift");

    const reachable = reach(state, deployment, 1);
    for (const tile of LANDING) {
      expect(reachable.has(`${tile.x},${tile.y}`), `landing ${tile.x},${tile.y}`).toBe(true);
    }
    for (const object of state.content.map.objects) {
      if (object.operable === null) continue;
      const control = controlTiles(state, object).map((c) => `${c.x},${c.y}`);
      expect(
        control.some((key) => reachable.has(key)),
        `${object.id}: no control position reachable at Jump 1 with the deck down`,
      ).toBe(true);
    }
  });

  it("the deck is a shortcut, not a route — dropping it strands nobody", () => {
    const up = battle();
    const down = battle();
    isolate(down, "meter-lift", false);
    expect(reach(down, deployment, 1).size).toBe(reach(up, deployment, 1).size);
  });

  it("every operable's control position is reachable from both approaches", () => {
    const state = battle();
    isolate(state, "meter-lift", false);
    const fromDoors = reach(state, deployment, 1);
    const fromTheHall = reach(state, enemyStarts, 1);
    for (const object of state.content.map.objects) {
      if (object.operable === null) continue;
      const control = controlTiles(state, object).map((c) => `${c.x},${c.y}`);
      expect(control.some((key) => fromDoors.has(key)), `${object.id}: player`).toBe(true);
      expect(control.some((key) => fromTheHall.has(key)), `${object.id}: enemy`).toBe(true);
    }
    for (const tile of LANDING) {
      expect(fromTheHall.has(`${tile.x},${tile.y}`), "the tie, from the hall").toBe(true);
    }
  });
});

describe("the encounter's restore ladder", () => {
  it("puts both mains back every twelve unit turns, and says so only once", () => {
    const ladder = encounter.triggers.filter(
      (trigger) =>
        trigger.when.kind === "turnStart" &&
        trigger.actions.some((a) => a.kind === "setPower" && a.powered),
    );
    const turns = ladder.map((t) => (t.when.kind === "turnStart" ? t.when.turn : 0));
    expect(turns).toEqual([24, 36, 48, 60, 72, 84]);
    for (const trigger of ladder) {
      const restored = trigger.actions
        .filter((a) => a.kind === "setPower")
        .map((a) => (a.kind === "setPower" ? a.objectId : ""))
        .sort();
      expect(restored).toEqual(["east-main", "west-main"]);
      expect(trigger.once).toBe(true);
    }
    const spoken = ladder.filter((t) => t.actions.some((a) => a.kind === "dialogue"));
    expect(spoken).toHaveLength(1);
  });

  // The restore has to answer a trip, not merely an isolator: a tripped source
  // still reads `powered: true`, so the ladder is only a tug-of-war if
  // `setPower` clears the latch as well. It does — `setObjectPower` treats
  // "on" against a latched source as a reclose and emits `GridReset`.
  it("a setPower trigger action clears a source's trip latch", () => {
    const state = battle();
    load(state, "west-board", 8);
    expect(settle(state).tripped).toEqual(["west-main"]);
    expect(object(state, "west-main").powered, "a trip does not open the isolator").toBe(true);

    state.grids[0]!.loads = [];
    expect(settle(state).tripped, "the latch does not clear itself").toEqual(["west-main"]);

    state.turn = 24;
    const ctx = { state, events: [] as BattleEvent[] };
    evaluateTriggers(ctx);
    expect(state.firedTriggerIds).toContain("the-house-comes-back");
    expect(ctx.events.some((e) => e.type === "GridReset")).toBe(true);
    expect(solve(state).tripped).toEqual([]);
    expect(solve(state).live.sort()).toEqual([...WEST_HALF, ...EAST_HALF].sort());
  });

  it("names no grid-aware trigger, win, or loss condition — those are v2", () => {
    const kinds = encounter.triggers.map((t) => t.when.kind);
    expect(kinds.every((k) => k !== ("gridTripped" as string))).toBe(true);
    const wins = encounter.winConditions.flatMap((w) =>
      w.kind === "all" ? w.conditions.map((c) => c.kind) : [w.kind],
    );
    expect(wins.sort()).toEqual(["defeatUnit", "defeatUnit", "defeatUnit", "rout"]);
    expect(encounter.lossConditions.map((l) => l.kind)).toEqual(["partyRout"]);
  });

  // BALANCE_REPORT §7.8.3: an enemy that could delete the presses deleted the
  // thesis. Destruction here is expensive and permanent; the routine verb is not.
  it("no enemy carries a cheap way to delete the grid", () => {
    for (const placed of encounter.enemies) {
      expect(placed.unit.learnedAbilityIds, placed.unit.id).not.toContain("bring-it-down");
      expect(placed.unit.learnedAbilityIds, placed.unit.id).not.toContain("shaped-charge");
      expect(placed.unit.learnedAbilityIds, placed.unit.id).not.toContain("overload-cell");
    }
  });

  it("the crew holds both halves of the tug-of-war", () => {
    const learned = encounter.enemies.flatMap((placed) => placed.unit.learnedAbilityIds);
    expect(learned.some((id) => id === "cut-the-feed" || id === "rig-machinery")).toBe(true);
    expect(
      learned.some((id) => id === "reclose" || id === "field-splice" || id === "cross-tie"),
    ).toBe(true);
  });
});
