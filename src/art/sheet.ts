// Sheet assembly: one 512x1152 palette-index grid per job/team, laid out in the
// 8-column x 12-row (state, view) order frozen in `sprites.ts`. The manifest is
// derived from that layout, so a frame's address can never drift from the
// frame tables.

import type { Team } from "../data/schemas/common.js";
import { externalJobSheet } from "./external.js";
import { jobFrame, type JobId } from "./jobs.js";
import { blitGrid, createGrid, gridToRGBA, type PixelGrid } from "./pixel.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  SHEET_LAYOUT,
  SPRITE_HEIGHT,
  SPRITE_TEXTURE_SCALE,
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

/**
 * The compositor's own sheet: 56 generated frames in the frozen layout. Every
 * job still has one — it is the placeholder that shipped before the masters
 * arrived, and it is what the frame tests assert against — but a job with a
 * delivered master does not ship it.
 */
export function compositeJobSheet(jobId: JobId, team: Team): PixelGrid {
  const sheet = createGrid(SHEET_LAYOUT.width, SHEET_LAYOUT.height);
  for (const cell of SHEET_MANIFEST) {
    const grid = jobFrame({ jobId, team, state: cell.state, view: cell.view, frame: cell.frame });
    blitGrid(sheet, grid, cell.x, cell.y);
  }
  return sheet;
}

/**
 * The whole sheet as one palette-index grid. Deterministic. A job with a
 * delivered external master gets it derived from that instead of composited —
 * the compositor output is a placeholder and loses to real art on sight.
 */
export function buildJobSheet(jobId: JobId, team: Team): PixelGrid {
  return externalJobSheet(jobId, team) ?? compositeJobSheet(jobId, team);
}

export interface TextureLevel {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major, top-left origin. */
  readonly data: Uint8ClampedArray;
}

/** One box-filter halving, averaging color weighted by alpha. */
function halve(level: TextureLevel): TextureLevel {
  const width = Math.max(1, level.width >> 1);
  const height = Math.max(1, level.height >> 1);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let taps = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = Math.min(level.width - 1, x * 2 + dx);
          const sy = Math.min(level.height - 1, y * 2 + dy);
          const at = (sy * level.width + sx) * 4;
          const alpha = level.data[at + 3] ?? 0;
          // Premultiplied: a transparent pixel must not drag the color toward
          // whatever happened to be stored in its unused RGB.
          r += (level.data[at] ?? 0) * alpha;
          g += (level.data[at + 1] ?? 0) * alpha;
          b += (level.data[at + 2] ?? 0) * alpha;
          a += alpha;
          taps += 1;
        }
      }
      const out = (y * width + x) * 4;
      data[out] = a === 0 ? 0 : r / a;
      data[out + 1] = a === 0 ? 0 : g / a;
      data[out + 2] = a === 0 ? 0 : b / a;
      data[out + 3] = a / taps;
    }
  }
  return { width, height, data };
}

/**
 * The shipped texture and its mip chain. Level 0 is the sheet at
 * `SPRITE_TEXTURE_SCALE` — a nearest enlargement for generated art, and real
 * detail once an external 128x192 master is ingested at that density — so a
 * zoomed-in camera has pixels to show. Every level below it is a box filter,
 * which is what keeps a far zoom from shimmering. The chain runs to 1x1 so the
 * texture is complete without the GPU generating anything.
 */
export function sheetTextureLevels(grid: PixelGrid, scale = SPRITE_TEXTURE_SCALE): TextureLevel[] {
  const levels: TextureLevel[] = [
    { width: grid.width * scale, height: grid.height * scale, data: gridToRGBA(grid, scale) },
  ];
  for (;;) {
    const last = levels[levels.length - 1] as TextureLevel;
    if (last.width === 1 && last.height === 1) return levels;
    levels.push(halve(last));
  }
}

/**
 * Rows bottom-up. WebGL ignores `UNPACK_FLIP_Y_WEBGL` for buffer uploads, so a
 * data texture has to arrive already flipped to keep `cellUV`'s bottom-left
 * origin honest.
 */
export function flipRows(level: TextureLevel): TextureLevel {
  const stride = level.width * 4;
  const data = new Uint8ClampedArray(level.data.length);
  for (let y = 0; y < level.height; y += 1) {
    data.set(level.data.subarray(y * stride, (y + 1) * stride), (level.height - 1 - y) * stride);
  }
  return { width: level.width, height: level.height, data };
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
