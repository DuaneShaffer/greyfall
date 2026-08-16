// Deterministic pixel compositor. Layers of parametric primitives resolve into
// a palette-index grid: index 0 is transparent, 1..34 are PALETTE in
// declaration order. Nothing here reads a clock or a random source, so the
// same inputs always produce byte-identical grids.

import {
  AMBER_300,
  AMBER_500,
  AMBER_GLOW,
  OUTLINE_COLOR,
  OVERLOAD_100,
  OVERLOAD_500,
  PALETTE,
  VEINGLASS_100,
  VEINGLASS_500,
  type ColorName,
  type Hex,
} from "./palette.js";

export const TRANSPARENT = 0;

const COLOR_NAMES = Object.keys(PALETTE) as ColorName[];

/** Index 0 is transparent; the rest follow `PALETTE` declaration order. */
export const INDEXED_PALETTE: readonly (Hex | null)[] = [
  null,
  ...COLOR_NAMES.map((name) => PALETTE[name]),
];

const INDEX_BY_HEX = new Map<string, number>(
  COLOR_NAMES.map((name, i) => [PALETTE[name] as string, i + 1]),
);

export function paletteIndex(hex: Hex): number {
  const index = INDEX_BY_HEX.get(hex);
  if (index === undefined) throw new Error(`off-palette color: ${hex}`);
  return index;
}

export function colorAt(index: number): Hex | null {
  return INDEXED_PALETTE[index] ?? null;
}

export const OUTLINE_INDEX = paletteIndex(OUTLINE_COLOR);

/**
 * Emissive elements bleed outward instead of taking a black edge
 * (ART_DIRECTION §3, outline rule).
 */
const HALO_BY_INDEX = new Map<number, number>([
  [paletteIndex(AMBER_500), paletteIndex(AMBER_GLOW)],
  [paletteIndex(AMBER_300), paletteIndex(AMBER_GLOW)],
  [paletteIndex(AMBER_GLOW), paletteIndex(AMBER_GLOW)],
  [paletteIndex(OVERLOAD_500), paletteIndex(OVERLOAD_100)],
  [paletteIndex(OVERLOAD_100), paletteIndex(OVERLOAD_100)],
  [paletteIndex(VEINGLASS_500), paletteIndex(VEINGLASS_100)],
  [paletteIndex(VEINGLASS_100), paletteIndex(VEINGLASS_100)],
]);

export const isEmissiveIndex = (index: number): boolean => HALO_BY_INDEX.has(index);

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PixelGrid {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export function createGrid(width: number, height: number): PixelGrid {
  return { width, height, data: new Uint8Array(width * height) };
}

export function cloneGrid(grid: PixelGrid): PixelGrid {
  return { width: grid.width, height: grid.height, data: Uint8Array.from(grid.data) };
}

export function gridGet(grid: PixelGrid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return TRANSPARENT;
  return grid.data[y * grid.width + x] ?? TRANSPARENT;
}

export function gridSet(grid: PixelGrid, x: number, y: number, index: number): void {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
  grid.data[y * grid.width + x] = index;
}

/**
 * ART_DIRECTION Appendix C.1: one key light, upper-left. `light` goes on the
 * top row and left column of a mass, `shadow` on the bottom row and right
 * column, `line` is the darkest local step and is for interior separation only
 * — never an area fill.
 */
export interface Shade3 {
  readonly light: number;
  readonly base: number;
  readonly shadow: number;
  readonly line: number;
}

export const KEY_LIGHT = { dx: -1, dy: -1 } as const;

export const shade3 = (light: number, base: number, shadow: number, line = shadow): Shade3 => ({
  light,
  base,
  shadow,
  line,
});

/** Push a shade one step darker: how far-side limbs and recessed gear read. */
export const recessed = (s: Shade3): Shade3 => shade3(s.base, s.shadow, s.line, s.line);

/** Appendix C.2: the only dither patterns this register permits. */
export type DitherPattern = "checker" | "quarter" | "three-quarter";

export function ditherAt(pattern: DitherPattern, x: number, y: number, phase = 0): boolean {
  switch (pattern) {
    case "checker":
      return ((x + y + phase) & 1) === 0;
    case "quarter":
      return ((x + phase) & 1) === 0 && ((y + phase) & 1) === 0;
    case "three-quarter":
      return !(((x + phase) & 1) === 1 && ((y + phase) & 1) === 1);
  }
}

/**
 * A hand-authored pixel region: literal rows of palette indices, 0 meaning
 * "leave whatever is underneath". This is where craft lives — everything a
 * pose cannot be allowed to deform is authored as one of these.
 */
export interface Glyph {
  readonly w: number;
  readonly h: number;
  readonly data: readonly number[];
}

/**
 * Build a glyph from character rows. `.` and space are skips; every other
 * character must appear in `map`, so an unresolvable character is a build-time
 * error rather than an off-palette pixel.
 */
export function glyph(rows: readonly string[], map: Readonly<Record<string, number>>): Glyph {
  const w = Math.max(0, ...rows.map((r) => r.length));
  const data: number[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y] ?? "";
    for (let x = 0; x < w; x += 1) {
      const ch = row[x] ?? ".";
      if (ch === "." || ch === " ") {
        data.push(TRANSPARENT);
        continue;
      }
      const index = map[ch];
      if (index === undefined) throw new Error(`glyph char '${ch}' has no color`);
      data.push(index);
    }
  }
  return { w, h: rows.length, data };
}

