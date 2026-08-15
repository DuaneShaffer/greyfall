import { describe, expect, it } from "vitest";
import type { Ability, Encounter, Facing, Team, TileCoord, Unit } from "../../src/data/index.js";
import {
  applyCommand,
  createBattle,
  getObject,
  getUnit,
  type ContentLibrary,
  type GameState,
  type TargetRef,
} from "../../src/core/index.js";
import { buildContext } from "../../src/core/ai/index.js";
import { tileHazard } from "../../src/core/ai/context.js";
import type { BattleEvent } from "../../src/core/events/types.js";
import { advanceTo, enforcer, testContent, yardEncounter } from "./fixtures.js";

/** A tripwire charge that actually goes off: 15 kinetic to whatever steps on it. */
const LAY_MINE: Ability = {
  schemaVersion: 1,
  id: "lay-mine",
  name: "Lay Mine",
  description: "A pressure charge seated in the deck plate.",
  jobId: "machinist",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 1, max: 3, vertical: 2 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["emptyTile"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [
    {
      kind: "spawnObject",
      object: "mine",
      hp: 8,
      onContact: {
        effects: [{ kind: "damage", damageType: "kinetic", amount: { base: "fixed", power: 15 } }],
      },
    },
  ],
};

/** A sentry frame that actually shoots: 9 kinetic at three tiles, once a tick. */
const LAY_TURRET: Ability = {
  ...LAY_MINE,
  id: "lay-turret",
  name: "Lay Turret",
  effects: [
    {
      kind: "spawnObject",
      object: "turret",
      hp: 24,
      attack: {
        amount: { base: "fixed", power: 9 },
        damageType: "kinetic",
        range: { min: 1, max: 3, vertical: 2 },
        speed: 100,
      },
    },
  ],
};

/** Bench shove: pushes a hostile two tiles away from the caster. */
const SHOVE = "shove";

function content(encounters: Encounter[] = []): ContentLibrary {
  const base = testContent(encounters);
  return { ...base, abilities: { ...base.abilities, "lay-mine": LAY_MINE, "lay-turret": LAY_TURRET } };
}

function sapper(id: string, learned: string[], extra: Partial<Unit> = {}): Unit {
  return enforcer(id, id, { learnedAbilityIds: [...learned, SHOVE], ...extra });
}

function at(unit: Unit, team: Team, position: TileCoord, facing: Facing = "north") {
  return { unit, team, position, facing };
}

function battle(id: string, placements: Encounter["enemies"]): GameState {
  const encounter = yardEncounter(content(), { id, enemies: placements, triggers: [] });
  return createBattle(content([encounter]), id, [], []).state;
}

function act(state: GameState, unitId: string, abilityId: string, target: TargetRef): GameState {
  const result = applyCommand(state, { kind: "act", unitId, abilityId, target });
  if (result.error !== null) throw new Error(`${abilityId}: ${result.error.message}`);
  return result.state;
}

describe("mines", () => {
  it("detonates under a unit that walks onto it and destroys itself", () => {
    let state = advanceTo(
      battle("e-mine-walk", [
        at(sapper("layer", ["lay-mine"]), "player", { x: 1, y: 4 }),
        at(sapper("walker", []), "enemy", { x: 3, y: 4 }),
      ]),
      "layer",
    );
    state = act(state, "layer", "lay-mine", { kind: "tile", tile: { x: 2, y: 4 } });
    const mine = state.map.objects.find((o) => o.def.kind === "mine");
    expect(mine?.owner).toBe("player");
    expect(mine?.def.onContact).toBeDefined();

    state = advanceTo(applyCommand(state, { kind: "endTurn", unitId: "layer" }).state, "walker");
    const hp = getUnit(state, "walker")?.hp ?? 0;
    const stepped = applyCommand(state, { kind: "move", unitId: "walker", to: { x: 2, y: 4 } });
    expect(stepped.error).toBeNull();
    expect(stepped.events.some((e) => e.type === "ObjectTriggered")).toBe(true);
    expect(getUnit(stepped.state, "walker")?.hp).toBe(hp - 15);
    expect(getObject(stepped.state, mine?.def.id ?? "")?.destroyed).toBe(true);
  });

  it("never goes off for the team that laid it", () => {
    let state = advanceTo(
      battle("e-mine-friend", [
        at(sapper("layer", ["lay-mine"]), "player", { x: 1, y: 4 }),
        at(sapper("mate", []), "player", { x: 3, y: 4 }),
        at(sapper("foe", []), "enemy", { x: 5, y: 0 }),
      ]),
      "layer",
    );
    state = act(state, "layer", "lay-mine", { kind: "tile", tile: { x: 2, y: 4 } });
    state = advanceTo(applyCommand(state, { kind: "endTurn", unitId: "layer" }).state, "mate");
    const hp = getUnit(state, "mate")?.hp ?? 0;
    const stepped = applyCommand(state, { kind: "move", unitId: "mate", to: { x: 2, y: 4 } });
    expect(stepped.error).toBeNull();
    expect(stepped.events.some((e) => e.type === "ObjectTriggered")).toBe(false);
    expect(getUnit(stepped.state, "mate")?.hp).toBe(hp);
  });

  it("goes off when a shove puts someone on it, not only a walk", () => {
    let state = advanceTo(
      battle("e-mine-shove", [
        at(sapper("layer", ["lay-mine"]), "player", { x: 0, y: 4 }),
        at(sapper("victim", []), "enemy", { x: 1, y: 4 }),
      ]),
      "layer",
    );
    state = act(state, "layer", "lay-mine", { kind: "tile", tile: { x: 3, y: 4 } });
    state = applyCommand(state, { kind: "endTurn", unitId: "layer" }).state;
    state = advanceTo(state, "layer");

    const hp = getUnit(state, "victim")?.hp ?? 0;
    const shoved = applyCommand(state, {
      kind: "act",
      unitId: "layer",
      abilityId: SHOVE,
      target: { kind: "unit", unitId: "victim" },
    });
    expect(shoved.error).toBeNull();
    expect(getUnit(shoved.state, "victim")?.position).toEqual({ x: 3, y: 4 });
    expect(shoved.events.some((e) => e.type === "ObjectTriggered")).toBe(true);
    expect(getUnit(shoved.state, "victim")?.hp).toBe(hp - 15);
  });

  it("is a hazard the AI sees, but only for the side it can go off under", () => {
    let state = advanceTo(
      battle("e-mine-hazard", [
        at(sapper("layer", ["lay-mine"]), "player", { x: 1, y: 4 }),
        at(sapper("foe", []), "enemy", { x: 4, y: 4 }),
      ]),
      "layer",
    );
    state = act(state, "layer", "lay-mine", { kind: "tile", tile: { x: 2, y: 4 } });

    const foe = getUnit(state, "foe");
    const layer = getUnit(state, "layer");
    expect(foe).not.toBeNull();
    expect(layer).not.toBeNull();
    const tile: TileCoord = { x: 2, y: 4 };
    expect(tileHazard(buildContext(state, foe!), tile)).toBeGreaterThan(0);
    expect(tileHazard(buildContext(state, layer!), tile)).toBe(0);
  });
});

/** Pass turns with no commands, collecting everything the clock emits. */
function idle(state: GameState, turns: number): { state: GameState; events: BattleEvent[] } {
  let current = state;
  const events: BattleEvent[] = [];
  for (let i = 0; i < turns; i += 1) {
    const active = current.activeTurn;
    if (active === null || current.result !== null) break;
    const result = applyCommand(current, { kind: "endTurn", unitId: active.unitId });
    if (result.error !== null) throw new Error(result.error.message);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

describe("turrets", () => {
  it("takes shots on its own CT clock at the nearest enemy of its owner", () => {
    let state = advanceTo(
      battle("e-turret", [
        at(sapper("layer", ["lay-turret"]), "player", { x: 1, y: 4 }),
        at(sapper("near", []), "enemy", { x: 3, y: 5 }),
        at(sapper("far", []), "enemy", { x: 5, y: 0 }),
      ]),
      "layer",
    );
    state = act(state, "layer", "lay-turret", { kind: "tile", tile: { x: 2, y: 4 } });
    const turret = state.map.objects.find((o) => o.def.kind === "turret");
    // Freshly deployed: it banks CT from zero like any slow unit.
    expect(turret?.ct).toBe(0);
    expect(turret?.owner).toBe("player");

    const played = idle(state, 4);
    const shots = played.events.filter((e) => e.type === "ObjectAttacked");
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => e.type === "ObjectAttacked" && e.targetUnitId === "near")).toBe(true);
    expect(getUnit(played.state, "near")?.hp).toBeLessThan(getUnit(state, "near")?.hp ?? 0);
    expect(getUnit(played.state, "far")?.hp).toBe(getUnit(state, "far")?.hp ?? 0);
  });

  it("stops shooting once it is destroyed", () => {
    let state = advanceTo(
      battle("e-turret-dead", [
        at(sapper("layer", ["lay-turret"]), "player", { x: 1, y: 4 }),
        at(sapper("near", []), "enemy", { x: 3, y: 5 }),
      ]),
      "layer",
    );
    state = act(state, "layer", "lay-turret", { kind: "tile", tile: { x: 2, y: 4 } });
    const turretId = state.map.objects.find((o) => o.def.kind === "turret")?.def.id ?? "";
    state = {
      ...state,
      map: {
        objects: state.map.objects.map((o) =>
          o.def.id === turretId ? { ...o, destroyed: true, hp: 0 } : o,
        ),
      },
    };
    expect(idle(state, 4).events.some((e) => e.type === "ObjectAttacked")).toBe(false);
  });
});
