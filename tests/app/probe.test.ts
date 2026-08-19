/** @vitest-environment happy-dom */
// The UX probe, driven over the real overlay: a real `BattleHud` in a real
// document, fed by a real controller. Two jobs here.
//
// 1. `act()` must travel the player's own code path and must fail loudly — a
//    probe that silently no-ops would recreate the class of bug it exists to find.
// 2. The honesty test: what `describe()` reports about the forecast has to be
//    what the forecast panel actually printed, so the probe cannot drift away
//    from the interface it is standing in for.

import { beforeEach, describe, expect, it } from "vitest";
import { activeUnit } from "../../src/core/index.js";
import type { Facing } from "../../src/data/index.js";
import { BattleController, type UiPort } from "../../src/app/controller.js";
import { createProbe, type GreyfallProbe } from "../../src/app/probe.js";
import { stubAiCommand } from "../../src/app/stubAi.js";
import {
  BattleHud,
  formatDamageRange,
  noopIntents,
  type UiIntents,
} from "../../src/ui/index.js";
import { rowen } from "../core/fixtures.js";
import { fakeRenderer, openBattle, VALE } from "./fixtures.js";

interface Stack {
  controller: BattleController;
  hud: BattleHud;
  probe: GreyfallProbe;
  facing: { onPick: (facing: Facing) => void; onCancel: () => void } | null;
}

/** The HUD outlives every battle, so its intents forward to whoever holds it. */
function forwardingIntents(get: () => BattleController | null): UiIntents {
  const out = {} as UiIntents;
  for (const name of Object.keys(noopIntents())) {
    (out as unknown as Record<string, (...args: never[]) => void>)[name] = (...args: never[]) => {
      const target = get()?.intents as
        | Record<string, ((...args: never[]) => void) | undefined>
        | undefined;
      target?.[name]?.(...args);
    };
  }
  return out;
}

/** main.ts's wiring, minus the renderer and the campaign layer. */
function stack(): Stack {
  document.body.replaceChildren();
  const battle = openBattle([rowen(), VALE], undefined, [{ itemId: "coagulant-vial", count: 2 }]);
  let controller: BattleController | null = null;
  const hud = new BattleHud({ intents: forwardingIntents(() => controller) });
  document.body.append(hud.el);

  const state: Stack = {
    controller: undefined as unknown as BattleController,
    hud,
    probe: undefined as unknown as GreyfallProbe,
    facing: null,
  };

  const ui: UiPort = {
    render: (view) => hud.render(view),
    setMode: (mode, detail) => hud.setMode(mode, detail),
    lockForecast: () => hud.forecast.lock(),
    showFinalState: (view) => {
      if (view !== null) hud.render(view);
      hud.setMode("ended", null);
    },
    showDialogue: (lines) => hud.dialogue.update(lines),
    hideDialogue: () => hud.dialogue.update([]),
    showResult: () => undefined,
    promptFacing: (_current, onPick, onCancel) => {
      state.facing = { onPick, onCancel };
    },
    closePrompt: () => {
      state.facing = null;
    },
    resetMenus: () => {
      while (hud.actionMenu.menus.depth > 1) hud.actionMenu.menus.pop();
    },
    setBusy: (busy) => {
      if (busy) hud.actionMenu.menus.detach();
      else hud.actionMenu.attach(document);
    },
    notify: (message, tone) => hud.notify(message, tone ?? "info"),
  };

  controller = new BattleController({
    state: battle.state,
    events: battle.events,
    renderer: fakeRenderer().port,
    ui,
    ai: stubAiCommand,
  });
  state.controller = controller;
  state.probe = createProbe({ root: document, controller: () => controller });
  return state;
}

/** Open the battle and hand the floor to Rowen, dialogue dismissed. */
function toRowen(s: Stack): void {
  s.controller.start();
  for (let tick = 0; tick < 400; tick += 1) {
    if (s.controller.phase === "player" && activeUnit(s.controller.state)?.id === "rowen") return;
    if (s.controller.phase === "ended") break;
    if (s.controller.phase === "dialogue") {
      s.controller.intents.endDialogue();
      continue;
    }
    if (s.controller.phase === "player") {
      const acting = activeUnit(s.controller.state);
      if (acting !== null) s.controller.intents.wait(acting.id, acting.facing);
      s.facing?.onPick(acting?.facing ?? "north");
      continue;
    }
    s.controller.tick(1);
  }
  throw new Error(`Rowen never got the floor (phase ${s.controller.phase})`);
}

