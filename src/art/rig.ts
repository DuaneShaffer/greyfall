// The shared humanoid armature. Every job draws the same 3-heads-tall chunky
// figure from the same joint set; jobs only vary build parameters, paint, and
// gear. Authoring is in rig space — `dx` from the centerline seam, `up` from
// the ground line at SPRITE_ANCHOR.y — so nothing has to think in canvas rows.
//
// Vertical landmarks (up from the ground line): feet 1, hips 15, shoulders 27,
// head box 28..40. 40 rows of figure with a 13px head is ART_DIRECTION's
// "3 heads tall, top-heavy" read, and leaves rows 0..3 as helmet/bob headroom.

import {
  OUTLINE_INDEX,
  TRANSPARENT,
  cloneGrid,
  isEmissiveIndex,
  layer,
  outlineGrid,
  overlayGrid,
  paletteIndex,
  patch,
  px,
  rasterize,
  rect,
  recessed,
  stamp,
  type DitherPattern,
  type Glyph,
  type Layer,
  type PixelGrid,
  type Point,
  type Prim,
  type Shade3,
} from "./pixel.js";
import { STEP } from "./materials.js";
import { SOOT_100, SOOT_900 } from "./palette.js";
import {
  ANIMATIONS,
  FIGURE_BOX_BOTTOM,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  type AnimState,
  type DrawnView,
} from "./sprites.js";

export const HIP_UP = 15;
export const SHOULDER_UP = 27;
export const HEAD_HEIGHT = 13;
/** Head center sits 7 above the shoulder line, putting the box at 28..40. */
export const HEAD_CENTER_OFFSET = 7;
export const TORSO_LENGTH = SHOULDER_UP - HIP_UP;

export interface RigPoint {
  readonly dx: number;
  readonly up: number;
}

/** Rig space -> canvas pixels. */
export const at = (dx: number, up: number): Point => ({
  x: SPRITE_ANCHOR.x + dx,
  y: SPRITE_ANCHOR.y - up,
});

export interface Build {
  /** Even widths keep the figure symmetric about the x=16 seam. */
  readonly headW: number;
  readonly shoulderW: number;
  readonly hipW: number;
  readonly legW: number;
  readonly armW: number;
  /** Horizontal gap between the two leg centers. */
  readonly stance: number;
  /** Constant forward pitch of the upper body, in pixels. */
  readonly pitch: number;
}

export interface Pose {
  readonly bob: number;
  readonly lean: number;
  readonly crouch: number;
  readonly torsoLean: number;
  readonly torsoLength: number;
  readonly headTilt: number;
  readonly headDrop: number;
  readonly legNear: { readonly dx: number; readonly lift: number };
  readonly legFar: { readonly dx: number; readonly lift: number };
  readonly handNear: RigPoint;
  readonly handFar: RigPoint;
  /** Direction a held prop points, from the near hand outward. */
  readonly propDir: RigPoint;
  /** Emissive growth for cast/operate, in pixels of radius. */
  readonly glow: number;
  readonly flash: boolean;
  /** 0 upright .. 1 fully collapsed; gear uses it to slacken. */
  readonly collapse: number;
}

/**
 * Reach box for held props, in rig space. A prop point outside it would put
 * gear against the canvas edge, where the silhouette outline cannot close.
 */
export const PROP_REACH = { dx: 11, minUp: 1, maxUp: 41 } as const;

const clampReach = (dx: number, up: number): RigPoint => ({
  dx: Math.max(-PROP_REACH.dx, Math.min(PROP_REACH.dx, dx)),
  up: Math.max(PROP_REACH.minUp, Math.min(PROP_REACH.maxUp, up)),
});

/** Point `t` pixels along the prop axis from a hand, clamped to the reach box. */
export function alongProp(hand: RigPoint, dir: RigPoint, t: number): RigPoint {
  const len = Math.hypot(dir.dx, dir.up) || 1;
  return clampReach(hand.dx + (dir.dx / len) * t, hand.up + (dir.up / len) * t);
}

export interface Joints {
  readonly hip: RigPoint;
  readonly shoulder: RigPoint;
  readonly head: RigPoint;
  readonly shoulderNear: RigPoint;
  readonly shoulderFar: RigPoint;
  readonly elbowNear: RigPoint;
  readonly elbowFar: RigPoint;
  readonly handNear: RigPoint;
  readonly handFar: RigPoint;
  readonly hipNear: RigPoint;
  readonly hipFar: RigPoint;
  readonly kneeNear: RigPoint;
  readonly kneeFar: RigPoint;
  readonly footNear: RigPoint;
  readonly footFar: RigPoint;
}

