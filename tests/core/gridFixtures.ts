/**
 * A grid-native test bench. The five slice maps declare no grid — only the Meter
 * House does — so the engine's graph behaviour is exercised against a map
 * authored here:
 *
 *     west-main --- west-bus --- north-bus --- press-west
 *                                    |   \
 *                                lift-deck  gallery-tie (normally open)
 *                                                 |
 *     east-main --- east-bus ---------------- (tie)
 *                       \--- press-east
 *
 * West carries 6 against a rating of 12; east carries 4 against 10. Overdraw
 * (+8) trips the west bus on its own and does not trip it once the gallery tie
 * has brought the east main onto it — §1.7's convention as a fixture.
 */

import type { Ability, Encounter, GameMap, MapObject, Tile, Unit } from "../../src/data/index.js";
import type { ContentLibrary } from "../../src/core/index.js";
import { loadContent } from "./fixtures.js";

export const BENCH_MAP_ID = "grid-bench";
export const BENCH_ENCOUNTER_ID = "e-grid-bench";
export const BENCH_GRID_ID = "bench-grid";

interface ObjectSpec {
  id: string;
  x: number;
  y: number;
  powered: boolean;
  hp?: number;
  surfaceHeight?: number;
  operable?: boolean;
}

function benchObject(spec: ObjectSpec): MapObject {
  return {
    id: spec.id,
    kind: "machine",
    name: spec.id,
    spriteId: "machine",
    tiles: [{ x: spec.x, y: spec.y }],
    blocksMovement: false,
    blocksLos: false,
    ...(spec.surfaceHeight === undefined ? {} : { surfaceHeight: spec.surfaceHeight }),
    integrity: spec.hp === undefined ? { destructible: false } : { destructible: true, hp: spec.hp },
    powered: spec.powered,
    network: BENCH_GRID_ID,
    operable:
      spec.operable === true
        ? { requiresPower: true, targetObjectIds: [], targetTiles: [], effects: [{ kind: "heal", amount: { base: "fixed", power: 1 } }] }
        : null,
  };
}

const OBJECTS: ObjectSpec[] = [
  { id: "west-main", x: 1, y: 1, powered: true },
  { id: "west-bus", x: 2, y: 1, powered: true },
  { id: "north-bus", x: 3, y: 1, powered: true, hp: 10 },
  { id: "press-west", x: 4, y: 1, powered: true, operable: true },
  { id: "lift-deck", x: 3, y: 2, powered: true, surfaceHeight: 2 },
  { id: "gallery-tie", x: 4, y: 2, powered: false },
  { id: "east-bus", x: 5, y: 1, powered: true },
  { id: "east-main", x: 6, y: 1, powered: true },
  { id: "press-east", x: 5, y: 2, powered: true, operable: true },
];

export function benchMap(): GameMap {
  const size = 12;
  const tiles: Tile[] = Array.from({ length: size * size }, () => ({ height: 0, terrain: "plain" as const }));
  return {
    schemaVersion: 1,
    id: BENCH_MAP_ID,
    name: "Grid Bench",
    width: size,
    depth: size,
    tiles,
    objects: OBJECTS.map(benchObject),
    // Beside `press-west`, so a unit can reach its controls without walking.
    deploymentTiles: [
      { x: 4, y: 0 },
      { x: 0, y: 1 },
    ],
    grids: [
      {
        id: BENCH_GRID_ID,
        name: "Bench Grid",
        kind: "flux",
        nodes: [
          { role: "source", objectId: "west-main", capacity: 12 },
          { role: "source", objectId: "east-main", capacity: 10 },
          { role: "line", objectId: "west-bus" },
          { role: "line", objectId: "north-bus" },
          { role: "line", objectId: "east-bus" },
          { role: "breaker", objectId: "gallery-tie" },
          { role: "sink", objectId: "press-west", draw: 4 },
          { role: "sink", objectId: "press-east", draw: 4 },
          { role: "sink", objectId: "lift-deck", draw: 2 },
        ],
        edges: [
          { a: "west-bus", b: "west-main" },
          { a: "north-bus", b: "west-bus" },
          { a: "north-bus", b: "press-west" },
          { a: "lift-deck", b: "north-bus" },
          { a: "east-bus", b: "east-main" },
          { a: "east-bus", b: "press-east" },
          { a: "gallery-tie", b: "north-bus" },
          { a: "east-bus", b: "gallery-tie" },
        ],
      },
    ],
  };
}

