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

/** Every row of the section, buses in order, then whatever is on none of them. */
const rows = (state: GameState) => {
  const entry = section(state);
  return [...entry.components.flatMap((component) => component.nodes), ...entry.outOfCircuit];
};

const stateOf = (state: GameState, objectId: string) =>
  rows(state).find((node) => node.objectId === objectId)?.state;

/** The bus a node is on, as the register reads it. */
const busOf = (state: GameState, objectId: string) =>
  section(state).components.find((component) =>
    component.nodes.some((node) => node.objectId === objectId),
  );

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
    expect(rows(bench()).map((node) => node.objectId)).toEqual([
      // The east bus, by ascending lowest node id.
      "east-main",
      "east-bus",
      "press-east",
      // Then the west one.
      "west-main",
      "north-bus",
      "west-bus",
      "lift-deck",
      "press-west",
      // Then what is on neither.
      "gallery-tie",
    ]);
  });

  it("puts sections in grid-id order and the ungridded machinery after them", () => {
    const register = powerRegister(bench());
    expect(register.grids.map((entry) => entry.gridId)).toEqual([BENCH_GRID_ID]);
    expect(register.ungridded).toEqual([]);
  });
});

describe("the load line is a component's, never a grid's", () => {
  it("reads each bus against its own rating rather than summing the house", () => {
    expect(
      section(bench()).components.map((component) => ({
        sources: component.sources,
        load: component.load,
        capacity: component.capacity,
        state: component.state,
      })),
    ).toEqual([
      { sources: ["east-main"], load: 4, capacity: 10, state: "live" },
      { sources: ["west-main"], load: 6, capacity: 12, state: "live" },
    ]);
  });

  it("reads one bus when the tie joins them, and both mains feed it", () => {
    const tied = act(bench(), "bench-cross-tie", "gallery-tie");
    expect(section(tied).components).toHaveLength(1);
    expect(section(tied).components[0]).toMatchObject({
      sources: ["east-main", "west-main"],
      load: 10,
      capacity: 22,
      state: "live",
    });
  });

  it("keeps the blown bus's own arithmetic, and leaves the other one alone", () => {
    const blown = act(bench(), "bench-overdraw", "west-bus");
    expect(busOf(blown, "west-main")).toMatchObject({
      load: 14,
      capacity: 12,
      state: "tripped",
    });
    expect(busOf(blown, "east-main")).toMatchObject({ load: 4, capacity: 10, state: "live" });
  });

  it("gives a bus with nothing feeding it no arithmetic to read", () => {
    const dark = act(bench(), "bench-isolate", "west-main");
    const stranded = busOf(dark, "north-bus");
    expect(stranded).toMatchObject({ sources: [], capacity: 0, state: "dead" });
    expect(stranded?.nodes.map((node) => node.objectId)).toEqual([
      "north-bus",
      "west-bus",
      "lift-deck",
      "press-west",
    ]);
  });

  it("takes a wrecked node out of the circuit entirely", () => {
    const wrecked = act(bench(), "bench-demolish", "north-bus");
    expect(busOf(wrecked, "north-bus")).toBeUndefined();
    expect(section(wrecked).outOfCircuit.map((node) => node.objectId)).toEqual([
      "gallery-tie",
      "north-bus",
    ]);
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
    expect(busOf(blown, "west-main")?.load).toBe(14);
  });

  it("reads a closed tie as closed, not merely live", () => {
    const closed = act(bench(), "bench-cross-tie", "gallery-tie");
    expect(stateOf(closed, "gallery-tie")).toBe("tie-closed");
  });

  it("tells a wreck from a node the grid merely stopped feeding", () => {
    const wrecked = act(bench(), "bench-demolish", "north-bus");
    expect(stateOf(wrecked, "north-bus")).toBe("destroyed");
    expect(stateOf(wrecked, "press-west")).toBe("dead");
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

  it("reaches the view model, one line per bus", () => {
    const view = powerLedgerView(bench());
    expect(view?.networks?.[0]?.gridId).toBe(BENCH_GRID_ID);
    expect(
      view?.networks?.[0]?.components.map((component) => ({
        load: component.load,
        capacity: component.capacity,
        level: component.level,
        state: component.state,
      })),
    ).toEqual([
      { load: 4, capacity: 10, level: "rest", state: "live" },
      { load: 6, capacity: 12, level: "rest", state: "live" },
    ]);
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

  // Destroying a main is the one grid verb with no undo, and it was the only
  // one with no preview.
  it("marks what a demolition would take dark, permanently", () => {
    expect(target(bench(), "bench-demolish", "north-bus")).toEqual([
      "lift-deck",
      "north-bus",
      "press-west",
    ]);
  });

  it("marks nothing for an order that does not touch the graph", () => {
    expect(target(bench(), "bench-immolate", "press-west")).toEqual([]);
  });

  it("leaves the state it was asked about untouched", () => {
    const state = bench();
    target(state, "bench-cut", "north-bus");
    expect(stateOf(state, "north-bus")).toBe("live");
  });
});