const mid = (a: RigPoint, b: RigPoint, dx: number, up: number): RigPoint => ({
  dx: (a.dx + b.dx) / 2 + dx,
  up: (a.up + b.up) / 2 + up,
});

export function jointsFor(build: Build, pose: Pose): Joints {
  const hipUp = HIP_UP - pose.crouch + pose.bob;
  const hipDx = pose.lean * 0.5 + build.pitch * 0.5;
  const hip: RigPoint = { dx: hipDx, up: hipUp };
  const shoulder: RigPoint = {
    dx: hipDx + pose.torsoLean + build.pitch,
    up: hipUp + pose.torsoLength,
  };
  // The head carries the widest gear; keeping its center inside +/-8 leaves
  // room for a helmet and its outline before the canvas edge.
  const head: RigPoint = {
    dx: Math.max(-8, Math.min(8, shoulder.dx + pose.headTilt)),
    up: shoulder.up + HEAD_CENTER_OFFSET - pose.headDrop,
  };

  const half = build.stance / 2;
  const shoulderHalf = build.shoulderW / 2 - 1;
  // Pauldrons hang off the shoulder joints; +/-11 keeps the widest of them and
  // its outline inside the canvas even at the extremes of the collapse pose.
  const shoulderSpan = (dx: number): number => Math.max(-11, Math.min(11, dx));
  const shoulderNear: RigPoint = {
    dx: shoulderSpan(shoulder.dx + shoulderHalf),
    up: shoulder.up - 1,
  };
  const shoulderFar: RigPoint = {
    dx: shoulderSpan(shoulder.dx - shoulderHalf),
    up: shoulder.up - 1,
  };
  const hipNear: RigPoint = { dx: hip.dx + half, up: hipUp };
  const hipFar: RigPoint = { dx: hip.dx - half, up: hipUp };
  const footNear: RigPoint = { dx: half + pose.legNear.dx, up: 1 + pose.legNear.lift };
  const footFar: RigPoint = { dx: -half + pose.legFar.dx, up: 1 + pose.legFar.lift };

  return {
    hip,
    shoulder,
    head,
    shoulderNear,
    shoulderFar,
    elbowNear: mid(shoulderNear, pose.handNear, 1, 0),
    elbowFar: mid(shoulderFar, pose.handFar, -1, 0),
    handNear: pose.handNear,
    handFar: pose.handFar,
    hipNear,
    hipFar,
    kneeNear: mid(hipNear, footNear, 1, 0),
    kneeFar: mid(hipFar, footFar, 0, 0),
    footNear,
    footFar,
  };
}

interface Span {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  /** True when the span runs across the canvas (a vertical form's row). */
  readonly horizontal: boolean;
}

/** The per-step spans of a tapered segment. Shared by `limb` and `shadedLimb`. */
function limbSpans(a: RigPoint, b: RigPoint, widthA: number, widthB: number): Span[] {
  const p0 = at(a.dx, a.up);
  const p1 = at(b.dx, b.up);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const steps = Math.max(Math.abs(Math.round(dx)), Math.abs(Math.round(dy)));
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const spans: Span[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = p0.x + dx * t;
    const y = p0.y + dy * t;
    const w = Math.max(1, Math.round(widthA + (widthB - widthA) * t));
    if (vertical) spans.push({ x: Math.round(x - w / 2), y: Math.round(y), w, horizontal: true });
    else spans.push({ x: Math.round(x), y: Math.round(y - w / 2), w, horizontal: false });
  }
  return spans;
}

/** Thick tapered segment between two rig points, in one flat color. */
export function limb(
  a: RigPoint,
  b: RigPoint,
  widthA: number,
  widthB: number,
  color: number,
): Prim[] {
  return limbSpans(a, b, widthA, widthB).map((s) =>
    s.horizontal ? rect(s.x, s.y, s.w, 1, color) : rect(s.x, s.y, 1, s.w, color),
  );
}

export interface ShadedLimbOptions {
  /** Cloth ≥5px wide keeps the light step off the silhouette (Appendix C.4). */
  readonly soft?: boolean;
  /** Suppress the shadow column where a neighbouring form already occludes it. */
  readonly noShadow?: boolean;
}