const REACH: Extract<Ability, { slot: "action" }>["targeting"] = {
  range: { min: 0, max: 9, vertical: 9 },
  area: { shape: "single" },
  requiresLos: false,
  validTargets: ["object"],
};

function benchAbility(
  id: string,
  effects: Extract<Ability, { slot: "action" }>["effects"],
  requires?: Extract<Ability, { slot: "action" }>["requires"],
): Ability {
  return {
    schemaVersion: 1,
    id,
    name: id,
    description: `Bench: ${id}.`,
    jobId: "conduit",
    standingCost: 0,
    slot: "action",
    targeting: REACH,
    ...(requires === undefined ? {} : { requires }),
    chargeCost: 0,
    castSpeed: null,
    effects,
  };
}

export const GRID_ABILITIES: Ability[] = [
  benchAbility("bench-cut", [{ kind: "severLine", mode: "sever" }], ["targetLine"]),
  benchAbility("bench-splice", [{ kind: "severLine", mode: "splice" }], ["targetLine"]),
  benchAbility("bench-overdraw", [{ kind: "addLoad", amount: 8, durationTurns: 3 }], ["targetEnergized"]),
  benchAbility("bench-reclose", [{ kind: "setPower", mode: "on" }], ["targetSource"]),
  benchAbility("bench-cross-tie", [{ kind: "setPower", mode: "toggle" }], ["targetBreaker"]),
  benchAbility("bench-isolate", [{ kind: "setPower", mode: "off" }]),
  benchAbility("bench-close", [{ kind: "setPower", mode: "on" }]),
  benchAbility("bench-demolish", [{ kind: "damageObject", amount: { base: "fixed", power: 30 } }]),
  // Downs the caster outright, so a load can be watched dying with the unit that hung it.
  {
    ...(benchAbility("bench-immolate", [
      { kind: "damage", damageType: "thermal", amount: { base: "fixed", power: 999 } },
    ]) as Extract<Ability, { slot: "action" }>),
    targeting: {
      range: { min: 0, max: 0, vertical: 0 },
      area: { shape: "single" },
      requiresLos: false,
      validTargets: ["self"],
    },
  },
];

export const GRID_ABILITY_IDS = GRID_ABILITIES.map((a) => a.id);

export function benchUnit(id: string, jobId = "conduit"): Unit {
  return {
    schemaVersion: 1,
    id,
    name: id,
    spriteId: jobId,
    level: 3,
    jobId,
    disposition: { resolve: 50, attunement: 60 },
    learnedAbilityIds: [...GRID_ABILITY_IDS],
    equipment: {},
  };
}

export function benchEncounter(): Encounter {
  return {
    schemaVersion: 1,
    id: BENCH_ENCOUNTER_ID,
    name: "Grid Bench",
    mapId: BENCH_MAP_ID,
    rngSeed: 7,
    maxDeployedUnits: 2,
    enemies: [
      {
        unit: benchUnit("bench-foe", "enforcer"),
        team: "enemy",
        position: { x: 11, y: 11 },
        facing: "north",
      },
    ],
    winConditions: [{ kind: "rout" }],
    lossConditions: [{ kind: "partyRout" }],
    triggers: [],
  };
}

/** Shipped content plus the bench map, its encounter, and the grid verbs. */
export function benchContent(): ContentLibrary {
  const base = loadContent();
  return {
    ...base,
    abilities: { ...base.abilities, ...Object.fromEntries(GRID_ABILITIES.map((a) => [a.id, a])) },
    maps: { ...base.maps, [BENCH_MAP_ID]: benchMap() },
    encounters: { ...base.encounters, [BENCH_ENCOUNTER_ID]: benchEncounter() },
  };
}
