import { describe, expect, it } from "vitest";
import {
  changeJob,
  deriveStats,
  equipItem,
  equippedItems,
  inventoryCount,
  jobLevel,
  jobProgress,
  learnAbility,
  learnedAbilities,
  rosterUnit,
  setAbilitySlot,
  setSecondaryJob,
  unequipItem,
  unmetPrerequisite,
  type CampaignState,
  type ProgressionErrorCode,
} from "../../src/core/index.js";
import { BENCH, CONDUIT, ENFORCER, MACHINIST, benchState } from "./fixtures.js";

const unit = (state: CampaignState, id: string) => {
  const found = rosterUnit(state, id);
  if (found === null) throw new Error(`${id} left the roster`);
  return found;
};

const expectRefusal = (
  result: { state: CampaignState; error: { code: ProgressionErrorCode } | null },
  before: CampaignState,
  code: ProgressionErrorCode,
): void => {
  expect(result.error?.code).toBe(code);
  expect(result.state).toBe(before);
};

describe("learnAbility", () => {
  it("spends the current job's Standing and records the purchase", () => {
    const before = benchState();
    const { state, error } = learnAbility(before, "rowen", "brace", BENCH);
    expect(error).toBeNull();
    expect(jobProgress(state, "rowen", "enforcer").balance).toBe(150);
    expect(learnedAbilities(state, "rowen")).toEqual(["brace", "pin"]);
    expect(before.progress[0]!.learned).toEqual(["pin"]);
  });

  it("leaves the job level alone — earned is never spent down", () => {
    const before = benchState();
    const { state } = learnAbility(before, "rowen", "brace", BENCH);
    expect(jobProgress(state, "rowen", "enforcer").earned).toBe(300);
    expect(jobLevel(state, "rowen", "enforcer")).toBe(3);
  });

  it("keeps passives out of the action skillset projection", () => {
    const { state } = learnAbility(benchState(), "rowen", "brace", BENCH);
    expect(unit(state, "rowen").learnedAbilityIds).toEqual(["pin"]);
  });

  it("rejects an unknown unit", () => {
    const before = benchState();
    expectRefusal(learnAbility(before, "ghost", "pin", BENCH), before, "unknown-unit");
  });

  it("rejects an unknown ability", () => {
    const before = benchState();
    expectRefusal(learnAbility(before, "rowen", "nope", BENCH), before, "unknown-ability");
  });

  it("rejects an ability already learned", () => {
    const before = benchState();
    expectRefusal(learnAbility(before, "rowen", "pin", BENCH), before, "already-learned");
  });

  it("rejects an ability off the current job's list", () => {
    const before = benchState();
    expectRefusal(
      learnAbility(before, "rowen", "overload-cell", BENCH),
      before,
      "ability-not-learnable",
    );
  });

  it("rejects a purchase the job's Standing cannot cover", () => {
    const before = benchState({ startingStandingBonus: 90 });
    expectRefusal(learnAbility(before, "rowen", "brace", BENCH), before, "insufficient-standing");
  });

  it("does not let one job's Standing pay for another's abilities", () => {
    let state = benchState();
    state = changeJob(state, "vale", "enforcer", BENCH).state;
    expect(jobProgress(state, "vale", "enforcer").balance).toBe(0);
    const refused = learnAbility(state, "vale", "pin", BENCH);
    expect(refused.error?.code).toBe("insufficient-standing");
  });
});

