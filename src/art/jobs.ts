// The seven job figures. Each one is the shared rig plus a build, a paint set,
// and gear drawn relative to the rig's joints — so every pose in every state
// carries the job's silhouette without a single hand-drawn frame.
//
// Mirror discipline (ART_DIRECTION §4): job-identifying gear sits adjacent to
// the body centerline, so a mirrored view reads as the unit turning rather
// than as a different unit.

import type { Team } from "../data/schemas/common.js";
import {
  AMBER_300,
  AMBER_500,
  BRIGHTBLOOD,
  COPPER_300,
  COPPER_500,
  COPPER_700,
  HAZARD,
  SOOT_100,
  SOOT_300,
  SOOT_500,
  SOOT_700,
  SOOT_800,
  TEAM_TINT,
  UMBER_300,
  UMBER_500,
  UMBER_700,
  UMBER_900,
  VERDIGRIS_500,
  VERDIGRIS_700,
  type Hex,
} from "./palette.js";
import { paletteIndex, rect, type PixelGrid, type Prim } from "./pixel.js";
import {
  alongProp,
  box,
  headBand,
  headRow,
  limb,
  poseFor,
  renderFigure,
  type JobArt,
  type Pose,
  type RigPoint,
  type TintIndices,
} from "./rig.js";
import type { AnimState, DrawnView } from "./sprites.js";

export const JOB_IDS = [
  "enforcer",
  "machinist",
  "conduit",
  "saboteur",
  "chemist",
  "augmented",
  "railrunner",
] as const;

export type JobId = (typeof JOB_IDS)[number];

const i = (hex: Hex): number => paletteIndex(hex);

const SOOT300 = i(SOOT_300);
const SOOT500 = i(SOOT_500);
const SOOT700 = i(SOOT_700);
const SOOT800 = i(SOOT_800);
const UMBER300 = i(UMBER_300);
const UMBER500 = i(UMBER_500);
const UMBER700 = i(UMBER_700);
const UMBER900 = i(UMBER_900);
const COPPER300 = i(COPPER_300);
const COPPER500 = i(COPPER_500);
const COPPER700 = i(COPPER_700);
const VERDIGRIS500 = i(VERDIGRIS_500);
const VERDIGRIS700 = i(VERDIGRIS_700);
const AMBER500 = i(AMBER_500);
const AMBER300 = i(AMBER_300);
const BRIGHT = i(BRIGHTBLOOD);
const HAZARD_I = i(HAZARD);

/** Emissive growth is capped at 2 so the amber budget survives the cast peak. */
const growth = (glow: number): number => Math.max(0, Math.min(2, Math.round(glow)));

/**
 * A powered element: body ramp step with a lit core, sized by the pose's glow.
 * Never outlined — `outlineGrid` gives it a halo instead.
 */
function emissive(center: RigPoint, w: number, h: number, glow: number, core = false): Prim[] {
  const g = growth(glow);
  const prims = [box(center, w + g * 2, h + g * 2, AMBER500)];
  if (core) {
    prims.push(box(center, Math.max(1, w + g * 2 - 2), Math.max(1, h + g * 2 - 2), AMBER300));
  }
  return prims;
}

/** Tilt a held prop outward while the figure is not mid-swing. */
const restingProp =
  (dx: number) =>
  (p: Pose, ctx: { state: AnimState; frame: number }): Pose =>
    ctx.state === "attack" && ctx.frame >= 1
      ? p
      : { ...p, propDir: { dx: p.propDir.dx + dx, up: p.propDir.up } };

// ---------------------------------------------------------------------------

