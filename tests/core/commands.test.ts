import { describe, expect, it } from "vitest";
import { applyCommand, createBattle, type GameState } from "../../src/core/index.js";
import { VALE, advanceTo, enemyAt, enforcer, rowen, testContent, yardEncounter } from "./fixtures.js";

function battle(): GameState {
  const encounter = yardEncounter(testContent(), {
    id: "e-commands",
    enemies: [enemyAt(enforcer("mark", "Mark"), { x: 5, y: 0 }, "south")],
    triggers: [],
  });
  return createBattle(testContent([encounter]), "e-commands", [rowen(), VALE], [
    { unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" },
    { unitId: "vale", position: { x: 1, y: 5 }, facing: "north" },
  ]).state;
}

describe("command validation", () => {
  it("rejects commands from a unit that is not taking its turn", () => {
    const state = advanceTo(battle(), "rowen");
    const result = applyCommand(state, { kind: "endTurn", unitId: "vale" });
    expect(result.error?.code).toBe("not-active-unit");
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it("rejects unreachable destinations and repeat moves", () => {
    const state = advanceTo(battle(), "rowen");
    expect(applyCommand(state, { kind: "move", unitId: "rowen", to: { x: 5, y: 0 } }).error?.code).toBe(
      "unreachable",
    );
    const moved = applyCommand(state, { kind: "move", unitId: "rowen", to: { x: 3, y: 4 } });
    expect(applyCommand(moved.state, { kind: "move", unitId: "rowen", to: { x: 3, y: 3 } }).error?.code).toBe(
      "already-moved",
    );
  });

  it("rejects abilities the unit has not learned and ids that do not exist", () => {
    const state = advanceTo(battle(), "rowen");
    expect(
      applyCommand(state, {
        kind: "act",
        unitId: "rowen",
        abilityId: "overload-cell",
        target: { kind: "object", objectId: "yard-cell" },
      }).error?.code,
    ).toBe("ability-not-available");
    expect(
      applyCommand(state, {
        kind: "act",
        unitId: "rowen",
        abilityId: "not-a-thing",
        target: { kind: "tile", tile: { x: 3, y: 4 } },
      }).error?.code,
    ).toBe("unknown-ability");
  });

  it("rejects out-of-range and mistyped targets", () => {
    const state = advanceTo(battle(), "rowen");
    expect(
      applyCommand(state, {
        kind: "act",
        unitId: "rowen",
        abilityId: "pin",
        target: { kind: "unit", unitId: "mark" },
      }).error?.code,
    ).toBe("out-of-range");
    expect(
      applyCommand(state, {
        kind: "act",
        unitId: "rowen",
        abilityId: "pin",
        target: { kind: "tile", tile: { x: 3, y: 4 } },
      }).error?.code,
    ).toBe("invalid-target");
  });

  it("rejects a second action in the same turn", () => {
    const state = advanceTo(battle(), "rowen");
    const acted = applyCommand(state, {
      kind: "activateObject",
      unitId: "rowen",
      objectId: "yard-switch",
    });
    expect(acted.error).toBeNull();
    expect(
      applyCommand(acted.state, { kind: "activateObject", unitId: "rowen", objectId: "yard-switch" }).error
        ?.code,
    ).toBe("already-acted");
  });

  it("requires adjacency and a known object to operate machinery", () => {
    const state = advanceTo(battle(), "vale");
    expect(
      applyCommand(state, { kind: "activateObject", unitId: "vale", objectId: "yard-switch" }).error?.code,
    ).toBe("not-adjacent");
    expect(
      applyCommand(state, { kind: "activateObject", unitId: "vale", objectId: "no-such-lever" }).error?.code,
    ).toBe("unknown-object");
    expect(
      applyCommand(state, { kind: "activateObject", unitId: "vale", objectId: "crate-stack" }).error?.code,
    ).toBe("not-operable");
  });

  it("rejects insufficient flux", () => {
    const state = advanceTo(battle(), "vale");
    const drained: GameState = {
      ...state,
      units: state.units.map((u) => (u.id === "vale" ? { ...u, charge: 0 } : u)),
    };
    expect(
      applyCommand(drained, {
        kind: "act",
        unitId: "vale",
        abilityId: "overload-cell",
        target: { kind: "object", objectId: "yard-cell" },
      }).error?.code,
    ).toBe("insufficient-charge");
  });

  it("sets facing on wait and ends the turn", () => {
    const state = advanceTo(battle(), "rowen");
    const result = applyCommand(state, { kind: "wait", unitId: "rowen", facing: "east" });
    expect(result.error).toBeNull();
    expect(result.state.units.find((u) => u.id === "rowen")?.facing).toBe("east");
    expect(result.events.some((e) => e.type === "TurnEnded" && e.unitId === "rowen")).toBe(true);
  });
});
