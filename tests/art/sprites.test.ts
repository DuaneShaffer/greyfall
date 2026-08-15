import { describe, expect, it } from "vitest";
import {
  ANIMATIONS,
  ANIM_STATES,
  APPARENT_VIEWS,
  BILLBOARD_WORLD_SIZE,
  CAMERA_YAW_CORNERS,
  DRAWN_FRAMES_PER_JOB,
  DRAWN_FRAMES_PER_VIEW,
  DRAWN_VIEWS,
  FIGURE_BOX_BOTTOM,
  HEIGHT_STEP_PX,
  MAX_COLORS_PER_SPRITE,
  PIXELS_PER_TILE,
  PORTRAIT,
  SHEET_LAYOUT,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_OUTLINE_COLOR,
  SPRITE_WIDTH,
  SUB_FLOOR_BAND_HEIGHT,
  TICKS_PER_SECOND,
  TILE_TEXTURE_SIZE,
  apparentView,
  clipDurationTicks,
  frameAtTick,
  resolveFacing,
  sheetRect,
  sheetRowIndex,
  type CameraYaw,
} from "../../src/art/sprites.js";
import { PALETTE } from "../../src/art/palette.js";

const FACINGS = ["north", "east", "south", "west"] as const;
const YAWS: readonly CameraYaw[] = [0, 1, 2, 3];

describe("sprite canvas", () => {
  it("is 32x48 with a feet-center anchor inside the canvas", () => {
    expect(SPRITE_WIDTH).toBe(32);
    expect(SPRITE_HEIGHT).toBe(48);
    expect(SPRITE_ANCHOR.x).toBeGreaterThanOrEqual(0);
    expect(SPRITE_ANCHOR.x).toBeLessThan(SPRITE_WIDTH);
    expect(SPRITE_ANCHOR.y).toBeGreaterThanOrEqual(0);
    expect(SPRITE_ANCHOR.y).toBeLessThan(SPRITE_HEIGHT);
  });

  it("anchors on the horizontal center seam", () => {
    expect(SPRITE_ANCHOR.x).toBe(SPRITE_WIDTH / 2);
  });

  it("reserves a sub-floor band below the anchor", () => {
    expect(SUB_FLOOR_BAND_HEIGHT).toBe(4);
    expect(FIGURE_BOX_BOTTOM).toBe(SPRITE_ANCHOR.y - 1);
    expect(FIGURE_BOX_BOTTOM + 1 + SUB_FLOOR_BAND_HEIGHT).toBe(SPRITE_HEIGHT);
  });

  it("shares one ruler with the terrain", () => {
    expect(PIXELS_PER_TILE).toBe(TILE_TEXTURE_SIZE);
    expect(TILE_TEXTURE_SIZE / HEIGHT_STEP_PX).toBe(2);
    expect(SPRITE_WIDTH / PIXELS_PER_TILE).toBe(1);
    expect(SPRITE_HEIGHT / HEIGHT_STEP_PX).toBe(3);
    expect(BILLBOARD_WORLD_SIZE).toEqual({ width: 1, height: 1.5 });
  });

  it("uses soot-900 as the silhouette outline", () => {
    expect(SPRITE_OUTLINE_COLOR).toBe(PALETTE["soot-900"]);
    expect(MAX_COLORS_PER_SPRITE).toBe(12);
  });
});

