// Dev-only viewer for the generated unit art. Serve with `npm run dev` and open
// /src/art/preview.html. Nothing in the game imports this.

import type { Team } from "../data/schemas/common.js";
import { JOB_ART, JOB_IDS, jobFrame, type JobId } from "./jobs.js";
import { SOOT_800, UI } from "./palette.js";
import { mirrorGrid, writeGridToImageData, type PixelGrid } from "./pixel.js";
import { AnimationPlayer } from "./player.js";
import { buildJobSheet } from "./sheet.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  DRAWN_VIEWS,
  SHEET_LAYOUT,
  type AnimState,
  type DrawnView,
} from "./sprites.js";

const TEAMS: readonly Team[] = ["player", "enemy", "neutral"];

let team: Team = "player";
let scale = 2;
let mirrored = false;

const scratch = document.createElement("canvas");
const scratchCtx = scratch.getContext("2d");

function paint(target: HTMLCanvasElement, grid: PixelGrid, factor: number): void {
  if (!scratchCtx) return;
  scratch.width = grid.width;
  scratch.height = grid.height;
  const image = scratchCtx.createImageData(grid.width, grid.height);
  writeGridToImageData(image, grid);
  scratchCtx.putImageData(image, 0, 0);

  target.width = grid.width * factor;
  target.height = grid.height * factor;
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(scratch, 0, 0, target.width, target.height);
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

interface LiveCell {
  readonly jobId: JobId;
  readonly view: DrawnView;
  readonly canvas: HTMLCanvasElement;
  readonly player: AnimationPlayer;
  readonly label: HTMLElement;
}

const live: LiveCell[] = [];
let liveState: AnimState = "idle";
let holdCast = false;

function buildLive(root: HTMLElement): void {
  const row = el("div", "row");
  for (const jobId of JOB_IDS) {
    for (const view of DRAWN_VIEWS) {
      const cell = el("div", "cell");
      const canvas = el("canvas");
      const label = el("div", "label", `${jobId}/${view}`);
      cell.append(canvas, label);
      row.append(cell);
      live.push({ jobId, view, canvas, player: new AnimationPlayer("idle"), label });
    }
  }
  root.append(row);
}

function restartLive(): void {
  for (const cell of live) cell.player.play(liveState, { hold: holdCast });
}

let last = 0;
function tick(now: number): void {
  const delta = last === 0 ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const cell of live) {
    cell.player.advanceSeconds(delta);
    const grid = jobFrame({
      jobId: cell.jobId,
      team,
      state: cell.player.state,
      view: cell.view,
      frame: cell.player.frame,
    });
    paint(cell.canvas, mirrored ? mirrorGrid(grid) : grid, scale);
    cell.label.textContent = `${cell.jobId}/${cell.view} ${cell.player.state}:${cell.player.frame}`;
  }
  requestAnimationFrame(tick);
}

function buildFrameTables(root: HTMLElement): void {
  for (const jobId of JOB_IDS) {
    const section = el("section");
    section.append(el("h2", undefined, `${jobId} — ${JOB_ART[jobId].read}`));
    for (const state of ANIM_STATES) {
      for (const view of DRAWN_VIEWS) {
        const row = el("div", "row");
        const clip = ANIMATIONS[state];
        row.append(el("div", "rowlabel", `${state}/${view}`));
        for (let frame = 0; frame < clip.frames; frame += 1) {
          const cell = el("div", "cell");
          const canvas = el("canvas");
          const grid = jobFrame({ jobId, team, state, view, frame });
          paint(canvas, mirrored ? mirrorGrid(grid) : grid, scale);
          cell.append(canvas, el("div", "label", `${frame} · ${clip.ticks[frame] ?? 0}t`));
          row.append(cell);
        }
        section.append(row);
      }
    }
    const sheetRow = el("div", "row");
    const sheetCanvas = el("canvas");
    paint(sheetCanvas, buildJobSheet(jobId, team), 2);
    sheetRow.append(
      el("div", "rowlabel", `sheet ${SHEET_LAYOUT.width}x${SHEET_LAYOUT.height}`),
      sheetCanvas,
    );
    section.append(sheetRow);
    root.append(section);
  }
}

function rebuild(): void {
  const tables = document.getElementById("tables");
  if (!tables) return;
  tables.textContent = "";
  buildFrameTables(tables);
}

function buildControls(root: HTMLElement): void {
  const bar = el("div", "controls");
  for (const value of TEAMS) {
    const button = el("button", undefined, value);
    button.addEventListener("click", () => {
      team = value;
      rebuild();
    });
    bar.append(button);
  }
  for (const state of ANIM_STATES) {
    const button = el("button", undefined, state);
    button.addEventListener("click", () => {
      liveState = state;
      restartLive();
    });
    bar.append(button);
  }
  const holdButton = el("button", undefined, "hold cast");
  holdButton.addEventListener("click", () => {
    holdCast = !holdCast;
    holdButton.textContent = holdCast ? "hold cast ✓" : "hold cast";
    restartLive();
  });
  const mirrorButton = el("button", undefined, "mirror");
  mirrorButton.addEventListener("click", () => {
    mirrored = !mirrored;
    mirrorButton.textContent = mirrored ? "mirror ✓" : "mirror";
    rebuild();
  });
  const zoomButton = el("button", undefined, "zoom");
  zoomButton.addEventListener("click", () => {
    scale = scale >= 8 ? 2 : scale + 2;
    rebuild();
  });
  bar.append(holdButton, mirrorButton, zoomButton);
  root.append(bar);
}

const app = document.getElementById("app");
if (app) {
  document.body.style.background = SOOT_800;
  document.body.style.color = UI.text;
  buildControls(app);
  const liveRoot = el("div", "liveroot");
  app.append(el("h2", undefined, "live playback"), liveRoot);
  buildLive(liveRoot);
  const tables = el("div");
  tables.id = "tables";
  app.append(tables);
  rebuild();
  requestAnimationFrame(tick);
}
