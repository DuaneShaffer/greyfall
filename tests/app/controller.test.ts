/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from "vitest";
import { activeUnit, getObject, type GameState } from "../../src/core/index.js";
import { BattleController } from "../../src/app/controller.js";
import { stubAiCommand } from "../../src/app/stubAi.js";
import { BattleHud } from "../../src/ui/index.js";
import { rowen } from "../core/fixtures.js";
import { fakeRenderer, fakeUi, openBattle, VALE, type FakeRenderer, type FakeUi } from "./fixtures.js";

interface Harness {
  controller: BattleController;
  renderer: FakeRenderer;
  ui: FakeUi;
}

function harness(): Harness {
  const battle = openBattle([rowen(), VALE]);
  const renderer = fakeRenderer();
  const ui = fakeUi();
  const controller = new BattleController({
    state: battle.state,
    events: battle.events,
    renderer: renderer.port,
    ui: ui.port,
    ai: stubAiCommand,
  });
  return { controller, renderer, ui };
}

/** Run the loop until the given unit has the floor, or the battle ends. */
function runUntilPlayer(h: Harness, unitId: string, maxTicks = 400): void {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (h.controller.phase === "player" && activeUnit(h.controller.state)?.id === unitId) return;
    if (h.controller.phase === "ended") return;
    if (h.controller.phase === "dialogue") {
      h.controller.intents.endDialogue();
      continue;
    }
    if (h.controller.phase === "player") {
      // Not our unit's turn yet — pass it.
      const acting = activeUnit(h.controller.state);
      if (acting !== null) h.controller.intents.wait(acting.id, acting.facing);
      h.ui.facingPrompt?.onPick(acting?.facing ?? "north");
      continue;
    }
    h.controller.tick(1);
  }
  throw new Error(`${unitId} never got the floor (phase ${h.controller.phase})`);
}

describe("battle start", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it("builds the scene from state before anything else happens", () => {
    h.controller.start();
    expect(h.renderer.scenes).toHaveLength(1);
    expect(h.renderer.scenes[0]?.units.map((unit) => unit.id).sort()).toEqual([
      "provocateur-a",
      "rowen",
      "vale",
    ]);
  });

  it("routes the battleStart trigger's dialogue to the UI, not the render queue", () => {
    h.controller.start();
    expect(h.controller.phase).toBe("dialogue");
    expect(h.ui.dialogues).toHaveLength(1);
    expect(h.ui.dialogues[0]?.[0]?.speaker).toBe("Maren Voss");
    expect(h.ui.dialogues[0]?.[0]?.text).toContain("Nobody on this line raised a hand");
    expect(h.renderer.events.some((event) => event.kind === "unitMoved")).toBe(false);
  });

  it("holds the turn until the dialogue is dismissed", () => {
    h.controller.start();
    expect(h.controller.phase).toBe("dialogue");
    h.controller.intents.endDialogue();
    expect(h.ui.dialogueOpen).toBe(false);
    expect(["player", "ai"]).toContain(h.controller.phase);
  });

  it("waits for the presentation queue before opening the next menu", () => {
    h.renderer.idle = false;
    h.controller.start();
    h.controller.intents.endDialogue();
    expect(h.controller.phase).toBe("presenting");

    h.controller.tick(1);
    expect(h.controller.phase).toBe("presenting");

    h.renderer.idle = true;
    h.controller.tick(1);
    expect(["player", "ai"]).toContain(h.controller.phase);
  });

  it("skips the queue on demand and moves straight on", () => {
    h.renderer.idle = false;
    h.controller.start();
    h.controller.intents.endDialogue();
    expect(h.controller.phase).toBe("presenting");
    h.controller.skipPresentation();
    expect(h.renderer.skips).toBe(1);
    expect(["player", "ai"]).toContain(h.controller.phase);
  });
});

