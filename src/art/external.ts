// Externally-produced masters, and how each one is animated.
//
// The grids in `masters/` are delivered art (see `tools/ingest-master.ts`); this
// file holds the decisions that turn them into 56 frames: where each master's own
// shoulder and hip lines sit, and which gear has to be cut as a prop so the
// region split does not tear it. Everything still goes through the same front
// door the contract describes — quantize, audit, segment, derive — so the
// report is available at load rather than only at generation time.
//
// Six of the seven deliveries carry a back three-quarter cell as well as a
// front, and that cell drives the away-facing rows: a unit that turns around
// shows its pack, its coat tail and its wire spool instead of its face. Vale's
// delivery had one view, and for him the front master still stands in for both —
// the C.8.6 cost of a single-view delivery, recorded rather than hidden.

import type { Team } from "../data/schemas/common.js";
import { importExternalMaster, propRegion, retintMaster } from "./intake.js";
import { JOB_ART, JOB_IDS, type JobId } from "./jobs.js";
import { SE_BASE64 as AUGMENTED_SE, NE_BASE64 as AUGMENTED_NE } from "./masters/augmented.js";
import { SE_BASE64 as CHEMIST_SE, NE_BASE64 as CHEMIST_NE } from "./masters/chemist.js";
import { SE_BASE64 as CONDUIT_SE } from "./masters/conduit.js";
import { SE_BASE64 as ENFORCER_SE, NE_BASE64 as ENFORCER_NE } from "./masters/enforcer.js";
import { SE_BASE64 as MACHINIST_SE, NE_BASE64 as MACHINIST_NE } from "./masters/machinist.js";
import { SE_BASE64 as RAILRUNNER_SE, NE_BASE64 as RAILRUNNER_NE } from "./masters/railrunner.js";
import { SE_BASE64 as SABOTEUR_SE, NE_BASE64 as SABOTEUR_NE } from "./masters/saboteur.js";
import { createGrid, gridToRGBA, type PixelGrid } from "./pixel.js";
import {
  buildExternalSheet,
  type ExternalMaster,
  type Landmarks,
  type Segment,
} from "./segments.js";
import type { ConformanceReport } from "./ingest.js";
import { SPRITE_HEIGHT, SPRITE_WIDTH, type DrawnView } from "./sprites.js";

interface Delivery {
  readonly se: string;
  /**
   * The back three-quarter cell. Absent where the delivery had none, and then
   * the front master stands in — a gap in the art, not in the pipeline, and it
   * reads as a unit that never turns around (C.8.6).
   */
  readonly ne?: string;
  /**
   * Measured off the fitted master, not off the rig: these are drawn at the
   * briefs' 5-to-5.5-head proportions, so their shoulders and hips sit lower
   * than the 3-head armature's. Both cells of a delivery are reduced at one
   * shared scale, so one pair of rows serves both views.
   */
  readonly landmarks: Landmarks;
  readonly props?: Partial<Readonly<Record<DrawnView, readonly Segment[]>>>;
  /** Which team's tint the master was painted in. */
  readonly sourceTeam: Team;
  /**
   * Facing normalization (ART_DIRECTION C.8, facing convention): every drawn
   * `se` cell must face down-screen-right and every drawn `ne` cell must face
   * up-screen-right, so a facing's mirror decision (`sprites.ts`,
   * `APPARENT_VIEWS`) always lands the figure on the intended side. A delivery
   * that violates this on one view declares that view here; the flip is
   * applied to the derived frame, never to the committed master pixels.
   */
  readonly mirror?: Readonly<Partial<Record<DrawnView, boolean>>>;
}

