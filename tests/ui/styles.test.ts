/**
 * Findings whose whole surface is a stylesheet, and which no DOM assertion can
 * reach: text that is clipped rather than wrapped reads as finished text, so the
 * loss is silent (findings E and F); and the two chrome budgets UI_DESIGN §12
 * spends deliberately, which nothing else would notice creeping.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHIP_RECT, PORTRAIT_PLATE } from "../../src/ui/portraits.js";

const CSS = readFileSync(
  join(import.meta.dirname, "..", "..", "src", "ui", "styles.css"),
  "utf8",
);

/** The declaration block of the first rule whose selector list contains this. */
function rule(selector: string): string {
  const at = CSS.indexOf(selector);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", at);
  return CSS.slice(open + 1, CSS.indexOf("}", open));
}

describe("the register header names what feeds the bus", () => {
  it("wraps rather than ellipsizing, so a second source cannot be clipped away", () => {
    const head = rule(".gf-power-component-head .gf-power-name");
    expect(head).toContain("white-space: normal");
    expect(head).not.toContain("nowrap");
  });
});

/** The live line's measure, which the trail underneath it has to match. */
const LINE_MEASURE_CH = 60;

describe("the annunciator's scrollback", () => {
  it("keeps a demoted line's closing clause instead of clipping it", () => {
    const line = rule(".gf-notice-line {");
    expect(line).not.toContain("nowrap");
    expect(line).toContain("white-space: normal");
    // Wrapped, but bounded: a trail is a trail, not a transcript.
    expect(line).toContain("line-clamp: 2");
  });

  it("is as wide as the slot whose lines it is holding", () => {
    // At 46ch the trail was narrower than the line above it, so the measure is
    // the thing to pin — in whatever property declares it, not one spelling.
    const log = rule(".gf-notice-log");
    const measures = [...log.matchAll(/(?:max-)?(?:width|inline-size):\s*(\d+(?:\.\d+)?)ch/g)].map(
      (match) => Number(match[1]),
    );
    expect(measures.length, "the log declares no measure at all").toBeGreaterThan(0);
    expect(Math.min(...measures)).toBeGreaterThanOrEqual(LINE_MEASURE_CH);
  });
});

describe("the head chip's crop", () => {
  /** The multipliers in the rule below, in source order. */
  const multipliers = (declaration: string): number[] =>
    [...declaration.matchAll(/var\(--gf-portrait-size\)\s*\*\s*(-?\d+(?:\.\d+)?)/g)].map(
      (match) => Number(match[1]),
    );

  it("scales and offsets the plate by the rect the constants declare", () => {
    // The crop lives in three places — PORTRAIT (src/art/sprites.ts), the UI
    // constants derived from it, and these multipliers, which CSS cannot compute
    // from either. A square slot shows CHIP_RECT of the plate, so the plate is
    // drawn at slot/chip and slid back by the chip's origin.
    const chip = rule(".gf-portrait.is-painted.is-chip");
    const size = chip.slice(chip.indexOf("background-size"));
    const scale = 1 / CHIP_RECT.width;
    expect(multipliers(size.slice(0, size.indexOf(";")))).toEqual([
      PORTRAIT_PLATE.width * scale,
      PORTRAIT_PLATE.height * scale,
    ]);
    const position = chip.slice(chip.indexOf("background-position"));
    expect(multipliers(position.slice(0, position.indexOf(";")))).toEqual([
      -CHIP_RECT.x * scale,
      -CHIP_RECT.y * scale,
    ]);
    expect(CHIP_RECT.width).toBe(CHIP_RECT.height);
  });

  it("keeps the 4:5 plate slots at the plate's own aspect", () => {
    const scene = rule(".gf-dialogue.is-scene .gf-dialogue-portrait .gf-portrait");
    expect(multipliers(scene)).toEqual([PORTRAIT_PLATE.height / PORTRAIT_PLATE.width]);
  });
});

describe("a row under an open submenu", () => {
  /** Every selector list in the sheet that mentions a menu row. */
  const rowSelectors = [...CSS.matchAll(/([^{}]*\.gf-menu-entry[^{}]*)\{/g)].map(
    (match) => match[1] ?? "",
  );

  it("takes no highlight from hover or press", () => {
    // The two selectors carried the same specificity, so source order decided it
    // and `.is-inert` lost: an inert list drew a hover fill and a cursor row that
    // meant nothing. Every reactive rule has to name `.is-inert` — to neutralise
    // it or to exclude itself from it — or the cascade goes back to a coin toss.
    const reactive = rowSelectors.filter((selector) => /:hover|:active/.test(selector));
    expect(reactive.length).toBeGreaterThan(0);
    for (const selector of reactive) {
      expect(selector, `${selector} does not account for an inert row`).toContain(".is-inert");
    }
  });

  it("takes no selection fill either, in any menu", () => {
    const selected = rowSelectors.filter(
      (selector) => selector.includes(".is-selected") && !selector.includes(".is-inert"),
    );
    // What is left may only be the active menu's own cursor row, which an inert
    // row can never be: `is-inert` is set for every menu below the top.
    for (const selector of selected) {
      expect(selector, `${selector} would fill an inert row`).toContain(".gf-menu.is-active");
    }
  });
});

describe("the chrome's budgets (UI_DESIGN §12)", () => {
  /** Declaration blocks, so a budget can be counted in rules rather than in
      occurrences — a two-stop gradient is one decision, not two. */
  const blocks = CSS.split("}").map((chunk) => chunk.slice(chunk.indexOf("{") + 1));

  it("spends amber-glow — the bloom key — on exactly two rules", () => {
    // §12.6: the cursor's leading edge and the commit stamp's hover face. This
    // is the colour the post chain is allowed to bloom on, so a third use is a
    // decision, not a tweak: make it here, in the doc, and in this count.
    const users = blocks.filter((block) => block.includes("var(--gf-live-glow)"));
    expect(users).toHaveLength(2);
    // And never by value, which would slip past the count above.
    const raw = CSS.match(/#ffe7a8|255,\s*231,\s*168/gi) ?? [];
    expect(raw).toHaveLength(1);
  });

  it("has no rounded corners", () => {
    for (const radius of CSS.match(/border-radius:[^;]+/g) ?? []) {
      expect(radius).toMatch(/border-radius:\s*0/);
    }
  });

  it("blurs no outer shadow past 3px", () => {
    // ART_DIRECTION §2, the half of the flat rule the chrome pass kept: the UI
    // shares a frame with pixel art at a fixed orthographic scale, so a soft
    // outer edge beside a 1px sprite outline reads as a rendering error. Inset
    // vignettes are a different object — they never meet the sprite.
    const outer = [...CSS.matchAll(/box-shadow:[^;]+/g)]
      .flatMap((match) => match[0].split(","))
      .filter((shadow) => !shadow.includes("inset"))
      .flatMap((shadow) => [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((n) => Number(n[1])));
    expect(outer.length).toBeGreaterThan(0);
    expect(Math.max(...outer)).toBeLessThanOrEqual(3);
  });
});
