import type { Team } from "../data/schemas/common.js";
import {
  AMBER_500,
  AMBER_GLOW,
  BLOOD_300,
  BRIGHTBLOOD,
  COPPER_300,
  COPPER_500,
  COPPER_700,
  HAZARD,
  OUTLINE_COLOR,
  SOOT_300,
  SOOT_500,
  SOOT_700,
  SOOT_800,
  TEAM_TINT,
  UMBER_300,
  UMBER_500,
  UMBER_700,
  VERDIGRIS_500,
  VERDIGRIS_700,
  type Hex,
} from "./palette.js";
import {
  ANIMATIONS,
  ANIM_STATES,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  type AnimState,
  type DrawnView,
} from "./sprites.js";

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

export type ShapeRole =
  | "shadow"
  | "body"
  | "head"
  | "weapon"
  | "gear"
  | "tint"
  | "emissive"
  | "detail";

export interface Shape {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: Hex;
  readonly role: ShapeRole;
}

export interface PlaceholderFrame {
  readonly index: number;
  readonly shapes: readonly Shape[];
}

export interface PlaceholderClip {
  readonly jobId: JobId;
  readonly team: Team;
  readonly state: AnimState;
  readonly view: DrawnView;
  readonly width: number;
  readonly height: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly frames: readonly PlaceholderFrame[];
}

type ViewTag = "both" | DrawnView;

/**
 * Anchor-relative placement: `dx` from the feet-center seam, `up` from the
 * feet line. Authoring in these terms is what keeps every job on one ruler.
 */
interface Block {
  readonly dx: number;
  readonly up: number;
  readonly w: number;
  readonly h: number;
  readonly color: Hex;
  readonly role: ShapeRole;
  readonly views: ViewTag;
}

interface JobSilhouette {
  readonly jobId: JobId;
  readonly read: string;
  readonly legWidth: number;
  readonly legGap: number;
  readonly torsoWidth: number;
  readonly torsoHeight: number;
  readonly headWidth: number;
  readonly headHeight: number;
  readonly bodyColor: Hex;
  readonly headColor: Hex;
  readonly pitch: number;
  readonly props: readonly Block[];
}

const LEG_HEIGHT = 12;

function block(
  dx: number,
  up: number,
  w: number,
  h: number,
  color: Hex,
  role: ShapeRole,
  views: ViewTag = "both",
): Block {
  return { dx, up, w, h, color, role, views };
}

