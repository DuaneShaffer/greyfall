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
  it("offers Move, Act, Item, and Wait for the acting unit", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    expect([...menu.el.querySelectorAll(".gf-menu-entry")].map((node) => node.textContent)).toHaveLength(4);
    expect(entry(menu, "move")).not.toBeNull();
    expect(entry(menu, "act")).not.toBeNull();
    expect(entry(menu, "item")).not.toBeNull();
    expect(entry(menu, "wait")).not.toBeNull();
  });

  it("hides Item when the force carries nothing", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView({ items: [] }));
    expect(entry(menu, "item")).toBeNull();
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
    expect(overload?.textContent).not.toContain("Cast");
  });

  it("opens the satchel from Item and emits selectItem", () => {
    const { intents, calls } = recordingIntents();
    const menu = new ActionMenu({ intents });
    menu.update(mockActionMenuView());

    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    expect(menu.menus.path).toEqual(["action-root", "action-items"]);
    expect(entry(menu, "coagulant-vial")?.textContent).toContain("x3");
    expect(entry(menu, "cinder-flask")?.textContent).toContain("x1");

    menu.menus.handleKey(key("Enter"));
    expect(calls).toEqual([{ name: "selectItem", args: ["rowen", "coagulant-vial"] }]);
  });

  it("greys an item this unit cannot reach for, with the reason", () => {
    const menu = new ActionMenu();
    menu.update(
      mockActionMenuView({
        items: [
          {
            itemId: "cinder-flask",
            name: "Cinder Flask",
            description: "Accelerant in thin glass.",
            count: 1,
            unavailableReason: "Not issued to this job",
          },
        ],
      }),
    );
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    const flask = entry(menu, "cinder-flask");
    expect(flask?.classList.contains("is-disabled")).toBe(true);
    expect(flask?.title).toBe("Not issued to this job");
  });

  it("greys Item itself once the action is spent", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView({ canAct: false, actBlockedReason: "Action already spent" }));
    const item = entry(menu, "item");
    expect(item?.classList.contains("is-disabled")).toBe(true);
    expect(item?.title).toBe("Action already spent");
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
