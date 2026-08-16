import { describe, expect, it } from "vitest";
import { OUTLINE_COLOR, PALETTE, PALETTE_SIZE, SOOT_500, AMBER_500, AMBER_GLOW } from "../../src/art/palette.js";
import {
  INDEXED_PALETTE,
  OUTLINE_INDEX,
  TRANSPARENT,
  blitGrid,
  cloneGrid,
  colorAt,
  createGrid,
  distinctColors,
  dither,
  gridBounds,
  gridGet,
  gridSet,
  gridToRGBA,
  histogram,
  isEmissiveIndex,
  line,
  mirrorGrid,
  opaqueCount,
  outlineGrid,
  overlayGrid,
  paletteIndex,
  px,
  rasterize,
  rect,
  writeGridToImageData,
  type Layer,
} from "../../src/art/pixel.js";

const SOOT = paletteIndex(SOOT_500);
const AMBER = paletteIndex(AMBER_500);

const sketch = (layers: Layer[], width = 8, height = 8) => rasterize({ width, height, layers });

describe("palette indexing", () => {
  it("reserves index 0 for transparent and maps every palette color", () => {
    expect(TRANSPARENT).toBe(0);
    expect(INDEXED_PALETTE).toHaveLength(PALETTE_SIZE + 1);
    expect(INDEXED_PALETTE[0]).toBeNull();
    for (const hex of Object.values(PALETTE)) {
      const index = paletteIndex(hex);
      expect(index).toBeGreaterThan(0);
      expect(colorAt(index)).toBe(hex);
    }
  });

  it("rejects off-palette color", () => {
    expect(() => paletteIndex("#123456")).toThrow(/off-palette/);
  });

  it("knows the emissive ramps and nothing else", () => {
    expect(isEmissiveIndex(paletteIndex(AMBER_500))).toBe(true);
    expect(isEmissiveIndex(paletteIndex(AMBER_GLOW))).toBe(true);
    expect(isEmissiveIndex(paletteIndex(SOOT_500))).toBe(false);
    expect(isEmissiveIndex(TRANSPARENT)).toBe(false);
  });
});

describe("grid", () => {
  it("creates the requested dimensions, all transparent", () => {
    const grid = createGrid(32, 48);
    expect(grid.width).toBe(32);
    expect(grid.height).toBe(48);
    expect(grid.data).toHaveLength(32 * 48);
    expect(opaqueCount(grid)).toBe(0);
  });

  it("ignores writes outside the canvas and reads them as transparent", () => {
    const grid = createGrid(4, 4);
    gridSet(grid, -1, 0, SOOT);
    gridSet(grid, 4, 0, SOOT);
    gridSet(grid, 0, 9, SOOT);
    expect(opaqueCount(grid)).toBe(0);
    expect(gridGet(grid, -3, 2)).toBe(TRANSPARENT);
  });

  it("clones without aliasing", () => {
    const grid = createGrid(2, 2);
    gridSet(grid, 0, 0, SOOT);
    const copy = cloneGrid(grid);
    gridSet(copy, 1, 1, SOOT);
    expect(gridGet(grid, 1, 1)).toBe(TRANSPARENT);
  });
});

describe("primitives", () => {
  it("draws pixels, rects and clipped rects", () => {
    const grid = sketch([{ name: "a", prims: [px(1, 1, SOOT), rect(4, 4, 10, 10, AMBER)] }]);
    expect(gridGet(grid, 1, 1)).toBe(SOOT);
    expect(gridGet(grid, 7, 7)).toBe(AMBER);
    expect(gridGet(grid, 0, 0)).toBe(TRANSPARENT);
  });

  it("draws lines endpoint to endpoint", () => {
    const grid = sketch([{ name: "l", prims: [line(0, 0, 7, 7, SOOT)] }]);
    for (let i = 0; i < 8; i += 1) expect(gridGet(grid, i, i)).toBe(SOOT);
  });

  it("dithers a 50% checker", () => {
    const grid = sketch([{ name: "d", prims: [dither(0, 0, 8, 8, SOOT)] }]);
    expect(opaqueCount(grid)).toBe(32);
    expect(gridGet(grid, 0, 0)).toBe(SOOT);
    expect(gridGet(grid, 1, 0)).toBe(TRANSPARENT);
  });

  it("composites later layers over earlier ones", () => {
    const grid = sketch([
      { name: "under", prims: [rect(0, 0, 8, 8, SOOT)] },
      { name: "over", prims: [rect(0, 0, 4, 4, AMBER)] },
    ]);
    expect(gridGet(grid, 0, 0)).toBe(AMBER);
    expect(gridGet(grid, 5, 5)).toBe(SOOT);
  });

  it("applies per-layer translation", () => {
    const grid = sketch([{ name: "moved", prims: [px(0, 0, SOOT)], dx: 3, dy: 2 }]);
    expect(gridGet(grid, 3, 2)).toBe(SOOT);
    expect(gridGet(grid, 0, 0)).toBe(TRANSPARENT);
  });

  it("mirrors a layer about the canvas seam", () => {
    const plain = sketch([{ name: "p", prims: [rect(1, 0, 2, 1, SOOT)] }]);
    const flipped = sketch([{ name: "p", prims: [rect(1, 0, 2, 1, SOOT)], mirror: true }]);
    expect(flipped).toEqual(mirrorGrid(plain));
  });
});