export const JOB_SILHOUETTES = {
  enforcer: {
    jobId: "enforcer",
    read: "bulky, shield forward, short maul",
    legWidth: 5,
    legGap: 2,
    torsoWidth: 16,
    torsoHeight: 15,
    headWidth: 12,
    headHeight: 13,
    bodyColor: SOOT_500,
    headColor: SOOT_700,
    pitch: 0,
    props: [
      block(-11, 10, 7, 16, SOOT_700, "gear"),
      block(-10, 11, 5, 14, SOOT_300, "gear"),
      block(6, 14, 3, 16, UMBER_500, "weapon"),
      block(6, 28, 4, 4, COPPER_700, "weapon"),
      block(-8, 24, 16, 2, SOOT_700, "detail"),
      block(-5, 34, 10, 3, SOOT_800, "detail", "se"),
    ],
  },
  machinist: {
    jobId: "machinist",
    read: "medium build, backpack rig, deployable at the feet",
    legWidth: 4,
    legGap: 2,
    torsoWidth: 12,
    torsoHeight: 15,
    headWidth: 11,
    headHeight: 13,
    bodyColor: UMBER_500,
    headColor: UMBER_700,
    pitch: 0,
    props: [
      block(-10, 16, 5, 12, UMBER_700, "gear", "se"),
      block(-6, 16, 12, 13, UMBER_700, "gear", "ne"),
      block(-9, 25, 3, 3, AMBER_500, "emissive", "se"),
      block(-2, 26, 4, 3, AMBER_500, "emissive", "ne"),
      block(6, 16, 3, 8, COPPER_700, "weapon"),
      block(8, 0, 6, 5, COPPER_700, "gear"),
      block(10, 4, 2, 2, AMBER_GLOW, "emissive"),
      block(-5, 34, 10, 3, SOOT_800, "detail", "se"),
    ],
  },
  conduit: {
    jobId: "conduit",
    read: "slight frame, tall coil staff, licensed-attuned collar",
    legWidth: 4,
    legGap: 2,
    torsoWidth: 9,
    torsoHeight: 15,
    headWidth: 10,
    headHeight: 13,
    bodyColor: SOOT_700,
    headColor: SOOT_500,
    pitch: 0,
    props: [
      block(8, 2, 3, 34, UMBER_300, "weapon"),
      block(7, 30, 5, 5, COPPER_500, "weapon"),
      block(8, 36, 3, 3, AMBER_500, "emissive"),
      block(9, 39, 1, 1, AMBER_GLOW, "emissive"),
      block(-5, 26, 10, 2, COPPER_300, "detail"),
      block(-4, 34, 8, 3, SOOT_800, "detail", "se"),
    ],
  },
  saboteur: {
    jobId: "saboteur",
    read: "lean and hunched, satchel, belt charges",
    legWidth: 4,
    legGap: 2,
    torsoWidth: 11,
    torsoHeight: 14,
    headWidth: 10,
    headHeight: 12,
    bodyColor: UMBER_700,
    headColor: UMBER_500,
    pitch: 1,
    props: [
      block(-10, 8, 6, 9, UMBER_500, "gear", "se"),
      block(-6, 9, 12, 10, UMBER_500, "gear", "ne"),
      block(-4, 12, 3, 5, COPPER_700, "gear"),
      block(0, 12, 3, 5, COPPER_700, "gear"),
      block(4, 12, 3, 5, COPPER_700, "gear"),
      block(0, 16, 3, 1, HAZARD, "detail"),
      block(7, 18, 3, 7, SOOT_700, "weapon"),
      block(-4, 33, 8, 3, SOOT_800, "detail", "se"),
    ],
  },
  chemist: {
    jobId: "chemist",
    read: "apron flaring at the hem, canister flask",
    legWidth: 4,
    legGap: 2,
    torsoWidth: 10,
    torsoHeight: 15,
    headWidth: 10,
    headHeight: 13,
    bodyColor: SOOT_300,
    headColor: SOOT_500,
    pitch: 0,
    props: [
      block(-8, 4, 16, 14, VERDIGRIS_700, "gear"),
      block(-8, 16, 16, 2, VERDIGRIS_500, "detail"),
      block(7, 16, 5, 8, COPPER_700, "weapon"),
      block(8, 17, 3, 5, VERDIGRIS_500, "emissive"),
      block(8, 24, 3, 2, COPPER_300, "weapon"),
      block(-4, 34, 8, 3, SOOT_800, "detail", "se"),
    ],
  },
  augmented: {
    jobId: "augmented",
    read: "broadest and asymmetric, one oversized graft arm, brightblood scarring",
    legWidth: 5,
    legGap: 2,
    torsoWidth: 15,
    torsoHeight: 15,
    headWidth: 11,
    headHeight: 12,
    bodyColor: SOOT_500,
    headColor: SOOT_700,
    pitch: 0,
    props: [
      block(5, 10, 7, 20, COPPER_700, "weapon"),
      block(7, 12, 2, 16, AMBER_500, "emissive"),
      block(7, 28, 2, 2, AMBER_GLOW, "emissive"),
      block(-3, 27, 3, 2, BRIGHTBLOOD, "detail"),
      block(2, 29, 2, 2, BRIGHTBLOOD, "detail"),
      block(-5, 33, 10, 3, SOOT_800, "detail", "se"),
    ],
  },
  railrunner: {
    jobId: "railrunner",
    read: "lean, pitched forward, trailing coat, coupling hook",
    legWidth: 4,
    legGap: 3,
    torsoWidth: 9,
    torsoHeight: 14,
    headWidth: 10,
    headHeight: 12,
    bodyColor: UMBER_500,
    headColor: UMBER_700,
    pitch: 2,
    props: [
      block(-12, 6, 8, 18, UMBER_700, "gear", "se"),
      block(-7, 6, 14, 19, UMBER_700, "gear", "ne"),
      block(-11, 6, 6, 2, COPPER_300, "detail"),
      block(8, 20, 5, 4, COPPER_500, "weapon"),
      block(6, 22, 2, 8, SOOT_300, "weapon"),
      block(-4, 33, 8, 3, SOOT_800, "detail", "se"),
    ],
  },
} as const satisfies Record<JobId, JobSilhouette>;

interface FrameTransform {
  readonly bob: number;
  readonly lean: number;
  readonly legSwing: number;
  readonly weaponExtend: number;
  readonly emissiveGrow: number;
  readonly flash: Hex | null;
  readonly collapse: number;
}

