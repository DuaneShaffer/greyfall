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

/**
 * The other panel that stood on something it should not have. The record was
 * *placed in* the frame's flexible row and aligned to its foot: on a frame whose
 * content overran the height, that row collapsed toward zero and the panel
 * printed upward out of it, through the inspect card above. Measured 12-185
 * against 114-211. A panel may overflow the frame; it may not overflow its row.
 */
describe("the record stays in its own row", () => {
  const grid = rule(".gf-battle-hud {");
  const areas = /grid-template-areas:([^;]*);/.exec(grid)?.[1] ?? "";
  const rows = (/grid-template-rows:([^;]*);/.exec(grid)?.[1] ?? "").trim().split(/\s+(?![^(]*\))/);
  const named = [...areas.matchAll(/"([^"]*)"/g)].map((line) => (line[1] ?? "").trim().split(/\s+/));

  it("declares one row track per row of the area map", () => {
    expect(named.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(named.length);
  });

  it("never shares a row with the inspect card", () => {
    const rowOf = (area: string): number[] =>
      named.flatMap((cells, index) => (cells.includes(area) ? [index] : []));
    const record = rowOf("record");
    const inspect = rowOf("inspect");
    expect(record.length).toBeGreaterThan(0);
    expect(inspect.length).toBeGreaterThan(0);
    expect(record.some((index) => inspect.includes(index))).toBe(false);
  });

  it("sits in a track sized by its content, not in the one that absorbs the slack", () => {
    const recordRow = named.findIndex((cells) => cells.includes("record"));
    expect(rows[recordRow]).toBe("auto");
    // And the slack has a track of its own to collapse into, above the record,
    // so the column still hangs from the foot of the frame.
    const flexible = rows.findIndex((track) => track.includes("fr"));
    expect(flexible).toBeGreaterThan(-1);
    expect(flexible).toBeLessThan(recordRow);
    expect(named[flexible]?.filter((cell) => cell !== "." && cell !== "clock")).toEqual([]);
  });
});
