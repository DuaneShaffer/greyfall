import { describe, expect, it } from "vitest";
import { EXTERNAL_JOBS, externalArt, hasExternalArt } from "../../src/art/external.js";
import { JOB_IDS } from "../../src/art/jobs.js";
import { jobFrame } from "../../src/art/jobs.js";
import { TRANSPARENT, createGrid, gridGet, opaqueCount } from "../../src/art/pixel.js";
import {
  SHEET_MANIFEST,
  buildJobSheet,
  cellAtPixel,
  cellUV,
  flipRows,
  sheetCell,
  sheetKey,
  sheetTextureLevels,
} from "../../src/art/sheet.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  DRAWN_FRAMES_PER_JOB,
  SHEET_LAYOUT,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_TEXTURE_CELL,
  SPRITE_WIDTH,
  sheetRowIndex,
} from "../../src/art/sprites.js";

describe("manifest", () => {
  it("covers every drawn frame exactly once", () => {
    expect(SHEET_MANIFEST).toHaveLength(DRAWN_FRAMES_PER_JOB);
    const keys = SHEET_MANIFEST.map((c) => `${c.state}:${c.view}:${c.frame}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("addresses cells in the frozen row order", () => {
    for (const state of ANIM_STATES) {
      for (const view of DRAWN_VIEWS) {
        const row = sheetRowIndex(state, view);
        for (let frame = 0; frame < ANIMATIONS[state].frames; frame += 1) {
          const cell = sheetCell(state, view, frame);
          expect(cell.row).toBe(row);
          expect(cell.column).toBe(frame);
          expect(cell.x).toBe(frame * SPRITE_WIDTH);
          expect(cell.y).toBe(row * SPRITE_HEIGHT);
          expect(cell.w).toBe(SPRITE_WIDTH);
          expect(cell.h).toBe(SPRITE_HEIGHT);
        }
      }
    }
    expect(sheetRowIndex("idle", "se")).toBe(0);
    expect(sheetRowIndex("downed", "ne")).toBe(11);
  });

  it("round-trips a cell through its pixel address", () => {
    for (const cell of SHEET_MANIFEST) {
      expect(cellAtPixel(cell.x, cell.y)).toEqual(cell);
      expect(cellAtPixel(cell.x + SPRITE_WIDTH - 1, cell.y + SPRITE_HEIGHT - 1)).toEqual(cell);
    }
  });

  it("has no cell in the padding columns", () => {
    for (const state of ANIM_STATES) {
      for (let column = ANIMATIONS[state].frames; column < SHEET_LAYOUT.columns; column += 1) {
        expect(cellAtPixel(column * SPRITE_WIDTH, sheetRowIndex(state, "se") * SPRITE_HEIGHT)).toBeNull();
      }
    }
    expect(() => sheetCell("idle", "se", 4)).toThrow(RangeError);
  });
});

describe("assembly", () => {
  it("builds a 512x1152 sheet whose cells match the frame generator", () => {
    // A job the compositor still draws; jobs with a delivered master derive
    // their sheet instead, and `external` below covers that path.
    const sheet = buildJobSheet("machinist", "player");
    expect(sheet.width).toBe(512);
    expect(sheet.height).toBe(1152);
    expect(SHEET_LAYOUT.width).toBe(512);
    expect(SHEET_LAYOUT.height).toBe(1152);
    for (const cell of SHEET_MANIFEST) {
      const frame = jobFrame({
        jobId: "machinist",
        team: "player",
        state: cell.state,
        view: cell.view,
        frame: cell.frame,
      });
      for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
        for (let x = 0; x < SPRITE_WIDTH; x += 1) {
          if (gridGet(sheet, cell.x + x, cell.y + y) !== gridGet(frame, x, y)) {
            throw new Error(`mismatch at ${cell.state}/${cell.view}/${cell.frame} ${x},${y}`);
          }
        }
      }
    }
  });

  it("leaves the padding columns empty", () => {
    const sheet = buildJobSheet("enforcer", "enemy");
    for (const state of ANIM_STATES) {
      for (const view of DRAWN_VIEWS) {
        const row = sheetRowIndex(state, view);
        for (let column = ANIMATIONS[state].frames; column < SHEET_LAYOUT.columns; column += 1) {
          for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
            for (let x = 0; x < SPRITE_WIDTH; x += 1) {
              expect(
                gridGet(sheet, column * SPRITE_WIDTH + x, row * SPRITE_HEIGHT + y),
              ).toBe(TRANSPARENT);
            }
          }
        }
      }
    }
  });

  it("builds a non-empty sheet for every job and team", () => {
    for (const jobId of JOB_IDS) {
      for (const team of ["player", "enemy", "neutral"] as const) {
        expect(opaqueCount(buildJobSheet(jobId, team)), sheetKey(jobId, team)).toBeGreaterThan(2000);
      }
    }
  });

  it("is deterministic", () => {
    expect(buildJobSheet("saboteur", "neutral").data).toEqual(
      buildJobSheet("saboteur", "neutral").data,
    );
  });
});

describe("external masters", () => {
  it("derives the sheet from delivered art where there is any", () => {
    expect(EXTERNAL_JOBS.length).toBeGreaterThan(0);
    for (const jobId of EXTERNAL_JOBS) {
      expect(hasExternalArt(jobId)).toBe(true);
      const sheet = buildJobSheet(jobId, "player");
      const composited = jobFrame({
        jobId,
        team: "player",
        state: "idle",
        view: "se",
        frame: 0,
      });
      let same = 0;
      for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
        for (let x = 0; x < SPRITE_WIDTH; x += 1) {
          if (gridGet(sheet, x, y) === gridGet(composited, x, y)) same += 1;
        }
      }
      // The delivered art is not the compositor's placeholder for this job.
      expect(same / (SPRITE_WIDTH * SPRITE_HEIGHT), jobId).toBeLessThan(0.9);
    }
  });

  it("keeps the audit available at load, violations and all", () => {
    for (const jobId of EXTERNAL_JOBS) {
      const art = externalArt(jobId);
      expect(art, jobId).not.toBeNull();
      if (!art) continue;
      // Reports, never repairs: a rejected master still loads and still says so.
      expect(art.summary).toContain(jobId);
      expect(art.reports.se.figureBottom, jobId).toBe(SPRITE_ANCHOR.y - 1);
    }
  });

  it("caches, so a sheet is deterministic", () => {
    for (const jobId of EXTERNAL_JOBS) {
      expect(buildJobSheet(jobId, "enemy").data).toEqual(buildJobSheet(jobId, "enemy").data);
    }
  });
});

describe("texture levels", () => {
  const grid = createGrid(SPRITE_WIDTH, SPRITE_HEIGHT);
  for (let i = 0; i < grid.data.length; i += 1) grid.data[i] = (i % 7) + 1;

  it("ships level 0 at the declared density and halves to 1x1", () => {
    const levels = sheetTextureLevels(grid);
    expect(levels[0]?.width).toBe(SPRITE_TEXTURE_CELL.width);
    expect(levels[0]?.height).toBe(SPRITE_TEXTURE_CELL.height);
    expect(levels[1]?.width).toBe(SPRITE_WIDTH);
    expect(levels[1]?.height).toBe(SPRITE_HEIGHT);
    const last = levels[levels.length - 1];
    expect(last?.width).toBe(1);
    expect(last?.height).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      const above = levels[i - 1];
      const here = levels[i];
      expect(here?.width).toBe(Math.max(1, (above?.width ?? 0) >> 1));
      expect(here?.height).toBe(Math.max(1, (above?.height ?? 0) >> 1));
      expect(here?.data.length).toBe((here?.width ?? 0) * (here?.height ?? 0) * 4);
    }
  });

  it("leaves fully transparent regions transparent as it filters down", () => {
    const empty = createGrid(SPRITE_WIDTH, SPRITE_HEIGHT);
    for (const level of sheetTextureLevels(empty)) {
      for (let i = 3; i < level.data.length; i += 4) expect(level.data[i]).toBe(0);
    }
  });

  it("flips rows, which is how a data texture keeps cellUV honest", () => {
    const level = sheetTextureLevels(grid)[1];
    expect(level).toBeDefined();
    if (!level) return;
    const flipped = flipRows(level);
    const stride = level.width * 4;
    for (let i = 0; i < stride; i += 1) {
      expect(flipped.data[i]).toBe(level.data[(level.height - 1) * stride + i]);
    }
    expect(Array.from(flipRows(flipped).data)).toEqual(Array.from(level.data));
  });
});

describe("uv windows", () => {
  it("selects the cell and stays inside the texture", () => {
    for (const cell of SHEET_MANIFEST) {
      const uv = cellUV(cell, false);
      expect(uv.repeatX).toBeCloseTo(SPRITE_WIDTH / SHEET_LAYOUT.width);
      expect(uv.repeatY).toBeCloseTo(SPRITE_HEIGHT / SHEET_LAYOUT.height);
      expect(uv.offsetX).toBeGreaterThanOrEqual(0);
      expect(uv.offsetX + uv.repeatX).toBeLessThanOrEqual(1.0001);
      expect(uv.offsetY).toBeGreaterThanOrEqual(-0.0001);
      expect(uv.offsetY + uv.repeatY).toBeLessThanOrEqual(1.0001);
    }
  });

  it("mirrors by flipping the horizontal window", () => {
    const cell = sheetCell("walk", "ne", 3);
    const plain = cellUV(cell, false);
    const mirrored = cellUV(cell, true);
    expect(mirrored.repeatX).toBe(-plain.repeatX);
    expect(mirrored.offsetX).toBeCloseTo(plain.offsetX + plain.repeatX);
    expect(mirrored.offsetY).toBe(plain.offsetY);
  });

  it("puts row 0 at the top of the image", () => {
    const top = cellUV(sheetCell("idle", "se", 0), false);
    const bottom = cellUV(sheetCell("downed", "ne", 0), false);
    expect(top.offsetY).toBeGreaterThan(bottom.offsetY);
    expect(bottom.offsetY).toBeCloseTo(0);
  });
});
