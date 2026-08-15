import { describe, expect, it } from "vitest";
import { createBattle, lineOfSight, type GameState } from "../../src/core/index.js";
import type { Encounter } from "../../src/data/index.js";
import { enemyAt, enforcer, testContent, yardEncounter } from "./fixtures.js";

function battle(id: string, triggers: Encounter["triggers"]): GameState {
  const encounter = yardEncounter(testContent(), {
    id,
    enemies: [enemyAt(enforcer("mark", "Mark"), { x: 5, y: 0 }, "south")],
    triggers,
  });
  return createBattle(testContent([encounter]), id, [enforcer("rowen", "Rowen Corvane")], [
    { unitId: "rowen", position: { x: 3, y: 5 }, facing: "north" },
  ]).state;
}

const atBattleStart = (actions: Encounter["triggers"][number]["actions"]): Encounter["triggers"] => [
  { id: "setup", when: { kind: "battleStart" }, once: true, actions },
];

describe("line of sight", () => {
  it("is blocked by objects that block sight", () => {
    const state = battle("e-los-crate", []);
    // The crate stack sits on (4,2) between (5,2) and (3,2).
    expect(lineOfSight(state, { x: 5, y: 2 }, { x: 3, y: 2 })).toBe(false);
    expect(lineOfSight(state, { x: 5, y: 2 }, { x: 5, y: 4 })).toBe(true);
  });

  it("opens up once the blocking object is destroyed", () => {
    const state = battle("e-los-broken", atBattleStart([{ kind: "destroyObject", objectId: "crate-stack" }]));
    expect(state.map.objects.find((o) => o.def.id === "crate-stack")?.destroyed).toBe(true);
    expect(lineOfSight(state, { x: 5, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });

  it("is blocked by terrain that rises above the sight line", () => {
    // The powered lift decks (5,4) at height 2, between (5,3) at 1 and (5,5) at 0.
    const powered = battle("e-los-lift-on", []);
    expect(lineOfSight(powered, { x: 5, y: 3 }, { x: 5, y: 5 })).toBe(false);

    const cut = battle(
      "e-los-lift-off",
      atBattleStart([{ kind: "setPower", objectId: "freight-lift", powered: false }]),
    );
    expect(lineOfSight(cut, { x: 5, y: 3 }, { x: 5, y: 5 })).toBe(true);
  });

  it("sees along flat ground and to adjacent tiles", () => {
    const state = battle("e-los-flat", []);
    expect(lineOfSight(state, { x: 0, y: 5 }, { x: 3, y: 5 })).toBe(true);
    expect(lineOfSight(state, { x: 3, y: 5 }, { x: 3, y: 4 })).toBe(true);
    expect(lineOfSight(state, { x: 3, y: 5 }, { x: 3, y: 5 })).toBe(true);
  });
});