/**
 * A tapered segment carrying Appendix C.1's three steps *along its own axis*:
 * a vertical limb is shaded by column, a horizontal one by row. Shading a form
 * across its axis is the banding C.2 forbids, so the axis choice is not
 * cosmetic.
 */
export function shadedLimb(
  a: RigPoint,
  b: RigPoint,
  widthA: number,
  widthB: number,
  s: Shade3,
  options: ShadedLimbOptions = {},
): Prim[] {
  const prims: Prim[] = [];
  for (const span of limbSpans(a, b, widthA, widthB)) {
    const soft = options.soft === true && span.w >= 5;
    if (span.horizontal) {
      prims.push(rect(span.x, span.y, span.w, 1, s.base));
      if (span.w >= 2 && !options.noShadow) prims.push(px(span.x + span.w - 1, span.y, s.shadow));
      if (span.w >= 3) prims.push(px(span.x + (soft ? 1 : 0), span.y, s.light));
    } else {
      prims.push(rect(span.x, span.y, 1, span.w, s.base));
      if (span.w >= 2 && !options.noShadow) prims.push(px(span.x, span.y + span.w - 1, s.shadow));
      if (span.w >= 3) prims.push(px(span.x, span.y + (soft ? 1 : 0), s.light));
    }
  }
  return prims;
}

/** Axis-aligned box centered on a rig point. */
export function box(center: RigPoint, w: number, h: number, color: number): Prim {
  const p = at(center.dx, center.up);
  return rect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h, color);
}

/** Box centered on a rig point, carrying the three shading steps. */
export function shadedBox(center: RigPoint, w: number, h: number, s: Shade3): Prim[] {
  const p = at(center.dx, center.up);
  const x = Math.round(p.x - w / 2);
  const y = Math.round(p.y - h / 2);
  if (w <= 0 || h <= 0) return [];
  const prims: Prim[] = [rect(x, y, w, h, s.base)];
  if (w >= 3) prims.push(rect(x + w - 1, y, 1, h, s.shadow));
  if (h >= 3) prims.push(rect(x, y + h - 1, w, 1, s.shadow));
  if (w >= 3 && h >= 2) prims.push(rect(x, y, 1, h - 1, s.light));
  if (h >= 3 && w >= 2) prims.push(rect(x, y, w - 1, 1, s.light));
  return prims;
}

/** A dither band centered on a rig point (Appendix C.2's approved patterns). */
export function shadedPatch(
  center: RigPoint,
  w: number,
  h: number,
  color: number,
  pattern: DitherPattern = "checker",
): Prim {
  const p = at(center.dx, center.up);
  return patch(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h, color, pattern);
}

/**
 * Place a hand-authored glyph so that `originX, originY` inside it lands on a
 * rig point. Stamps translate with the joints and never deform, which is how
 * the hand-placed pixels survive the pose tables (Appendix C.6).
 */
export function stampAt(center: RigPoint, g: Glyph, originX: number, originY: number): Prim {
  const p = at(center.dx, center.up);
  return stamp(Math.round(p.x) - originX, Math.round(p.y) - originY, g);
}

/**
 * A job's materials, as Appendix C.4 shade triples. Every step a job paints
 * with comes from here or from `materials.ts` — never from a raw hex.
 */
export interface JobShades {
  /** The coat / torso material. */
  readonly cloth: Shade3;
  /** Harness, belts, straps. */
  readonly leather: Shade3;
  readonly boot: Shade3;
  readonly skin: Shade3;
  readonly hair: Shade3;
  /** The job's gear metal: plate for the Enforcer, graft for the Augmented. */
  readonly metal: Shade3;
}

export interface TintIndices {
  readonly base: number;
  readonly shadow: number;
}

/**
 * The character vocabulary hand-authored glyphs are written in. Fixed across
 * the roster so a head glyph reads the same way in every job file.
 */
