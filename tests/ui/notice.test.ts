/** @vitest-environment happy-dom */
// The annunciator is how the grid explains itself (FLUX_GRID §2.5), so a batch
// of machine notices in one enemy turn must not overwrite itself into silence.

import { describe, expect, it } from "vitest";
import { BattleHud } from "../../src/ui/battle/hud.js";
import { NoticeStrip } from "../../src/ui/battle/notice.js";
import { mockActionMenuView, mockForecastView, mockTurnOrderView } from "../../src/ui/mock.js";
import type { BattleHudView } from "../../src/ui/state.js";

const lines = (strip: NoticeStrip): HTMLElement[] =>
  [...strip.el.querySelectorAll<HTMLElement>(".gf-notice-line")];

describe("NoticeStrip", () => {
  it("holds the newest line for its own clock", () => {
    const strip = new NoticeStrip();
    strip.show("No path there", "refusal");

    expect(strip.message).toBe("No path there");
    expect(strip.el.querySelector(".gf-notice")?.className).toContain("is-refusal");
    strip.tick(2599);
    expect(strip.message).toBe("No path there");
    strip.tick(1);
    expect(strip.message).toBe("");
  });

  it("keeps a batch readable instead of eating itself", () => {
    const strip = new NoticeStrip();
    strip.show("North Bus cut. 4 machines dark.", "machine");
    strip.tick(40);
    strip.show("Refinery main tripped — 14 against a rating of 12.", "machine");
    strip.tick(40);
    strip.show("Meter lift dropped its deck.", "machine");

    // Newest in the slot, the two it displaced underneath it, newest first.
    expect(strip.message).toBe("Meter lift dropped its deck.");
    expect(strip.scrollback).toEqual([
      "Refinery main tripped — 14 against a rating of 12.",
      "North Bus cut. 4 machines dark.",
    ]);
  });

  it("gives a displaced line its own retention", () => {
    const strip = new NoticeStrip();
    strip.show("A machine answers", "machine");
    strip.tick(2500);
    // Displaced 100ms before it would have retired: it still gets a read.
    strip.show("And another", "machine");
    strip.tick(2000);
    // The trail outlives the slot on purpose: the live line has already gone.
    expect(strip.message).toBe("And another");
    strip.tick(4700);
    expect(strip.message).toBe("");
    expect(strip.scrollback).toEqual(["A machine answers"]);
    strip.tick(200);
    expect(strip.scrollback).toEqual([]);
  });

  // An enemy turn that cuts a span, trips a bus and drops a lift deck is three
  // lines. At 1.8s the trail retired while the turn that wrote it was still
  // animating, and the acceptance play never saw more than two survive at once.
  it("holds a whole enemy batch long enough to be read after the turn", () => {
    const strip = new NoticeStrip();
    strip.show("North Bus cut. 4 machines dark. Splice it or take the gallery tie.", "machine");
    strip.tick(700);
    strip.show("West Main tripped — 18 against a rating of 14. Someone has to reclose it.", "machine");
    strip.tick(700);
    strip.show("Meter Lift lost power. Its deck dropped.", "machine");
    strip.tick(700);
    strip.show("Charge Hoist, East Bay lost power.", "machine");

    // Four beats of one turn, and the whole turn is still on screen a full live
    // slot's worth of time after the last of them landed.
    strip.tick(2600);
    expect(strip.scrollback).toHaveLength(3);
    expect(strip.scrollback.at(-1)).toContain("North Bus cut");
  });

  it("bounds the scrollback", () => {
    const strip = new NoticeStrip();
    for (let index = 0; index < 9; index += 1) strip.show(`line ${index}`);

    expect(strip.scrollback).toHaveLength(5);
    expect(strip.scrollback[0]).toBe("line 7");
    expect(strip.scrollback.at(-1)).toBe("line 3");
    expect(lines(strip)).toHaveLength(5);
  });

  it("keeps a displaced line's tone", () => {
    const strip = new NoticeStrip();
    strip.show("Out of reach", "refusal");
    strip.show("Press engaged", "machine");

    const [older] = lines(strip);
    expect(older?.className).toContain("is-refusal");
    expect(strip.el.querySelector(".gf-notice")?.className).toContain("is-machine");
  });

  it("stays out of the live region and out of the way of the pointer", () => {
    const strip = new NoticeStrip();
    strip.show("first");
    strip.show("second");

    const log = strip.el.querySelector(".gf-notice-log");
    expect(log?.getAttribute("aria-hidden")).toBe("true");
    expect(strip.el.querySelector("[tabindex]")).toBeNull();
    expect(strip.el.querySelector("button")).toBeNull();
  });

  it("wipes the slot and the log together", () => {
    const strip = new NoticeStrip();
    strip.show("first");
    strip.show("second");
    strip.clear();

    expect(strip.message).toBe("");
    expect(strip.scrollback).toEqual([]);
    expect(lines(strip)).toHaveLength(0);
  });

  it("retires the live line without touching a clock", () => {
    const strip = new NoticeStrip();
    strip.show("Field Repair cannot target that", "refusal");
    strip.tick(3000);

    expect(strip.message).toBe("");
    expect(strip.el.querySelector(".gf-notice")?.className).not.toContain("is-shown");
    // Nothing displaced it, so nothing was logged.
    expect(strip.scrollback).toEqual([]);
  });

  // A refusal answers one attempt. The playtest read "Out of reach" beside a
  // forecast that was perfectly sendable and could not tell which of the two the
  // game was talking about.
  it("retires a refusal once the game has asked for something else", () => {
    const strip = new NoticeStrip();
    strip.show("Out of reach", "refusal");
    strip.tick(16);

    strip.enterContext("mode", "target|Pin");
    expect(strip.message).toBe("");
  });

  it("keeps a line nobody has had a frame to read yet", () => {
    const strip = new NoticeStrip();
    // An order's own consequences are reported in the same breath as the mode
    // change that follows them: this is the enemy turn's report, not a leftover.
    strip.show("Yard Provocateur stood down — no legal order", "refusal");
    strip.enterContext("mode", "presenting|");

    expect(strip.message).toBe("Yard Provocateur stood down — no legal order");
    // And it goes at the next boundary, once it has been on screen.
    strip.tick(16);
    strip.enterContext("mode", "orders|Rowen Corvane");
    expect(strip.message).toBe("");
  });

  it("leaves the annunciator's machine lines on their own clocks", () => {
    const strip = new NoticeStrip();
    strip.show("North Bus cut. 4 machines dark.", "machine");
    strip.tick(40);
    strip.show("West Main tripped — 18 against a rating of 14.", "machine");
    strip.tick(40);

    // The grid's record is not an answer to an input: the player's turn opening
    // is exactly when it is read (FLUX_GRID §2.5).
    strip.enterContext("mode", "orders|Rowen Corvane");
    expect(strip.message).toBe("West Main tripped — 18 against a rating of 14.");
    expect(strip.scrollback).toEqual(["North Bus cut. 4 machines dark."]);
  });

  it("clears the trail of a moment the player has left", () => {
    const strip = new NoticeStrip();
    strip.show("Move withdrawn.", "info");
    strip.tick(16);
    strip.show("Pin cannot target that", "refusal");
    strip.tick(16);

    strip.enterContext("mode", "orders|Rowen Corvane");
    expect(strip.message).toBe("");
    expect(strip.scrollback).toEqual([]);
  });

  it("takes a redraw of the same context for what it is", () => {
    const strip = new NoticeStrip();
    strip.enterContext("mode", "target|Pin");
    strip.show("Pin cannot target that", "refusal");
    strip.tick(16);

    strip.enterContext("mode", "target|Pin");
    expect(strip.message).toBe("Pin cannot target that");
  });

  it("counts a boundary per slot, so one does not mask another", () => {
    const strip = new NoticeStrip();
    strip.enterContext("mode", "orders|Rowen Corvane");
    strip.enterContext("menu", "action-root");
    strip.show("Insufficient charge", "refusal");
    strip.tick(16);

    // The mode has not moved; the menu has.
    strip.enterContext("mode", "orders|Rowen Corvane");
    expect(strip.message).toBe("Insufficient charge");
    strip.enterContext("menu", "action-root/action-skillset");
    expect(strip.message).toBe("");
  });

  it("gives the same refusal twice as one refusal, not two", () => {
    const strip = new NoticeStrip();
    strip.show("Out of reach", "refusal");
    strip.tick(2000);
    strip.show("Out of reach", "refusal");

    expect(strip.scrollback).toEqual([]);
    // The clock restarted rather than a copy being filed under it.
    strip.tick(2500);
    expect(strip.message).toBe("Out of reach");
  });
});

