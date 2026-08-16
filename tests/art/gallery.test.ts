// Eyeball rig. Renders the roster to PNGs so the art can be judged at size
// instead of asserted at. Skipped unless SPRITE_DUMP=1 so `vitest run` stays
// a spec check; the images go wherever SPRITE_DUMP_DIR points.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { JOB_ART, JOB_IDS, jobFrame, type JobId } from "../../src/art/jobs.js";
import { importExternalMaster, propRegion } from "../../src/art/intake.js";
import { decodePNG, encodePNG as encodeSpritePNG } from "../../src/art/png.js";
import { deriveExternalFrame } from "../../src/art/segments.js";
import { INDEXED_PALETTE, mirrorGrid, type PixelGrid } from "../../src/art/pixel.js";
import { ANIMATIONS, SPRITE_HEIGHT, SPRITE_WIDTH, type AnimState, type DrawnView } from "../../src/art/sprites.js";
import { createImage, drawGrid, drawText, encodePNG, fillRect } from "./png.js";

const DUMP = process.env.SPRITE_DUMP === "1";
const OUT = process.env.SPRITE_DUMP_DIR ?? "/tmp/sprites-craft";
const TAG = process.env.SPRITE_DUMP_TAG ?? "new";

const BG = [23, 28, 34, 255];
const GRID = [43, 51, 61, 255];
const INK = [179, 188, 197, 255];

const write = (name: string, img: ReturnType<typeof createImage>): void => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), encodePNG(img));
};

interface Cell {
  readonly grid: PixelGrid;
  readonly label: string;
}

function contactSheet(rows: readonly (readonly Cell[])[], scale: number, title: string) {
  const pad = 4;
  const labelH = 8;
  const cw = SPRITE_WIDTH * scale + pad;
  const ch = SPRITE_HEIGHT * scale + pad + labelH;
  const cols = Math.max(...rows.map((r) => r.length));
  const img = createImage(cols * cw + pad, rows.length * ch + pad + 10, BG);
  drawText(img, title, pad, 3, INK);
  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const x = pad + ci * cw;
      const y = 12 + pad + ri * ch;
      fillRect(img, x - 1, y - 1, SPRITE_WIDTH * scale + 2, SPRITE_HEIGHT * scale + 2, GRID);
      fillRect(img, x, y, SPRITE_WIDTH * scale, SPRITE_HEIGHT * scale, BG);
      drawGrid(img, cell.grid, x, y, scale);
      drawText(img, cell.label, x, y + SPRITE_HEIGHT * scale + 2, INK);
    });
  });
  return img;
}

const idle = (jobId: JobId, view: DrawnView, frame = 0): PixelGrid =>
  jobFrame({ jobId, team: "player", state: "idle", view, frame });