export function glyphChars(sh: JobShades, tint: TintIndices): Record<string, number> {
  return {
    s: sh.skin.base,
    S: sh.skin.shadow,
    L: sh.skin.light,
    d: sh.skin.line,
    h: sh.hair.base,
    H: sh.hair.shadow,
    j: sh.hair.light,
    c: sh.cloth.base,
    C: sh.cloth.shadow,
    w: sh.cloth.light,
    f: sh.cloth.line,
    l: sh.leather.base,
    K: sh.leather.shadow,
    k: sh.leather.light,
    m: sh.metal.base,
    M: sh.metal.shadow,
    n: sh.metal.light,
    b: sh.boot.base,
    B: sh.boot.shadow,
    t: tint.base,
    T: tint.shadow,
    a: STEP.amber500,
    A: STEP.amber300,
    v: STEP.verdigris500,
    V: STEP.verdigris700,
    u: STEP.verdigris300,
    g: STEP.grip,
    p: STEP.brightblood,
    z: STEP.hazard,
    "1": STEP.spark,
    "2": STEP.soot300,
    "3": STEP.soot500,
    "4": STEP.soot700,
    "5": STEP.soot800,
    "6": STEP.umber900,
    "7": STEP.umber700,
    "8": STEP.copper700,
    "9": STEP.copper300,
  };
}

export interface GearContext {
  readonly view: DrawnView;
  readonly state: AnimState;
  readonly frame: number;
  readonly joints: Joints;
  readonly pose: Pose;
  readonly build: Build;
  readonly sh: JobShades;
  readonly tint: TintIndices;
  /** Glyph character map, already bound to this job's shades and team tint. */
  readonly chars: Record<string, number>;
}

export interface JobArt {
  readonly id: string;
  readonly read: string;
  readonly build: Build;
  readonly shades: JobShades;
  /**
   * The hand-authored head: a 12x15 glyph whose row 2 is head row 0 and whose
   * column 1 is the left edge of a 10px head. This is the master (Appendix C.3)
   * and it is stamped, never redrawn, so every pose carries the same face.
   */
  readonly head: (ctx: GearContext) => Glyph;
  /** Drawn behind the figure: packs, coat tails, far-side gear. */
  readonly back?: (ctx: GearContext) => Prim[];
  /** Drawn over torso and legs: harnesses, skirts, satchels, graft plates. */
  readonly front?: (ctx: GearContext) => Prim[];
  /** Drawn over the head stamp: crests, antennae, anything overhanging. */
  readonly headGear?: (ctx: GearContext) => Prim[];
  /** Drawn last: whatever the near hand carries. */
  readonly held?: (ctx: GearContext) => Prim[];
  /** Per-job pose adjustment, applied after the shared state table. */
  readonly posePass?: (pose: Pose, ctx: { state: AnimState; frame: number }) => Pose;
}

const FLASH_INDEX = paletteIndex(SOOT_100);
const SHADOW_INDEX = paletteIndex(SOOT_900);

function legPrims(ctx: GearContext, near: boolean): Prim[] {
  const j = ctx.joints;
  const sh = ctx.sh;
  const hip = near ? j.hipNear : j.hipFar;
  const knee = near ? j.kneeNear : j.kneeFar;
  const foot = near ? j.footNear : j.footFar;
  const cloth = near ? sh.cloth : recessed(sh.cloth);
  const boot = near ? sh.boot : recessed(sh.boot);
  const w = ctx.build.legW;
  const footBase = at(foot.dx, foot.up);
  const bx = Math.round(footBase.x - w / 2);
  return [
    ...shadedLimb(hip, knee, w + 1, w, cloth),
    ...shadedLimb(knee, foot, w, w, cloth),
    // The boot: a lit instep row over a shadow sole, so the foot has a top.
    rect(bx, footBase.y - 2, w + 1, 3, boot.base),
    rect(bx, footBase.y - 2, w, 1, boot.light),
    rect(bx, footBase.y, w + 1, 1, boot.shadow),
    px(bx + w, footBase.y - 1, boot.shadow),
  ];
}

function armPrims(ctx: GearContext, near: boolean): Prim[] {
  const j = ctx.joints;
  const sh = ctx.sh;
  const shoulder = near ? j.shoulderNear : j.shoulderFar;
  const elbow = near ? j.elbowNear : j.elbowFar;
  const hand = near ? j.handNear : j.handFar;
  const cloth = near ? sh.cloth : recessed(sh.cloth);
  const skin = near ? sh.skin : recessed(sh.skin);
  const w = ctx.build.armW;
  const p = at(hand.dx, hand.up);
  return [
    ...shadedLimb(shoulder, elbow, w + 1, w, cloth),
    ...shadedLimb(elbow, hand, w, w, cloth),
    // A cuff parts the sleeve from the hand without spending the outline.
    ...shadedLimb(
      { dx: (elbow.dx + hand.dx * 3) / 4, up: (elbow.up + hand.up * 3) / 4 },
      hand,
      w,
      w,
      { ...cloth, base: cloth.line, light: cloth.shadow, shadow: cloth.line },
    ),
    rect(Math.round(p.x - 1), Math.round(p.y - 1), 3, 3, skin.base),
    px(Math.round(p.x - 1), Math.round(p.y - 1), skin.light),
    px(Math.round(p.x + 1), Math.round(p.y + 1), skin.shadow),
  ];
}

