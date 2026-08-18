import { describe, expect, it } from "vitest";
import {
  activeUnit,
  applyCommand,
  availableAbilities,
  battleClock,
  forecast,
  turnOrderPreview,
  unitMaxCharge,
  unitMaxHp,
  unitStats,
  type GameState,
} from "../../src/core/index.js";
import {
  actionMenuView,
  battleHudView,
  forecastView,
  partyView,
  skillsetViews,
  turnOrderView,
  unitSheetView,
  unitView,
} from "../../src/app/viewmodels.js";
import type { Unit } from "../../src/data/index.js";
import { advanceTo, rowen } from "../core/fixtures.js";
import { openBattle, VALE } from "./fixtures.js";

const battle = (): GameState => openBattle([rowen(), VALE]).state;

describe("unitView", () => {
  it("reads hp, charge, and stats straight off the selectors", () => {
    const state = battle();
    const view = unitView(state, "rowen");
    expect(view).not.toBeNull();
    expect(view?.maxHp).toBe(unitMaxHp(state, "rowen"));
    expect(view?.maxCharge).toBe(unitMaxCharge(state, "rowen"));
    expect(view?.jobName).toBe("Enforcer");
    expect(view?.portraitId).toBe("rowen");
    expect(view?.statuses).toEqual([]);
  });

  it("returns null for a unit that is not in the battle", () => {
    expect(unitView(battle(), "nobody")).toBeNull();
  });
});

describe("skillsetViews", () => {
  it("lists exactly the abilities the selector offers, grouped by job", () => {
    const state = battle();
    const listed = skillsetViews(state, "rowen")
      .flatMap((set) => set.abilities.map((ability) => ability.id))
      .sort();
    expect(listed).toEqual([...availableAbilities(state, "rowen")].sort());
    expect(skillsetViews(state, "rowen")[0]?.name).toBe("Enforcer");
  });

  it("greys an ability the unit cannot pay for", () => {
    const state = battle();
    const overload = skillsetViews(state, "rowen")
      .flatMap((set) => set.abilities)
      .find((ability) => ability.id === "overload-cell");
    // Rowen is an Enforcer and never sees Overload Cell at all.
    expect(overload).toBeUndefined();

    const valeOverload = skillsetViews(state, "vale")
      .flatMap((set) => set.abilities)
      .find((ability) => ability.id === "overload-cell");
    expect(valeOverload?.chargeCost).toBe(5);
    expect(valeOverload?.castSpeed).toBeNull();
    expect(valeOverload?.unavailableReason).toBeUndefined();
  });
});

describe("actionMenuView", () => {
  it("offers move and act only to the unit whose turn it is", () => {
    const state = advanceTo(battle(), "rowen");
    const mine = actionMenuView(state, "rowen");
    const theirs = actionMenuView(state, "vale");
    expect(mine?.canMove).toBe(true);
    expect(mine?.canAct).toBe(true);
    expect(theirs?.canMove).toBe(false);
    expect(theirs?.canAct).toBe(false);
  });

  it("spends the move flag once the unit has moved", () => {
    const state = advanceTo(battle(), "rowen");
    const moved = applyCommand(state, { kind: "move", unitId: "rowen", to: { x: 0, y: 3 } });
    expect(moved.error).toBeNull();
    const view = actionMenuView(moved.state, "rowen");
    expect(view?.canMove).toBe(false);
    expect(view?.moveBlockedReason).toBe("Move already spent");
    expect(view?.canAct).toBe(true);
  });

  it("lists adjacent operable machinery", () => {
    const state = advanceTo(battle(), "rowen");
    expect(actionMenuView(state, "rowen")?.operables).toEqual([]);

    const moved = applyCommand(state, { kind: "move", unitId: "rowen", to: { x: 2, y: 4 } });
    expect(moved.error).toBeNull();
    expect(actionMenuView(moved.state, "rowen")?.operables).toEqual([
      { objectId: "yard-switch", name: "Signal Switch" },
    ]);
  });
});