describe("animation table", () => {
  it("declares exactly the six spec states", () => {
    expect([...ANIM_STATES]).toEqual(["idle", "walk", "attack", "cast", "hurt", "downed"]);
  });

  it("frame counts match the spec", () => {
    expect(ANIMATIONS.idle.frames).toBe(4);
    expect(ANIMATIONS.walk.frames).toBe(6);
    expect(ANIMATIONS.attack.frames).toBe(5);
    expect(ANIMATIONS.cast.frames).toBe(6);
    expect(ANIMATIONS.hurt.frames).toBe(3);
    expect(ANIMATIONS.downed.frames).toBe(4);
  });

  it("has one positive integer tick duration per frame", () => {
    for (const state of ANIM_STATES) {
      const clip = ANIMATIONS[state];
      expect(clip.state, state).toBe(state);
      expect(clip.ticks.length, state).toBe(clip.frames);
      for (const t of clip.ticks) {
        expect(Number.isInteger(t), `${state} tick ${t}`).toBe(true);
        expect(t, state).toBeGreaterThan(0);
      }
    }
  });

  it("only idle and walk loop; only downed holds its last frame", () => {
    const looping = ANIM_STATES.filter((s) => ANIMATIONS[s].loop);
    expect(looping).toEqual(["idle", "walk"]);
    const holding = ANIM_STATES.filter((s) => ANIMATIONS[s].holdLast);
    expect(holding).toEqual(["downed"]);
  });

  it("only cast declares a hold loop, and it is inside the clip", () => {
    for (const state of ANIM_STATES) {
      const clip = ANIMATIONS[state];
      if (state === "cast") {
        expect(clip.holdLoop).not.toBeNull();
        const [a, b] = clip.holdLoop as readonly [number, number];
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(clip.frames);
        expect(a).toBeLessThanOrEqual(b);
      } else {
        expect(clip.holdLoop, state).toBeNull();
      }
    }
  });

  it("walk covers one tile per 18 ticks", () => {
    expect(clipDurationTicks("walk")).toBe(36);
    expect(clipDurationTicks("walk") / 2 / TICKS_PER_SECOND).toBeCloseTo(0.3, 5);
  });

  it("frameAtTick walks the tick table and respects loop/hold", () => {
    expect(frameAtTick("walk", 0)).toBe(0);
    expect(frameAtTick("walk", 5)).toBe(0);
    expect(frameAtTick("walk", 6)).toBe(1);
    expect(frameAtTick("walk", 35)).toBe(5);
    expect(frameAtTick("walk", 36)).toBe(0);
    expect(frameAtTick("downed", 10_000)).toBe(ANIMATIONS.downed.frames - 1);
    expect(frameAtTick("attack", -5)).toBe(0);
    for (const state of ANIM_STATES) {
      const total = clipDurationTicks(state);
      for (let t = 0; t < total; t += 1) {
        const f = frameAtTick(state, t);
        expect(f, `${state}@${t}`).toBeGreaterThanOrEqual(0);
        expect(f, `${state}@${t}`).toBeLessThan(ANIMATIONS[state].frames);
      }
    }
  });
});

describe("facing derivation", () => {
  it("draws two views and mirrors to four", () => {
    expect([...DRAWN_VIEWS]).toEqual(["se", "ne"]);
    expect(Object.keys(APPARENT_VIEWS)).toHaveLength(4);
    expect(APPARENT_VIEWS["front-right"]).toEqual({ view: "se", mirrored: false });
    expect(APPARENT_VIEWS["front-left"]).toEqual({ view: "se", mirrored: true });
    expect(APPARENT_VIEWS["back-right"]).toEqual({ view: "ne", mirrored: false });
    expect(APPARENT_VIEWS["back-left"]).toEqual({ view: "ne", mirrored: true });
  });

  it("gives four distinct apparent views per camera yaw", () => {
    for (const yaw of YAWS) {
      const views = FACINGS.map((f) => apparentView(f, yaw));
      expect(new Set(views).size, `yaw ${yaw}`).toBe(4);
    }
  });

  it("gives four distinct apparent views per facing across yaws", () => {
    for (const facing of FACINGS) {
      const views = YAWS.map((y) => apparentView(facing, y));
      expect(new Set(views).size, facing).toBe(4);
    }
  });

  it("matches the documented SE-corner baseline at yaw 0", () => {
    expect(apparentView("south", 0)).toBe("front-right");
    expect(apparentView("east", 0)).toBe("front-left");
    expect(apparentView("west", 0)).toBe("back-right");
    expect(apparentView("north", 0)).toBe("back-left");
    expect(CAMERA_YAW_CORNERS[0]).toBe("se");
    expect([...CAMERA_YAW_CORNERS]).toEqual(["se", "sw", "nw", "ne"]);
  });

  it("rotating the camera one step rotates the apparent view one step", () => {
    for (const facing of FACINGS) {
      for (const yaw of YAWS) {
        const next = ((yaw + 1) % 4) as CameraYaw;
        const nextFacing = FACINGS[(FACINGS.indexOf(facing) + 1) % 4] as (typeof FACINGS)[number];
        expect(apparentView(nextFacing, next)).toBe(apparentView(facing, yaw));
      }
    }
  });

  it("resolveFacing yields exactly two front views and two back views per yaw", () => {
    for (const yaw of YAWS) {
      const selections = FACINGS.map((f) => resolveFacing(f, yaw));
      expect(selections.filter((s) => s.view === "se")).toHaveLength(2);
      expect(selections.filter((s) => s.view === "ne")).toHaveLength(2);
      expect(selections.filter((s) => s.mirrored)).toHaveLength(2);
    }
  });
});

