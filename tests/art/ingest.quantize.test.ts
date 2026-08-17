import { describe, expect, it } from "vitest";
import { JOB_ART, jobFrame, tintIndices } from "../../src/art/jobs.js";
import {
  AMBER_BUDGET,
  MAX_FRAME_COLORS,
  auditGrid,
  formatReport,
  quantizeToPalette,
  retint,
} from "../../src/art/ingest.js";
import { PALETTE, RAMPS } from "../../src/art/palette.js";
import {
  INDEXED_PALETTE,
  OUTLINE_INDEX,
  TRANSPARENT,
  distinctColors,
  histogram,
  opaqueCount,
  paletteIndex,
  type PixelGrid,
} from "../../src/art/pixel.js";
import { decodePNG } from "../../src/art/png.js";
import { cutMaster, defaultRegionMap, SEGMENT_NAMES } from "../../src/art/segments.js";
import { FIGURE_BOX_BOTTOM, SPRITE_HEIGHT, SPRITE_WIDTH } from "../../src/art/sprites.js";
import { pngOf } from "./ingestSuite.js";

describe("quantization", () => {
  const master = jobFrame({ jobId: "enforcer", team: "player", state: "idle", view: "se", frame: 0 });

  it("snaps off-palette colors back and says how far each moved", () => {
    const drifted = decodePNG(pngOf(master, 1));
    const { grid, report } = quantizeToPalette(drifted);
    expect(Array.from(grid.data)).toEqual(Array.from(master.data));
    expect(report.movedCount).toBeGreaterThan(0);
    expect(report.maxDistance).toBeGreaterThan(0);
    expect(report.maxDistance).toBeLessThan(30);
    expect(report.ok, formatReport(report, "drifted")).toBe(true);
  });

  it("leaves an already-conformant master untouched and reports zero movement", () => {
    const { grid, report } = quantizeToPalette(decodePNG(pngOf(master)));
    expect(Array.from(grid.data)).toEqual(Array.from(master.data));
    expect(report.movedCount).toBe(0);
    expect(report.farMoves).toEqual([]);
    expect(report.colorCount).toBeLessThanOrEqual(MAX_FRAME_COLORS);
  });

  it("has a warm-neutral step for flesh, so faces stop landing on metal or grey", () => {
    // The tones an outside master paints skin with, from the generator briefs.
    const flesh = ["#cbb097", "#b79a7c", "#8d7358", "#e0cbad"];
    for (const hex of flesh) {
      const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
        number,
        number,
        number,
      ];
      const source = { width: 1, height: 1, data: new Uint8ClampedArray([r, g, b, 255]) };
      const { grid } = quantizeToPalette(source);
      const landed = INDEXED_PALETTE[grid.data[0] ?? 0];
      expect(RAMPS.bone as readonly string[], `${hex} -> ${landed}`).toContain(landed);
    }
  });

  it("reports violations instead of repairing them", () => {
    // A master with a hole punched in the torso: the outline is now open.
    const holed: PixelGrid = { ...master, data: Uint8Array.from(master.data) };
    for (let y = 40; y < 48; y += 1) {
      for (let x = 28; x < 36; x += 1) holed.data[y * SPRITE_WIDTH + x] = TRANSPARENT;
    }
    const report = auditGrid(holed);
    expect(report.ok).toBe(false);
    expect(report.outlineGaps.length).toBeGreaterThan(0);
    // The grid is not modified: reporting is the whole contract.
    expect(holed.data[42 * SPRITE_WIDTH + 30]).toBe(TRANSPARENT);
    expect(formatReport(report, "holed")).toContain("REJECTED");
  });

  it("flags an over-budget amber master rather than dimming it", () => {
    const lit: PixelGrid = { ...master, data: Uint8Array.from(master.data) };
    const amber = paletteIndex(PALETTE["amber-500"]);
    let painted = 0;
    for (let i = 0; i < lit.data.length && painted <= AMBER_BUDGET + 20; i += 1) {
      if (lit.data[i] === TRANSPARENT || lit.data[i] === OUTLINE_INDEX) continue;
      lit.data[i] = amber;
      painted += 1;
    }
    const report = auditGrid(lit);
    expect(report.amberPixels).toBeGreaterThan(AMBER_BUDGET);
    expect(report.errors.join(" ")).toContain("amber");
  });

  it("warns when drift is wide enough to change a decision", () => {
    // soot-900 and umber-900 are ~12 units apart; a master whose blacks wander
    // further than half that has its *outline* reassigned, and every downstream
    // check then fails for the wrong reason. The quantizer says so.
    const { report } = quantizeToPalette(decodePNG(pngOf(master, 4)));
    expect(report.ambiguous.length).toBeGreaterThan(0);
    expect(report.warnings.join(" ")).toContain("margin smaller than the move");
    expect(report.ambiguous.some((p) => p.runnerUp === PALETTE["soot-900"] || p.to === PALETTE["soot-900"])).toBe(true);
    expect(formatReport(report, "drifted")).toContain("ambiguous");
  });

  it("honors an allowed palette subset, so a job's twelve colors stay put", () => {
    const subset = [PALETTE["soot-900"], PALETTE["soot-500"], PALETTE["soot-300"]];
    const { grid } = quantizeToPalette(decodePNG(pngOf(master, 4)), { allowed: subset });
    const used = [...distinctColors(grid)].map((index) => INDEXED_PALETTE[index]);
    expect(new Set(used)).toEqual(new Set(subset));
  });

  it("swaps only the tint indices when retinting", () => {
    const player = jobFrame({ jobId: "saboteur", team: "player", state: "idle", view: "se", frame: 0 });
    const enemy = jobFrame({ jobId: "saboteur", team: "enemy", state: "idle", view: "se", frame: 0 });
    const swapped = retint(
      player,
      [tintIndices("player").base, tintIndices("player").shadow],
      [tintIndices("enemy").base, tintIndices("enemy").shadow],
    );
    expect(Array.from(swapped.data)).toEqual(Array.from(enemy.data));
  });
});

