import { describe, expect, it } from "vitest";
import type { Ability, Encounter, Facing, Team, TileCoord, Unit } from "../../src/data/index.js";
import { applyCommand, createBattle, getUnit, type ContentLibrary, type GameState } from "../../src/core/index.js";
import { advanceTo, enforcer, testContent, yardEncounter } from "./fixtures.js";

/** Piston Lunge's missing half: close the distance, then hit. */
const LUNGE: Ability = {
  schemaVersion: 1,
  id: "bench-lunge",
  name: "Bench Lunge",
  description: "The arm goes where the shoulder cannot.",
  jobId: "augmented",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 1, max: 3, vertical: 3 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["enemy"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [
    { kind: "moveSelf", direction: "toward-target", distance: 2 },
    { kind: "damage", damageType: "kinetic", amount: { base: "fixed", power: 5 } },
  ],
};

/** Signal Jump's missing half: a self-targeted hop along the caster's facing. */
const HOP: Ability = {
  ...LUNGE,
  id: "bench-hop",
  name: "Bench Hop",
  targeting: {
    range: { min: 0, max: 0, vertical: 0 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["self"],
  },
  effects: [{ kind: "moveSelf", direction: "forward", distance: 2 }],
};

const BACKSTEP: Ability = {
  ...LUNGE,
  id: "bench-backstep",
  name: "Bench Backstep",
  effects: [{ kind: "moveSelf", direction: "away-from-target", distance: 2 }],
};

function content(encounters: Encounter[] = []): ContentLibrary {
  const base = testContent(encounters);
  return {
    ...base,
    abilities: { ...base.abilities, "bench-lunge": LUNGE, "bench-hop": HOP, "bench-backstep": BACKSTEP },
  };
}

function at(unit: Unit, team: Team, position: TileCoord, facing: Facing = "north") {
  return { unit, team, position, facing };
}

function battle(id: string, placements: Encounter["enemies"]): GameState {
  const encounter = yardEncounter(content(), { id, enemies: placements, triggers: [] });
  return createBattle(content([encounter]), id, [], []).state;
}

const mover = (id: string, position: TileCoord, facing: Facing = "north") =>
  at(enforcer(id, id, { learnedAbilityIds: ["bench-lunge", "bench-hop", "bench-backstep"] }), "player", position, facing);

describe("moveSelf", () => {
  it("carries the caster toward the target and stops beside it", () => {
    const state = advanceTo(
      battle("e-lunge", [mover("orin", { x: 1, y: 5 }), at(enforcer("foe", "Foe"), "enemy", { x: 1, y: 2 })]),
      "orin",
    );
    const lunged = applyCommand(state, {
      kind: "act",
      unitId: "orin",
      abilityId: "bench-lunge",
      target: { kind: "unit", unitId: "foe" },
    });
    expect(lunged.error).toBeNull();
    expect(getUnit(lunged.state, "orin")?.position).toEqual({ x: 1, y: 3 });
    expect(lunged.events.some((e) => e.type === "UnitForcedMove" && e.unitId === "orin")).toBe(true);
    // The damage still lands: the caster moved before the effect list finished.
    expect(getUnit(lunged.state, "foe")?.hp).toBe((getUnit(state, "foe")?.hp ?? 0) - 5);
  });

  it("stops short of an occupied tile rather than sharing it", () => {
    const state = advanceTo(
      battle("e-lunge-blocked", [
        mover("orin", { x: 1, y: 5 }),
        at(enforcer("foe", "Foe"), "enemy", { x: 1, y: 4 }),
      ]),
      "orin",
    );
    const lunged = applyCommand(state, {
      kind: "act",
      unitId: "orin",
      abilityId: "bench-lunge",
      target: { kind: "unit", unitId: "foe" },
    });
    expect(lunged.error).toBeNull();
    expect(getUnit(lunged.state, "orin")?.position).toEqual({ x: 1, y: 5 });
  });

  it("follows the caster's own facing when the ability targets the caster", () => {
    const state = advanceTo(
      battle("e-hop", [mover("della", { x: 3, y: 5 }, "north"), at(enforcer("foe", "Foe"), "enemy", { x: 5, y: 0 })]),
      "della",
    );
    const hopped = applyCommand(state, {
      kind: "act",
      unitId: "della",
      abilityId: "bench-hop",
      target: { kind: "unit", unitId: "della" },
    });
    expect(hopped.error).toBeNull();
    expect(getUnit(hopped.state, "della")?.position).toEqual({ x: 3, y: 3 });
  });

  it("backs the caster away from what it aimed at", () => {
    const state = advanceTo(
      battle("e-backstep", [
        mover("orin", { x: 1, y: 3 }),
        at(enforcer("foe", "Foe"), "enemy", { x: 1, y: 2 }),
      ]),
      "orin",
    );
    const stepped = applyCommand(state, {
      kind: "act",
      unitId: "orin",
      abilityId: "bench-backstep",
      target: { kind: "unit", unitId: "foe" },
    });
    expect(stepped.error).toBeNull();
    expect(getUnit(stepped.state, "orin")?.position).toEqual({ x: 1, y: 5 });
  });

  it("respects the height limit a shove respects", () => {
    // (5,4) carries the freight lift deck at height 2 and (4,4) is at 0, a
    // delta of 2 — right on FORCED_MOVE_HEIGHT_LIMIT, so the hop lands.
    const state = advanceTo(
      battle("e-hop-height", [
        mover("della", { x: 3, y: 4 }, "east"),
        at(enforcer("foe", "Foe"), "enemy", { x: 0, y: 0 }),
      ]),
      "della",
    );
    const hopped = applyCommand(state, {
      kind: "act",
      unitId: "della",
      abilityId: "bench-hop",
      target: { kind: "unit", unitId: "della" },
    });
    expect(hopped.error).toBeNull();
    expect(getUnit(hopped.state, "della")?.position).toEqual({ x: 5, y: 4 });
  });
});
