// Spec conformance for every generated frame: 7 jobs x 2 views x 6 states.
// These assert ART_DIRECTION §3 and §4 directly — canvas, anchor, palette
// discipline, amber scarcity, team-tint rules, mirror safety. The per-frame
// sweeps are registered one job at a time so vitest can shard them across
// workers; see the figures.<job>.test.ts files.

import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JOB_IDS, isJobId, jobFrame, tintIndices, type JobId } from "../../src/art/jobs.js";
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
import { EMISSIVE_COLORS, PALETTE, RAMPS, TEAM_TINT } from "../../src/art/palette.js";
import { AMBER_BUDGET } from "../../src/art/ingest.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  FIGURE_BOX_BOTTOM,
  MAX_COLORS_PER_SPRITE,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  TEAM_TINT_INDEX_COUNT,
  type AnimState,
  type DrawnView,
} from "../../src/art/sprites.js";
import type { Team } from "../../src/data/schemas/common.js";

const TEAMS: readonly Team[] = ["player", "enemy", "neutral"];
const AMBER_INDICES = new Set(RAMPS.amber.map((hex) => paletteIndex(hex)));
/** Emissive elements bleed outward instead of taking a black edge. */
const HALO_INDICES = EMISSIVE_COLORS.map((hex) => paletteIndex(hex));
const MAX_FRAME_COLORS = MAX_COLORS_PER_SPRITE + TEAM_TINT_INDEX_COUNT;

export interface FrameRef {
  readonly jobId: JobId;
  readonly view: DrawnView;
  readonly state: AnimState;
  readonly frame: number;
}

const jobFrames = (jobId: JobId): FrameRef[] => {
  const refs: FrameRef[] = [];
  for (const view of DRAWN_VIEWS) {
    for (const state of ANIM_STATES) {
      for (let frame = 0; frame < ANIMATIONS[state].frames; frame += 1) {
        refs.push({ jobId, view, state, frame });
      }
    }
  }
  return refs;
};

export const allFrames = (): FrameRef[] => JOB_IDS.flatMap(jobFrames);

const name = (ref: FrameRef): string => `${ref.jobId}/${ref.state}/${ref.view}/${ref.frame}`;

/** The white hit-flash frame deliberately drops all interior color. */
const isFlashFrame = (ref: FrameRef): boolean => ref.state === "hurt" && ref.frame === 0;

const SHARD_FILE = /^figures\.([a-z]+)\.test\.ts$/;

/** The jobs that own a figures shard file on disk. */
export const shardedJobs = (): JobId[] =>
  readdirSync(dirname(fileURLToPath(import.meta.url)))
    .map((file) => SHARD_FILE.exec(file)?.[1])
    .filter((id): id is JobId => id !== undefined && isJobId(id));