describe("intent to command translation", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
    h.controller.start();
    runUntilPlayer(h, "rowen");
  });

  it("lights the reachable tiles when Move is chosen, and clears them after", () => {
    h.controller.intents.beginMove("rowen");
    const lit = h.renderer.highlights.get("move-range") ?? [];
    expect(lit.length).toBeGreaterThan(1);
    expect(lit.some((tile) => tile.x === 0 && tile.y === 3)).toBe(true);

    h.controller.intents.cancelSelection("rowen");
    expect(h.renderer.highlights.has("move-range")).toBe(false);
  });

  it("takes two clicks to move: pick the tile, then confirm it", () => {
    const before = h.controller.unitSnapshot("rowen")?.position;
    h.controller.intents.beginMove("rowen");

    h.controller.onTileClick({ x: 0, y: 3 });
    expect(h.controller.unitSnapshot("rowen")?.position).toEqual(before);
    expect(h.renderer.highlights.get("move-pick")).toEqual([{ x: 0, y: 3 }]);

    h.controller.onTileClick({ x: 0, y: 3 });
    expect(h.controller.unitSnapshot("rowen")?.position).toEqual({ x: 0, y: 3 });
    expect(h.renderer.events.some((event) => event.kind === "unitMoved")).toBe(true);
  });

  it("ignores clicks on tiles outside the move range", () => {
    h.controller.intents.beginMove("rowen");
    h.controller.onTileClick({ x: 5, y: 0 });
    expect(h.renderer.highlights.has("move-pick")).toBe(false);
    expect(h.controller.unitSnapshot("rowen")?.position).toEqual({ x: 0, y: 4 });
  });

  it("operates adjacent machinery and plays its power change", () => {
    h.controller.intents.beginMove("rowen");
    h.controller.intents.confirmMove("rowen", { x: 2, y: 4 });
    h.controller.intents.activateObject("rowen", "yard-switch");
    expect(h.controller.lastError).toBeNull();
    expect(
      h.renderer.events.some((event) => event.kind === "objectPowerChanged"),
    ).toBe(true);
  });

  it("rejects an illegal command through the port instead of throwing", () => {
    h.controller.intents.confirmMove("rowen", { x: 5, y: 0 });
    expect(h.controller.lastError?.code).toBe("unreachable");
    expect(h.ui.notices.length).toBeGreaterThan(0);
  });

  it("asks for a facing before Wait ends the turn", () => {
    h.controller.intents.wait("rowen", "north");
    expect(h.ui.facingPrompt).not.toBeNull();
    expect(h.controller.unitSnapshot("rowen")?.facing).toBe("north");

    h.ui.facingPrompt?.onPick("east");
    expect(h.controller.unitSnapshot("rowen")?.facing).toBe("east");
    expect(activeUnit(h.controller.state)?.id).not.toBe("rowen");
  });
});

describe("machinery", () => {
  it("overloads the yard cell, plays the collapse, and fires its dialogue", () => {
    const h = harness();
    h.controller.start();
    runUntilPlayer(h, "vale");

    h.controller.intents.selectAbility("vale", "overload-cell");
    expect((h.renderer.highlights.get("target-range") ?? []).length).toBeGreaterThan(0);

    h.controller.onTileClick({ x: 1, y: 1 });
    const staged = h.ui.latest()?.forecast;
    expect(staged?.abilityName).toBe("Overload Cell");
    expect(staged?.targets[0]?.name).toBe("Flux Cell");
    expect(h.renderer.highlights.get("affected")).toEqual([{ x: 1, y: 1 }]);

    h.controller.onTileClick({ x: 1, y: 1 });
    expect(h.controller.lastError).toBeNull();
    expect(getObject(h.controller.state, "yard-cell")?.destroyed).toBe(true);
    expect(h.renderer.events).toContainEqual({ kind: "objectDestroyed", objectId: "yard-cell" });
    expect(h.renderer.events).toContainEqual({
      kind: "objectPowerChanged",
      objectId: "yard-cell",
      powered: false,
    });
    expect(h.ui.dialogues.at(-1)?.[0]?.speaker).toBe("Watch Sergeant");
  });
});

describe("a whole battle", () => {
  it("plays through to a win banner, player intents against the stub AI", () => {
    const h = harness();
    h.controller.start();

    for (let round = 0; round < 60 && h.controller.phase !== "ended"; round += 1) {
      if (h.controller.phase === "dialogue") {
        h.controller.intents.endDialogue();
        continue;
      }
      if (h.controller.phase !== "player") {
        h.controller.tick(1);
        continue;
      }
      playOneTurn(h);
    }

    expect(h.controller.phase).toBe("ended");
    expect(h.ui.result).toBe("win");
    expect(h.controller.state.result).toBe("win");
    expect(h.renderer.events.some((event) => event.kind === "unitDowned")).toBe(true);
    expect(h.renderer.events.some((event) => event.kind === "unitHit")).toBe(true);
  });
});