describe("sheet layout", () => {
  it("has one row per (state, view) pair in fixed order", () => {
    expect(SHEET_LAYOUT.rows).toBe(ANIM_STATES.length * DRAWN_VIEWS.length);
    expect(SHEET_LAYOUT.rowOrder).toHaveLength(SHEET_LAYOUT.rows);
    SHEET_LAYOUT.rowOrder.forEach((row, i) => {
      expect(sheetRowIndex(row.state, row.view)).toBe(i);
    });
    expect(SHEET_LAYOUT.rowOrder[0]).toEqual({ state: "idle", view: "se" });
    expect(SHEET_LAYOUT.rowOrder[1]).toEqual({ state: "idle", view: "ne" });
  });

  it("is wide enough for the longest clip", () => {
    const longest = Math.max(...ANIM_STATES.map((s) => ANIMATIONS[s].frames));
    expect(SHEET_LAYOUT.columns).toBeGreaterThanOrEqual(longest);
    expect(SHEET_LAYOUT.width).toBe(SHEET_LAYOUT.columns * SPRITE_WIDTH);
    expect(SHEET_LAYOUT.height).toBe(SHEET_LAYOUT.rows * SPRITE_HEIGHT);
  });

  it("places every frame inside the sheet", () => {
    for (const { state, view } of SHEET_LAYOUT.rowOrder) {
      for (let f = 0; f < ANIMATIONS[state].frames; f += 1) {
        const r = sheetRect(state, view, f);
        expect(r.x + r.w).toBeLessThanOrEqual(SHEET_LAYOUT.width);
        expect(r.y + r.h).toBeLessThanOrEqual(SHEET_LAYOUT.height);
      }
      expect(() => sheetRect(state, view, ANIMATIONS[state].frames)).toThrow();
    }
  });

  it("counts drawn frames", () => {
    expect(DRAWN_FRAMES_PER_VIEW).toBe(4 + 6 + 5 + 6 + 3 + 4);
    expect(DRAWN_FRAMES_PER_JOB).toBe(DRAWN_FRAMES_PER_VIEW * 2);
  });
});

describe("portrait spec", () => {
  it("is painted, 128x160, and never mirrored", () => {
    expect(PORTRAIT.style).toBe("painted");
    expect(PORTRAIT.width).toBe(128);
    expect(PORTRAIT.height).toBe(160);
    expect(PORTRAIT.width / PORTRAIT.height).toBeCloseTo(0.8, 5);
    expect(PORTRAIT.mirrorable).toBe(false);
    expect(PORTRAIT.facing).toBe("viewer-right");
  });

  it("has a chip crop inside the master that downscales by an integer factor", () => {
    const { chipCrop, chipSize } = PORTRAIT;
    expect(chipCrop.x).toBeGreaterThanOrEqual(0);
    expect(chipCrop.y).toBeGreaterThanOrEqual(0);
    expect(chipCrop.x + chipCrop.w).toBeLessThanOrEqual(PORTRAIT.width);
    expect(chipCrop.y + chipCrop.h).toBeLessThanOrEqual(PORTRAIT.height);
    expect(chipCrop.w).toBe(chipCrop.h);
    expect(chipCrop.w % chipSize).toBe(0);
    expect(chipSize).toBe(TILE_TEXTURE_SIZE);
  });

  it("puts the eyeline in the upper third-ish of the frame", () => {
    expect(PORTRAIT.eyelineRatio).toBeGreaterThan(0.25);
    expect(PORTRAIT.eyelineRatio).toBeLessThan(0.5);
  });
});
