// Sheet assembly: one 256x576 palette-index grid per job/team, laid out in the
// 8-column x 12-row (state, view) order frozen in `sprites.ts`. The manifest is
// derived from that layout, so a frame's address can never drift from the
// frame tables.

import type { Team } from "../data/schemas/common.js";
import { jobFrame, type JobId } from "./jobs.js";
import { blitGrid, createGrid, type PixelGrid } from "./pixel.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  SHEET_LAYOUT,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  sheetRect,
  sheetRowIndex,
  type AnimState,
  type DrawnView,
} from "./sprites.js";

export interface SheetCell {
  readonly state: AnimState;
  readonly view: DrawnView;
  readonly frame: number;
  readonly row: number;
  readonly column: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const buildManifest = (): readonly SheetCell[] => {
  const cells: SheetCell[] = [];
  for (const state of ANIM_STATES) {
    for (const view of DRAWN_VIEWS) {
      for (let frame = 0; frame < ANIMATIONS[state].frames; frame += 1) {
        const r = sheetRect(state, view, frame);
        cells.push({
          state,
          view,
          frame,
          row: sheetRowIndex(state, view),
          column: frame,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
        });
      }
    }
  }
  return cells;
};

/** Every drawn frame on a job sheet, in row-major order. 56 cells. */
export const SHEET_MANIFEST: readonly SheetCell[] = buildManifest();

const MANIFEST_INDEX = new Map<string, SheetCell>(
  SHEET_MANIFEST.map((cell) => [`${cell.state}:${cell.view}:${cell.frame}`, cell]),
);

export function sheetCell(state: AnimState, view: DrawnView, frame: number): SheetCell {
  const cell = MANIFEST_INDEX.get(`${state}:${view}:${frame}`);
  if (!cell) throw new RangeError(`no sheet cell for ${state}/${view}/${frame}`);
  return cell;
}

/** Inverse of `sheetCell`: which frame lives at a sheet pixel. */
export function cellAtPixel(x: number, y: number): SheetCell | null {
  const column = Math.floor(x / SPRITE_WIDTH);
  const row = Math.floor(y / SPRITE_HEIGHT);
  return (
    SHEET_MANIFEST.find((cell) => cell.row === row && cell.column === column) ?? null
  );
}

export const sheetKey = (jobId: JobId, team: Team): string => `${jobId}:${team}`;

/** The whole sheet as one palette-index grid. Deterministic. */
export function buildJobSheet(jobId: JobId, team: Team): PixelGrid {
  const sheet = createGrid(SHEET_LAYOUT.width, SHEET_LAYOUT.height);
  for (const cell of SHEET_MANIFEST) {
    const grid = jobFrame({ jobId, team, state: cell.state, view: cell.view, frame: cell.frame });
    blitGrid(sheet, grid, cell.x, cell.y);
  }
  return sheet;
}

/** UV window for a cell, in the [0,1] space of the sheet texture. */
export interface CellUV {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly repeatX: number;
  readonly repeatY: number;
}

const REPEAT_X = SPRITE_WIDTH / SHEET_LAYOUT.width;
const REPEAT_Y = SPRITE_HEIGHT / SHEET_LAYOUT.height;

/**
 * Three.js UV origin is bottom-left, so rows count up from the bottom.
 * A mirrored view flips the window by negating the horizontal repeat.
 */
export function cellUV(cell: SheetCell, mirrored: boolean): CellUV {
  return {
    offsetX: mirrored ? (cell.column + 1) * REPEAT_X : cell.column * REPEAT_X,
    offsetY: 1 - (cell.row + 1) * REPEAT_Y,
    repeatX: mirrored ? -REPEAT_X : REPEAT_X,
    repeatY: REPEAT_Y,
  };
}
