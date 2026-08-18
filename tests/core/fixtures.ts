import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  Ability,
  Encounter,
  GameMap,
  Item,
  Job,
  Status,
  Unit,
  type TileCoord,
} from "../../src/data/index.js";
import { activeUnit, applyCommand, type ContentLibrary, type GameState } from "../../src/core/index.js";

const DATA_DIR = join(import.meta.dirname, "..", "..", "data");

// Parsed through the schemas rather than cast, the way `src/app` and `src/sim`
// load: schema defaults (a map's `grids`) are part of what shipped content means.
function loadDir<T extends { id: string }>(
  kind: string,
  schema: { parse: (value: unknown) => T },
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const file of readdirSync(join(DATA_DIR, kind)).sort()) {
    const parsed = schema.parse(JSON.parse(readFileSync(join(DATA_DIR, kind, file), "utf8")));
    out[parsed.id] = parsed;
  }
  return out;
}

/** The shipped content in `data/`, loaded straight off disk. */
export function loadContent(): ContentLibrary {
  return {
    jobs: loadDir("jobs", Job),
    abilities: loadDir("abilities", Ability),
    items: loadDir("items", Item),
    statuses: loadDir("statuses", Status),
    maps: loadDir("maps", GameMap),
    encounters: loadDir("encounters", Encounter),
  };
}

/** Party roster units from `data/units/`, which are not part of ContentLibrary. */
export function loadUnits(): Record<string, Unit> {
  return loadDir("units", Unit);
}

export function rowen(): Unit {
  const unit = loadUnits()["rowen"];
  if (unit === undefined) throw new Error("missing data/units/rowen.json");
  return unit;
}

export const YARD_MAP_ID = "marshaling-yard";
export const YARD_ENCOUNTER_ID = "e1-marshaling-yard";

/** A Conduit strong enough to overload the yard cell in one cast. */
export const VALE: Unit = {
  schemaVersion: 1,
  id: "vale",
  name: "Vale Tarn",
  level: 1,
  jobId: "conduit",
  disposition: { resolve: 50, attunement: 70 },
  learnedAbilityIds: ["overload-cell", "rig-burst", "surge", "arc", "tap", "patch", "shove", "frame", "jolt", "siphon", "kettle", "lance"],
  equipment: {},
};

/** An Enforcer with a reaction slotted, for reaction-rate coverage. */
export function enforcer(id: string, name: string, extra: Partial<Unit> = {}): Unit {
  return {
    schemaVersion: 1,
    id,
    name,
    level: 1,
    jobId: "enforcer",
    disposition: { resolve: 60, attunement: 40 },
    learnedAbilityIds: ["pin"],
    equipment: { weapon: "shock-maul" },
    ...extra,
  };
}

/** Test-only status: the Haste analog, for `ctMultiplierPercent` coverage. */
export const SURGED: Status = {
  schemaVersion: 1,
  id: "surged",
  name: "Surged",
  description: "Grafts running hot; the body keeps pace with the flux.",
  category: "buff",
  duration: { kind: "untilRemoved" },
  hooks: { ctMultiplierPercent: 150 },
};

