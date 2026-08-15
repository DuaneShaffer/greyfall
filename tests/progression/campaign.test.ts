import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_STATE_VERSION,
  JOB_LEVEL_THRESHOLDS,
  MAX_JOB_LEVEL,
  createCampaign,
  currentEncounterId,
  currentStanding,
  inventoryCount,
  isCampaignComplete,
  jobLevel,
  jobLevelFor,
  jobProgress,
  learnedAbilities,
  rosterUnit,
  standingToNextJobLevel,
} from "../../src/core/index.js";
import { BENCH_UNITS, benchCampaign, benchState } from "./fixtures.js";

describe("job level curve", () => {
  it("starts at 1 and rises at each threshold", () => {
    expect(jobLevelFor(0)).toBe(1);
    expect(jobLevelFor(99)).toBe(1);
    expect(jobLevelFor(100)).toBe(2);
    expect(jobLevelFor(249)).toBe(2);
    expect(jobLevelFor(250)).toBe(3);
    expect(jobLevelFor(450)).toBe(4);
    expect(jobLevelFor(700)).toBe(5);
    expect(jobLevelFor(1000)).toBe(6);
    expect(jobLevelFor(1350)).toBe(7);
    expect(jobLevelFor(1750)).toBe(8);
  });

  it("caps at the last threshold", () => {
    expect(jobLevelFor(999_999)).toBe(MAX_JOB_LEVEL);
    expect(standingToNextJobLevel(999_999)).toBeNull();
  });

  it("thresholds are strictly increasing", () => {
    for (let i = 1; i < JOB_LEVEL_THRESHOLDS.length; i += 1) {
      expect(JOB_LEVEL_THRESHOLDS[i]!).toBeGreaterThan(JOB_LEVEL_THRESHOLDS[i - 1]!);
    }
  });

  it("reports the gap to the next level", () => {
    expect(standingToNextJobLevel(0)).toBe(100);
    expect(standingToNextJobLevel(60)).toBe(40);
    expect(standingToNextJobLevel(100)).toBe(150);
  });
});

describe("createCampaign", () => {
  it("deep-copies the roster so data/units is never mutated", () => {
    const state = benchState();
    const unit = rosterUnit(state, "rowen");
    expect(unit).not.toBeNull();
    unit!.level = 99;
    expect(BENCH_UNITS["rowen"]!.level).toBe(1);
  });

  it("banks the starting bonus into each unit's primary job", () => {
    const state = benchState();
    expect(jobProgress(state, "rowen", "enforcer")).toEqual({
      jobId: "enforcer",
      earned: 300,
      balance: 300,
    });
    expect(jobProgress(state, "vale", "conduit").balance).toBe(300);
    expect(jobLevel(state, "rowen", "enforcer")).toBe(3);
    expect(currentStanding(state, "vale")).toBe(300);
  });

  it("seeds the learned set from the unit definition", () => {
    const state = benchState();
    expect(learnedAbilities(state, "rowen")).toEqual(["pin"]);
    expect(learnedAbilities(state, "vale")).toEqual([]);
  });

  it("reads zero for a job the unit has never held", () => {
    const state = benchState();
    expect(jobProgress(state, "rowen", "machinist")).toEqual({
      jobId: "machinist",
      earned: 0,
      balance: 0,
    });
    expect(jobLevel(state, "rowen", "machinist")).toBe(1);
  });

  it("builds the starting inventory and opens on the first encounter", () => {
    const state = benchState();
    expect(state.version).toBe(CAMPAIGN_STATE_VERSION);
    expect(inventoryCount(state, "line-rod")).toBe(2);
    expect(inventoryCount(state, "watch-plate")).toBe(1);
    expect(inventoryCount(state, "nothing")).toBe(0);
    expect(state.encounterIndex).toBe(0);
    expect(currentEncounterId(state, benchCampaign())).toBe("e1-marshaling-yard");
    expect(isCampaignComplete(state, benchCampaign())).toBe(false);
  });

  it("keeps the roster in the campaign's declared order", () => {
    const state = createCampaign(
      benchCampaign({ startingRosterUnitIds: ["vale", "rowen"] }),
      BENCH_UNITS,
    );
    expect(state.roster.map((unit) => unit.id)).toEqual(["vale", "rowen"]);
  });

  it("keeps progress and inventory in id order", () => {
    const state = createCampaign(
      benchCampaign({ startingRosterUnitIds: ["vale", "rowen"] }),
      BENCH_UNITS,
    );
    expect(state.progress.map((entry) => entry.unitId)).toEqual(["rowen", "vale"]);
    expect(state.inventory.map((entry) => entry.itemId)).toEqual(["line-rod", "watch-plate"]);
  });

  it("throws on a starting roster id with no unit", () => {
    expect(() =>
      createCampaign(benchCampaign({ startingRosterUnitIds: ["ghost"] }), BENCH_UNITS),
    ).toThrow(/unknown starting roster unit ghost/);
  });

  it("reports completion once the encounter list runs out", () => {
    const campaign = benchCampaign();
    const state = benchState();
    state.encounterIndex = campaign.encounterIds.length;
    expect(currentEncounterId(state, campaign)).toBeNull();
    expect(isCampaignComplete(state, campaign)).toBe(true);
  });
});