function torsoPrims(ctx: GearContext): Prim[] {
  const j = ctx.joints;
  const sh = ctx.sh;
  const b = ctx.build;
  // Cloth ≥5px keeps its light step off the silhouette (Appendix C.4).
  const prims: Prim[] = [
    ...shadedLimb(j.hip, j.shoulder, b.hipW, b.shoulderW, sh.cloth, { soft: true }),
  ];
  // Interior separation: a coat seam on the shaded side from the front, the
  // spine from behind. Uses the local ramp's line step, never the outline.
  const seamDx = ctx.view === "se" ? -b.shoulderW / 2 + 3 : 0;
  const seam = mid(j.hip, j.shoulder, seamDx, 0);
  prims.push(
    ...limb(
      { dx: seam.dx, up: j.hip.up + 2 },
      { dx: seam.dx, up: j.shoulder.up - 2 },
      1,
      1,
      sh.cloth.line,
    ),
  );
  // Collar: the top of the torso catches the key light hardest.
  prims.push(
    box({ dx: j.shoulder.dx, up: j.shoulder.up }, b.shoulderW - 2, 1, sh.cloth.light),
    box({ dx: j.shoulder.dx, up: j.shoulder.up - 1 }, b.shoulderW - 2, 1, sh.cloth.base),
  );
  // Team tint, part one: a chest band under whatever gear the job wears
  // (Appendix A.6). It sits low on the ribs rather than at the collarbone so it
  // clears the pauldron trim — abutting the two turns the mask into one stripe
  // across the whole shoulder line, which is exactly what A.6 is trying to
  // avoid.
  const bandUp = j.shoulder.up - TINT_BAND_DROP;
  const bandW = Math.max(4, b.shoulderW - 4);
  prims.push(
    box({ dx: j.shoulder.dx, up: bandUp }, bandW, 2, ctx.tint.base),
    box({ dx: j.shoulder.dx, up: bandUp - 1 }, bandW, 1, ctx.tint.shadow),
  );
  return prims;
}

/**
 * Team tint, part two: pauldron trim, drawn over job gear so no silhouette can
 * bury a unit's allegiance. Together with the chest band this is the 5-12%
 * tint mask ART_DIRECTION calls for — never a whole-unit recolor.
 */
function tintTrimPrims(ctx: GearContext): Prim[] {
  const j = ctx.joints;
  const trim = (p: RigPoint): Prim[] => [
    box(p, 3, 2, ctx.tint.base),
    box({ dx: p.dx, up: p.up - 1 }, 3, 1, ctx.tint.shadow),
  ];
  return [...trim(j.shoulderNear), ...trim(j.shoulderFar)];
}

/**
 * Appendix A.6 geometry, and C.9.2's separation rule as a number: the chest
 * band drops this far below the shoulder line, the pauldron trim sits on it,
 * and the clear rows between them are what keep the mask from reading as one
 * stripe across the whole shoulder span.
 */
export const TINT_BAND_DROP = 6;
export const TINT_TRIM_DROP = 0;
/** Clear rows between the two parts of the mask. C.9.2 requires at least 2. */
export const TINT_MASK_SEPARATION = TINT_BAND_DROP - TINT_TRIM_DROP - 4;

/** Per-row width inset: a tapered crown and jaw keep the head off "box". */
const HEAD_PROFILE = [-4, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -4] as const;

