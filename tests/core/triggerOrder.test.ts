// Trigger ordering: `afterTriggerId` gates a trigger behind another one, and
// the finale leans on it so the confession can never be skipped.

import { describe, expect, it } from "vitest";
import {
  activeUnit,
  applyCommand,
  createBattle,
  unitMaxHp,
  type BattleEvent,
  type GameState,
} from "../../src/core/index.js";
import type { Deployment } from "../../src/core/index.js";
import type { Unit } from "../../src/data/index.js";
import { loadContent, loadUnits } from "./fixtures.js";

const CONTENT = loadContent();
const UNITS = loadUnits();
const E5 = "e5-charterhouse-steps";

const dialogueOrder = (events: readonly BattleEvent[]): string[] =>
  events.filter((e) => e.type === "DialogueRequested").map((e) => e.triggerId);

/** The finale, with the party still on its deployment tiles. */
function charterhouse(): GameState {
  const encounter = CONTENT.encounters[E5]!;
  const map = CONTENT.maps[encounter.mapId]!;
  const party: Unit[] = ["rowen", "della-tine", "maren-voss"].map((id) => UNITS[id]!);
  const deployment: Deployment[] = party.map((unit, index) => ({
    unitId: unit.id,
    position: { ...map.deploymentTiles[index]! },
    facing: "north" as const,
  }));
  return createBattle(CONTENT, E5, party, deployment).state;
}

/** Aldric with `percent` of his health left, without anybody walking anywhere. */
function aldricAt(state: GameState, percent: number): GameState {
  const max = unitMaxHp(state, "aldric")!;
  return {
    ...state,
    units: state.units.map((unit) =>
      unit.id === "aldric" ? { ...unit, hp: Math.max(1, Math.floor((max * percent) / 100)) } : unit,
    ),
  };
}

/** Any legal command; the point is that trigger evaluation runs. */
function pass(state: GameState): ReturnType<typeof applyCommand> {
  const acting = activeUnit(state)!;
  return applyCommand(state, { kind: "wait", unitId: acting.id, facing: acting.facing });
}

describe("trigger ordering", () => {
  it("keeps a gated trigger shut until the trigger it names has fired", () => {
    const state = charterhouse();
    expect(state.firedTriggerIds).toContain("the-steps-are-closed");
    expect(state.firedTriggerIds).not.toContain("terrace-two-the-proof");

    // The top step is gated behind the withdrawal, which is gated behind the
    // proof: with Aldric untouched, neither may fire whatever anyone stands on.
    const withdrawn = pass(state);
    expect(withdrawn.error).toBeNull();
    expect(withdrawn.state.firedTriggerIds).not.toContain("aldric-to-the-court");
    expect(withdrawn.state.firedTriggerIds).not.toContain("the-top-step");
  });

  it("fires the confession before the withdrawal even when one blow triggers both", () => {
    // The kill-him-fast path: Aldric goes from untouched to broken in a single
    // command, so the proof gate and the withdrawal gate open together.
    const hurt = aldricAt(charterhouse(), 20);
    const result = pass(hurt);

    expect(result.error).toBeNull();
    const fired = dialogueOrder(result.events);
    expect(fired).toContain("terrace-two-the-proof");
    expect(fired.indexOf("terrace-two-the-proof")).toBeLessThan(
      fired.indexOf("aldric-to-the-court"),
    );
    expect(result.state.firedTriggerIds).toContain("terrace-two-the-proof");
  });

  it("gets the confession to a party that never sets foot on terrace two", () => {
    // Ranged party: nobody enters the row-10 tiles, Aldric is shot down from
    // the terrace below. The docket still lands.
    const chipped = aldricAt(charterhouse(), 80);
    const result = pass(chipped);

    expect(dialogueOrder(result.events)).toContain("terrace-two-the-proof");
    expect(
      result.state.units.some((unit) => unit.team === "player" && unit.position.y === 10),
    ).toBe(false);
  });

  it("does not replay the confession once it has been heard", () => {
    const first = pass(aldricAt(charterhouse(), 80));
    const second = pass(aldricAt(first.state, 60));
    expect(dialogueOrder(second.events)).not.toContain("terrace-two-the-proof");
  });
});
