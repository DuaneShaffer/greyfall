/**
 * The grid counters, measured on a bench encounter authored here. Of the shipped
 * maps only the Meter House declares a grid, and none of the five slice maps do
 * (`docs/design/FLUX_GRID.md` §1.6), so the only way to prove the counters move
 * across a whole battle is to build a network and play it.
 *
 *     bench-main --- bench-bus --- bench-press
 *                        |
 *                    bench-tie (normally open) --- bench-spur --- bench-lamp
 *
 * The main is rated 6 and the press draws 4. Closing the tie is free; closing the
 * lamp's isolator on top of it draws 8 against 6 and blows the main.
 */

import { describe, expect, it } from "vitest";
import {
  activeTurnState,
  turnNumber,
  type Command,
  type ContentLibrary,
  type GameState,
} from "../../src/core/index.js";
import type { Ability, Encounter, GameMap, MapObject, Tile, Unit } from "../../src/data/index.js";
import { THRESHOLDS, objectiveCounters, objectiveFindings } from "../../src/sim/analysis.js";
import { runBattle, type BattleRecord } from "../../src/sim/harness.js";
import { simContent } from "../../src/sim/content.js";
import { encounterRuns, type SweepBattle } from "../../src/sim/sweeps.js";

const MAP_ID = "sim-grid-bench";
const DARK_MAP_ID = "sim-grid-bench-dark";
const GRID_ID = "sim-bench-grid";
const CONTESTED_ID = "e-sim-grid-contested";
const DARK_ID = "e-sim-grid-dark";
const CUTTER = "sim-grid-cutter";

interface ObjectSpec {
  id: string;
  x: number;
  powered: boolean;
  operable?: boolean;
}

const OBJECTS: ObjectSpec[] = [
  { id: "bench-main", x: 1, powered: true },
  { id: "bench-bus", x: 2, powered: true },
  { id: "bench-press", x: 3, powered: true, operable: true },
  { id: "bench-tie", x: 4, powered: false },
  { id: "bench-spur", x: 5, powered: true },
  { id: "bench-lamp", x: 6, powered: false },
];

function benchObject(spec: ObjectSpec, powered: boolean): MapObject {
  return {
    id: spec.id,
    kind: "machine",
    name: spec.id,
    spriteId: "machine",
    tiles: [{ x: spec.x, y: 1 }],
    blocksMovement: false,
    blocksLos: false,
    integrity: { destructible: false },
    powered,
    network: GRID_ID,
    operable:
      spec.operable === true
        ? {
            requiresPower: true,
            targetObjectIds: [],
            targetTiles: [],
            effects: [{ kind: "heal", amount: { base: "fixed", power: 1 } }],
          }
        : null,
  };
}

/** `live: false` opens the main's isolator, so the whole network starts dead. */
function benchMap(id: string, live: boolean): GameMap {
  const size = 12;
  const tiles: Tile[] = Array.from({ length: size * size }, () => ({ height: 0, terrain: "plain" as const }));
  return {
    schemaVersion: 1,
    id,
    name: id,
    width: size,
    depth: size,
    tiles,
    objects: OBJECTS.map((spec) => benchObject(spec, spec.id === "bench-main" ? live : spec.powered)),
    deploymentTiles: [
      { x: 0, y: 0 },
      { x: 0, y: 2 },
    ],
    grids: [
      {
        id: GRID_ID,
        name: "Bench Grid",
        kind: "flux",
        nodes: [
          { role: "source", objectId: "bench-main", capacity: 6 },
          { role: "line", objectId: "bench-bus" },
          { role: "sink", objectId: "bench-press", draw: 4 },
          { role: "breaker", objectId: "bench-tie" },
          { role: "line", objectId: "bench-spur" },
          { role: "sink", objectId: "bench-lamp", draw: 4 },
        ],
        edges: [
          { a: "bench-bus", b: "bench-main" },
          { a: "bench-bus", b: "bench-press" },
          { a: "bench-bus", b: "bench-tie" },
          { a: "bench-spur", b: "bench-tie" },
          { a: "bench-lamp", b: "bench-spur" },
        ],
      },
    ],
  };
}

function gridAbility(id: string, mode: "sever" | "splice"): Ability {
  return {
    schemaVersion: 1,
    id,
    name: id,
    description: `Bench: ${id}.`,
    jobId: "conduit",
    standingCost: 0,
    slot: "action",
    targeting: {
      range: { min: 0, max: 24, vertical: 24 },
      area: { shape: "single" },
      requiresLos: false,
      validTargets: ["object"],
    },
    requires: ["targetLine"],
    chargeCost: 0,
    castSpeed: null,
    effects: [{ kind: "severLine", mode }],
  };
}

const ABILITIES: Ability[] = [gridAbility("sim-bench-cut", "sever"), gridAbility("sim-bench-splice", "splice")];

function benchUnit(id: string, jobId: string): Unit {
  return {
    schemaVersion: 1,
    id,
    name: id,
    level: 3,
    jobId,
    disposition: { resolve: 50, attunement: 60 },
    learnedAbilityIds: ABILITIES.map((a) => a.id),
    equipment: {},
  };
}

