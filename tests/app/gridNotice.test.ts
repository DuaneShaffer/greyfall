/** @vitest-environment happy-dom */
// The legibility contract's other half (FLUX_GRID §2.5b): every energization
// change names its cause AND the verb that answers it. A mechanic whose
// counterplay has to be inferred is a mechanic that measures well and plays
// badly, which is the e2 lesson this file holds the line on.

import { describe, expect, it } from "vitest";
import { activeUnit, createBattle } from "../../src/core/index.js";
import { BattleController } from "../../src/app/controller.js";
import { stubAiCommand } from "../../src/app/stubAi.js";
import {
  BENCH_ENCOUNTER_ID,
  benchContent,
  benchUnit,
} from "../core/gridFixtures.js";
import { fakeRenderer, fakeUi, type FakeRenderer, type FakeUi } from "./fixtures.js";

const HAND = "bench-hand";

interface Harness {
  controller: BattleController;
  renderer: FakeRenderer;
  ui: FakeUi;
}

/** Run the loop until the bench hand has the floor with its action still in hand. */
function runToHand(h: Harness): Harness {
  for (let tick = 0; tick < 400; tick += 1) {
    const acting = activeUnit(h.controller.state);
    if (h.controller.phase === "player" && acting?.id === HAND) {
      if (h.controller.state.activeTurn?.acted !== true) return h;
      h.controller.intents.wait(HAND, acting.facing);
      h.ui.facingPrompt?.onPick("north");
      continue;
    }
    if (h.controller.phase === "ended") break;
    if (h.controller.phase === "dialogue") {
      h.controller.intents.endDialogue();
      continue;
    }
    if (h.controller.phase === "player" && acting !== null) {
      h.controller.intents.wait(acting.id, acting.facing);
      h.ui.facingPrompt?.onPick("north");
      continue;
    }
    h.controller.tick(1);
  }
  throw new Error(`${HAND} never got the floor`);
}

function harness(): Harness {
  const battle = createBattle(benchContent(), BENCH_ENCOUNTER_ID, [benchUnit(HAND)], [
    { unitId: HAND, position: { x: 4, y: 0 }, facing: "north" },
  ]);
  const renderer = fakeRenderer();
  const ui = fakeUi();
  const controller = new BattleController({
    state: battle.state,
    events: battle.events,
    renderer: renderer.port,
    ui: ui.port,
    ai: stubAiCommand,
  });
  controller.start();
  return runToHand({ controller, renderer, ui });
}

/** Stage and commit one grid order at a node, and read back what was announced. */
function order(h: Harness, abilityId: string, tile: { x: number; y: number }): string {
  runToHand(h);
  h.controller.intents.selectAbility(HAND, abilityId);
  h.controller.onTileClick(tile);
  h.controller.onTileClick(tile);
  expect(h.controller.lastError).toBeNull();
  return h.ui.notices.at(-1) ?? "";
}

const NORTH_BUS = { x: 3, y: 1 };
const WEST_BUS = { x: 2, y: 1 };
const WEST_MAIN = { x: 1, y: 1 };

describe("the annunciator names the cause and the verb that answers it", () => {
  it("answers a cut with the splice, and with the tie when one would carry it", () => {
    expect(order(harness(), "bench-cut", WEST_BUS)).toBe(
      "west-bus cut. 4 machines dark. Splice it or take the gallery-tie.",
    );
  });

  it("offers no tie it has not checked", () => {
    // Nothing past `north-bus` has a second route, so the tie is not an answer
    // and the line does not pretend it is.
    expect(order(harness(), "bench-cut", NORTH_BUS)).toBe(
      "north-bus cut. 3 machines dark. Splice it.",
    );
  });

  // The numbers are the blown component's own, not the whole grid's: 14 was
  // what that bus was carrying against the 12 it is rated for.
  it("answers a trip with the reclose, and prints the numbers that caused it", () => {
    expect(order(harness(), "bench-overdraw", WEST_BUS)).toBe(
      "west-main tripped — 14 against a rating of 12. Someone has to reclose it.",
    );
  });

  it("answers an isolator with throwing it back", () => {
    expect(order(harness(), "bench-isolate", WEST_MAIN)).toBe(
      "west-main opened. 5 machines dark. Throw it back, or take the gallery-tie.",
    );
  });

  it("reports the way back up too", () => {
    const h = harness();
    order(h, "bench-isolate", WEST_MAIN);
    expect(order(h, "bench-close", WEST_MAIN)).toBe("west-main closed. 5 machines came back up.");
  });

  it("names the splice when the span is made good", () => {
    const h = harness();
    order(h, "bench-cut", WEST_BUS);
    expect(order(h, "bench-splice", WEST_BUS)).toBe(
      "west-bus spliced. 4 machines came back up.",
    );
  });

  it("speaks in the machine's own copper", () => {
    const h = harness();
    order(h, "bench-cut", WEST_BUS);
    expect(h.ui.noticeTones.at(-1)).toBe("machine");
  });
});

describe("the component a staged grid order would flip", () => {
  it("is marked in its own layer while the order is staged, and cleared with it", () => {
    const h = harness();
    h.controller.intents.selectAbility(HAND, "bench-cut");
    expect(h.renderer.highlights.has("grid-flip")).toBe(false);

    h.controller.onTileClick(NORTH_BUS);
    expect(h.renderer.highlights.get("grid-flip")).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ]);

    h.controller.intents.cancelSelection(HAND);
    expect(h.renderer.highlights.has("grid-flip")).toBe(false);
  });

  it("stays empty for an order that does not touch the graph", () => {
    const h = harness();
    h.controller.intents.selectAbility(HAND, "bench-demolish");
    h.controller.onTileClick(NORTH_BUS);
    expect(h.renderer.highlights.has("grid-flip")).toBe(false);
  });
});