describe("describe()", () => {
  let s: Stack;
  beforeEach(() => {
    s = stack();
    toRowen(s);
  });

  it("says which screen and which mode the game is in", () => {
    const snap = s.probe.describe();
    expect(snap.screen).toBe("battle");
    expect(snap.mode).toBe("orders");
    expect(snap.battle?.phase).toBe("player");
  });

  it("reports the orders menu with its rows, its cursor and its greyed reasons", () => {
    const snap = s.probe.describe();
    const root = snap.menus.find((menu) => menu.id === "action-root");
    expect(root?.active).toBe(true);
    expect(root?.title).toBe("Orders");
    expect(root?.entries.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["Move", "Act", "Item", "Wait"]),
    );
    expect(root?.cursor).toBeGreaterThanOrEqual(0);
    expect(root?.entries[root.cursor]?.selected).toBe(true);
    expect(root?.entries.every((entry) => !entry.inert)).toBe(true);
  });

  it("carries the same frame the panels were drawn from", () => {
    const snap = s.probe.describe();
    expect(snap.battle?.view.activeUnitId).toBe("rowen");
    expect(snap.battle?.view.action.unit.id).toBe("rowen");
    expect(snap.battle?.view.field?.width).toBe(6);
    expect(snap.battle?.view.log?.length).toBeGreaterThan(0);
    expect(snap.panels.map((panel) => panel.label)).toEqual(
      expect.arrayContaining(["Action forecast"]),
    );
  });

  it("trims the record to the tail that was asked for", () => {
    expect(s.probe.describe({ log: 1 }).battle?.view.log).toHaveLength(1);
    expect(s.probe.log(2).length).toBeLessThanOrEqual(2);
  });

  it("reports the overlay layers the field is painting", () => {
    s.probe.act("click", "Move");
    const layers = s.probe.describe().battle?.highlights.map((entry) => entry.layer) ?? [];
    expect(layers).toContain("move-range");
  });

  it("marks the rows under an open submenu inert", () => {
    s.probe.act("click", "Act");
    const snap = s.probe.describe();
    const root = snap.menus.find((menu) => menu.id === "action-root");
    expect(root?.active).toBe(false);
    expect(root?.entries.every((entry) => entry.inert)).toBe(true);
    expect(snap.menus[snap.menus.length - 1]?.active).toBe(true);
  });
});

describe("act()", () => {
  let s: Stack;
  beforeEach(() => {
    s = stack();
    toRowen(s);
  });

  it("opens a submenu and stages an order by label, through the real click path", () => {
    s.probe.act("click", "Act");
    const opened = s.probe.describe();
    expect(opened.menus.map((menu) => menu.id)).toContain("skillset-enforcer");
    expect(opened.clickable).toContain("Pin");

    s.probe.act("click", "Pin");
    const aiming = s.probe.describe();
    expect(aiming.mode).toBe("target");
    expect(aiming.battle?.view.targeting?.abilityId).toBe("pin");
    expect(aiming.battle?.view.targeting?.inRange.length).toBeGreaterThan(0);
  });

  it("moves the cursor on hover without confirming anything", () => {
    s.probe.act("hover", "Wait");
    const snap = s.probe.describe();
    const root = snap.menus.find((menu) => menu.id === "action-root");
    expect(root?.entries[root.cursor]?.label).toBe("Wait");
    expect(snap.mode).toBe("orders");
  });

  it("dispatches a real key, so Escape backs out of a submenu", () => {
    s.probe.act("click", "Act");
    expect(s.probe.describe().menus.length).toBeGreaterThan(1);
    s.probe.act("key", "Escape");
    expect(s.probe.describe().menus).toHaveLength(1);
  });

  it("routes a tile by coordinate through the controller's own handlers", () => {
    s.probe.act("hover", { x: 5, y: 0 });
    expect(s.probe.describe().battle?.view.cursor).toEqual({
      tile: { x: 5, y: 0 },
      height: 2,
      heightDelta: null,
    });

    s.probe.act("click", "Move");
    s.probe.act("click", { x: 0, y: 3 });
    s.probe.act("click", { x: 0, y: 3 });
    expect(s.controller.unitSnapshot("rowen")?.position).toEqual({ x: 0, y: 3 });
  });

  it("throws with what was on screen when the label is not there", () => {
    expect(() => s.probe.act("click", "Signal Switch")).toThrow(/nothing labelled "Signal Switch"/);
    expect(() => s.probe.act("click", "Signal Switch")).toThrow(/Move/);
  });

  it("throws rather than click a greyed row", () => {
    s.probe.act("click", "Move");
    s.probe.act("click", { x: 0, y: 3 });
    s.probe.act("click", { x: 0, y: 3 });
    expect(() => s.probe.act("click", "Move")).toThrow(/greyed out/);
  });

  it("throws on a tile that is not on the board", () => {
    expect(() => s.probe.act("click", { x: 99, y: 0 })).toThrow(/off the board \(6 x 6\)/);
  });

  it("refuses a verb it does not have", () => {
    expect(() => s.probe.act("poke" as "click", "Move")).toThrow(/unknown verb/);
  });
});

