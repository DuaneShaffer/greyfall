/** @vitest-environment happy-dom */
// The record of what happened. Every figure on it comes off the event stream, so
// this is also the regression net for the two findings it answers: "I cannot tell
// whether the attack hit" and "the enemy's turn happened somewhere off screen".

import { beforeEach, describe, expect, it } from "vitest";
import { activeUnit, applyCommand, createBattle, type GameState } from "../../src/core/index.js";
import { BattleController } from "../../src/app/controller.js";
import { BattleLog } from "../../src/app/battleLog.js";
import { stubAiCommand } from "../../src/app/stubAi.js";
import type { LogEntryView } from "../../src/ui/index.js";
import type { Unit } from "../../src/data/index.js";
import { advanceTo, rowen, testContent, YARD_ENCOUNTER_ID } from "../core/fixtures.js";
import {
  fakeRenderer,
  fakeUi,
  openBattle,
  VALE,
  VALE_TILE,
  type FakeRenderer,
  type FakeUi,
} from "./fixtures.js";

interface Harness {
  controller: BattleController;
  renderer: FakeRenderer;
  ui: FakeUi;
}

function harness(carried: { itemId: string; count: number }[] = []): Harness {
  const battle = openBattle([rowen(), VALE], undefined, carried);
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
      const acting = activeUnit(h.controller.state);
      if (acting !== null) h.controller.intents.wait(acting.id, acting.facing);
      h.ui.facingPrompt?.onPick(acting?.facing ?? "north");
      continue;
    }
    h.controller.tick(1);
  }
  throw new Error(`${unitId} never got the floor (phase ${h.controller.phase})`);
}

const actions = (log: readonly LogEntryView[]): readonly LogEntryView[] =>
  log.filter((entry) => entry.kind === "action");