/** The boundaries the overlay actually crosses, through the HUD's own plumbing. */
describe("the HUD's notice contexts", () => {
  const view = (overrides: Partial<BattleHudView> = {}): BattleHudView => ({
    action: mockActionMenuView(),
    inspected: null,
    turnOrder: mockTurnOrderView(),
    forecast: null,
    dialogue: [],
    ...overrides,
  });

  it("clears a stale refusal when the turn changes", () => {
    const hud = new BattleHud();
    hud.setMode("orders", "Rowen Corvane");
    hud.notify("Out of reach", "refusal");
    hud.tick(16);

    hud.setMode("ai", "Yard Provocateur");
    expect(hud.notice.message).toBe("");
    hud.destroy();
  });

  it("clears a stale refusal when an order is staged", () => {
    const hud = new BattleHud();
    hud.setMode("target", "Pin");
    hud.render(view());
    hud.notify("Pin cannot target that", "refusal");
    hud.tick(16);

    hud.render(view({ forecast: mockForecastView() }));
    expect(hud.notice.message).toBe("");
    hud.destroy();
  });

  it("leaves a machine report standing through the same boundaries", () => {
    const hud = new BattleHud();
    hud.setMode("ai", "Yard Provocateur");
    hud.notify("North Bus cut. 4 machines dark.", "machine");
    hud.tick(16);

    hud.setMode("orders", "Rowen Corvane");
    hud.render(view({ forecast: mockForecastView() }));
    expect(hud.notice.message).toBe("North Bus cut. 4 machines dark.");
    hud.destroy();
  });
});
