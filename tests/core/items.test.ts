import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  forecast,
  getUnit,
  itemAbilityId,
  targetableTiles,
  teamSatchel,
  usableItems,
  type Command,
  type ContentLibrary,
  type GameState,
} from "../../src/core/index.js";
import type { ItemStack, Unit } from "../../src/data/index.js";
import { advanceTo, enemyAt, enforcer, testContent, yardEncounter } from "./fixtures.js";

/** A Chemist with the bench: item mastery is the whole point of the job. */
function chemist(id: string, name: string, bench: boolean): Unit {
  return {
    schemaVersion: 1,
    id,
    name,
    level: 1,
    jobId: "chemist",
    disposition: { resolve: 50, attunement: 50 },
    learnedAbilityIds: [],
    equipment: {},
    ...(bench ? { supportAbilityId: "bench-grade" } : {}),
  };
}

const DEFAULT_KIT: ItemStack[] = [
  { itemId: "coagulant-vial", count: 2 },
  { itemId: "caustic-flask", count: 1 },
];

interface Options {
  carried?: ItemStack[];
  bench?: boolean;
  content?: ContentLibrary;
}

/**
 * Rowen and a Chemist on the flat western strip of the yard, one hostile two
 * tiles up the same column and one out at the far corner.
 */
function battle(options: Options = {}): GameState {
  const base = options.content ?? testContent();
  const encounter = yardEncounter(base, {
    id: "e-items",
    enemies: [
      enemyAt(enforcer("mark", "Mark"), { x: 1, y: 2 }, "south"),
      enemyAt(enforcer("far", "Far"), { x: 4, y: 0 }, "south"),
    ],
    triggers: [],
  });
  const content: ContentLibrary = { ...base, encounters: { ...base.encounters, "e-items": encounter } };
  return createBattle(
    content,
    "e-items",
    [enforcer("rowen", "Rowen Corvane"), chemist("perr", "Perr Ash", options.bench ?? false)],
    [
      { unitId: "rowen", position: { x: 0, y: 4 }, facing: "north" },
      { unitId: "perr", position: { x: 1, y: 4 }, facing: "north" },
    ],
    options.carried ?? DEFAULT_KIT,
  ).state;
}

/** Knock the target down to a fixed wound so a heal has room to work. */
function wound(state: GameState, unitId: string, hp: number): GameState {
  const next = structuredClone(state);
  const unit = next.units.find((u) => u.id === unitId);
  if (unit === undefined) throw new Error(`no unit ${unitId}`);
  unit.hp = hp;
  return next;
}

const useOn = (state: GameState, unitId: string, itemId: string, targetId: string) =>
  applyCommand(state, { kind: "useItem", unitId, itemId, target: { kind: "unit", unitId: targetId } });

describe("the satchel", () => {
  it("enters the battle from the carry pool, in item-id order", () => {
    const state = battle();
    expect(teamSatchel(state, "player")).toEqual([
      { itemId: "caustic-flask", count: 1 },
      { itemId: "coagulant-vial", count: 2 },
    ]);
    expect(teamSatchel(state, "enemy")).toEqual([]);
  });

  it("is shared: any deployed unit spends from the same pile", () => {
    const opened = advanceTo(battle(), "rowen");
    const first = useOn(wound(opened, "perr", 10), "rowen", "coagulant-vial", "perr");
    expect(first.error).toBeNull();
    expect(teamSatchel(first.state, "player")).toContainEqual({ itemId: "coagulant-vial", count: 1 });
  });

  it("drops a stack that runs out and refuses the next reach for it", () => {
    const opened = advanceTo(battle({ carried: [{ itemId: "coagulant-vial", count: 1 }] }), "rowen");
    const used = useOn(wound(opened, "rowen", 10), "rowen", "coagulant-vial", "rowen");
    expect(used.error).toBeNull();
    expect(teamSatchel(used.state, "player")).toEqual([]);
    const again = advanceTo(used.state, "perr");
    expect(useOn(again, "perr", "coagulant-vial", "perr").error?.code).toBe("item-not-carried");
  });

  it("announces the use before the effect, with the stock left", () => {
    const opened = advanceTo(battle(), "rowen");
    const used = useOn(wound(opened, "perr", 10), "rowen", "coagulant-vial", "perr");
    const kinds = used.events.map((event) => event.type);
    expect(kinds.indexOf("ItemUsed")).toBeLessThan(kinds.indexOf("AbilityUsed"));
    expect(used.events.find((event) => event.type === "ItemUsed")).toEqual({
      type: "ItemUsed",
      unitId: "rowen",
      itemId: "coagulant-vial",
      team: "player",
      remaining: 1,
    });
  });
});

