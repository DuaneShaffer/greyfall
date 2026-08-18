// The map-object face set: which painted faces an object wears, what each one is
// allowed to be made of, and what a finished face is measured against
// (ART_DIRECTION §6 and D.6, `art-src/OBJECT_BRIEFS.md`).
//
// This is the object twin of `tiles.ts` and it forks that file rather than
// extending it, because a machine face and a ground face are measured for
// different things. A tile face is laid three hundred times and is judged on its
// wrap seam and its strata band; an object face is judged on the three things §6
// makes binding and a human cannot count by eye: the amber budget, the
// `copper-500` affordance rule, and the `copper-300` reservation. Like every
// other intake step here it **reports and never repairs** (C.8.2).
//
// One ruler, the same one the terrain set uses: **32 texels per world unit**.
// A face's shipped size is therefore a statement about the object's massing —
// the long side of a 2 × 1 tile object standing 1.5 units is 64 × 48 and can be
// nothing else — so `OBJECT_ART` derives every face size from a footprint and a
// height rather than carrying two independent sets of dimensions.
//
// Three objects have landed and between them they use every axis of this file, so
// the shape of it is worth reading in one go:
//
//  - **`flux-main`** (§1), a `source`. Three faces, drawn for its whole footprint,
//    solid, and the one object in the game with a full-height vertical amber
//    column. The plain case; everything else is a departure from it.
//  - **`cable-trough`** (§2), a `line`. Laid in the floor and **2 or 3 tiles long**
//    at the map's discretion, so what is registered is one tile of run and the
//    cells tile head to tail (`tilesAlongRun`). Its brief hands over four cells to
//    three box faces: a run top, a gland-box top (`cap`, which no box slot can
//    wear yet), and one banded side that answers the run's flanks and its ends
//    alike (`paintedAs`).
//  - **`charge-hoist`** (§3), a `sink`. An open A-frame, so its faces carry
//    interior transparency, and a consumer, so its amber ceiling is a quarter of
//    the set's (`amberShare`).
//
// And §4, the trough's cut state, is what `stateFaces` is for: a delivered
// painting for a §6 state, because a torn tray is *missing material* and no
// substitution over the amber ramp makes material go missing.

import type { GridRole } from "../data/schemas/map.js";
import { OBJECT_STATE_PAINT, PALETTE, RAMPS, type Hex } from "./palette.js";
import {
  AMBER_INDICES,
  COPPER_300_INDEX,
  INDEXED_PALETTE,
  RESERVED_INDICES,
  TRANSPARENT,
  colorClusters,
  createGrid,
  distinctColors,
  gridGet,
  histogram,
  paletteIndex,
  type PixelGrid,
} from "./pixel.js";
import { TILE_TEXTURE_SIZE } from "./sprites.js";

/** Objects for which face art has been delivered and ingested. */
export type ObjectSpriteId = "flux-main" | "cable-trough" | "charge-hoist";

/**
 * The faces an object can wear. `long` and `end` are the sides; a box shows two
 * of each and the engine does not know which way the object is turned, which is
 * why the brief keeps every side's value range mid.
 *
 * `cap` is the fourth and it is **not a box face**: it is a second top, for the
 * one tile of a run that carries a gland box instead of plain channel
 * (OBJECT_BRIEFS §2 cell B). A box has one top slot and a run's top is laid tile
 * by tile, so `cap` is delivered, registered and measured here and waits for the
 * render side to lay a run by the tile. Nothing in `src/render` asks for it.
 */
export type ObjectFaceId = "long" | "end" | "top" | "cap";

export const OBJECT_FACE_IDS: readonly ObjectFaceId[] = ["long", "end", "top", "cap"];

/**
 * The faces `render/objectTextures.ts`'s `BOX_FACE_SLOTS` dresses a box with.
 * An object that wears all three can be worn by the box today; `cap` cannot, and
 * an object missing one of these three would leave a material slot undressed.
 */
