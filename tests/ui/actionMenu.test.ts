/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { ActionMenu } from "../../src/ui/battle/actionMenu.js";
import { recordingIntents } from "../../src/ui/intents.js";
import { mockActionMenuView, mockUnitView } from "../../src/ui/mock.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

function entry(menu: ActionMenu, id: string): HTMLElement | null {
  return menu.el.querySelector<HTMLElement>(`.gf-menu-entry[data-entry="${id}"]`);
}

describe("ActionMenu", () => {
  it("offers Move, Act, and Wait for the acting unit", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    expect([...menu.el.querySelectorAll(".gf-menu-entry")].map((node) => node.textContent)).toHaveLength(3);
    expect(entry(menu, "move")).not.toBeNull();
    expect(entry(menu, "act")).not.toBeNull();
    expect(entry(menu, "wait")).not.toBeNull();
  });

  it("greys Move once it is spent and gives the reason", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView({ canMove: false }));
    const move = entry(menu, "move");
    expect(move?.classList.contains("is-disabled")).toBe(true);
    expect(move?.title).toBe("Move already spent");
  });

  it("emits wait with the unit's facing", () => {
    const { intents, calls } = recordingIntents();
    const menu = new ActionMenu({ intents });
    menu.update(mockActionMenuView());
    menu.menus.handleKey(key("ArrowUp"));
    menu.menus.handleKey(key("Enter"));
    expect(calls).toEqual([{ name: "wait", args: ["rowen", "north"] }]);
  });

  it("opens the skillset list from Act and emits selectAbility", () => {
    const { intents, calls } = recordingIntents();
    const menu = new ActionMenu({ intents });
    const unit = mockUnitView({ charge: 12 });
    menu.update(mockActionMenuView({ unit }));

    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    expect(menu.menus.path).toEqual(["action-root", "action-skillsets"]);

    menu.menus.handleKey(key("Enter"));
    expect(menu.menus.path[2]).toBe("skillset-enforcer");
    expect(entry(menu, "pin")?.textContent).toContain("Charge 0");

    menu.menus.handleKey(key("Enter"));
    expect(calls).toEqual([{ name: "selectAbility", args: ["rowen", "pin"] }]);
  });

  it("greys abilities the unit cannot pay the charge for", () => {
    const menu = new ActionMenu();
    const unit = mockUnitView({ charge: 3 });
    menu.update(mockActionMenuView({ unit }));

    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    expect(menu.menus.path[2]).toBe("skillset-conduit");

    const overload = entry(menu, "overload-cell");
    expect(overload?.classList.contains("is-disabled")).toBe(true);
    expect(overload?.title).toBe("Insufficient charge");
    expect(overload?.textContent).toContain("Cast 25");
  });

  it("Escape backs out of a skillset and reports the cancel", () => {
    const { intents, calls } = recordingIntents();
    const menu = new ActionMenu({ intents });
    menu.update(mockActionMenuView());

    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    menu.menus.handleKey(key("Escape"));
    expect(menu.menus.path).toEqual(["action-root"]);
    expect(calls).toEqual([{ name: "cancelSelection", args: ["rowen"] }]);
  });
});
