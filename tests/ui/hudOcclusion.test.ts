/**
 * The overlay's own footprint. The turn order is 286px of the right column
 * standing on playable board at battle zoom: a blind playtest could not hover the
 * tiles under it, could not click them, and was told nothing about why. The
 * remedy is a stylesheet rule with no DOM to assert against, so it is asserted
 * against the stylesheet — the same way §12's chrome budgets are.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(import.meta.dirname, "..", "..", "src", "ui", "styles.css"), "utf8");

/** The declaration block of the first rule whose selector list contains this. */
function rule(selector: string): string {
  const at = CSS.indexOf(selector);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", at);
  return CSS.slice(open + 1, CSS.indexOf("}", open));
}

describe("the queue yields the field", () => {
  it("stops taking the pointer, so the tile under it answers instead", () => {
    const yielding = rule(".gf-turn-order.is-yielding");
    expect(yielding).toContain("pointer-events: none");
  });

  it("ghosts far enough for the board to be read through it", () => {
    const opacity = /opacity:\s*([\d.]+)/.exec(rule(".gf-turn-order.is-yielding"));
    expect(opacity?.[1], "the yield has to set an opacity").toBeDefined();
    expect(Number(opacity?.[1])).toBeLessThan(0.4);
    expect(Number(opacity?.[1])).toBeGreaterThan(0);
  });

  it("loses no row while it is out of the way", () => {
    const yielding = rule(".gf-turn-order.is-yielding");
    // §11's silent-loss rule: a clipped list reads as a finished list.
    expect(yielding).not.toContain("display: none");
    expect(yielding).not.toContain("overflow: hidden");
    expect(yielding).not.toContain("max-height");
    expect(yielding).not.toContain("visibility: hidden");
  });

  it("fades rather than blinks, and holds still for a reader who asked it to", () => {
    expect(rule(".gf-root.is-overlay .gf-turn-order {")).toContain("transition: opacity");
    const at = CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    expect(at).toBeGreaterThan(-1);
    const reduced = CSS.slice(at, CSS.indexOf("}", CSS.indexOf("transition: none", at)));
    expect(reduced).toContain(".gf-turn-order");
  });
});