const enforcer: JobArt = {
  id: "enforcer",
  read: "widest shoulders in the roster; riot shield squared across the body, short maul",
  build: { headW: 10, shoulderW: 16, hipW: 12, legW: 4, armW: 4, stance: 6, pitch: 0 },
  paint: {
    coat: SOOT_500,
    coatDark: SOOT_700,
    coatLight: SOOT_300,
    boot: SOOT_700,
    skin: UMBER_300,
    skinDark: UMBER_500,
    hair: SOOT_700,
  },
  posePass: restingProp(0.25),
  front: (c) => {
    const j = c.joints;
    const shield: RigPoint = { dx: j.hip.dx - 3, up: j.hip.up + 5 };
    return [
      box(j.shoulderFar, 6, 5, SOOT700),
      box(j.shoulderNear, 6, 5, SOOT300),
      box(j.shoulderNear, 6, 1, SOOT500),
      // The shield crosses the centerline: mirroring reads as a turn.
      box(shield, 11, 18, SOOT700),
      box(shield, 9, 16, SOOT300),
      box({ dx: shield.dx + 3, up: shield.up }, 2, 16, SOOT500),
      box(shield, 9, 2, c.tint.base),
      box({ dx: shield.dx, up: shield.up - 2 }, 9, 1, c.tint.shadow),
      box({ dx: shield.dx, up: shield.up + 6 }, 5, 1, SOOT500),
    ];
  },
  headGear: (c) => {
    const helm = [...headBand(c, 0, 6, SOOT500, 1), ...headBand(c, 8, 11, SOOT500)];
    if (c.view === "se") {
      return [
        ...helm,
        ...headBand(c, 5, 5, SOOT300, 1),
        ...headBand(c, 7, 7, SOOT800),
        ...headBand(c, 12, 12, SOOT700),
      ];
    }
    const ridge = headRow(c, 2);
    return [
      ...helm,
      ...headBand(c, 7, 7, SOOT500),
      rect(Math.round(ridge.x + ridge.w / 2) - 1, ridge.y, 2, 9, SOOT700),
      ...headBand(c, 11, 12, SOOT700),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    return [
      ...limb(alongProp(hand, dir, -4), alongProp(hand, dir, 9), 3, 3, UMBER500),
      box(alongProp(hand, dir, 12), 5, 6, COPPER700),
      box(alongProp(hand, dir, 13), 5, 2, SOOT300),
    ];
  },
};

const machinist: JobArt = {
  id: "machinist",
  read: "boxy backpack hump with an antenna spike above the shoulder line",
  build: { headW: 10, shoulderW: 12, hipW: 10, legW: 3, armW: 3, stance: 5, pitch: 0 },
  paint: {
    coat: UMBER_500,
    coatDark: UMBER_700,
    coatLight: UMBER_300,
    boot: SOOT_700,
    skin: UMBER_300,
    skinDark: UMBER_500,
    hair: SOOT_700,
  },
  back: (c) => {
    const j = c.joints;
    const packW = c.view === "se" ? 11 : 15;
    const packCenter: RigPoint = {
      dx: j.shoulder.dx + (c.view === "se" ? -5 : 0),
      up: j.shoulder.up - 4,
    };
    const mast: RigPoint = { dx: j.shoulder.dx + (c.view === "se" ? -8 : 5), up: j.shoulder.up + 3 };
    return [
      box(packCenter, packW, 14, COPPER700),
      box({ dx: packCenter.dx, up: packCenter.up + 6 }, packW, 1, COPPER300),
      box({ dx: packCenter.dx, up: packCenter.up - 6 }, packW, 1, UMBER900),
      // A bare whip antenna: the tip stays grey so it cannot be mistaken for
      // the Conduit's amber staff node at silhouette size.
      ...limb({ dx: mast.dx, up: mast.up - 2 }, { dx: mast.dx, up: mast.up + 8 }, 2, 1, SOOT300),
      box({ dx: mast.dx, up: mast.up + 9 }, 2, 1, SOOT300),
      ...emissive({ dx: packCenter.dx - 3, up: packCenter.up + 2 }, 2, 2, c.pose.glow),
    ];
  },
  front: (c) => {
    const j = c.joints;
    return [
      ...limb(
        { dx: j.shoulderNear.dx - 1, up: j.shoulderNear.up - 1 },
        { dx: j.hipFar.dx + 1, up: j.hipFar.up + 1 },
        3,
        3,
        UMBER700,
      ),
      box({ dx: j.hip.dx, up: j.hip.up + 1 }, c.build.hipW, 2, UMBER700),
      box({ dx: j.hip.dx - 3, up: j.hip.up + 2 }, 3, 4, COPPER700),
      box({ dx: j.hip.dx + 2, up: j.hip.up + 2 }, 3, 4, COPPER700),
      box({ dx: j.hip.dx + 2, up: j.hip.up + 4 }, 3, 1, COPPER300),
    ];
  },
  headGear: (c) => [
    ...headBand(c, 0, 3, UMBER700, 1),
    ...headBand(c, 4, 4, UMBER300, 1),
    ...(c.view === "se"
      ? [...headBand(c, 6, 7, SOOT300), ...headBand(c, 6, 6, SOOT700)]
      : headBand(c, 5, 6, UMBER700)),
  ],
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const tip = alongProp(hand, dir, 8);
    return [
      ...limb(alongProp(hand, dir, -2), tip, 2, 2, SOOT300),
      box(tip, 4, 2, COPPER300),
      box({ dx: tip.dx - 1, up: tip.up + 1 }, 1, 2, COPPER300),
      box({ dx: tip.dx + 1, up: tip.up + 1 }, 1, 2, COPPER300),
    ];
  },
};

