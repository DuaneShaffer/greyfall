import { describe, expect, it } from "vitest";
import type { Ability, GameMap, TileCoord, Unit } from "../../src/data/index.js";
import {
  applyCommand,
  createBattle,
  getObject,
  objectEnergized,
  solveGrid,
  type BattleEvent,
  type CommandResult,
  type ContentLibrary,
  type GameState,
} from "../../src/core/index.js";
import { advanceTo } from "./fixtures.js";
import {
  BENCH_ENCOUNTER_ID,
  BENCH_GRID_ID,
  GRID_ABILITY_IDS,
  benchContent,
  benchEncounter,
  benchMap,
  benchUnit,
} from "./gridFixtures.js";

const HAND = "grid-hand";
const MATE = "grid-mate";
const YARD: TileCoord = { x: 4, y: 0 };
const GATE: TileCoord = { x: 0, y: 1 };

const WEST_BRANCH = ["lift-deck", "north-bus", "press-west", "west-bus", "west-main"];
const EAST_BRANCH = ["east-bus", "east-main", "press-east"];
const WHOLE_BENCH = [...WEST_BRANCH, ...EAST_BRANCH].sort();

/** The shipped grid verbs, plus the four the grid deepens without changing. */
const KIT = [
  "overdraw",
  "cross-tie",
  "reclose",
  "backfeed",
  "cut-the-feed",
  "field-splice",
  "reroute",
  "throw-the-breaker",
  "ground",
  "overload-cell",
  "tap-line",
  "field-repair",
];

function hand(id: string): Unit {
  const unit = benchUnit(id);
  return { ...unit, learnedAbilityIds: [...GRID_ABILITY_IDS, ...KIT] };
}

/** The same hand, Assay-rated: every load she hangs comes off 2 lighter. */
function licensed(id: string): Unit {
  return { ...hand(id), supportAbilityId: "rated-draw" };
}

/**
 * A second bench, derived rather than authored: the mains are destructible so
 * `overload-cell` has something permanent to do to one, and the draws are set
 * to §6.4's stated numbers — the west bus carries 11 of 12, the east 4 of 12.
 */
const RATED_MAP_ID = "grid-bench-rated";
const RATED_ENCOUNTER_ID = "e-grid-bench-rated";

function ratedMap(): GameMap {
  const map = benchMap();
  map.id = RATED_MAP_ID;
  for (const id of ["west-main", "east-main"]) {
    map.objects.find((o) => o.id === id)!.integrity = { destructible: true, hp: 10 };
  }
  const grid = map.grids[0]!;
  const press = grid.nodes.find((n) => n.objectId === "press-west");
  if (press?.role === "sink") press.draw = 9;
  const east = grid.nodes.find((n) => n.objectId === "east-main");
  if (east?.role === "source") east.capacity = 12;
  return map;
}

function ratedContent(): ContentLibrary {
  const base = benchContent();
  return {
    ...base,
    maps: { ...base.maps, [RATED_MAP_ID]: ratedMap() },
    encounters: {
      ...base.encounters,
      [RATED_ENCOUNTER_ID]: { ...benchEncounter(), id: RATED_ENCOUNTER_ID, mapId: RATED_MAP_ID },
    },
  };
}

interface BenchOptions {
  at?: TileCoord;
  mate?: TileCoord;
  content?: ContentLibrary;
  encounterId?: string;
  make?: (id: string) => Unit;
}

function bench(options: BenchOptions = {}): GameState {
  const at = options.at ?? YARD;
  const make = options.make ?? hand;
  const party = options.mate === undefined ? [make(HAND)] : [make(HAND), make(MATE)];
  const deployment = [
    { unitId: HAND, position: at, facing: "north" as const },
    ...(options.mate === undefined ? [] : [{ unitId: MATE, position: options.mate, facing: "north" as const }]),
  ];
  const start = createBattle(options.content ?? benchContent(), options.encounterId ?? BENCH_ENCOUNTER_ID, party, deployment);
  return advanceTo(start.state, HAND);
}

