// The intake front door. Everything a follow-up agent needs to turn a folder of
// externally-produced 64x96 PNG masters into playable, animated job sheets:
//
//   const bytes = readFileSync("enforcer-se.png");
//   const { master, reports } = importExternalMaster({
//     id: "enforcer",
//     build: JOB_ART.enforcer.build,
//     views: { se: decodePNG(bytes), ne: decodePNG(neBytes) },
//     prop: { se: ENFORCER_PROP_SE, ne: ENFORCER_PROP_NE },
//     posePass: JOB_ART.enforcer.posePass,
//   });
//   for (const [view, report] of Object.entries(reports)) {
//     if (!report.ok) throw new Error(formatReport(report, `enforcer/${view}`));
//   }
//   const sheet = buildExternalSheet(retintMaster(master, "player", "enemy"));
//
// Nothing here repairs art. `reports` is the gate; the caller decides.

import type { Team } from "../data/schemas/common.js";
import { TEAM_TINT } from "./palette.js";
import {
  formatReport,
  quantizeToPalette,
  retint,
  type ConformanceReport,
  type QuantizeOptions,
  type RGBASource,
} from "./ingest.js";
import { paletteIndex, type PixelGrid } from "./pixel.js";
import type { Build, JobArt } from "./rig.js";
import {
  defaultRegionMap,
  type ExternalMaster,
  type FramePatch,
  type Landmarks,
  type RegionMap,
  type Segment,
} from "./segments.js";
import { DRAWN_VIEWS, type AnimState, type DrawnView } from "./sprites.js";

export interface ImportRequest {
  readonly id: string;
  /** Rig build the master was drawn to; proportions must match Appendix A.1. */
  readonly build: Build;
  /** Source images, one per drawn view. */
  readonly views: Readonly<Record<DrawnView, RGBASource>>;
  /** Pose the masters stand in. Defaults to idle frame 0. */
  readonly rest?: { readonly state: AnimState; readonly frame: number };
  /**
   * Extra regions cut before the standard six — job gear that crosses the
   * torso/leg boundary and must not be torn: a shield, a satchel, a coat tail,
   * a staff. Measure them off the master in canvas coordinates.
   */
  readonly prop?: Partial<Readonly<Record<DrawnView, readonly Segment[]>>>;
  /** Same per-job pose adjustment the generated art uses, if any. */
  readonly posePass?: JobArt["posePass"];
  readonly patches?: readonly FramePatch[];
  /**
   * Where the master's own shoulder and hip lines sit, if they are not the
   * rig's. A master drawn to the briefs' 5-head proportions needs these.
   */
  readonly landmarks?: Landmarks;
  readonly quantize?: QuantizeOptions;
  /** Which team's tint the masters were painted in. Defaults to player. */
  readonly sourceTeam?: Team;
}

export interface ImportResult {
  readonly master: ExternalMaster;
  readonly reports: Readonly<Record<DrawnView, ConformanceReport>>;
  readonly ok: boolean;
  /** Every report rendered for a log, conforming or not. */
  readonly summary: string;
}

const tintIndicesOf = (team: Team): readonly number[] => [
  paletteIndex(TEAM_TINT[team].base),
  paletteIndex(TEAM_TINT[team].shadow),
];

/**
 * Quantize both views, audit them, and assemble the animatable master. The
 * region maps come from `defaultRegionMap` — the rig's own six-way partition —
 * with any declared prop regions cut first.
 */
export function importExternalMaster(request: ImportRequest): ImportResult {
  const rest = request.rest ?? { state: "idle" as AnimState, frame: 0 };
  const views: Partial<Record<DrawnView, PixelGrid>> = {};
  const maps: Partial<Record<DrawnView, RegionMap>> = {};
  const reports: Partial<Record<DrawnView, ConformanceReport>> = {};

  for (const view of DRAWN_VIEWS) {
    const result = quantizeToPalette(request.views[view], request.quantize ?? {});
    views[view] = result.grid;
    reports[view] = result.report;
    maps[view] = defaultRegionMap(
      request.build,
      view,
      rest,
      request.prop?.[view] ?? [],
      request.posePass,
      request.landmarks ?? {},
    );
  }

  const master: ExternalMaster = {
    id: request.id,
    build: request.build,
    rest,
    views: views as Record<DrawnView, PixelGrid>,
    maps: maps as Record<DrawnView, RegionMap>,
    ...(request.posePass ? { posePass: request.posePass } : {}),
    ...(request.patches ? { patches: request.patches } : {}),
  };

  const full = reports as Record<DrawnView, ConformanceReport>;
  const ok = DRAWN_VIEWS.every((view) => full[view].ok);
  const summary = DRAWN_VIEWS.map((view) => formatReport(full[view], `${request.id}/${view}`)).join(
    "\n",
  );
  return { master, reports: full, ok, summary };
}

/** Recolor a master's team tint. Only the two tint indices move. */
export function retintMaster(master: ExternalMaster, from: Team, to: Team): ExternalMaster {
  const a = tintIndicesOf(from);
  const b = tintIndicesOf(to);
  const views: Partial<Record<DrawnView, PixelGrid>> = {};
  for (const view of DRAWN_VIEWS) views[view] = retint(master.views[view], a, b);
  return { ...master, views: views as Record<DrawnView, PixelGrid> };
}

/**
 * Declare a prop region. `x, y` are canvas coordinates on the master and the
 * region rides `anchor`; give `distal` when the gear should swing rather than
 * slide (a coat tail off the hip, a staff off the hand).
 */
export const propRegion = (
  x: number,
  y: number,
  w: number,
  h: number,
  anchor: Segment["anchor"],
  distal?: Segment["distal"],
): Segment => ({
  name: "prop",
  rect: { x, y, w, h },
  anchor,
  ...(distal ? { distal } : {}),
});