const NO_TRANSFORM: FrameTransform = {
  bob: 0,
  lean: 0,
  legSwing: 0,
  weaponExtend: 0,
  emissiveGrow: 0,
  flash: null,
  collapse: 0,
};

function transformsFor(state: AnimState): readonly FrameTransform[] {
  const t = (over: Partial<FrameTransform>): FrameTransform => ({ ...NO_TRANSFORM, ...over });
  switch (state) {
    case "idle":
      return [t({}), t({}), t({ bob: -1 }), t({})];
    case "walk":
      return [
        t({ bob: -1, legSwing: 2 }),
        t({ legSwing: 1 }),
        t({ legSwing: 0, lean: 1 }),
        t({ bob: -1, legSwing: -2 }),
        t({ legSwing: -1 }),
        t({ legSwing: 0, lean: 1 }),
      ];
    case "attack":
      return [
        t({ lean: -2 }),
        t({ lean: -1, weaponExtend: -1 }),
        t({ lean: 3, bob: -1, weaponExtend: 5 }),
        t({ lean: 2, weaponExtend: 3 }),
        t({ lean: 0 }),
      ];
    case "cast":
      return [
        t({}),
        t({ bob: -1, emissiveGrow: 1 }),
        t({ bob: -1, emissiveGrow: 2 }),
        t({ bob: -1, emissiveGrow: 2 }),
        t({ bob: -2, emissiveGrow: 3 }),
        t({ emissiveGrow: 1 }),
      ];
    case "hurt":
      return [t({ lean: -3, bob: -1, flash: BLOOD_300 }), t({ lean: -2 }), t({ lean: 0 })];
    case "downed":
      return [
        t({ collapse: 0.25, lean: -1 }),
        t({ collapse: 0.55, lean: -2 }),
        t({ collapse: 0.85, lean: -3 }),
        t({ collapse: 1, lean: -4 }),
      ];
  }
}

function toShape(b: Block): Shape {
  return {
    x: SPRITE_ANCHOR.x + b.dx,
    y: SPRITE_ANCHOR.y - b.up - b.h,
    w: b.w,
    h: b.h,
    color: b.color,
    role: b.role,
  };
}

function baseBlocks(jobId: JobId, team: Team, view: DrawnView): readonly Block[] {
  const s: JobSilhouette = JOB_SILHOUETTES[jobId];
  const tint = TEAM_TINT[team];
  const torsoUp = LEG_HEIGHT;
  const headUp = torsoUp + s.torsoHeight;
  const halfTorso = Math.floor(s.torsoWidth / 2);
  const halfHead = Math.floor(s.headWidth / 2);
  const legOffset = Math.floor(s.legGap / 2);

  const shadow: Block[] = [
    { dx: -7, up: -1, w: 14, h: 1, color: OUTLINE_COLOR, role: "shadow", views: "both" },
    { dx: -5, up: -2, w: 10, h: 1, color: OUTLINE_COLOR, role: "shadow", views: "both" },
    { dx: -3, up: -3, w: 6, h: 1, color: OUTLINE_COLOR, role: "shadow", views: "both" },
  ];

  const legs: Block[] = [
    block(-legOffset - s.legWidth, 0, s.legWidth, LEG_HEIGHT, s.headColor, "body"),
    block(legOffset, 0, s.legWidth, LEG_HEIGHT, s.headColor, "body"),
  ];

  const core: Block[] = [
    block(-halfTorso, torsoUp, s.torsoWidth, s.torsoHeight, s.bodyColor, "body"),
    block(-halfHead, headUp, s.headWidth, s.headHeight, s.headColor, "head"),
    block(-halfTorso, torsoUp + s.torsoHeight - 5, s.torsoWidth, 3, tint.base, "tint"),
    block(-halfTorso, torsoUp + s.torsoHeight - 6, s.torsoWidth, 1, tint.shadow, "tint"),
  ];

  const props = s.props.filter((p) => p.views === "both" || p.views === view);
  return [...shadow, ...legs, ...core, ...props];
}

