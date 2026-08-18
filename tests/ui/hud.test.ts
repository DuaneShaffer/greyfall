/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { BattleHud } from "../../src/ui/battle/hud.js";
import { recordingIntents, type IntentCall } from "../../src/ui/intents.js";
import {
  mockActionMenuView,
  mockDialogue,
  mockForecastView,
  mockTurnOrderView,
  mockUnitView,
} from "../../src/ui/mock.js";
import type { ActionMenuView, BattleHudView, ForecastView } from "../../src/ui/state.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

const OPERABLES = [
  { objectId: "north-breaker", name: "North Breaker" },
  { objectId: "lift-deck", name: "Lift Deck" },
];

function hudView(
  action: Partial<ActionMenuView> = {},
  forecast: ForecastView | null = null,
): BattleHudView {
  return {
    action: mockActionMenuView(action),
    inspected: mockUnitView(),
    turnOrder: mockTurnOrderView(),
    forecast,
    dialogue: mockDialogue,
  };
}

function rig(): { hud: BattleHud; calls: IntentCall[] } {
  const { intents, calls } = recordingIntents();
  const hud = new BattleHud({ intents });
  hud.update(hudView({ operables: OPERABLES }));
  hud.setMode("orders", "Rowen Corvane");
  return { hud, calls };
}

function names(calls: IntentCall[]): string[] {
  return calls.map((call) => call.name);
}

function row(hud: BattleHud, id: string): HTMLElement {
  const node = hud.el.querySelector<HTMLElement>(`.gf-menu-entry[data-entry="${id}"]`);
  expect(node, `no row for ${id}`).not.toBeNull();
  return node as HTMLElement;
}

/** Root -> Operate, leaving the cursor on the first machine. */
function openOperate(hud: BattleHud): void {
  row(hud, "operate").click();
}

describe("one commit model", () => {
  it("stages an operable from the row and sends nothing", () => {
    const { hud, calls } = rig();
    openOperate(hud);
    calls.length = 0;
    row(hud, "lift-deck").click();
    // Staging is the only thing a row does: the cursor lands and the row is
    // confirmed, and both mean "forecast this", never "send it".
    expect([...new Set(names(calls))]).toEqual(["previewOperable"]);
    expect(calls.at(-1)?.args).toEqual(["rowen", "lift-deck"]);
  });

  it("re-stages the row it is already on, so a withdrawn preview comes back", () => {
    const { hud, calls } = rig();
    openOperate(hud);
    const first = calls.filter((call) => call.name === "previewOperable").length;
    // The cursor cannot move onto a row it is already resting on, which is the
    // dead window: the preview was gone and nothing could bring it back.
    row(hud, "north-breaker").click();
    row(hud, "north-breaker").click();
    expect(calls.filter((call) => call.name === "previewOperable").length).toBe(first + 2);
  });

  it("unwinds the whole order when the card is withdrawn, leaving nothing armed", () => {
    const { hud, calls } = rig();
    openOperate(hud);
    hud.update(hudView({ operables: OPERABLES }, mockForecastView({ armed: false, operate: { objectId: "north-breaker" } })));
    calls.length = 0;

    hud.el.querySelector<HTMLElement>(".gf-forecast-withdraw")?.click();
    expect(hud.actionMenu.menus.path).toEqual(["action-root"]);
    expect(names(calls)).toEqual(["previewOperable", "cancelSelection"]);
    expect(calls[0]?.args).toEqual(["rowen", null]);
  });
});

describe("withdraw is the one way back out", () => {
  it("pops an open submenu one level", () => {
    const { hud } = rig();
    openOperate(hud);
    expect(hud.withdraw()).toBe("menu");
    expect(hud.actionMenu.menus.path).toEqual(["action-root"]);
  });

  it("withdraws a staged aim and hands back the field cursor", () => {
    const { hud, calls } = rig();
    hud.update(hudView({ operables: OPERABLES }, mockForecastView()));
    hud.setMode("target", "Pin");
    calls.length = 0;
    expect(hud.withdraw()).toBe("unstaged");
    expect(names(calls)).toEqual(["cancelSelection"]);
  });

  it("answers at the root instead of doing nothing", () => {
    const { hud, calls } = rig();
    expect(hud.withdraw()).toBe("root");
    // Nothing was staged, so the gesture is worth a briefing rather than silence.
    expect(hud.actionMenu.menus.path).toEqual(["action-root", "battle-briefing"]);
    expect(calls).toEqual([]);
  });

  it("is a harmless no-op before anything has been drawn", () => {
    const { intents, calls } = recordingIntents();
    const bare = new BattleHud({ intents });
    bare.setMode("orders");
    expect(bare.withdraw()).toBe("none");
    bare.openBriefing();
    expect(bare.actionMenu.menus.depth).toBe(0);
    expect(calls).toEqual([]);
  });

  it("is a harmless no-op when the orders are not the player's", () => {
    const { hud, calls } = rig();
    hud.setMode("ai");
    expect(hud.withdraw()).toBe("none");
    hud.setMode("presenting");
    expect(hud.withdraw()).toBe("none");
    hud.setMode("ended");
    expect(hud.withdraw()).toBe("none");
    expect(calls).toEqual([]);
  });

  it("routes Escape at the root through the same path", () => {
    const { hud } = rig();
    hud.actionMenu.attach(document);
    document.dispatchEvent(key("Escape"));
    expect(hud.actionMenu.menus.path).toEqual(["action-root", "battle-briefing"]);
    hud.destroy();
  });

  it("routes right-click on the menu box through the same path", () => {
    const { hud } = rig();
    openOperate(hud);
    hud.actionMenu.menus.el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(hud.actionMenu.menus.path).toEqual(["action-root"]);
  });
});

describe("refusals reach the annunciator", () => {
  it("prints the reason a greyed order refused", () => {
    const { hud } = rig();
    hud.update(hudView({ operables: OPERABLES, canAct: false, actBlockedReason: "Action already spent" }));
    row(hud, "act").click();
    expect(hud.notice.el.textContent).toContain("Action already spent");
  });
});