describe("useItem validation", () => {
  it("rejects an id that is not a consumable", () => {
    const state = advanceTo(battle(), "rowen");
    expect(useOn(state, "rowen", "shock-maul", "rowen").error?.code).toBe("unknown-item");
    expect(useOn(state, "rowen", "not-a-thing", "rowen").error?.code).toBe("unknown-item");
  });

  it("rejects an item the force is not carrying", () => {
    const state = advanceTo(battle(), "rowen");
    expect(useOn(state, "rowen", "heavy-coagulant", "rowen").error?.code).toBe("item-not-carried");
  });

  it("rejects an item the unit's job is not issued", () => {
    const base = testContent();
    const enforcerJob = base.jobs["enforcer"];
    if (enforcerJob === undefined) throw new Error("missing enforcer job");
    const unissued: ContentLibrary = {
      ...base,
      jobs: {
        ...base.jobs,
        enforcer: { ...enforcerJob, equipTags: enforcerJob.equipTags.filter((tag) => tag !== "field-issue") },
      },
    };
    const state = advanceTo(battle({ content: unissued }), "rowen");
    expect(useOn(state, "rowen", "coagulant-vial", "rowen").error?.code).toBe("item-not-issued");
  });

  it("rejects a target the item's rule does not allow", () => {
    const state = advanceTo(battle(), "rowen");
    expect(useOn(state, "rowen", "coagulant-vial", "mark").error?.code).toBe("invalid-target");
    expect(useOn(state, "rowen", "caustic-flask", "rowen").error?.code).toBe("invalid-target");
  });

  it("rejects a throw past the item's reach", () => {
    const state = advanceTo(battle(), "rowen");
    expect(useOn(state, "rowen", "caustic-flask", "far").error?.code).toBe("out-of-range");
  });

  it("rejects a hand-applied item poured on bare ground", () => {
    const state = advanceTo(battle(), "rowen");
    const ground = applyCommand(state, {
      kind: "useItem",
      unitId: "rowen",
      itemId: "coagulant-vial",
      target: { kind: "tile", tile: { x: 0, y: 3 } },
    });
    expect(ground.error?.code).toBe("invalid-target");
  });

  it("spends the action, once", () => {
    const opened = advanceTo(wound(battle(), "perr", 10), "rowen");
    const used = useOn(opened, "rowen", "coagulant-vial", "perr");
    expect(used.error).toBeNull();
    expect(used.state.activeTurn?.acted).toBe(true);
    expect(used.state.activeTurn?.moved).toBe(false);
    expect(useOn(used.state, "rowen", "coagulant-vial", "perr").error?.code).toBe("already-acted");
  });

  it("refuses a unit that is not taking its turn", () => {
    const state = advanceTo(battle(), "rowen");
    expect(useOn(state, "perr", "coagulant-vial", "perr").error?.code).toBe("not-active-unit");
    expect(teamSatchel(state, "player")).toContainEqual({ itemId: "coagulant-vial", count: 2 });
  });
});

describe("turn economy", () => {
  it("costs no flux and banks Standing like any other action", () => {
    const opened = advanceTo(wound(battle(), "perr", 10), "rowen");
    const before = getUnit(opened, "rowen");
    const used = useOn(opened, "rowen", "coagulant-vial", "perr");
    const after = getUnit(used.state, "rowen");
    expect(after?.charge).toBe(before?.charge);
    expect(after?.standingEarned).toBe((before?.standingEarned ?? 0) + 10);
  });

  it("leaves the unit free to move afterwards", () => {
    const opened = advanceTo(wound(battle(), "perr", 10), "rowen");
    const used = useOn(opened, "rowen", "coagulant-vial", "perr");
    const moved = applyCommand(used.state, { kind: "move", unitId: "rowen", to: { x: 0, y: 3 } });
    expect(moved.error).toBeNull();
  });
});

