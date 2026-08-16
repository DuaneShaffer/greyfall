import { describe, expect, it } from "vitest";
import type { Ability, Effect, Encounter, Facing, PayloadEffect, Team, TileCoord, Unit } from "../../../src/data/index.js";
import { createBattle, getObject, type ContentLibrary, type GameState } from "../../../src/core/index.js";
import { WEIGHTS, buildContext } from "../../../src/core/ai/index.js";
import { abilityValue, destroyValue } from "../../../src/core/ai/score.js";
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

/** The same buff with nothing to pay for it, so the cap is measured on its own. */
const FREE_BUFF: Ability = { ...SELF_BUFF, id: "bench-free-buff", name: "Bench Free Buff", chargeCost: 0, hpCost: 0 };

/** Piston Lunge's shape: the point of the ability is the two tiles it moves you. */
const STEP: Ability = {
  ...GIFT,
  id: "bench-step",
  name: "Bench Step",
  targeting: { ...GIFT.targeting, range: { min: 1, max: 5, vertical: 3 }, requiresLos: true, validTargets: ["enemy"] },
  effects: [{ kind: "moveSelf", direction: "toward-target", distance: 2 }],
};

const BACKSTEP: Ability = {
  ...STEP,
  id: "bench-backstep",
  name: "Bench Backstep",
  effects: [{ kind: "moveSelf", direction: "away-from-target", distance: 2 }],
};

/** Throw the Breaker's shape: one machine, one switch, no damage of its own. */
const BREAKER: Ability = {
  ...GIFT,
  id: "bench-breaker",
  name: "Bench Breaker",
  targeting: { ...GIFT.targeting, range: { min: 1, max: 4, vertical: 3 }, validTargets: ["object"] },
  effects: [{ kind: "setPower", mode: "off" }],
};

/** Sentry Frame's shape: a turret that cannot walk to its work. */
const TURRET: Ability = {
  ...GIFT,
  id: "bench-turret",
  name: "Bench Turret",
  targeting: { ...GIFT.targeting, range: { min: 1, max: 3, vertical: 1 }, validTargets: ["emptyTile"] },
  effects: [
    {
      kind: "spawnObject",
      object: "turret",
      hp: 24,
      attack: {
        amount: { base: "fixed", power: 12 },
        damageType: "kinetic",
        range: { min: 1, max: 2, vertical: 1 },
        requiresLos: true,
        speed: 6,
      },
    },
  ],
};

const mine = (id: string, contact?: PayloadEffect): Ability => {
  const spawn: Effect =
    contact === undefined
      ? { kind: "spawnObject", object: "mine", hp: 8 }
      : { kind: "spawnObject", object: "mine", hp: 8, onContact: { destroysSelf: true, effects: [contact] } };
  return { ...TURRET, id, name: id, effects: [spawn] };
};

/** A mine authored the way `BALANCE_REPORT` G7 warns about, and one that works. */
const MINE_INERT = mine("bench-mine-inert");
const MINE_PHYS = mine("bench-mine-phys", {
  kind: "damage",
  damageType: "kinetic",
  amount: { base: "phys", power: 8 },
});
const MINE_FIXED = mine("bench-mine-fixed", {
  kind: "damage",
  damageType: "kinetic",
  amount: { base: "fixed", power: 20 },
});

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
      "bench-free-buff": FREE_BUFF,
      "bench-mend": MEND,
      "bench-chip": CHIP,
      "bench-step": STEP,
      "bench-backstep": BACKSTEP,
      "bench-breaker": BREAKER,
      "bench-turret": TURRET,
      "bench-mine-inert": MINE_INERT,
      "bench-mine-phys": MINE_PHYS,
      "bench-mine-fixed": MINE_FIXED,
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

