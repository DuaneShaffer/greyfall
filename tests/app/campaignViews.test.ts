import { describe, expect, it } from "vitest";
import {
  applyBattleResults,
  changeJob,
  equipItem,
  learnAbility,
  rosterUnit,
  setSecondaryJob,
  type GameState,
} from "../../src/core/index.js";
import {
  campaignBattleResultsView,
  campaignChapterCloseView,
  campaignDeploymentView,
  campaignEquipmentView,
  campaignJobsView,
  campaignLearningView,
  campaignPartyView,
  campaignStats,
  campaignUnitSheetView,
  campaignUnitView,
  standingToNextLevel,
} from "../../src/app/campaignViews.js";
import { BENCH, ENFORCER, benchState } from "../progression/fixtures.js";
import { openBattle } from "./fixtures.js";

const TILES = [
  { x: 0, y: 4 },
  { x: 1, y: 4 },
  { x: 0, y: 5 },
];

describe("campaignPartyView", () => {
  it("lists the roster with spendable Standing and the job level", () => {
    const view = campaignPartyView(benchState(), BENCH, 4);
    expect(view.deployedLimit).toBe(4);
    expect(view.members.map((m) => m.unitId)).toEqual(["rowen", "vale"]);
    const rowen = view.members[0]!;
    expect(rowen.standing).toBe(300);
    expect(rowen.hp).toBe(rowen.maxHp);
    expect(rowen.jobLevel).toBe(3);
    expect(rowen.note).toBeUndefined();
  });
});

describe("campaignUnitView / sheet", () => {
  it("reads full HP and no battlefield state between battles", () => {
    const view = campaignUnitView(benchState(), BENCH, "rowen")!;
    expect(view.downed).toBe(false);
    expect(view.ct).toBe(0);
    expect(view.statuses).toEqual([]);
    expect(view.hp).toBe(view.maxHp);
    expect(view.team).toBe("player");
  });

  it("shows every ability the unit has paid for, not just the active skillset", () => {
    let state = benchState();
    state = learnAbility(state, "rowen", "brace", BENCH).state;
    state = changeJob(state, "rowen", "conduit", BENCH).state;
    const sheet = campaignUnitSheetView(state, BENCH, "rowen")!;
    expect(sheet.learnedAbilities.map((entry) => entry.id).sort()).toEqual(["brace", "pin"]);
    expect(sheet.standing).toBe(0);
  });

  it("mirrors deriveStats", () => {
    const state = benchState();
    const sheet = campaignUnitSheetView(state, BENCH, "rowen")!;
    const stats = campaignStats(BENCH, state.roster[0]!)!;
    expect(sheet.stats.map((line) => line.value)).toEqual([
      stats.hp,
      stats.charge,
      stats.speed,
      stats.phys,
      stats.mag,
    ]);
    expect(sheet.move).toBe(stats.move);
  });

  it("tracks the Standing left to the next job level", () => {
    expect(standingToNextLevel(benchState(), "rowen")).toBe(150);
    expect(standingToNextLevel(benchState(), "ghost")).toBeNull();
  });
});

describe("campaignLearningView", () => {
  it("lists the current job's list with learned flags", () => {
    const view = campaignLearningView(benchState(), BENCH, "rowen")!;
    expect(view.jobName).toBe(ENFORCER.name);
    expect(view.standing).toBe(300);
    expect(view.entries.map((entry) => entry.abilityId)).toEqual(ENFORCER.learnableAbilityIds);
    expect(view.entries.find((entry) => entry.abilityId === "pin")?.learned).toBe(true);
    expect(view.entries.find((entry) => entry.abilityId === "brace")?.learned).toBe(false);
  });

  it("follows the unit into a new job", () => {
    const { state } = changeJob(benchState(), "rowen", "conduit", BENCH);
    const view = campaignLearningView(state, BENCH, "rowen")!;
    expect(view.entries.map((entry) => entry.abilityId)).toEqual(["overload-cell", "sprint"]);
    expect(view.standing).toBe(0);
  });
});

