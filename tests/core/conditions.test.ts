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

  it("wins on an AND group only when every member is met", () => {
    const start = battle("e-all", {
      enemies: [guard, enemyAt(enforcer("dell", "Dell"), { x: 3, y: 3 }, "south")],
      winConditions: [
        { kind: "all", conditions: [{ kind: "defeatUnit", unitId: "mark" }, { kind: "defeatUnit", unitId: "dell" }] },
      ],
    });
    const atVale = advanceTo(start, "vale");
    const fell = (ids: string[]): GameState => ({
      ...atVale,
      units: atVale.units.map((u) => (ids.includes(u.id) ? { ...u, hp: 0, downed: true, ct: 0 } : u)),
    });
    expect(applyCommand(fell(["mark"]), { kind: "endTurn", unitId: "vale" }).state.result).toBeNull();
    expect(applyCommand(fell(["mark", "dell"]), { kind: "endTurn", unitId: "vale" }).state.result).toBe("win");
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

  it("loses when the watched unit reaches the named tiles", () => {
    const state = advanceTo(
      battle("e-escape", {
        lossConditions: [{ kind: "unitReachesTiles", team: "player", tiles: [{ x: 0, y: 4 }] }],
      }),
      "vale",
    );
    const moved = applyCommand(state, { kind: "move", unitId: "vale", to: { x: 0, y: 4 } });
    expect(moved.error).toBeNull();
    expect(moved.state.result).toBe("loss");
  });

  it("ignores a unit the escape condition does not name", () => {
    const state = advanceTo(
      battle("e-escape-named", {
        lossConditions: [{ kind: "unitReachesTiles", unitId: "mark", tiles: [{ x: 0, y: 4 }] }],
      }),
      "vale",
    );
    const moved = applyCommand(state, { kind: "move", unitId: "vale", to: { x: 0, y: 4 } });
    expect(moved.error).toBeNull();
    expect(moved.state.result).toBeNull();
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

  it("fires turnStart even when the clock consumes that turn index whole", () => {
    const start = battle("e-turn-start", {
      enemies: [guard, enemyAt(enforcer("dell", "Dell"), { x: 3, y: 3 }, "south")],
      triggers: trigger("midpoint", { kind: "turnStart", turn: 4 }, [
        { kind: "dialogue", lines: [{ speaker: "Maren Voss", text: "Now." }] },
      ]),
    });
    const state = advanceTo(start, "vale");
    expect(state.turn).toBe(3);
    expect(state.firedTriggerIds).toEqual([]);

    // Everyone but Vale is stunned, so their turns open and close inside
    // advanceClock and the counter jumps clean over index 4.
    const stunned: GameState = {
      ...state,
      units: state.units.map((u) =>
        u.id === "vale" ? u : { ...u, statuses: [{ statusId: "stunned", turnsRemaining: 1 }] },
      ),
    };
    const passed = applyCommand(stunned, { kind: "endTurn", unitId: "vale" });
    expect(passed.error).toBeNull();
    expect(passed.state.turn).toBeGreaterThan(4);
    expect(passed.state.firedTriggerIds).toEqual(["midpoint"]);
    expect(passed.events.some((e) => e.type === "TriggerFired" && e.triggerId === "midpoint")).toBe(true);
  });

  it("runs trigger actions before win and loss are evaluated", () => {
    const start = battle("e-last-words", {
      triggers: trigger("marks-last-words", { kind: "unitDowned", unitId: "mark" }, [
        { kind: "dialogue", lines: [{ speaker: "Mark", text: "Tell them I held." }] },
      ]),
    });
    const frail: GameState = {
      ...start,
      units: start.units.map((u) => (u.id === "mark" ? { ...u, hp: 5 } : u)),
    };
    const state = advanceTo(frail, "vale");
    const struck = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "jolt",
      target: { kind: "unit", unitId: "mark" },
    });
    expect(struck.state.result).toBe("win");
    const dialogue = struck.events.findIndex((e) => e.type === "DialogueRequested");
    const ended = struck.events.findIndex((e) => e.type === "BattleEnded");
    expect(dialogue).toBeGreaterThanOrEqual(0);
    expect(ended).toBeGreaterThanOrEqual(0);
    expect(dialogue).toBeLessThan(ended);
  });

  it("repositions a unit with moveUnit and keeps the destination legal", () => {
    const state = battle("e-withdraw", {
      triggers: trigger("mark-withdraws", { kind: "battleStart" }, [
        { kind: "moveUnit", unitId: "mark", to: { x: 3, y: 1 } },
      ]),
    });
    expect(getUnit(state, "mark")?.position).toEqual({ x: 3, y: 1 });

    const blocked = battle("e-withdraw-blocked", {
      triggers: trigger("mark-withdraws", { kind: "battleStart" }, [
        // The yard cell blocks movement; a script may not park a unit inside it.
        { kind: "moveUnit", unitId: "mark", to: { x: 1, y: 1 } },
      ]),
    });
    expect(getUnit(blocked, "mark")?.position).toEqual({ x: 1, y: 3 });
  });

  it("takes a unit off the field with removeUnit without downing it", () => {
    const state = battle("e-exeunt", {
      triggers: trigger("mark-leaves", { kind: "battleStart" }, [
        { kind: "removeUnit", unitId: "mark" },
      ]),
    });
    expect(getUnit(state, "mark")).toBeNull();
    expect(state.units.map((u) => u.id)).toEqual(["vale"]);
    // A removed unit is not a downed one, so `rout` is not satisfied.
    expect(state.result).toBeNull();
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