export function mirrorGlyph(g: Glyph): Glyph {
  const data: number[] = [];
  for (let y = 0; y < g.h; y += 1) {
    for (let x = 0; x < g.w; x += 1) data.push(g.data[y * g.w + (g.w - 1 - x)] ?? TRANSPARENT);
  }
  return { w: g.w, h: g.h, data };
}

/** Recolor a glyph in place, e.g. to flash it or to swap a tint index. */
export function remapGlyph(g: Glyph, remap: ReadonlyMap<number, number>): Glyph {
  return { w: g.w, h: g.h, data: g.data.map((v) => remap.get(v) ?? v) };
}

export type Prim =
  | { readonly kind: "pixel"; readonly x: number; readonly y: number; readonly color: number }
  | { readonly kind: "stamp"; readonly x: number; readonly y: number; readonly glyph: Glyph }
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly color: number;
    }
  | {
      readonly kind: "frame";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly color: number;
    }
  | {
      readonly kind: "line";
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
      readonly color: number;
    }
  | {
      readonly kind: "dither";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly color: number;
      readonly phase?: number;
    }
  | {
      readonly kind: "patch";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly color: number;
      readonly pattern: DitherPattern;
      readonly phase?: number;
    };

export const px = (x: number, y: number, color: number): Prim => ({ kind: "pixel", x, y, color });

export const stamp = (x: number, y: number, g: Glyph): Prim => ({ kind: "stamp", x, y, glyph: g });

/** Appendix C.2: a dither band in one of the three approved patterns. */
export const patch = (
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  pattern: DitherPattern,
  phase = 0,
): Prim => ({ kind: "patch", x, y, w, h, color, pattern, phase });

export const rect = (x: number, y: number, w: number, h: number, color: number): Prim => ({
  kind: "rect",
  x,
  y,
  w,
  h,
  color,
});

export const frame = (x: number, y: number, w: number, h: number, color: number): Prim => ({
  kind: "frame",
  x,
  y,
  w,
  h,
  color,
});

export const line = (x0: number, y0: number, x1: number, y1: number, color: number): Prim => ({
  kind: "line",
  x0,
  y0,
  x1,
  y1,
  color,
});

export const dither = (
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  phase = 0,
): Prim => ({ kind: "dither", x, y, w, h, color, phase });

export interface ShadedRectOptions {
  /** Suppress the light rim (cloth stops 1px short of the silhouette). */
  readonly softLeft?: boolean;
  readonly softTop?: boolean;
  /** Skip the shadow column/row where another form already occludes it. */
  readonly noRight?: boolean;
  readonly noBottom?: boolean;
}

