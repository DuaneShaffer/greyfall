/** @vitest-environment happy-dom */
// The annunciator is how the grid explains itself (FLUX_GRID §2.5), so a batch
// of machine notices in one enemy turn must not overwrite itself into silence.

import { describe, expect, it } from "vitest";
import { NoticeStrip } from "../../src/ui/battle/notice.js";

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
    strip.tick(1700);
    expect(strip.scrollback).toEqual(["A machine answers"]);
    strip.tick(200);
    expect(strip.scrollback).toEqual([]);
    expect(strip.message).toBe("And another");
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
});