describe("equipItem / unequipItem", () => {
  it("moves stock onto the unit and the old kit back into stock", () => {
    const before = benchState();
    const { state, error } = equipItem(before, "rowen", "body", "watch-plate", BENCH);
    expect(error).toBeNull();
    expect(unit(state, "rowen").equipment.body).toBe("watch-plate");
    expect(inventoryCount(state, "watch-plate")).toBe(0);
    expect(unit(before, "rowen").equipment.body).toBeUndefined();
  });

  it("returns the displaced item when a slot is swapped", () => {
    let state = benchState();
    state = equipItem(state, "rowen", "body", "watch-plate", BENCH).state;
    state = unequipItem(state, "rowen", "body").state;
    expect(inventoryCount(state, "watch-plate")).toBe(1);
    expect(unit(state, "rowen").equipment.body).toBeUndefined();
  });

  it("re-equipping the same item is a no-op, not a double spend", () => {
    let state = benchState();
    state = equipItem(state, "rowen", "body", "watch-plate", BENCH).state;
    const again = equipItem(state, "rowen", "body", "watch-plate", BENCH);
    expect(again.error).toBeNull();
    expect(inventoryCount(again.state, "watch-plate")).toBe(0);
  });

  it("rejects an unknown item", () => {
    const before = benchState();
    expectRefusal(equipItem(before, "rowen", "weapon", "nope", BENCH), before, "unknown-item");
  });

  it("rejects an item that does not fit the slot", () => {
    const before = benchState();
    expectRefusal(
      equipItem(before, "rowen", "weapon", "watch-plate", BENCH),
      before,
      "slot-mismatch",
    );
  });

  it("rejects kit the job has no tag for", () => {
    const before = benchState();
    expectRefusal(
      equipItem(before, "rowen", "weapon", "line-rod", BENCH),
      before,
      "job-cannot-equip",
    );
  });

  it("rejects an item nobody owns", () => {
    const before = benchState({ startingInventory: [] });
    expectRefusal(
      equipItem(before, "rowen", "body", "watch-plate", BENCH),
      before,
      "item-not-owned",
    );
  });

  it("rejects an item another unit is already wearing", () => {
    let state = benchState();
    state = equipItem(state, "rowen", "body", "watch-plate", BENCH).state;
    state = changeJob(state, "vale", "enforcer", BENCH).state;
    const refused = equipItem(state, "vale", "body", "watch-plate", BENCH);
    expect(refused.error?.code).toBe("item-not-owned");
  });

  it("rejects unequipping an empty slot", () => {
    const before = benchState();
    expectRefusal(unequipItem(before, "rowen", "head"), before, "nothing-equipped");
  });

  it("keeps deriveStats coherent after an equip", () => {
    const before = benchState();
    const baseline = deriveStats(unit(before, "rowen"), ENFORCER, equippedItems(unit(before, "rowen"), BENCH.items));
    const { state } = equipItem(before, "rowen", "body", "watch-plate", BENCH);
    const after = deriveStats(unit(state, "rowen"), ENFORCER, equippedItems(unit(state, "rowen"), BENCH.items));
    expect(after.hp - baseline.hp).toBe(8);
    expect(after.speed - baseline.speed).toBe(-1);
  });
});

describe("setAbilitySlot", () => {
  it("slots a learned passive", () => {
    let state = benchState();
    state = learnAbility(state, "rowen", "brace", BENCH).state;
    const { state: slotted, error } = setAbilitySlot(state, "rowen", "support", "brace", BENCH);
    expect(error).toBeNull();
    expect(unit(slotted, "rowen").supportAbilityId).toBe("brace");
  });

  it("clears a slot with null", () => {
    let state = benchState();
    state = learnAbility(state, "rowen", "brace", BENCH).state;
    state = setAbilitySlot(state, "rowen", "support", "brace", BENCH).state;
    state = setAbilitySlot(state, "rowen", "support", null, BENCH).state;
    expect(unit(state, "rowen").supportAbilityId).toBeUndefined();
  });

  it("rejects an ability of the wrong slot kind", () => {
    const before = benchState();
    expectRefusal(
      setAbilitySlot(before, "rowen", "support", "pin", BENCH),
      before,
      "slot-mismatch",
    );
  });

  it("rejects an ability the unit has not paid for", () => {
    const before = benchState();
    expectRefusal(
      setAbilitySlot(before, "rowen", "support", "brace", BENCH),
      before,
      "not-learned",
    );
  });

  it("keeps a slotted passive across a job change", () => {
    let state = benchState();
    state = learnAbility(state, "rowen", "brace", BENCH).state;
    state = setAbilitySlot(state, "rowen", "support", "brace", BENCH).state;
    state = changeJob(state, "rowen", "conduit", BENCH).state;
    expect(unit(state, "rowen").supportAbilityId).toBe("brace");
  });
});