describe("the battle's record", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness([{ itemId: "coagulant-vial", count: 2 }]);
    h.controller.start();
  });

  it("opens with the engagement and files every turn boundary", () => {
    h.controller.intents.endDialogue();
    const log = h.controller.log;
    expect(log[0]?.kind).toBe("battle");
    expect(log[0]?.text).toContain("The Marshaling Yard");
    const turns = log.filter((entry) => entry.kind === "turn");
    expect(turns.length).toBeGreaterThan(0);
    expect(turns[0]?.actor?.name.length).toBeGreaterThan(0);
    expect(turns[0]?.text).toContain("Turn 1");
  });

  it("numbers entries from zero and never renumbers them", () => {
    h.controller.intents.endDialogue();
    runUntilPlayer(h, "rowen");
    const before = h.controller.log.map((entry) => entry.index);
    expect(before).toEqual(before.map((_, index) => index));
    h.controller.intents.beginMove("rowen");
    h.controller.intents.confirmMove("rowen", { x: 0, y: 3 });
    const after = h.controller.log;
    expect(after.map((entry) => entry.index)).toEqual(after.map((_, index) => index));
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("files the actor, the order, the target and what it actually restored", () => {
    h.controller.intents.endDialogue();
    runUntilPlayer(h, "rowen");
    h.controller.intents.selectItem("rowen", "coagulant-vial");
    h.controller.intents.confirmItemTarget("rowen", "coagulant-vial", {
      kind: "unit",
      unitId: "vale",
    });
    const entry = actions(h.controller.log).find((row) => row.action === "Coagulant Vial");
    expect(entry).toBeDefined();
    expect(entry?.actor).toEqual({ id: "rowen", name: "Rowen Corvane", team: "player" });
    expect(entry?.turn).toBeGreaterThan(0);
    expect(entry?.targets).toHaveLength(1);
    const target = entry?.targets[0];
    expect(target?.id).toBe("vale");
    expect(target?.team).toBe("player");
    expect(target?.hit).toBe(true);
    // What the rules actually restored, not what the forecast promised: Vale is
    // unhurt, so the vial's 30 lands as nothing and the record says so.
    expect(target?.recovery).toBe(0);
    expect(target?.hpRemaining).toBe(h.controller.unitSnapshot("vale")?.hp);
    expect(entry?.notes).toContain("1 left in the satchel");
    expect(entry?.text).toContain("Vale Tarn");
    expect(entry?.text).toContain("0 recovered");
  });

  it("files a walk as the order it is", () => {
    h.controller.intents.endDialogue();
    runUntilPlayer(h, "rowen");
    h.controller.intents.beginMove("rowen");
    h.controller.intents.confirmMove("rowen", { x: 0, y: 3 });
    const move = actions(h.controller.log).find(
      (row) => row.action === "Move" && row.actor?.id === "rowen",
    );
    expect(move?.actor?.id).toBe("rowen");
    expect(move?.notes).toContain("to (0, 3)");
  });

  it("files the enemy's turn even though nobody was watching it", () => {
    h.controller.intents.endDialogue();
    for (let tick = 0; tick < 400; tick += 1) {
      if (h.controller.log.some((entry) => entry.actor?.team === "enemy" && entry.kind === "action")) break;
      if (h.controller.phase === "ended") break;
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
    const enemy = h.controller.log.find(
      (entry) => entry.kind === "action" && entry.actor?.team === "enemy",
    );
    expect(enemy).toBeDefined();
    expect(enemy?.text.length).toBeGreaterThan(0);
  });

  it("rides on the same view the panels draw from", () => {
    h.controller.intents.endDialogue();
    runUntilPlayer(h, "rowen");
    expect(h.ui.latest()?.log).toEqual(h.controller.log);
  });
});

describe("the record, straight off a batch", () => {
  const conduit: Unit = {
    schemaVersion: 1,
    id: "vale",
    name: "Vale Tarn",
    level: 1,
    jobId: "conduit",
    disposition: { resolve: 50, attunement: 70 },
    learnedAbilityIds: ["surge", "overload-cell"],
    equipment: {},
  };

  const ready = (): GameState => {
    const opened = createBattle(
      testContent(),
      YARD_ENCOUNTER_ID,
      [conduit],
      [{ unitId: "vale", position: VALE_TILE, facing: "north" }],
      [],
    );
    return advanceTo(opened.state, "vale");
  };

  it("names a status, its clock, and who is wearing it", () => {
    const before = ready();
    const result = applyCommand(before, {
      kind: "act",
      unitId: "vale",
      abilityId: "surge",
      target: { kind: "unit", unitId: "vale" },
    });
    expect(result.error).toBeNull();
    const log = new BattleLog();
    log.record(result.events, result.state, before);
    const entry = log.entries.find((row) => row.action === "Surge");
    expect(entry?.targets[0]?.id).toBe("vale");
    expect(entry?.targets[0]?.statuses).toEqual([
      { id: "surged", name: "Surged", change: "applied", remainingTurns: null },
    ]);
    expect(entry?.text).toContain("Surged");
  });

  it("files what an order did to machinery, and what the grid did about it", () => {
    const before = ready();
    const result = applyCommand(before, {
      kind: "act",
      unitId: "vale",
      abilityId: "overload-cell",
      target: { kind: "object", objectId: "yard-cell" },
    });
    expect(result.error).toBeNull();
    const log = new BattleLog();
    log.record(result.events, result.state, before);
    const entry = log.entries.find((row) => row.action === "Overload Cell");
    expect(entry?.actor).toEqual({ id: "vale", name: "Vale Tarn", team: "player" });
    const target = entry?.targets[0];
    expect(target?.id).toBe("yard-cell");
    expect(target?.team).toBeUndefined();
    expect(target?.hit).toBe(true);
    expect(target?.damage).toBeGreaterThan(0);
    expect(target?.hpRemaining).toBe(0);
    expect(entry?.notes.join(" · ")).toContain("destroyed");
    expect(entry?.notes.join(" · ")).toContain("lost power");
  });

  it("keeps the tail in order and hands back only what was asked for", () => {
    const before = ready();
    const result = applyCommand(before, {
      kind: "act",
      unitId: "vale",
      abilityId: "surge",
      target: { kind: "unit", unitId: "vale" },
    });
    const log = new BattleLog();
    log.record(result.events, result.state, before);
    expect(log.tail(0)).toEqual([]);
    const tail = log.tail(1);
    expect(tail).toHaveLength(1);
    expect(tail[0]).toEqual(log.entries[log.entries.length - 1]);
  });
});

/**
 * Re-playtest N8. "No effect" means "no damage or recovery figure", and the
 * clause after it named the effect: `Throw the Breaker — Freight Lift: no effect
 * — Freight Lift came back up`. A record that contradicts itself in one line is
 * a record the player stops reading.
 */
describe("what the record calls an order that moved no figures", () => {
  const BREAKER: Unit = { ...VALE, learnedAbilityIds: ["throw-the-breaker", "overload-cell"] };

  function yardHarness(): Harness {
    const battle = openBattle([rowen(), BREAKER], [
      { unitId: "rowen", position: { x: 0, y: 4 }, facing: "north" },
      { unitId: "vale", position: { x: 3, y: 5 }, facing: "north" },
    ]);
    const renderer = fakeRenderer();
    const ui = fakeUi();
    return {
      renderer,
      ui,
      controller: new BattleController({
        state: battle.state,
        events: battle.events,
        renderer: renderer.port,
        ui: ui.port,
        ai: stubAiCommand,
      }),
    };
  }

  it("names the machine once, in the clause that says what happened to it", () => {
    const h = yardHarness();
    h.controller.start();
    h.controller.intents.endDialogue();
    runUntilPlayer(h, "vale");
    h.controller.intents.selectAbility("vale", "throw-the-breaker");
    h.controller.intents.confirmTarget("vale", "throw-the-breaker", {
      kind: "object",
      objectId: "freight-lift",
    });

    const filed = actions(h.controller.log).find((row) => row.action === "Throw the Breaker");
    expect(filed).toBeDefined();
    expect(filed?.text).toContain("Freight Lift lost power");
    expect(filed?.text).not.toContain("no effect");
    // The target is still in the structured record; it is the sentence that changed.
    expect(filed?.targets.map((target) => target.name)).toContain("Freight Lift");
  });
});