describe("forecastView", () => {
  it("matches the core forecast row for row", () => {
    const state = advanceTo(battle(), "rowen");
    const moved = applyCommand(state, { kind: "move", unitId: "rowen", to: { x: 1, y: 1 } });
    // The cell blocks (1,1); aim at whatever tile Rowen can actually reach.
    const ready = moved.error === null ? moved.state : state;

    const target = { kind: "unit" as const, unitId: "provocateur-a" };
    const entries = forecast(ready, "rowen", "pin", target);
    const view = forecastView(ready, "rowen", "pin", target);

    expect(view?.abilityName).toBe("Pin");
    expect(view?.chargeCost).toBe(0);
    expect(view?.castSpeed).toBeNull();
    expect(view?.targets).toHaveLength(entries.length);
    if (entries.length > 0) {
      const first = entries[0];
      expect(view?.targets[0]?.hitChancePercent).toBe(first?.hitChance);
      expect(view?.targets[0]?.damage?.max).toBe(first?.damage);
      expect(view?.targets[0]?.statuses[0]?.name).toBe("Stunned");
    }
  });

  it("lists a machinery target with the object's own name", () => {
    const state = advanceTo(battle(), "vale");
    const view = forecastView(state, "vale", "overload-cell", {
      kind: "object",
      objectId: "yard-cell",
    });
    expect(view?.targets).toHaveLength(1);
    expect(view?.targets[0]?.name).toBe("Flux Cell");
    expect(view?.targets[0]?.unitId).toBe("yard-cell");
    expect(view?.targets[0]?.hitChancePercent).toBe(100);
    expect(view?.targets[0]?.damage?.max).toBeGreaterThan(0);
    expect(view?.targets[0]?.attackAngle).toBeNull();
  });

  it("says what a buff grants and for how long instead of reporting no damage", () => {
    const chemist: Unit = {
      schemaVersion: 1,
      id: "perr",
      name: "Perr Sallow",
      level: 1,
      jobId: "chemist",
      disposition: { resolve: 45, attunement: 55 },
      learnedAbilityIds: ["bracer-shot"],
      equipment: {},
    };
    const state = advanceTo(openBattle([rowen(), chemist]).state, "perr");
    const view = forecastView(state, "perr", "bracer-shot", { kind: "unit", unitId: "perr" });

    expect(view?.targets[0]?.damage).toBeNull();
    expect(view?.targets[0]?.statuses).toEqual([]);
    expect(view?.targets[0]?.effects).toEqual(["Phys +5 · Mag +5 · Evade +5 for 3 turns"]);
    expect(view?.aimedAt).toEqual({ kind: "unit", unitId: "perr" });
  });

  it("reports a machine laid on an empty tile, which has no target row at all", () => {
    const machinist: Unit = {
      schemaVersion: 1,
      id: "ivo",
      name: "Ivo Brace",
      level: 1,
      jobId: "machinist",
      disposition: { resolve: 48, attunement: 50 },
      learnedAbilityIds: ["sentry-frame"],
      equipment: {},
    };
    const state = advanceTo(openBattle([rowen(), machinist]).state, "ivo");
    const view = forecastView(state, "ivo", "sentry-frame", { kind: "tile", tile: { x: 1, y: 3 } });

    expect(view?.targets).toEqual([]);
    expect(view?.effects[0]).toContain("Sentry frame placed");
    expect(view?.aimedAt).toEqual({ kind: "tile", tile: { x: 1, y: 3 } });
  });
});

describe("turnOrderView", () => {
  it("follows turnOrderPreview, converting clocks into ticks-until", () => {
    const state = battle();
    const preview = turnOrderPreview(state, 4);
    const view = turnOrderView(state, 4);
    expect(view.entries).toHaveLength(preview.length);
    expect(view.entries.map((entry) => entry.unitId)).toEqual(preview.map((entry) => entry.id));
    expect(view.entries[0]?.ticksUntil).toBe(
      Math.max(0, (preview[0]?.clock ?? 0) - battleClock(state)),
    );
    expect(view.entries[0]?.kind).toBe("turn");
  });

  it("names every entry with its unit and job", () => {
    const view = turnOrderView(battle(), 3);
    expect(view.entries.map((entry) => entry.name)).toContain("Rowen Corvane");
    expect(view.entries.every((entry) => entry.jobName.length > 0)).toBe(true);
    expect(view.entries.every((entry) => entry.kind === "turn")).toBe(true);
  });
});

describe("battleHudView", () => {
  it("assembles the acting unit's menu, inspection, and turn order", () => {
    const state = advanceTo(battle(), "rowen");
    const view = battleHudView(state, { turnOrderCount: 3 });
    expect(view?.action.unit.id).toBe("rowen");
    expect(view?.inspected?.id).toBe("rowen");
    expect(view?.turnOrder.entries.length).toBeLessThanOrEqual(3);
    expect(view?.forecast).toBeNull();
    expect(view?.dialogue).toEqual([]);
  });

  it("inspects whoever the cursor names instead of the actor", () => {
    const state = advanceTo(battle(), "rowen");
    expect(battleHudView(state, { inspectedUnitId: "provocateur-a" })?.inspected?.name).toBe(
      "Provocateur",
    );
  });
});

describe("sheet and party views", () => {
  it("reports stats that match unitStats", () => {
    const state = battle();
    const stats = unitStats(state, "rowen");
    const sheet = unitSheetView(state, "rowen");
    expect(sheet?.move).toBe(stats?.move);
    expect(sheet?.jump).toBe(stats?.jump);
    expect(sheet?.stats.find((line) => line.key === "phys")?.value).toBe(stats?.phys);
    expect(sheet?.equipment.find((slot) => slot.slot === "weapon")?.itemName).toBe("Shock Maul");
    expect(sheet?.learnedAbilities.map((ability) => ability.id)).toEqual(["pin"]);
  });

  it("lists the deployed party with the encounter's limit", () => {
    const view = partyView(battle());
    expect(view.members.map((member) => member.unitId)).toEqual(["rowen", "vale"]);
    expect(view.members[0]?.note).toBe("Deployed");
    expect(view.deployedLimit).toBe(4);
  });
});

describe("the acting unit is always the hud's subject", () => {
  it("tracks whoever core says is active", () => {
    const state = advanceTo(battle(), "vale");
    expect(battleHudView(state)?.action.unit.id).toBe(activeUnit(state)?.id);
  });
});
