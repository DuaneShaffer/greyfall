import { describe, expect, it } from "vitest";
import {
  activeUnit,
  applyCommand,
  changeJob,
  createCampaign,
  getUnit,
  rosterUnit,
  unitMaxHp,
  type BattleEvent,
  type GameState,
} from "../../src/core/index.js";
import type { Campaign } from "../../src/data/index.js";
import { toRenderEventList, toRenderEvents, viewModelFromGameState } from "../../src/render/adapter.js";
import { sheetJob } from "../../src/render/sprites.js";
import { advanceTo, loadContent, loadUnits, rowen, YARD_ENCOUNTER_ID } from "../core/fixtures.js";
import { openBattle, VALE } from "./fixtures.js";

const battle = (): GameState => openBattle([rowen(), VALE]).state;

describe("viewModelFromGameState", () => {
  it("mirrors every unit and object in the battle", () => {
    const state = battle();
    const view = viewModelFromGameState(state);

    expect(view.map.id).toBe("marshaling-yard");
    expect(view.units.map((unit) => unit.id).sort()).toEqual(["provocateur-a", "rowen", "vale"]);
    expect(view.objects.map((object) => object.id)).toEqual([
      "crate-stack",
      "freight-lift",
      "yard-cell",
      "yard-switch",
    ]);
  });

  it("derives hp fractions and standing elevation, not raw hp", () => {
    const state = battle();
    const view = viewModelFromGameState(state);
    const unit = view.units.find((candidate) => candidate.id === "rowen");

    expect(unit?.hpFraction).toBe(1);
    expect(unit?.elevation).toBe(0);
    expect(unit?.jobId).toBe("enforcer");
    expect(unit?.downed).toBe(false);
  });

  it("carries live object state, not the authored defaults", () => {
    const start = openBattle([rowen(), VALE]);
    const state = advanceTo(start.state, "vale");
    const result = applyCommand(state, {
      kind: "act",
      unitId: "vale",
      abilityId: "overload-cell",
      target: { kind: "object", objectId: "yard-cell" },
    });
    expect(result.error).toBeNull();

    // The charge fires a few ticks later; run turns until the cell is gone.
    let current = result.state;
    for (let i = 0; i < 20; i += 1) {
      const cell = current.map.objects.find((object) => object.def.id === "yard-cell");
      if (cell?.destroyed === true) break;
      const acting = activeUnit(current);
      if (acting === null) break;
      const pass = applyCommand(current, { kind: "endTurn", unitId: acting.id });
      if (pass.error !== null) break;
      current = pass.state;
    }

    const view = viewModelFromGameState(current);
    const cell = view.objects.find((object) => object.id === "yard-cell");
    expect(cell?.destroyed).toBe(true);
    expect(cell?.powered).toBe(false);
  });
});

describe("a re-jobbed unit", () => {
  const CHAPTER: Campaign = {
    schemaVersion: 1,
    id: "rejob-bench",
    name: "Rejob Bench",
    description: "One unit, one encounter, so a job change has somewhere to land.",
    encounterIds: [YARD_ENCOUNTER_ID],
    startingRosterUnitIds: ["rowen"],
  };

  it("wears the sheet of the job it changed into", () => {
    const content = loadContent();
    const changed = changeJob(createCampaign(CHAPTER, loadUnits()), "rowen", "conduit", content);
    expect(changed.error).toBeNull();

    const unit = rosterUnit(changed.state, "rowen");
    expect(unit).not.toBeNull();

    const view = viewModelFromGameState(openBattle([unit!]).state);
    const drawn = view.units.find((candidate) => candidate.id === "rowen");
    expect(drawn?.jobId).toBe("conduit");
    expect(sheetJob(drawn!.jobId)).toBe("conduit");
  });
});

describe("toRenderEvents", () => {
  const state = battle();

  it("turns a move into one walk animation along the whole path", () => {
    const event: BattleEvent = {
      type: "UnitMoved",
      unitId: "rowen",
      from: { x: 0, y: 4 },
      to: { x: 2, y: 4 },
      path: [
        { x: 0, y: 4 },
        { x: 1, y: 4 },
        { x: 2, y: 4 },
      ],
    };
    expect(toRenderEvents(event, state)).toEqual([
      {
        kind: "unitMoved",
        unitId: "rowen",
        path: [
          { x: 0, y: 4 },
          { x: 1, y: 4 },
          { x: 2, y: 4 },
        ],
        facing: "east",
      },
    ]);
  });

  it("carries the terminal hp fraction on a hit, so skipping still lands right", () => {
    const max = unitMaxHp(state, "rowen") ?? 0;
    const events = toRenderEvents(
      {
        type: "DamageDealt",
        unitId: "rowen",
        sourceUnitId: "provocateur-a",
        amount: 20,
        damageType: "kinetic",
        hpRemaining: max - 20,
      },
      state,
    );
    expect(events).toEqual([
      {
        kind: "unitHit",
        unitId: "rowen",
        amount: 20,
        hpFractionAfter: (max - 20) / max,
        damageType: "kinetic",
        sourceUnitId: "provocateur-a",
      },
    ]);
  });

  it("reads the terminal state it is handed without writing to it", () => {
    const event: BattleEvent = { type: "UnitDowned", unitId: "provocateur-a" };
    const before = structuredClone(state);
    toRenderEvents(event, state);
    expect(state).toEqual(before);
  });

  it("focuses the camera when a turn opens", () => {
    const acting = activeUnit(state);
    expect(acting).not.toBeNull();
    const position = getUnit(state, acting?.id ?? "")?.position;
    expect(
      toRenderEvents(
        { type: "TurnStarted", unitId: acting?.id ?? "", turn: 1, clock: 17 },
        state,
      ),
    ).toEqual([{ kind: "cameraFocused", tile: position }]);
  });

  it("maps machinery events onto their object visuals", () => {
    expect(toRenderEvents({ type: "PowerChanged", objectId: "freight-lift", powered: false }, state)).toEqual(
      [{ kind: "objectPowerChanged", objectId: "freight-lift", powered: false }],
    );
    expect(toRenderEvents({ type: "ObjectDestroyed", objectId: "yard-cell" }, state)).toEqual([
      { kind: "objectDestroyed", objectId: "yard-cell" },
    ]);
  });

  it("drops events with no visual, and never renders dialogue", () => {
    const silent: BattleEvent[] = [
      { type: "StandingAwarded", unitId: "rowen", amount: 10, total: 10 },
      { type: "TriggerFired", triggerId: "opening-words" },
      { type: "ClockAdvanced", clock: 4 },
      { type: "TurnEnded", unitId: "rowen", ctSpent: 100 },
      { type: "BattleEnded", result: "win" },
      {
        type: "DialogueRequested",
        triggerId: "opening-words",
        lines: [{ speaker: "Maren Voss", text: "..." }],
      },
    ];
    expect(toRenderEventList(silent, state)).toEqual([]);
  });
});