const PARTY: Unit[] = [benchUnit(CUTTER, "conduit"), benchUnit("sim-grid-mate", "conduit")];

const DEPLOYMENT = [
  { unitId: CUTTER, position: { x: 0, y: 0 } },
  { unitId: "sim-grid-mate", position: { x: 0, y: 2 } },
];

function benchEncounter(id: string, mapId: string, triggers: Encounter["triggers"]): Encounter {
  return {
    schemaVersion: 1,
    id,
    name: id,
    mapId,
    rngSeed: 7,
    maxDeployedUnits: 2,
    enemies: [
      { unit: benchUnit("sim-grid-foe", "enforcer"), team: "enemy", position: { x: 11, y: 11 }, facing: "north" },
    ],
    winConditions: [{ kind: "rout" }],
    lossConditions: [{ kind: "partyRout" }],
    triggers,
  };
}

/**
 * Everything the scripted verbs cannot reach goes through triggers, which the
 * harness attributes to `scripted` exactly as an encounter beat.
 */
const CONTESTED_TRIGGERS: Encounter["triggers"] = [
  { id: "close-tie", when: { kind: "turnStart", turn: 2 }, once: true, actions: [{ kind: "setPower", objectId: "bench-tie", powered: true }] },
  { id: "close-lamp", when: { kind: "turnStart", turn: 4 }, once: true, actions: [{ kind: "setPower", objectId: "bench-lamp", powered: true }] },
  {
    id: "reclose-main",
    when: { kind: "turnStart", turn: 6 },
    once: true,
    actions: [
      { kind: "setPower", objectId: "bench-lamp", powered: false },
      { kind: "setPower", objectId: "bench-main", powered: true },
    ],
  },
  { id: "open-tie", when: { kind: "turnStart", turn: 8 }, once: true, actions: [{ kind: "setPower", objectId: "bench-tie", powered: false }] },
];

function benchLibrary(): ContentLibrary {
  const base = simContent().library;
  return {
    ...base,
    abilities: { ...base.abilities, ...Object.fromEntries(ABILITIES.map((a) => [a.id, a])) },
    maps: { ...base.maps, [MAP_ID]: benchMap(MAP_ID, true), [DARK_MAP_ID]: benchMap(DARK_MAP_ID, false) },
    encounters: {
      ...base.encounters,
      [CONTESTED_ID]: benchEncounter(CONTESTED_ID, MAP_ID, CONTESTED_TRIGGERS),
      [DARK_ID]: benchEncounter(DARK_ID, DARK_MAP_ID, []),
    },
  };
}

/** Cut the bus on the cutter's first turn past `from`, splice it on the next. */
function cutThenSplice(from: number): (state: GameState) => Command | null {
  let cut = false;
  let spliced = false;
  return (state) => {
    const turn = activeTurnState(state);
    if (turn === null || turn.acted || turn.unitId !== CUTTER || turnNumber(state) < from) return null;
    if (!cut) {
      cut = true;
      return { kind: "act", unitId: CUTTER, abilityId: "sim-bench-cut", target: { kind: "object", objectId: "bench-bus" } };
    }
    if (!spliced) {
      spliced = true;
      return { kind: "act", unitId: CUTTER, abilityId: "sim-bench-splice", target: { kind: "object", objectId: "bench-bus" } };
    }
    return null;
  };
}

function tagged(record: BattleRecord): SweepBattle {
  return {
    tags: {
      sweep: "grid-bench",
      variant: "baseline",
      weights: "shipped",
      map: record.mapId,
      level: 3,
      player: "party-bench",
      enemy: record.encounterId,
    },
    record,
  };
}

function playBench(library: ContentLibrary, encounterId: string, seeds: readonly number[], scripted: boolean): SweepBattle[] {
  return seeds.map((seed) =>
    tagged(
      runBattle(library, { kind: "encounter", encounterId, party: PARTY, deployment: DEPLOYMENT }, seed, {
        commandCap: 400,
        ...(scripted ? { chooser: cutThenSplice(9) } : {}),
      }),
    ),
  );
}

