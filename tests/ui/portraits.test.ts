/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { portrait } from "../../src/ui/dom.js";
import { CHIP_RECT, PORTRAIT_PLATE, clearPortraits, registerPortraits } from "../../src/ui/portraits.js";
import { TurnOrderStrip } from "../../src/ui/battle/turnOrder.js";
import { mockTurnOrderView } from "../../src/ui/mock.js";

afterEach(() => {
  clearPortraits();
});

describe("the portrait slot", () => {
  it("draws the monogram record card while a character has no art", () => {
    const slot = portrait("rowen", "Rowen Corvane", { jobName: "Enforcer" });
    expect(slot.classList.contains("is-painted")).toBe(false);
    expect(slot.querySelector(".gf-portrait-initials")?.textContent).toBe("RC");
    expect(slot.getAttribute("style")).toBeNull();
  });

  it("takes the painted plate once one is filed against the id", () => {
    registerPortraits({ rowen: { plate: "/art/rowen.png" } });
    const slot = portrait("rowen", "Rowen Corvane");
    expect(slot.classList.contains("is-painted")).toBe(true);
    expect(slot.getAttribute("style")).toContain('url("/art/rowen.png")');
  });

  it("cuts the head chip for square slots and shows the whole plate at 4:5", () => {
    registerPortraits({ rowen: { plate: "/art/rowen.png" } });
    expect(portrait("rowen", "Rowen", { size: "small" }).classList.contains("is-chip")).toBe(true);
    expect(portrait("rowen", "Rowen").classList.contains("is-chip")).toBe(true);
    expect(portrait("rowen", "Rowen", { size: "large" }).classList.contains("is-plate")).toBe(true);
  });

  it("keeps the geometry the briefs paint to", () => {
    // art-src/PORTRAIT_BRIEFS.md: 128 x 160 in game, chip cut at (32, 16, 64, 64)
    // — the numbers the CSS crop is derived from, and the ones a master is
    // accepted against. If either moves, both move together.
    expect(PORTRAIT_PLATE).toEqual({ width: 128, height: 160 });
    expect(CHIP_RECT).toEqual({ x: 32, y: 16, width: 64, height: 64 });
  });

  it("mixes painted and unpainted rows in one turn order without either failing", () => {
    registerPortraits({ rowen: { plate: "/art/rowen.png" } });
    const strip = new TurnOrderStrip();
    strip.update(mockTurnOrderView());
    const chips = [...strip.el.querySelectorAll<HTMLElement>(".gf-turn-entry .gf-portrait")];
    expect(chips).toHaveLength(6);
    // Rowen is the only one with a plate on file; the other five rows are the
    // monogram card, which is the shipped fallback and not a gap.
    expect(chips.filter((chip) => chip.classList.contains("is-painted"))).toHaveLength(1);
    expect(chips.filter((chip) => chip.classList.contains("is-chip"))).toHaveLength(1);
  });
});
