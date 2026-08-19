// The seam's Phase-1 additions: mechanics on every listed order, elevation and
// aim legality under the cursor, allegiance on the forecast, and the field as
// data. Each one exists because a UI could not tell the truth without it.

import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  itemAbilityId,
  type ContentLibrary,
  type GameState,
} from "../../src/core/index.js";
import { Encounter, type Unit } from "../../src/data/index.js";
import {
  battleHudView,
  cursorView,
  fieldView,
  forecastView,
  partyView,
  satchelViews,
  skillsetViews,
  targetingView,
} from "../../src/app/viewmodels.js";
import { campaignPartyView, itemMechanics } from "../../src/app/campaignViews.js";
import { advanceTo, loadContent, rowen, testContent, YARD_ENCOUNTER_ID } from "../core/fixtures.js";
import { BENCH, benchState } from "../progression/fixtures.js";
import { openBattle, ROWEN_TILE, VALE, VALE_TILE } from "./fixtures.js";

const battle = (): GameState => openBattle([rowen(), VALE]).state;

const abilityRow = (state: GameState, unitId: string, abilityId: string) =>
  skillsetViews(state, unitId)
    .flatMap((set) => set.abilities)
    .find((ability) => ability.id === abilityId);

describe("mechanics on a menu row", () => {
  it("states an ability's reach, area, target, damage and status roll", () => {
    const state = advanceTo(battle(), "rowen");
    const pin = abilityRow(state, "rowen", "pin");
    const mechanics = pin?.mechanics;
    expect(mechanics?.range).toEqual({ min: 1, max: 1, vertical: 1 });
    expect(mechanics?.area).toEqual({ shape: "single" });
    expect(mechanics?.targets).toEqual(["enemy"]);
    expect(mechanics?.targetsLabel).toBe("Enemy");
    expect(mechanics?.requiresLos).toBe(true);
    expect(mechanics?.amounts).toEqual([
      {
        kind: "damage",
        against: "unit",
        scale: "weapon",
        power: 80,
        damageType: "kinetic",
        label: "Weapon 80% kinetic",
      },
    ]);
    expect(mechanics?.statuses).toEqual([{ id: "stunned", name: "Stunned", chancePercent: 35 }]);
    expect(mechanics?.summary).toBe(
      "Range 1 (±1h) · Single target · Enemy · Damage Weapon 80% kinetic · Stunned 35%",
    );
  });

  it("reads the weapon attack's reach off the weapon the unit is holding", () => {
    const state = advanceTo(battle(), "rowen");
    const attack = abilityRow(state, "rowen", "basic-attack");
    expect(attack?.mechanics?.range.max).toBeGreaterThan(0);
    expect(attack?.mechanics?.amounts[0]?.scale).toBe("weapon");
  });

  it("scales a cast's charge and cast time onto the summary", () => {
    const state = advanceTo(battle(), "vale");
    const overload = abilityRow(state, "vale", "overload-cell")?.mechanics;
    expect(overload?.targets).toEqual(["object"]);
    expect(overload?.amounts).toEqual([
      { kind: "damage", against: "integrity", scale: "mag", power: 20, label: "Mag ×20" },
    ]);
    expect(overload?.summary).toContain("Charge 5");
  });

  it("states an item's mechanics and what is left of it after this use", () => {
    const state = openBattle([rowen(), VALE], undefined, [{ itemId: "coagulant-vial", count: 2 }]).state;
    const vial = satchelViews(state, "rowen").find((entry) => entry.itemId === "coagulant-vial");
    expect(vial?.mechanics?.amounts).toEqual([
      { kind: "recovery", against: "unit", scale: "fixed", power: 30, label: "30" },
    ]);
    expect(vial?.mechanics?.targetsLabel).toBe("Self or ally");
    expect(vial?.mechanics?.usesRemaining).toBe(1);
    expect(vial?.mechanics?.summary).toContain("Recovery 30");
  });

  /**
   * Re-playtest N10. `usesRemaining` is `count - 1` — what is left once this one
   * is spent — and it was labelled "in stock", so a field kit printed
   * "Caustic Flask x1 · 0 in stock" against its own count. The in-battle
   * forecast already had the right words for the same figure.
   */
  it("labels what is left after use as what it is, not as the stock", () => {
    const state = openBattle([rowen(), VALE], undefined, [{ itemId: "coagulant-vial", count: 1 }]).state;
    const vial = satchelViews(state, "rowen").find((entry) => entry.itemId === "coagulant-vial");
    expect(vial?.count).toBe(1);
    expect(vial?.mechanics?.usesRemaining).toBe(0);
    expect(vial?.mechanics?.summary).toContain("0 left after use");
    expect(vial?.mechanics?.summary).not.toContain("in stock");
  });

  it("gives a between-battle item the engine's default reach when it names none", () => {
    const bench = { ...BENCH, items: { ...BENCH.items } };
    const tonic = bench.items["tonic"];
    expect(tonic).toBeDefined();
    const mechanics = itemMechanics(bench, tonic!, 2);
    expect(mechanics?.range).toEqual({ min: 0, max: 1, vertical: 1 });
    expect(mechanics?.targets).toEqual(["self", "ally"]);
    expect(mechanics?.usesRemaining).toBe(2);
  });
});

