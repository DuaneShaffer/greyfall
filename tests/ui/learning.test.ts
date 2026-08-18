/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { recordingIntents } from "../../src/ui/intents.js";
import { mockLearningView } from "../../src/ui/mock.js";
import { LearningScreen } from "../../src/ui/screens/learning.js";
import type { LearningView } from "../../src/ui/state.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

function view(overrides: Partial<LearningView> = {}): LearningView {
  const base = mockLearningView({ standing: 120 });
  return {
    ...base,
    entries: base.entries.map((entry) => ({ ...entry, learned: false })),
    ...overrides,
  };
}

function entryNode(screen: LearningScreen, abilityId: string): HTMLElement | null {
  return screen.el.querySelector<HTMLElement>(`.gf-menu-entry[data-entry="${abilityId}"]`);
}

describe("LearningScreen", () => {
  it("greys abilities the unit cannot pay for", () => {
    const screen = new LearningScreen();
    screen.update(view());

    const pin = entryNode(screen, "pin");
    const overload = entryNode(screen, "overload-cell");
    expect(pin?.classList.contains("is-disabled")).toBe(false);
    expect(pin?.textContent).toContain("Standing: 100");
    expect(overload?.classList.contains("is-disabled")).toBe(true);
    expect(overload?.title).toBe("Insufficient Standing");
    expect(screen.el.querySelector(".gf-learn-detail")?.textContent).toContain("Standing after: 20");
  });

  it("greys abilities that are already learned", () => {
    const screen = new LearningScreen();
    const learned = view({ standing: 500 });
    screen.update({ ...learned, entries: learned.entries.map((e) => ({ ...e, learned: true })) });
    expect(entryNode(screen, "pin")?.title).toBe("Already learned");
  });

  it("skips the unaffordable entry when the cursor wraps", () => {
    const screen = new LearningScreen();
    screen.update(view());
    screen.menus.handleKey(key("ArrowDown"));
    expect(screen.menus.cursorEntry?.id).toBe("pin");
  });

  it("emits learnAbility once the spend is confirmed", () => {
    const { intents, calls } = recordingIntents();
    const screen = new LearningScreen({ intents });
    screen.update(view());

    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path).toEqual(["learning-list", "learning-confirm-pin"]);
    expect(calls).toHaveLength(0);

    screen.menus.handleKey(key("Enter"));
    expect(calls).toEqual([{ name: "learnAbility", args: ["rowen", "pin"] }]);
    expect(screen.menus.depth).toBe(1);
  });

  it("withdraws from the confirmation without spending", () => {
    const { intents, calls } = recordingIntents();
    const screen = new LearningScreen({ intents });
    screen.update(view());

    screen.menus.handleKey(key("Enter"));
    screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(calls).toHaveLength(0);
    expect(screen.menus.depth).toBe(1);
  });

  // "Buying an ability is a blind gamble": the row said a name and a price, the
  // panel said prose, and nothing on the page said what the order did.
  describe("what the Standing is buying", () => {
    it("prints the mechanics on the row, not only in the record", () => {
      const screen = new LearningScreen();
      screen.update(view());
      const pin = entryNode(screen, "pin")?.textContent ?? "";
      expect(pin).toContain("Range 1 (±1h)");
      expect(pin).toContain("Enemy");
      expect(pin).toContain("Damage Weapon 80% kinetic");
      expect(pin).toContain("Stunned 35%");
      expect(entryNode(screen, "overload-cell")?.textContent).toContain("Charge 5");
    });

    it("lays the figures out in full for the entry under the cursor", () => {
      const screen = new LearningScreen();
      screen.update(view());
      const detail = screen.el.querySelector(".gf-learn-detail")?.textContent ?? "";
      expect(detail).toContain("Range");
      expect(detail).toContain("1 tile, ±1 height");
      expect(detail).toContain("Line of sight");
      expect(detail).toContain("Required");
      expect(detail).toContain("Weapon 80% kinetic");
      expect(detail).toContain("35% chance");
      expect(detail).toContain("Resolves at once");
    });

    it("never prints a total: a scaled figure keeps its scale and says so", () => {
      const screen = new LearningScreen();
      screen.update(view());
      const detail = screen.el.querySelector(".gf-learn-detail")?.textContent ?? "";
      expect(detail).toContain("Weapon 80%");
      expect(screen.el.querySelector(".gf-mechanics-scale-note")?.textContent).toContain(
        "a plain number is fixed",
      );
    });

    it("keeps the prose, and stops it doing the mechanics' job", () => {
      const screen = new LearningScreen();
      screen.update(view());
      const prose = screen.el.querySelector(".gf-learn-detail .gf-detail-text")?.textContent ?? "";
      expect(prose).toContain("Watch doctrine");
    });

    it("states the figures on the confirm itself, before a point is spent", () => {
      const screen = new LearningScreen();
      screen.update(view());
      screen.menus.handleKey(key("Enter"));
      const confirm = screen.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="confirm"]');
      expect(confirm?.textContent).toContain("Spend 100");
      expect(confirm?.textContent).toContain("Remaining 20");
      expect(confirm?.textContent).toContain("Damage Weapon 80% kinetic");
      // Still a confirm, and still withdrawable.
      expect(
        screen.el.querySelector('.gf-menu-entry[data-entry="withdraw"]'),
      ).not.toBeNull();
    });

    it("says where Standing comes from, once, at the top of the page", () => {
      const screen = new LearningScreen();
      screen.update(view());
      const rule = screen.el.querySelector(".gf-standing-rule")?.textContent ?? "";
      expect(rule).toContain("banked per job");
      expect(rule).toContain("10 for every action");
    });
  });

  it("shows the unit's Standing in the official register", () => {
    const screen = new LearningScreen();
    screen.update(view());
    expect(screen.el.querySelector(".gf-standing")?.textContent).toBe(
      "Rowen Corvane · Enforcer · Standing: 120",
    );
  });
});
