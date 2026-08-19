// A 3x5 pixel font, just wide enough for damage numbers, the words MISS and
// RESIST, and the cursor's elevation readout.
// Rasterizes to the same palette-index grids `src/art/pixel.ts` produces, so
// the outline rule (ART_DIRECTION §7: soot-100 fill, 1px soot-900 outline) is
// the same 8-connected ring the sprite pipeline uses, and the result paints to
// a canvas through `writeGridToImageData` at integer scale.

import { DAMAGE_NUMBER_COLOR, SOOT_100 } from "../art/palette.js";
import {
  createGrid,
  gridSet,
  outlineGrid,
  overlayGrid,
  paletteIndex,
  type PixelGrid,
} from "../art/pixel.js";

export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;
/** Blank columns between glyphs. */
export const GLYPH_SPACING = 1;
/** Room the outline ring needs on every side. */
export const TEXT_PADDING = 1;

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  "-": ["...", "...", "###", "...", "..."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  S: ["###", "#..", "###", "..#", "###"],
  // The elevation readout's own two: "H2 +1" is a height and a difference, and
  // the gap between them has to be a glyph like any other or `textGrid` throws.
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  // RESIST's remainder. A status that rolls and does not stick is the one
  // outcome the popups had a word for and no letters to spell it with, so it
  // threw where MISS printed; §7 fixes the colour of these words, not the
  // alphabet, and the elevation readout's H is the precedent for widening it.
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  E: ["###", "#..", "###", "#..", "###"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  " ": ["...", "...", "...", "...", "..."],
};

export const hasGlyph = (char: string): boolean => char in GLYPHS;

export const glyphRows = (char: string): readonly string[] => {
  const rows = GLYPHS[char];
  if (rows === undefined) throw new Error(`no glyph for ${JSON.stringify(char)}`);
  return rows;
};

export const textWidth = (text: string): number =>
  text.length === 0 ? 0 : text.length * GLYPH_WIDTH + (text.length - 1) * GLYPH_SPACING;

/** Glyph pixels only, no outline, origin at (0, 0). */
export function textGrid(text: string, fillIndex: number): PixelGrid {
  const grid = createGrid(Math.max(1, textWidth(text)), GLYPH_HEIGHT);
  let x = 0;
  for (const char of text) {
    const rows = glyphRows(char);
    rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i += 1) {
        if (row[i] === "#") gridSet(grid, x + i, y, fillIndex);
      }
    });
    x += GLYPH_WIDTH + GLYPH_SPACING;
  }
  return grid;
}

/**
 * The drawn popup grid: `text` in `fill`, padded by one pixel, optionally
 * wrapped in a closed 1px outline. Misses are outline-free on purpose — they
 * are supposed to be quiet.
 *
 * The glyphs are outlined while still in a non-emissive stand-in color and
 * recolored afterward: `outlineGrid` turns the ring around an emissive index
 * into that element's halo (§3), which is right for a seam on a sprite and
 * wrong for a number — an arc or crit readout would flood its own counters and
 * print as a solid block. §7's soot-900 outline wins here.
 */
export function popupGrid(text: string, fillIndex: number, outlineIndex: number | null): PixelGrid {
  const standIn = paletteIndex(SOOT_100);
  const inner = textGrid(text, standIn);
  const padded = createGrid(inner.width + TEXT_PADDING * 2, inner.height + TEXT_PADDING * 2);
  for (let y = 0; y < inner.height; y += 1) {
    for (let x = 0; x < inner.width; x += 1) {
      const value = inner.data[y * inner.width + x] ?? 0;
      if (value !== 0) gridSet(padded, x + TEXT_PADDING, y + TEXT_PADDING, value);
    }
  }
  const drawn =
    outlineIndex === null
      ? padded
      : overlayGrid(outlineGrid(padded, { color: outlineIndex }), padded);
  for (let i = 0; i < drawn.data.length; i += 1) {
    if (drawn.data[i] === standIn) drawn.data[i] = fillIndex;
  }
  return drawn;
}

export const NUMBER_OUTLINE_INDEX = paletteIndex(DAMAGE_NUMBER_COLOR.outline);
