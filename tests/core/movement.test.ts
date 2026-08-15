import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  reachableTiles,
  standHeight,
  type GameState,
} from "../../src/core/index.js";
import type { Encounter, TileCoord } from "../../src/data/index.js";
import { VALE, advanceTo, enemyAt, enforcer, hasTile, testContent, yardEncounter } from "./fixtures.js";

const LIFT_OFF: Encounter["triggers"] = [
  {
    id: "kill-the-lift",
    when: { kind: "battleStart" },
    once: true,
    actions: [{ kind: "setPower", objectId: "freight-lift", powered: false }],
  },
];

function battle(
  id: string,
  enemies: Encounter["enemies"],
  party: Parameters<typeof createBattle>[2],
  deployment: Parameters<typeof createBattle>[3],
  triggers: Encounter["triggers"] = [],
): GameState {
  const encounter = yardEncounter(testContent(), { id, enemies, triggers });
  return createBattle(testContent([encounter]), id, party, deployment).state;
}

const farEnemy = enemyAt(enforcer("mark", "Mark"), { x: 5, y: 0 }, "south");

function tilesOf(state: GameState, unitId: string): TileCoord[] {
  return reachableTiles(state, unitId)
    .filter((r) => r.canStop)
    .map((r) => r.tile);
}

describe("movement", () => {
  it("covers Move range and stops at blocking objects", () => {
    const state = battle(
      "e-move",
      [farEnemy],
      [enforcer("rowen", "Rowen Corvane")],
      [{ unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" }],
    );
    const tiles = tilesOf(state, "rowen");
    expect(hasTile(tiles, { x: 3, y: 2 })).toBe(true);
    expect(hasTile(tiles, { x: 3, y: 1 })).toBe(false);
    // The crate stack occupies (4,2) and (4,3) and blocks movement.
    expect(hasTile(tiles, { x: 4, y: 2 })).toBe(false);
    expect(hasTile(tiles, { x: 4, y: 3 })).toBe(false);
  });

  it("charges double for rough terrain", () => {
    const state = battle(
      "e-rough",
      [farEnemy],
      [enforcer("rowen", "Rowen Corvane")],
      [{ unitId: "rowen", position: { x: 0, y: 4 }, facing: "north" }],
    );
    const reach = reachableTiles(state, "rowen");
    // (0,3) is rough: 2 of the unit's 3 move. (0,2) is rough again: 4, too far.
    expect(reach.find((r) => r.tile.x === 0 && r.tile.y === 3)?.cost).toBe(2);
    expect(reach.some((r) => r.tile.x === 0 && r.tile.y === 2)).toBe(false);
  });

  it("cannot path through enemies", () => {
    const state = battle(
      "e-boxed",
      [
        enemyAt(enforcer("north-guard", "North Guard"), { x: 3, y: 4 }, "south"),
        enemyAt(enforcer("west-guard", "West Guard"), { x: 2, y: 5 }, "east"),
        enemyAt(enforcer("east-guard", "East Guard"), { x: 4, y: 5 }, "west"),
      ],
      [enforcer("rowen", "Rowen Corvane")],
      [{ unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" }],
    );
    expect(tilesOf(state, "rowen")).toEqual([{ x: 3, y: 5 }]);
  });

  it("gates the powered freight lift deck behind Jump", () => {
    const enforcerState = battle(
      "e-jump-2",
      [farEnemy],
      [enforcer("rowen", "Rowen Corvane")],
      [{ unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" }],
    );
    // The lift decks (5,4) at height 2; (5,5) is height 0, a Jump-2 step.
    expect(standHeight(enforcerState, { x: 5, y: 4 })).toBe(2);
    expect(hasTile(tilesOf(enforcerState, "rowen"), { x: 5, y: 4 })).toBe(true);

    const conduitState = battle(
      "e-jump-1",
      [farEnemy],
      [VALE],
      [{ unitId: "vale", position: { x: 3, y: 5 }, facing: "north" }],
    );
    expect(hasTile(tilesOf(conduitState, "vale"), { x: 5, y: 4 })).toBe(false);
  });

  it("drops the lift deck to ground level when its power is cut", () => {
    const state = battle(
      "e-lift-off",
      [farEnemy],
      [VALE],
      [{ unitId: "vale", position: { x: 3, y: 5 }, facing: "north" }],
      LIFT_OFF,
    );
    expect(standHeight(state, { x: 5, y: 4 })).toBe(0);
    expect(hasTile(tilesOf(state, "vale"), { x: 5, y: 4 })).toBe(true);
  });

  it("walks the reported path and faces the last step", () => {
    const state = battle(
      "e-walk",
      [farEnemy],
      [enforcer("rowen", "Rowen Corvane")],
      [{ unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" }],
    );
    const rowensTurn = advanceTo(state, "rowen");
    const result = applyCommand(rowensTurn, { kind: "move", unitId: "rowen", to: { x: 3, y: 2 } });
    expect(result.error).toBeNull();
    const moved = result.events.find((e) => e.type === "UnitMoved");
    expect(moved).toMatchObject({
      unitId: "rowen",
      from: { x: 3, y: 5 },
      to: { x: 3, y: 2 },
      path: [
        { x: 3, y: 5 },
        { x: 3, y: 4 },
        { x: 3, y: 3 },
        { x: 3, y: 2 },
      ],
    });
    expect(result.state.units.find((u) => u.id === "rowen")?.facing).toBe("north");
  });
});