describe("changeJob", () => {
  it("moves the primary job and opens a fresh Standing account", () => {
    const before = benchState();
    const { state, error } = changeJob(before, "rowen", "conduit", BENCH);
    expect(error).toBeNull();
    expect(unit(state, "rowen").jobId).toBe("conduit");
    expect(jobProgress(state, "rowen", "conduit")).toEqual({
      jobId: "conduit",
      earned: 0,
      balance: 0,
    });
    expect(jobProgress(state, "rowen", "enforcer").balance).toBe(300);
  });

  it("returns kit the new job cannot carry", () => {
    const { state } = changeJob(benchState(), "rowen", "conduit", BENCH);
    expect(unit(state, "rowen").equipment.weapon).toBeUndefined();
    expect(inventoryCount(state, "shock-maul")).toBe(1);
  });

  it("takes the old job's action skillset off the menu without unlearning it", () => {
    const { state } = changeJob(benchState(), "rowen", "conduit", BENCH);
    expect(unit(state, "rowen").learnedAbilityIds).toEqual([]);
    expect(learnedAbilities(state, "rowen")).toEqual(["pin"]);
  });

  it("restores the skillset when the job comes back", () => {
    let state = benchState();
    state = changeJob(state, "rowen", "conduit", BENCH).state;
    state = changeJob(state, "rowen", "enforcer", BENCH).state;
    expect(unit(state, "rowen").learnedAbilityIds).toEqual(["pin"]);
  });

  it("rejects the job the unit is already in", () => {
    const before = benchState();
    expectRefusal(changeJob(before, "rowen", "enforcer", BENCH), before, "same-job");
  });

  it("rejects an unknown job", () => {
    const before = benchState();
    expectRefusal(changeJob(before, "rowen", "nope", BENCH), before, "unknown-job");
  });

  it("rejects a job whose prerequisites are unmet", () => {
    const before = benchState({ startingStandingBonus: 100 });
    expect(jobLevel(before, "rowen", "enforcer")).toBe(2);
    expectRefusal(
      changeJob(before, "rowen", "machinist", BENCH),
      before,
      "prerequisite-not-met",
    );
    expect(unmetPrerequisite(before, "rowen", MACHINIST)).toEqual({
      jobId: "enforcer",
      required: 3,
      actual: 2,
    });
  });

  it("allows the job once the prerequisite level is banked", () => {
    const before = benchState({ startingStandingBonus: 250 });
    expect(unmetPrerequisite(before, "rowen", MACHINIST)).toBeNull();
    const { error } = changeJob(before, "rowen", "machinist", BENCH);
    expect(error).toBeNull();
  });

  it("keeps deriveStats coherent after the job and its kit change", () => {
    const before = benchState();
    const armed = deriveStats(
      unit(before, "rowen"),
      ENFORCER,
      equippedItems(unit(before, "rowen"), BENCH.items),
    );
    expect(equippedItems(unit(before, "rowen"), BENCH.items)).toHaveLength(1);

    const { state } = changeJob(before, "rowen", "conduit", BENCH);
    const after = deriveStats(
      unit(state, "rowen"),
      CONDUIT,
      equippedItems(unit(state, "rowen"), BENCH.items),
    );
    expect(equippedItems(unit(state, "rowen"), BENCH.items)).toHaveLength(0);
    expect(after.move).toBe(CONDUIT.baseMove);
    expect(after.jump).toBe(CONDUIT.baseJump);
    expect(after.evade).toBe(CONDUIT.baseEvade);
    expect(armed.evade).toBe(ENFORCER.baseEvade);
  });

  it("clears a secondary that collides with the new primary", () => {
    let state = benchState();
    state = setSecondaryJob(state, "rowen", "conduit", BENCH).state;
    state = changeJob(state, "rowen", "conduit", BENCH).state;
    expect(unit(state, "rowen").secondaryJobId).toBeUndefined();
  });
});

describe("setSecondaryJob", () => {
  it("borrows a second skillset and projects its learned abilities", () => {
    let state = benchState();
    state = changeJob(state, "rowen", "conduit", BENCH).state;
    state = setSecondaryJob(state, "rowen", "enforcer", BENCH).state;
    expect(unit(state, "rowen").secondaryJobId).toBe("enforcer");
    expect(unit(state, "rowen").learnedAbilityIds).toEqual(["pin"]);
  });

  it("clears with null", () => {
    let state = benchState();
    state = setSecondaryJob(state, "rowen", "conduit", BENCH).state;
    state = setSecondaryJob(state, "rowen", null, BENCH).state;
    expect(unit(state, "rowen").secondaryJobId).toBeUndefined();
  });

  it("rejects the primary job as a secondary", () => {
    const before = benchState();
    expectRefusal(
      setSecondaryJob(before, "rowen", "enforcer", BENCH),
      before,
      "secondary-is-primary",
    );
  });

  it("rejects an unknown job", () => {
    const before = benchState();
    expectRefusal(setSecondaryJob(before, "rowen", "nope", BENCH), before, "unknown-job");
  });

  it("gates a secondary behind the same prerequisites as a job change", () => {
    const before = benchState({ startingStandingBonus: 0 });
    expectRefusal(
      setSecondaryJob(before, "rowen", "machinist", BENCH),
      before,
      "prerequisite-not-met",
    );
  });

  it("rejects an unknown unit", () => {
    const before = benchState();
    expectRefusal(setSecondaryJob(before, "ghost", "conduit", BENCH), before, "unknown-unit");
  });
});