const DELIVERIES: Partial<Record<JobId, Delivery>> = {
  conduit: {
    se: CONDUIT_SE,
    landmarks: { shoulderRow: 24, hipRow: 46 },
    // The coil staff runs the full height of the canvas down the far side and
    // would otherwise be split across head, arm, torso and leg regions.
    props: { se: [propRegion(11, 0, 14, 86, "handFar", "handFar")] },
    sourceTeam: "player",
  },
  enforcer: {
    se: ENFORCER_SE,
    ne: ENFORCER_NE,
    landmarks: { shoulderRow: 29, hipRow: 52 },
    // The tower shield spans shoulder to shin down the near side, and the shock
    // maul hangs below the far hand past the hip line. Both would be quartered
    // by the default cut.
    props: {
      se: [propRegion(41, 26, 22, 50, "hip"), propRegion(1, 60, 16, 24, "handFar", "handFar")],
      ne: [propRegion(7, 24, 16, 46, "hip"), propRegion(40, 58, 18, 24, "handNear", "handNear")],
    },
    sourceTeam: "player",
    // The delivered se cell stands the figure facing up-screen-left instead of
    // down-screen-right (C.8 facing convention): mirrored back at intake so
    // east reads facing-right and south (se, mirrored again by the facing
    // table) reads facing-left, as the cardinal rules require.
    mirror: { se: true },
  },
  machinist: {
    se: MACHINIST_SE,
    ne: MACHINIST_NE,
    landmarks: { shoulderRow: 26, hipRow: 50 },
    // The antenna pack: the whip rises well above the shoulder line and the
    // pack itself straddles it, so head and torso would tear it in two. The
    // spanner runs from the far hand down past the hip.
    props: {
      se: [propRegion(42, 2, 22, 52, "shoulderNear"), propRegion(1, 60, 22, 26, "handFar", "handFar")],
      ne: [propRegion(6, 2, 26, 52, "shoulderFar"), propRegion(40, 60, 22, 26, "handNear", "handNear")],
    },
    sourceTeam: "player",
  },
  saboteur: {
    se: SABOTEUR_SE,
    ne: SABOTEUR_NE,
    landmarks: { shoulderRow: 27, hipRow: 50 },
    // Charge satchel across the hip, and the shaped charge in the far hand with
    // its fuse trailing below it.
    props: {
      se: [propRegion(26, 42, 26, 26, "hip"), propRegion(1, 56, 18, 22, "handFar", "handFar")],
      ne: [propRegion(14, 42, 26, 26, "hip"), propRegion(42, 56, 18, 22, "handNear", "handNear")],
    },
    sourceTeam: "player",
  },
  chemist: {
    se: CHEMIST_SE,
    ne: CHEMIST_NE,
    landmarks: { shoulderRow: 20, hipRow: 46 },
    // The split work coat hangs from the hips to the boots and the flask
    // bandolier crosses the chest; the injectors sit below both hands.
    props: {
      se: [propRegion(20, 44, 26, 32, "hip"), propRegion(1, 56, 18, 24, "handFar", "handFar")],
      ne: [propRegion(18, 44, 26, 32, "hip"), propRegion(44, 56, 18, 24, "handNear", "handNear")],
    },
    sourceTeam: "player",
  },
  augmented: {
    se: AUGMENTED_SE,
    ne: AUGMENTED_NE,
    landmarks: { shoulderRow: 16, hipRow: 45 },
    // The graft arm is one continuous mass from the neck to below the hip on the
    // near side, and the amber seam runs its whole length. Cutting it at the hip
    // line would break the seam in half.
    props: {
      se: [propRegion(38, 6, 26, 56, "shoulderNear", "handNear")],
      ne: [propRegion(1, 6, 26, 56, "shoulderFar", "handFar")],
    },
    sourceTeam: "player",
  },
  railrunner: {
    se: RAILRUNNER_SE,
    ne: RAILRUNNER_NE,
    landmarks: { shoulderRow: 26, hipRow: 49 },
    // The riding coat's tail kicks backward off the hip past the knee, and the
    // coupling hook hangs the length of the far arm.
    props: {
      se: [propRegion(34, 40, 28, 34, "hip", "footNear"), propRegion(1, 56, 16, 26, "handFar", "handFar")],
      ne: [propRegion(4, 40, 30, 34, "hip", "footFar"), propRegion(46, 56, 16, 26, "handNear", "handNear")],
    },
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

const asSource = (base64: string): { width: number; height: number; data: Uint8ClampedArray } => {
  const grid = decodeGrid(base64);
  return { width: grid.width, height: grid.height, data: gridToRGBA(grid) };
};

export interface ExternalArt {
  readonly master: ExternalMaster;
  readonly reports: Readonly<Record<DrawnView, ConformanceReport>>;
  readonly ok: boolean;
  readonly summary: string;
  /** 2 where a back three-quarter cell was delivered, 1 where the front stands in. */
  readonly drawnViews: 1 | 2;
}

const CACHE = new Map<JobId, ExternalArt>();

/** The delivered master for a job, or null where the generator still stands. */
export function externalArt(jobId: JobId): ExternalArt | null {
  const delivery = DELIVERIES[jobId];
  if (!delivery) return null;
  const hit = CACHE.get(jobId);
  if (hit) return hit;

  const se = asSource(delivery.se);
  const ne = delivery.ne ? asSource(delivery.ne) : se;
  const props = delivery.props ?? {};
  const art = JOB_ART[jobId];
  const built = importExternalMaster({
    id: jobId,
    build: art.build,
    views: { se, ne },
    prop: { se: props.se ?? [], ne: props.ne ?? props.se ?? [] },
    landmarks: delivery.landmarks,
    sourceTeam: delivery.sourceTeam,
    ...(art.posePass ? { posePass: art.posePass } : {}),
    ...(delivery.mirror ? { mirror: delivery.mirror } : {}),
  });
  const result: ExternalArt = { ...built, drawnViews: delivery.ne ? 2 : 1 };
  CACHE.set(jobId, result);
  return result;
}

/** In `JOB_IDS` order, never object-key order. */
export const EXTERNAL_JOBS: readonly JobId[] = JOB_IDS.filter((id) => DELIVERIES[id] !== undefined);

export const hasExternalArt = (jobId: JobId): boolean => DELIVERIES[jobId] !== undefined;

const SHEETS = new Map<string, PixelGrid>();

/**
 * The 56-frame sheet derived from a delivered master, or null. Cached per
 * job/team: deriving one is 56 segment-cut-and-recomposite passes, and the whole
 * roster now takes this path.
 */
export function externalJobSheet(jobId: JobId, team: Team): PixelGrid | null {
  const art = externalArt(jobId);
  if (!art) return null;
  const key = `${jobId}:${team}`;
  const hit = SHEETS.get(key);
  if (hit) return hit;
  const delivery = DELIVERIES[jobId] as Delivery;
  const sheet = buildExternalSheet(retintMaster(art.master, delivery.sourceTeam, team));
  SHEETS.set(key, sheet);
  return sheet;
}
