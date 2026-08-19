/** @vitest-environment happy-dom */
// The legibility contract's other half (FLUX_GRID §2.5b): every energization
// change names its cause AND the verb that answers it. A mechanic whose
// counterplay has to be inferred is a mechanic that measures well and plays
// badly, which is the e2 lesson this file holds the line on.

import { describe, expect, it } from "vitest";
import { activeUnit, createBattle, type ContentLibrary } from "../../src/core/index.js";
import type { Ability, GameMap } from "../../src/data/index.js";
import { BattleController } from "../../src/app/controller.js";
import { stubAiCommand } from "../../src/app/stubAi.js";
import {
  BENCH_ENCOUNTER_ID,
  BENCH_MAP_ID,
  benchContent,
  benchUnit,
} from "../core/gridFixtures.js";
import { fakeRenderer, fakeUi, type FakeRenderer, type FakeUi } from "./fixtures.js";

const HAND = "bench-hand";

/** Rig Machinery's shape: one order that opens a node and then wrecks it. */
const RIG: Ability = {
  schemaVersion: 1,
  id: "bench-rig",
  name: "bench-rig",
  description: "Bench: open it, then wreck it.",
  jobId: "saboteur",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 0, max: 9, vertical: 9 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["object"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [
    { kind: "setPower", mode: "off" },
    { kind: "damageObject", amount: { base: "fixed", power: 30 } },
  ],
};

/** The bench mains carry their own reclose handle, as the Meter House's do. */
function operableMains(map: GameMap): void {
  for (const object of map.objects) {
    if (object.id !== "west-main") continue;
    object.operable = {
      requiresPower: false,
      targetObjectIds: [object.id],
      targetTiles: [],
      effects: [{ kind: "setPower", mode: "on" }],
    };
  }
}

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

function harness(mutate?: (map: GameMap) => void): Harness {
  const content: ContentLibrary = {
    ...benchContent(),
    abilities: { ...benchContent().abilities, [RIG.id]: RIG },
  };
  mutate?.(content.maps[BENCH_MAP_ID] as GameMap);
  const hand = benchUnit(HAND);
  const battle = createBattle(
    content,
    BENCH_ENCOUNTER_ID,
    [{ ...hand, learnedAbilityIds: [...hand.learnedAbilityIds, RIG.id] }],
    [{ unitId: HAND, position: { x: 4, y: 0 }, facing: "north" }],
  );
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
const EAST_BUS = { x: 5, y: 1 };
const GALLERY_TIE = { x: 4, y: 2 };

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

  // Acceptance finding B. With one main already latched, the line took the
  // first tripped node in register order and named the main that blew a turn
  // ago — "east-main tripped" while the west main was the one going out. The
  // latch is diffed instead, so only what latched in this settle is named.
  it("names the main that latched in this settle, not the one already down", () => {
    const h = harness();
    expect(order(h, "bench-overdraw", EAST_BUS)).toBe(
      "east-main tripped — 12 against a rating of 10. Someone has to reclose it.",
    );
    expect(order(h, "bench-cross-tie", GALLERY_TIE)).toBe(
      "west-main tripped — 18 against a rating of 12. Someone has to reclose it.",
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

  // An order that opens a node and then wrecks it reports the isolator first,
  // because that is the effect that took the branch dark. The player told to
  // throw it back would be standing at rubble.
  it("lets destruction outrank the isolator that came with it", () => {
    expect(order(harness(), "bench-rig", NORTH_BUS)).toBe(
      "north-bus destroyed. 3 machines dark. Nothing on this grid feeds them now.",
    );
  });
});

// The player's own answer-verb reports its consequence in the same voice the
// enemy's does. "West Main operated." was the machine acknowledging a click.
describe("the player's own hand on the lever", () => {
  /** Walk to the west main and work its handle. */
  function operate(h: Harness): string {
    runToHand(h);
    h.controller.intents.beginMove(HAND);
    h.controller.intents.confirmMove(HAND, { x: 1, y: 0 });
    h.controller.intents.activateObject(HAND, "west-main");
    expect(h.controller.lastError).toBeNull();
    return h.ui.notices.at(-1) ?? "";
  }

  it("names the reclose and the trip it walked straight back into", () => {
    const h = harness(operableMains);
    order(h, "bench-overdraw", WEST_BUS);
    expect(operate(h)).toBe(
      "west-main reclosed — tripped again, 14 against a rating of 12. Shed a load before it will hold.",
    );
  });

  it("names what came back when the reclose holds", () => {
    const h = harness(operableMains);
    order(h, "bench-isolate", WEST_MAIN);
    expect(operate(h)).toBe("west-main put back in — 5 machines came back up.");
  });
});

// Operate is the only order with no aim step, so it was the only one with no
// forecast and no flip highlight — on a grid map, the commonest grid verb going
// out blind.
describe("the Operate cursor forecasts what it would do", () => {
  const lastView = (h: Harness) => h.ui.renders.at(-1);

  it("reads the component off the real recompute and marks it", () => {
    const h = harness(operableMains);
    order(h, "bench-isolate", WEST_MAIN);
    runToHand(h);
    h.controller.intents.previewOperable(HAND, "west-main");

    expect(lastView(h)?.forecast?.abilityName).toBe("Operate — west-main");
    expect(lastView(h)?.forecast?.effects).toEqual([
      "5 machines come back up",
      "lift-deck's deck comes up — 1 tile at height 2",
    ]);
    expect(h.renderer.highlights.get("grid-flip")).toHaveLength(5);
  });

  it("reports an order that changes nothing on the grid as changing nothing", () => {
    const h = harness(operableMains);
    h.controller.intents.previewOperable(HAND, "west-main");
    expect(lastView(h)?.forecast?.effects).toEqual(["No powered machines affected"]);
    expect(h.renderer.highlights.has("grid-flip")).toBe(false);
  });

  it("drops the forecast and the marks when the cursor leaves the menu", () => {
    const h = harness(operableMains);
    order(h, "bench-isolate", WEST_MAIN);
    runToHand(h);
    h.controller.intents.previewOperable(HAND, "west-main");
    h.controller.intents.previewOperable(HAND, null);
    expect(lastView(h)?.forecast).toBeNull();
    expect(h.renderer.highlights.has("grid-flip")).toBe(false);
  });
});

describe("the inspect panel answers for machinery too", () => {
  it("names what the machine is, what it draws, and whether it is being fed", () => {
    const h = harness();
    h.controller.onTileHover({ x: 4, y: 1 });
    expect(h.ui.renders.at(-1)?.inspected).toMatchObject({
      kind: "object",
      id: "press-west",
      name: "press-west",
      category: "Sink · draws 4",
      power: "live",
    });
  });

  it("goes back to the unit under the cursor", () => {
    const h = harness();
    h.controller.onTileHover({ x: 4, y: 1 });
    h.controller.onTileHover({ x: 4, y: 0 });
    expect(h.ui.renders.at(-1)?.inspected).toMatchObject({ id: HAND });
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

  // The permanent verb is marked like the reversible ones: the order that
  // cannot be undone is the last one that should go out unseen.
  it("marks a demolition's component too", () => {
    const h = harness();
    h.controller.intents.selectAbility(HAND, "bench-demolish");
    h.controller.onTileClick(NORTH_BUS);
    expect(h.renderer.highlights.get("grid-flip")).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ]);
  });

  it("stays empty for an order that does not touch the graph", () => {
    const h = harness();
    h.controller.intents.selectAbility(HAND, "bench-immolate");
    h.controller.onTileClick({ x: 4, y: 0 });
    expect(h.renderer.highlights.has("grid-flip")).toBe(false);
  });
});