describe("elevation under the cursor", () => {
  it("reports the hovered tile's height, and no delta outside a targeting mode", () => {
    const state = advanceTo(battle(), "rowen");
    const view = battleHudView(state, { hoveredTile: { x: 5, y: 0 } });
    expect(view?.cursor).toEqual({ tile: { x: 5, y: 0 }, height: 2, heightDelta: null });
  });

  it("measures the delta against the acting unit while an order is being aimed", () => {
    const state = advanceTo(battle(), "rowen");
    const view = battleHudView(state, {
      hoveredTile: { x: 5, y: 0 },
      targetingAbilityId: "basic-attack",
    });
    // Rowen stands at height 0; the gantry corner is two up.
    expect(view?.cursor?.heightDelta).toBe(2);
  });

  it("has no cursor at all when nothing is hovered", () => {
    const state = advanceTo(battle(), "rowen");
    expect(battleHudView(state, {})?.cursor).toBeNull();
    expect(cursorView(state, null)).toBeNull();
  });
});

describe("aim legality", () => {
  it("splits the reach into what may be sent at and what may not, with reasons", () => {
    const state = advanceTo(battle(), "rowen");
    const view = targetingView(state, "rowen", "basic-attack");
    expect(view?.abilityName).toBe("Attack");
    expect(view?.inRange.length).toBe((view?.legal.length ?? 0) + (view?.illegal.length ?? 0));
    expect(view?.inRange.length).toBeGreaterThan(0);
    // Nobody hostile is beside Rowen at the opening, so every tile in reach is a
    // tile the aim gate would refuse — and it says so in the gate's own words.
    expect(view?.legal).toEqual([]);
    for (const refusal of view?.illegal ?? []) {
      expect(refusal.reason.length).toBeGreaterThan(0);
      expect(refusal.code.length).toBeGreaterThan(0);
    }
    expect(view?.illegal.map((entry) => entry.reason)).toContain("Attack cannot target that");
  });

  it("accepts the machine an object-verb order is for", () => {
    const state = advanceTo(battle(), "vale");
    const view = targetingView(state, "vale", "overload-cell");
    expect(view?.legal).toContainEqual({ x: 1, y: 1 });
    expect(view?.illegal.map((entry) => entry.tile)).not.toContainEqual({ x: 1, y: 1 });
  });

  it("is absent when nothing is being aimed", () => {
    const state = advanceTo(battle(), "rowen");
    expect(battleHudView(state, {})?.targeting).toBeNull();
    expect(battleHudView(state, { targetingAbilityId: "basic-attack" })?.targeting?.abilityId).toBe(
      "basic-attack",
    );
  });
});

describe("forecast allegiance", () => {
  it("names the side of every target and of the unit sending the order", () => {
    const state = openBattle([rowen(), VALE], undefined, [{ itemId: "coagulant-vial", count: 2 }]).state;
    const ready = advanceTo(state, "rowen");
    const view = forecastView(ready, "rowen", itemAbilityId("coagulant-vial"), {
      kind: "unit",
      unitId: "vale",
    });
    expect(view?.attacker.team).toBe("player");
    expect(view?.targets[0]?.team).toBe("player");
  });

  it("marks a hostile target hostile, and machinery not at all", () => {
    const state = advanceTo(battle(), "rowen");
    const hostile = forecastView(state, "rowen", "basic-attack", {
      kind: "unit",
      unitId: "provocateur-a",
    });
    expect(hostile?.targets[0]?.team).toBe("enemy");
    const machine = forecastView(advanceTo(state, "vale"), "vale", "overload-cell", {
      kind: "object",
      objectId: "yard-cell",
    });
    expect(machine?.targets[0]?.name).toBe("Flux Cell");
    expect(machine?.targets[0]?.team).toBeUndefined();
  });
});