/**
 * A rectangular mass carrying Appendix C.1's three steps: light on the top row
 * and left column, shadow on the bottom row and right column, base between.
 * Degrades gracefully — a 1px-wide form is just its base.
 */
export function shadedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  s: Shade3,
  options: ShadedRectOptions = {},
): Prim[] {
  if (w <= 0 || h <= 0) return [];
  const prims: Prim[] = [rect(x, y, w, h, s.base)];
  if (w >= 3 && !options.noRight) prims.push(rect(x + w - 1, y, 1, h, s.shadow));
  if (h >= 3 && !options.noBottom) prims.push(rect(x, y + h - 1, w, 1, s.shadow));
  if (w >= 3 && !options.softLeft) {
    const top = options.softTop || h < 3 ? y : y + 1;
    const bottom = options.noBottom || h < 3 ? y + h : y + h - 1;
    if (bottom > top) prims.push(rect(x, top, 1, bottom - top, s.light));
  }
  if (h >= 3 && !options.softTop) {
    const left = options.softLeft || w < 3 ? x : x + 1;
    const right = options.noRight || w < 3 ? x + w : x + w - 1;
    if (right > left) prims.push(rect(left, y, right - left, 1, s.light));
  }
  return prims;
}

/** A horizontal band (belt, hem, bevel): lit on top, shadowed underneath. */
export function shadedBand(x: number, y: number, w: number, h: number, s: Shade3): Prim[] {
  if (w <= 0 || h <= 0) return [];
  const prims: Prim[] = [rect(x, y, w, h, s.base)];
  if (h >= 2) prims.push(rect(x, y, w, 1, s.light), rect(x, y + h - 1, w, 1, s.shadow));
  return prims;
}

export interface Layer {
  readonly name: string;
  readonly prims: readonly Prim[];
  /** Per-frame translate; this is how bob and swing reach the compositor. */
  readonly dx?: number;
  readonly dy?: number;
  /** Mirror this layer about the canvas seam before compositing. */
  readonly mirror?: boolean;
}

export interface Sketch {
  readonly width: number;
  readonly height: number;
  readonly anchors?: Readonly<Record<string, Point>>;
  readonly layers: readonly Layer[];
}

export const layer = (name: string, prims: readonly Prim[], dx = 0, dy = 0): Layer => ({
  name,
  prims,
  dx,
  dy,
});

const round = (v: number): number => Math.round(v);