export interface HeadRow {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

/** Canvas span of head row 0..12, honoring the taper. `grow` widens it. */
export function headRow(ctx: GearContext, row: number, grow = 0): HeadRow {
  const c = at(ctx.joints.head.dx, ctx.joints.head.up);
  const clamped = Math.max(0, Math.min(HEAD_HEIGHT - 1, Math.round(row)));
  const w = Math.max(2, ctx.build.headW + (HEAD_PROFILE[clamped] ?? 0) + grow * 2);
  return { x: Math.round(c.x - w / 2), y: c.y - 6 + clamped, w };
}

/** Rows [from, to] of head furniture in one color. */
export function headBand(
  ctx: GearContext,
  from: number,
  to: number,
  color: number,
  grow = 0,
): Prim[] {
  const prims: Prim[] = [];
  for (let row = from; row <= to; row += 1) {
    const r = headRow(ctx, row, grow);
    prims.push(rect(r.x, r.y, r.w, 1, color));
  }
  return prims;
}

/**
 * Head glyph geometry. Glyphs are 12 wide by 15 tall; column 1 is the left edge
 * of a 10px head and row 2 is head row 0, so `HEAD_GLYPH_ORIGIN` is the offset
 * from the head-joint pixel to the glyph's top-left.
 */
export const HEAD_GLYPH = { w: 12, h: 15, originX: 6, originY: 8 } as const;

/** Stamp the job's hand-authored head onto the head joint. */
function headPrims(ctx: GearContext, art: JobArt): Prim[] {
  return [stampAt(ctx.joints.head, art.head(ctx), HEAD_GLYPH.originX, HEAD_GLYPH.originY)];
}

/** Ground contact inside the sub-floor band; never outlined. */
export function contactPrims(ctx: GearContext): Prim[] {
  const pad = ctx.build.legW + 1;
  const left = Math.max(2, Math.round(SPRITE_ANCHOR.x + Math.min(ctx.joints.footNear.dx, ctx.joints.footFar.dx) - pad));
  const right = Math.min(
    SPRITE_WIDTH - 3,
    Math.round(SPRITE_ANCHOR.x + Math.max(ctx.joints.footNear.dx, ctx.joints.footFar.dx) + pad),
  );
  const w = Math.max(4, right - left + 1);
  const y = SPRITE_ANCHOR.y;
  return [rect(left, y, w, 1, SHADOW_INDEX), rect(left + 3, y + 1, Math.max(2, w - 6), 1, SHADOW_INDEX)];
}

/**
 * Appendix A.4: hurt frame 0 drops every interior color, keeping the outline
 * and anything emissive. Exported because derived external frames need the
 * identical treatment.
 */
export function flashInterior(grid: PixelGrid): PixelGrid {
  const out = cloneGrid(grid);
  for (let i = 0; i < out.data.length; i += 1) {
    const v = out.data[i] ?? 0;
    if (v === TRANSPARENT || v === OUTLINE_INDEX || isEmissiveIndex(v)) continue;
    out.data[i] = FLASH_INDEX;
  }
  return out;
}

export interface FigureOptions {
  readonly view: DrawnView;
  readonly state: AnimState;
  readonly frame: number;
  readonly tint: TintIndices;
}

/**
 * Rasterize one animation frame: body layers, then the closed silhouette
 * outline (emissive-aware), over the sub-floor contact band.
 */
export function renderFigure(art: JobArt, pose: Pose, options: FigureOptions): PixelGrid {
  const ctx: GearContext = {
    view: options.view,
    state: options.state,
    frame: options.frame,
    joints: jointsFor(art.build, pose),
    pose,
    build: art.build,
    sh: art.shades,
    tint: options.tint,
    chars: glyphChars(art.shades, options.tint),
  };

  const layers: Layer[] = [
    layer("back", art.back?.(ctx) ?? []),
    layer("legFar", legPrims(ctx, false)),
    layer("armFar", armPrims(ctx, false)),
    layer("torso", torsoPrims(ctx)),
    layer("legNear", legPrims(ctx, true)),
    layer("front", art.front?.(ctx) ?? []),
    layer("head", headPrims(ctx, art)),
    layer("headGear", art.headGear?.(ctx) ?? []),
    layer("armNear", armPrims(ctx, true)),
    layer("held", art.held?.(ctx) ?? []),
    layer("tint", tintTrimPrims(ctx)),
  ];

  let body = rasterize({ width: SPRITE_WIDTH, height: SPRITE_HEIGHT, layers });
  // The figure box is rows 0..43; nothing the rig draws may enter the band.
  for (let y = FIGURE_BOX_BOTTOM + 1; y < SPRITE_HEIGHT; y += 1) {
    for (let x = 0; x < SPRITE_WIDTH; x += 1) body.data[y * SPRITE_WIDTH + x] = TRANSPARENT;
  }
  // The outer 1px ring belongs to the outline, so the silhouette always closes.
  for (let x = 0; x < SPRITE_WIDTH; x += 1) body.data[x] = TRANSPARENT;
  for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
    body.data[y * SPRITE_WIDTH] = TRANSPARENT;
    body.data[y * SPRITE_WIDTH + SPRITE_WIDTH - 1] = TRANSPARENT;
  }
  if (pose.flash) body = flashInterior(body);

