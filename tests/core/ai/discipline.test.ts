import { describe, expect, it } from "vitest";
import { applyCommand, createBattle, type Command, type GameState } from "../../../src/core/index.js";
import { chooseCommand, enemyCommand } from "../../../src/core/ai/index.js";
import { VALE, advanceTo, rowen, testContent, YARD_ENCOUNTER_ID } from "../fixtures.js";
import { at, conduit, medic, playBattle, watchman, yardBattle } from "./fixtures.js";

/** The shipped opening battle, both sides handed to the AI. */
function marshalingYard(): GameState {
  return createBattle(testContent(), YARD_ENCOUNTER_ID, [rowen(), VALE], [
    { unitId: "rowen", position: { x: 0, y: 4 }, facing: "north" },
    { unitId: "vale", position: { x: 1, y: 4 }, facing: "north" },
  ]).state;
}

const scenarios: Record<string, () => GameState> = {
  "shipped encounter": marshalingYard,
  "melee against melee": () =>
    yardBattle([
      at(watchman("brute"), "enemy", { x: 4, y: 0 }, "south"),
      at(watchman("mark"), "player", { x: 0, y: 5 }, "north"),
    ]),
  "mixed six": () =>
    yardBattle([
      at(watchman("brute"), "enemy", { x: 4, y: 0 }, "south"),
      at(conduit("sparks"), "enemy", { x: 5, y: 0 }, "south"),
      at(medic("mercy"), "enemy", { x: 3, y: 0 }, "south"),
      at(watchman("rowen"), "player", { x: 0, y: 4 }, "north"),
      at(conduit("vale"), "player", { x: 1, y: 4 }, "north"),
      at(watchman("harl"), "player", { x: 0, y: 5 }, "north"),
    ]),
  "across the crates": () =>
    yardBattle([
      at(watchman("brute"), "enemy", { x: 5, y: 1 }, "south"),
      at(medic("mercy"), "enemy", { x: 5, y: 0 }, "south"),
      at(watchman("mark"), "player", { x: 3, y: 4 }, "north"),
      at(conduit("vale"), "player", { x: 2, y: 5 }, "north"),
    ]),
  "on the lift": () =>
    yardBattle([
      at(watchman("perch"), "enemy", { x: 5, y: 4 }, "west"),
      at(watchman("mark"), "player", { x: 0, y: 0 }, "south"),
      at(conduit("sparks"), "player", { x: 1, y: 3 }, "south"),
    ]),
};

describe("determinism", () => {
  it("answers the same state with the same command", () => {
    for (const build of Object.values(scenarios)) {
      let state = build();
      for (let step = 0; step < 40 && state.result === null && state.activeTurn !== null; step += 1) {
        const first = chooseCommand(state);
        expect(chooseCommand(state)).toEqual(first);
        state = applyCommand(state, first).state;
      }
    }
  });

  it("leaves the state it read untouched", () => {
    const state = advanceTo(marshalingYard(), "provocateur-a");
    const before = JSON.stringify(state);
    chooseCommand(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("replays a whole battle command for command", () => {
    const first = playBattle(marshalingYard());
    const second = playBattle(marshalingYard());
    expect(second.commands).toEqual(first.commands);
    expect(second.state.result).toBe(first.state.result);
    expect(second.state.turn).toBe(first.state.turn);
  });
});

describe("legality", () => {
  it("only ever emits commands the core accepts", () => {
    for (const [name, build] of Object.entries(scenarios)) {
      let state = build();
      let issued = 0;
      while (state.result === null && state.activeTurn !== null && issued < 600) {
        const command: Command = chooseCommand(state);
        const result = applyCommand(state, command);
        expect(result.error, `${name}: ${JSON.stringify(command)}`).toBeNull();
        state = result.state;
        issued += 1;
      }
      expect(issued, name).toBeGreaterThan(0);
    }
  });

  it("never moves a unit onto the tile it already stands on", () => {
    for (const build of Object.values(scenarios)) {
      let state = build();
      for (let step = 0; step < 120 && state.result === null && state.activeTurn !== null; step += 1) {
        const command = chooseCommand(state);
        if (command.kind === "move") {
          const actor = state.units.find((unit) => unit.id === command.unitId);
          expect(actor?.position).not.toEqual(command.to);
        }
        state = applyCommand(state, command).state;
      }
    }
  });

  it("throws only when nobody is taking a turn, and speaks only for the AI", () => {
    const state = advanceTo(marshalingYard(), "rowen");
    expect(enemyCommand(state)).toBeNull();
    expect(enemyCommand(advanceTo(state, "provocateur-a"))).not.toBeNull();

    const idle: GameState = { ...state, activeTurn: null };
    expect(() => chooseCommand(idle)).toThrow();
    expect(enemyCommand(idle)).toBeNull();
  });
});

describe("a battle it plays against itself", () => {
  it("resolves the shipped encounter inside a bounded command count", () => {
    const played = playBattle(marshalingYard(), 400);
    expect(played.state.result).not.toBeNull();
    expect(played.commands.length).toBeLessThan(400);
    expect(played.commands.filter((command) => command.kind === "act").length).toBeGreaterThan(0);
  });

  it("resolves a six-unit brawl rather than stalling", () => {
    const build = scenarios["mixed six"];
    expect(build).toBeDefined();
    if (build === undefined) return;
    const played = playBattle(build(), 1200);
    expect(played.state.result).not.toBeNull();
    expect(played.commands.length).toBeLessThan(1200);
  });
});
