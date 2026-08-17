// Segmentation and pose derivation for external masters (ART_DIRECTION
// Appendix C.8). One hand-drawn idle frame becomes the whole 28-frame view.
//
// The model is a paper doll. A **region map** partitions the master's canvas
// into named regions, each bound to one rig joint (and optionally a second,
// distal one). To make a frame, every region is cut out of the master and
// translated by the delta between the joint's rest position and its position in
// the target pose; regions with a distal joint additionally *shear*, so a leg
// swings from the hip instead of sliding sideways. The pieces are composited in
// the rig's own z-order, seams are closed, and the silhouette outline and
// contact shadow are re-derived from scratch — the master's own outline is
// discarded on the way in, because a translated outline is not a silhouette.
//
// What this deliberately does not do: rotate. Props translate with the hand and
// keep their drawn angle. A swing that needs the weapon to turn is a per-frame
// patch, not a transform, because rotating pixel art at this density destroys it.

import { at, jointsFor, poseFor, toPx, type Build, type Joints, type JobArt, type Pose } from "./rig.js";
import { contactPrims, flashInterior } from "./rig.js";
import {
  OUTLINE_INDEX,
  TRANSPARENT,
  createGrid,
  gridGet,
  gridSet,
  layer,
  outlineGrid,
  overlayGrid,
  rasterize,
  type PixelGrid,
  type Prim,
} from "./pixel.js";
import {
  ANIMATIONS,
  DRAWN_VIEWS,
  FIGURE_BOX_BOTTOM,
  RIG_UNIT,
  SHEET_LAYOUT,
  SPRITE_ANCHOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  type AnimState,
  type DrawnView,
} from "./sprites.js";

/**
 * Regions in cut order: the first region whose rect contains a pixel claims it.
 * `prop` is first so job gear that crosses the body (a shield, a satchel, a
 * staff) is never torn in half by the torso/leg split.
 */
export const SEGMENT_NAMES = [
  "prop",
  "head",
  "armFar",
  "armNear",
  "torso",
  "legFar",
  "legNear",
] as const;

export type SegmentName = (typeof SEGMENT_NAMES)[number];

/** Draw order, back to front. Mirrors `renderFigure`'s layer stack. */
export const SEGMENT_Z: readonly SegmentName[] = [
  "legFar",
  "armFar",
  "torso",
  "legNear",
  "head",
  "armNear",
  "prop",
];

export type JointName = keyof Joints;

export interface SegmentRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Segment {
  readonly name: SegmentName;
  readonly rect: SegmentRect;
  /** The joint this region rides. */
  readonly anchor: JointName;
  /**
   * Optional far end. Pixels are shifted by an interpolation of the anchor and
   * distal deltas, weighted by how far along the anchor→distal axis they sit,
   * which is what turns a translation into a swing.
   */
  readonly distal?: JointName;
}

export interface RegionMap {
  readonly view: DrawnView;
  readonly segments: readonly Segment[];
}

/** Per-frame repair, applied after derivation. The escape hatch of C.6. */
export interface FramePatch {
  readonly state: AnimState;
  readonly view: DrawnView;
  readonly frame: number;
  /** Cleared before the patch draws, in canvas coordinates. */
  readonly clear?: readonly SegmentRect[];
  readonly prims?: readonly Prim[];
}

export interface ExternalMaster {
  readonly id: string;
  /** The rig build the master was drawn to. Proportions must match. */
  readonly build: Build;
  /** The pose the master is standing in. */
  readonly rest: { readonly state: AnimState; readonly frame: number };
  readonly views: Readonly<Record<DrawnView, PixelGrid>>;
  readonly maps: Readonly<Record<DrawnView, RegionMap>>;
  /** Applied to the shared pose table exactly as `JobArt.posePass` would be. */
  readonly posePass?: JobArt["posePass"];
  readonly patches?: readonly FramePatch[];
}

const canvasOf = (p: { dx: number; up: number }): { x: number; y: number } => at(p.dx, p.up);

function posed(master: ExternalMaster, state: AnimState, frame: number): Pose {
  const art = { posePass: master.posePass } as JobArt;
  return poseFor(art, state, frame);
}