describe.runIf(DUMP)("sprite gallery", () => {
  it("writes a per-job idle comparison at 1x and 3x", () => {
    for (const jobId of JOB_IDS) {
      const cells: Cell[] = [];
      for (const view of ["se", "ne"] as const) {
        cells.push({ grid: idle(jobId, view), label: `${view}` });
        cells.push({ grid: mirrorGrid(idle(jobId, view)), label: `${view} mir` });
      }
      const one = contactSheet([cells], 1, `${jobId} ${TAG} 1x`);
      write(`${jobId}-${TAG}-1x.png`, one);
      write(`${jobId}-${TAG}-3x.png`, contactSheet([cells], 3, `${jobId} ${TAG} 3x`));
      write(`${jobId}-${TAG}-6x.png`, contactSheet([cells], 6, `${jobId} ${TAG} 6x`));
    }
  });

  it("writes a full roster gallery of idle, walk and attack", () => {
    const states: readonly AnimState[] = ["idle", "walk", "attack"];
    for (const view of ["se", "ne"] as const) {
      const rows: Cell[][] = [];
      for (const jobId of JOB_IDS) {
        for (const state of states) {
          const row: Cell[] = [];
          for (let f = 0; f < ANIMATIONS[state].frames; f += 1) {
            row.push({ grid: jobFrame({ jobId, team: "player", state, view, frame: f }), label: `${state}${f}` });
          }
          rows.push(row);
        }
      }
      write(`gallery-${view}-${TAG}-3x.png`, contactSheet(rows, 3, `roster ${view} ${TAG}`));
    }
  });

  it("writes a roster line-up at 1x and 3x", () => {
    for (const scale of [1, 3, 6]) {
      const rows: Cell[][] = [
        JOB_IDS.map((jobId) => ({ grid: idle(jobId, "se"), label: jobId.slice(0, 7) })),
        JOB_IDS.map((jobId) => ({ grid: idle(jobId, "ne"), label: jobId.slice(0, 7) })),
      ];
      write(`roster-${TAG}-${scale}x.png`, contactSheet(rows, scale, `roster ${TAG} ${scale}x`));
    }
  });

  it("writes a head close-up", () => {
    const scale = 5;
    const w = 32;
    const h = 44;
    const pad = 4;
    const img = createImage(JOB_IDS.length * (w * scale + pad) + pad, 2 * (h * scale + pad + 8) + 16, BG);
    drawText(img, `heads ${TAG}`, pad, 3, INK);
    (["se", "ne"] as const).forEach((view, ri) => {
      JOB_IDS.forEach((jobId, ci) => {
        const grid = idle(jobId, view);
        const x = pad + ci * (w * scale + pad);
        const y = 12 + ri * (h * scale + pad + 8);
        fillRect(img, x, y, w * scale, h * scale, [11, 13, 16, 255]);
        for (let gy = 0; gy < h; gy += 1) {
          for (let gx = 0; gx < w; gx += 1) {
            const src = { x: gx + (SPRITE_WIDTH - w) / 2, y: gy };
            const v = grid.data[src.y * SPRITE_WIDTH + src.x] ?? 0;
            if (v === 0) continue;
            const sub = { width: 1, height: 1, data: new Uint8Array([v]) };
            drawGrid(img, sub, x + gx * scale, y + gy * scale, scale);
          }
        }
        drawText(img, `${jobId.slice(0, 6)} ${view}`, x, y + h * scale + 2, INK);
      });
    });
    write(`heads-${TAG}-5x.png`, img);
  });

  it("writes the ingest proof: generated master vs frames derived from it", () => {
    for (const jobId of ["enforcer", "saboteur"] as const) {
      const art = JOB_ART[jobId];
      const shot = (view: DrawnView): PixelGrid =>
        jobFrame({ jobId, team: "player", state: "idle", view, frame: 0 });
      const toRGBA = (grid: PixelGrid) => {
        const data = new Uint8ClampedArray(grid.width * grid.height * 4);
        for (let i = 0; i < grid.width * grid.height; i += 1) {
          const hex = INDEXED_PALETTE[grid.data[i] ?? 0] ?? null;
          if (hex === null) continue;
          data[i * 4] = Number.parseInt(hex.slice(1, 3), 16);
          data[i * 4 + 1] = Number.parseInt(hex.slice(3, 5), 16);
          data[i * 4 + 2] = Number.parseInt(hex.slice(5, 7), 16);
          data[i * 4 + 3] = 255;
        }
        return { width: grid.width, height: grid.height, data };
      };
      const prop =
        jobId === "enforcer"
          ? {
              se: [propRegion(10, 38, 30, 32, "hip" as const), propRegion(44, 16, 20, 18, "handNear" as const)],
              ne: [propRegion(10, 38, 30, 32, "hip" as const), propRegion(44, 16, 20, 18, "handNear" as const)],
            }
          : { se: [propRegion(6, 48, 24, 24, "hip" as const)], ne: [propRegion(34, 48, 24, 24, "hip" as const)] };
      const { master } = importExternalMaster({
        id: jobId,
        build: art.build,
        views: { se: decodePNG(encodeSpritePNG(toRGBA(shot("se")))), ne: decodePNG(encodeSpritePNG(toRGBA(shot("ne")))) },
        prop,
        ...(art.posePass ? { posePass: art.posePass } : {}),
      });
      const rows: Cell[][] = [];
      for (const state of ["idle", "walk", "attack", "cast", "hurt", "downed"] as const) {
        const generated: Cell[] = [];
        const derived: Cell[] = [];
        for (let f = 0; f < ANIMATIONS[state].frames; f += 1) {
          generated.push({ grid: jobFrame({ jobId, team: "player", state, view: "se", frame: f }), label: `gen${f}` });
          derived.push({ grid: deriveExternalFrame(master, { state, view: "se", frame: f }), label: `ext${f}` });
        }
        rows.push(generated, derived);
      }
      write(`ingest-${jobId}-${TAG}-3x.png`, contactSheet(rows, 3, `${jobId}: generated vs ingested+derived`));
    }
  });

  it("writes an enemy-tint line-up", () => {
    const rows: Cell[][] = [
      JOB_IDS.map((jobId) => ({
        grid: jobFrame({ jobId, team: "enemy", state: "idle", view: "se", frame: 0 }),
        label: jobId.slice(0, 7),
      })),
      JOB_IDS.map((jobId) => ({
        grid: jobFrame({ jobId, team: "neutral", state: "idle", view: "se", frame: 0 }),
        label: jobId.slice(0, 7),
      })),
    ];
    write(`teams-${TAG}-3x.png`, contactSheet(rows, 3, `enemy / neutral ${TAG}`));
  });

  it("writes the remaining states", () => {
    const states: readonly AnimState[] = ["cast", "hurt", "downed"];
    const rows: Cell[][] = [];
    for (const jobId of JOB_IDS) {
      for (const state of states) {
        const row: Cell[] = [];
        for (let f = 0; f < ANIMATIONS[state].frames; f += 1) {
          row.push({ grid: jobFrame({ jobId, team: "player", state, view: "se", frame: f }), label: `${state}${f}` });
        }
        rows.push(row);
      }
    }
    write(`states-${TAG}-3x.png`, contactSheet(rows, 3, `cast / hurt / downed ${TAG}`));
  });
});
