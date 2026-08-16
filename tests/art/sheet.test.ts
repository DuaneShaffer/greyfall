import { describe, expect, it } from "vitest";
import { JOB_IDS } from "../../src/art/jobs.js";
import { jobFrame } from "../../src/art/jobs.js";
import { TRANSPARENT, gridGet, opaqueCount } from "../../src/art/pixel.js";
import {
  SHEET_MANIFEST,
  buildJobSheet,
  cellAtPixel,
  cellUV,
  sheetCell,
  sheetKey,
} from "../../src/art/sheet.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  DRAWN_FRAMES_PER_JOB,
  SHEET_LAYOUT,
  SPRITE_HEIGHT,
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
  it("builds a 256x576 sheet whose cells match the frame generator", () => {
    const sheet = buildJobSheet("conduit", "player");
    expect(sheet.width).toBe(256);
    expect(sheet.height).toBe(576);
    expect(SHEET_LAYOUT.width).toBe(256);
    expect(SHEET_LAYOUT.height).toBe(576);
    for (const cell of SHEET_MANIFEST) {
      const frame = jobFrame({
        jobId: "conduit",
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