function jointsAt(master: ExternalMaster, state: AnimState, frame: number): Joints {
  return jointsFor(master.build, posed(master, state, frame));
}

const inRect = (r: SegmentRect, x: number, y: number): boolean =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/**
 * Where a master's own anatomy sits, when it is not the rig's. Appendix A.1
 * fixes 3-heads proportions, and the generator briefs ask for 5 to 5.5 — a
 * master drawn to the brief has its shoulder and hip lines further down the
 * canvas than the armature does. The cut has to follow the *art*, or the head
 * region takes half the chest with it; the joint *deltas* that move each region
 * are still the rig's, and those are small enough to stay honest across the
 * proportion gap. Measure these off the master.
 */
export interface Landmarks {
  readonly shoulderRow?: number;
  readonly hipRow?: number;
}

/**
 * Build the standard six-region partition from the rig itself: head above the
 * shoulder line, the shoulder-to-hip band split into far arm / torso / near
 * arm by column, and everything below the hips split into two legs. The rects
 * tile the figure box without overlapping, so the cut is total and unambiguous.
 *
 * A job whose gear crosses those boundaries adds an explicit `prop` region on
 * top; that is the whole reason `prop` cuts first.
 */
export function defaultRegionMap(
  build: Build,
  view: DrawnView,
  rest: { state: AnimState; frame: number },
  extra: readonly Segment[] = [],
  posePass?: JobArt["posePass"],
  landmarks: Landmarks = {},
): RegionMap {
  const pose = poseFor({ posePass } as JobArt, rest.state, rest.frame);
  const j = jointsFor(build, pose);
  const shoulderRow = landmarks.shoulderRow ?? Math.round(canvasOf(j.shoulder).y);
  const hipRow = landmarks.hipRow ?? Math.round(canvasOf(j.hip).y);
  const bandTop = Math.max(0, shoulderRow - toPx(1));
  const bandBottom = Math.min(FIGURE_BOX_BOTTOM + 1, hipRow + toPx(3));
  const centerX = Math.round(canvasOf(j.shoulder).x);
  const half = Math.round(toPx(build.hipW) / 2) + toPx(1);
  const leftSplit = Math.max(0, Math.min(SPRITE_WIDTH, centerX - half));
  const rightSplit = Math.max(0, Math.min(SPRITE_WIDTH, centerX + half));
  const legSplit = Math.max(0, Math.min(SPRITE_WIDTH, Math.round(canvasOf(j.hip).x)));
  const bandH = Math.max(0, bandBottom - bandTop);
  const legH = Math.max(0, FIGURE_BOX_BOTTOM + 1 - bandBottom);

  const segments: Segment[] = [
    ...extra,
    { name: "head", rect: { x: 0, y: 0, w: SPRITE_WIDTH, h: bandTop }, anchor: "head" },
    {
      name: "armFar",
      rect: { x: 0, y: bandTop, w: leftSplit, h: bandH },
      anchor: "shoulderFar",
      distal: "handFar",
    },
    {
      name: "armNear",
      rect: { x: rightSplit, y: bandTop, w: SPRITE_WIDTH - rightSplit, h: bandH },
      anchor: "shoulderNear",
      distal: "handNear",
    },
    {
      name: "torso",
      rect: { x: leftSplit, y: bandTop, w: rightSplit - leftSplit, h: bandH },
      anchor: "shoulder",
      distal: "hip",
    },
    {
      name: "legFar",
      rect: { x: 0, y: bandBottom, w: legSplit, h: legH },
      anchor: "hipFar",
      distal: "footFar",
    },
    {
      name: "legNear",
      rect: { x: legSplit, y: bandBottom, w: SPRITE_WIDTH - legSplit, h: legH },
      anchor: "hipNear",
      distal: "footNear",
    },
  ];
  return { view, segments };
}

interface CutPiece {
  readonly segment: Segment;
  /** Canvas-coordinate pixels claimed by this region. */
  readonly pixels: readonly { x: number; y: number; value: number }[];
}

/**
 * Split a master into its regions. The master's own outline is dropped: it is
 * re-derived per frame, because an outline that translates with a limb stops
 * being a silhouette the moment two limbs move apart.
 */