const conduit: JobArt = {
  id: "conduit",
  read: "slightest frame, tall coil staff breaking the top of the canvas, one amber node",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 4, pitch: 0 },
  paint: {
    coat: SOOT_700,
    coatDark: UMBER_900,
    coatLight: SOOT_500,
    boot: UMBER_900,
    skin: UMBER_300,
    skinDark: UMBER_500,
    hair: SOOT_500,
  },
  front: (c) => {
    const j = c.joints;
    const hem: RigPoint = { dx: j.hip.dx - 1, up: 7 };
    return [
      // Long coat, open at the front: the hem stops above the boots.
      ...limb({ dx: j.hip.dx, up: j.hip.up + 2 }, hem, c.build.hipW, c.build.hipW + 4, SOOT700),
      ...limb({ dx: hem.dx, up: hem.up + 1 }, hem, 12, 14, UMBER900),
      ...limb({ dx: j.hip.dx, up: j.hip.up + 1 }, { dx: hem.dx, up: hem.up + 2 }, 2, 2, UMBER900),
      box({ dx: j.hip.dx - 3, up: j.hip.up - 1 }, 3, 9, SOOT500),
      box({ dx: j.shoulder.dx, up: j.shoulder.up + 1 }, 8, 1, COPPER300),
    ];
  },
  headGear: (c) => [
    ...headBand(c, 0, 3, SOOT500),
    ...headBand(c, 12, 12, COPPER300, 1),
    ...(c.view === "se" ? headBand(c, 4, 4, UMBER900) : []),
  ],
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const head = alongProp(hand, dir, 20);
    return [
      ...limb(alongProp(hand, dir, -14), head, 2, 2, UMBER300),
      box(alongProp(hand, dir, 15), 4, 1, COPPER300),
      box(alongProp(hand, dir, 17), 4, 1, COPPER300),
      box(alongProp(hand, dir, 19), 4, 1, COPPER300),
      ...emissive(alongProp(hand, dir, 22), 2, 2, c.pose.glow, true),
    ];
  },
};

const saboteur: JobArt = {
  id: "saboteur",
  read: "hooded and hunched, a hip satchel breaking the waistline, belt charges",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 5, pitch: 2 },
  paint: {
    coat: UMBER_700,
    coatDark: UMBER_900,
    coatLight: UMBER_500,
    boot: SOOT_700,
    skin: UMBER_300,
    skinDark: UMBER_500,
    hair: SOOT_700,
  },
  posePass: (p, ctx) =>
    ctx.state === "downed" ? p : { ...p, crouch: p.crouch + 1, headDrop: p.headDrop + 1 },
  front: (c) => {
    const j = c.joints;
    const side = c.view === "se" ? -1 : 1;
    const satchel: RigPoint = { dx: j.hip.dx + side * 4, up: j.hip.up - 1 };
    return [
      box({ dx: j.hip.dx, up: j.hip.up + 1 }, c.build.hipW + 2, 2, UMBER900),
      box({ dx: j.hip.dx - 3, up: j.hip.up + 3 }, 2, 4, COPPER700),
      box({ dx: j.hip.dx, up: j.hip.up + 3 }, 2, 4, COPPER700),
      box({ dx: j.hip.dx + 3, up: j.hip.up + 3 }, 2, 4, COPPER700),
      box({ dx: j.hip.dx, up: j.hip.up + 6 }, 1, 1, HAZARD_I),
      box(satchel, 9, 8, UMBER500),
      box({ dx: satchel.dx, up: satchel.up + 3 }, 9, 1, UMBER900),
      box({ dx: satchel.dx, up: satchel.up + 1 }, 2, 2, SOOT300),
    ];
  },
  headGear: (c) => {
    const peak = headRow(c, 0, -1);
    return [
      ...headBand(c, 0, 6, UMBER700, 1),
      rect(peak.x + 1, peak.y - 1, peak.w - 2, 1, UMBER700),
      ...headBand(c, 7, 8, UMBER900, 1),
      ...headBand(c, 9, 9, UMBER500, 1),
      ...(c.view === "se" ? [rect(headRow(c, 8).x + 2, headRow(c, 8).y, 2, 1, SOOT300)] : []),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    return [
      ...limb(alongProp(hand, dir, -1), alongProp(hand, dir, 6), 3, 3, COPPER700),
      box(alongProp(hand, dir, 7), 3, 1, SOOT300),
      box(alongProp(hand, dir, 8), 1, 1, HAZARD_I),
    ];
  },
};

