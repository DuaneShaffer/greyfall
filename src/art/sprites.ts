import type { Facing } from "../data/schemas/common.js";
import { OUTLINE_COLOR } from "./palette.js";

export const SPRITE_WIDTH = 64;
export const SPRITE_HEIGHT = 96;

/**
 * Canvas pixels per rig unit. The armature of Appendix A.1 and every pose table
 * are authored in *units*, so the whole figure re-scales from this one number.
 * Shading rims stay 1 canvas pixel wide, which is what makes 64x96 a finer
 * drawing rather than a doubled one.
 */
export const RIG_UNIT = 2;

/** Feet-center. x=32 is the seam at the exact center of an even-width canvas. */
export const SPRITE_ANCHOR = { x: 32, y: 88 } as const;

/** Rows 0..FIGURE_BOX_BOTTOM hold the figure; the rest is the sub-floor band. */
export const FIGURE_BOX_BOTTOM = SPRITE_ANCHOR.y - 1;
export const SUB_FLOOR_BAND_HEIGHT = SPRITE_HEIGHT - SPRITE_ANCHOR.y;

/** Terrain's ruler. Tile textures did not get denser; only sprites did. */
export const TILE_TEXTURE_SIZE = 32;
export const HEIGHT_STEP_PX = 16;
export const HEIGHT_STEPS_PER_TILE = TILE_TEXTURE_SIZE / HEIGHT_STEP_PX;

/** The sprite ruler, deliberately split from the tile ruler. */
export const SPRITE_PIXELS_PER_TILE = 64;

/** Billboard quad size in world units (1 unit = 1 tile edge). */
export const BILLBOARD_WORLD_SIZE = {
  width: SPRITE_WIDTH / SPRITE_PIXELS_PER_TILE,
  height: SPRITE_HEIGHT / SPRITE_PIXELS_PER_TILE,
} as const;

/**
 * Shipped texture density: the sheet is rasterized at this multiple of the
 * master so a zoomed-in camera has real pixels to show, and the mip chain
 * below it carries the far zooms without shimmer (see `render/sprites.ts`).
 */
export const SPRITE_TEXTURE_SCALE = 2;
export const SPRITE_TEXTURE_CELL = {
  width: SPRITE_WIDTH * SPRITE_TEXTURE_SCALE,
  height: SPRITE_HEIGHT * SPRITE_TEXTURE_SCALE,
} as const;

export const TICKS_PER_SECOND = 60;

export const MAX_COLORS_PER_SPRITE = 12;
export const TEAM_TINT_INDEX_COUNT = 2;
export const SPRITE_OUTLINE_COLOR = OUTLINE_COLOR;

export type AnimState = "idle" | "walk" | "attack" | "cast" | "hurt" | "downed";

export const ANIM_STATES = [
  "idle",
  "walk",
  "attack",
  "cast",
  "hurt",
  "downed",
] as const satisfies readonly AnimState[];

export interface AnimClip {
  readonly state: AnimState;
  readonly frames: number;
  /** Per-frame duration in presentation ticks; length must equal `frames`. */
  readonly ticks: readonly number[];
  readonly loop: boolean;
  /** Final frame persists after the clip ends. */
  readonly holdLast: boolean;
  /** Inclusive frame range that repeats while a charged action waits, if any. */
  readonly holdLoop: readonly [number, number] | null;
}

export const ANIMATIONS = {
  idle: {
    state: "idle",
    frames: 4,
    ticks: [14, 14, 12, 14],
    loop: true,
    holdLast: false,
    holdLoop: null,
  },
  walk: {
    state: "walk",
    frames: 6,
    ticks: [6, 6, 6, 6, 6, 6],
    loop: true,
    holdLast: false,
    holdLoop: null,
  },
  attack: {
    state: "attack",
    frames: 5,
    ticks: [5, 5, 3, 6, 8],
    loop: false,
    holdLast: false,
    holdLoop: null,
  },
  cast: {
    state: "cast",
    frames: 6,
    ticks: [6, 6, 10, 10, 4, 8],
    loop: false,
    holdLast: false,
    holdLoop: [2, 3],
  },
  hurt: {
    state: "hurt",
    frames: 3,
    ticks: [4, 6, 8],
    loop: false,
    holdLast: false,
    holdLoop: null,
  },
  downed: {
    state: "downed",
    frames: 4,
    ticks: [5, 5, 7, 20],
    loop: false,
    holdLast: true,
    holdLoop: null,
  },
} as const satisfies Record<AnimState, AnimClip>;

export function clipDurationTicks(state: AnimState): number {
  return ANIMATIONS[state].ticks.reduce((a, b) => a + b, 0);
}

