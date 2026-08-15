import { describe, expect, it } from "vitest";
import {
  applyBattleResults,
  inventoryCount,
  jobLevel,
  jobProgress,
  rosterUnit,
  unitProgress,
  type CampaignState,
  type GameState,
} from "../../src/core/index.js";
import { benchState } from "./fixtures.js";
import { openBattle } from "../app/fixtures.js";

/**
 * A real battle state, doctored: `applyBattleResults` reads only the result,
 * the encounter id, and each player unit's `standingEarned` / `downed`, so the
 * cheapest honest fixture is a live `createBattle` with those fields set.
 */
function finished(options: {
  result: "win" | "loss";
  earned?: Record<string, number>;
  downed?: string[];
}): GameState {
  const battle = openBattle();
  const state = structuredClone(battle.state);
  state.result = options.result;
  for (const unit of state.units) {
    if (unit.team !== "player") continue;
    unit.standingEarned = options.earned?.[unit.id] ?? 0;
    unit.downed = options.downed?.includes(unit.id) ?? false;
  }
  return state;
}

const ENCOUNTER_ID = "e1-marshaling-yard";

const withRowenOnly = (): CampaignState =>
  benchState({ startingRosterUnitIds: ["rowen"], encounterIds: [ENCOUNTER_ID, "e2-elsewhere"] });

describe("applyBattleResults — win", () => {
  it("banks Standing into the job the unit fought in", () => {
    const before = withRowenOnly();
    const { state, outcome } = applyBattleResults(before, finished({ result: "win", earned: { rowen: 60 } }));
    expect(outcome.result).toBe("win");
    expect(outcome.encounterId).toBe(ENCOUNTER_ID);
    expect(outcome.standing).toEqual([{ unitId: "rowen", jobId: "enforcer", amount: 60 }]);
    expect(jobProgress(state, "rowen", "enforcer")).toEqual({
      jobId: "enforcer",
      earned: 360,
      balance: 360,
    });
    expect(jobProgress(before, "rowen", "enforcer").earned).toBe(300);
  });

  it("raises the job level when the banked total crosses a threshold", () => {
    const before = benchState({ startingRosterUnitIds: ["rowen"], startingStandingBonus: 200 });
    expect(jobLevel(before, "rowen", "enforcer")).toBe(2);
    const { state } = applyBattleResults(before, finished({ result: "win", earned: { rowen: 60 } }));
    expect(jobLevel(state, "rowen", "enforcer")).toBe(3);
  });

  it("advances the encounter index and records the win", () => {
    const before = withRowenOnly();
    const { state, outcome } = applyBattleResults(before, finished({ result: "win" }));
    expect(outcome.advanced).toBe(true);
    expect(state.encounterIndex).toBe(1);
    expect(state.completedEncounterIds).toEqual([ENCOUNTER_ID]);
  });

  it("does not advance again when the same encounter is replayed", () => {
    let state = withRowenOnly();
    state = applyBattleResults(state, finished({ result: "win" })).state;
    const replay = applyBattleResults(state, finished({ result: "win", earned: { rowen: 20 } }));
    expect(replay.outcome.advanced).toBe(false);
    expect(replay.state.encounterIndex).toBe(1);
    expect(replay.state.completedEncounterIds).toEqual([ENCOUNTER_ID]);
    expect(jobProgress(replay.state, "rowen", "enforcer").balance).toBe(320);
  });
});

describe("applyBattleResults — permadeath", () => {
  it("strikes a unit that was still down when the field was held", () => {
    const before = withRowenOnly();
    const { state, outcome } = applyBattleResults(
      before,
      finished({ result: "win", earned: { rowen: 40 }, downed: ["rowen"] }),
    );
    expect(outcome.fallen).toEqual([
      { unitId: "rowen", name: "Rowen Corvane", jobId: "enforcer", level: 1, encounterId: ENCOUNTER_ID },
    ]);
    expect(rosterUnit(state, "rowen")).toBeNull();
    expect(unitProgress(state, "rowen")).toBeNull();
    expect(state.fallen).toHaveLength(1);
  });

  it("recovers the fallen unit's kit into stock", () => {
    const before = withRowenOnly();
    expect(inventoryCount(before, "shock-maul")).toBe(0);
    const { state } = applyBattleResults(before, finished({ result: "win", downed: ["rowen"] }));
    expect(inventoryCount(state, "shock-maul")).toBe(1);
  });

  it("banks the Standing a unit earned before it fell", () => {
    const before = withRowenOnly();
    const { outcome } = applyBattleResults(
      before,
      finished({ result: "win", earned: { rowen: 30 }, downed: ["rowen"] }),
    );
    expect(outcome.standing).toEqual([{ unitId: "rowen", jobId: "enforcer", amount: 30 }]);
  });
});

describe("applyBattleResults — loss", () => {
  it("changes nothing at all", () => {
    const before = withRowenOnly();
    const { state, outcome } = applyBattleResults(
      before,
      finished({ result: "loss", earned: { rowen: 90 }, downed: ["rowen"] }),
    );
    expect(state).toBe(before);
    expect(outcome).toEqual({
      result: "loss",
      encounterId: ENCOUNTER_ID,
      standing: [],
      fallen: [],
      advanced: false,
    });
  });

  it("treats an unresolved battle as a loss", () => {
    const before = withRowenOnly();
    const battle = openBattle();
    const { state, outcome } = applyBattleResults(before, battle.state);
    expect(state).toBe(before);
    expect(outcome.result).toBe("loss");
    expect(outcome.advanced).toBe(false);
  });
});
