/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import {
  ActionMenu,
  FACING_NOTE,
  OPERATE_NOTE,
  rowMechanics,
} from "../../src/ui/battle/actionMenu.js";
import { recordingIntents } from "../../src/ui/intents.js";
import { mockActionMenuView, mockUnitView } from "../../src/ui/mock.js";
import type { AbilityView, MechanicsView } from "../../src/ui/state.js";

function mechanics(overrides: Partial<MechanicsView> = {}): MechanicsView {
  return {
    range: { min: 1, max: 3, vertical: 2 },
    area: { shape: "line", length: 3 },
    targets: ["enemy"],
    targetsLabel: "Enemy",
    requiresLos: true,
    amounts: [
      { kind: "damage", against: "unit", scale: "mag", power: 8, damageType: "arc", label: "Mag ×8 arc" },
    ],
    statuses: [],
    chargeCost: 4,
    castSpeed: 6,
    summary: "Range 1–3 (±2h) · Line 3 · Enemy · Damage Mag ×8 arc · Charge 4 · Cast 6",
    ...overrides,
  };
}

function ability(overrides: Partial<AbilityView> = {}): AbilityView {
  return {
    id: "arc-lash",
    name: "Arc Lash",
    description: "A whip of live current down a corridor.",
    slot: "action",
    chargeCost: 4,
    castSpeed: 6,
    standingCost: 200,
    mechanics: mechanics(),
    ...overrides,
  };
}

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

  // COMBAT_RULES §10b: offered only while the walk is open, a normal row while it
  // is, and both hands reach it (UI_DESIGN §8).
  it("keeps the undo out of the orders until a walk is open to be taken back", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    expect(entry(menu, "undo-move")).toBeNull();
  });

  it("offers the undo under Move as a normal row, and says what it does", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView({ canMove: false, canUndoMove: true }));

    const undo = entry(menu, "undo-move");
    expect(undo?.classList.contains("is-disabled")).toBe(false);
    expect(undo?.querySelector(".gf-menu-label")?.textContent).toBe("Undo move");
    expect(undo?.querySelector(".gf-menu-note")?.textContent).toBe("Take the step back");
    const ids = [...menu.el.querySelectorAll(".gf-menu-entry")].map((node) =>
      node.getAttribute("data-entry"),
    );
    expect(ids.indexOf("undo-move")).toBe(ids.indexOf("move") + 1);
  });

  it("sends the undo from the keyboard", () => {
    const { intents, calls } = recordingIntents();
    const menu = new ActionMenu({ intents });
    menu.update(mockActionMenuView({ canMove: false, canUndoMove: true }));

    // Move is spent, so the cursor rests on the row under it.
    menu.menus.handleKey(key("Enter"));
    expect(calls).toEqual([{ name: "undoMove", args: ["rowen"] }]);
  });

  it("sends the undo from the mouse", () => {
    const { intents, calls } = recordingIntents();
    const menu = new ActionMenu({ intents });
    menu.update(mockActionMenuView({ canUndoMove: true }));

    const undo = entry(menu, "undo-move")!;
    undo.dispatchEvent(new MouseEvent("mouseenter"));
    undo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual([{ name: "undoMove", args: ["rowen"] }]);
  });

  it("takes the row away again the moment the undo is illegal", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView({ canMove: false, canUndoMove: true }));
    expect(entry(menu, "undo-move")).not.toBeNull();

    menu.update(mockActionMenuView({ canMove: false }));
    expect(entry(menu, "undo-move")).toBeNull();
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

/**
 * The mechanics used to live only in the forecast, which the player reached by
 * spending the action. §14.1's summary is what a row prints instead.
 */
