// End-to-end proof of the external-master intake path (ART_DIRECTION C.8).
//
// The stand-in "external" art is our own Enforcer and Saboteur idle masters,
// rendered to PNG bytes, nudged off-palette the way a foreign tool would leave
// them, then read back through the public intake API with no inside knowledge:
// decode -> quantize -> audit -> segment -> derive 28 frames per view -> sheet.
// The derived frames are then held to the same §3/§4 assertions the generated
// ones are.
//
// One fallback job is a whole vitest file's worth of work, so the per-job suite
// is registered from here and each job gets its own `ingest.<job>.test.ts`.
//
// The same per-frame sweep also runs over the seven delivered masters — the art
// that actually reaches the GPU — from the `sheet.<job>.test.ts` shards, with
// each delivery's C.8.6 colour overage declared here rather than left unmeasured.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { externalArt } from "../../src/art/external.js";
import { JOB_ART, jobFrame, type JobId } from "../../src/art/jobs.js";
import { AMBER_BUDGET, MAX_FRAME_COLORS } from "../../src/art/ingest.js";
import { intakeExternalMaster, propRegion, retintMaster } from "../../src/art/intake.js";
import { EMISSIVE_COLORS, RAMPS, TEAM_TINT } from "../../src/art/palette.js";
import {
  INDEXED_PALETTE,
  OUTLINE_INDEX,
  TRANSPARENT,
  distinctColors,
  gridBounds,
  gridGet,
  histogram,
  mirrorGrid,
  opaqueCount,
  paletteIndex,
  type PixelGrid,
} from "../../src/art/pixel.js";
import { decodePNG, encodePNG } from "../../src/art/png.js";
import {
  buildExternalSheet,
  deriveExternalFrame,
  everyExternalFrame,
} from "../../src/art/segments.js";
import {
  ANIMATIONS,
  DRAWN_FRAMES_PER_JOB,
  FIGURE_BOX_BOTTOM,
  SHEET_LAYOUT,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
} from "../../src/art/sprites.js";

export const AMBER_INDICES = new Set(RAMPS.amber.map((hex) => paletteIndex(hex)));
export const HALO_INDICES = EMISSIVE_COLORS.map((hex) => paletteIndex(hex));

/** Palette-index grid -> RGBA, the shape an external PNG arrives in. */
export function toRGBA(
  grid: PixelGrid,
  jitter = 0,
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let i = 0; i < grid.width * grid.height; i += 1) {
    const hex = INDEXED_PALETTE[grid.data[i] ?? 0] ?? null;
    if (hex === null) continue;
    const drift = jitter === 0 ? 0 : ((i % 7) - 3) * jitter;
    data[i * 4] = Number.parseInt(hex.slice(1, 3), 16) + drift;
    data[i * 4 + 1] = Number.parseInt(hex.slice(3, 5), 16) + drift;
    data[i * 4 + 2] = Number.parseInt(hex.slice(5, 7), 16) - drift;
    data[i * 4 + 3] = 255;
  }
  return { width: grid.width, height: grid.height, data };
}

export const pngOf = (grid: PixelGrid, jitter = 0): Uint8Array => encodePNG(toRGBA(grid, jitter));

/** The two masters kept as fallback content, taken in as if they were foreign. */
export const FALLBACK = ["enforcer", "saboteur"] as const;

export type FallbackJob = (typeof FALLBACK)[number];

export const intakeFallback = (jobId: FallbackJob) => {
  const art = JOB_ART[jobId];
  const se = jobFrame({ jobId, team: "player", state: "idle", view: "se", frame: 0 });
  const ne = jobFrame({ jobId, team: "player", state: "idle", view: "ne", frame: 0 });
  // Gear that crosses the torso/leg split has to be cut first or it tears.
  const prop =
    jobId === "enforcer"
      ? {
          // Shield across the hips, maul off the near hand.
          se: [propRegion(10, 38, 30, 32, "hip"), propRegion(44, 16, 20, 18, "handNear")],
          ne: [propRegion(10, 38, 30, 32, "hip"), propRegion(44, 16, 20, 18, "handNear")],
        }
      : { se: [propRegion(6, 48, 24, 24, "hip")], ne: [propRegion(34, 48, 24, 24, "hip")] };
  return intakeExternalMaster({
    id: jobId,
    build: art.build,
    views: { se: decodePNG(pngOf(se, 1)), ne: decodePNG(pngOf(ne, 1)) },
    prop,
    ...(art.posePass ? { posePass: art.posePass } : {}),
  });
};

const SUITE_CALL = /registerExternalMasterSuite\("([a-z]+)"\)/g;

/** Which fallback jobs the `ingest.<job>.test.ts` shards actually register. */
export function coveredFallbackJobs(): Set<string> {
  const here = import.meta.dirname;
  const covered = new Set<string>();
  for (const file of readdirSync(here)) {
    if (!/^ingest\..+\.test\.ts$/.test(file)) continue;
    for (const match of readFileSync(join(here, file), "utf8").matchAll(SUITE_CALL)) {
      covered.add(match[1] as string);
    }
  }
  return covered;
}