export const BOX_FACE_IDS: readonly ObjectFaceId[] = ["long", "end", "top"];

/** Delivery is 4x the shipped size, exactly as terrain and sprites are (D.4). */
export const OBJECT_MASTER_SCALE = 4;

/**
 * The one ruler in this file. `TILE_TEXTURE_SIZE` texels span `TILE_SIZE` = 1
 * world unit on the ground plane, and `HEIGHT_STEP_PX` span `HEIGHT_STEP` = 0.5,
 * which is the same number; an object face that used any other density would
 * change texel size against the ground it stands on.
 */
export const OBJECT_TEXELS_PER_UNIT = TILE_TEXTURE_SIZE;

/** The shared spec's ceiling on one cell. Higher than a tile's: a machine has parts. */
export const MAX_OBJECT_COLORS = 8;

/** §6 and the shared spec: amber is scarce and it means "live". */
export const OBJECT_AMBER_SHARE = 0.04;

/**
 * The amber carrier ramp is the state readout, so a state is a **substitution
 * over five palette steps** and nothing else: identical shapes, different
 * colours, exactly as §6's unpowered row demands. Body colours are left alone —
 * the collapse ramp in `render/objects.ts` still darkens them, and a state that
 * repainted the cast frame would lose the seam/body distinction the powered
 * states spend the whole battle teaching.
 */
export type ObjectPowerState = "powered" | "unpowered" | "overloading" | "destroyed";

export const OBJECT_POWER_STATES: readonly ObjectPowerState[] = [
  "powered",
  "unpowered",
  "overloading",
  "destroyed",
];

/**
 * §6's state table has a fifth row the amber ramp cannot carry. `severed` is a
 * cut `line` node, and what separates it from `unpowered` is *geometry*: the run
 * parts, the ends kink, and the tray is visibly torn. The colour half of it is
 * the unpowered row exactly — dead grey seams, no halo, no amber — so an object
 * with no delivered break painting still answers in the state, and one with a
 * break painting answers with the torn tray instead.
 */
export type ObjectFaceState = ObjectPowerState | "severed";

export const OBJECT_FACE_STATES: readonly ObjectFaceState[] = [...OBJECT_POWER_STATES, "severed"];

export interface ObjectFaceSpec {
  readonly id: ObjectFaceId;
  /** Shipped size in game pixels. */
  readonly width: number;
  readonly height: number;
  /** Quantization target: this object's own ramp and nothing else. */
  readonly allowed: readonly Hex[];
  /**
   * The face whose delivered painting this face wears — itself, except where one
   * cell answers two faces. A trough's tray wall is eight horizontal bands and
   * is uniform along its length, so a run's flanks and its ends are the same
   * eight rows and brief §2 delivers them once ("run side (the lip)"). Pointing
   * the second face at the first is how one delivery stays one master.
   */
  readonly paintedAs: ObjectFaceId;
  /**
   * True where the brief runs a carrier the **full extent of the face**, and the
   * audit then holds it to that: unbroken, edge to edge. Two objects earn one and
   * for opposite reasons. A main's is vertical up its long side and is the single
   * strongest amber in the game, because it is how a player picks out where the
   * floor's power comes from without hovering anything (§1). A trough's is the
   * filament along its run top, and it is one pixel wide and unbroken because the
   * line either runs the whole way or does not run at all (§2). No third object
   * may be given either.
   */
  readonly amberColumn: boolean;
  /**
   * True on a face the brief puts the operable control on. `copper-500` must
   * appear on every such face and may appear on no other — one lever standing at
   * the corner of a frame shows on both the faces that meet there, which is why
   * this is per-face and not per-object.
   */
  readonly control: boolean;
  /** False where the brief permits no amber at all (a cut span, a consumer's flank). */
  readonly amber: boolean;
  /** Ceiling on this face's amber, as a share of its opaque pixels. */
  readonly amberShare: number;
  /**
   * True on a delivered *state* painting §6's substitution already computes
   * exactly. The delivery is then a proof and not data: the intake cuts it,
   * audits it and pins it against the substitution, and nothing is stored,
   * because the same pixels on disk twice is the drift the one-painting-per-face
   * rule exists to prevent (`cable-trough` top, unpowered).
   */
  readonly derivable: boolean;
}