/** Attack if the provocateur is adjacent, otherwise close on it, then wait. */
function playOneTurn(h: Harness): void {
  const acting = activeUnit(h.controller.state);
  if (acting === null) return;
  const enemy = h.controller.unitSnapshot("provocateur-a");
  if (enemy === null || enemy.downed) return;

  const menu = h.ui.latest()?.action;
  if (menu?.canAct === true && adjacent(h.controller.state, acting.id, "provocateur-a")) {
    h.controller.intents.selectAbility(acting.id, "basic-attack");
    h.controller.intents.confirmTarget(acting.id, "basic-attack", {
      kind: "unit",
      unitId: "provocateur-a",
    });
    return;
  }
  if (menu?.canMove === true) {
    const step = closestStep(h, acting.id);
    if (step !== null) {
      h.controller.intents.confirmMove(acting.id, step);
      return;
    }
  }
  h.controller.intents.wait(acting.id, acting.facing);
  h.ui.facingPrompt?.onPick(acting.facing);
}

function adjacent(state: GameState, a: string, b: string): boolean {
  const first = state.units.find((unit) => unit.id === a)?.position;
  const second = state.units.find((unit) => unit.id === b)?.position;
  if (first === undefined || second === undefined) return false;
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y) === 1;
}

function closestStep(h: Harness, unitId: string): { x: number; y: number } | null {
  h.controller.intents.beginMove(unitId);
  const tiles = h.renderer.highlights.get("move-range") ?? [];
  const enemy = h.controller.unitSnapshot("provocateur-a")?.position;
  const self = h.controller.unitSnapshot(unitId)?.position;
  if (enemy === undefined || self === undefined) return null;
  let best: { x: number; y: number } | null = null;
  let bestDistance = Math.abs(self.x - enemy.x) + Math.abs(self.y - enemy.y);
  for (const tile of tiles) {
    const distance = Math.abs(tile.x - enemy.x) + Math.abs(tile.y - enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return best;
}

describe("the hud sees real view models", () => {
  it("drives a real BattleHud without a renderer", () => {
    const battle = openBattle([rowen(), VALE]);
    const renderer = fakeRenderer();
    const ui = fakeUi();
    const controller = new BattleController({
      state: battle.state,
      events: battle.events,
      renderer: renderer.port,
      ui: ui.port,
      ai: stubAiCommand,
    });
    const hud = new BattleHud({ intents: controller.intents });
    document.body.append(hud.el);

    controller.start();
    controller.intents.endDialogue();
    const view = ui.latest();
    expect(view).not.toBeNull();
    hud.update(view!);

    expect(hud.el.querySelector(".gf-menu-entry[data-entry='move']")).not.toBeNull();
    expect(hud.el.querySelector(".gf-unit-name")?.textContent).toBe(view?.inspected?.name);
    expect(hud.el.querySelectorAll(".gf-turn-entry").length).toBe(view?.turnOrder.entries.length);
    hud.destroy();
  });
});

describe("scene rebuilds", () => {
  /** Pass turns (dismissing dialogue) until `done`, or give up. */
  function idleUntil(h: Harness, done: () => boolean, maxTicks = 600): boolean {
    for (let tick = 0; tick < maxTicks; tick += 1) {
      if (done()) return true;
      if (h.controller.phase === "ended") return done();
      if (h.controller.phase === "dialogue") {
        h.controller.intents.endDialogue();
        continue;
      }
      if (h.controller.phase === "player") {
        const acting = activeUnit(h.controller.state);
        if (acting === null) return done();
        h.controller.intents.wait(acting.id, acting.facing);
        h.ui.facingPrompt?.onPick(acting.facing);
        continue;
      }
      h.controller.tick(1);
    }
    return done();
  }

  it("rebuilds for a spawn but animates a scripted removal in place", () => {
    const h = harness();
    h.controller.start();

    const spawned = idleUntil(h, () =>
      h.controller.state.units.some((unit) => unit.id === "provocateur-b"),
    );
    expect(spawned).toBe(true);
    const scenesAfterSpawn = h.renderer.scenes.length;
    expect(scenesAfterSpawn).toBeGreaterThan(1);

    const removed = idleUntil(h, () =>
      h.renderer.events.some((event) => event.kind === "unitRemoved"),
    );
    expect(removed).toBe(true);
    expect(h.renderer.events).toContainEqual({ kind: "unitRemoved", unitId: "provocateur-b" });
    expect(h.renderer.scenes).toHaveLength(scenesAfterSpawn);
  });
});
