import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  getObject,
  getUnit,
  standHeight,
  type GameState,
} from "../../src/core/index.js";
import { VALE, advanceTo, enemyAt, enforcer, rowen, testContent, yardEncounter } from "./fixtures.js";

/** Vale deployed at (1,4), a yard hand standing beside the flux cell at (2,1). */
function cellBattle(): GameState {
  const encounter = yardEncounter(testContent(), {
    id: "e-cell",
    enemies: [enemyAt(enforcer("yard-hand", "Yard Hand"), { x: 2, y: 1 }, "north")],
  });
  return createBattle(testContent([encounter]), "e-cell", [VALE], [
    { unitId: "vale", position: { x: 1, y: 4 }, facing: "north" },
  ]).state;
}

describe("the flux cell chain", () => {
  it("overloads the cell, flares the adjacent tiles, and fires the encounter trigger", () => {
    const state = advanceTo(cellBattle(), "vale");
    expect(getObject(state, "yard-cell")?.hp).toBe(20);
    expect(getUnit(state, "yard-hand")?.hp).toBe(61);

    const cast = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "overload-cell",
      target: { kind: "object", objectId: "yard-cell" },
    });
    expect(cast.error).toBeNull();
    // Instant cast: the whole chain lands in the same command batch.
    const fired = cast;

    // 70 integrity damage against 20 hp destroys the cell outright.
    const damaged = fired.events.find((e) => e.type === "ObjectDamaged");
    expect(damaged).toMatchObject({ objectId: "yard-cell", amount: 70, hpRemaining: 0 });
    expect(getObject(fired.state, "yard-cell")?.destroyed).toBe(true);

    // onDestroyed pours 24 fixed thermal onto the four orthogonal tiles.
    const flare = fired.events.find((e) => e.type === "DamageDealt" && e.unitId === "yard-hand");
    expect(flare).toMatchObject({ amount: 24, damageType: "thermal", hpRemaining: 37 });
    expect(getUnit(fired.state, "yard-hand")?.hp).toBe(37);

    expect(fired.events.some((e) => e.type === "TriggerFired" && e.triggerId === "cell-goes-up")).toBe(true);
    const dialogue = fired.events.find((e) => e.type === "DialogueRequested" && e.triggerId === "cell-goes-up");
    expect(dialogue).toBeDefined();
    expect(fired.state.firedTriggerIds).toContain("cell-goes-up");
  });

  it("stops blocking movement once destroyed", () => {
    const state = advanceTo(cellBattle(), "vale");
    const blocked = applyCommand(state, { kind: "move", unitId: "vale", to: { x: 1, y: 1 } });
    expect(blocked.error?.code).toBe("unreachable");

    const cast = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "overload-cell",
      target: { kind: "object", objectId: "yard-cell" },
    });
    const later = advanceTo(cast.state, "vale");
    expect(getObject(later, "yard-cell")?.destroyed).toBe(true);
    const onto = applyCommand(later, { kind: "move", unitId: "vale", to: { x: 1, y: 1 } });
    expect(onto.error).toBeNull();
    expect(getUnit(onto.state, "vale")?.position).toEqual({ x: 1, y: 1 });
  });
});

describe("the signal switch", () => {
  it("flips the freight lift's power and its standable deck", () => {
    const start = createBattle(testContent(), "e1-marshaling-yard", [rowen()], [
      { unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" },
    ]);
    expect(start.events.some((e) => e.type === "DialogueRequested" && e.triggerId === "opening-words")).toBe(
      true,
    );

    const state = advanceTo(start.state, "rowen");
    expect(getObject(state, "freight-lift")?.powered).toBe(true);
    expect(standHeight(state, { x: 5, y: 4 })).toBe(2);

    const flipped = applyCommand(state, {
      kind: "activateObject",
      unitId: "rowen",
      objectId: "yard-switch",
    });
    expect(flipped.error).toBeNull();
    expect(flipped.events.some((e) => e.type === "ObjectActivated")).toBe(true);
    expect(flipped.events.find((e) => e.type === "PowerChanged")).toMatchObject({
      objectId: "freight-lift",
      powered: false,
    });
    expect(getObject(flipped.state, "freight-lift")?.powered).toBe(false);
    expect(standHeight(flipped.state, { x: 5, y: 4 })).toBe(0);

    // The switch is a toggle: operating it again restores the deck.
    const nextTurn = applyCommand(flipped.state, { kind: "endTurn", unitId: "rowen" });
    const back = applyCommand(advanceTo(nextTurn.state, "rowen"), {
      kind: "activateObject",
      unitId: "rowen",
      objectId: "yard-switch",
    });
    expect(getObject(back.state, "freight-lift")?.powered).toBe(true);
    expect(standHeight(back.state, { x: 5, y: 4 })).toBe(2);
  });

  it("awards Standing for operating machinery", () => {
    const start = createBattle(testContent(), "e1-marshaling-yard", [rowen()], [
      { unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" },
    ]);
    const result = applyCommand(advanceTo(start.state, "rowen"), {
      kind: "activateObject",
      unitId: "rowen",
      objectId: "yard-switch",
    });
    expect(result.events.find((e) => e.type === "StandingAwarded")).toMatchObject({
      unitId: "rowen",
      amount: 10,
      total: 10,
    });
  });
});
