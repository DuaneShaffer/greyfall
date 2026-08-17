/**
 * Findings whose whole surface is a stylesheet, and which no DOM assertion can
 * reach: text that is clipped rather than wrapped reads as finished text, so the
 * loss is silent (findings E and F); and the two chrome budgets UI_DESIGN §12
 * spends deliberately, which nothing else would notice creeping.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("the annunciator's scrollback", () => {
  it("keeps a demoted line's closing clause instead of clipping it", () => {
    const line = rule(".gf-notice-line {");
    expect(line).not.toContain("nowrap");
    expect(line).toContain("white-space: normal");
    // Wrapped, but bounded: a trail is a trail, not a transcript.
    expect(line).toContain("line-clamp: 2");
  });

  it("is as wide as the slot whose lines it is holding", () => {
    expect(rule(".gf-notice-log")).not.toContain("max-width: 46ch");
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
