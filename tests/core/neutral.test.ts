import { describe, expect, it } from "vitest";
import type { Encounter, Facing, Team, TileCoord, Unit } from "../../src/data/index.js";
import { applyCommand, createBattle, forecast, getUnit, type GameState } from "../../src/core/index.js";
import { chooseCommand } from "../../src/core/ai/index.js";
import { reachableTiles } from "../../src/core/rules/movement.js";
import { advanceTo, enforcer, hasTile, testContent, yardEncounter } from "./fixtures.js";

function at(unit: Unit, team: Team, position: TileCoord, facing: Facing = "north") {
  return { unit, team, position, facing };
}

function battle(id: string, placements: Encounter["enemies"], overrides: Partial<Parameters<typeof yardEncounter>[1]> = {}): GameState {
  const encounter = yardEncounter(testContent(), { id, enemies: placements, triggers: [], ...overrides });
  return createBattle(testContent([encounter]), id, [], []).state;
}

/** Jory Slate standing on the floor: present, and nobody's enemy. */
const bystander = (id: string) => enforcer(id, id, { learnedAbilityIds: [] });

describe("neutral units", () => {
  it("are hostile to neither side, so both may walk through them", () => {
    const state = battle("e-neutral-path", [
      at(enforcer("rowen", "Rowen"), "player", { x: 1, y: 5 }),
      at(bystander("jory"), "neutral", { x: 1, y: 4 }),
      at(enforcer("watch", "Watch"), "enemy", { x: 5, y: 0 }),
    ]);

    const tiles = reachableTiles(state, getUnit(state, "rowen")!);
    const through = tiles.find((t) => t.tile.x === 1 && t.tile.y === 4);
    expect(through).toBeDefined();
    // Walked through like an ally, never stopped on.
    expect(through?.canStop).toBe(false);
    expect(hasTile(tiles.filter((t) => t.canStop).map((t) => t.tile), { x: 1, y: 3 })).toBe(true);
  });

  it("are never missed and never counted as enemies by the forecast", () => {
    const state = advanceTo(
      battle("e-neutral-forecast", [
        at(enforcer("rowen", "Rowen"), "player", { x: 1, y: 4 }),
        at(bystander("jory"), "neutral", { x: 1, y: 3 }),
        at(enforcer("watch", "Watch"), "enemy", { x: 5, y: 0 }),
      ]),
      "rowen",
    );
    const entry = forecast(state, "rowen", "basic-attack", { kind: "unit", unitId: "jory" })[0];
    expect(entry?.hitChance).toBe(100);
  });

  it("are ignored by AI targeting even when they are the only thing in reach", () => {
    const state = advanceTo(
      battle("e-neutral-ai", [
        at(enforcer("watch", "Watch"), "enemy", { x: 1, y: 4 }),
        at(bystander("jory"), "neutral", { x: 1, y: 3 }),
        at(enforcer("rowen", "Rowen"), "player", { x: 5, y: 0 }),
      ]),
      "watch",
    );
    const before = getUnit(state, "jory")?.hp ?? 0;
    let current = state;
    for (let step = 0; step < 4 && current.activeTurn?.unitId === "watch"; step += 1) {
      const command = chooseCommand(current);
      expect(command.kind === "act" && command.target).not.toEqual({ kind: "unit", unitId: "jory" });
      current = applyCommand(current, command).state;
    }
    expect(getUnit(current, "jory")?.hp).toBe(before);
  });

  it("are not counted by rout", () => {
    const start = battle(
      "e-neutral-rout",
      [
        at(enforcer("rowen", "Rowen"), "player", { x: 1, y: 4 }),
        at(bystander("jory"), "neutral", { x: 1, y: 3 }),
        at(enforcer("watch", "Watch", { learnedAbilityIds: [] }), "enemy", { x: 1, y: 2 }),
      ],
      { winConditions: [{ kind: "rout" }] },
    );
    const fallen: GameState = {
      ...start,
      units: start.units.map((u) => (u.id === "watch" ? { ...u, hp: 0, downed: true, ct: 0 } : u)),
    };
    const state = advanceTo(fallen, "rowen");
    const settled = applyCommand(state, { kind: "endTurn", unitId: "rowen" });
    // Jory is still standing; the enemy team is still routed.
    expect(getUnit(settled.state, "jory")?.downed).toBe(false);
    expect(settled.state.result).toBe("win");
  });

  it("are not counted by partyRout", () => {
    const start = battle("e-neutral-party-rout", [
      at(enforcer("rowen", "Rowen"), "player", { x: 1, y: 4 }),
      at(bystander("jory"), "neutral", { x: 1, y: 3 }),
      at(enforcer("watch", "Watch"), "enemy", { x: 1, y: 2 }),
    ]);
    const fallen: GameState = {
      ...start,
      units: start.units.map((u) => (u.id === "rowen" ? { ...u, hp: 0, downed: true, ct: 0 } : u)),
    };
    const state = advanceTo(fallen, "watch");
    const settled = applyCommand(state, { kind: "endTurn", unitId: "watch" });
    // Jory standing on the player's side of the yard does not keep the party alive.
    expect(getUnit(settled.state, "jory")?.downed).toBe(false);
    expect(settled.state.result).toBe("loss");
  });
});
