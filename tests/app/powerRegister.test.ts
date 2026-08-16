// The legibility contract's readout half (FLUX_GRID §2.5a): the register's
// ordering, the states it prints, how a tie is told from a switchboard, and the
// three colours of the LOAD line at their exact boundaries.

import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  gridFlipPreview,
  powerRegister,
  type GameState,
} from "../../src/core/index.js";
import type { GameMap } from "../../src/data/index.js";
import { powerLedgerView, powerLoadLevel } from "../../src/app/viewmodels.js";
import { advanceTo } from "../core/fixtures.js";
import {
  BENCH_ENCOUNTER_ID,
  BENCH_GRID_ID,
  BENCH_MAP_ID,
  benchContent,
  benchUnit,
} from "../core/gridFixtures.js";

const HAND = "bench-hand";

function bench(mutate?: (map: GameMap) => void): GameState {
  const content = benchContent();
  mutate?.(content.maps[BENCH_MAP_ID] as GameMap);
  const start = createBattle(content, BENCH_ENCOUNTER_ID, [benchUnit(HAND)], [
    { unitId: HAND, position: { x: 4, y: 0 }, facing: "north" },
  ]);
  return advanceTo(start.state, HAND);
}

const section = (state: GameState) =>
  powerRegister(state).grids.find((entry) => entry.gridId === BENCH_GRID_ID)!;

const stateOf = (state: GameState, objectId: string) =>
  section(state).nodes.find((node) => node.objectId === objectId)?.state;

function act(state: GameState, abilityId: string, objectId: string): GameState {
  const result = applyCommand(state, {
    kind: "act",
    unitId: HAND,
    abilityId,
    target: { kind: "object", objectId },
  });
  expect(result.error).toBeNull();
  return result.state;
}

describe("the register's ordering", () => {
  it("runs sources, then breakers and ties, then lines, then sinks, each by id", () => {
    expect(section(bench()).nodes.map((node) => node.objectId)).toEqual([
      "east-main",
      "west-main",
      "gallery-tie",
      "east-bus",
      "north-bus",
      "west-bus",
      "lift-deck",
      "press-east",
      "press-west",
    ]);
  });

  it("puts sections in grid-id order and the ungridded machinery after them", () => {
    const register = powerRegister(bench());
    expect(register.grids.map((entry) => entry.gridId)).toEqual([BENCH_GRID_ID]);
    expect(register.ungridded).toEqual([]);
  });

  it("reads what the bus is carrying against what it is rated for", () => {
    const entry = section(bench());
    expect({ load: entry.load, capacity: entry.capacity, tripped: entry.tripped }).toEqual({
      load: 10,
      capacity: 22,
      tripped: false,
    });
  });
});

describe("the state each node prints", () => {
  it("tells a cut span from a thrown switch from a blown latch", () => {
    const rest = bench();
    expect(stateOf(rest, "west-main")).toBe("live");
    expect(stateOf(rest, "press-west")).toBe("live");
    expect(stateOf(rest, "gallery-tie")).toBe("tie-open");

    const cut = act(rest, "bench-cut", "north-bus");
    expect(stateOf(cut, "north-bus")).toBe("cut");
    expect(stateOf(cut, "press-west")).toBe("dead");

    const isolated = act(rest, "bench-isolate", "west-main");
    expect(stateOf(isolated, "west-main")).toBe("open");

    const blown = act(rest, "bench-overdraw", "west-bus");
    expect(stateOf(blown, "west-main")).toBe("tripped");
    // The readout ignores the latch: a blown bus still reads what it was
    // carrying against what it is rated for.
    expect(section(blown).load).toBe(18);
  });

  it("reads a closed tie as closed, not merely live", () => {
    const closed = act(bench(), "bench-cross-tie", "gallery-tie");
    expect(stateOf(closed, "gallery-tie")).toBe("tie-closed");
  });

  it("reads a wrecked node dead, whatever role it held", () => {
    const wrecked = act(bench(), "bench-demolish", "north-bus");
    expect(stateOf(wrecked, "north-bus")).toBe("dead");
  });
});

describe("what makes a breaker a tie", () => {
  it("takes a two-ended switch between two feeds", () => {
    expect(stateOf(bench(), "gallery-tie")).toBe("tie-open");
  });

  it("does not take a four-ended switchboard", () => {
    const wired = bench((map) => {
      const grid = map.grids.find((candidate) => candidate.id === BENCH_GRID_ID)!;
      grid.edges.push({ a: "gallery-tie", b: "press-east" }, { a: "gallery-tie", b: "west-bus" });
    });
    expect(stateOf(wired, "gallery-tie")).toBe("open");
  });

  it("takes nothing at all on a grid with one feed", () => {
    const single = bench((map) => {
      const grid = map.grids.find((candidate) => candidate.id === BENCH_GRID_ID)!;
      grid.nodes = grid.nodes.map((node) =>
        node.objectId === "east-main" ? { role: "line", objectId: "east-main" } : node,
      );
    });
    expect(stateOf(single, "gallery-tie")).toBe("open");
  });
});

describe("the LOAD line's three colours", () => {
  it("turns at 90% of the rating and again past 100%", () => {
    expect(powerLoadLevel(89, 100)).toBe("rest");
    expect(powerLoadLevel(90, 100)).toBe("rated");
    expect(powerLoadLevel(100, 100)).toBe("rated");
    expect(powerLoadLevel(101, 100)).toBe("over");
  });

  it("uses integers, so a 12-rated bus turns at 11 and not at 10", () => {
    expect(powerLoadLevel(10, 12)).toBe("rest");
    expect(powerLoadLevel(11, 12)).toBe("rated");
    expect(powerLoadLevel(12, 12)).toBe("rated");
    expect(powerLoadLevel(13, 12)).toBe("over");
  });

  it("does not call a bus with no rating at all a bus at its rating", () => {
    expect(powerLoadLevel(0, 0)).toBe("rest");
    expect(powerLoadLevel(4, 0)).toBe("over");
  });

  it("reaches the view model", () => {
    const view = powerLedgerView(bench());
    expect(view?.networks?.[0]).toMatchObject({
      gridId: BENCH_GRID_ID,
      load: 10,
      capacity: 22,
      level: "rest",
      tripped: false,
    });
  });
});

describe("what an order would flip", () => {
  const target = (state: GameState, ability: string, objectId: string): string[] =>
    gridFlipPreview(state, HAND, ability, { kind: "object", objectId });

  it("marks exactly the component a cut would take dark", () => {
    expect(target(bench(), "bench-cut", "north-bus")).toEqual([
      "lift-deck",
      "north-bus",
      "press-west",
    ]);
  });

  it("marks the whole component an overdraw would blow", () => {
    expect(target(bench(), "bench-overdraw", "west-bus")).toEqual([
      "lift-deck",
      "north-bus",
      "press-west",
      "west-bus",
      "west-main",
    ]);
  });

  it("marks what a tie would bring back up", () => {
    const dark = act(bench(), "bench-isolate", "west-main");
    expect(target(dark, "bench-cross-tie", "gallery-tie")).toEqual([
      "gallery-tie",
      "lift-deck",
      "north-bus",
      "press-west",
      "west-bus",
    ]);
  });

  it("marks nothing for an order that does not touch the graph", () => {
    expect(target(bench(), "bench-demolish", "north-bus")).toEqual([]);
  });

  it("leaves the state it was asked about untouched", () => {
    const state = bench();
    target(state, "bench-cut", "north-bus");
    expect(stateOf(state, "north-bus")).toBe("live");
  });
});
