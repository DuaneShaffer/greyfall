import { describe, expect, it } from "vitest";
import type { Ability, Encounter, Facing, Team, TileCoord, Unit } from "../../../src/data/index.js";
import { createBattle, getObject, type ContentLibrary, type GameState } from "../../../src/core/index.js";
import { WEIGHTS, buildContext } from "../../../src/core/ai/index.js";
import { abilityValue } from "../../../src/core/ai/score.js";
import { advanceTo, enforcer, testContent, yardEncounter } from "../fixtures.js";

/** Tap Line's shape: a gift of flux to a friend. */
const GIFT: Ability = {
  schemaVersion: 1,
  id: "bench-gift",
  name: "Bench Gift",
  description: "Meter a shunt into someone's cells.",
  jobId: "conduit",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 0, max: 3, vertical: 2 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["ally", "self"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [{ kind: "modifyCharge", amount: 10 }],
};

/** Overdrive's shape: a large self-buff bought with flux and blood. */
const SELF_BUFF: Ability = {
  ...GIFT,
  id: "bench-overdrive",
  name: "Bench Overdrive",
  targeting: { ...GIFT.targeting, range: { min: 0, max: 0, vertical: 0 }, validTargets: ["self"] },
  chargeCost: 6,
  hpCost: 8,
  effects: [{ kind: "applyStatus", statusId: "overclocked", chance: 100 }],
};

/** Field Repair's shape: integrity back into a machine nobody owns. */
const MEND: Ability = {
  ...GIFT,
  id: "bench-mend",
  name: "Bench Mend",
  targeting: { ...GIFT.targeting, range: { min: 1, max: 3, vertical: 2 }, validTargets: ["object"] },
  effects: [{ kind: "repairObject", amount: { base: "fixed", power: 20 } }],
};

/** A cheap charged strike whose gross sits well under the chip threshold. */
const CHIP: Ability = {
  ...GIFT,
  id: "bench-chip",
  name: "Bench Chip",
  targeting: { ...GIFT.targeting, range: { min: 1, max: 3, vertical: 2 }, validTargets: ["enemy"] },
  chargeCost: 1,
  effects: [{ kind: "damage", damageType: "arc", amount: { base: "fixed", power: 15 } }],
};

function content(encounters: Encounter[] = []): ContentLibrary {
  const base = testContent(encounters);
  return {
    ...base,
    abilities: {
      ...base.abilities,
      "bench-gift": GIFT,
      "bench-overdrive": SELF_BUFF,
      "bench-mend": MEND,
      "bench-chip": CHIP,
    },
  };
}

function at(unit: Unit, team: Team, position: TileCoord, facing: Facing = "north") {
  return { unit, team, position, facing };
}

function battle(id: string, placements: Encounter["enemies"]): GameState {
  const encounter = yardEncounter(content(), { id, enemies: placements, triggers: [] });
  return createBattle(content([encounter]), id, [], []).state;
}

const BENCH = ["bench-gift", "bench-overdrive", "bench-mend", "bench-chip"];
const rigger = (id: string, position: TileCoord) =>
  at(enforcer(id, id, { learnedAbilityIds: BENCH }), "enemy", position);

function score(state: GameState, actorId: string, abilityId: string, target: Parameters<typeof abilityValue>[3]) {
  const actor = state.units.find((u) => u.id === actorId);
  if (actor === undefined) throw new Error(`no unit ${actorId}`);
  const ctx = buildContext(state, actor);
  const ability = state.content.abilities[abilityId];
  if (ability === undefined || ability.slot !== "action") throw new Error(`no action ability ${abilityId}`);
  return abilityValue(ctx, state, ability, target);
}

describe("what the search can see", () => {
  it("prices a gift of flux to an ally as aid, not as nothing", () => {
    const state = advanceTo(
      battle("e-score-gift", [
        rigger("sparks", { x: 1, y: 4 }),
        at(enforcer("mate", "Mate"), "enemy", { x: 1, y: 3 }),
        at(enforcer("foe", "Foe"), "player", { x: 5, y: 0 }),
      ]),
      "sparks",
    );
    const mate = state.units.find((u) => u.id === "mate");
    if (mate !== undefined) mate.charge = 0;
    expect(score(state, "sparks", "bench-gift", { kind: "unit", unitId: "mate" })).toBeGreaterThan(0);
  });

  it("gives a topped-off ally nothing for the same gift", () => {
    const state = advanceTo(
      battle("e-score-gift-full", [
        rigger("sparks", { x: 1, y: 4 }),
        at(enforcer("mate", "Mate"), "enemy", { x: 1, y: 3 }),
        at(enforcer("foe", "Foe"), "player", { x: 5, y: 0 }),
      ]),
      "sparks",
    );
    expect(score(state, "sparks", "bench-gift", { kind: "unit", unitId: "mate" })).toBe(0);
  });

  it("credits repairing a machine the map authored, not only one it deployed", () => {
    const start = advanceTo(
      battle("e-score-mend", [
        rigger("ivo", { x: 1, y: 2 }),
        at(enforcer("foe", "Foe"), "player", { x: 5, y: 0 }),
      ]),
      "ivo",
    );
    const state: GameState = {
      ...start,
      map: { objects: start.map.objects.map((o) => (o.def.id === "yard-cell" ? { ...o, hp: 4 } : o)) },
    };
    expect(getObject(state, "yard-cell")?.owner).toBeNull();
    expect(score(state, "ivo", "bench-mend", { kind: "object", objectId: "yard-cell" })).toBeGreaterThan(0);
  });

  it("caps a self-buff below the value of a kill", () => {
    const state = advanceTo(
      battle("e-score-buff", [
        rigger("orin", { x: 1, y: 4 }),
        at(enforcer("foe", "Foe"), "player", { x: 5, y: 0 }),
      ]),
      "orin",
    );
    const buff = score(state, "orin", "bench-overdrive", { kind: "unit", unitId: "orin" });
    expect(buff).toBeGreaterThan(0);
    expect(buff).toBeLessThan(WEIGHTS.killBonus);
  });

  it("charges a proportional price for chip damage instead of deleting it", () => {
    const state = advanceTo(
      battle("e-score-chip", [
        rigger("sparks", { x: 1, y: 4 }),
        at(enforcer("foe", "Foe"), "player", { x: 1, y: 3 }),
      ]),
      "sparks",
    );
    const value = score(state, "sparks", "bench-chip", { kind: "unit", unitId: "foe" });
    expect(value).toBeGreaterThan(WEIGHTS.actThreshold);
    // The old flat cliff subtracted the whole `chipPenalty` and sank it.
    expect(value).toBeLessThan(15 * WEIGHTS.damagePerHp);
  });
});