export interface ObjectArtSpec {
  readonly id: ObjectSpriteId;
  /**
   * What this object does on the bus, and therefore what its art was drawn to
   * say (FLUX_GRID §2.5). `spriteId` is the map author's word and `src/render`
   * reads it, so a board wearing a main's art would be *drawn* as a main; naming
   * the role here is what lets `tests/content.test.ts` hold a map to it.
   */
  readonly role: GridRole;
  /**
   * The footprint the faces are painted for, in tiles: along the object's long
   * axis and across it. For a standing object that is its whole footprint. For a
   * **run** it is one tile, because a run is 2 or 3 of the same tile in a line
   * and its cells tile head to tail — which is the same fact as `along: 1`.
   */
  readonly along: number;
  readonly across: number;
  /**
   * True where `along` is a tiling unit rather than a footprint: the map decides
   * how many tiles of the run there are and the cells repeat along it. False
   * where the faces are drawn for the whole object and a map that gave it a
   * different footprint would stretch the painting.
   */
  readonly tilesAlongRun: boolean;
  /** Standing height in world units. */
  readonly heightUnits: number;
  /** Whether the object is authored operable — the `copper-500` rule's other half. */
  readonly operable: boolean;
  readonly faces: Readonly<Partial<Record<ObjectFaceId, ObjectFaceSpec>>>;
  /**
   * Faces the artist delivered a *second painting* of, for a §6 state. Only
   * states a colour swap cannot reach need one — a torn tray is missing
   * material, and no substitution over the amber ramp makes material go missing.
   */
  readonly stateFaces: Readonly<
    Partial<Record<ObjectFaceState, Readonly<Partial<Record<ObjectFaceId, ObjectFaceSpec>>>>>
  >;
}

/**
 * The object set's quantization target: the shared spec's palette, plus
 * `copper-300`.
 *
 * `copper-300` is in the target **on purpose** even though the spec says it
 * "appears nowhere in this set": leaving it out would make the audit's
 * rail-specular check true by construction, and a check that cannot fail is not
 * a check. In the target it is a colour the quantizer is free to land on and the
 * audit rejects — which is the report-never-repair contract doing its job.
 */
export const OBJECT_RAMP: readonly Hex[] = [
  ...RAMPS.soot,
  ...RAMPS.umber,
  ...RAMPS.copper,
  ...RAMPS.amber,
];

type FaceExtra = Partial<Omit<ObjectFaceSpec, "id" | "width" | "height">>;
type FaceOverrides = Partial<Record<ObjectFaceId, FaceExtra>>;
type StateOverrides = Partial<Record<ObjectFaceState, Partial<Record<ObjectFaceId, FaceExtra>>>>;

const face = (id: ObjectFaceId, width: number, height: number, extra: FaceExtra = {}): ObjectFaceSpec => ({
  id,
  width,
  height,
  allowed: OBJECT_RAMP,
  paintedAs: id,
  amberColumn: false,
  control: false,
  amber: true,
  amberShare: OBJECT_AMBER_SHARE,
  derivable: false,
  ...extra,
});

/**
 * An object's massing plus the ruler *is* its face table. Writing the sizes out
 * again would be two sources for one fact, and the fact is the one thing the
 * whole set turns on: 64 shipped columns across a two-tile run is 32 texels per
 * world unit, the same density as the floor the object stands on.
 *
 * `cap` is a top and sizes like one. It exists on the objects whose brief hands
 * over a second top and nowhere else, which is what `wears` declares.
 */
