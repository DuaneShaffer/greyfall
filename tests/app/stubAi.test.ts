import { describe, expect, it } from "vitest";
import { activeUnit, applyCommand, type GameState } from "../../src/core/index.js";
import { stubAiCommand } from "../../src/app/stubAi.js";
import { advanceTo, rowen } from "../core/fixtures.js";
import { openBattle, unitPosition, VALE } from "./fixtures.js";

const battle = (): GameState => openBattle([rowen(), VALE]).state;

const distance = (state: GameState, a: string, b: string): number => {
  const first = unitPosition(state, a);
  const second = unitPosition(state, b);
  if (first === null || second === null) return Number.MAX_SAFE_INTEGER;
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
};

describe("stub AI", () => {
  it("only speaks for non-player units", () => {
    const playerTurn = advanceTo(battle(), "rowen");
    expect(stubAiCommand(playerTurn)).toBeNull();
  });

  it("closes on the nearest player unit when it cannot reach anyone", () => {
    const state = advanceTo(battle(), "provocateur-a");
    const before = distance(state, "provocateur-a", "rowen");
    const command = stubAiCommand(state);
    expect(command?.kind).toBe("move");

    const result = applyCommand(state, command!);
    expect(result.error).toBeNull();
    expect(distance(result.state, "provocateur-a", "rowen")).toBeLessThan(before);
  });

  it("emits only legal commands and always ends its turn", () => {
    let state = advanceTo(battle(), "provocateur-a");
    const kinds: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      const acting = activeUnit(state);
      if (acting === null || acting.team === "player") break;
      const command = stubAiCommand(state);
      expect(command).not.toBeNull();
      const result = applyCommand(state, command!);
      expect(result.error).toBeNull();
      kinds.push(command!.kind);
      state = result.state;
    }
    expect(kinds[kinds.length - 1]).toBe("wait");
    expect(activeUnit(state)?.team).toBe("player");
  });

  it("attacks when a player unit is in reach, picking the best forecast", () => {
    // Walk the provocateur into contact by letting both sides pass turns.
    let state = battle();
    for (let step = 0; step < 24; step += 1) {
      const acting = activeUnit(state);
      if (acting === null || state.result !== null) break;
      if (acting.team === "player") {
        const pass = applyCommand(state, { kind: "wait", unitId: acting.id, facing: acting.facing });
        expect(pass.error).toBeNull();
        state = pass.state;
        continue;
      }
      const command = stubAiCommand(state);
      expect(command).not.toBeNull();
      if (command?.kind === "act") {
        expect(command.target.kind).toBe("unit");
        const result = applyCommand(state, command);
        expect(result.error).toBeNull();
        expect(result.events.some((event) => event.type === "AbilityUsed")).toBe(true);
        return;
      }
      const result = applyCommand(state, command!);
      expect(result.error).toBeNull();
      state = result.state;
    }
    throw new Error("the stub AI never found an attack");
  });
});