type DerivedFrames = ReturnType<typeof everyExternalFrame>;

const frameName = (jobId: string, ref: DerivedFrames[number]): string =>
  `${jobId}/${ref.state}/${ref.view}/${ref.frame}`;

/** §3 on one derived frame: canvas, anchor, sub-floor band, palette validity. */
export function expectFrameGeometry(frames: DerivedFrames, jobId: string): void {
  for (const ref of frames) {
    const { grid } = ref;
    const where = frameName(jobId, ref);
    expect(grid.width, where).toBe(SPRITE_WIDTH);
    expect(grid.height, where).toBe(SPRITE_HEIGHT);
    expect(gridBounds(grid), where).not.toBeNull();
    for (const value of grid.data) {
      if (value === TRANSPARENT) continue;
      expect(INDEXED_PALETTE[value], `${where}:${value}`).toBeTruthy();
    }
    let figureBottom = -1;
    for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        if (gridGet(grid, x, y) !== TRANSPARENT) figureBottom = y;
      }
    }
    expect(figureBottom, where).toBe(SPRITE_ANCHOR.y - 1);
    for (let y = SPRITE_ANCHOR.y; y < SPRITE_HEIGHT; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        const value = gridGet(grid, x, y);
        if (value !== TRANSPARENT) expect(value, `${where} band`).toBe(OUTLINE_INDEX);
      }
    }
  }
}

/**
 * §2 and §3 on one derived frame: color budget, amber budget, closed outline.
 * The ceiling is a parameter because delivered art is over the hand-drawing
 * budget by C.8.6 and each delivery declares how far.
 */
export function expectFrameBudgets(
  frames: DerivedFrames,
  jobId: string,
  colorCeiling: number,
): void {
  const edge = new Set([OUTLINE_INDEX, ...HALO_INDICES]);
  for (const ref of frames) {
    const { grid } = ref;
    const where = frameName(jobId, ref);
    expect(distinctColors(grid).size, where).toBeLessThanOrEqual(colorCeiling);
    const counts = histogram(grid);
    let amber = 0;
    for (const [index, count] of counts) if (AMBER_INDICES.has(index)) amber += count;
    expect(amber, where).toBeLessThanOrEqual(AMBER_BUDGET);
    expect(counts.get(OUTLINE_INDEX) ?? 0, where).toBeGreaterThan(20);

    const sample = (x: number, y: number): number =>
      y > FIGURE_BOX_BOTTOM ? OUTLINE_INDEX : gridGet(grid, x, y);
    for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        const value = gridGet(grid, x, y);
        if (value === TRANSPARENT || edge.has(value)) continue;
        let open = x === 0 || y === 0 || x === SPRITE_WIDTH - 1;
        for (let ny = -1; ny <= 1 && !open; ny += 1) {
          for (let nx = -1; nx <= 1; nx += 1) {
            if (sample(x + nx, y + ny) === TRANSPARENT) open = true;
          }
        }
        expect(open, `${where} leak @${x},${y}`).toBe(false);
      }
    }
  }
}

/**
 * How many colors each delivery's derived frames may spend. Every one is over
 * `MAX_FRAME_COLORS` — that is the C.8.6 cost of painted art reduced to the
 * canvas, recorded per job so a delivery that climbs further fails here rather
 * than passing by being unmeasured.
 */
export const DELIVERED_COLOR_CEILING = {
  enforcer: 21,
  machinist: 23,
  conduit: 22,
  saboteur: 18,
  chemist: 24,
  augmented: 23,
  railrunner: 17,
} as const satisfies Readonly<Record<JobId, number>>;

/**
 * The same per-frame sweep, run over a real delivered master's 56 derived
 * frames instead of a synthesised one: segment cut, shear, seam close, ground
 * settle, outline re-derivation and mirror, on the art that reaches the GPU.
 */
export function registerDeliveredMasterSuite(jobId: JobId): void {
  const art = externalArt(jobId);
  if (!art) return;
  describe("delivered master, frame by frame", () => {
    let frames: DerivedFrames;
    beforeAll(() => {
      frames = everyExternalFrame(art.master);
    });

    it("derives every frame the tick tables declare", () => {
      expect(frames).toHaveLength(DRAWN_FRAMES_PER_JOB);
    });

    it("keeps §3: canvas, anchor, sub-floor band, palette validity", () => {
      expectFrameGeometry(frames, jobId);
    });

    it("keeps §2 and §3: declared color budget, amber budget, closed outline", () => {
      expectFrameBudgets(frames, jobId, DELIVERED_COLOR_CEILING[jobId]);
    });
  });
}