const chemist: JobArt = {
  id: "chemist",
  read: "pale coat flaring to an A-shaped hem, flask bandolier, breathing mask",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 4, pitch: 0 },
  paint: {
    coat: SOOT_300,
    coatDark: SOOT_500,
    coatLight: SOOT_100,
    boot: UMBER_700,
    skin: UMBER_300,
    skinDark: UMBER_500,
    hair: SOOT_700,
  },
  front: (c) => {
    const j = c.joints;
    const hem: RigPoint = { dx: j.hip.dx, up: 8 };
    return [
      ...limb({ dx: j.hip.dx, up: j.hip.up + 2 }, hem, 10, 15, SOOT300),
      ...limb(
        { dx: j.hip.dx, up: j.hip.up + 1 },
        { dx: hem.dx, up: hem.up + 1 },
        8,
        11,
        VERDIGRIS700,
      ),
      box({ dx: hem.dx, up: hem.up }, 15, 1, SOOT500),
      ...limb(
        { dx: j.shoulderNear.dx - 1, up: j.shoulderNear.up - 2 },
        { dx: j.hipFar.dx + 1, up: j.hipFar.up + 2 },
        3,
        3,
        UMBER500,
      ),
      box({ dx: j.shoulder.dx + 2, up: j.shoulder.up - 3 }, 2, 2, VERDIGRIS500),
      box({ dx: j.shoulder.dx - 1, up: j.shoulder.up - 6 }, 2, 2, VERDIGRIS500),
    ];
  },
  headGear: (c) => [
    ...headBand(c, 0, 3, SOOT500),
    ...(c.view === "se"
      ? [
          ...headBand(c, 8, 11, SOOT500),
          rect(headRow(c, 9).x + 3, headRow(c, 9).y, 3, 2, VERDIGRIS700),
        ]
      : headBand(c, 4, 5, SOOT500)),
  ],
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const body = alongProp(hand, dir, 3);
    return [
      box(body, 4, 7, COPPER700),
      box(body, 2, 4, VERDIGRIS500),
      box({ dx: body.dx, up: body.up + 4 }, 4, 1, COPPER300),
    ];
  },
};

const augmented: JobArt = {
  id: "augmented",
  read: "lopsided: one oversized copper graft arm with amber seams, brightblood on the neck",
  build: { headW: 10, shoulderW: 16, hipW: 12, legW: 4, armW: 3, stance: 6, pitch: 0 },
  paint: {
    coat: SOOT_500,
    coatDark: SOOT_700,
    coatLight: SOOT_300,
    boot: SOOT_700,
    skin: UMBER_300,
    skinDark: UMBER_500,
    hair: SOOT_700,
  },
  front: (c) => {
    const j = c.joints;
    return [
      box({ dx: j.shoulder.dx - 1, up: j.shoulder.up - 3 }, 5, 2, UMBER500),
      // Brightblood scarring reads on the neck, right of the centerline.
      box({ dx: j.head.dx + 1, up: j.head.up - 6 }, 2, 1, BRIGHT),
      box({ dx: j.head.dx + 2, up: j.head.up - 4 }, 1, 1, BRIGHT),
    ];
  },
  headGear: (c) => {
    const plate = headRow(c, 3);
    return [
      ...headBand(c, 0, 2, SOOT700),
      rect(plate.x + plate.w - 4, plate.y, 4, 4, COPPER700),
      ...(c.view === "se" ? [rect(plate.x + plate.w - 3, plate.y + 1, 1, 1, AMBER500)] : []),
    ];
  },
  held: (c) => {
    const j = c.joints;
    const shoulder: RigPoint = { dx: j.shoulderNear.dx, up: j.shoulderNear.up + 1 };
    const elbow = j.elbowNear;
    const hand = j.handNear;
    const seamA: RigPoint = { dx: (shoulder.dx + elbow.dx) / 2, up: (shoulder.up + elbow.up) / 2 };
    const g = growth(c.pose.glow);
    return [
      box(shoulder, 7, 5, COPPER700),
      box({ dx: shoulder.dx, up: shoulder.up + 2 }, 7, 1, COPPER300),
      box({ dx: shoulder.dx, up: shoulder.up - 2 }, 7, 1, UMBER900),
      ...limb(shoulder, elbow, 5, 5, COPPER700),
      ...limb(elbow, hand, 5, 6, COPPER700),
      box(hand, 6, 4, COPPER300),
      ...limb(seamA, elbow, 1 + g, 1 + g, AMBER500),
      ...limb(
        elbow,
        { dx: (elbow.dx + hand.dx) / 2, up: (elbow.up + hand.up) / 2 },
        1 + g,
        1 + g,
        AMBER500,
      ),
      box(elbow, 1 + g, 1 + g, AMBER300),
    ];
  },
};

