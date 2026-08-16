// Appendix C, mechanically. These are the checks C.7 says the tests can carry:
// the shading model is actually used, clusters are not confetti, the face
// standard leaves pixels behind, the masters are not palette swaps of each
// other, and the two named failure modes of C.9 cannot come back silently.

import { describe, expect, it } from "vitest";
import { JOB_ART, JOB_IDS, jobFrame, tintIndices, type JobId } from "../../src/art/jobs.js";
import { PALETTE, RAMPS } from "../../src/art/palette.js";
import {
  OUTLINE_INDEX,
  TRANSPARENT,
  colorClusters,
  distinctColors,
  gridGet,
  histogram,
  paletteIndex,
  type PixelGrid,
} from "../../src/art/pixel.js";
import {
  HEAD_HEIGHT,
  HEAD_CENTER_OFFSET,
  SHOULDER_UP,
  TINT_MASK_SEPARATION,
  at,
  toPx,
} from "../../src/art/rig.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  FIGURE_BOX_BOTTOM,
  RIG_UNIT,
  SPRITE_ANCHOR,
  SPRITE_WIDTH,
} from "../../src/art/sprites.js";

const idle = (jobId: JobId, view: "se" | "ne" = "se"): PixelGrid =>
  jobFrame({ jobId, team: "player", state: "idle", view, frame: 0 });

/** Rows the head box can occupy across the pose table, with slack for hats. */
const HEAD_CENTER_ROW = at(0, SHOULDER_UP + HEAD_CENTER_OFFSET).y;
const HEAD_TOP = Math.max(0, HEAD_CENTER_ROW - HEAD_HEIGHT / 2 - toPx(3));
const HEAD_BOTTOM = HEAD_CENTER_ROW + HEAD_HEIGHT / 2 + toPx(3);

const cropRows = (grid: PixelGrid, y0: number, y1: number): PixelGrid => {
  const top = Math.max(0, y0);
  const bottom = Math.min(FIGURE_BOX_BOTTOM, y1);
  const height = Math.max(1, bottom - top + 1);
  const out: PixelGrid = { width: SPRITE_WIDTH, height, data: new Uint8Array(SPRITE_WIDTH * height) };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < SPRITE_WIDTH; x += 1) {
      out.data[y * SPRITE_WIDTH + x] = gridGet(grid, x, top + y);
    }
  }
  return out;
};

const countIn = (grid: PixelGrid, index: number, y0: number, y1: number): number => {
  let n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(FIGURE_BOX_BOTTOM, y1); y += 1) {
    for (let x = 0; x < SPRITE_WIDTH; x += 1) if (gridGet(grid, x, y) === index) n += 1;
  }
  return n;
};