const object = (
  id: ObjectSpriteId,
  role: GridRole,
  massing: {
    readonly along: number;
    readonly across: number;
    readonly heightUnits: number;
    readonly tilesAlongRun?: boolean;
  },
  operable: boolean,
  wears: readonly ObjectFaceId[],
  overrides: FaceOverrides = {},
  states: StateOverrides = {},
): ObjectArtSpec => {
  const px = OBJECT_TEXELS_PER_UNIT;
  const { along, across, heightUnits } = massing;
  const size = (faceId: ObjectFaceId): readonly [number, number] =>
    faceId === "long"
      ? [along * px, heightUnits * px]
      : faceId === "end"
        ? [across * px, heightUnits * px]
        : [across * px, along * px];
  const table = (ids: readonly ObjectFaceId[], extra: Partial<Record<ObjectFaceId, FaceExtra>>) => {
    const out: Partial<Record<ObjectFaceId, ObjectFaceSpec>> = {};
    for (const faceId of OBJECT_FACE_IDS) {
      if (!ids.includes(faceId)) continue;
      const [width, height] = size(faceId);
      out[faceId] = face(faceId, width, height, extra[faceId]);
    }
    return out;
  };
  const stateFaces: Partial<Record<ObjectFaceState, Partial<Record<ObjectFaceId, ObjectFaceSpec>>>> = {};
  for (const state of OBJECT_FACE_STATES) {
    const declared = states[state];
    if (declared === undefined) continue;
    stateFaces[state] = table(Object.keys(declared) as ObjectFaceId[], declared);
  }
  return {
    id,
    role,
    along,
    across,
    heightUnits,
    tilesAlongRun: massing.tilesAlongRun ?? false,
    operable,
    faces: table(wears, overrides),
    stateFaces,
  };
};

/** Every amber step off a face, for the states and the faces the brief keeps dark. */
const DARK: FaceExtra = { amber: false, amberColumn: false };

export const OBJECT_ART: Readonly<Record<ObjectSpriteId, ObjectArtSpec>> = {
  "flux-main": object("flux-main", "source", { along: 2, across: 1, heightUnits: 1.5 }, true, BOX_FACE_IDS, {
    long: { amberColumn: true, control: true },
  }),
  // A line node, laid in the floor and walked over. `along: 1` is the tiling
  // unit, not the footprint: the map says how many tiles of it a run is. The lip
  // answers both sides because the tray wall is banded and uniform along its
  // length, and the flanks carry no warmth at all so nothing there can average
  // into the filament under the 4:1 reduction (§2).
  "cable-trough": object(
    "cable-trough",
    "line",
    { along: 1, across: 1, heightUnits: 0.25, tilesAlongRun: true },
    false,
    [...BOX_FACE_IDS, "cap"],
    {
      long: DARK,
      end: { ...DARK, paintedAs: "long" },
      top: { amberColumn: true },
    },
    // §4 is a state of §2 and not a fourth object. The break is its own painting
    // because a cut reads as *absence of material*; the dead run is the engine's
    // own unpowered substitution, drawn by the same hand so the two can be held
    // against each other.
    { severed: { top: DARK }, unpowered: { top: { ...DARK, derivable: true } } },
  ),
  // A sink: it draws and does not supply, so its amber is one indicator at the
  // winch head and the ceiling is a quarter of the set's (§3). The frame is open
  // and the gap under the beam is the silhouette, which is why these faces carry
  // interior transparency rather than filling solid.
  "charge-hoist": object(
    "charge-hoist",
    "sink",
    { along: 2, across: 1, heightUnits: 1.75 },
    true,
    BOX_FACE_IDS,
    {
      long: { control: true, amberShare: 0.01 },
      end: { control: true, amberShare: 0.01 },
      top: { amberShare: 0.01 },
    },
  ),
};

export const OBJECT_ART_IDS = Object.keys(OBJECT_ART) as readonly ObjectSpriteId[];

