import { describe, expect, it } from "vitest";
import {
  BASIC_ATTACK_ID,
  createBattle,
  damageDivisor,
  forecast,
  unitMaxHp,
  unitStats,
  type GameState,
} from "../../src/core/index.js";
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
    // mag 10 * power 20 / 2 = 100, * 70% caster = 70; the cell has 20 integrity.
    const cast = forecast(state, "vale", "overload-cell", { kind: "object", objectId: "yard-cell" });
    expect(cast).toEqual([
      {
        unitId: null,
        objectId: "yard-cell",
        hitChance: 100,
        damage: 70,
        heal: 0,
        expectedDamage: 70,
        statusChances: [],
        outcomes: [],
      },
    ]);
  });
});

describe("the level-scaled damage divisor", () => {
  /** A duel between two enforcers of the same level, both holding a shock maul. */
  function levelBattle(level: number): GameState {
    const base = testContent();
    const encounter = yardEncounter(base, {
      id: `e-divisor-${level}`,
      enemies: [enemyAt(enforcer("mark", "Mark", { level }), { x: 1, y: 3 }, "south")],
      triggers: [],
    });
    return createBattle(
      testContent([encounter]),
      `e-divisor-${level}`,
      [enforcer("rowen", "Rowen Corvane", { level })],
      [{ unitId: "rowen", position: { x: 1, y: 4 }, facing: "north" }],
    ).state;
  }

  it("is 400 + 250(L-1)", () => {
    expect(damageDivisor(1)).toBe(400);
    expect(damageDivisor(2)).toBe(650);
    expect(damageDivisor(3)).toBe(900);
    expect(damageDivisor(5)).toBe(1400);
  });

  it("leaves level 1 byte-identical and scales every stat-derived base above it", () => {
    for (const level of [1, 2, 3, 5]) {
      const state = levelBattle(level);
      const phys = unitStats(state, "rowen")?.phys ?? 0;
      const power = 9; // shock-maul
      const divisor = damageDivisor(level);

      const attack = forecast(state, "rowen", BASIC_ATTACK_ID, { kind: "unit", unitId: "mark" });
      expect(attack[0]?.damage, `weapon L${level}`).toBe(Math.floor((phys * power * 100) / divisor));
      const pin = forecast(state, "rowen", "pin", { kind: "unit", unitId: "mark" });
      expect(pin[0]?.damage, `pin L${level}`).toBe(Math.floor((phys * power * 80) / divisor));
    }
    expect(forecast(levelBattle(1), "rowen", BASIC_ATTACK_ID, { kind: "unit", unitId: "mark" })[0]?.damage).toBe(20);
  });

  it("holds swings-to-down roughly flat where the shipped divisor collapsed it", () => {
    const swings = [1, 3, 5].map((level) => {
      const state = levelBattle(level);
      const damage = forecast(state, "rowen", BASIC_ATTACK_ID, { kind: "unit", unitId: "mark" })[0]?.damage ?? 0;
      const hp = unitMaxHp(state, "mark") ?? 0;
      // What the flat 400 divisor would have dealt, for the contrast.
      const shipped = Math.floor((damage * damageDivisor(level)) / 400);
      return { level, scaled: Math.ceil(hp / damage), flat: Math.ceil(hp / shipped) };
    });
    expect(swings.map((s) => s.scaled)).toEqual([4, 4, 4]);
    expect(swings.map((s) => s.flat)).toEqual([4, 2, 2]);
  });

  it("scales phys- and mag-based amounts by 200/D(L), not a fixed half", () => {
    for (const level of [1, 3]) {
      const base = testContent();
      const encounter = yardEncounter(base, {
        id: `e-mag-${level}`,
        enemies: [
          enemyAt(enforcer("mark", "Mark", { disposition: { resolve: 60, attunement: 100 } }), { x: 1, y: 3 }, "south"),
        ],
        triggers: [],
      });
      const state = createBattle(
        testContent([encounter]),
        `e-mag-${level}`,
        [{ ...VALE, level, disposition: { resolve: 50, attunement: 100 } }],
        [{ unitId: "vale", position: { x: 1, y: 4 }, facing: "north" }],
      ).state;
      const mag = unitStats(state, "vale")?.mag ?? 0;
      const arc = forecast(state, "vale", "arc", { kind: "unit", unitId: "mark" });
      expect(arc[0]?.damage, `arc L${level}`).toBe(Math.floor((mag * 8 * 200) / damageDivisor(level)));
    }
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
    expect(pin?.statusChances).toEqual([{ statusId: "stunned", chance: Math.floor((35 * 92) / 100) }]);
  });
});
