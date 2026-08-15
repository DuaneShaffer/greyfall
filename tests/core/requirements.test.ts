import { describe, expect, it } from "vitest";
import type { Ability, AbilityRequirement, Encounter, Facing, Team, TileCoord, Unit } from "../../src/data/index.js";
import type { ContentLibrary } from "../../src/core/index.js";
import {
  applyCommand,
  availableAbilities,
  createBattle,
  forecast,
  targetableTiles,
  type GameState,
} from "../../src/core/index.js";
import { chooseCommand } from "../../src/core/ai/index.js";
import { advanceTo, enforcer, hasTile, testContent, yardEncounter } from "./fixtures.js";

type ActionAbility = Extract<Ability, { slot: "action" }>;
type TargetKinds = ActionAbility["targeting"]["validTargets"];

function gated(id: string, requires: AbilityRequirement[], validTargets: TargetKinds): ActionAbility {
  return {
    schemaVersion: 1,
    id,
    name: id,
    description: `Bench rig: ${id}.`,
    jobId: "conduit",
    standingCost: 0,
    slot: "action",
    targeting: {
      range: { min: 0, max: 4, vertical: 3 },
      area: { shape: "single" },
      requiresLos: false,
      validTargets,
    },
    requires,
    chargeCost: 0,
    castSpeed: null,
    effects: [{ kind: "modifyCharge", amount: 4 }],
  };
}

const RAIL_ONLY = gated("rail-only", ["railUnderfoot"], ["self", "ally"]);
const TAP = gated("bench-tap", ["adjacentPoweredObject"], ["self", "ally"]);
const LIVE_ONLY: ActionAbility = {
  ...gated("live-only", ["targetPowered"], ["object"]),
  effects: [{ kind: "setPower", mode: "off" }],
};

function content(encounters: Encounter[] = []): ContentLibrary {
  const base = testContent(encounters);
  return {
    ...base,
    abilities: { ...base.abilities, "rail-only": RAIL_ONLY, "bench-tap": TAP, "live-only": LIVE_ONLY },
  };
}

function at(unit: Unit, team: Team, position: TileCoord, facing: Facing = "north") {
  return { unit, team, position, facing };
}

function battle(id: string, placements: Encounter["enemies"]): GameState {
  const encounter = yardEncounter(content(), { id, enemies: placements, triggers: [] });
  return createBattle(content([encounter]), id, [], []).state;
}

const rigger = (id: string, position: TileCoord) =>
  at(enforcer(id, id, { learnedAbilityIds: ["rail-only", "bench-tap", "live-only"] }), "player", position);

/** The yard's rail runs down column x=2; the freight lift at (5,4) is live. */
describe("conditional ability gating", () => {
  it("rejects an ability whose ground condition is unmet and allows it where it holds", () => {
    const off = advanceTo(
      battle("e-rail-off", [rigger("dell", { x: 1, y: 4 }), at(enforcer("foe", "Foe"), "enemy", { x: 5, y: 0 })]),
      "dell",
    );
    const rejected = applyCommand(off, {
      kind: "act",
      unitId: "dell",
      abilityId: "rail-only",
      target: { kind: "unit", unitId: "dell" },
    });
    expect(rejected.error?.code).toBe("requirement-unmet");
    expect(availableAbilities(off, "dell")).not.toContain("rail-only");

    const on = advanceTo(
      battle("e-rail-on", [rigger("dell", { x: 2, y: 4 }), at(enforcer("foe", "Foe"), "enemy", { x: 5, y: 0 })]),
      "dell",
    );
    expect(availableAbilities(on, "dell")).toContain("rail-only");
    const allowed = applyCommand(on, {
      kind: "act",
      unitId: "dell",
      abilityId: "rail-only",
      target: { kind: "unit", unitId: "dell" },
    });
    expect(allowed.error).toBeNull();
  });

  it("gates a tap on standing beside something live", () => {
    const dead = advanceTo(
      battle("e-tap-dead", [rigger("dell", { x: 3, y: 1 }), at(enforcer("foe", "Foe"), "enemy", { x: 5, y: 0 })]),
      "dell",
    );
    expect(availableAbilities(dead, "dell")).not.toContain("bench-tap");
    expect(targetableTiles(dead, "dell", "bench-tap")).toEqual([]);
    expect(forecast(dead, "dell", "bench-tap", { kind: "unit", unitId: "dell" })).toEqual([]);

    const live = advanceTo(
      battle("e-tap-live", [rigger("dell", { x: 4, y: 4 }), at(enforcer("foe", "Foe"), "enemy", { x: 5, y: 0 })]),
      "dell",
    );
    expect(availableAbilities(live, "dell")).toContain("bench-tap");
    expect(forecast(live, "dell", "bench-tap", { kind: "unit", unitId: "dell" }).length).toBe(1);
  });

  it("gates on the target's own power and prunes the targetable tiles", () => {
    const state = advanceTo(
      battle("e-live-target", [rigger("dell", { x: 4, y: 4 }), at(enforcer("foe", "Foe"), "enemy", { x: 5, y: 0 })]),
      "dell",
    );
    // The freight lift at (5,4) is powered; the yard switch at (3,4) is not electrical.
    const tiles = targetableTiles(state, "dell", "live-only");
    expect(hasTile(tiles, { x: 5, y: 4 })).toBe(true);
    expect(hasTile(tiles, { x: 3, y: 4 })).toBe(false);

    expect(
      applyCommand(state, {
        kind: "act",
        unitId: "dell",
        abilityId: "live-only",
        target: { kind: "object", objectId: "freight-lift" },
      }).error,
    ).toBeNull();
    expect(
      applyCommand(state, {
        kind: "act",
        unitId: "dell",
        abilityId: "live-only",
        target: { kind: "object", objectId: "yard-switch" },
      }).error?.code,
    ).toBe("requirement-unmet");
  });

  it("keeps a gated ability out of the AI's candidate list", () => {
    const state = advanceTo(
      battle("e-gated-ai", [
        at(enforcer("dell", "Dell", { learnedAbilityIds: ["rail-only"] }), "enemy", { x: 1, y: 4 }),
        at(enforcer("foe", "Foe"), "player", { x: 1, y: 3 }),
      ]),
      "dell",
    );
    let current = state;
    for (let step = 0; step < 4 && current.activeTurn?.unitId === "dell"; step += 1) {
      const command = chooseCommand(current);
      expect(command.kind === "act" && command.abilityId).not.toBe("rail-only");
      current = applyCommand(current, command).state;
    }
  });
});