export function cutMaster(grid: PixelGrid, map: RegionMap): CutPiece[] {
  return cutBy(grid, map, (value) => value !== TRANSPARENT && value !== OUTLINE_INDEX);
}

/**
 * The master's outline, cut the same way. It is never drawn — it rides along as
 * an occupancy mask so `closeSeams` can tell "a hole the shear opened" from
 * "a notch the artist drew", which is the difference between welding an
 * armpit shut and leaving it alone.
 */
function cutShell(grid: PixelGrid, map: RegionMap): CutPiece[] {
  return cutBy(grid, map, (value) => value === OUTLINE_INDEX);
}

/**
 * Pixels are bucketed per segment *instance*, not per segment name: a job can
 * declare several `prop` regions — a shield on the hip and a maul in the hand
 * ride different joints — and bucketing by name would hand each of them the
 * whole prop pixel list, so the shield would be painted a second time at the
 * maul's offset.
 */
function cutBy(
  grid: PixelGrid,
  map: RegionMap,
  keep: (value: number) => boolean,
): CutPiece[] {
  const ordered = SEGMENT_NAMES.flatMap((name) => map.segments.filter((s) => s.name === name));
  const buckets: { x: number; y: number; value: number }[][] = ordered.map(() => []);
  for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const value = gridGet(grid, x, y);
      if (!keep(value)) continue;
      for (let i = 0; i < ordered.length; i += 1) {
        if (!inRect((ordered[i] as Segment).rect, x, y)) continue;
        (buckets[i] as { x: number; y: number; value: number }[]).push({ x, y, value });
        break;
      }
    }
  }
  return ordered.map((segment, i) => ({ segment, pixels: buckets[i] ?? [] }));
}

interface Delta {
  readonly x: number;
  readonly y: number;
}

function segmentOffset(
  segment: Segment,
  rest: Joints,
  target: Joints,
  x: number,
  y: number,
): Delta {
  const restAnchor = canvasOf(rest[segment.anchor]);
  const targetAnchor = canvasOf(target[segment.anchor]);
  const anchorDelta: Delta = { x: targetAnchor.x - restAnchor.x, y: targetAnchor.y - restAnchor.y };
  if (!segment.distal) return anchorDelta;
  const restDistal = canvasOf(rest[segment.distal]);
  const targetDistal = canvasOf(target[segment.distal]);
  const distalDelta: Delta = { x: targetDistal.x - restDistal.x, y: targetDistal.y - restDistal.y };
  const axisX = restDistal.x - restAnchor.x;
  const axisY = restDistal.y - restAnchor.y;
  const lengthSquared = axisX * axisX + axisY * axisY;
  if (lengthSquared === 0) return anchorDelta;
  const t = Math.max(
    0,
    Math.min(1, ((x - restAnchor.x) * axisX + (y - restAnchor.y) * axisY) / lengthSquared),
  );
  return {
    x: anchorDelta.x + (distalDelta.x - anchorDelta.x) * t,
    y: anchorDelta.y + (distalDelta.y - anchorDelta.y) * t,
  };
}

/**
 * Close holes opened by shearing. Conservative on purpose: a pixel is only
 * filled when it is almost surrounded, so the gap between two legs — which has
 * at most four opaque neighbors however wide the gap is — is never welded shut.
 *
 * The neighbourhood stays 3x3 rather than scaling with RIG_UNIT: widening it
 * is what would start swallowing the leg gap. A seam is now RIG_UNIT pixels
 * wide, so instead the fill runs more passes and zippers each seam shut from
 * its ends, where the neighbour count is high, inward.
 */