function ratedBench(at: TileCoord = YARD): GameState {
  return bench({ at, content: ratedContent(), encounterId: RATED_ENCOUNTER_ID });
}

function act(state: GameState, abilityId: string, objectId: string, unitId = HAND): CommandResult {
  return applyCommand(state, {
    kind: "act",
    unitId,
    abilityId,
    target: { kind: "object", objectId },
  });
}

function actSelf(state: GameState, abilityId: string, unitId = HAND): CommandResult {
  return applyCommand(state, {
    kind: "act",
    unitId,
    abilityId,
    target: { kind: "unit", unitId },
  });
}

/** Close whatever turn is in flight and come back round to the bench hand. */
function nextTurn(state: GameState): GameState {
  const active = state.activeTurn;
  const passed =
    active === null ? state : applyCommand(state, { kind: "endTurn", unitId: active.unitId }).state;
  return advanceTo(passed, HAND);
}

function step(state: GameState, abilityId: string, objectId: string): CommandResult {
  const result = act(nextTurn(state), abilityId, objectId);
  expect(result.error).toBeNull();
  return result;
}

/** Spend a whole turn walking, so a charge cap or a sight line can be set up. */
function walk(state: GameState, unitId: string, to: TileCoord): GameState {
  const turn = advanceTo(state, unitId);
  const moved = applyCommand(turn, { kind: "move", unitId, to });
  expect(moved.error).toBeNull();
  return applyCommand(moved.state, { kind: "endTurn", unitId }).state;
}

/** A charged ability resolves on the CT timeline; come back when it has. */
function settled(result: CommandResult): GameState {
  expect(result.error).toBeNull();
  return advanceTo(result.state, HAND);
}

function drain(state: GameState, unitId: string, to = 0): GameState {
  state.units.find((u) => u.id === unitId)!.charge = to;
  return state;
}

function unit(state: GameState, unitId: string) {
  return state.units.find((u) => u.id === unitId)!;
}

function live(state: GameState): string[] {
  return state.map.objects.filter((o) => objectEnergized(state, o.def.id)).map((o) => o.def.id).sort();
}

function grid(state: GameState) {
  return solveGrid(state, state.content.map.grids.find((g) => g.id === BENCH_GRID_ID)!);
}

