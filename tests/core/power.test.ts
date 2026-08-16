import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  getObject,
  objectEnergized,
  poweredObjects,
  solveGrid,
  standHeight,
  type BattleEvent,
  type CommandResult,
  type GameState,
} from "../../src/core/index.js";
import { advanceTo, loadContent } from "./fixtures.js";
import { BENCH_ENCOUNTER_ID, BENCH_GRID_ID, benchContent, benchUnit } from "./gridFixtures.js";

const HAND = "bench-hand";

function bench(): GameState {
  const start = createBattle(benchContent(), BENCH_ENCOUNTER_ID, [benchUnit(HAND)], [
    { unitId: HAND, position: { x: 4, y: 0 }, facing: "north" },
  ]);
  return advanceTo(start.state, HAND);
}

function act(state: GameState, abilityId: string, objectId: string): CommandResult {
  return applyCommand(state, {
    kind: "act",
    unitId: HAND,
    abilityId,
    target: { kind: "object", objectId },
  });
}

/** Close whatever turn is in flight and come back round to the bench hand. */
function nextTurn(state: GameState): GameState {
  const active = state.activeTurn;
  const passed =
    active === null ? state : applyCommand(state, { kind: "endTurn", unitId: active.unitId }).state;
  return advanceTo(passed, HAND);
}

/** One more of the hand's turns, spent on this order. */
function step(state: GameState, abilityId: string, objectId: string): CommandResult {
  const result = act(nextTurn(state), abilityId, objectId);
  expect(result.error).toBeNull();
  return result;
}

function live(state: GameState): string[] {
  return state.map.objects.filter((o) => objectEnergized(state, o.def.id)).map((o) => o.def.id).sort();
}

function grid(state: GameState) {
  const def = state.content.map.grids.find((g) => g.id === BENCH_GRID_ID)!;
  return solveGrid(state, def);
}