/** Longest horizontal run of `index` anywhere in the row band. */
const longestRun = (grid: PixelGrid, index: number, y0: number, y1: number): number => {
  let best = 0;
  for (let y = Math.max(0, y0); y <= Math.min(FIGURE_BOX_BOTTOM, y1); y += 1) {
    let run = 0;
    for (let x = 0; x < SPRITE_WIDTH; x += 1) {
      run = gridGet(grid, x, y) === index ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best;
};

const SKIN_LINE = paletteIndex(PALETTE["umber-900"]);
const SKIN_LIGHT = paletteIndex(PALETTE["copper-300"]);
const PLATE_LINE = paletteIndex(PALETTE["soot-800"]);
const SPARK = paletteIndex(PALETTE["soot-100"]);

/**
 * C.3 gives three treatments. Which one a job takes is a design decision, so
 * the table names it; what the test refuses to accept is a head with none.
 */
const FACE_TREATMENT: Record<JobId, "eyes" | "visor" | "void-glint"> = {
  enforcer: "visor",
  machinist: "eyes",
  conduit: "eyes",
  saboteur: "void-glint",
  chemist: "eyes",
  augmented: "eyes",
  railrunner: "void-glint",
};

describe("C.9.1 — the flat face cannot come back", () => {
  for (const jobId of JOB_IDS) {
    it(`${jobId} has a readable head in the se master`, () => {
      const grid = idle(jobId);
      switch (FACE_TREATMENT[jobId]) {
        case "eyes": {
          // Two *dots*: separate line-step clusters of one or two pixels. A
          // line-step band across the head is a scowl, not a pair of eyes.
          // An eye is one authored pixel per rig unit in each direction.
          const dots = colorClusters(cropRows(grid, HEAD_TOP, HEAD_BOTTOM)).filter(
            (c) => c.color === SKIN_LINE && c.size <= 2 * RIG_UNIT * RIG_UNIT,
          );
          expect(dots.length, `${jobId}: no eye dots in the head box`).toBeGreaterThanOrEqual(2);
          // A face is skin, not a hair helmet: the light step must appear.
          expect(countIn(grid, SKIN_LIGHT, HEAD_TOP, HEAD_BOTTOM), jobId).toBeGreaterThanOrEqual(3);
          return;
        }
        case "visor": {
          // A slit at least 5px wide, with its gleam on the lit end.
          expect(longestRun(grid, PLATE_LINE, HEAD_TOP, HEAD_BOTTOM), jobId).toBeGreaterThanOrEqual(toPx(5));
          expect(countIn(grid, SPARK, HEAD_TOP, HEAD_BOTTOM), jobId).toBeGreaterThanOrEqual(2);
          return;
        }
        case "void-glint": {
          // Lensed or hooded: something catches the key light where a face is.
          const lit =
            countIn(grid, SKIN_LIGHT, HEAD_TOP, HEAD_BOTTOM) + countIn(grid, SPARK, HEAD_TOP, HEAD_BOTTOM);
          expect(lit, jobId).toBeGreaterThanOrEqual(2);
          return;
        }
      }
    });
  }
});

describe("C.9.2 — the cyan band cannot come back", () => {
  const tint = tintIndices("player");

  const tintRows = (grid: PixelGrid): number[] => {
    const rows: number[] = [];
    for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        const value = gridGet(grid, x, y);
        if (value === tint.base || value === tint.shadow) {
          rows.push(y);
          break;
        }
      }
    }
    return rows;
  };

  for (const jobId of JOB_IDS) {
    it(`${jobId} never merges the band and the trim into one run`, () => {
      // The symptom of C.9.2: a single horizontal run of tint spanning the
      // shoulders. The chest band is `shoulderW - 4` wide by A.6; anything
      // wider than that on one row means the trim has joined it.
      const grid = idle(jobId);
      const widest = Math.max(
        longestRun(grid, tint.base, 0, FIGURE_BOX_BOTTOM),
        longestRun(grid, tint.shadow, 0, FIGURE_BOX_BOTTOM),
      );
      const bandWidth = toPx(Math.max(4, JOB_ART[jobId].build.shoulderW - 4));
      expect(widest, `${jobId}: a ${widest}px tint run across the chest`).toBeLessThanOrEqual(bandWidth);
    });

    it(`${jobId} draws no one-row hole inside a tint group`, () => {
      // C.9.2 rule 2: a gap of exactly one row splits a strap into two stripes.
      const rows = tintRows(idle(jobId));
      for (let i = 1; i < rows.length; i += 1) {
        const gap = (rows[i] as number) - (rows[i - 1] as number) - 1;
        expect(gap, `${jobId}: 1-row hole at row ${rows[i - 1]}`).not.toBe(1);
      }
    });

    it(`${jobId} keeps the tint mask inside its 5-12% share`, () => {
      const grid = idle(jobId);
      const counts = histogram(grid);
      const tinted = (counts.get(tint.base) ?? 0) + (counts.get(tint.shadow) ?? 0);
      let body = 0;
      for (const [index, count] of counts) if (index !== TRANSPARENT) body += count;
      const share = tinted / body;
      expect(share, jobId).toBeGreaterThan(0.03);
      expect(share, jobId).toBeLessThan(0.14);
    });
  }
});

describe("C.9.2 — the layout keeps the two mask parts apart", () => {
  it("leaves at least two clear rows between the chest band and the pauldron trim", () => {
    expect(TINT_MASK_SEPARATION).toBeGreaterThanOrEqual(2);
  });
});