describe("item mastery", () => {
  it("scales a heal by the carrier's potency bonus", () => {
    const plain = advanceTo(wound(battle(), "rowen", 10), "perr");
    const bench = advanceTo(wound(battle({ bench: true }), "rowen", 10), "perr");
    const plainHp = getUnit(useOn(plain, "perr", "coagulant-vial", "rowen").state, "rowen")?.hp;
    const benchHp = getUnit(useOn(bench, "perr", "coagulant-vial", "rowen").state, "rowen")?.hp;
    expect(plainHp).toBe(40);
    expect(benchHp).toBe(55);
  });

  it("scales thrown damage the same way", () => {
    const plain = advanceTo(battle(), "perr");
    const bench = advanceTo(battle({ bench: true }), "perr");
    const before = getUnit(plain, "mark")?.hp ?? 0;
    const plainAfter = getUnit(useOn(plain, "perr", "caustic-flask", "mark").state, "mark")?.hp ?? 0;
    const benchAfter = getUnit(useOn(bench, "perr", "caustic-flask", "mark").state, "mark")?.hp ?? 0;
    expect(before - plainAfter).toBe(20);
    expect(before - benchAfter).toBe(30);
  });

  it("does not touch a status chance or a charge top-up", () => {
    const bench = advanceTo(
      battle({ bench: true, carried: [{ itemId: "cell-tab", count: 1 }] }),
      "perr",
    );
    const drained = structuredClone(bench);
    const perr = drained.units.find((u) => u.id === "perr");
    if (perr !== undefined) perr.charge = 0;
    const used = useOn(drained, "perr", "cell-tab", "perr");
    expect(getUnit(used.state, "perr")?.charge).toBe(12);
  });

  it("extends the throw, and only for the carrier", () => {
    const bench = advanceTo(battle({ bench: true }), "perr");
    const plain = advanceTo(battle(), "perr");
    const abilityId = itemAbilityId("coagulant-vial");
    const benchReach = targetableTiles(bench, "perr", abilityId).length;
    const plainReach = targetableTiles(plain, "perr", abilityId).length;
    expect(benchReach).toBeGreaterThan(plainReach);
    expect(targetableTiles(plain, "rowen", abilityId).length).toBe(
      targetableTiles(bench, "rowen", abilityId).length,
    );
  });
});

describe("forecast and menu", () => {
  it("forecasts an item exactly as it will resolve", () => {
    const state = advanceTo(wound(battle({ bench: true }), "perr", 10), "perr");
    const rows = forecast(state, "perr", itemAbilityId("coagulant-vial"), {
      kind: "unit",
      unitId: "perr",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.heal).toBe(45);
    expect(rows[0]?.damage).toBe(0);
  });

  it("forecasts a thrown flask with its status chance", () => {
    const state = advanceTo(battle(), "perr");
    const rows = forecast(state, "perr", itemAbilityId("caustic-flask"), {
      kind: "unit",
      unitId: "mark",
    });
    expect(rows[0]?.damage).toBe(20);
    expect(rows[0]?.statusChances[0]?.statusId).toBe("fouled");
  });

  it("lists the satchel with counts and greys what the turn cannot afford", () => {
    const opened = advanceTo(wound(battle(), "perr", 10), "rowen");
    expect(usableItems(opened, "rowen")).toEqual([
      {
        itemId: "caustic-flask",
        name: "Caustic Flask",
        description: expect.any(String),
        count: 1,
        abilityId: "item:caustic-flask",
      },
      {
        itemId: "coagulant-vial",
        name: "Coagulant Vial",
        description: expect.any(String),
        count: 2,
        abilityId: "item:coagulant-vial",
      },
    ]);
    const used = useOn(opened, "rowen", "coagulant-vial", "perr");
    expect(usableItems(used.state, "rowen").map((entry) => entry.unavailableReason)).toEqual([
      "Action already spent",
      "Action already spent",
    ]);
  });

  it("shows nothing to a unit whose team carries nothing", () => {
    const state = advanceTo(battle({ carried: [] }), "rowen");
    expect(usableItems(state, "rowen")).toEqual([]);
  });
});

describe("determinism", () => {
  /** A turn that hands out a coagulant, throws a flask, and closes. */
  function log(): { state: GameState; commands: Command[] } {
    const opened = advanceTo(wound(battle({ bench: true }), "rowen", 12), "perr");
    const commands: Command[] = [
      { kind: "useItem", unitId: "perr", itemId: "coagulant-vial", target: { kind: "unit", unitId: "rowen" } },
      { kind: "wait", unitId: "perr", facing: "north" },
    ];
    let state = opened;
    for (const command of commands) {
      const result = applyCommand(state, command);
      expect(result.error).toBeNull();
      state = result.state;
    }
    return { state, commands };
  }

  it("replays a log with item use to an identical state", () => {
    const first = log();
    const second = log();
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
  });

  it("round-trips a satchel through JSON unchanged", () => {
    const { state } = log();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("consumes no randomness on a self-applied compound", () => {
    const opened = advanceTo(wound(battle(), "rowen", 12), "perr");
    const used = useOn(opened, "perr", "coagulant-vial", "rowen");
    expect(used.state.rng).toEqual(opened.rng);
  });
});
