/** @vitest-environment happy-dom */
// The playtest could not tell whether an attack had hit, what the enemy's turn
// had done, or what resolved behind a dialogue box. The record is the answer to
// all three, so what it must never do is drop a line or round a figure.

import { describe, expect, it } from "vitest";
import { BattleHud } from "../../src/ui/battle/hud.js";
import { LogPanel } from "../../src/ui/battle/logPanel.js";
import { mockActionMenuView, mockTurnOrderView, mockUnitView } from "../../src/ui/mock.js";
import type { LogEntryView } from "../../src/ui/state.js";

let serial = 0;

function entry(overrides: Partial<LogEntryView> = {}): LogEntryView {
  serial += 1;
  return {
    index: serial,
    kind: "action",
    turn: 1,
    tick: 0,
    targets: [],
    notes: [],
    text: `line ${serial}`,
    ...overrides,
  };
}

const rows = (panel: LogPanel): HTMLElement[] =>
  [...panel.el.querySelectorAll<HTMLElement>(".gf-log-entry")];

const toggle = (panel: LogPanel): HTMLElement =>
  panel.el.querySelector<HTMLElement>(".gf-log-toggle")!;

describe("LogPanel", () => {
  it("collapses to the last three lines and stamps the whole count", () => {
    const panel = new LogPanel();
    const entries = [entry(), entry(), entry(), entry(), entry()];
    panel.update(entries);

    // The tail, oldest of the three first: the newest line is the one the eye
    // lands on at the bottom, and the stamp still counts the whole battle.
    expect(panel.lines).toEqual(entries.slice(-3).map((row) => row.text));
    expect(panel.el.querySelector(".gf-plate-stamp")?.textContent).toBe("5");
  });

  it("expands to the whole history and says so", () => {
    const panel = new LogPanel();
    const entries = [entry(), entry(), entry(), entry(), entry()];
    panel.update(entries);
    expect(toggle(panel).textContent).toBe("Full record (2 earlier)");

    toggle(panel).click();
    expect(panel.expanded).toBe(true);
    expect(panel.lines).toHaveLength(5);
    expect(panel.lines).toEqual(entries.map((row) => row.text));
    expect(toggle(panel).getAttribute("aria-expanded")).toBe("true");
    expect(toggle(panel).textContent).toBe("Collapse");

    // And a fresh frame does not fold it back up under the player.
    panel.update([...entries, entry()]);
    expect(panel.lines).toHaveLength(6);
  });

  it("offers no pull when there is no history behind it", () => {
    const panel = new LogPanel();
    panel.update([entry(), entry()]);
    expect(toggle(panel).classList.contains("is-hidden")).toBe(true);

    panel.update([entry(), entry(), entry(), entry()]);
    expect(toggle(panel).classList.contains("is-hidden")).toBe(false);
  });

  it("hides itself on a battle that has filed nothing", () => {
    const panel = new LogPanel();
    panel.update([]);
    expect(panel.el.classList.contains("is-empty")).toBe(true);
    panel.update([entry()]);
    expect(panel.el.classList.contains("is-empty")).toBe(false);
  });

  it("prints the figures the rules produced, not the ones a forecast promised", () => {
    const panel = new LogPanel();
    // A vial on an unhurt unit: the record files the nothing it restored.
    panel.update([
      entry({
        actor: { id: "rowen", name: "Rowen Corvane", team: "player" },
        action: "Coagulant Vial",
        text: "Rowen Corvane — Coagulant Vial — Maren Voss: 0 recovered, HP 34",
        targets: [
          { id: "maren", name: "Maren Voss", team: "player", hit: true, recovery: 0, hpRemaining: 34, statuses: [], downed: false },
        ],
      }),
    ]);

    expect(panel.lines[0]).toContain("0 recovered");
  });

  it("marks a miss, a death and whose line it is", () => {
    const panel = new LogPanel();
    panel.update([
      entry({
        actor: { id: "provocateur-a", name: "Yard Provocateur", team: "enemy" },
        action: "Pin",
        text: "Yard Provocateur — Pin — Rowen Corvane: missed",
        targets: [{ id: "rowen", name: "Rowen Corvane", team: "player", hit: false, statuses: [], downed: false }],
      }),
      entry({
        kind: "death",
        actor: { id: "provocateur-a", name: "Yard Provocateur", team: "enemy" },
        text: "Yard Provocateur is down",
      }),
      entry({ kind: "turn", turn: 4, actor: { id: "rowen", name: "Rowen Corvane", team: "player" }, text: "Turn 4 — Rowen Corvane" }),
    ]);

    const [miss, death, turn] = rows(panel);
    expect(miss?.className).toContain("is-miss");
    expect(miss?.className).toContain("is-enemy");
    expect(death?.className).toContain("is-down");
    expect(turn?.className).toContain("is-player");
    expect(turn?.querySelector(".gf-log-turn")?.textContent).toBe("T4");
  });

  it("keeps the mid-battle join, with the side it joined", () => {
    const panel = new LogPanel();
    panel.update([
      entry({
        kind: "join",
        actor: { id: "maren", name: "Maren Voss", team: "player" },
        text: "Maren Voss takes the field at (3, 4) — ally",
      }),
    ]);

    expect(rows(panel)[0]?.className).toContain("is-join");
    expect(panel.lines[0]).toContain("ally");
  });

  it("does not let its pull's Enter reach the orders menu underneath", () => {
    const panel = new LogPanel();
    panel.update([entry(), entry(), entry(), entry()]);
    document.body.append(panel.el);
    let reachedTheMenu = 0;
    const listener = (): void => {
      reachedTheMenu += 1;
    };
    document.addEventListener("keydown", listener);

    toggle(panel).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );

    expect(panel.expanded).toBe(true);
    expect(reachedTheMenu).toBe(0);
    document.removeEventListener("keydown", listener);
    panel.destroy();
  });
});