/** The faces this object wears, in `OBJECT_FACE_IDS` order. */
export const objectFaceIds = (art: ObjectArtSpec): readonly ObjectFaceId[] =>
  OBJECT_FACE_IDS.filter((faceId) => art.faces[faceId] !== undefined);

/** Whether a map's `spriteId` has delivered face art behind it. */
export const objectArtFor = (spriteId: string): ObjectArtSpec | null =>
  (OBJECT_ART as Record<string, ObjectArtSpec | undefined>)[spriteId] ?? null;

/**
 * The spec a delivered cell is measured against: the state's own where the
 * object declares one, the powered face otherwise. A state painting is the same
 * face at the same size — that is what makes it a state — so the fall-through is
 * the right answer and not a guess.
 */
export const objectCellSpec = (
  sprite: ObjectSpriteId,
  faceId: ObjectFaceId,
  state: ObjectFaceState = "powered",
): ObjectFaceSpec | null => {
  const art = OBJECT_ART[sprite];
  return art.stateFaces[state]?.[faceId] ?? art.faces[faceId] ?? null;
};

/** The nominal delivered size of a cell: the shipped face at `OBJECT_MASTER_SCALE`. */
export const masterSize = (spec: ObjectFaceSpec): { width: number; height: number } => ({
  width: spec.width * OBJECT_MASTER_SCALE,
  height: spec.height * OBJECT_MASTER_SCALE,
});

// --- §6 state language on a painted face ------------------------------------

/**
 * Per state, what the five amber steps become. `recess` is the one entry §6's
 * table does not name, because §6 was written about seam *geometry* on a
 * primitive and a painted seam additionally has the channel it sits in; it
 * follows the state's own darkest step so the recess stays a recess in every
 * state. Everything else is `OBJECT_STATE_PAINT` read straight off.
 */
export interface FaceStatePaint {
  readonly recess: Hex;
  readonly seam: Hex;
  readonly core: Hex;
  readonly halo: Hex | null;
}

const withRecess = (state: ObjectPowerState, recess: Hex): FaceStatePaint => ({
  recess,
  ...OBJECT_STATE_PAINT[state],
});

export const FACE_STATE_PAINT: Readonly<Record<ObjectPowerState, FaceStatePaint>> = {
  powered: withRecess("powered", PALETTE["amber-700"]),
  unpowered: withRecess("unpowered", PALETTE["soot-800"]),
  overloading: withRecess("overloading", PALETTE["overload-700"]),
  destroyed: withRecess("destroyed", PALETTE["umber-900"]),
};

/**
 * §6's severed row is the unpowered row with the geometry taken out of line, and
 * the texture half of the two is identical: dead grey seams, no halo, no amber.
 * So the substitution reads the unpowered paint and the *cut* is left to the
 * geometry in `render/objects.ts`, which is exactly where §6 puts it.
 */
const substitutionState = (state: ObjectFaceState): ObjectPowerState =>
  state === "severed" ? "unpowered" : state;

const AMBER_STEP_ORDER: readonly Hex[] = [
  PALETTE["amber-900"],
  PALETTE["amber-700"],
  PALETTE["amber-500"],
  PALETTE["amber-300"],
  PALETTE["amber-glow"],
];

const stateSubstitution = (state: ObjectFaceState): ReadonlyMap<number, number> => {
  const paint = FACE_STATE_PAINT[substitutionState(state)];
  const to: readonly Hex[] = [
    paint.recess,
    paint.recess,
    paint.seam,
    paint.core,
    paint.halo ?? paint.core,
  ];
  const map = new Map<number, number>();
  for (let i = 0; i < AMBER_STEP_ORDER.length; i += 1) {
    map.set(paletteIndex(AMBER_STEP_ORDER[i] as Hex), paletteIndex(to[i] as Hex));
  }
  return map;
};