const of = <T extends BattleEvent["type"]>(events: readonly BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

const WEST_BRANCH = ["lift-deck", "north-bus", "press-west", "west-bus", "west-main"];
const EAST_BRANCH = ["east-bus", "east-main", "press-east"];

describe("energization", () => {
  it("feeds both branches from their own mains, with the tie open", () => {
    const state = bench();
    expect(live(state)).toEqual([...WEST_BRANCH, ...EAST_BRANCH].sort());
    // A normally-open tie is `powered: false` on the tie object; it conducts nothing.
    expect(getObject(state, "gallery-tie")?.powered).toBe(false);
    expect(objectEnergized(state, "gallery-tie")).toBe(false);

    // The register reads the network, not a component: every closed source and
    // every closed sink.
    const solved = grid(state);
    expect(solved.capacity).toBe(22);
    expect(solved.load).toBe(10);
    expect(solved.tripped).toEqual([]);
  });

  it("takes a branch dark when the line feeding it is cut, and puts it back on a splice", () => {
    const cut = act(bench(), "bench-cut", "north-bus");
    expect(cut.error).toBeNull();
    expect(of(cut.events, "LineSevered")).toMatchObject([{ objectId: "north-bus", unitId: HAND }]);
    // west-main and west-bus are still fed; everything past the cut is not.
    expect(live(cut.state)).toEqual([...EAST_BRANCH, "west-bus", "west-main"].sort());
    expect(of(cut.events, "PowerChanged").map((e) => e.objectId)).toEqual([
      "lift-deck",
      "north-bus",
      "press-west",
    ]);

    const spliced = step(cut.state, "bench-splice", "north-bus").state;
    expect(live(spliced)).toEqual([...WEST_BRANCH, ...EAST_BRANCH].sort());
  });

  it("drops a branch when its isolator is opened, and restores it when closed", () => {
    const opened = act(bench(), "bench-isolate", "west-main");
    expect(live(opened.state)).toEqual(EAST_BRANCH);
    expect(of(opened.events, "PowerChanged").every((e) => !e.powered)).toBe(true);

    const closed = step(opened.state, "bench-close", "west-main").state;
    expect(live(closed)).toEqual([...WEST_BRANCH, ...EAST_BRANCH].sort());
  });

  it("a component with no capacity is dead without anything tripping", () => {
    const half = act(bench(), "bench-isolate", "west-main");
    const dark = step(half.state, "bench-isolate", "east-main");
    expect(live(dark.state)).toEqual([]);
    expect(of(dark.events, "GridTripped")).toEqual([]);
    expect(grid(dark.state).tripped).toEqual([]);
    expect(grid(dark.state).capacity).toBe(0);
  });

  it("destruction is permanent where a cut is not", () => {
    const gone = act(bench(), "bench-demolish", "north-bus");
    expect(getObject(gone.state, "north-bus")?.destroyed).toBe(true);
    expect(live(gone.state)).toEqual([...EAST_BRANCH, "west-bus", "west-main"].sort());

    const splice = act(nextTurn(gone.state), "bench-splice", "north-bus");
    expect(splice.error?.code).toBe("object-destroyed");
  });

  it("severing anything but a line is inert", () => {
    const state = bench();
    const refused = act(state, "bench-cut", "west-main");
    expect(refused.error?.code).toBe("requirement-unmet");
  });
});

describe("overload, the latch, and the reclose", () => {
  it("trips the bus it overdraws and names what it was carrying", () => {
    const blown = act(bench(), "bench-overdraw", "north-bus");
    expect(blown.error).toBeNull();
    expect(of(blown.events, "LoadAttached")).toMatchObject([
      { gridId: BENCH_GRID_ID, nodeId: "north-bus", amount: 8, turns: 3, unitId: HAND },
    ]);
    // The west component carried 14 against a rating of 12.
    expect(of(blown.events, "GridTripped")).toMatchObject([{ gridId: BENCH_GRID_ID, capacity: 12, load: 14 }]);
    expect(live(blown.state)).toEqual(EAST_BRANCH);
    expect(grid(blown.state).tripped).toEqual(["west-main"]);

    // The trip is total: the isolator is still closed, and the branch is dark anyway.
    expect(getObject(blown.state, "west-main")?.powered).toBe(true);
    expect(objectEnergized(blown.state, "west-main")).toBe(false);
  });

  it("the latch holds until somebody recloses it", () => {
    const blown = act(bench(), "bench-overdraw", "north-bus");
    const later = nextTurn(blown.state);
    expect(grid(later).tripped).toEqual(["west-main"]);
    expect(live(later)).toEqual(EAST_BRANCH);
  });

  it("a reclose under the same load blows again on the same pass", () => {
    const blown = act(bench(), "bench-overdraw", "north-bus");
    const reclosed = step(blown.state, "bench-reclose", "west-main");
    expect(of(reclosed.events, "GridReset")).toMatchObject([
      { gridId: BENCH_GRID_ID, nodeId: "west-main", unitId: HAND },
    ]);
    expect(of(reclosed.events, "GridTripped").length).toBe(1);
    expect(live(reclosed.state)).toEqual(EAST_BRANCH);
  });

  it("shedding a load makes the bus fit under its rating again", () => {
    const blown = act(bench(), "bench-overdraw", "north-bus");
    // Open the press's isolator: the component now draws 12 against 12.
    const shed = step(blown.state, "bench-isolate", "press-west");
    const reclosed = step(shed.state, "bench-reclose", "west-main");
    expect(of(reclosed.events, "GridTripped")).toEqual([]);
    expect(live(reclosed.state)).toEqual([...EAST_BRANCH, "lift-deck", "north-bus", "west-bus", "west-main"].sort());
  });

  it("a second main on the bus absorbs the same overdraw", () => {
    const tied = act(bench(), "bench-cross-tie", "gallery-tie").state;
    expect(objectEnergized(tied, "gallery-tie")).toBe(true);
    expect(grid(tied).capacity).toBe(22);

    const overdrawn = step(tied, "bench-overdraw", "north-bus");
    expect(of(overdrawn.events, "GridTripped")).toEqual([]);
    expect(grid(overdrawn.state).load).toBe(18);
    expect(live(overdrawn.state)).toEqual([...WEST_BRANCH, ...EAST_BRANCH, "gallery-tie"].sort());
  });

  it("opening the tie again strands the half that has no main", () => {
    const tied = act(bench(), "bench-cross-tie", "gallery-tie").state;
    const state = step(tied, "bench-isolate", "west-main").state;
    expect(live(state)).toEqual([...WEST_BRANCH.filter((id) => id !== "west-main"), ...EAST_BRANCH, "gallery-tie"].sort());
    const split = step(state, "bench-cross-tie", "gallery-tie");
    expect(live(split.state)).toEqual(EAST_BRANCH);
  });
});

describe("timed loads", () => {
  it("expires on the caster's own turns and lets the bus be reclosed", () => {
    let state = act(bench(), "bench-overdraw", "north-bus").state;
    let expired: BattleEvent[] = [];
    // durationTurns 3, counted down at the end of each of the caster's own turns.
    for (let i = 0; i < 3; i += 1) {
      const passed = applyCommand(state, { kind: "endTurn", unitId: HAND });
      expired = [...expired, ...of(passed.events, "LoadExpired")];
      state = advanceTo(passed.state, HAND);
    }
    expect(expired.length).toBe(1);
    expect(state.grids[0]?.loads).toEqual([]);
    expect(grid(state).load).toBe(10);

    const reclosed = act(state, "bench-reclose", "west-main");
    expect(of(reclosed.events, "GridTripped")).toEqual([]);
    expect(live(reclosed.state)).toEqual([...WEST_BRANCH, ...EAST_BRANCH].sort());
  });

  it("dies with its caster, the same rule that cancels a charge in flight", () => {
    const state = act(bench(), "bench-overdraw", "north-bus").state;
    expect(state.grids[0]?.loads.length).toBe(1);
    const downed = applyCommand(nextTurn(state), {
      kind: "act",
      unitId: HAND,
      abilityId: "bench-immolate",
      target: { kind: "unit", unitId: HAND },
    });
    expect(downed.error).toBeNull();
    expect(downed.events.some((e) => e.type === "UnitDowned" && e.unitId === HAND)).toBe(true);
    expect(of(downed.events, "LoadExpired").length).toBe(1);
    expect(downed.state.grids[0]?.loads).toEqual([]);
  });
});

describe("what energization is read by", () => {
  it("gates operating a machine on the grid, not on the isolator", () => {
    const cut = act(bench(), "bench-cut", "north-bus");
    const state = nextTurn(cut.state);
    // The isolator is still closed; the grid is simply not feeding it.
    expect(getObject(state, "press-west")?.powered).toBe(true);
    const worked = applyCommand(state, { kind: "activateObject", unitId: HAND, objectId: "press-west" });
    expect(worked.error?.code).toBe("object-unpowered");
  });

  it("drops a deck whose component goes dark", () => {
    const state = bench();
    expect(standHeight(state, { x: 3, y: 2 })).toBe(2);
    const cut = act(state, "bench-cut", "north-bus");
    expect(standHeight(cut.state, { x: 3, y: 2 })).toBe(0);
  });

  it("lights the POWER register from the derived value", () => {
    const cut = act(bench(), "bench-cut", "north-bus");
    const rows = new Map(poweredObjects(cut.state).map((r) => [r.objectId, r.powered]));
    expect(rows.get("press-west")).toBe(false);
    expect(rows.get("press-east")).toBe(true);
    expect(rows.get("west-main")).toBe(true);
  });
});

describe("the recompute itself", () => {
  it("announces the network before the objects, and names a cause", () => {
    const blown = act(bench(), "bench-overdraw", "north-bus");
    const types = blown.events.map((e) => e.type);
    expect(types.indexOf("GridChanged")).toBeLessThan(types.indexOf("PowerChanged"));
    expect(types.indexOf("GridTripped")).toBeLessThan(types.indexOf("GridChanged"));
    for (const event of of(blown.events, "PowerChanged")) {
      expect(event.cause).toMatchObject({ gridId: BENCH_GRID_ID, reason: "tripped" });
    }
    const cut = act(bench(), "bench-cut", "north-bus");
    for (const event of of(cut.events, "PowerChanged")) {
      expect(event.cause).toMatchObject({ gridId: BENCH_GRID_ID, nodeId: "north-bus", reason: "cut" });
    }
  });

  it("emits nothing when it changes nothing", () => {
    const state = bench();
    const noop = act(state, "bench-close", "west-main");
    expect(of(noop.events, "GridChanged")).toEqual([]);
    expect(of(noop.events, "PowerChanged")).toEqual([]);
  });

  it("settles inside the source count plus one pass", () => {
    const sources = 2;
    const tied = act(bench(), "bench-cross-tie", "gallery-tie").state;
    const scenarios: GameState[] = [
      bench(),
      act(bench(), "bench-overdraw", "north-bus").state,
      step(tied, "bench-overdraw", "north-bus").state,
      act(bench(), "bench-cut", "north-bus").state,
    ];
    for (const state of scenarios) {
      expect(grid(state).passes).toBeLessThanOrEqual(sources + 1);
    }
  });
});

describe("the degeneracy rule", () => {
  it("an object on no declared grid is energized exactly when its isolator is closed", () => {
    const content = loadContent();
    for (const map of Object.values(content.maps)) {
      expect(map.grids).toEqual([]);
    }
    let state = createBattle(content, "e1-marshaling-yard", [benchUnit("yard-hand", "conduit")], [
      { unitId: "yard-hand", position: { ...content.maps["marshaling-yard"]!.deploymentTiles[0]! } },
    ]).state;
    for (let i = 0; i < 12; i += 1) {
      for (const obj of state.map.objects) {
        if (obj.powered === null) continue;
        expect(objectEnergized(state, obj.def.id)).toBe(!obj.destroyed && obj.powered);
      }
      const active = state.units.find((u) => !u.downed && state.activeTurn?.unitId === u.id);
      if (active === undefined) break;
      state = applyCommand(state, { kind: "endTurn", unitId: active.id }).state;
    }
    expect(state.grids).toEqual([]);
  });
});

/**
 * The recompute is a pure function of (graph, node states, object states), and
 * §5.1 leans on that: it is what makes calling it after every graph-mutating
 * primitive safe. Swept over every isolator combination the bench affords.
 */
describe("invariants over every isolator combination", () => {
  const NODES = [
    "east-bus",
    "east-main",
    "gallery-tie",
    "lift-deck",
    "north-bus",
    "press-east",
    "press-west",
    "west-bus",
    "west-main",
  ];
  const SOURCES = 2;

  function withIsolators(base: GameState, mask: number): GameState {
    const state = structuredClone(base) as GameState;
    state.content = base.content;
    NODES.forEach((id, bit) => {
      const obj = state.map.objects.find((o) => o.def.id === id)!;
      obj.powered = (mask & (1 << bit)) !== 0;
    });
    return state;
  }

  function edges(state: GameState) {
    return state.content.map.grids.find((g) => g.id === BENCH_GRID_ID)!.edges;
  }

  it("settles, stays deterministic, and never feeds a node with no path to a live source", () => {
    const base = bench();
    for (let mask = 0; mask < 1 << NODES.length; mask += 1) {
      const state = withIsolators(base, mask);
      const solved = grid(state);
      expect(solved.passes).toBeLessThanOrEqual(SOURCES + 1);
      expect(grid(state)).toEqual(solved);

      const fed = new Set(solved.live);
      // Nothing with an open isolator is ever fed.
      for (const id of fed) expect(state.map.objects.find((o) => o.def.id === id)!.powered).toBe(true);

      // Every fed node reaches a fed source through fed nodes only.
      const sources = new Set(["east-main", "west-main"].filter((id) => fed.has(id)));
      const reached = new Set(sources);
      const queue = [...sources];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of edges(state)) {
          const other = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
          if (other === null || !fed.has(other) || reached.has(other)) continue;
          reached.add(other);
          queue.push(other);
        }
      }
      expect([...fed].sort()).toEqual([...reached].sort());
    }
  });
});
