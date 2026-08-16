// Externally-produced masters, and how each one is animated.
//
// The grid in `masters/` is delivered art (see `tools/ingest-master.ts`); this
// file holds the decisions that turn it into 56 frames: where the master's own
// shoulder and hip lines sit, and which gear has to be cut as a prop so the
// region split does not tear it. Everything still goes through the same front
// door the contract describes — quantize, audit, segment, derive — so the
// report is available at load rather than only at generation time.

import type { Team } from "../data/schemas/common.js";
import { importExternalMaster, propRegion, retintMaster } from "./intake.js";
import { JOB_ART, type JobId } from "./jobs.js";
import { GRID_BASE64 as CONDUIT_GRID } from "./masters/conduit.js";
import { createGrid, gridToRGBA, type PixelGrid } from "./pixel.js";
import {
  buildExternalSheet,
  type ExternalMaster,
  type Landmarks,
  type Segment,
} from "./segments.js";
import type { ConformanceReport } from "./ingest.js";
import { SPRITE_HEIGHT, SPRITE_WIDTH } from "./sprites.js";

interface Delivery {
  readonly grid: string;
  readonly landmarks: Landmarks;
  readonly props: readonly Segment[];
  /** Which team's tint the master was painted in. */
  readonly sourceTeam: Team;
}

const DELIVERIES: Partial<Record<JobId, Delivery>> = {
  conduit: {
    grid: CONDUIT_GRID,
    // Measured off the master: it is drawn at the briefs' 5-head proportions,
    // so its shoulders and hips sit lower than the 3-head armature's.
    landmarks: { shoulderRow: 24, hipRow: 46 },
    // The coil staff runs the full height of the canvas down the far side and
    // would otherwise be split across head, arm, torso and leg regions.
    props: [propRegion(11, 0, 14, 86, "handFar", "handFar")],
    sourceTeam: "player",
  },
};

function decodeGrid(base64: string): PixelGrid {
  const binary = atob(base64);
  const grid = createGrid(SPRITE_WIDTH, SPRITE_HEIGHT);
  if (binary.length !== grid.data.length) {
    throw new Error(`external master is ${binary.length} bytes, canvas needs ${grid.data.length}`);
  }
  for (let i = 0; i < binary.length; i += 1) grid.data[i] = binary.charCodeAt(i);
  return grid;
}

export interface ExternalArt {
  readonly master: ExternalMaster;
  readonly reports: Readonly<Record<"se" | "ne", ConformanceReport>>;
  readonly ok: boolean;
  readonly summary: string;
}

const CACHE = new Map<JobId, ExternalArt>();

/** The delivered master for a job, or null where the generator still stands. */
export function externalArt(jobId: JobId): ExternalArt | null {
  const delivery = DELIVERIES[jobId];
  if (!delivery) return null;
  const hit = CACHE.get(jobId);
  if (hit) return hit;

  const grid = decodeGrid(delivery.grid);
  const source = { width: grid.width, height: grid.height, data: gridToRGBA(grid) };
  const art = JOB_ART[jobId];
  const built = importExternalMaster({
    id: jobId,
    build: art.build,
    // The brief asked for a front/back pair and the delivery is front only, so
    // the front master stands in for the back view. That is a gap in the art,
    // not in the pipeline, and it reads as a unit that never turns around.
    views: { se: source, ne: source },
    prop: { se: delivery.props, ne: delivery.props },
    landmarks: delivery.landmarks,
    sourceTeam: delivery.sourceTeam,
    ...(art.posePass ? { posePass: art.posePass } : {}),
  });
  CACHE.set(jobId, built);
  return built;
}

export const EXTERNAL_JOBS: readonly JobId[] = Object.keys(DELIVERIES) as JobId[];

export const hasExternalArt = (jobId: JobId): boolean => DELIVERIES[jobId] !== undefined;

/** The 56-frame sheet derived from a delivered master, or null. */
export function externalJobSheet(jobId: JobId, team: Team): PixelGrid | null {
  const art = externalArt(jobId);
  if (!art) return null;
  const delivery = DELIVERIES[jobId] as Delivery;
  return buildExternalSheet(retintMaster(art.master, delivery.sourceTeam, team));
}
