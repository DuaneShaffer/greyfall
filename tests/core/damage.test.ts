import { describe, expect, it } from "vitest";
import { BASIC_ATTACK_ID, createBattle, forecast, type GameState } from "../../src/core/index.js";
import { VALE, enemyAt, enforcer, testContent, yardEncounter } from "./fixtures.js";

function facingBattle(): GameState {
  const base = testContent();
  const encounter = yardEncounter(base, {
    id: "e-facing",
    enemies: [
      enemyAt(enforcer("front-guard", "Front Guard"), { x: 1, y: 3 }, "south"),
      enemyAt(enforcer("side-guard", "Side Guard"), { x: 0, y: 4 }, "south"),
      enemyAt(enforcer("back-guard", "Back Guard"), { x: 2, y: 4 }, "east"),
    ],
    triggers: [],
  });
  const content = testContent([encounter]);
  return createBattle(content, "e-facing", [VALE], [{ unitId: "vale", position: { x: 1, y: 4 }, facing: "north" }])
    .state;
}

function conduitBattle(): GameState {
  const base = testContent();
  const encounter = yardEncounter(base, {
    id: "e-arc",
    enemies: [enemyAt(enforcer("mark", "Mark", { disposition: { resolve: 60, attunement: 45 } }), { x: 1, y: 3 }, "south")],
    triggers: [],
  });
  const content = testContent([encounter]);
  return createBattle(content, "e-arc", [VALE], [{ unitId: "vale", position: { x: 1, y: 4 }, facing: "north" }]).state;
}

describe("damage formulas", () => {
  it("weapon damage is floor(phys * weaponPower * power / 400)", () => {
    const base = testContent();
    const encounter = yardEncounter(base, {
      id: "e-weapon",
      enemies: [enemyAt(enforcer("mark", "Mark"), { x: 1, y: 3 }, "south")],
      triggers: [],
    });
    const state = createBattle(
      testContent([encounter]),
      "e-weapon",
      [enforcer("rowen", "Rowen Corvane")],
      [{ unitId: "rowen", position: { x: 1, y: 4 }, facing: "north" }],
    ).state;

    // phys 9 * weapon power 9 * 100% / 400 = 20; Pin's 80% of that is 16.
    const attack = forecast(state, "rowen", BASIC_ATTACK_ID, { kind: "unit", unitId: "mark" });
    expect(attack[0]?.damage).toBe(20);
    const pin = forecast(state, "rowen", "pin", { kind: "unit", unitId: "mark" });
    expect(pin[0]?.damage).toBe(16);
  });

  it("mag damage scales by both actor and target Attunement", () => {
    const state = conduitBattle();
    // mag 10 * power 8 / 2 = 40, * 70% caster = 28, * 45% target = 12.
    const arc = forecast(state, "vale", "arc", { kind: "unit", unitId: "mark" });
    expect(arc[0]?.damage).toBe(12);
  });

  it("object damage ignores target Attunement but keeps the caster's", () => {
    const state = conduitBattle();
    // mag 10 * power 16 / 2 = 80, * 70% caster = 56; the cell has 20 integrity.
    const cast = forecast(state, "vale", "overload-cell", { kind: "object", objectId: "yard-cell" });
    expect(cast).toEqual([
      {
        unitId: null,
        objectId: "yard-cell",
        hitChance: 100,
        damage: 56,
        heal: 0,
        expectedDamage: 56,
        statusChances: [],
      },
    ]);
  });
});

describe("hit chance and facing", () => {
  it("keeps full evade from the front, half from the side, none from behind", () => {
    const state = facingBattle();
    const chance = (unitId: string) =>
      forecast(state, "vale", "arc", { kind: "unit", unitId })[0]?.hitChance;
    expect(chance("front-guard")).toBe(92);
    expect(chance("side-guard")).toBe(96);
    expect(chance("back-guard")).toBe(100);
  });

  it("weights expected damage and status chance by accuracy", () => {
    const base = testContent();
    const encounter = yardEncounter(base, {
      id: "e-expected",
      enemies: [enemyAt(enforcer("mark", "Mark"), { x: 1, y: 3 }, "south")],
      triggers: [],
    });
    const state = createBattle(
      testContent([encounter]),
      "e-expected",
      [enforcer("rowen", "Rowen Corvane")],
      [{ unitId: "rowen", position: { x: 1, y: 4 }, facing: "north" }],
    ).state;
    const pin = forecast(state, "rowen", "pin", { kind: "unit", unitId: "mark" })[0];
    expect(pin?.hitChance).toBe(92);
    expect(pin?.expectedDamage).toBe(Math.floor((16 * 92) / 100));
    expect(pin?.statusChances).toEqual([{ statusId: "stunned", chance: Math.floor((60 * 92) / 100) }]);
  });
});