describe("the field as data", () => {
  it("carries the board's shape, its elevations and everyone standing on it", () => {
    const state = advanceTo(battle(), "rowen");
    const field = fieldView(state);
    expect(field.width).toBe(6);
    expect(field.depth).toBe(6);
    expect(field.heights.length).toBe(6);
    expect(field.heights[0]?.[5]).toBe(2);
    expect(field.heights[4]?.[0]).toBe(0);
    const rowenOnField = field.units.find((unit) => unit.unitId === "rowen");
    expect(rowenOnField?.tile).toEqual(ROWEN_TILE);
    expect(rowenOnField?.acting).toBe(true);
    expect(rowenOnField?.team).toBe("player");
    expect(field.units.find((unit) => unit.unitId === "vale")?.acting).toBe(false);
    expect(field.objects.map((object) => object.id)).toContain("freight-lift");
    expect(field.objects.find((object) => object.id === "yard-cell")?.tiles).toEqual([{ x: 1, y: 1 }]);
  });

  it("puts every unit's visible statuses on its field entry", () => {
    const content = testContent();
    const conduit: Unit = {
      schemaVersion: 1,
      id: "vale",
      name: "Vale Tarn",
      level: 1,
      jobId: "conduit",
      disposition: { resolve: 50, attunement: 70 },
      learnedAbilityIds: ["surge"],
      equipment: {},
    };
    const opened = createBattle(
      content,
      YARD_ENCOUNTER_ID,
      [conduit],
      [{ unitId: "vale", position: VALE_TILE, facing: "north" }],
      [],
    );
    const ready = advanceTo(opened.state, "vale");
    const surged = applyCommand(ready, {
      kind: "act",
      unitId: "vale",
      abilityId: "surge",
      target: { kind: "unit", unitId: "vale" },
    });
    expect(surged.error).toBeNull();
    const onField = fieldView(surged.state).units.find((unit) => unit.unitId === "vale");
    expect(onField?.statuses).toEqual([
      { id: "surged", label: "Surged", category: "buff", remainingTurns: null },
    ]);
  });

  it("names whose turn it is, distinctly from who is being inspected", () => {
    const state = advanceTo(battle(), "rowen");
    const view = battleHudView(state, { inspectedUnitId: "vale" });
    expect(view?.activeUnitId).toBe("rowen");
    expect(view?.inspected?.id).toBe("vale");
  });
});

const yardWith = (objective: string | undefined): ContentLibrary => {
  const base = loadContent();
  const raw = JSON.parse(JSON.stringify(base.encounters[YARD_ENCOUNTER_ID]));
  delete raw.objective;
  const rewritten = Encounter.parse(objective === undefined ? raw : { ...raw, objective });
  return { ...base, encounters: { ...base.encounters, [YARD_ENCOUNTER_ID]: rewritten } };
};

describe("the objective", () => {
  it("is null for an engagement that has not been written up", () => {
    const opened = createBattle(
      yardWith(undefined),
      YARD_ENCOUNTER_ID,
      [rowen()],
      [{ unitId: "rowen", position: ROWEN_TILE, facing: "north" }],
      [],
    );
    const state = advanceTo(opened.state, "rowen");
    expect(battleHudView(state, {})?.objective).toBeNull();
  });

  it("is the encounter's own line where the data carries one", () => {
    const content = yardWith("Put the provocateur down and keep the lift fed.");
    const opened = createBattle(
      content,
      YARD_ENCOUNTER_ID,
      [rowen()],
      [{ unitId: "rowen", position: ROWEN_TILE, facing: "north" }],
      [],
    );
    const state = advanceTo(opened.state, "rowen");
    expect(battleHudView(state, {})?.objective).toBe(
      "Put the provocateur down and keep the lift fed.",
    );
  });
});

describe("deployment membership on the roster", () => {
  it("marks who is going out and counts them against the limit", () => {
    const view = campaignPartyView(benchState(), BENCH, 1, ["vale"]);
    expect(view.deployedLimit).toBe(1);
    expect(view.deployedCount).toBe(1);
    expect(view.members.find((member) => member.unitId === "vale")?.deployed).toBe(true);
    expect(view.members.find((member) => member.unitId === "rowen")?.deployed).toBe(false);
  });

  it("counts nobody deployed when no formation is staged", () => {
    const view = campaignPartyView(benchState(), BENCH, 4);
    expect(view.deployedCount).toBe(0);
    expect(view.members.every((member) => member.deployed === false)).toBe(true);
  });

  it("has everyone deployed on the battle roster, which has no reserve", () => {
    const view = partyView(advanceTo(battle(), "rowen"));
    expect(view.deployedCount).toBe(view.members.length);
    expect(view.members.every((member) => member.deployed === true)).toBe(true);
  });
});