const BENCH = [
  "bench-gift",
  "bench-overdrive",
  "bench-free-buff",
  "bench-mend",
  "bench-chip",
  "bench-step",
  "bench-backstep",
  "bench-breaker",
  "bench-turret",
  "bench-mine-inert",
  "bench-mine-phys",
  "bench-mine-fixed",
];
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
    const buff = score(state, "orin", "bench-free-buff", { kind: "unit", unitId: "orin" });
    expect(buff).toBeGreaterThan(0);
    expect(buff).toBeLessThan(WEIGHTS.killBonus);
  });

  it("refuses a self-buff that would eat most of the flux the unit has left", () => {
    const state = advanceTo(
      battle("e-score-buff-cost", [
        rigger("orin", { x: 1, y: 4 }),
        at(enforcer("foe", "Foe"), "player", { x: 5, y: 0 }),
      ]),
      "orin",
    );
    // Overdrive's shape on an Enforcer's seven-point pool: six of the seven
    // points plus eight HP for one status. Flux does not come back, so the
    // opportunity cost is priced against the pool and this loses money.
    const orin = state.units.find((u) => u.id === "orin");
    expect(orin?.charge).toBeLessThan(10);
    expect(score(state, "orin", "bench-overdrive", { kind: "unit", unitId: "orin" })).toBeLessThan(0);
  });

  it("pays for a step toward the fight and refuses the same step backwards", () => {
    // A kit with nothing but the two steps reads as melee, which is the
    // temperament that wants to close; an artillery kit correctly declines.
    const stepper = at(
      enforcer("ivo", "Ivo", { learnedAbilityIds: ["bench-step", "bench-backstep"] }),
      "enemy",
      { x: 3, y: 5 },
    );
    const state = advanceTo(
      battle("e-score-step", [stepper, at(enforcer("foe", "Foe"), "player", { x: 3, y: 0 })]),
      "ivo",
    );
    const forward = score(state, "ivo", "bench-step", { kind: "unit", unitId: "foe" });
    const back = score(state, "ivo", "bench-backstep", { kind: "unit", unitId: "foe" });
    expect(forward).toBeGreaterThan(0);
    expect(back).toBeLessThan(forward);
    // Movement is worth having; it is never worth as much as a body.
    expect(forward).toBeLessThan(WEIGHTS.killBonus);
  });

  it("stops paying for a status the target is already carrying at full duration", () => {
    const state = advanceTo(
      battle("e-score-held", [
        rigger("orin", { x: 1, y: 4 }),
        at(enforcer("foe", "Foe"), "player", { x: 5, y: 0 }),
      ]),
      "orin",
    );
    const self = { kind: "unit", unitId: "orin" } as const;
    const fresh = score(state, "orin", "bench-free-buff", self);
    const orin = state.units.find((u) => u.id === "orin");
    if (orin === undefined) throw new Error("no orin");

    orin.statuses = [{ statusId: "overclocked", turnsRemaining: 1 }];
    const lapsing = score(state, "orin", "bench-free-buff", self);
    orin.statuses = [{ statusId: "overclocked", turnsRemaining: 2 }];
    const held = score(state, "orin", "bench-free-buff", self);

    expect(held).toBe(0);
    expect(lapsing).toBeGreaterThan(0);
    expect(lapsing).toBeLessThan(fresh);
  });

  it("prices an unmanned blocker by what breaking it opens, not by a flat point", () => {
    const worth = (state: GameState): number => {
      const actor = state.units.find((u) => u.id === "ivo");
      if (actor === undefined) throw new Error("no ivo");
      const crate = state.map.objects.find((o) => o.def.id === "crate-stack");
      if (crate === undefined) throw new Error("no crate-stack");
      return destroyValue(buildContext(state, actor), state, crate);
    };
    // The crate stack covers (4,2) and (4,3); nobody is standing in a payload
    // either way, so before this the two read the same flat structural point.
    const screening = advanceTo(
      battle("e-score-screen", [
        rigger("ivo", { x: 3, y: 3 }),
        at(enforcer("foe", "Foe"), "player", { x: 5, y: 3 }),
      ]),
      "ivo",
    );
    const aside = advanceTo(
      battle("e-score-aside", [
        rigger("ivo", { x: 3, y: 3 }),
        at(enforcer("foe", "Foe"), "player", { x: 1, y: 3 }),
      ]),
      "ivo",
    );
    expect(worth(screening)).toBeGreaterThan(WEIGHTS.objectStructurePoint);
    expect(worth(screening)).toBeGreaterThan(worth(aside));
  });

  it("credits cutting power to a machine the enemy could turn on us", () => {
    const base = advanceTo(
      battle("e-score-breaker", [
        rigger("ivo", { x: 3, y: 4 }),
        at(enforcer("foe", "Foe"), "player", { x: 4, y: 1 }),
      ]),
      "ivo",
    );
    // The yard has no armed machinery, so the crate stack is given a press
    // line's controls: powered, worked from beside it, and aimed where we stand.
    const rigged: GameState = {
      ...base,
      map: {
        objects: base.map.objects.map((obj) =>
          obj.def.id !== "crate-stack"
            ? obj
            : {
                ...obj,
                powered: true,
                def: {
                  ...obj.def,
                  powered: true,
                  operable: {
                    requiresPower: true,
                    targetObjectIds: [],
                    targetTiles: [
                      { x: 3, y: 4 },
                      { x: 3, y: 3 },
                    ],
                    effects: [
                      { kind: "damage", damageType: "kinetic", amount: { base: "fixed", power: 30 } },
                    ],
                  },
                },
              },
        ),
      },
    };
    const target = { kind: "object", objectId: "crate-stack" } as const;
    expect(score(rigged, "ivo", "bench-breaker", target)).toBeGreaterThan(0);
    expect(score(base, "ivo", "bench-breaker", target)).toBe(0);
  });

  it("discounts a deployable that cannot reach anything from where it is put down", () => {
    const state = advanceTo(
      battle("e-score-turret", [
        rigger("ivo", { x: 3, y: 3 }),
        at(enforcer("foe", "Foe"), "player", { x: 3, y: 0 }),
      ]),
      "ivo",
    );
    const near = score(state, "ivo", "bench-turret", { kind: "tile", tile: { x: 3, y: 1 } });
    const far = score(state, "ivo", "bench-turret", { kind: "tile", tile: { x: 3, y: 5 } });
    expect(near).toBeGreaterThan(far);
  });

  it("prices a contact payload the engine would zero at zero", () => {
    const state = advanceTo(
      battle("e-score-mine", [
        rigger("ivo", { x: 3, y: 3 }),
        at(enforcer("foe", "Foe"), "player", { x: 3, y: 1 }),
      ]),
      "ivo",
    );
    const spot = { kind: "tile", tile: { x: 3, y: 2 } } as const;
    // `checkContact` resolves with no caster (`COMBAT_RULES` §14), so a `phys`
    // amount lands as nothing and the search must not pay for it either
    // (`BALANCE_REPORT` G7).
    const inert = score(state, "ivo", "bench-mine-inert", spot);
    expect(score(state, "ivo", "bench-mine-phys", spot)).toBe(inert);
    expect(score(state, "ivo", "bench-mine-fixed", spot)).toBeGreaterThan(inert);
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
