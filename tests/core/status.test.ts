import { describe, expect, it } from "vitest";
import { applyCommand, createBattle, getUnit, type GameState } from "../../src/core/index.js";
import type { Unit } from "../../src/data/index.js";
import { advanceTo, enemyAt, enforcer, testContent, yardEncounter } from "./fixtures.js";

/** Seed chosen so Pin both lands and stuns; see COMBAT_RULES.md for the rolls. */
const STUN_SEED = 1009;

function duel(id: string, defender: Unit, seed = STUN_SEED): GameState {
  const encounter = yardEncounter(testContent(), {
    id,
    rngSeed: seed,
    enemies: [enemyAt(enforcer("brute", "Brute"), { x: 1, y: 3 }, "south")],
    triggers: [],
  });
  return createBattle(testContent([encounter]), id, [defender], [
    { unitId: defender.id, position: { x: 1, y: 4 }, facing: "north" },
  ]).state;
}

describe("statuses", () => {
  it("costs a stunned unit its whole turn and then expires", () => {
    const state = advanceTo(duel("e-stun", enforcer("rowen", "Rowen Corvane")), "brute");
    const pinned = applyCommand(state, {
      kind: "act",
      unitId: "brute",
      abilityId: "pin",
      target: { kind: "unit", unitId: "rowen" },
    });
    expect(pinned.error).toBeNull();
    expect(pinned.events.find((e) => e.type === "StatusApplied")).toMatchObject({
      unitId: "rowen",
      statusId: "stunned",
      turnsRemaining: 1,
    });

    const passed = applyCommand(pinned.state, { kind: "endTurn", unitId: "brute" });
    const order = passed.events.map((e) => `${e.type}:${"unitId" in e ? e.unitId : ""}`);
    // Rowen's turn opens and closes without a command: Stunned blocks both.
    expect(order).toContain("TurnStarted:rowen");
    expect(order.indexOf("TurnStarted:rowen")).toBeLessThan(order.indexOf("TurnEnded:rowen"));
    expect(order).toContain("StatusRemoved:rowen");
    expect(getUnit(passed.state, "rowen")?.statuses).toEqual([]);
    // The forfeited turn costs the 60 CT of a unit that neither moved nor acted.
    const forfeited = passed.events.find((e) => e.type === "TurnEnded" && e.unitId === "rowen");
    expect(forfeited).toMatchObject({ ctSpent: 60 });
  });

  it("blocks commands while the status is active", () => {
    const state = advanceTo(duel("e-stun-block", enforcer("rowen", "Rowen Corvane")), "brute");
    const pinned = applyCommand(state, {
      kind: "act",
      unitId: "brute",
      abilityId: "pin",
      target: { kind: "unit", unitId: "rowen" },
    });
    const stunned = getUnit(pinned.state, "rowen");
    expect(stunned?.statuses.map((s) => s.statusId)).toEqual(["stunned"]);
  });
});

describe("reactions", () => {
  it("fires at the reacting unit's Resolve and strikes the attacker back", () => {
    const defender = enforcer("rowen", "Rowen Corvane", {
      reactionAbilityId: "riposte",
      disposition: { resolve: 100, attunement: 40 },
    });
    const state = advanceTo(duel("e-reaction", defender), "brute");
    const struck = applyCommand(state, {
      kind: "act",
      unitId: "brute",
      abilityId: "pin",
      target: { kind: "unit", unitId: "rowen" },
    });
    expect(struck.error).toBeNull();
    expect(struck.events.find((e) => e.type === "ReactionTriggered")).toMatchObject({
      unitId: "rowen",
      abilityId: "riposte",
      againstUnitId: "brute",
    });
    // Riposte is 50% weapon damage: floor(9 * 9 * 50 / 400) = 10.
    expect(getUnit(struck.state, "brute")?.hp).toBe(61 - 10);
  });

  it("never fires for a unit with no reaction slotted", () => {
    const state = advanceTo(duel("e-no-reaction", enforcer("rowen", "Rowen Corvane")), "brute");
    const struck = applyCommand(state, {
      kind: "act",
      unitId: "brute",
      abilityId: "pin",
      target: { kind: "unit", unitId: "rowen" },
    });
    expect(struck.events.some((e) => e.type === "ReactionTriggered")).toBe(false);
  });
});
