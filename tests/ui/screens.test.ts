/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { TurnOrderStrip } from "../../src/ui/battle/turnOrder.js";
import { UnitStatusPanel } from "../../src/ui/battle/unitStatus.js";
import { recordingIntents } from "../../src/ui/intents.js";
import {
  mockDeploymentView,
  mockEnemyView,
  mockEquipmentView,
  mockPartyView,
  mockTurnOrderView,
  mockUnitSheetView,
  mockUnitView,
} from "../../src/ui/mock.js";
import { DeploymentScreen } from "../../src/ui/screens/deployment.js";
import { EquipmentScreen } from "../../src/ui/screens/equipment.js";
import { RosterScreen } from "../../src/ui/screens/roster.js";
import { UnitSheetScreen } from "../../src/ui/screens/unitSheet.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

describe("UnitStatusPanel", () => {
  it("shows condition, charge, CT, and the hidden pair", () => {
    const panel = new UnitStatusPanel();
    panel.update(mockUnitView());
    const text = panel.el.textContent ?? "";
    expect(text).toContain("Rowen Corvane");
    expect(text).toContain("41 / 58");
    expect(text).toContain("6 / 14");
    expect(text).toContain("Resolve");
    expect(text).toContain("72");
    expect(text).toContain("Attunement");
    expect(panel.el.querySelectorAll(".gf-meter").length).toBe(3);
  });

  it("lists statuses with their remaining turns", () => {
    const panel = new UnitStatusPanel();
    panel.update(mockEnemyView());
    expect(panel.el.querySelector(".gf-unit-status.is-debuff")?.textContent).toBe("Stunned (1)");
  });

  it("falls back to an empty state", () => {
    const panel = new UnitStatusPanel();
    panel.update(null);
    expect(panel.el.classList.contains("is-empty")).toBe(true);
  });
});

describe("TurnOrderStrip", () => {
  it("lists upcoming turns and charging casts", () => {
    const strip = new TurnOrderStrip();
    strip.update(mockTurnOrderView());
    const entries = [...strip.el.querySelectorAll<HTMLElement>(".gf-turn-entry")];
    expect(entries).toHaveLength(6);
    expect(entries[0]?.classList.contains("is-now")).toBe(true);
    expect(entries[0]?.textContent).toContain("Now");
    expect(entries[1]?.textContent).toContain("+12");
    const cast = strip.el.querySelector<HTMLElement>('.gf-turn-entry[data-kind="cast"]');
    expect(cast?.textContent).toContain("Charging · Overload Cell");
  });
});

describe("RosterScreen", () => {
  it("lists the party and greys downed members", () => {
    const screen = new RosterScreen();
    screen.update(mockPartyView());
    expect(screen.el.querySelectorAll(".gf-menu-entry")).toHaveLength(4);
    const downed = screen.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="mott-tarr"]');
    expect(downed?.classList.contains("is-disabled")).toBe(true);
    expect(screen.el.querySelector(".gf-roster-detail")?.textContent).toContain("Standing: 320");
  });

  it("opens the per-unit actions and emits the screen intent", () => {
    const { intents, calls } = recordingIntents();
    const screen = new RosterScreen({ intents });
    screen.update(mockPartyView());

    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path).toEqual(["roster", "roster-actions-rowen"]);
    screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(calls.at(-1)).toEqual({ name: "openLearning", args: ["rowen"] });
  });
});

describe("UnitSheetScreen", () => {
  it("renders stats, equipment, and learned abilities", () => {
    const screen = new UnitSheetScreen();
    screen.update(mockUnitSheetView());
    const text = screen.el.textContent ?? "";
    expect(text).toContain("Standing: 320");
    expect(text).toContain("Shock Maul");
    expect(text).toContain("Watch Cuirass");
    expect(text).toContain("Pin");
    expect(text).toContain("Unassigned");
  });
});

describe("EquipmentScreen", () => {
  it("reports the shared field kit without offering to equip it", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());
    expect(screen.el.querySelector(".gf-satchel")?.textContent).toBe(
      "Field kit: Coagulant Vial x3 · Cinder Flask x1",
    );
    const slots = [...screen.el.querySelectorAll<HTMLElement>('[data-menu="equipment-slots"] .gf-menu-entry')];
    expect(slots.map((node) => node.dataset["entry"])).not.toContain("consumable");
  });

  it("says so when the satchel is empty", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView({ satchel: [] }));
    expect(screen.el.querySelector(".gf-satchel")?.textContent).toBe("Field kit: empty");
  });

  it("filters candidates by slot and flags kit the job cannot bear", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());

    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path).toEqual(["equipment-slots", "equipment-options-weapon"]);
    const options = [...screen.el.querySelectorAll<HTMLElement>('[data-menu="equipment-options-weapon"] .gf-menu-entry')];
    expect(options.map((node) => node.dataset["entry"])).toEqual(["__unequip", "shock-maul", "tap-rod"]);
    const tapRod = options.find((node) => node.dataset["entry"] === "tap-rod");
    expect(tapRod?.classList.contains("is-disabled")).toBe(true);
    expect(tapRod?.title).toBe("Enforcer cannot bear conduit-gear");
  });

  it("previews stat deltas for the highlighted item", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());

    for (let i = 0; i < 3; i++) screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path.at(-1)).toBe("equipment-options-body");
    screen.menus.handleKey(key("ArrowDown"));
    const detail = screen.el.querySelector(".gf-equip-detail")?.textContent ?? "";
    expect(detail).toContain("Watch Cuirass");
    expect(detail).toContain("HP +24");
    expect(detail).toContain("Speed -1");
  });

  it("emits equipItem and unequips through Remove", () => {
    const { intents, calls } = recordingIntents();
    const screen = new EquipmentScreen({ intents });
    screen.update(mockEquipmentView());

    screen.menus.handleKey(key("Enter"));
    screen.menus.handleKey(key("Enter"));
    expect(calls.at(-1)).toEqual({ name: "equipItem", args: ["rowen", "weapon", null] });
    expect(screen.menus.path).toEqual(["equipment-slots"]);

    screen.menus.handleKey(key("Enter"));
    screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(calls.at(-1)).toEqual({ name: "equipItem", args: ["rowen", "weapon", "shock-maul"] });
  });
});

describe("DeploymentScreen", () => {
  it("shows the field kit that goes out with the formation", () => {
    const screen = new DeploymentScreen();
    screen.update(mockDeploymentView());
    expect(screen.el.querySelector(".gf-satchel")?.textContent).toBe(
      "Field kit: Coagulant Vial x3 · Cinder Flask x1",
    );
  });
});