describe("campaignEquipmentView", () => {
  it("prices every candidate against the unit's current stats", () => {
    const view = campaignEquipmentView(benchState(), BENCH, "rowen")!;
    const plate = view.options.body.find((option) => option.itemId === "watch-plate")!;
    expect(plate.equipped).toBe(false);
    expect(plate.unavailableReason).toBeUndefined();
    expect(plate.deltas).toEqual([
      { key: "hp", label: "HP", delta: 8 },
      { key: "speed", label: "Speed", delta: -1 },
    ]);
  });

  it("greys kit the job has no tag for", () => {
    const view = campaignEquipmentView(benchState(), BENCH, "rowen")!;
    const rod = view.options.weapon.find((option) => option.itemId === "line-rod")!;
    expect(rod.unavailableReason).toContain("cannot carry");
  });

  it("keeps the worn item listed once stock runs out", () => {
    const { state } = equipItem(benchState(), "rowen", "body", "watch-plate", BENCH);
    const view = campaignEquipmentView(state, BENCH, "rowen")!;
    const plate = view.options.body.find((option) => option.itemId === "watch-plate")!;
    expect(plate.equipped).toBe(true);
    expect(plate.unavailableReason).toBeUndefined();
    expect(view.slots.find((slot) => slot.slot === "body")?.itemName).toBe("Watch Plate");
  });

  it("never offers consumables as equipment", () => {
    const view = campaignEquipmentView(benchState({ startingInventory: [{ itemId: "tonic", count: 1 }] }), BENCH, "rowen")!;
    for (const slot of Object.values(view.options)) {
      expect(slot.some((option) => option.itemId === "tonic")).toBe(false);
    }
  });
});

describe("campaignJobsView", () => {
  it("marks the primary and secondary and locks unmet prerequisites", () => {
    const { state } = setSecondaryJob(benchState({ startingStandingBonus: 100 }), "rowen", "conduit", BENCH);
    const view = campaignJobsView(state, BENCH, "rowen")!;
    const byId = Object.fromEntries(view.options.map((option) => [option.jobId, option]));
    expect(byId["enforcer"]!.isPrimary).toBe(true);
    expect(byId["conduit"]!.isSecondary).toBe(true);
    expect(byId["machinist"]!.lockedReason).toContain("Enforcer level 3");
    expect(view.secondaryJobName).toBe("Conduit");
  });

  it("unlocks a job once its prerequisite level is banked", () => {
    const view = campaignJobsView(benchState({ startingStandingBonus: 250 }), BENCH, "rowen")!;
    expect(view.options.find((option) => option.jobId === "machinist")?.lockedReason).toBeUndefined();
  });
});

describe("campaignDeploymentView", () => {
  it("pairs assignments with tiles and greys the overflow", () => {
    const view = campaignDeploymentView(benchState(), BENCH, {
      encounterId: "e1",
      encounterName: "The Marshaling Yard",
      maxDeployed: 1,
      deploymentTiles: TILES,
      assignments: ["rowen"],
    });
    expect(view.slots).toEqual([{ tile: { x: 0, y: 4 }, unitId: "rowen", unitName: "Rowen Corvane" }]);
    expect(view.candidates.find((c) => c.unitId === "rowen")?.assigned).toBe(true);
    expect(view.candidates.find((c) => c.unitId === "vale")?.unavailableReason).toBe(
      "No deployment tile free",
    );
    expect(view.canConfirm).toBe(true);
  });

  it("blocks confirmation while nobody is on a tile", () => {
    const view = campaignDeploymentView(benchState(), BENCH, {
      encounterId: "e1",
      encounterName: "The Marshaling Yard",
      maxDeployed: 2,
      deploymentTiles: TILES,
      assignments: [null, null],
    });
    expect(view.canConfirm).toBe(false);
    expect(view.blockedReason).toBe("Deploy at least one unit");
    expect(view.candidates.every((c) => c.unavailableReason === undefined)).toBe(true);
  });
});