function drawLine(grid: PixelGrid, x0: number, y0: number, x1: number, y1: number, c: number): void {
  let x = round(x0);
  let y = round(y0);
  const ex = round(x1);
  const ey = round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard += 1) {
    gridSet(grid, x, y, c);
    if (x === ex && y === ey) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawPrim(grid: PixelGrid, prim: Prim, dx: number, dy: number, mirror: boolean): void {
  const mapX = (x: number, w: number): number => (mirror ? grid.width - (round(x) + w) : round(x));
  switch (prim.kind) {
    case "pixel":
      gridSet(grid, mapX(prim.x + dx, 1), round(prim.y + dy), prim.color);
      return;
    case "rect": {
      const w = round(prim.w);
      const h = round(prim.h);
      if (w <= 0 || h <= 0) return;
      const x0 = mapX(prim.x + dx, w);
      const y0 = round(prim.y + dy);
      for (let y = y0; y < y0 + h; y += 1) {
        for (let x = x0; x < x0 + w; x += 1) gridSet(grid, x, y, prim.color);
      }
      return;
    }
    case "frame": {
      const x0 = mapX(prim.x + dx, round(prim.w));
      const y0 = round(prim.y + dy);
      const w = round(prim.w);
      const h = round(prim.h);
      for (let x = x0; x < x0 + w; x += 1) {
        gridSet(grid, x, y0, prim.color);
        gridSet(grid, x, y0 + h - 1, prim.color);
      }
      for (let y = y0; y < y0 + h; y += 1) {
        gridSet(grid, x0, y, prim.color);
        gridSet(grid, x0 + w - 1, y, prim.color);
      }
      return;
    }
    case "line": {
      if (mirror) {
        drawLine(
          grid,
          grid.width - 1 - (prim.x0 + dx),
          prim.y0 + dy,
          grid.width - 1 - (prim.x1 + dx),
          prim.y1 + dy,
          prim.color,
        );
      } else {
        drawLine(grid, prim.x0 + dx, prim.y0 + dy, prim.x1 + dx, prim.y1 + dy, prim.color);
      }
      return;
    }
    case "dither": {
      const x0 = mapX(prim.x + dx, round(prim.w));
      const y0 = round(prim.y + dy);
      const phase = prim.phase ?? 0;
      for (let y = y0; y < y0 + round(prim.h); y += 1) {
        for (let x = x0; x < x0 + round(prim.w); x += 1) {
          if (((x + y + phase) & 1) === 0) gridSet(grid, x, y, prim.color);
        }
      }
      return;
    }
    case "patch": {
      const x0 = mapX(prim.x + dx, round(prim.w));
      const y0 = round(prim.y + dy);
      const phase = prim.phase ?? 0;
      for (let y = y0; y < y0 + round(prim.h); y += 1) {
        for (let x = x0; x < x0 + round(prim.w); x += 1) {
          if (ditherAt(prim.pattern, x, y, phase)) gridSet(grid, x, y, prim.color);
        }
      }
      return;
    }
    case "stamp": {
      const g = prim.glyph;
      const x0 = mapX(prim.x + dx, g.w);
      const y0 = round(prim.y + dy);
      for (let y = 0; y < g.h; y += 1) {
        for (let x = 0; x < g.w; x += 1) {
          const v = g.data[y * g.w + x] ?? TRANSPARENT;
          if (v === TRANSPARENT) continue;
          gridSet(grid, x0 + (mirror ? g.w - 1 - x : x), y0 + y, v);
        }
      }
      return;
    }
  }
}

export function rasterize(sketch: Sketch): PixelGrid {
  const grid = createGrid(sketch.width, sketch.height);
  for (const l of sketch.layers) {
    const dx = l.dx ?? 0;
    const dy = l.dy ?? 0;
    for (const prim of l.prims) drawPrim(grid, prim, dx, dy, l.mirror ?? false);
  }
  return grid;
}

/** Mirror about the canvas seam: column c maps to width-1-c. */
export function mirrorGrid(grid: PixelGrid): PixelGrid {
  const out = createGrid(grid.width, grid.height);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      out.data[y * grid.width + (grid.width - 1 - x)] = grid.data[y * grid.width + x] ?? 0;
    }
  }
  return out;
}

/** Paint `top` over `base` (transparent pixels of `top` keep `base`). */
export function overlayGrid(base: PixelGrid, top: PixelGrid): PixelGrid {
  const out = cloneGrid(base);
  for (let i = 0; i < top.data.length; i += 1) {
    const v = top.data[i] ?? 0;
    if (v !== TRANSPARENT) out.data[i] = v;
  }
  return out;
}

export function blitGrid(target: PixelGrid, source: PixelGrid, ox: number, oy: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const v = source.data[y * source.width + x] ?? 0;
      if (v !== TRANSPARENT) gridSet(target, ox + x, oy + y, v);
    }
  }
}

export interface OutlineOptions {
  /** Rows below this are never outlined (keeps the sub-floor band clean). */
  readonly maxY?: number;
  readonly color?: number;
}

/**
 * A grid holding only the silhouette outline of `grid`: 8-connected so it is
 * closed, `soot-900` except where an emissive neighbor turns it into that
 * element's halo color.
 */
export function outlineGrid(grid: PixelGrid, options: OutlineOptions = {}): PixelGrid {
  const maxY = options.maxY ?? grid.height - 1;
  const color = options.color ?? OUTLINE_INDEX;
  const out = createGrid(grid.width, grid.height);
  for (let y = 0; y <= Math.min(maxY, grid.height - 1); y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (gridGet(grid, x, y) !== TRANSPARENT) continue;
      let touching = false;
      let halo = 0;
      for (let ny = -1; ny <= 1 && !halo; ny += 1) {
        for (let nx = -1; nx <= 1; nx += 1) {
          if (nx === 0 && ny === 0) continue;
          const v = gridGet(grid, x + nx, y + ny);
          if (v === TRANSPARENT) continue;
          touching = true;
          if ((nx === 0 || ny === 0) && HALO_BY_INDEX.has(v)) {
            halo = HALO_BY_INDEX.get(v) as number;
            break;
          }
        }
      }
      if (touching) gridSet(out, x, y, halo || color);
    }
  }
  return out;
}

