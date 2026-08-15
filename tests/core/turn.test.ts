import { describe, expect, it } from "vitest";
import {
  activeUnit,
  applyCommand,
  createBattle,
  CT_COST_MOVE_AND_ACT,
  CT_COST_NEITHER,
  CT_COST_SINGLE,
  getUnit,
  turnOrderPreview,
  type CommandResult,
  type GameState,
} from "../../src/core/index.js";
import { VALE, advanceTo, enemyAt, enforcer, testContent, yardEncounter } from "./fixtures.js";

function ctSpent(result: CommandResult, unitId: string): number | undefined {
  for (const event of result.events) {
    if (event.type === "TurnEnded" && event.unitId === unitId) return event.ctSpent;
  }
  return undefined;
}

function ctBattle(id: string): GameState {
  const encounter = yardEncounter(testContent(), {
    id,
    enemies: [enemyAt(enforcer("mark", "Mark"), { x: 5, y: 0 }, "south")],
    triggers: [],
  });
  return createBattle(testContent([encounter]), id, [VALE], [
    { unitId: "vale", position: { x: 1, y: 5 }, facing: "north" },
  ]).state;
}

describe("CT turn engine", () => {
  it("banks Speed per tick and grants a turn at 100 CT", () => {
    const state = ctBattle("e-ct-start");
    // Both units have Speed 6, so 17 ticks put them at 102 CT.
    expect(state.clock).toBe(17);
    expect(getUnit(state, "mark")?.ct).toBe(102);
    expect(activeUnit(state)?.id).toBe("mark");
  });

  it("charges 60 CT for waiting, 80 for one action, 100 for both", () => {
    const state = ctBattle("e-ct-cost");
    const waited = applyCommand(state, { kind: "endTurn", unitId: "mark" });

    expect(ctSpent(waited, "mark")).toBe(CT_COST_NEITHER);

    const valesTurn = advanceTo(state, "vale");
    const moved = applyCommand(valesTurn, { kind: "move", unitId: "vale", to: { x: 1, y: 4 } });
    const movedOnly = applyCommand(moved.state, { kind: "endTurn", unitId: "vale" });
    expect(ctSpent(movedOnly, "vale")).toBe(CT_COST_SINGLE);

    const acted = applyCommand(moved.state, {
      kind: "act",
      unitId: "vale",
      abilityId: "surge",
      target: { kind: "unit", unitId: "vale" },
    });
    const both = applyCommand(acted.state, { kind: "endTurn", unitId: "vale" });
    expect(ctSpent(both, "vale")).toBe(CT_COST_MOVE_AND_ACT);
  });

  it("applies ctMultiplierPercent statuses to CT gain", () => {
    const state = advanceTo(ctBattle("e-ct-haste"), "vale");
    const surged = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "surge",
      target: { kind: "unit", unitId: "vale" },
    });
    expect(surged.error).toBeNull();
    expect(getUnit(surged.state, "vale")?.statuses).toEqual([{ statusId: "surged", turnsRemaining: null }]);

    const next = applyCommand(surged.state, { kind: "endTurn", unitId: "vale" });
    // Vale banks floor(6 * 150 / 100) = 9 per tick and overtakes Mark's 6.
    expect(activeUnit(next.state)?.id).toBe("vale");
    expect(next.state.clock).toBe(26);
  });

  it("previews the turn order without consuming randomness", () => {
    const state = ctBattle("e-ct-preview");
    const before = JSON.stringify(state);
    const order = turnOrderPreview(state, 4);
    expect(JSON.stringify(state)).toBe(before);
    expect(order.map((e) => e.id)).toEqual(["mark", "vale", "mark", "vale"]);
  });
});

describe("charged abilities", () => {
  function chargeBattle(): GameState {
    const encounter = yardEncounter(testContent(), {
      id: "e-charge",
      enemies: [enemyAt(enforcer("mark", "Mark"), { x: 5, y: 0 }, "south")],
      triggers: [],
    });
    return createBattle(testContent([encounter]), "e-charge", [VALE], [
      { unitId: "vale", position: { x: 1, y: 4 }, facing: "north" },
    ]).state;
  }

  it("rides its own CT timeline and ends the caster's turn immediately", () => {
    const state = advanceTo(chargeBattle(), "vale");
    const cast = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "overload-cell",
      target: { kind: "object", objectId: "yard-cell" },
    });
    expect(cast.error).toBeNull();
    expect(cast.events.some((e) => e.type === "AbilityCharging")).toBe(true);
    const charging = cast.events.find((e) => e.type === "AbilityCharging");
    expect(charging).toMatchObject({ abilityId: "overload-cell", castSpeed: 25 });
    // Flux is spent up front: 22 charge minus the ability's 8.
    expect(getUnit(cast.state, "vale")?.charge).toBe(14);
    expect(cast.state.activeTurn?.unitId).not.toBe("vale");

    // castSpeed 25 reaches 100 CT four ticks after the cast (clock 17 -> 21),
    // well before Mark's next turn at clock 27.
    const clocks = cast.events.filter((e) => e.type === "ClockAdvanced").map((e) => e.clock);
    expect(clocks).toEqual([21, 27]);
    const order = cast.events.map((e) => e.type);
    expect(order.indexOf("AbilityCharging")).toBeLessThan(order.indexOf("ObjectDestroyed"));
    expect(order.indexOf("ObjectDestroyed")).toBeLessThan(order.lastIndexOf("TurnStarted"));
    expect(cast.state.charges).toHaveLength(0);
  });
});