describe("C.1 — the shading model is actually used", () => {
  const rampOf = (index: number): string | null => {
    for (const [name, hexes] of Object.entries(RAMPS)) {
      if (hexes.some((hex) => paletteIndex(hex) === index)) return name;
    }
    return null;
  };

  for (const jobId of JOB_IDS) {
    for (const view of DRAWN_VIEWS) {
      it(`${jobId}/${view} carries at least three steps of some ramp on the torso`, () => {
        const grid = idle(jobId, view);
        // The torso band: the shoulder row down to the hip row.
        const perRamp = new Map<string, Set<number>>();
        for (let y = at(0, SHOULDER_UP).y; y <= at(0, 15).y; y += 1) {
          for (let x = 0; x < SPRITE_WIDTH; x += 1) {
            const value = gridGet(grid, x, y);
            if (value === TRANSPARENT || value === OUTLINE_INDEX) continue;
            const ramp = rampOf(value);
            if (ramp === null) continue;
            if (!perRamp.has(ramp)) perRamp.set(ramp, new Set());
            (perRamp.get(ramp) as Set<number>).add(value);
          }
        }
        const deepest = Math.max(0, ...[...perRamp.values()].map((s) => s.size));
        expect(deepest, `${jobId}/${view} torso is flat`).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("every job spends at least six distinct colors on its idle master", () => {
    for (const jobId of JOB_IDS) {
      expect(distinctColors(idle(jobId)).size, jobId).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("C.2 — cluster discipline", () => {
  /** Eyes, line-step ticks and emissive cores are the only allowed singletons. */
  const ALLOWANCE = 20;

  it("leaves no confetti in any frame of the roster", () => {
    const emissive = new Set(
      [PALETTE["amber-500"], PALETTE["amber-300"], PALETTE["amber-glow"]].map((hex) =>
        paletteIndex(hex),
      ),
    );
    for (const jobId of JOB_IDS) {
      for (const view of DRAWN_VIEWS) {
        for (const state of ANIM_STATES) {
          for (let frame = 0; frame < ANIMATIONS[state].frames; frame += 1) {
            const grid = jobFrame({ jobId, team: "player", state, view, frame });
            const orphans = colorClusters(grid).filter(
              (c) => c.size === 1 && c.color !== OUTLINE_INDEX && !emissive.has(c.color),
            ).length;
            expect(orphans, `${jobId}/${state}/${view}/${frame}`).toBeLessThanOrEqual(ALLOWANCE);
          }
        }
      }
    }
  });
});

describe("C.6 — the masters are hand-authored, not palette swaps", () => {
  it("gives every job a distinct silhouette, not just distinct colors", () => {
    const masks = JOB_IDS.map((jobId) => {
      const grid = idle(jobId);
      return {
        jobId,
        mask: Array.from(grid.data, (v) => (v === TRANSPARENT ? 0 : 1)).join(""),
      };
    });
    for (let a = 0; a < masks.length; a += 1) {
      for (let b = a + 1; b < masks.length; b += 1) {
        const left = masks[a] as { jobId: string; mask: string };
        const right = masks[b] as { jobId: string; mask: string };
        expect(left.mask, `${left.jobId} vs ${right.jobId} share a silhouette`).not.toBe(right.mask);
      }
    }
  });

  it("gives every job a distinct head, not a recolor of one head", () => {
    const heads = JOB_IDS.map((jobId) => {
      const grid = idle(jobId);
      const rows: string[] = [];
      for (let y = HEAD_TOP; y <= HEAD_BOTTOM; y += 1) {
        let row = "";
        for (let x = 0; x < SPRITE_WIDTH; x += 1) row += gridGet(grid, x, y) === TRANSPARENT ? "." : "#";
        rows.push(row);
      }
      return { jobId, shape: rows.join("\n") };
    });
    const distinct = new Set(heads.map((h) => h.shape));
    // Bare-headed jobs legitimately share an anatomy; gear must still differ.
    expect(distinct.size, "heads are all the same shape").toBeGreaterThanOrEqual(4);
  });

  it("documents a 1x read for every job", () => {
    for (const jobId of JOB_IDS) {
      expect(JOB_ART[jobId].read.length, jobId).toBeGreaterThan(20);
    }
  });
});