describe("the HUD's record slot", () => {
  it("is fed the battle's log on every frame", () => {
    const hud = new BattleHud();
    const filed = entry({ text: "Rowen Corvane — Pin — Yard Provocateur: 14 kinetic damage, HP 12" });
    hud.render({
      action: mockActionMenuView(),
      inspected: null,
      turnOrder: mockTurnOrderView(),
      forecast: null,
      dialogue: [],
      log: [filed],
    });

    expect(hud.log.lines).toEqual([filed.text]);
    hud.destroy();
  });
});

/**
 * Re-playtest N3. The inspect card and the record share the top of the left
 * column, and on a frame with no room for both the record printed over the card
 * — worst exactly when it mattered, over a machine's power state read before an
 * Operate. The layout half is a stylesheet rule (tests/ui/hudOcclusion.test.ts);
 * this is the half that makes the room.
 */
describe("the record stands down for the card above it", () => {
  const filled = () => [entry(), entry(), entry(), entry(), entry()];

  it("keeps one line while a unit is inspected, and the drawer still counts the rest", () => {
    const panel = new LogPanel();
    const entries = filled();
    panel.update(entries);
    panel.setYielding(true);

    expect(panel.yielded).toBe(true);
    expect(panel.lines).toEqual([entries[entries.length - 1]?.text]);
    expect(toggle(panel).textContent).toBe("Full record (4 earlier)");
    panel.destroy();
  });

  it("gives the lines back the moment the card goes", () => {
    const panel = new LogPanel();
    const entries = filled();
    panel.update(entries);
    panel.setYielding(true);
    panel.setYielding(false);

    expect(panel.lines).toEqual(entries.slice(-3).map((row) => row.text));
    panel.destroy();
  });

  it("still opens onto the whole battle while it is standing down", () => {
    const panel = new LogPanel();
    const entries = filled();
    panel.update(entries);
    panel.setYielding(true);
    toggle(panel).click();

    expect(panel.lines).toEqual(entries.map((row) => row.text));
    panel.destroy();
  });

  it("is the HUD that decides, off the card it actually drew", () => {
    const hud = new BattleHud();
    const frame = (inspected: ReturnType<typeof mockUnitView> | null) => ({
      action: mockActionMenuView(),
      inspected,
      turnOrder: mockTurnOrderView(),
      forecast: null,
      dialogue: [],
      log: filled(),
    });

    hud.render(frame(null));
    expect(hud.log.lines).toHaveLength(3);

    // Somebody other than the actor: the acting unit's own card is not a second
    // panel, so it is not a reason to give up rows.
    hud.render(frame(mockUnitView({ id: "provocateur-a", name: "Yard Provocateur" })));
    expect(hud.log.lines).toHaveLength(1);

    hud.render(frame(null));
    expect(hud.log.lines).toHaveLength(3);
    hud.destroy();
  });
});