/**
 * The lit part of a carrier, as opposed to the channel it runs in. §6's emissive
 * is the seam, its core and its halo; the recess is a shadow and stays shadow.
 */
const LIT_STEP_ORDER: readonly Hex[] = [
  PALETTE["amber-500"],
  PALETTE["amber-300"],
  PALETTE["amber-glow"],
];

/**
 * Where a painted face is **its own light source**, and in what colour.
 *
 * This is the half of §6 a diffuse texture cannot say. On the placeholder
 * primitives the amber seam was a mesh of its own carrying an emissive, which is
 * why it blazed; a painted seam is texels inside a face that the engine is also
 * shading at 62% or 78%, so painting it and stopping there gives a main a dull
 * ochre stripe instead of a live bus. The mask is the carrier's own pixels in the
 * state's own colours, `null` in the states §6 gives no halo — which is exactly
 * where the unpowered row's "no halo, no pulse" lives, and why an unpowered main
 * is the same painting with the light taken out rather than a repaint.
 */
export function carrierMask(powered: PixelGrid, state: ObjectFaceState): PixelGrid | null {
  const paint = FACE_STATE_PAINT[substitutionState(state)];
  if (paint.halo === null) return null;
  const to: readonly Hex[] = [paint.seam, paint.core, paint.halo];
  const lit = new Map<number, number>();
  for (let i = 0; i < LIT_STEP_ORDER.length; i += 1) {
    lit.set(paletteIndex(LIT_STEP_ORDER[i] as Hex), paletteIndex(to[i] as Hex));
  }
  const out = createGrid(powered.width, powered.height);
  let any = false;
  for (let i = 0; i < powered.data.length; i += 1) {
    const hit = lit.get(powered.data[i] as number);
    if (hit === undefined) continue;
    out.data[i] = hit;
    any = true;
  }
  return any ? out : null;
}

/**
 * The delivered (powered) face repainted into one of §6's states. `powered` is
 * the identity, so the shipped grid is the powered grid and no state is stored
 * twice.
 */
export function faceInState(grid: PixelGrid, state: ObjectFaceState): PixelGrid {
  if (state === "powered") return grid;
  const swap = stateSubstitution(state);
  const out = createGrid(grid.width, grid.height);
  for (let i = 0; i < grid.data.length; i += 1) {
    const index = grid.data[i] ?? TRANSPARENT;
    out.data[i] = swap.get(index) ?? index;
  }
  return out;
}

// --- the audit --------------------------------------------------------------

const COPPER_500_INDEX = paletteIndex(PALETTE["copper-500"]);
const AMBER_CORE_INDEX = paletteIndex(PALETTE["amber-300"]);
const AMBER_GLOW_INDEX = paletteIndex(PALETTE["amber-glow"]);

export interface ColumnMeasure {
  /** Rows carrying at least one amber pixel. A carrier column covers every row. */
  readonly rows: number;
  /** Columns any amber pixel sits in — the column's drawn width. */
  readonly columns: readonly number[];
  readonly continuous: boolean;
}

export interface ControlMeasure {
  readonly pixels: number;
  /** Separate `copper-500` regions. A handle is one. */
  readonly clusters: number;
  /** Rows the handle spans, top-down. `null` when there is none. */
  readonly rows: { readonly from: number; readonly to: number } | null;
  /** True when the handle's centre sits in the lower half — reachable standing. */
  readonly reachable: boolean;
}