const of = <T extends BattleEvent["type"]>(events: readonly BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

/**
 * FLUX_GRID §3's table claims four shipped abilities become more against a grid
 * with no JSON change. None of their files is touched; the claims are proved
 * here instead.
 */
describe("what the grid does to abilities that did not change", () => {
  describe("throw the breaker", () => {
    it("drops a whole branch when it opens a source's isolator", () => {
      const opened = act(bench(), "throw-the-breaker", "west-main");
      expect(opened.error).toBeNull();
      expect(getObject(opened.state, "west-main")?.powered).toBe(false);
      expect(live(opened.state)).toEqual(EAST_BRANCH);
    });

    it("sheds a sink's load so an overloaded component fits under its rating again", () => {
      const blown = act(bench(), "overdraw", "north-bus");
      expect(of(blown.events, "GridTripped")).toMatchObject([{ capacity: 12, load: 14 }]);

      const shed = step(blown.state, "throw-the-breaker", "press-west");
      const reclosed = step(shed.state, "reclose", "west-main");
      expect(of(reclosed.events, "GridTripped")).toEqual([]);
      expect(live(reclosed.state)).toEqual(
        [...EAST_BRANCH, "lift-deck", "north-bus", "west-bus", "west-main"].sort(),
      );
    });

    it("throws a normally-open tie closed and carries a dead branch off the second main", () => {
      const dark = act(bench(), "throw-the-breaker", "west-main");
      expect(live(dark.state)).toEqual(EAST_BRANCH);

      const tied = step(dark.state, "throw-the-breaker", "gallery-tie");
      expect(getObject(tied.state, "gallery-tie")?.powered).toBe(true);
      // The east main's 10 now carries the west branch's 6 and its own 4.
      expect(live(tied.state)).toEqual([...WHOLE_BENCH, "gallery-tie"].filter((id) => id !== "west-main").sort());
    });
  });

  it("ground's setPower off opens the isolator, and on a source it drops the branch", () => {
    const state = settled(act(bench({ at: GATE }), "ground", "west-main"));
    expect(getObject(state, "west-main")?.powered).toBe(false);
    expect(live(state)).toEqual(EAST_BRANCH);
  });

  it("overload cell kills a main for good, and a repair does not bring it back", () => {
    const killed = act(ratedBench(GATE), "overload-cell", "west-main");
    expect(killed.error).toBeNull();
    expect(getObject(killed.state, "west-main")?.destroyed).toBe(true);
    expect(live(killed.state)).toEqual(EAST_BRANCH);

    const repair = act(nextTurn(killed.state), "field-repair", "west-main");
    expect(repair.error?.code).toBe("object-destroyed");
  });

  it("overload cell's gate now reads energization, so it refuses a source nothing is feeding", () => {
    const legal = act(bench(), "overload-cell", "west-main");
    expect(legal.error).toBeNull();

    const blown = act(bench(), "overdraw", "north-bus");
    // The isolator is still closed. The grid has simply stopped feeding it.
    expect(getObject(blown.state, "west-main")?.powered).toBe(true);
    const refused = act(nextTurn(blown.state), "overload-cell", "west-main");
    expect(refused.error?.code).toBe("requirement-unmet");
  });

  it("tap line now means adjacent to something the grid is still feeding", () => {
    const state = bench();
    expect(actSelf(state, "tap-line").error).toBeNull();

    const cut = act(state, "cut-the-feed", "north-bus");
    expect(cut.error).toBeNull();
    const dark = nextTurn(cut.state);
    expect(objectEnergized(dark, "press-west")).toBe(false);
    expect(actSelf(dark, "tap-line").error?.code).toBe("requirement-unmet");

    const spliced = step(dark, "field-splice", "north-bus");
    expect(actSelf(nextTurn(spliced.state), "tap-line").error).toBeNull();
  });
});

describe("Overdraw", () => {
  it("trips a bus at 11 of 12 and is wasted on one at 4 of 12", () => {
    const start = ratedBench();
    expect(grid(start).load).toBe(15);
    expect(grid(start).capacity).toBe(24);

    const blown = act(start, "overdraw", "north-bus");
    expect(of(blown.events, "GridTripped")).toMatchObject([{ capacity: 12, load: 19 }]);
    expect(live(blown.state)).toEqual(EAST_BRANCH);

    const absorbed = act(ratedBench(), "overdraw", "east-bus");
    expect(absorbed.error).toBeNull();
    expect(of(absorbed.events, "GridTripped")).toEqual([]);
    expect(live(absorbed.state)).toEqual(WHOLE_BENCH);
  });

  it("expires on the caster's own turns, but the latch it left outlives it", () => {
    let state = act(bench(), "overdraw", "north-bus").state;
    const expired: BattleEvent[] = [];
    for (let i = 0; i < 3; i += 1) {
      const passed = applyCommand(state, { kind: "endTurn", unitId: HAND });
      expired.push(...of(passed.events, "LoadExpired"));
      state = advanceTo(passed.state, HAND);
    }
    expect(expired.length).toBe(1);
    expect(grid(state).load).toBe(10);

    // The trip latches (§1.5), so the bus does *not* come back on its own.
    expect(grid(state).tripped).toEqual(["west-main"]);
    expect(live(state)).toEqual(EAST_BRANCH);

    const reclosed = act(state, "reclose", "west-main");
    expect(of(reclosed.events, "GridTripped")).toEqual([]);
    expect(live(reclosed.state)).toEqual(WHOLE_BENCH);
  });

  it("hangs a load that dies with its caster", () => {
    const state = act(bench(), "overdraw", "north-bus").state;
    expect(state.grids[0]?.loads.length).toBe(1);

    const downed = applyCommand(nextTurn(state), {
      kind: "act",
      unitId: HAND,
      abilityId: "bench-immolate",
      target: { kind: "unit", unitId: HAND },
    });
    expect(of(downed.events, "LoadExpired").length).toBe(1);
    expect(downed.state.grids[0]?.loads).toEqual([]);
  });
});

describe("Reclose", () => {
  it("clears a latched trip", () => {
    const blown = act(bench(), "overdraw", "north-bus");
    const shed = step(blown.state, "throw-the-breaker", "press-west");
    const reclosed = step(shed.state, "reclose", "west-main");
    expect(of(reclosed.events, "GridReset")).toMatchObject([
      { gridId: BENCH_GRID_ID, nodeId: "west-main", unitId: HAND },
    ]);
    expect(grid(reclosed.state).tripped).toEqual([]);
  });

  it("takes a source and nothing else", () => {
    const state = bench();
    for (const objectId of ["north-bus", "press-west", "gallery-tie"]) {
      expect(act(state, "reclose", objectId).error?.code, objectId).toBe("requirement-unmet");
    }
  });
});

describe("Cross-Tie", () => {
  it("closes a normally-open tie and brings the second main onto a dead branch", () => {
    const dark = act(bench(), "throw-the-breaker", "west-main");
    expect(live(dark.state)).toEqual(EAST_BRANCH);

    const tied = step(dark.state, "cross-tie", "gallery-tie");
    expect(getObject(tied.state, "gallery-tie")?.powered).toBe(true);
    expect(grid(tied.state).capacity).toBe(10);
    expect(live(tied.state)).toEqual([...WHOLE_BENCH, "gallery-tie"].filter((id) => id !== "west-main").sort());
  });

  it("takes a breaker and nothing else", () => {
    expect(act(bench(), "cross-tie", "north-bus").error?.code).toBe("requirement-unmet");
  });

  it("throws a tie the caster cannot see, where the abilities that need a sight line cannot", () => {
    // The lift deck stands two heights up and breaks the sight line along its row.
    const state = advanceTo(walk(bench({ at: GATE }), HAND, { x: 2, y: 2 }), HAND);
    expect(act(state, "throw-the-breaker", "gallery-tie").error?.code).toBe("no-line-of-sight");
    expect(act(state, "reroute", "gallery-tie").error?.code).toBe("no-line-of-sight");

    const tied = act(state, "cross-tie", "gallery-tie");
    expect(tied.error).toBeNull();
    expect(getObject(tied.state, "gallery-tie")?.powered).toBe(true);
  });
});

describe("Backfeed", () => {
  it("pays 3 hp for 20 charge and hangs the draw on the node beside her", () => {
    const state = drain(bench(), HAND);
    const hp = unit(state, HAND).hp;
    const fed = actSelf(state, "backfeed");
    expect(fed.error).toBeNull();
    expect(unit(fed.state, HAND).charge).toBe(20);
    expect(unit(fed.state, HAND).hp).toBe(hp - 3);
    expect(of(fed.events, "LoadAttached")).toMatchObject([
      { gridId: BENCH_GRID_ID, nodeId: "press-west", amount: 6, turns: 2, unitId: HAND },
    ]);
    // The west branch now carries 12 against a rating of 12 — no headroom left.
    expect(grid(fed.state).load).toBe(16);
    expect(live(fed.state)).toEqual(WHOLE_BENCH);
  });

  it("is an open shunt on the tile: whoever else is standing in it drinks too", () => {
    let state = bench({ mate: GATE });
    state = walk(state, MATE, { x: 3, y: 1 });
    state = walk(state, MATE, { x: 4, y: 1 });
    state = drain(drain(advanceTo(state, HAND), HAND), MATE);
    const mateHp = unit(state, MATE).hp;

    const fed = actSelf(state, "backfeed");
    expect(fed.error).toBeNull();
    expect(unit(fed.state, MATE).charge).toBe(20);
    // The HP price is the caster's alone.
    expect(unit(fed.state, MATE).hp).toBe(mateHp);
  });

  it("refuses when nothing adjacent is still being fed", () => {
    const cut = act(bench(), "cut-the-feed", "north-bus");
    expect(cut.error).toBeNull();
    expect(actSelf(nextTurn(cut.state), "backfeed").error?.code).toBe("requirement-unmet");
  });
});

/**
 * FLUX_GRID §6.4's third formula case: the same Overdraw against the same bus,
 * with and without the licence. The west bench carries 6 of 12, so +8 blows it
 * and +6 sits exactly on the rating.
 */
describe("Rated Draw", () => {
  it("takes 2 off every load she hangs, and the bus that was blown survives", () => {
    const blown = act(bench(), "overdraw", "north-bus");
    expect(of(blown.events, "LoadAttached")).toMatchObject([{ amount: 8 }]);
    expect(of(blown.events, "GridTripped")).toMatchObject([{ capacity: 12, load: 14 }]);
    expect(live(blown.state)).toEqual(EAST_BRANCH);

    const rated = act(bench({ make: licensed }), "overdraw", "north-bus");
    expect(of(rated.events, "LoadAttached")).toMatchObject([{ amount: 6 }]);
    expect(of(rated.events, "GridTripped")).toEqual([]);
    expect(grid(rated.state).load).toBe(16);
    expect(live(rated.state)).toEqual(WHOLE_BENCH);
  });

  it("lightens her Backfeed too, so the gift stops costing the floor she stands on", () => {
    const greedy = actSelf(drain(bench(), HAND), "backfeed");
    expect(of(greedy.events, "LoadAttached")).toMatchObject([{ amount: 6 }]);

    const rated = actSelf(drain(bench({ make: licensed }), HAND), "backfeed");
    expect(of(rated.events, "LoadAttached")).toMatchObject([{ amount: 4 }]);
    // The charge she takes is untouched; only what it hangs on the bus is.
    expect(unit(rated.state, HAND).charge).toBe(20);
    expect(grid(rated.state).load).toBe(14);
  });

  it("floors at zero rather than crediting the bus", () => {
    const base = benchContent();
    const support = base.abilities["rated-draw"] as Extract<Ability, { slot: "support" }>;
    const content: ContentLibrary = {
      ...base,
      abilities: { ...base.abilities, "rated-draw": { ...support, passive: { gridLoadReduction: 40 } } },
    };
    const rated = act(bench({ make: licensed, content }), "overdraw", "north-bus");
    expect(of(rated.events, "LoadAttached")).toMatchObject([{ amount: 0 }]);
    expect(grid(rated.state).load).toBe(10);
  });
});

describe("Cut the Feed and Field Splice", () => {
  it("cuts a span dark and splices it back", () => {
    const cut = act(bench(), "cut-the-feed", "north-bus");
    expect(cut.error).toBeNull();
    expect(of(cut.events, "LineSevered")).toMatchObject([{ objectId: "north-bus", unitId: HAND }]);
    expect(live(cut.state)).toEqual([...EAST_BRANCH, "west-bus", "west-main"].sort());

    const spliced = step(cut.state, "field-splice", "north-bus");
    expect(of(spliced.events, "LineSpliced")).toMatchObject([{ objectId: "north-bus", unitId: HAND }]);
    expect(live(spliced.state)).toEqual(WHOLE_BENCH);
  });

  it("both take a line and nothing else", () => {
    const state = bench();
    for (const abilityId of ["cut-the-feed", "field-splice"]) {
      expect(act(state, abilityId, "press-west").error?.code, abilityId).toBe("requirement-unmet");
      expect(act(state, abilityId, "gallery-tie").error?.code, abilityId).toBe("requirement-unmet");
    }
  });
});

describe("Reroute", () => {
  it("opens a closed tie and splits the bus", () => {
    const dark = act(bench(), "throw-the-breaker", "west-main");
    const tied = step(dark.state, "cross-tie", "gallery-tie");
    const split = step(tied.state, "reroute", "gallery-tie");
    expect(getObject(split.state, "gallery-tie")?.powered).toBe(false);
    expect(live(split.state)).toEqual(EAST_BRANCH);
  });

  it("takes a breaker and nothing else", () => {
    expect(act(bench(), "reroute", "north-bus").error?.code).toBe("requirement-unmet");
  });
});
