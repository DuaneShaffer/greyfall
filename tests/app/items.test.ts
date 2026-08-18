/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from "vitest";
import { activeUnit, teamSatchel, type GameState } from "../../src/core/index.js";
import { BattleController } from "../../src/app/controller.js";
import { stubAiCommand } from "../../src/app/stubAi.js";
import { rowen } from "../core/fixtures.js";
import { fakeRenderer, fakeUi, openBattle, VALE, type FakeRenderer, type FakeUi } from "./fixtures.js";

const KIT = [
  { itemId: "coagulant-vial", count: 2 },
  { itemId: "caustic-flask", count: 1 },
];

interface Harness {
  controller: BattleController;
  renderer: FakeRenderer;
  ui: FakeUi;
}

/** Vale opens the battle badly hurt, so a coagulant has somewhere to go. */
function harness(): Harness {
  const battle = openBattle([rowen(), VALE], undefined, KIT);
  const state: GameState = structuredClone(battle.state);
  const vale = state.units.find((unit) => unit.id === "vale");
  if (vale !== undefined) vale.hp = 8;

  const renderer = fakeRenderer();
  const ui = fakeUi();
  const controller = new BattleController({
    state,
    events: battle.events,
    renderer: renderer.port,
    ui: ui.port,
    ai: stubAiCommand,
  });
  return { controller, renderer, ui };
}

function runUntilPlayer(h: Harness, unitId: string, maxTicks = 400): void {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (h.controller.phase === "player" && activeUnit(h.controller.state)?.id === unitId) return;
    if (h.controller.phase === "ended") return;
    if (h.controller.phase === "dialogue") {
      h.controller.intents.endDialogue();
      continue;
    }
    if (h.controller.phase === "player") {
      const acting = activeUnit(h.controller.state);
      if (acting !== null) h.controller.intents.wait(acting.id, acting.facing);
      h.ui.facingPrompt?.onPick(acting?.facing ?? "north");
      continue;
    }
    h.controller.tick(1);
  }
  throw new Error(`${unitId} never got the floor (phase ${h.controller.phase})`);
}

describe("using an item through the controller", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
    h.controller.start();
    runUntilPlayer(h, "rowen");
  });

  it("offers the satchel on the action menu with its counts", () => {
    expect(h.ui.latest()?.action.items).toEqual([
      {
        itemId: "caustic-flask",
        name: "Caustic Flask",
        description: expect.any(String),
        count: 1,
        mechanics: expect.any(Object),
      },
      {
        itemId: "coagulant-vial",
        name: "Coagulant Vial",
        description: expect.any(String),
        count: 2,
        mechanics: expect.any(Object),
      },
    ]);
  });

  it("lights the reachable tiles and forecasts the item before committing", () => {
    h.controller.intents.selectItem("rowen", "coagulant-vial");
    expect(h.renderer.highlights.get("target-range")?.length).toBeGreaterThan(0);

    h.controller.onTileClick({ x: 1, y: 4 });
    const view = h.ui.latest()?.forecast;
    expect(view?.abilityName).toBe("Coagulant Vial");
    expect(view?.item).toEqual({ itemId: "coagulant-vial", remaining: 1 });
    expect(view?.targets[0]?.damage).toEqual({ kind: "heal", min: 30, max: 30 });
    expect(h.controller.unitSnapshot("vale")?.hp).toBe(8);
  });

  it("heals and spends the stock on confirm", () => {
    h.controller.intents.selectItem("rowen", "coagulant-vial");
    h.controller.intents.confirmItemTarget("rowen", "coagulant-vial", {
      kind: "unit",
      unitId: "vale",
    });
    expect(h.controller.lastError).toBeNull();
    expect(h.controller.unitSnapshot("vale")?.hp).toBe(38);
    expect(teamSatchel(h.controller.state, "player")).toContainEqual({
      itemId: "coagulant-vial",
      count: 1,
    });
  });

  it("commits from the pick-then-confirm tile path too", () => {
    h.controller.intents.selectItem("rowen", "coagulant-vial");
    h.controller.onTileClick({ x: 1, y: 4 });
    h.controller.onTileClick({ x: 1, y: 4 });
    expect(h.controller.unitSnapshot("vale")?.hp).toBe(38);
  });

  it("surfaces a refusal instead of spending anything", () => {
    h.controller.intents.confirmItemTarget("rowen", "heavy-coagulant", {
      kind: "unit",
      unitId: "vale",
    });
    expect(h.controller.lastError?.code).toBe("item-not-carried");
    expect(h.ui.notices.at(-1)).toContain("Heavy Coagulant");
    expect(teamSatchel(h.controller.state, "player")).toEqual([
      { itemId: "caustic-flask", count: 1 },
      { itemId: "coagulant-vial", count: 2 },
    ]);
  });

  it("greys the whole entry once the action is spent", () => {
    h.controller.intents.selectItem("rowen", "coagulant-vial");
    h.controller.intents.confirmItemTarget("rowen", "coagulant-vial", {
      kind: "unit",
      unitId: "vale",
    });
    const items = h.ui.latest()?.action.items ?? [];
    expect(items.map((entry) => entry.unavailableReason)).toEqual([
      "Action already spent",
      "Action already spent",
    ]);
  });
});
