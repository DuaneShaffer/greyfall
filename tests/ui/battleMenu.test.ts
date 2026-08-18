/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { BattleHud } from "../../src/ui/battle/hud.js";
import {
  NO_OBJECTIVE,
  OBJECTIVE_FALLBACK,
  SYSTEMS_NOTES,
} from "../../src/ui/battle/battleMenu.js";
import { recordingIntents, type IntentCall } from "../../src/ui/intents.js";
import {
  mockActionMenuView,
  mockDialogue,
  mockTurnOrderView,
  mockUnitView,
} from "../../src/ui/mock.js";
import type { BattleHudView } from "../../src/ui/state.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

function hudView(objective?: string | null): BattleHudView {
  return {
    action: mockActionMenuView(),
    inspected: mockUnitView(),
    turnOrder: mockTurnOrderView(),
    forecast: null,
    dialogue: mockDialogue,
    ...(objective === undefined ? {} : { objective }),
  };
}

function rig(objective?: string | null, onForfeit?: () => void): {
  hud: BattleHud;
  calls: IntentCall[];
} {
  const { intents, calls } = recordingIntents();
  const hud = new BattleHud({ intents, ...(onForfeit ? { onForfeit } : {}) });
  hud.update(hudView(objective));
  hud.setMode("orders", "Rowen Corvane");
  return { hud, calls };
}

function row(hud: BattleHud, id: string): HTMLElement {
  const node = hud.el.querySelector<HTMLElement>(`.gf-menu-entry[data-entry="${id}"]`);
  expect(node, `no row for ${id}`).not.toBeNull();
  return node as HTMLElement;
}

describe("the briefing", () => {
  it("opens on Escape at the root, where nothing used to happen", () => {
    const { hud } = rig();
    hud.actionMenu.attach(document);
    document.dispatchEvent(key("Escape"));
    expect(hud.actionMenu.menus.path).toEqual(["action-root", "battle-briefing"]);
    hud.destroy();
  });

  it("opens from the mode bar, for a player who never presses Escape", () => {
    const { hud } = rig();
    hud.el.querySelector<HTMLElement>(".gf-mode-briefing")?.click();
    expect(hud.actionMenu.menus.path).toEqual(["action-root", "battle-briefing"]);
  });

  it("stands down when the orders are not the player's to give", () => {
    const { hud } = rig();
    hud.setMode("ai");
    expect(hud.el.querySelector<HTMLButtonElement>(".gf-mode-briefing")?.hidden).toBe(true);
  });

  it("opens once, however many times it is asked for", () => {
    const { hud } = rig();
    hud.openBriefing();
    hud.openBriefing();
    expect(hud.actionMenu.menus.path).toEqual(["action-root", "battle-briefing"]);
  });

  it("backs out one level at a time and leaves the orders standing", () => {
    const { hud } = rig();
    hud.openBriefing();
    row(hud, "systems").click();
    expect(hud.actionMenu.menus.path.at(-1)).toBe("briefing-systems");
    expect(hud.withdraw()).toBe("menu");
    expect(hud.actionMenu.menus.path.at(-1)).toBe("battle-briefing");
    expect(hud.withdraw()).toBe("menu");
    expect(hud.actionMenu.menus.path).toEqual(["action-root"]);
  });

  it("reads the encounter's own objective, and says so when there is none", () => {
    const { hud } = rig("Hold the metering floor until the shift bell.");
    hud.openBriefing();
    row(hud, "objectives").click();
    expect(row(hud, "objective").textContent).toContain("Hold the metering floor");

    const bare = rig(null);
    bare.hud.openBriefing();
    bare.hud.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="objectives"]')?.click();
    expect(row(bare.hud, "none").textContent).toContain(NO_OBJECTIVE);
    expect(row(bare.hud, "none").textContent).toContain(OBJECTIVE_FALLBACK);
  });

  it("prints every system it claims to explain", () => {
    const { hud } = rig();
    hud.openBriefing();
    row(hud, "systems").click();
    for (const note of SYSTEMS_NOTES) {
      expect(row(hud, note.id).textContent).toContain(note.label);
      expect(row(hud, note.id).textContent).toContain(note.line);
    }
  });

  it("opens a system's own page, and closes it from the row it was read on", () => {
    const { hud } = rig();
    hud.openBriefing();
    row(hud, "systems").click();
    row(hud, "standing").click();
    expect(hud.actionMenu.menus.path.at(-1)).toBe("briefing-systems-standing");
    // Every paragraph of the canonical entry, in the order the file has it.
    const standing = SYSTEMS_NOTES.find((note) => note.id === "standing")!;
    standing.body.forEach((paragraph, index) => {
      expect(row(hud, `standing-${index + 1}`).textContent).toContain(paragraph);
    });

    // The rows are something to read, not orders to give: confirming closes.
    row(hud, "standing-1").click();
    expect(hud.actionMenu.menus.path.at(-1)).toBe("briefing-systems");
  });

  it("says what the copy file says, and says it about every entry the file has", () => {
    // docs/SYSTEMS_COPY.md is the source (UI_DESIGN §15.3); the interface holds
    // no second opinion about what Standing is or what a cast speed buys.
    expect(SYSTEMS_NOTES.map((note) => note.id)).toEqual([
      "power",
      "power-breaker",
      "power-freight-lift",
      "standing",
      "charge",
      "cast-speed",
      "resolve",
      "attunement",
      "damage-types",
      "borrow-a-skillset",
      "doctrine",
      "elevation",
    ]);
    for (const note of SYSTEMS_NOTES) {
      expect(note.body.length).toBeGreaterThan(0);
      // A page that quoted the rules file at the player would be a page nobody
      // finishes; the citations stay in docs.
      for (const paragraph of [note.line, ...note.body]) {
        expect(paragraph).not.toMatch(/§|\*\*/);
      }
    }
  });

  it("never forfeits without a second answer, and unwinds when it does", () => {
    const onForfeit = vi.fn();
    const { hud } = rig(null, onForfeit);
    hud.openBriefing();
    row(hud, "forfeit").click();
    expect(onForfeit).not.toHaveBeenCalled();
    expect(hud.actionMenu.menus.path.at(-1)).toBe("briefing-forfeit");

    row(hud, "stay").click();
    expect(hud.actionMenu.menus.path.at(-1)).toBe("battle-briefing");

    row(hud, "forfeit").click();
    row(hud, "forfeit-confirm").click();
    expect(onForfeit).toHaveBeenCalledTimes(1);
    expect(hud.actionMenu.menus.path).toEqual(["action-root"]);
  });

  it("closes the screen when the app named no other way out", () => {
    const { hud, calls } = rig();
    hud.openBriefing();
    row(hud, "forfeit").click();
    row(hud, "forfeit-confirm").click();
    expect(calls.map((call) => call.name)).toContain("closeScreen");
  });
});

describe("the objective chip", () => {
  it("prints the encounter's line and is not there without one", () => {
    const { hud } = rig("Hold the metering floor until the shift bell.");
    const chip = hud.el.querySelector<HTMLElement>(".gf-objective-chip");
    expect(chip?.classList.contains("is-hidden")).toBe(false);
    expect(chip?.textContent).toBe("Hold the metering floor until the shift bell.");

    hud.update(hudView(null));
    expect(chip?.classList.contains("is-hidden")).toBe(true);
  });

  it("stays hidden for a seam that has not populated it at all", () => {
    const { hud } = rig();
    expect(hud.el.querySelector(".gf-objective-chip")?.classList.contains("is-hidden")).toBe(true);
  });
});
