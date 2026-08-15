import { describe, expect, it } from "vitest";
import { activeUnit, applyCommand, createBattle, getUnit, type GameState } from "../../src/core/index.js";
import type { Encounter } from "../../src/data/index.js";
import { VALE, advanceTo, enemyAt, enforcer, testContent, yardEncounter } from "./fixtures.js";

const guard = enemyAt(enforcer("mark", "Mark"), { x: 1, y: 3 }, "south");

function battle(id: string, overrides: Partial<Parameters<typeof yardEncounter>[1]> = {}): GameState {
  const encounter = yardEncounter(testContent(), {
    id,
    enemies: [guard],
    triggers: [],
    ...overrides,
  });
  return createBattle(testContent([encounter]), id, [VALE], [
    { unitId: "vale", position: { x: 1, y: 4 }, facing: "north" },
  ]).state;
}

/** Pass turns until the battle resolves or `limit` turns go by. */
function passTurns(state: GameState, limit = 20): GameState {
  let current = state;
  for (let i = 0; i < limit && current.result === null; i += 1) {
    const active = activeUnit(current);
    if (active === null) break;
    current = applyCommand(current, { kind: "endTurn", unitId: active.id }).state;
  }
  return current;
}

describe("win and loss conditions", () => {
  it("wins by reaching the named tiles", () => {
    const state = advanceTo(
      battle("e-reach", { winConditions: [{ kind: "reachTiles", tiles: [{ x: 0, y: 4 }], unitId: "vale" }] }),
      "vale",
    );
    const moved = applyCommand(state, { kind: "move", unitId: "vale", to: { x: 0, y: 4 } });
    expect(moved.error).toBeNull();
    expect(moved.state.result).toBe("win");
    expect(moved.events.some((e) => e.type === "BattleEnded" && e.result === "win")).toBe(true);
  });

  it("wins by surviving a set number of turns", () => {
    const state = passTurns(battle("e-survive", { winConditions: [{ kind: "surviveTurns", turns: 4 }] }));
    expect(state.result).toBe("win");
    expect(state.turn).toBeGreaterThanOrEqual(4);
  });

  it("loses when the turn limit runs out, and loss beats win", () => {
    const state = passTurns(
      battle("e-limit", {
        winConditions: [{ kind: "surviveTurns", turns: 3 }],
        lossConditions: [{ kind: "turnLimit", turns: 2 }],
      }),
    );
    expect(state.result).toBe("loss");
  });

  it("loses when a must-survive unit goes down", () => {
    const start = battle("e-protect", {
      lossConditions: [{ kind: "unitDowned", unitId: "vale" }],
    });
    const frail: GameState = {
      ...start,
      units: start.units.map((u) => (u.id === "vale" ? { ...u, hp: 1 } : u)),
    };
    const state = advanceTo(frail, "mark");
    const struck = applyCommand(state, {
      kind: "act",
      unitId: "mark",
      abilityId: "pin",
      target: { kind: "unit", unitId: "vale" },
    });
    expect(getUnit(struck.state, "vale")?.downed).toBe(true);
    expect(struck.state.result).toBe("loss");
  });
});

describe("encounter triggers", () => {
  const trigger = (id: string, when: Encounter["triggers"][number]["when"], actions: Encounter["triggers"][number]["actions"]) =>
    [{ id, when, once: true, actions }] satisfies Encounter["triggers"];

  it("fires when a unit steps onto the watched tiles", () => {
    const state = advanceTo(
      battle("e-trip", {
        triggers: trigger(
          "tripwire",
          { kind: "unitEntersTiles", tiles: [{ x: 0, y: 4 }], team: "player" },
          [{ kind: "dialogue", lines: [{ speaker: "Watch Sergeant", text: "Hold there." }] }],
        ),
      }),
      "vale",
    );
    const moved = applyCommand(state, { kind: "move", unitId: "vale", to: { x: 0, y: 4 } });
    expect(moved.events.some((e) => e.type === "TriggerFired" && e.triggerId === "tripwire")).toBe(true);
    expect(moved.events.some((e) => e.type === "DialogueRequested")).toBe(true);
  });

  it("fires on an HP threshold and can end the battle outright", () => {
    const state = advanceTo(
      battle("e-threshold", {
        triggers: trigger("mark-folds", { kind: "unitHpBelowPercent", unitId: "mark", percent: 50 }, [
          { kind: "endBattle", result: "win" },
        ]),
      }),
      "vale",
    );
    // Jolt deals a flat 40 against Mark's 61 HP: 21 left, under half.
    const struck = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "jolt",
      target: { kind: "unit", unitId: "mark" },
    });
    expect(getUnit(struck.state, "mark")?.hp).toBe(21);
    expect(struck.events.some((e) => e.type === "TriggerFired" && e.triggerId === "mark-folds")).toBe(true);
    expect(struck.state.result).toBe("win");
  });

  it("spawns reinforcements through the same unit-creation path", () => {
    const state = battle("e-spawn-units", {
      triggers: trigger("reinforce", { kind: "battleStart" }, [
        {
          kind: "spawnUnits",
          units: [enemyAt(enforcer("late-arrival", "Late Arrival"), { x: 5, y: 5 }, "west")],
        },
      ]),
    });
    expect(state.units.map((u) => u.id)).toEqual(["late-arrival", "mark", "vale"]);
    const arrival = getUnit(state, "late-arrival");
    expect(arrival?.team).toBe("enemy");
    expect(arrival?.hp).toBe(61);
    expect(arrival?.position).toEqual({ x: 5, y: 5 });
  });

  it("only fires a once trigger a single time", () => {
    const start = battle("e-once", {
      triggers: trigger("opening", { kind: "battleStart" }, [
        { kind: "dialogue", lines: [{ speaker: "Maren Voss", text: "Again, then." }] },
      ]),
    });
    expect(start.firedTriggerIds).toEqual(["opening"]);
    const later = passTurns(start, 4);
    expect(later.firedTriggerIds).toEqual(["opening"]);
  });
});