function clipToCanvas(shape: Shape): Shape | null {
  const x0 = Math.max(0, shape.x);
  const y0 = Math.max(0, shape.y);
  const x1 = Math.min(SPRITE_WIDTH, shape.x + shape.w);
  const y1 = Math.min(SPRITE_HEIGHT, shape.y + shape.h);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === shape.x && y0 === shape.y && x1 === shape.x + shape.w && y1 === shape.y + shape.h) {
    return shape;
  }
  return { ...shape, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function applyTransform(base: Shape, b: Block, t: FrameTransform): Shape {
  let { x, y, w, h } = base;
  let color = base.color;

  if (b.role !== "shadow") {
    y += t.bob;
    if (b.role === "body" && b.up === 0) {
      x += t.legSwing * (b.dx < 0 ? -1 : 1);
    } else {
      x += t.lean;
    }
  }
  if (b.role === "weapon" || b.role === "emissive") {
    x += t.weaponExtend;
    y -= Math.floor(t.weaponExtend / 2);
  }
  if (b.role === "emissive" && t.emissiveGrow > 0) {
    const g = t.emissiveGrow;
    x -= g;
    y -= g;
    w += g * 2;
    h += g * 2;
    color = AMBER_GLOW;
  }
  if (t.flash !== null && (b.role === "body" || b.role === "head")) {
    color = t.flash;
  }
  if (t.collapse > 0 && b.role !== "shadow") {
    const c = t.collapse;
    const above = SPRITE_ANCHOR.y - (y + h);
    const newAbove = Math.round(above * (1 - c));
    h = Math.max(1, Math.round(h * (1 - c * 0.6)));
    y = SPRITE_ANCHOR.y - newAbove - h;
    x += Math.round(c * 3 * (b.dx < 0 ? -1 : 1));
  }
  return { x, y, w, h, color, role: base.role };
}

export function buildPlaceholder(
  jobId: JobId,
  team: Team,
  state: AnimState,
  view: DrawnView = "se",
): PlaceholderClip {
  const blocks = baseBlocks(jobId, team, view);
  const transforms = transformsFor(state);
  const clip = ANIMATIONS[state];

  const frames: PlaceholderFrame[] = [];
  for (let i = 0; i < clip.frames; i += 1) {
    const t = transforms[i] ?? NO_TRANSFORM;
    const shapes: Shape[] = [];
    for (const b of blocks) {
      const clipped = clipToCanvas(applyTransform(toShape(b), b, t));
      if (clipped) shapes.push(clipped);
    }
    frames.push({ index: i, shapes });
  }

  return {
    jobId,
    team,
    state,
    view,
    width: SPRITE_WIDTH,
    height: SPRITE_HEIGHT,
    anchor: SPRITE_ANCHOR,
    frames,
  };
}

export function buildPlaceholderSet(
  jobId: JobId,
  team: Team,
  view: DrawnView = "se",
): Record<AnimState, PlaceholderClip> {
  const out = {} as Record<AnimState, PlaceholderClip>;
  for (const state of ANIM_STATES) {
    out[state] = buildPlaceholder(jobId, team, state, view);
  }
  return out;
}

/** The slice of CanvasRenderingContext2D placeholders actually need. */
export interface Canvas2DLike {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export interface DrawOptions {
  readonly originX?: number;
  readonly originY?: number;
  readonly scale?: number;
  readonly mirrored?: boolean;
}

export function drawShapes(
  ctx: Canvas2DLike,
  shapes: readonly Shape[],
  options: DrawOptions = {},
): void {
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  const scale = options.scale ?? 1;
  const mirrored = options.mirrored ?? false;

  for (const shape of shapes) {
    const sx = mirrored ? SPRITE_WIDTH - (shape.x + shape.w) : shape.x;
    ctx.fillStyle = shape.color;
    ctx.fillRect(originX + sx * scale, originY + shape.y * scale, shape.w * scale, shape.h * scale);
  }
}

export function drawToCanvas(
  ctx: Canvas2DLike,
  clip: PlaceholderClip,
  frameIndex: number,
  options: DrawOptions = {},
): void {
  const frame = clip.frames[frameIndex];
  if (!frame) {
    throw new RangeError(`${clip.jobId}/${clip.state} has ${clip.frames.length} frames`);
  }
  drawShapes(ctx, frame.shapes, options);
}

/** Every color a job/team/view combination can emit, across all states. */
export function placeholderColors(jobId: JobId, team: Team, view: DrawnView = "se"): Set<Hex> {
  const colors = new Set<Hex>();
  for (const state of ANIM_STATES) {
    for (const frame of buildPlaceholder(jobId, team, state, view).frames) {
      for (const shape of frame.shapes) colors.add(shape.color);
    }
  }
  return colors;
}