export const registerFigureSuite = (jobId: JobId): void => {
  const FRAMES = jobFrames(jobId);
  const cache = new Map<string, PixelGrid>();
  const gridOf = (ref: FrameRef, team: Team = "player"): PixelGrid => {
    const key = `${name(ref)}:${team}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const grid = jobFrame({ ...ref, team });
    cache.set(key, grid);
    return grid;
  };

  describe("canvas and anchor", () => {
    it("is 64x96 with every pixel a real palette index", () => {
      const offPalette: string[] = [];
      for (const ref of FRAMES) {
        const grid = gridOf(ref);
        expect(grid.width, name(ref)).toBe(SPRITE_WIDTH);
        expect(grid.height, name(ref)).toBe(SPRITE_HEIGHT);
        for (const value of grid.data) {
          if (value === TRANSPARENT) continue;
          if (value > Object.keys(PALETTE).length || !INDEXED_PALETTE[value]) {
            offPalette.push(`${name(ref)}:${value}`);
          }
        }
      }
      expect(offPalette).toEqual([]);
    });

    it("stands on the feet anchor and stays inside the canvas", () => {
      for (const ref of FRAMES) {
        const bounds = gridBounds(gridOf(ref));
        expect(bounds, name(ref)).not.toBeNull();
        if (!bounds) continue;
        expect(bounds.x0, name(ref)).toBeGreaterThanOrEqual(0);
        expect(bounds.x1, name(ref)).toBeLessThan(SPRITE_WIDTH);
        expect(bounds.y0, name(ref)).toBeGreaterThanOrEqual(0);
        expect(bounds.y1, name(ref)).toBeLessThan(SPRITE_HEIGHT);
      }
    });

    it("keeps the figure inside the figure box and the band for contact only", () => {
      for (const ref of FRAMES) {
        const grid = gridOf(ref);
        let figureBottom = -1;
        for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
          for (let x = 0; x < SPRITE_WIDTH; x += 1) {
            if (gridGet(grid, x, y) !== TRANSPARENT) figureBottom = y;
          }
        }
        // Feet meet the ground line: the figure's last row is the one above it.
        expect(figureBottom, name(ref)).toBe(SPRITE_ANCHOR.y - 1);
        for (let y = SPRITE_ANCHOR.y; y < SPRITE_HEIGHT; y += 1) {
          for (let x = 0; x < SPRITE_WIDTH; x += 1) {
            const value = gridGet(grid, x, y);
            if (value !== TRANSPARENT) expect(value, `${name(ref)} band`).toBe(OUTLINE_INDEX);
          }
        }
      }
    });
  });

  describe("palette discipline", () => {
    it("stays within 12 colors plus the 2 tint indices", () => {
      for (const ref of FRAMES) {
        expect(distinctColors(gridOf(ref)).size, name(ref)).toBeLessThanOrEqual(MAX_FRAME_COLORS);
      }
    });

    it("spends no more than the amber budget on any frame", () => {
      for (const ref of FRAMES) {
        const counts = histogram(gridOf(ref));
        let amber = 0;
        for (const [index, count] of counts) if (AMBER_INDICES.has(index)) amber += count;
        expect(amber, name(ref)).toBeLessThanOrEqual(AMBER_BUDGET);
      }
    });

    it("only spends amber where the fiction sources it", () => {
      const sourced = new Set<JobId>(["conduit", "machinist", "augmented"]);
      for (const ref of FRAMES) {
        if (sourced.has(ref.jobId)) continue;
        const counts = histogram(gridOf(ref));
        for (const index of AMBER_INDICES) expect(counts.get(index) ?? 0, name(ref)).toBe(0);
      }
    });

    it("carries a closed silhouette outline that no interior color breaks", () => {
      const edge = new Set([OUTLINE_INDEX, ...HALO_INDICES]);
      const leaks: string[] = [];
      for (const ref of FRAMES) {
        const grid = gridOf(ref);
        expect(histogram(grid).get(OUTLINE_INDEX) ?? 0, name(ref)).toBeGreaterThan(20);
        // Below the ground line the figure meets the tile, not empty space.
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
            if (open) leaks.push(`${name(ref)} @${x},${y}`);
          }
        }
      }
      expect(leaks).toEqual([]);
    });
  });

  describe("team tint", () => {
    it("marks every frame with the team's own base color", () => {
      for (const team of TEAMS) {
        const base = paletteIndex(TEAM_TINT[team].base);
        for (const ref of FRAMES) {
          if (isFlashFrame(ref)) continue;
          const counts = histogram(gridOf(ref, team));
          expect(counts.get(base) ?? 0, `${name(ref)} ${team}`).toBeGreaterThan(0);
        }
      }
    });

    it("recolors only the tint mask, never the whole unit", () => {
      for (const ref of FRAMES) {
        const player = gridOf(ref, "player");
        const enemy = gridOf(ref, "enemy");
        const allowed = new Set([
          ...Object.values(tintIndices("player")),
          ...Object.values(tintIndices("enemy")),
        ]);
        let differing = 0;
        for (let i = 0; i < player.data.length; i += 1) {
          const a = player.data[i] ?? 0;
          const b = enemy.data[i] ?? 0;
          if (a === b) continue;
          differing += 1;
          expect(allowed.has(a), name(ref)).toBe(true);
          expect(allowed.has(b), name(ref)).toBe(true);
        }
        if (isFlashFrame(ref)) continue;
        const body = opaqueCount(player);
        expect(differing / body, name(ref)).toBeGreaterThan(0.01);
        expect(differing / body, name(ref)).toBeLessThan(0.14);
      }
    });
  });

  describe("views and mirroring", () => {
    it("draws two distinct views per job", () => {
      const se = jobFrame({ jobId, team: "player", state: "idle", view: "se", frame: 0 });
      const ne = jobFrame({ jobId, team: "player", state: "idle", view: "ne", frame: 0 });
      expect(se.data, jobId).not.toEqual(ne.data);
    });

    it("mirrors losslessly: gear survives the flip inside the canvas", () => {
      for (const ref of FRAMES) {
        const grid = gridOf(ref);
        const flipped = mirrorGrid(grid);
        expect(opaqueCount(flipped), name(ref)).toBe(opaqueCount(grid));
        expect(mirrorGrid(flipped).data, name(ref)).toEqual(grid.data);
      }
    });

    it("keeps job-identifying mass near the centerline so a mirror reads as a turn", () => {
      const grid = jobFrame({ jobId, team: "player", state: "idle", view: "se", frame: 0 });
      let sum = 0;
      let count = 0;
      for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
        for (let x = 0; x < SPRITE_WIDTH; x += 1) {
          if (gridGet(grid, x, y) === TRANSPARENT) continue;
          sum += x - SPRITE_ANCHOR.x;
          count += 1;
        }
      }
      expect(Math.abs(sum / Math.max(1, count)), jobId).toBeLessThan(4);
    });
  });

  describe("determinism", () => {
    it("returns byte-identical grids for identical requests", () => {
      for (const ref of FRAMES) {
        expect(gridOf(ref).data, name(ref)).toEqual(gridOf(ref).data);
      }
    });

    it("differs between adjacent frames of a state", () => {
      for (const state of ANIM_STATES) {
        const clip = ANIMATIONS[state];
        for (let frame = 1; frame < clip.frames; frame += 1) {
          const previous = jobFrame({ jobId, team: "player", state, view: "se", frame: frame - 1 });
          const current = jobFrame({ jobId, team: "player", state, view: "se", frame });
          expect(current.data, `${jobId}/${state}/${frame}`).not.toEqual(previous.data);
        }
      }
    });
  });
};