  const outline = outlineGrid(body, { maxY: FIGURE_BOX_BOTTOM });
  const contact = rasterize({
    width: SPRITE_WIDTH,
    height: SPRITE_HEIGHT,
    layers: [layer("contact", contactPrims(ctx))],
  });
  for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
    for (let x = 0; x < SPRITE_WIDTH; x += 1) contact.data[y * SPRITE_WIDTH + x] = TRANSPARENT;
  }
  return overlayGrid(overlayGrid(contact, outline), body);
}

// ---------------------------------------------------------------------------
// Pose tables. One shared set of body mechanics; jobs adjust via `posePass`.
// ---------------------------------------------------------------------------

const BASE_POSE: Pose = {
  bob: 0,
  lean: 0,
  crouch: 0,
  torsoLean: 0,
  torsoLength: TORSO_LENGTH,
  headTilt: 0,
  headDrop: 0,
  legNear: { dx: 0, lift: 0 },
  legFar: { dx: 0, lift: 0 },
  handNear: { dx: 5, up: 16 },
  handFar: { dx: -5, up: 16 },
  propDir: { dx: 0, up: 1 },
  glow: 0,
  flash: false,
  collapse: 0,
};

const pose = (over: Partial<Pose>): Pose => ({ ...BASE_POSE, ...over });

const WALK_NEAR_DX = [3, 1, -1, -3, -1, 2] as const;
const WALK_NEAR_LIFT = [0, 0, 0, 0, 2, 1] as const;
const WALK_FAR_DX = [-3, -1, 2, 3, 1, -1] as const;
const WALK_FAR_LIFT = [0, 2, 1, 0, 0, 0] as const;
const WALK_BOB = [0, -1, 1, 0, -1, 1] as const;

function walkPose(i: number): Pose {
  const nearDx = WALK_NEAR_DX[i] ?? 0;
  const farDx = WALK_FAR_DX[i] ?? 0;
  return pose({
    bob: WALK_BOB[i] ?? 0,
    lean: 1,
    legNear: { dx: nearDx, lift: WALK_NEAR_LIFT[i] ?? 0 },
    legFar: { dx: farDx, lift: WALK_FAR_LIFT[i] ?? 0 },
    handNear: { dx: 5 - Math.round(nearDx * 0.7), up: 16 },
    handFar: { dx: -5 - Math.round(farDx * 0.7), up: 16 },
    propDir: { dx: 0.15, up: 1 },
  });
}

const IDLE: readonly Pose[] = [
  pose({}),
  pose({ bob: 1, handNear: { dx: 5, up: 17 }, handFar: { dx: -5, up: 17 } }),
  pose({ bob: 1, headDrop: -1, handNear: { dx: 5, up: 17 }, handFar: { dx: -5, up: 17 } }),
  pose({ handNear: { dx: 5, up: 16 }, handFar: { dx: -5, up: 16 } }),
];

const ATTACK: readonly Pose[] = [
  pose({
    lean: -1,
    handNear: { dx: 3, up: 20 },
    handFar: { dx: -6, up: 17 },
    propDir: { dx: 0.3, up: 1 },
  }),
  pose({
    lean: -2,
    torsoLean: -1,
    legNear: { dx: 2, lift: 0 },
    handNear: { dx: 0, up: 25 },
    handFar: { dx: -7, up: 18 },
    propDir: { dx: -0.55, up: 0.85 },
  }),
  pose({
    lean: 3,
    bob: -1,
    torsoLean: 1,
    legNear: { dx: 4, lift: 0 },
    legFar: { dx: -2, lift: 0 },
    handNear: { dx: 9, up: 21 },
    handFar: { dx: -6, up: 14 },
    propDir: { dx: 1, up: -0.25 },
  }),
  pose({
    lean: 2,
    torsoLean: 1,
    legNear: { dx: 3, lift: 0 },
    legFar: { dx: -1, lift: 0 },
    handNear: { dx: 8, up: 15 },
    handFar: { dx: -6, up: 15 },
    propDir: { dx: 0.9, up: -0.6 },
  }),
  pose({
    handNear: { dx: 6, up: 16 },
    handFar: { dx: -5, up: 16 },
    propDir: { dx: 0.25, up: 1 },
  }),
];