describe("the record views", () => {
  /** A real battle, doctored: the record view reads the outcome, not the field. */
  const fought = (options: { earned?: Record<string, number>; downed?: string[] }): GameState => {
    const state = structuredClone(openBattle().state);
    state.result = "win";
    for (const unit of state.units) {
      if (unit.team !== "player") continue;
      unit.standingEarned = options.earned?.[unit.id] ?? 0;
      unit.downed = options.downed?.includes(unit.id) ?? false;
    }
    return state;
  };

  it("reads banked Standing and the job levels it bought", () => {
    const before = benchState();
    const { state: after, outcome } = applyBattleResults(before, fought({ earned: { rowen: 400 } }));
    const view = campaignBattleResultsView(before, after, BENCH, outcome);

    expect(view.result).toBe("win");
    expect(view.headline).toBe("Field Held");
    expect(view.standingTotal).toBe(400);
    const rowen = view.standing[0]!;
    expect(rowen).toMatchObject({ name: "Rowen Corvane", jobName: "Enforcer", amount: 400 });
    // 300 banked at level 3, 700 at level 5.
    expect(rowen.jobLevel).toBe(5);
    expect(rowen.jobLevelsGained).toBe(2);
    expect(rowen.struck).toBe(false);
    expect(view.fallen).toEqual([]);
  });

  it("names the fallen from the state they were struck out of", () => {
    const before = benchState();
    const { state: after, outcome } = applyBattleResults(
      before,
      fought({ earned: { rowen: 40 }, downed: ["rowen"] }),
    );
    const view = campaignBattleResultsView(before, after, BENCH, outcome);

    expect(rosterUnit(after, "rowen")).toBeNull();
    expect(view.fallen).toEqual([
      {
        unitId: "rowen",
        name: "Rowen Corvane",
        jobName: "Enforcer",
        level: 1,
        // A bench library carries no encounters; the record falls back to the id.
        encounterName: "e1-marshaling-yard",
      },
    ]);
    const award = view.standing.find((entry) => entry.unitId === "rowen")!;
    expect(award).toMatchObject({ name: "Rowen Corvane", amount: 40, struck: true });
    expect(award.jobLevelsGained).toBe(0);
  });

  it("banks nothing on a loss and says so", () => {
    const before = benchState();
    const lost = fought({ earned: { rowen: 400 }, downed: ["rowen"] });
    lost.result = "loss";
    const { state: after, outcome } = applyBattleResults(before, lost);
    const view = campaignBattleResultsView(before, after, BENCH, outcome);

    expect(view.result).toBe("loss");
    expect(view.headline).toBe("Line Broken");
    expect(view.standing).toEqual([]);
    expect(view.standingTotal).toBe(0);
    expect(view.fallen).toEqual([]);
  });

  it("puts the chapter's dead on the roster view", () => {
    const before = benchState();
    const { state: after } = applyBattleResults(before, fought({ downed: ["rowen"] }));
    const party = campaignPartyView(after, BENCH, 4);

    expect(party.members.map((member) => member.unitId)).toEqual(["vale"]);
    expect(party.fallen?.map((entry) => entry.name)).toEqual(["Rowen Corvane"]);
  });

  it("closes the chapter on what it won, kept, and lost", () => {
    const before = benchState();
    const { state: after } = applyBattleResults(
      before,
      fought({ earned: { rowen: 40 }, downed: ["rowen"] }),
    );
    const view = campaignChapterCloseView(after, { name: "Bench Chapter" }, BENCH);

    expect(view.chapterName).toBe("Bench Chapter");
    expect(view.engagements.map((entry) => entry.encounterId)).toEqual(["e1-marshaling-yard"]);
    expect(view.survivors.map((unit) => unit.name)).toEqual(["Vale Tarn"]);
    expect(view.fallen.map((entry) => entry.name)).toEqual(["Rowen Corvane"]);
    expect(view.standingTotal).toBeGreaterThan(0);
  });
});