describe("mirroring", () => {
  it("maps column c to width-1-c and is its own inverse", () => {
    const grid = sketch([{ name: "a", prims: [px(0, 3, SOOT), px(2, 5, AMBER)] }]);
    const flipped = mirrorGrid(grid);
    expect(gridGet(flipped, 7, 3)).toBe(SOOT);
    expect(gridGet(flipped, 5, 5)).toBe(AMBER);
    expect(mirrorGrid(flipped)).toEqual(grid);
  });
});

describe("outline pass", () => {
  it("wraps the silhouette in soot-900, 8-connected and closed", () => {
    const body = sketch([{ name: "b", prims: [rect(3, 3, 2, 2, SOOT)] }]);
    const outline = outlineGrid(body);
    expect(OUTLINE_INDEX).toBe(paletteIndex(OUTLINE_COLOR));
    expect(gridGet(outline, 2, 2)).toBe(OUTLINE_INDEX);
    expect(gridGet(outline, 5, 5)).toBe(OUTLINE_INDEX);
    expect(gridGet(outline, 3, 3)).toBe(TRANSPARENT);
    expect(opaqueCount(outline)).toBe(4 * 4 - 2 * 2);
  });

  it("gives emissive elements a halo instead of a black edge", () => {
    const body = sketch([{ name: "b", prims: [px(4, 4, AMBER)] }]);
    const outline = outlineGrid(body);
    expect(gridGet(outline, 3, 4)).toBe(paletteIndex(AMBER_GLOW));
    expect(gridGet(outline, 4, 3)).toBe(paletteIndex(AMBER_GLOW));
  });

  it("never writes below maxY", () => {
    const body = sketch([{ name: "b", prims: [rect(3, 3, 2, 2, SOOT)] }]);
    const outline = outlineGrid(body, { maxY: 4 });
    for (let x = 0; x < 8; x += 1) expect(gridGet(outline, x, 5)).toBe(TRANSPARENT);
  });
});

describe("composition helpers", () => {
  it("overlays only non-transparent pixels", () => {
    const base = sketch([{ name: "a", prims: [rect(0, 0, 8, 8, SOOT)] }]);
    const top = sketch([{ name: "b", prims: [px(1, 1, AMBER)] }]);
    const merged = overlayGrid(base, top);
    expect(gridGet(merged, 1, 1)).toBe(AMBER);
    expect(gridGet(merged, 2, 2)).toBe(SOOT);
  });

  it("blits a sub-grid at an offset", () => {
    const sheet = createGrid(16, 16);
    const cell = sketch([{ name: "c", prims: [px(0, 0, AMBER)] }], 4, 4);
    blitGrid(sheet, cell, 8, 4);
    expect(gridGet(sheet, 8, 4)).toBe(AMBER);
  });

  it("reports histogram, distinct colors and bounds", () => {
    const grid = sketch([{ name: "a", prims: [rect(2, 3, 2, 2, SOOT), px(6, 6, AMBER)] }]);
    expect(histogram(grid).get(SOOT)).toBe(4);
    expect([...distinctColors(grid)].sort()).toEqual([SOOT, AMBER].sort());
    expect(gridBounds(grid)).toEqual({ x0: 2, y0: 3, x1: 6, y1: 6 });
    expect(gridBounds(createGrid(4, 4))).toBeNull();
  });
});

describe("rgba output", () => {
  it("writes opaque palette colors and transparent zeros", () => {
    const grid = sketch([{ name: "a", prims: [px(0, 0, SOOT)] }], 2, 1);
    const data = gridToRGBA(grid);
    expect([...data.slice(0, 4)]).toEqual([0x4a, 0x54, 0x5f, 255]);
    expect([...data.slice(4, 8)]).toEqual([0, 0, 0, 0]);
  });

  it("scales by an integer factor", () => {
    const grid = sketch([{ name: "a", prims: [px(0, 0, SOOT)] }], 1, 1);
    const target = { data: new Uint8ClampedArray(3 * 3 * 4), width: 3 };
    writeGridToImageData(target, grid, 0, 0, 3);
    expect(target.data[0]).toBe(0x4a);
    expect(target.data[(2 * 3 + 2) * 4 + 3]).toBe(255);
  });
});

describe("determinism", () => {
  it("produces identical grids for identical input", () => {
    const build = () => sketch([{ name: "a", prims: [rect(1, 1, 4, 4, SOOT), line(0, 7, 7, 0, AMBER)] }]);
    expect(build().data).toEqual(build().data);
  });
});
