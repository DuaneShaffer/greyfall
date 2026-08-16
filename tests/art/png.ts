// Contact-sheet drawing for eyeballing generated sprite grids. The PNG codec
// itself lives in `src/art/png.ts` (the intake path needs it); this file is
// only the paper: an RGBA canvas, a blitter, and a 3x5 label font.

import { INDEXED_PALETTE, type PixelGrid } from "../../src/art/pixel.js";
import { encodePNG, type RGBAImage } from "../../src/art/png.js";

export { encodePNG };
export type { RGBAImage };

export function createImage(width: number, height: number, fill = [0, 0, 0, 0]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = fill[0] ?? 0;
    data[i * 4 + 1] = fill[1] ?? 0;
    data[i * 4 + 2] = fill[2] ?? 0;
    data[i * 4 + 3] = fill[3] ?? 0;
  }
  return { width, height, data };
}

const rgbOf = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

export function setPixel(img: RGBAImage, x: number, y: number, rgba: readonly number[]): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const at = (y * img.width + x) * 4;
  img.data[at] = rgba[0] ?? 0;
  img.data[at + 1] = rgba[1] ?? 0;
  img.data[at + 2] = rgba[2] ?? 0;
  img.data[at + 3] = rgba[3] ?? 255;
}

export function fillRect(
  img: RGBAImage,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: readonly number[],
): void {
  for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) setPixel(img, xx, yy, rgba);
}

/** Blit a palette-index grid at `scale`, leaving transparent pixels untouched. */
export function drawGrid(
  img: RGBAImage,
  grid: PixelGrid,
  ox: number,
  oy: number,
  scale = 1,
): void {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const hex = INDEXED_PALETTE[grid.data[y * grid.width + x] ?? 0] ?? null;
      if (hex === null) continue;
      const rgb = rgbOf(hex);
      fillRect(img, ox + x * scale, oy + y * scale, scale, scale, [rgb[0], rgb[1], rgb[2], 255]);
    }
  }
}

/** 3x5 pixel labels, so a contact sheet can name what it shows. */
const FONT: Readonly<Record<string, readonly string[]>> = {
  a: ["010", "101", "111", "101", "101"],
  b: ["110", "101", "110", "101", "110"],
  c: ["011", "100", "100", "100", "011"],
  d: ["110", "101", "101", "101", "110"],
  e: ["111", "100", "110", "100", "111"],
  f: ["111", "100", "110", "100", "100"],
  g: ["011", "100", "101", "101", "011"],
  h: ["101", "101", "111", "101", "101"],
  i: ["111", "010", "010", "010", "111"],
  j: ["001", "001", "001", "101", "010"],
  k: ["101", "110", "100", "110", "101"],
  l: ["100", "100", "100", "100", "111"],
  m: ["101", "111", "111", "101", "101"],
  n: ["101", "111", "111", "111", "101"],
  o: ["010", "101", "101", "101", "010"],
  p: ["110", "101", "110", "100", "100"],
  q: ["010", "101", "101", "111", "011"],
  r: ["110", "101", "110", "101", "101"],
  s: ["011", "100", "010", "001", "110"],
  t: ["111", "010", "010", "010", "010"],
  u: ["101", "101", "101", "101", "111"],
  v: ["101", "101", "101", "101", "010"],
  w: ["101", "101", "111", "111", "101"],
  x: ["101", "101", "010", "101", "101"],
  y: ["101", "101", "010", "010", "010"],
  z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "011", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "/": ["001", "001", "010", "100", "100"],
  "-": ["000", "000", "111", "000", "000"],
  " ": ["000", "000", "000", "000", "000"],
  ".": ["000", "000", "000", "000", "010"],
};

export function drawText(
  img: RGBAImage,
  text: string,
  ox: number,
  oy: number,
  rgba: readonly number[] = [179, 188, 197, 255],
): void {
  let x = ox;
  for (const ch of text.toLowerCase()) {
    const rows = FONT[ch] ?? FONT[" "];
    if (!rows) continue;
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r] as string;
      for (let c = 0; c < row.length; c += 1) {
        if (row[c] === "1") setPixel(img, x + c, oy + r, rgba);
      }
    }
    x += 4;
  }
}