describe("grid telemetry", () => {
  const library = benchLibrary();

  it("counts every way a side moves the graph", () => {
    const battles = playBench(library, CONTESTED_ID, [101], true);
    const record = battles[0]!.record;
    const c = record.counters;
    expect(record.turns).toBeGreaterThan(12);

    expect(c.gridIds).toEqual([GRID_ID]);
    expect(c.tiesThrown.scripted).toBe(2);
    expect(c.gridTrips.scripted).toBe(1);
    expect(c.gridResets.scripted).toBe(1);
    expect(c.linesCut.player).toBe(1);
    expect(c.linesSpliced.player).toBe(1);
    expect(c.gridPowerChanges.player + c.gridPowerChanges.scripted).toBeGreaterThan(0);

    // Headroom is sampled once per grid per unit turn: 33% while the press is the
    // only load on a main rated 6, 0 across the window the main is latched open.
    const sample = c.headroomByGrid[GRID_ID]!;
    expect(sample.samples).toBe(record.turns);
    expect(sample.totalPercent).toBeGreaterThan(0);
    expect(sample.totalPercent).toBeLessThan(33 * sample.samples);

    expect(c.turnsWithEnergizedMachine).toBeGreaterThan(0);
    expect(c.turnsWithEnergizedMachine).toBeLessThanOrEqual(c.turnsWithPoweredMachine);
    expect(c.turnsDark).toBeGreaterThan(0);
    expect(c.firstDarkTurn).toBe(4);

    const report = objectiveCounters(battles);
    expect(report.runsWithGrid).toBe(1);
    expect(report.gridIds).toEqual([GRID_ID]);
    expect(report.tiesThrown.total).toBe(2);
    expect(report.gridTrips.total).toBe(1);
    expect(report.gridResets.total).toBe(1);
    expect(report.linesCut.total).toBe(1);
    expect(report.linesSpliced.total).toBe(1);
    expect(report.meanHeadroomPercent[GRID_ID]).toBeGreaterThan(0);
    expect(report.meanHeadroomPercent[GRID_ID]).toBeLessThan(33);
    expect(report.energizedMachineTurnShare).toBeGreaterThan(0);

    const codes = objectiveFindings(library, battles).map((f) => f.code);
    expect(codes).not.toContain("grid-never-contested");
    expect(codes).not.toContain("grid-never-restored");
    expect(codes).not.toContain("grid-dark-by-turn-N");
  });

  it("agrees with the event stream it was built from", () => {
    const record = runBattle(
      library,
      { kind: "encounter", encounterId: CONTESTED_ID, party: PARTY, deployment: DEPLOYMENT },
      101,
      { commandCap: 400, keepEvents: true, chooser: cutThenSplice(9) },
    );
    const events = record.events!;
    const count = (type: string) => events.filter((e) => e.type === type).length;
    const total = (t: { player: number; enemy: number; neutral: number; scripted: number }) =>
      t.player + t.enemy + t.neutral + t.scripted;

    expect(total(record.counters.gridTrips)).toBe(count("GridTripped"));
    expect(total(record.counters.gridResets)).toBe(count("GridReset"));
    expect(total(record.counters.linesCut)).toBe(count("LineSevered"));
    expect(total(record.counters.linesSpliced)).toBe(count("LineSpliced"));
    expect(total(record.counters.gridPowerChanges)).toBe(
      events.filter((e) => e.type === "PowerChanged" && e.cause !== undefined).length,
    );
  });

  it("raises the dark flag when a network is left feeding nothing", () => {
    const battles = playBench(library, DARK_ID, [101, 202, 303], false);
    expect(battles.length).toBeGreaterThanOrEqual(THRESHOLDS.gridDarkMinRuns);
    for (const battle of battles) {
      expect(battle.record.counters.firstDarkTurn).toBe(1);
      expect(battle.record.counters.turnsWithEnergizedMachine).toBe(0);
    }

    const report = objectiveCounters(battles);
    expect(report.runsGridDark).toBe(battles.length);
    expect(report.darkByTurn).toBe(1);
    expect(report.meanHeadroomPercent[GRID_ID]).toBe(0);

    const findings = objectiveFindings(library, battles);
    const dark = findings.find((f) => f.code === "grid-dark-by-turn-N");
    expect(dark?.severity).toBe(1);
    expect(dark?.detail).toContain("by turn 1");
    expect(findings.map((f) => f.code)).toContain("grid-never-contested");
    expect(findings.map((f) => f.code)).not.toContain("grid-never-restored");
  });

  it("is silent and zero on a slice map, which declares no grid", () => {
    const battles = encounterRuns(simContent(), ["e2-foundry-floor-nine"], [101], { commandCap: 4000 });
    const c = battles[0]!.record.counters;
    expect(c.gridIds).toEqual([]);
    expect(c.headroomByGrid).toEqual({});
    expect(c.turnsDark).toBe(0);
    expect(c.firstDarkTurn).toBeNull();
    expect(c.turnsWithEnergizedMachine).toBe(0);
    expect(c.turnsWithPoweredMachine).toBeGreaterThan(0);
    for (const tally of [c.gridTrips, c.gridResets, c.linesCut, c.linesSpliced, c.tiesThrown, c.gridPowerChanges]) {
      expect(tally).toEqual({ player: 0, enemy: 0, neutral: 0, scripted: 0 });
    }

    const report = objectiveCounters(battles);
    expect(report.runsWithGrid).toBe(0);
    expect(report.runsGridDark).toBe(0);
    expect(report.darkByTurn).toBeNull();
    expect(report.meanHeadroomPercent).toEqual({});
    expect(report.energizedMachineTurnShare).toBe(0);

    const codes = objectiveFindings(simContent().library, battles).map((f) => f.code);
    for (const code of ["grid-never-contested", "grid-dark-by-turn-N", "grid-never-restored"]) {
      expect(codes).not.toContain(code);
    }
  });
});