describe("ActionMenu prints the mechanics on the row", () => {
  const view = (): ReturnType<typeof mockActionMenuView> =>
    mockActionMenuView({
      skillsets: [{ jobId: "conduit", name: "Live Work", abilities: [ability()] }],
      items: [
        {
          itemId: "coagulant-vial",
          name: "Coagulant Vial",
          description: "Thickens a bleed long enough to walk.",
          count: 3,
          mechanics: mechanics({
            area: { shape: "single" },
            targetsLabel: "Ally or self",
            chargeCost: 0,
            castSpeed: null,
            usesRemaining: 3,
            summary: "Range 1 (±1h) · Single target · Ally or self · Recovery 30 · 3 in stock",
          }),
        },
      ],
    });

  it("drops only the clauses the row's own columns already state", () => {
    expect(rowMechanics(mechanics())).toBe(
      "Range 1–3 (±2h) · Line 3 · Enemy · Damage Mag ×8 arc · Cast 6",
    );
    // The cast is the telegraph and has no column of its own, so it stays.
    expect(rowMechanics(mechanics())).toContain("Cast 6");
    expect(rowMechanics(mechanics())).not.toContain("Charge 4");
  });

  it("puts reach, area, allegiance and the figure on the ability row", () => {
    const menu = new ActionMenu();
    menu.update(view());
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    const note = entry(menu, "arc-lash")?.querySelector(".gf-menu-note")?.textContent ?? "";
    expect(note).toContain("Range 1–3 (±2h)");
    expect(note).toContain("Line 3");
    expect(note).toContain("Enemy");
    expect(note).toContain("Mag ×8 arc");
    // The cost column keeps the charge; the row does not say it twice.
    expect(entry(menu, "arc-lash")?.querySelector(".gf-menu-detail")?.textContent).toBe("Charge 4");
    expect(note).not.toContain("Charge 4");
  });

  it("reads the focused row out in full underneath, prose included", () => {
    const menu = new ActionMenu();
    menu.update(view());
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    const detail = menu.el.querySelector<HTMLElement>(".gf-action-detail");
    expect(detail?.classList.contains("is-empty")).toBe(false);
    expect(detail?.querySelector(".gf-action-detail-note")?.textContent).toContain("live current");
    expect(detail?.querySelector(".gf-action-detail-line")?.textContent).toBe(mechanics().summary);
  });

  it("prints the item's mechanics and moves its prose to the detail line", () => {
    const menu = new ActionMenu();
    menu.update(view());
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    const row = entry(menu, "coagulant-vial");
    expect(row?.querySelector(".gf-menu-note")?.textContent).toContain("Recovery 30");
    // The stock is in the row's own column; the line does not repeat it.
    expect(row?.querySelector(".gf-menu-note")?.textContent).not.toContain("in stock");
    expect(row?.querySelector(".gf-menu-detail")?.textContent).toBe("x3");
    expect(menu.el.querySelector(".gf-action-detail-note")?.textContent).toContain("Thickens a bleed");
  });

  it("keeps the cast note for an ability the seam has no mechanics for", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView({ unit: mockUnitView({ charge: 12 }) }));
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    expect(entry(menu, "overload-cell")?.textContent).toContain("Charge");
  });

  it("empties the detail line on the way back to the orders", () => {
    const menu = new ActionMenu();
    menu.update(view());
    menu.menus.handleKey(key("ArrowDown"));
    menu.menus.handleKey(key("Enter"));
    menu.menus.handleKey(key("Escape"));
    menu.update(view());
    expect(menu.el.querySelector(".gf-action-detail")?.classList.contains("is-empty")).toBe(true);
  });

  it("says what an Operate row would do, which is stage and not send", () => {
    const menu = new ActionMenu();
    menu.update(
      mockActionMenuView({ operables: [{ objectId: "north-breaker", name: "North Breaker" }] }),
    );
    entry(menu, "operate")?.click();
    expect(menu.el.querySelector(".gf-action-detail-note")?.textContent).toBe(OPERATE_NOTE);
  });
});

describe("the facing prompt", () => {
  it("offers the four quarters, marks the current one, and says why it matters", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    menu.promptFacing("east", () => undefined, () => undefined);
    expect(menu.menus.path).toEqual(["action-root", "action-facing"]);
    expect(entry(menu, "east")?.querySelector(".gf-menu-detail")?.textContent).toBe("current");
    expect(menu.el.querySelector(".gf-action-detail-note")?.textContent).toBe(FACING_NOTE);
  });

  it("picks a facing from the row, by hand or by key", () => {
    const picked: string[] = [];
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    menu.promptFacing("north", (facing) => picked.push(facing), () => undefined);
    entry(menu, "south")?.click();
    menu.menus.handleKey(key("Enter"));
    expect(picked).toEqual(["south", "south"]);
  });

  it("turns with the rig, so the arm marked North points at north", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    expect(menu.el.dataset["yaw"]).toBe("0");
    menu.setCameraYaw(3);
    expect(menu.el.dataset["yaw"]).toBe("3");
  });

  it("reports the cancel and takes the note back down", () => {
    const onCancel = vi.fn();
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    menu.promptFacing("north", () => undefined, onCancel);
    menu.menus.handleKey(key("Escape"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(menu.menus.path).toEqual(["action-root"]);
    expect(menu.el.querySelector(".gf-action-detail")?.classList.contains("is-empty")).toBe(true);
  });

  it("closes the prompt when the turn was closed some other way", () => {
    const menu = new ActionMenu();
    menu.update(mockActionMenuView());
    menu.promptFacing("north", () => undefined, () => undefined);
    menu.closePrompt();
    expect(menu.menus.path).toEqual(["action-root"]);
    menu.closePrompt();
    expect(menu.menus.path).toEqual(["action-root"]);
  });
});