function closeSeams(grid: PixelGrid, shell: PixelGrid, passes = 2 * RIG_UNIT): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const fills: { x: number; y: number; value: number }[] = [];
    for (let y = 1; y <= FIGURE_BOX_BOTTOM; y += 1) {
      for (let x = 1; x < grid.width - 1; x += 1) {
        if (gridGet(grid, x, y) !== TRANSPARENT) continue;
        // The artist drew an edge here; it is the new outline's, not a seam.
        if (gridGet(shell, x, y) !== TRANSPARENT) continue;
        const votes = new Map<number, number>();
        let opaque = 0;
        for (let ny = -1; ny <= 1; ny += 1) {
          for (let nx = -1; nx <= 1; nx += 1) {
            if (nx === 0 && ny === 0) continue;
            const value = gridGet(grid, x + nx, y + ny);
            if (value === TRANSPARENT) continue;
            opaque += 1;
            if (nx === 0 || ny === 0) votes.set(value, (votes.get(value) ?? 0) + 2);
            else votes.set(value, (votes.get(value) ?? 0) + 1);
          }
        }
        if (opaque < 6) continue;
        let best = TRANSPARENT;
        let bestScore = 0;
        for (const [value, score] of votes) {
          if (score > bestScore) {
            bestScore = score;
            best = value;
          }
        }
        if (best !== TRANSPARENT) fills.push({ x, y, value: best });
      }
    }
    if (fills.length === 0) return;
    for (const fill of fills) gridSet(grid, fill.x, fill.y, fill.value);
  }
}

export interface DeriveOptions {
  readonly state: AnimState;
  readonly view: DrawnView;
  readonly frame: number;
}

/**
 * One derived frame. Same contract as `jobFrame`: a 64x96 palette-index grid,
 * feet on the anchor, closed emissive-aware outline, contact shadow in the
 * sub-floor band.
 */
export function deriveExternalFrame(master: ExternalMaster, options: DeriveOptions): PixelGrid {
  const clip = ANIMATIONS[options.state];
  if (options.frame < 0 || options.frame >= clip.frames) {
    throw new RangeError(`${options.state} has ${clip.frames} frames; got ${options.frame}`);
  }
  const source = master.views[options.view];
  const map = master.maps[options.view];
  const rest = jointsAt(master, master.rest.state, master.rest.frame);
  const pose = posed(master, options.state, options.frame);
  const target = jointsFor(master.build, pose);

  const paint = (pieces: readonly CutPiece[]): PixelGrid => {
    const out = createGrid(SPRITE_WIDTH, SPRITE_HEIGHT);
    for (const name of SEGMENT_Z) {
      for (const piece of pieces) {
        if (piece.segment.name !== name) continue;
        for (const pixel of piece.pixels) {
          const offset = segmentOffset(piece.segment, rest, target, pixel.x, pixel.y);
          gridSet(out, pixel.x + Math.round(offset.x), pixel.y + Math.round(offset.y), pixel.value);
        }
      }
    }
    return out;
  };

  let body = paint(cutMaster(source, map));
  const shell = paint(cutShell(source, map));
  closeSeams(body, shell);

  // The outer ring belongs to the outline, and the sub-floor band to contact.
  for (let y = FIGURE_BOX_BOTTOM + 1; y < SPRITE_HEIGHT; y += 1) {
    for (let x = 0; x < SPRITE_WIDTH; x += 1) body.data[y * SPRITE_WIDTH + x] = TRANSPARENT;
  }
  for (let x = 0; x < SPRITE_WIDTH; x += 1) body.data[x] = TRANSPARENT;
  for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
    body.data[y * SPRITE_WIDTH] = TRANSPARENT;
    body.data[y * SPRITE_WIDTH + SPRITE_WIDTH - 1] = TRANSPARENT;
  }

  for (const patch of master.patches ?? []) {
    if (patch.state !== options.state || patch.view !== options.view) continue;
    if (patch.frame !== options.frame) continue;
    for (const rect of patch.clear ?? []) {
      for (let y = rect.y; y < rect.y + rect.h; y += 1) {
        for (let x = rect.x; x < rect.x + rect.w; x += 1) gridSet(body, x, y, TRANSPARENT);
      }
    }
    if (patch.prims && patch.prims.length > 0) {
      const drawn = rasterize({
        width: SPRITE_WIDTH,
        height: SPRITE_HEIGHT,
        layers: [layer("patch", patch.prims)],
      });
      body = overlayGrid(body, drawn);
    }
  }

  // Feet meet the anchor: derivation may leave the lowest row one short.
  settleToGround(body);

  if (pose.flash) body = flashInterior(body);

  const outline = outlineGrid(body, { maxY: FIGURE_BOX_BOTTOM });
  const contact = rasterize({
    width: SPRITE_WIDTH,
    height: SPRITE_HEIGHT,
    layers: [
      layer(
        "contact",
        contactPrims({
          view: options.view,
          state: options.state,
          frame: options.frame,
          joints: target,
          pose,
          build: master.build,
          sh: PLACEHOLDER_SHADES,
          tint: { base: 0, shadow: 0 },
          chars: {},
        }),
      ),
    ],
  });
  for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
    for (let x = 0; x < SPRITE_WIDTH; x += 1) contact.data[y * SPRITE_WIDTH + x] = TRANSPARENT;
  }
  return overlayGrid(overlayGrid(contact, outline), body);
}

