import { describe, expect, it } from "vitest";
import {
  affectedTiles,
  applyCommand,
  createBattle,
  getObject,
  getUnit,
  reachableTiles,
  type GameState,
} from "../../src/core/index.js";
import { VALE, advanceTo, enemyAt, enforcer, hasTile, testContent, yardEncounter } from "./fixtures.js";

/** Vale at (1,4) with a yard hand right in front of her at (1,3). */
function bench(id: string): GameState {
  const encounter = yardEncounter(testContent(), {
    id,
    enemies: [enemyAt(enforcer("mark", "Mark"), { x: 1, y: 3 }, "south")],
    triggers: [],
  });
  return advanceTo(
    createBattle(testContent([encounter]), id, [VALE], [
      { unitId: "vale", position: { x: 1, y: 4 }, facing: "north" },
    ]).state,
    "vale",
  );
}

describe("effect vocabulary", () => {
  it("damages and repairs object integrity", () => {
    const state = bench("e-fx-object");
    const tapped = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "tap",
      target: { kind: "object", objectId: "yard-cell" },
    });
    expect(tapped.error).toBeNull();
    expect(getObject(tapped.state, "yard-cell")?.hp).toBe(15);

    const next = advanceTo(applyCommand(tapped.state, { kind: "endTurn", unitId: "vale" }).state, "vale");
    const patched = applyCommand(next, {
      kind: "act",
      unitId: "vale",
      abilityId: "patch",
      target: { kind: "object", objectId: "yard-cell" },
    });
    expect(getObject(patched.state, "yard-cell")?.hp).toBe(18);
  });

  it("shoves a unit away from the caster and stops at obstacles", () => {
    const state = bench("e-fx-shove");
    // Two tiles of push, but the flux cell blocks (1,1), so Mark stops at (1,2).
    const shoved = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "shove",
      target: { kind: "unit", unitId: "mark" },
    });
    expect(shoved.error).toBeNull();
    expect(shoved.events.find((e) => e.type === "UnitForcedMove")).toMatchObject({
      unitId: "mark",
      from: { x: 1, y: 3 },
      to: { x: 1, y: 2 },
    });
    expect(getUnit(shoved.state, "mark")?.position).toEqual({ x: 1, y: 2 });
  });

  it("spawns a turret owned by the acting team that then blocks movement", () => {
    const state = bench("e-fx-spawn");
    const built = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "frame",
      target: { kind: "tile", tile: { x: 0, y: 4 } },
    });
    expect(built.error).toBeNull();
    const spawned = built.events.find((e) => e.type === "ObjectSpawned");
    expect(spawned).toMatchObject({ kind: "turret", owner: "player", tiles: [{ x: 0, y: 4 }] });
    const turret = getObject(built.state, spawned?.objectId ?? "");
    expect(turret?.hp).toBe(12);
    expect(turret?.def.blocksMovement).toBe(true);

    const next = advanceTo(applyCommand(built.state, { kind: "endTurn", unitId: "vale" }).state, "vale");
    expect(hasTile(reachableTiles(next, "vale").map((r) => r.tile), { x: 0, y: 4 })).toBe(false);
  });

  it("siphons flux from the target into the caster", () => {
    const full = bench("e-fx-siphon");
    const state: GameState = {
      ...full,
      units: full.units.map((u) => (u.id === "vale" ? { ...u, charge: 5 } : u)),
    };
    const siphoned = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "siphon",
      target: { kind: "unit", unitId: "mark" },
    });
    expect(siphoned.error).toBeNull();
    // Mark carries 7 flux; 5 of it moves across.
    expect(getUnit(siphoned.state, "mark")?.charge).toBe(2);
    expect(getUnit(siphoned.state, "vale")?.charge).toBe(10);
  });
});

describe("area shapes", () => {
  it("covers a Manhattan disc for radius abilities", () => {
    const state = bench("e-area-radius");
    const tiles = affectedTiles(state, "vale", "kettle", { kind: "tile", tile: { x: 1, y: 2 } });
    expect(tiles).toEqual([
      { x: 1, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 3 },
    ]);
  });

  it("runs outward from the caster for line abilities", () => {
    const state = bench("e-area-line");
    const tiles = affectedTiles(state, "vale", "lance", { kind: "tile", tile: { x: 1, y: 2 } });
    expect(tiles).toEqual([
      { x: 1, y: 3 },
      { x: 1, y: 2 },
      { x: 1, y: 1 },
    ]);
  });

  it("hits everyone standing in the area, allies included", () => {
    const state = bench("e-area-hit");
    const struck = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "lance",
      target: { kind: "tile", tile: { x: 1, y: 2 } },
    });
    expect(struck.error).toBeNull();
    expect(struck.events.filter((e) => e.type === "DamageDealt").map((e) => e.unitId)).toEqual(["mark"]);
  });
});
