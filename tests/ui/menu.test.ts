/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuDef, MenuStack } from "../../src/ui/menu.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

function baseMenu(overrides: Partial<MenuDef> = {}): MenuDef {
  return {
    id: "orders",
    title: "Orders",
    entries: [
      { id: "move", label: "Move" },
      { id: "act", label: "Act" },
      { id: "overload", label: "Overload Cell", disabled: true, disabledReason: "Insufficient charge" },
      { id: "wait", label: "Wait" },
    ],
    ...overrides,
  };
}

describe("MenuStack", () => {
  let stack: MenuStack;

  beforeEach(() => {
    stack = new MenuStack();
  });

  it("starts on the first selectable entry", () => {
    stack.push(baseMenu());
    expect(stack.cursor).toBe(0);
    expect(stack.cursorEntry?.id).toBe("move");
  });

  it("moves down and up with the arrow keys", () => {
    stack.push(baseMenu());
    stack.handleKey(key("ArrowDown"));
    expect(stack.cursorEntry?.id).toBe("act");
    stack.handleKey(key("ArrowUp"));
    expect(stack.cursorEntry?.id).toBe("move");
  });

  it("skips disabled entries in both directions", () => {
    stack.push(baseMenu());
    stack.handleKey(key("ArrowDown"));
    stack.handleKey(key("ArrowDown"));
    expect(stack.cursorEntry?.id).toBe("wait");
    stack.handleKey(key("ArrowUp"));
    expect(stack.cursorEntry?.id).toBe("act");
  });

  it("wraps around the ends", () => {
    stack.push(baseMenu());
    stack.handleKey(key("ArrowUp"));
    expect(stack.cursorEntry?.id).toBe("wait");
    stack.handleKey(key("ArrowDown"));
    expect(stack.cursorEntry?.id).toBe("move");
  });

  it("selects with Enter and reports the entry and index", () => {
    const onSelect = vi.fn();
    stack.push(baseMenu({ onSelect }));
    stack.handleKey(key("ArrowDown"));
    stack.handleKey(key("Enter"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ id: "act" });
    expect(onSelect.mock.calls[0]![1]).toBe(1);
  });

  it("never selects a disabled entry", () => {
    const onSelect = vi.fn();
    stack.push({
      id: "all-disabled",
      entries: [{ id: "arc", label: "Arc", disabled: true, disabledReason: "Insufficient charge" }],
      onSelect,
    });
    stack.handleKey(key("Enter"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("pushes and pops submenus", () => {
    stack.push(baseMenu());
    stack.push({ id: "skillset-enforcer", entries: [{ id: "pin", label: "Pin" }] });
    expect(stack.depth).toBe(2);
    expect(stack.path).toEqual(["orders", "skillset-enforcer"]);
    expect(stack.active?.id).toBe("skillset-enforcer");
    stack.pop();
    expect(stack.depth).toBe(1);
    expect(stack.active?.id).toBe("orders");
  });

  it("Escape pops the submenu and fires its cancel handler", () => {
    const onCancel = vi.fn();
    stack.push(baseMenu());
    stack.push({ id: "skillset-enforcer", entries: [{ id: "pin", label: "Pin" }], onCancel });
    stack.handleKey(key("Escape"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(stack.depth).toBe(1);
  });

  it("Escape on a non-cancellable root keeps the menu open", () => {
    const onCancel = vi.fn();
    stack.push(baseMenu({ cancellable: false, onCancel }));
    stack.handleKey(key("Escape"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(stack.depth).toBe(1);
  });

  it("remembers the cursor position per menu", () => {
    stack.push(baseMenu());
    stack.handleKey(key("ArrowDown"));
    expect(stack.cursorEntry?.id).toBe("act");
    stack.pop();
    stack.push(baseMenu());
    expect(stack.cursorEntry?.id).toBe("act");
  });

  it("reports the cursor entry through onCursor", () => {
    const onCursor = vi.fn();
    stack.push(baseMenu({ onCursor }));
    onCursor.mockClear();
    stack.handleKey(key("ArrowDown"));
    expect(onCursor.mock.calls.at(-1)?.[0]).toMatchObject({ id: "act" });
  });

  it("renders disabled entries greyed with their reason", () => {
    stack.push(baseMenu());
    const disabled = stack.el.querySelector<HTMLElement>(".gf-menu-entry.is-disabled");
    expect(disabled?.dataset["entry"]).toBe("overload");
    expect(disabled?.title).toBe("Insufficient charge");
    expect(disabled?.getAttribute("aria-disabled")).toBe("true");
    expect(disabled?.textContent).toContain("Insufficient charge");
  });

  it("ignores keys when the stack is empty", () => {
    expect(stack.handleKey(key("ArrowDown"))).toBe(false);
  });

  it("routes keys from an attached target", () => {
    const onSelect = vi.fn();
    stack.push(baseMenu({ onSelect }));
    stack.attach(document);
    document.dispatchEvent(key("Enter"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    stack.detach();
    document.dispatchEvent(key("Enter"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("refreshes entries in place without losing the cursor", () => {
    stack.push(baseMenu());
    stack.handleKey(key("ArrowDown"));
    stack.refresh(
      baseMenu({
        entries: [
          { id: "move", label: "Move" },
          { id: "act", label: "Act" },
          { id: "overload", label: "Overload Cell", detail: "Charge 8" },
          { id: "wait", label: "Wait" },
        ],
      }),
    );
    expect(stack.cursorEntry?.id).toBe("act");
    expect(stack.el.querySelectorAll(".gf-menu-entry.is-disabled").length).toBe(0);
  });
});