export interface ObjectFaceAudit {
  readonly sprite: ObjectSpriteId;
  readonly face: ObjectFaceId;
  readonly ok: boolean;
  readonly width: number;
  readonly height: number;
  readonly colors: readonly Hex[];
  readonly colorCount: number;
  readonly opaquePixels: number;
  readonly transparentPixels: number;
  readonly amberPixels: number;
  readonly amberShare: number;
  readonly amberBudget: number;
  /** The share the budget was struck from: the set's 4%, or this object's own. */
  readonly amberCeiling: number;
  readonly column: ColumnMeasure;
  readonly control: ControlMeasure;
  readonly copper300Pixels: number;
  readonly reservedPixels: number;
  readonly outsideRampPixels: number;
  /** `amber-glow` pixels with no `amber-300` core touching them (brief §1). */
  readonly glowOffCore: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Measure a finished object face against §6 and its brief. Everything here is a
 * measurement plus a verdict on that measurement; nothing is altered.
 */
export function auditObjectFace(
  grid: PixelGrid,
  sprite: ObjectSpriteId,
  spec: ObjectFaceSpec,
): ObjectFaceAudit {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (grid.width !== spec.width || grid.height !== spec.height) {
    errors.push(`face is ${grid.width}x${grid.height}, the brief fixes ${spec.width}x${spec.height}`);
  }

  const counts = histogram(grid);
  const colorIndices = [...distinctColors(grid)].sort((a, b) => a - b);
  const colors = colorIndices.map((index) => INDEXED_PALETTE[index] as Hex);
  if (colors.length > MAX_OBJECT_COLORS) {
    errors.push(`${colors.length} colours, the brief's ceiling is ${MAX_OBJECT_COLORS}`);
  }

  const allowedIndices = new Set(spec.allowed.map((hex) => paletteIndex(hex)));
  let amberPixels = 0;
  let reservedPixels = 0;
  let copper300Pixels = 0;
  let copper500Pixels = 0;
  let outsideRampPixels = 0;
  let opaquePixels = 0;
  const transparentPixels = counts.get(TRANSPARENT) ?? 0;
  for (const [index, count] of counts) {
    if (index === TRANSPARENT) continue;
    opaquePixels += count;
    if (AMBER_INDICES.has(index)) amberPixels += count;
    if (RESERVED_INDICES.has(index)) reservedPixels += count;
    if (index === COPPER_300_INDEX) copper300Pixels += count;
    if (index === COPPER_500_INDEX) copper500Pixels += count;
    if (!allowedIndices.has(index)) outsideRampPixels += count;
  }

  const amberBudget = Math.floor(opaquePixels * spec.amberShare);
  const amberShare = opaquePixels === 0 ? 0 : amberPixels / opaquePixels;
  if (!spec.amber && amberPixels > 0) {
    errors.push(`${amberPixels} amber pixels on a face the brief gives none — amber means live`);
  } else if (amberPixels > amberBudget) {
    errors.push(
      `${amberPixels} amber pixels, budget is ${amberBudget} (${spec.amberShare * 100}% of the face)`,
    );
  }
  if (outsideRampPixels > 0) errors.push(`${outsideRampPixels} pixels outside this object's ramp`);
  if (reservedPixels > 0) errors.push(`${reservedPixels} pixels from a reserved signal ramp`);
  if (copper300Pixels > 0) {
    errors.push(`${copper300Pixels} copper-300 pixels — the rail head specular is not this object's to spend`);
  }

  // The single most load-bearing rule in the tileset (§6): a player must be able
  // to scan the board and know what they can touch without hovering anything.
  const control = measureControl(grid);
  if (spec.control && control.pixels === 0) {
    errors.push("no copper-500 handle on the face the brief puts the control on");
  }
  if (!spec.control && control.pixels > 0) {
    errors.push(`${control.pixels} copper-500 pixels on a face with no authored control`);
  }
  if (spec.control && control.clusters > 1) {
    warnings.push(`the copper-500 affordance is ${control.clusters} separate marks, not one handle`);
  }
  if (spec.control && control.pixels > 0 && !control.reachable) {
    warnings.push("the copper-500 handle sits in the upper half — a standing figure could not reach it");
  }

  const column = measureColumn(grid);
  if (spec.amberColumn && !column.continuous) {
    errors.push(
      `the carrier reaches ${column.rows}/${grid.height} rows — this face's carrier runs the full extent`,
    );
  }
  if (!spec.amberColumn && column.continuous && grid.height > 1) {
    warnings.push("a full-height amber column on a face the brief gives none");
  }

  let glowOffCore = 0;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (gridGet(grid, x, y) !== AMBER_GLOW_INDEX) continue;
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (gridGet(grid, x + dx, y + dy) === AMBER_CORE_INDEX) {
            touching = true;
            break;
          }
        }
      }
      if (!touching) glowOffCore += 1;
    }
  }
  if (glowOffCore > 0) {
    warnings.push(
      `${glowOffCore} amber-glow pixels with no amber-300 core touching them — the brief puts the halo colour on core pixels only`,
    );
  }

  return {
    sprite,
    face: spec.id,
    ok: errors.length === 0,
    width: grid.width,
    height: grid.height,
    colors,
    colorCount: colors.length,
    opaquePixels,
    transparentPixels,
    amberPixels,
    amberShare,
    amberBudget,
    amberCeiling: spec.amberShare,
    column,
    control,
    copper300Pixels,
    reservedPixels,
    outsideRampPixels,
    glowOffCore,
    errors,
    warnings,
  };
}