describe("the honesty test", () => {
  let s: Stack;
  beforeEach(() => {
    s = stack();
    toRowen(s);
  });

  /** Stage the vial on Vale: an armed forecast with a real target in it. */
  const armForecast = (): void => {
    s.probe.act("click", "Item");
    s.probe.act("click", "Coagulant Vial");
    s.probe.act("click", { x: 1, y: 4 });
  };

  it("reports the forecast the panel actually printed", () => {
    armForecast();
    const snap = s.probe.describe();
    const forecast = snap.battle?.view.forecast;
    expect(forecast).not.toBeNull();
    expect(forecast?.targets.length).toBeGreaterThan(0);

    const panel = snap.panels.find((entry) => entry.label === "Action forecast");
    expect(panel).toBeDefined();
    const lines = panel?.lines ?? [];
    expect(lines).toContain(forecast?.abilityName);
    for (const target of forecast?.targets ?? []) {
      expect(lines).toContain(target.name);
      expect(lines).toContain(`${target.hitChancePercent}%`);
      if (target.damage !== null && target.damage !== undefined) {
        const amount = formatDamageRange(target.damage);
        expect(lines.some((line) => line.includes(amount))).toBe(true);
      }
    }
  });

  it("names exactly the parties the panel names — no third target, no missing one", () => {
    armForecast();
    const forecast = s.probe.describe().battle?.view.forecast;
    expect(forecast).not.toBeNull();
    const printed = [
      ...document.querySelectorAll(".gf-forecast-party-name, .gf-forecast-target-name"),
    ].map((node) => (node.textContent ?? "").trim());
    const expected = [
      forecast?.attacker.name ?? "",
      ...(forecast?.targets ?? []).map((target) => target.name),
    ];
    expect([...printed].sort()).toEqual([...expected].sort());
  });

  it("reports the same menu rows the DOM is showing, cursor included", () => {
    s.probe.act("click", "Item");
    const snap = s.probe.describe();
    const kit = snap.menus[snap.menus.length - 1];
    const nodes = [...document.querySelectorAll('[data-menu="action-items"] .gf-menu-entry')];
    expect(kit?.entries.map((entry) => entry.label)).toEqual(
      nodes.map((node) => (node.querySelector(".gf-menu-label")?.textContent ?? "").trim()),
    );
    const selected = nodes.findIndex((node) => node.classList.contains("is-selected"));
    expect(kit?.cursor).toBe(selected);
  });
});

/**
 * Three places the re-playtest caught `describe()` disagreeing with the screen.
 * A probe that reports what the DOM holds rather than what a player can read is
 * a probe that will certify a broken frame, so each of them is pinned here.
 */
describe("the probe's own honesty", () => {
  let s: Stack;
  beforeEach(() => {
    s = stack();
    toRowen(s);
  });

  const panel = (label: string) =>
    s.probe.describe().panels.find((entry) => entry.label === label) ?? null;

  it("drops text a stylesheet has hidden, not just an inline style", () => {
    const line = document.querySelector<HTMLElement>(".gf-battle-hud .gf-unit-facing");
    expect(line, "no facing line to hide").not.toBeNull();
    const shown = s.probe.describe().panels.flatMap((entry) => entry.lines);
    expect(shown.some((text) => text.includes("Facing"))).toBe(true);

    const sheet = document.createElement("style");
    sheet.textContent = ".gf-unit-facing { display: none; }";
    document.head.append(sheet);

    const hidden = s.probe.describe().panels.flatMap((entry) => entry.lines);
    expect(hidden.some((text) => text.includes("Facing"))).toBe(false);
    sheet.remove();
  });

  it("reports a panel painted under another one as covered, by name", () => {
    const boxes = new Map<string, DOMRect>([
      ["Inspecting unit", new DOMRect(12, 12, 384, 173)],
      ["Battle record", new DOMRect(12, 114, 384, 97)],
    ]);
    for (const node of document.querySelectorAll<HTMLElement>("section.gf-panel")) {
      const box = boxes.get(node.getAttribute("aria-label") ?? "");
      node.getBoundingClientRect = () => box ?? new DOMRect(600, 600, 200, 40);
    }

    const record = panel("Battle record");
    expect(record?.rect).toEqual({ x: 12, y: 114, width: 384, height: 97 });
    expect(record?.occludedBy).toBe("Inspecting unit");
    expect(panel("Inspecting unit")?.occludedBy).toBe("Battle record");
  });

  it("says 'not measured' rather than 'not covered' where there is no layout", () => {
    // happy-dom measures nothing, and a zero box is not evidence of clear air.
    for (const entry of s.probe.describe().panels) {
      expect(entry.rect).toBeNull();
      expect(entry.occludedBy).toBeNull();
    }
  });

  it("carries the between-battle toast, which is a notice on screen", () => {
    const toast = document.createElement("p");
    toast.className = "gf-toast";
    toast.textContent = "Shield Advance entered on Rowen Corvane's record — 150 Standing spent.";
    document.body.append(toast);
    expect(s.probe.describe().notices).toContain(toast.textContent);

    toast.classList.add("is-hidden");
    expect(s.probe.describe().notices).not.toContain(toast.textContent);
    toast.remove();
  });
});
