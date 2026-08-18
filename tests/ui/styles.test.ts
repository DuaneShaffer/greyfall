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

/**
 * The rose's whole job is that the arm labelled North points at the board's
 * north, and the only thing that knows where that is on screen is the CSS that
 * places the four rows per camera bearing. No DOM assertion can reach it.
 */
describe("the compass rose turns with the rig", () => {
  it("gives every bearing a complete rose, one arm per quarter", () => {
    const blocks = [
      ...CSS.matchAll(/([^{}]*\[data-menu="action-facing"\][^{}]*)\{([^}]*grid-area:[^}]*)\}/g),
    ];
    const placed = new Map<string, string>();
    for (const [, selectors = "", body = ""] of blocks) {
      const area = /grid-area:\s*([a-z]+)/.exec(body)?.[1];
      if (area === undefined) continue;
      for (const selector of selectors.split(",")) {
        const yaw = /data-yaw="(\d)"/.exec(selector)?.[1];
        const facing = /data-entry="(\w+)"/.exec(selector)?.[1];
        if (yaw === undefined || facing === undefined) continue;
        placed.set(`${yaw}:${facing}`, area);
      }
    }
    for (const yaw of ["0", "1", "2", "3"]) {
      const areas = ["north", "east", "south", "west"].map((facing) =>
        placed.get(`${yaw}:${facing}`),
      );
      expect(areas, `bearing ${yaw} is missing an arm`).not.toContain(undefined);
      // Two arms in one quarter is a rose that lies about half the board.
      expect(new Set(areas).size, `bearing ${yaw} doubles up a quarter`).toBe(4);
    }
  });
});