export function histogram(grid: PixelGrid): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of grid.data) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

export function opaqueCount(grid: PixelGrid): number {
  let n = 0;
  for (const v of grid.data) if (v !== TRANSPARENT) n += 1;
  return n;
}

export function distinctColors(grid: PixelGrid): Set<number> {
  const set = new Set<number>();
  for (const v of grid.data) if (v !== TRANSPARENT) set.add(v);
  return set;
}

/**
 * Same-color 8-connected regions, smallest first. Appendix C.2 forbids orphan
 * clusters of shading steps, so this is how a test can see them. Connectivity
 * is 8-way because a 1px diagonal highlight along a tapered limb is a cluster
 * to the eye; only a pixel with no same-colored neighbor at all is an orphan.
 */
export function colorClusters(grid: PixelGrid): { color: number; size: number }[] {
  const seen = new Uint8Array(grid.data.length);
  const out: { color: number; size: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < grid.data.length; start += 1) {
    const color = grid.data[start] ?? TRANSPARENT;
    if (color === TRANSPARENT || seen[start]) continue;
    let size = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const at = stack.pop() as number;
      size += 1;
      const x = at % grid.width;
      const y = (at - x) / grid.width;
      const push = (nx: number, ny: number): void => {
        if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) return;
        const ni = ny * grid.width + nx;
        if (seen[ni] || grid.data[ni] !== color) return;
        seen[ni] = 1;
        stack.push(ni);
      };
      for (let ny = -1; ny <= 1; ny += 1) {
        for (let nx = -1; nx <= 1; nx += 1) {
          if (nx !== 0 || ny !== 0) push(x + nx, y + ny);
        }
      }
    }
    out.push({ color, size });
  }
  return out.sort((a, b) => a.size - b.size);
}

/** Tight bounds of the non-transparent pixels, or null for an empty grid. */
export function gridBounds(
  grid: PixelGrid,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = grid.width;
  let y0 = grid.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (gridGet(grid, x, y) === TRANSPARENT) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

const rgbOf = (hex: Hex): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const RGB_TABLE: readonly (readonly [number, number, number] | null)[] = INDEXED_PALETTE.map(
  (hex) => (hex === null ? null : rgbOf(hex)),
);

/** Anything ImageData-shaped: `{ data, width }`. Keeps the engine DOM-free. */
export interface RGBATarget {
  readonly data: Uint8ClampedArray;
  readonly width: number;
}

export function writeGridToImageData(
  target: RGBATarget,
  grid: PixelGrid,
  originX = 0,
  originY = 0,
  scale = 1,
): void {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const rgb = RGB_TABLE[grid.data[y * grid.width + x] ?? 0] ?? null;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const tx = originX + x * scale + sx;
          const ty = originY + y * scale + sy;
          const at = (ty * target.width + tx) * 4;
          if (rgb === null) {
            target.data[at] = 0;
            target.data[at + 1] = 0;
            target.data[at + 2] = 0;
            target.data[at + 3] = 0;
            continue;
          }
          target.data[at] = rgb[0];
          target.data[at + 1] = rgb[1];
          target.data[at + 2] = rgb[2];
          target.data[at + 3] = 255;
        }
      }
    }
  }
}

export function gridToRGBA(grid: PixelGrid, scale = 1): Uint8ClampedArray {
  const target: RGBATarget = {
    data: new Uint8ClampedArray(grid.width * scale * grid.height * scale * 4),
    width: grid.width * scale,
  };
  writeGridToImageData(target, grid, 0, 0, scale);
  return target.data;
}