const CAST: readonly Pose[] = [
  pose({ handNear: { dx: 5, up: 17 }, handFar: { dx: -5, up: 16 } }),
  pose({ lean: -1, glow: 1, handNear: { dx: 6, up: 22 }, handFar: { dx: -5, up: 18 } }),
  pose({ bob: 1, glow: 2, handNear: { dx: 6, up: 25 }, handFar: { dx: -6, up: 20 } }),
  pose({ glow: 1, handNear: { dx: 6, up: 25 }, handFar: { dx: -6, up: 20 } }),
  pose({
    lean: 2,
    glow: 3,
    handNear: { dx: 8, up: 23 },
    handFar: { dx: -5, up: 19 },
    propDir: { dx: 0.4, up: 0.95 },
  }),
  pose({ glow: 1, handNear: { dx: 5, up: 18 }, handFar: { dx: -5, up: 17 } }),
];

const HURT: readonly Pose[] = [
  pose({
    lean: -3,
    bob: -1,
    headTilt: -1,
    flash: true,
    legNear: { dx: 1, lift: 0 },
    legFar: { dx: -2, lift: 0 },
    handNear: { dx: 2, up: 19 },
    handFar: { dx: -8, up: 19 },
    propDir: { dx: -0.5, up: 0.85 },
  }),
  pose({
    lean: -2,
    headTilt: -1,
    legNear: { dx: 1, lift: 0 },
    legFar: { dx: -2, lift: 0 },
    handNear: { dx: 3, up: 18 },
    handFar: { dx: -7, up: 18 },
    propDir: { dx: -0.4, up: 0.9 },
  }),
  pose({
    lean: -1,
    handNear: { dx: 4, up: 17 },
    handFar: { dx: -6, up: 17 },
    propDir: { dx: -0.2, up: 1 },
  }),
];

const DOWNED: readonly Pose[] = [
  pose({
    crouch: 3,
    lean: -3,
    torsoLean: -2,
    headDrop: 2,
    headTilt: -1,
    collapse: 0.25,
    legNear: { dx: 3, lift: 0 },
    legFar: { dx: -3, lift: 0 },
    handNear: { dx: 7, up: 12 },
    handFar: { dx: -8, up: 13 },
    propDir: { dx: 0.5, up: 0.9 },
  }),
  pose({
    crouch: 7,
    torsoLean: -2,
    torsoLength: 11,
    headDrop: 2,
    collapse: 0.55,
    legNear: { dx: 4, lift: 0 },
    legFar: { dx: -3, lift: 0 },
    handNear: { dx: 7, up: 6 },
    handFar: { dx: -8, up: 8 },
    propDir: { dx: 0.8, up: 0.5 },
  }),
  pose({
    crouch: 10,
    torsoLean: -4,
    torsoLength: 7,
    headDrop: 4,
    headTilt: -2,
    collapse: 0.85,
    legNear: { dx: 6, lift: 0 },
    legFar: { dx: -1, lift: 0 },
    handNear: { dx: -6, up: 2 },
    handFar: { dx: 7, up: 3 },
    propDir: { dx: -0.9, up: 0.2 },
  }),
  pose({
    crouch: 11,
    torsoLean: -5,
    torsoLength: 3,
    headDrop: 5,
    headTilt: -4,
    collapse: 1,
    legNear: { dx: 8, lift: 0 },
    legFar: { dx: 3, lift: 0 },
    handNear: { dx: -8, up: 1 },
    handFar: { dx: 6, up: 2 },
    propDir: { dx: -1, up: 0.05 },
  }),
];

export function basePose(state: AnimState, frame: number): Pose {
  switch (state) {
    case "idle":
      return IDLE[frame] ?? BASE_POSE;
    case "walk":
      return walkPose(frame);
    case "attack":
      return ATTACK[frame] ?? BASE_POSE;
    case "cast":
      return CAST[frame] ?? BASE_POSE;
    case "hurt":
      return HURT[frame] ?? BASE_POSE;
    case "downed":
      return DOWNED[frame] ?? BASE_POSE;
  }
}

export function poseFor(art: JobArt, state: AnimState, frame: number): Pose {
  const clip = ANIMATIONS[state];
  if (frame < 0 || frame >= clip.frames) {
    throw new RangeError(`${state} has ${clip.frames} frames; got ${frame}`);
  }
  const base = basePose(state, frame);
  return art.posePass ? art.posePass(base, { state, frame }) : base;
}
