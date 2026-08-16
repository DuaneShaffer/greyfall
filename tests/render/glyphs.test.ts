import { describe, expect, it } from "vitest";
import { DAMAGE_NUMBER_COLOR, SOOT_900 } from "../../src/art/palette.js";
import { gridBounds, gridGet, paletteIndex } from "../../src/art/pixel.js";
import {
  GLYPH_HEIGHT,
  GLYPH_SPACING,
  GLYPH_WIDTH,
  NUMBER_OUTLINE_INDEX,
  TEXT_PADDING,
  glyphRows,
  hasGlyph,
  popupGrid,
  textGrid,
  textWidth,
} from "../../src/render/glyphs.js";

const DIGITS = "0123456789".split("");
const FILL = paletteIndex(DAMAGE_NUMBER_COLOR.normal);

describe("glyph atlas", () => {
  it("carries every digit plus the signs and MISS letters", () => {
    for (const char of [...DIGITS, "-", "+", "M", "I", "S"]) {
      expect(hasGlyph(char)).toBe(true);
    }
    expect(hasGlyph("Q")).toBe(false);
  });

  it("is a strict 3x5 cell for every glyph", () => {
    for (const char of [...DIGITS, "-", "+", "M", "I", "S"]) {
      const rows = glyphRows(char);
      expect(rows).toHaveLength(GLYPH_HEIGHT);
      for (const row of rows) {
        expect(row).toHaveLength(GLYPH_WIDTH);
        expect(row).toMatch(/^[#.]+$/);
      }
    }
  });

  it("draws ten distinct digits", () => {
    const shapes = new Set(DIGITS.map((digit) => glyphRows(digit).join("/")));
    expect(shapes.size).toBe(10);
  });

  it("advances one blank column between glyphs", () => {
    expect(textWidth("7")).toBe(GLYPH_WIDTH);
    expect(textWidth("12")).toBe(GLYPH_WIDTH * 2 + GLYPH_SPACING);
    expect(textWidth("MISS")).toBe(GLYPH_WIDTH * 4 + GLYPH_SPACING * 3);
    expect(textWidth("")).toBe(0);
  });

  it("rasterizes digits in the requested fill only", () => {
    const grid = textGrid("42", FILL);
    expect(grid.width).toBe(textWidth("42"));
    expect(grid.height).toBe(GLYPH_HEIGHT);
    const values = new Set(grid.data);
    expect([...values].sort()).toEqual([0, FILL].sort());
    // The spacing column between the two digits stays empty.
    for (let y = 0; y < GLYPH_HEIGHT; y += 1) expect(gridGet(grid, GLYPH_WIDTH, y)).toBe(0);
  });

  it("wraps damage numbers in a closed 1px soot-900 ring", () => {
    const grid = popupGrid("8", FILL, NUMBER_OUTLINE_INDEX);
    expect(NUMBER_OUTLINE_INDEX).toBe(paletteIndex(SOOT_900));
    expect(grid.width).toBe(GLYPH_WIDTH + TEXT_PADDING * 2);
    expect(grid.height).toBe(GLYPH_HEIGHT + TEXT_PADDING * 2);
    // Every fill pixel is surrounded by fill or outline, never by nothing.
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        if (gridGet(grid, x, y) !== FILL) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          expect(gridGet(grid, x + dx, y + dy)).not.toBe(0);
        }
      }
    }
  });

  it("outlines an emissive number in soot-900 instead of its own halo", () => {
    // An arc number is overload-100; the sprite halo rule would fill its
    // counters with the same color and print a solid block.
    const arc = paletteIndex(DAMAGE_NUMBER_COLOR.arc);
    const crit = paletteIndex(DAMAGE_NUMBER_COLOR.crit);
    const plain = popupGrid("32", FILL, NUMBER_OUTLINE_INDEX);
    for (const fill of [arc, crit]) {
      const grid = popupGrid("32", fill, NUMBER_OUTLINE_INDEX);
      const used = new Set(grid.data);
      expect([...used].every((v) => v === 0 || v === fill || v === NUMBER_OUTLINE_INDEX)).toBe(true);
      expect(used.has(fill)).toBe(true);
      expect(used.has(NUMBER_OUTLINE_INDEX)).toBe(true);
      // Same silhouette as the default color, just recolored.
      expect([...grid.data].map((v) => (v === fill ? FILL : v))).toEqual([...plain.data]);
    }
  });

  it("leaves a miss unoutlined, so it stays quiet", () => {
    const outlined = popupGrid("MISS", paletteIndex(DAMAGE_NUMBER_COLOR.miss), NUMBER_OUTLINE_INDEX);
    const quiet = popupGrid("MISS", paletteIndex(DAMAGE_NUMBER_COLOR.miss), null);
    expect(new Set(quiet.data)).toEqual(new Set([0, paletteIndex(DAMAGE_NUMBER_COLOR.miss)]));
    expect(new Set(outlined.data).has(NUMBER_OUTLINE_INDEX)).toBe(true);
    expect(quiet.width).toBe(outlined.width);
  });

  it("keeps the text inside its padded canvas", () => {
    const grid = popupGrid("120", FILL, NUMBER_OUTLINE_INDEX);
    const bounds = gridBounds(grid);
    expect(bounds).not.toBeNull();
    expect(bounds?.x0).toBe(0);
    expect(bounds?.x1).toBe(grid.width - 1);
    expect(bounds?.y1).toBe(grid.height - 1);
  });
});