/** Frame index for an elapsed tick count, honoring loop / holdLast. */
export function frameAtTick(state: AnimState, tick: number): number {
  const clip = ANIMATIONS[state];
  const total = clipDurationTicks(state);
  let t = Math.max(0, Math.floor(tick));
  if (t >= total) {
    if (!clip.loop) return clip.frames - 1;
    t %= total;
  }
  for (let i = 0; i < clip.frames; i += 1) {
    const d = clip.ticks[i] ?? 0;
    if (t < d) return i;
    t -= d;
  }
  return clip.frames - 1;
}

/** The two views actually drawn by artists. */
export type DrawnView = "se" | "ne";
export const DRAWN_VIEWS = ["se", "ne"] as const satisfies readonly DrawnView[];

/** Apparent view after mirroring. */
export type ApparentView = "front-right" | "front-left" | "back-right" | "back-left";

export interface ViewSelection {
  readonly view: DrawnView;
  readonly mirrored: boolean;
}

export const APPARENT_VIEWS = {
  "front-right": { view: "se", mirrored: false },
  "front-left": { view: "se", mirrored: true },
  "back-right": { view: "ne", mirrored: false },
  "back-left": { view: "ne", mirrored: true },
} as const satisfies Record<ApparentView, ViewSelection>;

const FACING_INDEX = { north: 0, east: 1, south: 2, west: 3 } as const satisfies Record<
  Facing,
  number
>;

/** Camera sits over a map corner; index increases clockwise from SE. */
export type CameraYaw = 0 | 1 | 2 | 3;
export const CAMERA_YAW_CORNERS = ["se", "sw", "nw", "ne"] as const;

// The rig's yaw 0 hangs over the SE corner, which puts world north up and to
// the screen's right — so a north-facing unit shows its unmirrored back, and
// each facing step from there walks the apparent ring the same way round.
const RELATIVE_TO_APPARENT = [
  "back-right",
  "front-right",
  "front-left",
  "back-left",
] as const satisfies readonly ApparentView[];

export function apparentView(facing: Facing, cameraYaw: CameraYaw): ApparentView {
  const m = (FACING_INDEX[facing] - cameraYaw + 4) % 4;
  return RELATIVE_TO_APPARENT[m] as ApparentView;
}

export function drawnViewFor(facing: Facing, cameraYaw: CameraYaw): ViewSelection {
  return APPARENT_VIEWS[apparentView(facing, cameraYaw)];
}

export interface SheetRow {
  readonly state: AnimState;
  readonly view: DrawnView;
}

const SHEET_ROWS: readonly SheetRow[] = ANIM_STATES.flatMap((state) =>
  DRAWN_VIEWS.map((view) => ({ state, view })),
);

export const SHEET_LAYOUT = {
  columns: 8,
  rows: SHEET_ROWS.length,
  rowOrder: SHEET_ROWS,
  cellWidth: SPRITE_WIDTH,
  cellHeight: SPRITE_HEIGHT,
  width: 8 * SPRITE_WIDTH,
  height: SHEET_ROWS.length * SPRITE_HEIGHT,
} as const;

export function sheetRowIndex(state: AnimState, view: DrawnView): number {
  return ANIM_STATES.indexOf(state) * DRAWN_VIEWS.length + DRAWN_VIEWS.indexOf(view);
}

export interface SheetRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function sheetRect(state: AnimState, view: DrawnView, frame: number): SheetRect {
  const clip = ANIMATIONS[state];
  if (frame < 0 || frame >= clip.frames) {
    throw new RangeError(`${state} has ${clip.frames} frames; got ${frame}`);
  }
  return {
    x: frame * SPRITE_WIDTH,
    y: sheetRowIndex(state, view) * SPRITE_HEIGHT,
    w: SPRITE_WIDTH,
    h: SPRITE_HEIGHT,
  };
}

export const DRAWN_FRAMES_PER_VIEW = ANIM_STATES.reduce(
  (sum, state) => sum + ANIMATIONS[state].frames,
  0,
);
export const DRAWN_FRAMES_PER_JOB = DRAWN_FRAMES_PER_VIEW * DRAWN_VIEWS.length;

/** Painted, not pixel. See ART_DIRECTION §4. */
export const PORTRAIT = {
  style: "painted",
  width: 128,
  height: 160,
  /** Fraction from top where the subject's eyeline sits. */
  eyelineRatio: 0.38,
  facing: "viewer-right",
  mirrorable: false,
  chipCrop: { x: 32, y: 16, w: 64, h: 64 },
  chipSize: 32,
} as const;