export const SURGE: Ability = {
  schemaVersion: 1,
  id: "surge",
  name: "Surge",
  description: "Dump carried charge into your own graft lines.",
  jobId: "conduit",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 0, max: 1, vertical: 0 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["self"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [{ kind: "applyStatus", statusId: "surged", chance: 100 }],
};

export const ARC: Ability = {
  schemaVersion: 1,
  id: "arc",
  name: "Arc",
  description: "Jump charge across the gap and let it find the ground.",
  jobId: "conduit",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 1, max: 3, vertical: 2 },
    area: { shape: "single" },
    requiresLos: true,
    validTargets: ["enemy"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [{ kind: "damage", damageType: "arc", amount: { base: "mag", power: 8 } }],
};

export const RIPOSTE: Ability = {
  schemaVersion: 1,
  id: "riposte",
  name: "Riposte",
  description: "Answer a blow with the maul's return swing.",
  jobId: "enforcer",
  standingCost: 0,
  slot: "reaction",
  trigger: "damaged",
  effects: [{ kind: "damage", damageType: "kinetic", amount: { base: "weapon", power: 50 } }],
};


function action(
  id: string,
  name: string,
  targeting: Extract<Ability, { slot: "action" }>["targeting"],
  effects: Extract<Ability, { slot: "action" }>["effects"],
): Ability {
  return {
    schemaVersion: 1,
    id,
    name,
    description: `Bench rig: ${name}.`,
    jobId: "conduit",
    standingCost: 0,
    slot: "action",
    targeting,
    chargeCost: 0,
    castSpeed: null,
    effects,
  };
}

const reach = (max: number, validTargets: Extract<Ability, { slot: "action" }>["targeting"]["validTargets"]) => ({
  range: { min: 1, max, vertical: 3 },
  area: { shape: "single" as const },
  requiresLos: false,
  validTargets,
});

/** Test-only abilities covering the effect kinds and AoE shapes content lacks. */
export const BENCH_ABILITIES: Ability[] = [
  action("tap", "Tap", reach(3, ["object"]), [
    { kind: "damageObject", amount: { base: "fixed", power: 5 } },
  ]),
  {
    ...(action("rig-burst", "Rig Burst", reach(4, ["object"]), [
      { kind: "damageObject", amount: { base: "fixed", power: 25 } },
    ]) as Extract<Ability, { slot: "action" }>),
    chargeCost: 5,
    castSpeed: 25,
  },
  action("patch", "Patch", reach(3, ["object"]), [
    { kind: "repairObject", amount: { base: "fixed", power: 3 } },
  ]),
  action("shove", "Shove", reach(1, ["enemy"]), [
    { kind: "forceMove", direction: "push", distance: 2 },
  ]),
  action("frame", "Sentry Frame", reach(1, ["emptyTile"]), [
    { kind: "spawnObject", object: "turret", hp: 12 },
  ]),
  action("jolt", "Jolt", reach(3, ["enemy"]), [
    { kind: "damage", damageType: "arc", amount: { base: "fixed", power: 40 } },
  ]),
  action("siphon", "Siphon", reach(1, ["enemy"]), [
    { kind: "modifyCharge", amount: -5, siphonToActor: true },
  ]),
  {
    ...action("kettle", "Kettle", reach(3, ["emptyTile", "enemy", "ally"]), [
      { kind: "damage", damageType: "chemical", amount: { base: "fixed", power: 1 } },
    ]),
    targeting: {
      range: { min: 1, max: 3, vertical: 3 },
      area: { shape: "radius", size: 1, vertical: 1 },
      requiresLos: false,
      validTargets: ["emptyTile", "enemy", "ally"],
    },
  } as Ability,
  {
    ...action("lance", "Lance", reach(3, ["emptyTile", "enemy", "ally"]), [
      { kind: "damage", damageType: "kinetic", amount: { base: "fixed", power: 1 } },
    ]),
    targeting: {
      range: { min: 1, max: 3, vertical: 3 },
      area: { shape: "line", length: 3 },
      requiresLos: false,
      validTargets: ["emptyTile", "enemy", "ally"],
    },
  } as Ability,
];

export const BENCH_ABILITY_IDS = BENCH_ABILITIES.map((a) => a.id);

export interface EncounterOverrides {
  id: string;
  rngSeed?: number;
  enemies: Encounter["enemies"];
  enemySatchel?: Encounter["enemySatchel"];
  winConditions?: Encounter["winConditions"];
  lossConditions?: Encounter["lossConditions"];
  triggers?: Encounter["triggers"];
}

/** Build an in-memory encounter on the shipped Marshaling Yard map. */
export function yardEncounter(base: ContentLibrary, o: EncounterOverrides): Encounter {
  const original = base.encounters[YARD_ENCOUNTER_ID];
  if (original === undefined) throw new Error("missing e1-marshaling-yard");
  return {
    schemaVersion: 1,
    id: o.id,
    name: o.id,
    mapId: YARD_MAP_ID,
    rngSeed: o.rngSeed ?? 1001,
    maxDeployedUnits: 4,
    enemies: o.enemies,
    ...(o.enemySatchel === undefined ? {} : { enemySatchel: o.enemySatchel }),
    winConditions: o.winConditions ?? [{ kind: "rout" }],
    lossConditions: o.lossConditions ?? [{ kind: "partyRout" }],
    triggers: o.triggers ?? structuredClone(original.triggers),
  };
}

export function enemyAt(unit: Unit, position: TileCoord, facing: Encounter["enemies"][number]["facing"]) {
  return { unit, team: "enemy" as const, position, facing };
}

/** `loadContent()` plus the test-only status, abilities, and encounters. */
export function testContent(encounters: Encounter[] = []): ContentLibrary {
  const base = loadContent();
  const extraEncounters: Record<string, Encounter> = { ...base.encounters };
  for (const enc of encounters) extraEncounters[enc.id] = enc;
  return {
    ...base,
    abilities: {
      ...base.abilities,
      surge: SURGE,
      riposte: RIPOSTE,
      arc: ARC,
      ...Object.fromEntries(BENCH_ABILITIES.map((a) => [a.id, a])),
    },
    statuses: { ...base.statuses, surged: SURGED },
    encounters: extraEncounters,
  };
}

/** Pass turns until `unitId` is the active unit. */
export function advanceTo(state: GameState, unitId: string, maxTurns = 40): GameState {
  let current = state;
  for (let i = 0; i < maxTurns; i += 1) {
    const active = activeUnit(current);
    if (active === null || active.id === unitId) return current;
    const result = applyCommand(current, { kind: "endTurn", unitId: active.id });
    if (result.error !== null) throw new Error(result.error.message);
    current = result.state;
  }
  throw new Error(`${unitId} never got a turn`);
}

export function coordEq(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function hasTile(tiles: readonly TileCoord[], c: TileCoord): boolean {
  return tiles.some((t) => coordEq(t, c));
}