export function registerExternalMasterSuite(jobId: FallbackJob): void {
  describe("external masters become full animations", () => {
    describe(jobId, () => {
      let taken: ReturnType<typeof intakeFallback>;
      let frames: ReturnType<typeof everyExternalFrame>;

      beforeAll(() => {
        taken = intakeFallback(jobId);
        frames = everyExternalFrame(taken.master);
      });

      it("conforms on intake", () => {
        expect(taken.ok, taken.summary).toBe(true);
        for (const view of ["se", "ne"] as const) {
          expect(taken.reports[view].movedCount).toBeGreaterThan(0);
          expect(taken.reports[view].figureBottom).toBe(SPRITE_ANCHOR.y - 1);
        }
      });

      it("derives every frame the tick tables declare", () => {
        expect(frames).toHaveLength(DRAWN_FRAMES_PER_JOB);
        for (const state of ["idle", "walk", "attack", "cast", "hurt", "downed"] as const) {
          expect(frames.filter((f) => f.state === state && f.view === "se")).toHaveLength(
            ANIMATIONS[state].frames,
          );
        }
      });

      it("keeps §3: canvas, anchor, sub-floor band, palette validity", () => {
        expectFrameGeometry(frames, jobId);
      });

      it("keeps §2 and §3: color budget, amber budget, closed outline", () => {
        expectFrameBudgets(frames, jobId, MAX_FRAME_COLORS);
      });

      it("animates: adjacent frames of a state differ", () => {
        for (const state of ["walk", "attack", "cast", "downed"] as const) {
          for (let frame = 1; frame < ANIMATIONS[state].frames; frame += 1) {
            const previous = deriveExternalFrame(taken.master, { state, view: "se", frame: frame - 1 });
            const current = deriveExternalFrame(taken.master, { state, view: "se", frame });
            expect(current.data, `${jobId}/${state}/${frame}`).not.toEqual(previous.data);
          }
        }
      });

      it("mirrors losslessly and keeps job mass near the centerline", () => {
        for (const { state, view, frame, grid } of frames) {
          const where = `${jobId}/${state}/${view}/${frame}`;
          const flipped = mirrorGrid(grid);
          expect(opaqueCount(flipped), where).toBe(opaqueCount(grid));
          expect(mirrorGrid(flipped).data, where).toEqual(grid.data);
        }
        const idle = deriveExternalFrame(taken.master, { state: "idle", view: "se", frame: 0 });
        let sum = 0;
        let count = 0;
        for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
          for (let x = 0; x < SPRITE_WIDTH; x += 1) {
            if (gridGet(idle, x, y) === TRANSPARENT) continue;
            sum += x - SPRITE_ANCHOR.x;
            count += 1;
          }
        }
        expect(Math.abs(sum / Math.max(1, count)), jobId).toBeLessThan(4);
      });

      it("carries the team tint, and retints without repainting the unit", () => {
        const base = paletteIndex(TEAM_TINT.player.base);
        for (const { state, view, frame, grid } of frames) {
          if (state === "hurt" && frame === 0) continue; // A.4 flash frame
          expect(histogram(grid).get(base) ?? 0, `${jobId}/${state}/${view}/${frame}`).toBeGreaterThan(0);
        }
        const enemy = retintMaster(taken.master, "player", "enemy");
        const player = deriveExternalFrame(taken.master, { state: "idle", view: "se", frame: 0 });
        const enemyFrame = deriveExternalFrame(enemy, { state: "idle", view: "se", frame: 0 });
        const allowed = new Set([
          paletteIndex(TEAM_TINT.player.base),
          paletteIndex(TEAM_TINT.player.shadow),
          paletteIndex(TEAM_TINT.enemy.base),
          paletteIndex(TEAM_TINT.enemy.shadow),
        ]);
        let differing = 0;
        for (let i = 0; i < player.data.length; i += 1) {
          const a = player.data[i] ?? 0;
          const b = enemyFrame.data[i] ?? 0;
          if (a === b) continue;
          differing += 1;
          expect(allowed.has(a) && allowed.has(b), `${jobId} @${i}`).toBe(true);
        }
        const share = differing / opaqueCount(player);
        expect(share, jobId).toBeGreaterThan(0.01);
        expect(share, jobId).toBeLessThan(0.14);
      });

      it("assembles into the frozen sheet layout", () => {
        const sheet = buildExternalSheet(taken.master);
        expect(sheet.width).toBe(SHEET_LAYOUT.width);
        expect(sheet.height).toBe(SHEET_LAYOUT.height);
        expect(opaqueCount(sheet)).toBeGreaterThan(DRAWN_FRAMES_PER_JOB * 100);
        // Padding columns beyond a state's frame count stay empty.
        for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
          for (let x = 4 * SPRITE_WIDTH; x < SHEET_LAYOUT.width; x += 1) {
            expect(gridGet(sheet, x, y), `idle padding ${x},${y}`).toBe(TRANSPARENT);
          }
        }
      });

      it("reproduces the master at rest, up to the re-derived outline", () => {
        const original = jobFrame({ jobId, team: "player", state: "idle", view: "se", frame: 0 });
        const derived = deriveExternalFrame(taken.master, { state: "idle", view: "se", frame: 0 });
        let same = 0;
        let total = 0;
        for (let i = 0; i < original.data.length; i += 1) {
          if ((original.data[i] ?? 0) === TRANSPARENT && (derived.data[i] ?? 0) === TRANSPARENT) continue;
          total += 1;
          if (original.data[i] === derived.data[i]) same += 1;
        }
        expect(same / total, `${jobId} rest fidelity`).toBeGreaterThan(0.98);
      });
    });
  });
}