const railrunner: JobArt = {
  id: "railrunner",
  read: "lean and pitched forward, coat tail streaming back, coupling hook at the hip",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 5, pitch: 2 },
  paint: {
    coat: UMBER_500,
    coatDark: UMBER_700,
    coatLight: UMBER_300,
    boot: SOOT_700,
    skin: UMBER_300,
    skinDark: UMBER_500,
    hair: SOOT_700,
  },
  back: (c) => {
    const j = c.joints;
    const kick = c.state === "walk" ? 2 : 0;
    const tailWidth = c.view === "ne" ? 12 : 7;
    return [
      ...limb(
        { dx: j.hip.dx - 1, up: j.hip.up + 4 },
        { dx: j.hip.dx - 7 - kick, up: 5 - kick },
        8,
        tailWidth,
        UMBER700,
      ),
      ...limb(
        { dx: j.hip.dx - 1, up: j.hip.up + 4 },
        { dx: j.hip.dx - 7 - kick, up: 6 - kick },
        3,
        3,
        UMBER900,
      ),
    ];
  },
  front: (c) => {
    const j = c.joints;
    return [
      box({ dx: j.hip.dx, up: j.hip.up + 1 }, c.build.hipW + 1, 2, UMBER900),
      box({ dx: j.hip.dx + 3, up: j.hip.up + 2 }, 2, 1, COPPER300),
      box({ dx: j.shoulder.dx, up: j.shoulder.up + 1 }, 6, 1, UMBER300),
    ];
  },
  headGear: (c) => {
    const brow = headRow(c, 3, 1);
    return [
      ...headBand(c, 0, 2, SOOT700),
      rect(brow.x, brow.y, brow.w, 2, SOOT300),
      ...(c.view === "se"
        ? [
            rect(brow.x + 1, brow.y, 2, 2, COPPER300),
            rect(brow.x + brow.w - 3, brow.y, 2, 2, COPPER300),
          ]
        : [rect(brow.x + 2, brow.y + 1, brow.w - 4, 1, SOOT700)]),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const neck = alongProp(hand, dir, 6);
    const tip = alongProp(hand, dir, 9);
    return [
      ...limb(alongProp(hand, dir, -2), neck, 2, 2, SOOT300),
      box(tip, 6, 2, COPPER500),
      box({ dx: tip.dx + 2, up: tip.up - 2 }, 2, 4, COPPER500),
      box({ dx: tip.dx + 1, up: tip.up - 4 }, 3, 2, COPPER500),
      box({ dx: tip.dx - 2, up: tip.up + 1 }, 2, 1, COPPER300),
    ];
  },
};

export const JOB_ART = {
  enforcer,
  machinist,
  conduit,
  saboteur,
  chemist,
  augmented,
  railrunner,
} as const satisfies Record<JobId, JobArt>;

export const tintIndices = (team: Team): TintIndices => ({
  base: paletteIndex(TEAM_TINT[team].base),
  shadow: paletteIndex(TEAM_TINT[team].shadow),
});

export interface FrameRequest {
  readonly jobId: JobId;
  readonly team: Team;
  readonly state: AnimState;
  readonly view: DrawnView;
  readonly frame: number;
}

/** One 32x48 palette-index frame. Deterministic for a given request. */
export function jobFrame(request: FrameRequest): PixelGrid {
  const art = JOB_ART[request.jobId];
  const pose = poseFor(art, request.state, request.frame);
  return renderFigure(art, pose, {
    view: request.view,
    state: request.state,
    frame: request.frame,
    tint: tintIndices(request.team),
  });
}

export const isJobId = (value: string): value is JobId =>
  (JOB_IDS as readonly string[]).includes(value);