const measureColumn = (grid: PixelGrid): ColumnMeasure => {
  let rows = 0;
  const columns = new Set<number>();
  for (let y = 0; y < grid.height; y += 1) {
    let hit = false;
    for (let x = 0; x < grid.width; x += 1) {
      if (!AMBER_INDICES.has(gridGet(grid, x, y))) continue;
      hit = true;
      columns.add(x);
    }
    if (hit) rows += 1;
  }
  return {
    rows,
    columns: [...columns].sort((a, b) => a - b),
    continuous: rows === grid.height,
  };
};

const measureControl = (grid: PixelGrid): ControlMeasure => {
  let pixels = 0;
  let from = grid.height;
  let to = -1;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (gridGet(grid, x, y) !== COPPER_500_INDEX) continue;
      pixels += 1;
      if (y < from) from = y;
      if (y > to) to = y;
    }
  }
  const clusters = colorClusters(grid).filter((c) => c.color === COPPER_500_INDEX).length;
  if (pixels === 0) return { pixels, clusters, rows: null, reachable: false };
  return {
    pixels,
    clusters,
    rows: { from, to },
    // Rows count from the top of the face, so "low on the face" is a high row.
    reachable: (from + to) / 2 >= grid.height / 2,
  };
};

export function formatObjectFaceAudit(audit: ObjectFaceAudit): string {
  const control = audit.control.rows
    ? `${audit.control.pixels} px in ${audit.control.clusters} cluster(s), rows ${audit.control.rows.from}..${audit.control.rows.to}, ${audit.control.reachable ? "reachable" : "OUT OF REACH"}`
    : "none";
  const lines = [
    `${audit.sprite}/${audit.face}: ${audit.ok ? "CONFORMS" : "REJECTED"} (${audit.width}x${audit.height})`,
    `  colours ${audit.colorCount}/${MAX_OBJECT_COLORS}: ${audit.colors.join(" ")}`,
    `  opaque ${audit.opaquePixels}, transparent ${audit.transparentPixels}`,
    `  amber ${audit.amberPixels}/${audit.amberBudget} (${(audit.amberShare * 100).toFixed(2)}% of ${(audit.amberCeiling * 100).toFixed(0)}%), glow off core ${audit.glowOffCore}`,
    `  carrier column: ${audit.column.rows}/${audit.height} rows, columns [${audit.column.columns.join(",")}]`,
    `  copper-500: ${control}`,
    `  copper-300 ${audit.copper300Pixels}, reserved ramps ${audit.reservedPixels}, off-ramp ${audit.outsideRampPixels}`,
  ];
  for (const error of audit.errors) lines.push(`  ERROR ${error}`);
  for (const warning of audit.warnings) lines.push(`  warn  ${warning}`);
  return lines.join("\n");
}
