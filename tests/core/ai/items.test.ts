import { describe, expect, it } from "vitest";
import { teamSatchel, type Command, type GameState } from "../../../src/core/index.js";
import type { Unit } from "../../../src/data/index.js";
import { advanceTo } from "../fixtures.js";
import { at, playTurn, unit, watchman, yardBattle } from "./fixtures.js";

/** A Chemist hand with the bench but no learned kit: the satchel is all it has. */
function bench(id: string, name = "Perren Ash"): Unit {
  return {
    schemaVersion: 1,
    id,
    name,
    spriteId: "chemist",
    level: 1,
    jobId: "chemist",
    disposition: { resolve: 55, attunement: 45 },
    learnedAbilityIds: [],
    supportAbilityId: "bench-grade",
    equipment: { weapon: "dosing-gun" },
  };
}

const KIT = [{ itemId: "coagulant-vial", count: 2 }];

/**
 * Two hands holding the west strip with one watchman coming up the far side —
 * far enough that closing is worth less than patching the wounded one up.
 */
function field(hurtHp: number | null): GameState {
  const state = yardBattle(
    [
      at(bench("perr"), "enemy", { x: 1, y: 4 }),
      at(watchman("hand", "Hand"), "enemy", { x: 1, y: 5 }),
      at(watchman("rowen", "Rowen Corvane"), "player", { x: 5, y: 0 }),
    ],
    { id: "e-ai-items", satchel: KIT },
  );
  if (hurtHp === null) return state;
  const wounded = structuredClone(state);
  unit(wounded, "hand").hp = hurtHp;
  return wounded;
}

const itemUses = (commands: readonly Command[]) =>
  commands.filter((command) => command.kind === "useItem");

describe("the AI and the satchel", () => {
  it("carries the encounter's kit onto the field for the hostile team only", () => {
    const state = field(null);
    expect(teamSatchel(state, "enemy")).toEqual(KIT);
    expect(teamSatchel(state, "player")).toEqual([]);
  });

  it("doses a badly hurt ally rather than closing on a distant enemy", () => {
    const { commands } = playTurn(advanceTo(field(8), "perr"));
    const used = itemUses(commands);
    expect(used).toHaveLength(1);
    expect(used[0]).toMatchObject({
      kind: "useItem",
      unitId: "perr",
      itemId: "coagulant-vial",
      target: { kind: "unit", unitId: "hand" },
    });
  });

  it("spends the stock it uses", () => {
    const { state } = playTurn(advanceTo(field(8), "perr"));
    expect(teamSatchel(state, "enemy")).toEqual([{ itemId: "coagulant-vial", count: 1 }]);
  });

  it("will not crack one open on somebody who is not hurt", () => {
    const { commands } = playTurn(advanceTo(field(null), "perr"));
    expect(itemUses(commands)).toEqual([]);
  });

  it("will not crack one open for a scratch either", () => {
    const { commands } = playTurn(advanceTo(field(58), "perr"));
    expect(itemUses(commands)).toEqual([]);
  });
});