/**
 * `contactPrims` only reads the build and the foot joints; the shade set is
 * required by the shared context type and never sampled.
 */
const PLACEHOLDER_SHADES = {
  cloth: { light: 0, base: 0, shadow: 0, line: 0 },
  leather: { light: 0, base: 0, shadow: 0, line: 0 },
  boot: { light: 0, base: 0, shadow: 0, line: 0 },
  skin: { light: 0, base: 0, shadow: 0, line: 0 },
  hair: { light: 0, base: 0, shadow: 0, line: 0 },
  metal: { light: 0, base: 0, shadow: 0, line: 0 },
} as const;

/**
 * Push the whole figure down so its lowest row is the anchor row minus one.
 * Poses lift a foot; nothing in the derivation guarantees the *other* foot
 * still lands, and §3's "a standing unit meets the tile" is not negotiable.
 */
function settleToGround(grid: PixelGrid): void {
  let bottom = -1;
  for (let y = FIGURE_BOX_BOTTOM; y >= 0 && bottom < 0; y -= 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (gridGet(grid, x, y) !== TRANSPARENT) {
        bottom = y;
        break;
      }
    }
  }
  const shift = SPRITE_ANCHOR.y - 1 - bottom;
  if (bottom < 0 || shift === 0) return;
  const copy = Uint8Array.from(grid.data);
  grid.data.fill(TRANSPARENT);
  for (let y = 0; y <= FIGURE_BOX_BOTTOM; y += 1) {
    const to = y + shift;
    if (to < 0 || to > FIGURE_BOX_BOTTOM) continue;
    for (let x = 0; x < grid.width; x += 1) {
      grid.data[to * grid.width + x] = copy[y * grid.width + x] ?? TRANSPARENT;
    }
  }
}

/** The whole 8x12 sheet for an external master, in the frozen layout. */
export function buildExternalSheet(master: ExternalMaster): PixelGrid {
  const sheet = createGrid(SHEET_LAYOUT.width, SHEET_LAYOUT.height);
  for (const row of SHEET_LAYOUT.rowOrder) {
    const rowIndex = SHEET_LAYOUT.rowOrder.indexOf(row);
    for (let frame = 0; frame < ANIMATIONS[row.state].frames; frame += 1) {
      const grid = deriveExternalFrame(master, {
        state: row.state,
        view: row.view,
        frame,
      });
      for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
        for (let x = 0; x < SPRITE_WIDTH; x += 1) {
          const value = grid.data[y * SPRITE_WIDTH + x] ?? TRANSPARENT;
          if (value === TRANSPARENT) continue;
          gridSet(
            sheet,
            frame * SPRITE_WIDTH + x,
            rowIndex * SPRITE_HEIGHT + y,
            value,
          );
        }
      }
    }
  }
  return sheet;
}

/** Every drawn frame of an external master, for bulk conformance checking. */
export function everyExternalFrame(master: ExternalMaster): {
  state: AnimState;
  view: DrawnView;
  frame: number;
  grid: PixelGrid;
}[] {
  const out: { state: AnimState; view: DrawnView; frame: number; grid: PixelGrid }[] = [];
  for (const view of DRAWN_VIEWS) {
    for (const row of SHEET_LAYOUT.rowOrder) {
      if (row.view !== view) continue;
      for (let frame = 0; frame < ANIMATIONS[row.state].frames; frame += 1) {
        out.push({
          state: row.state,
          view,
          frame,
          grid: deriveExternalFrame(master, { state: row.state, view, frame }),
        });
      }
    }
  }
  return out;
}