describe("segmentation", () => {
  it("partitions the canvas without overlap and claims every body pixel", () => {
    const build = JOB_ART.enforcer.build;
    const map = defaultRegionMap(build, "se", { state: "idle", frame: 0 });
    const names = map.segments.map((s) => s.name);
    expect(new Set(names)).toEqual(new Set(SEGMENT_NAMES.filter((n) => n !== "prop")));

    const seen = new Uint8Array(SPRITE_WIDTH * SPRITE_HEIGHT);
    for (const segment of map.segments) {
      for (let y = segment.rect.y; y < segment.rect.y + segment.rect.h; y += 1) {
        for (let x = segment.rect.x; x < segment.rect.x + segment.rect.w; x += 1) {
          expect(seen[y * SPRITE_WIDTH + x], `${segment.name} overlaps at ${x},${y}`).toBe(0);
          seen[y * SPRITE_WIDTH + x] = 1;
        }
      }
    }
    for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        expect(seen[y * SPRITE_WIDTH + x], `row ${y} col ${x} uncovered`).toBe(1);
      }
    }
  });

  it("drops the master's outline on the way in, so it can be re-derived", () => {
    const grid = jobFrame({ jobId: "enforcer", team: "player", state: "idle", view: "se", frame: 0 });
    const map = defaultRegionMap(JOB_ART.enforcer.build, "se", { state: "idle", frame: 0 });
    const pieces = cutMaster(grid, map);
    for (const piece of pieces) {
      for (const pixel of piece.pixels) expect(pixel.value).not.toBe(OUTLINE_INDEX);
    }
    const kept = pieces.reduce((n, piece) => n + piece.pixels.length, 0);
    const outline = histogram(grid).get(OUTLINE_INDEX) ?? 0;
    expect(kept).toBe(opaqueCount(grid) - outline);
  });
});
