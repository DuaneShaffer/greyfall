import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  reachableTiles,
  standHeight,
  type GameState,
} from "../../src/core/index.js";
import { findPath } from "../../src/core/rules/movement.js";
import { unitById } from "../../src/core/rules/grid.js";
import type { Encounter, TileCoord, Unit } from "../../src/data/index.js";
import { VALE, advanceTo, coordEq, enemyAt, enforcer, hasTile, testContent, yardEncounter } from "./fixtures.js";

/** Deployment tiles are ground-level and few, so scripted placement puts a unit where the test needs it. */
function placeAt(unitId: string, to: TileCoord): Encounter["triggers"] {
  return [
    {
      id: `place-${unitId}`,
      when: { kind: "battleStart" },
      once: true,
      actions: [{ kind: "moveUnit", unitId, to }],
    },
  ];
}

function battle(
  id: string,
  enemies: Encounter["enemies"],
  party: readonly Unit[],
  deployment: Parameters<typeof createBattle>[3],
  triggers: Encounter["triggers"] = [],
): GameState {
  const encounter = yardEncounter(testContent(), { id, enemies, triggers });
  return createBattle(testContent([encounter]), id, party, deployment).state;
}

const farEnemy = enemyAt(enforcer("mark", "Mark"), { x: 5, y: 0 }, "south");

const RAILRUNNER: Unit = {
  schemaVersion: 1,
  id: "wick",
  name: "Wick",
  spriteId: "railrunner",
  level: 1,
  jobId: "railrunner",
  disposition: { resolve: 55, attunement: 45 },
  learnedAbilityIds: [],
  equipment: {},
};

function withMovement(unit: Unit, movementAbilityId: string): Unit {
  return { ...unit, movementAbilityId };
}

function tilesOf(state: GameState, unitId: string): TileCoord[] {
  return reachableTiles(state, unitId)
    .filter((r) => r.canStop)
    .map((r) => r.tile);
}

function entry(state: GameState, unitId: string, tile: TileCoord) {
  return reachableTiles(state, unitId).find((r) => coordEq(r.tile, tile));
}

// The freight lift decks (5,4) two above the ground it stands on, which is one
// more than a Conduit's Jump of 1 — the lip both vault allowances exist to clear.
const DECK: TileCoord = { x: 5, y: 4 };

describe("vault (Leg Up)", () => {
  const yardHand = enforcer("hand", "Yard Hand");

  function vaultBattle(id: string, movement: string | null, allyTile: TileCoord): GameState {
    const vale = movement === null ? VALE : withMovement(VALE, movement);
    return battle(
      id,
      [farEnemy],
      [vale, yardHand],
      [
        { unitId: "vale", position: { x: 3, y: 5 }, facing: "north" },
        { unitId: "hand", position: { x: 1, y: 5 }, facing: "north" },
      ],
      placeAt("hand", allyTile),
    );
  }

  it("clears a lip the unit's own Jump cannot, off an ally's shoulders", () => {
    const state = vaultBattle("e-vault", "leg-up", { x: 5, y: 5 });
    expect(standHeight(state, DECK)).toBe(2);
    expect(hasTile(tilesOf(state, "vale"), DECK)).toBe(true);
  });

  it("needs the ally on the tile it launches from, not merely the passive", () => {
    expect(hasTile(tilesOf(vaultBattle("e-no-boost", "leg-up", { x: 3, y: 4 }), "vale"), DECK)).toBe(false);
    expect(hasTile(tilesOf(vaultBattle("e-no-passive", null, { x: 5, y: 5 }), "vale"), DECK)).toBe(false);
  });

  it("treats the ally's tile as a step and not a landing", () => {
    const state = vaultBattle("e-vault-stop", "leg-up", { x: 5, y: 5 });
    expect(entry(state, "vale", { x: 5, y: 5 })?.canStop).toBe(false);
  });

  it("hands the command layer the same tile the reachable query offers", () => {
    const state = vaultBattle("e-vault-move", "leg-up", { x: 5, y: 5 });
    const result = applyCommand(advanceTo(state, "vale"), { kind: "move", unitId: "vale", to: DECK });
    expect(result.error).toBeNull();
    expect(unitById(result.state, "vale")?.position).toEqual(DECK);
  });
});

describe("run-through (Right of Way)", () => {
  // (2,y) is the rail column; (1,4) is plain ground beside it.
  const onRail = enemyAt(enforcer("shunter", "Shunter"), { x: 2, y: 4 }, "south");
  const offRail = enemyAt(enforcer("picket", "Picket"), { x: 1, y: 4 }, "south");

  function railBattle(id: string, movement: string | null): GameState {
    const runner = movement === null ? RAILRUNNER : withMovement(RAILRUNNER, movement);
    return battle(id, [onRail, offRail], [runner], [
      { unitId: "wick", position: { x: 1, y: 5 }, facing: "north" },
    ]);
  }

  it("walks the line through whoever is standing on it", () => {
    const state = railBattle("e-row", "right-of-way");
    const path = findPath(state, unitById(state, "wick")!, { x: 2, y: 2 });
    expect(path).not.toBeNull();
    expect(path!.some((tile) => coordEq(tile, { x: 2, y: 4 }))).toBe(true);
    expect(entry(state, "wick", { x: 2, y: 4 })?.canStop).toBe(false);
  });

  it("leaves the same body impassable off the rail", () => {
    const state = railBattle("e-row-off", "right-of-way");
    expect(entry(state, "wick", { x: 1, y: 4 })).toBeUndefined();
  });

  it("is the whole difference: without it the two bodies seal the line", () => {
    const state = railBattle("e-no-row", null);
    expect(entry(state, "wick", { x: 2, y: 4 })).toBeUndefined();
    expect(findPath(state, unitById(state, "wick")!, { x: 2, y: 2 })).toBeNull();
  });

  it("catches a hook deck two above the ground", () => {
    const decked = battle("e-deck", [farEnemy], [withMovement(VALE, "right-of-way")], [
      { unitId: "vale", position: { x: 3, y: 5 }, facing: "north" },
    ]);
    expect(hasTile(tilesOf(decked, "vale"), DECK)).toBe(true);
    const bare = battle("e-deck-bare", [farEnemy], [VALE], [
      { unitId: "vale", position: { x: 3, y: 5 }, facing: "north" },
    ]);
    expect(hasTile(tilesOf(bare, "vale"), DECK)).toBe(false);
  });
});
