/**
 * Two acceptance findings whose whole surface is a stylesheet, and which no DOM
 * assertion can reach: text that is clipped rather than wrapped reads as
 * finished text, so the loss is silent (findings E and F).
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
