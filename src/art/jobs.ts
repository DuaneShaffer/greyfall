// The seven job figures. Each one is the shared rig plus a build, a material
// set (ART_DIRECTION Appendix C.4), a hand-authored head, and gear built from
// ramp-shaded forms and literal pixel stamps.
//
// Where the craft lives (Appendix C.6): the head glyphs and the gear stamps
// below are the masters. They are placed by the rig's joints and never deform,
// so every pose in every state carries the same hand-placed pixels; the torso
// and limbs are shaded forms because those must bend.
//
// Mirror discipline (§4): job-identifying gear sits adjacent to the body
// centerline, so a mirrored view reads as the unit turning rather than as a
// different unit.
//
// Color budget (§3: 12 + 2 tint). Each job's comment lists the twelve it
// spends; adding a thirteenth is a design error, not a tuning knob.

import type { Team } from "../data/schemas/common.js";
import {
  CLOTH_DARK,
  CLOTH_PALE,
  GLASS,
  GRAFT,
  LEATHER,
  LEATHER_DEEP,
  PLATE,
  PLATE_DEEP,
  SEAM,
  SKIN,
  STEP,
} from "./materials.js";
import {
  COPPER_300,
  COPPER_700,
  SOOT_300,
  SOOT_500,
  SOOT_700,
  TEAM_TINT,
  UMBER_300,
  UMBER_500,
  UMBER_700,
  UMBER_900,
  type Hex,
} from "./palette.js";
import {
  glyph,
  paletteIndex,
  px,
  recessed,
  shade3,
  type Glyph,
  type PixelGrid,
  type Prim,
  type Shade3,
} from "./pixel.js";
import {
  alongProp,
  box,
  poseFor,
  renderFigure,
  shadedBox,
  shadedLimb,
  shadedPatch,
  stampAt,
  type GearContext,
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

/** Emissive growth is capped at 2 so the amber budget survives the cast peak. */
const growth = (glow: number): number => Math.max(0, Math.min(2, Math.round(glow)));

/**
 * A powered element: seam body with an optional lit core, sized by the pose's
 * glow. Never outlined — `outlineGrid` gives it a halo instead (§3).
 */
function emissive(center: RigPoint, w: number, h: number, glow: number, core = false): Prim[] {
  const g = growth(glow);
  const prims = [box(center, w + g * 2, h + g * 2, SEAM.body)];
  if (core) {
    prims.push(box(center, Math.max(1, w + g * 2 - 2), Math.max(1, h + g * 2 - 2), SEAM.core));
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

/**
 * Head masters. Twelve columns by fifteen rows: column 1 is the left edge of a
 * 10px head, row 2 is head row 0, so the eye row of Appendix C.3 is row 9 and
 * the crown taper lands on rows 2-3. Rows 0-1 are helmet and hood headroom.
 *
 * Every face here follows one anatomy — hair mass rows 2-7, skin triangle rows
 * 8-13, eyes as single line-step dots on row 9 with 2px of base skin between —
 * and turns three-quarter to the right by carrying an extra column of hair on
 * the shadow side. What differs per job is the gear over it.
 */
// Glyphs are pure data and only vary by team tint, so they are built once per
// (master, team) rather than once per frame — 56 frames a sheet makes that the
// difference between a rebuild and a lookup.
const GLYPH_CACHE = new WeakMap<readonly string[], Map<string, Glyph>>();

function cachedGlyph(rows: readonly string[], c: GearContext): Glyph {
  let byTint = GLYPH_CACHE.get(rows);
  if (!byTint) {
    byTint = new Map();
    GLYPH_CACHE.set(rows, byTint);
  }
  const key = `${c.tint.base}:${c.tint.shadow}`;
  const hit = byTint.get(key);
  if (hit) return hit;
  const built = glyph(rows, c.chars);
  byTint.set(key, built);
  return built;
}

const head =
  (rows: readonly string[]) =>
  (c: GearContext): Glyph =>
    cachedGlyph(rows, c);

/** Replace whole rows of a head master. Gear overrides anatomy, never redraws it. */
const over = (
  base: readonly string[],
  patchRows: Readonly<Record<number, string>>,
): readonly string[] => base.map((row, y) => patchRows[y] ?? row);

const BARE_SE = [
  "............",
  "............",
  "...hhhhhh...",
  "..hhhhhhhh..",
  ".hjhhhhhhhH.",
  ".hjjhhhhhhH.",
  ".hjhhhhhhhH.",
  ".hhhhhhhhhH.",
  ".hLsssssSSH.",
  ".hLssdssdSH.",
  ".hLssssssSH.",
  ".hLsssSssSH.",
  ".hLssSSssSH.",
  "..LssSSsSH..",
  "....ssSS....",
] as const;

/**
 * The back of a head is where flat pixel art gives up, so it gets its own
 * structure: a parted crown (line-step split left of center), a lit streak on
 * the key-light side, and a skin nape under the hair fall. Without those three
 * an `ne` head is a silhouette-colored egg.
 */
const BARE_NE = [
  "............",
  "............",
  "...hjjhhh...",
  "..hjjhhhhH..",
  ".hjjhhhhhHH.",
  ".hjjhhhhhHH.",
  ".hjhhhhhhHH.",
  ".hjhhhhhhHH.",
  ".hhhhhhhhHH.",
  ".hhhhhhhhHH.",
  ".hhhhhhhhHH.",
  ".hHhhhhhhHH.",
  ".HHHhhhHHHH.",
  "..LssSSsSH..",
  "....ssSS....",
] as const;

// ---------------------------------------------------------------------------
// Enforcer — plate. soot 900/800/700/500/300/100, umber 900/700/500/300,
// copper 700/300. Closed helm: no face, a visor slit instead (Appendix C.3).
// ---------------------------------------------------------------------------

const ENFORCER_HEAD_SE = [
  "............",
  "....4mm4....",
  "...nmmmmM...",
  "..nmmmmmmM..",
  ".nmmmmmmmmM.",
  ".nmmmmmmmmM.",
  ".nmMMMMMMmM.",
  ".nmmmmmmmmM.",
  ".n1155555MM.",
  ".nm555555MM.",
  ".nmmmmmmmmM.",
  ".nmMmmmmmMM.",
  ".nMmmmmmmMM.",
  "..MmmmmmMM..",
  "....4mmM....",
] as const;

const ENFORCER_HEAD_NE = [
  "............",
  "....5225....",
  "...n5225M...",
  "..nm5225mM..",
  ".nmm5225mmM.",
  ".nmm5225mmM.",
  ".nmm5225mmM.",
  ".nmm5225mmM.",
  ".nmm5225mmM.",
  ".nmmm55mmmM.",
  ".nMMMMMMMMM.",
  ".nmmmmmmmMM.",
  ".nmmmmmmmMM.",
  "..MmmmmmMM..",
  "....4mmM....",
] as const;

/** Riot shield: the roster's largest flat plate. 11 x 19, boss on centerline. */
const SHIELD = [
  "..nmmmmM...",
  ".nmmmmmmM..",
  "nmmmmmmmmM.",
  "nmMMMMMMmM.",
  "nmmmmmmmmM.",
  "nmttttttmM.",
  "nmttttttmM.",
  "nmTTTTTTmM.",
  "nmmmmmmmmM.",
  "nmm4444mmM.",
  "nm455554mM.",
  "nm455554mM.",
  "nmm4444mmM.",
  "nmmmmmmmmM.",
  "nmMMMMMMmM.",
  "nm4m4m4mmM.",
  "nmm4m4m4mM.",
  ".nmmmmmmM..",
  "..nmmmmM...",
] as const;

const enforcer: JobArt = {
  id: "enforcer",
  read: "widest shoulders in the roster; riot shield squared across the body, short maul",
  build: { headW: 10, shoulderW: 16, hipW: 12, legW: 4, armW: 4, stance: 6, pitch: 0 },
  shades: {
    cloth: PLATE,
    leather: LEATHER,
    boot: PLATE_DEEP,
    skin: SKIN,
    hair: PLATE_DEEP,
    metal: PLATE,
  },
  head: (c) => head(c.view === "se" ? ENFORCER_HEAD_SE : ENFORCER_HEAD_NE)(c),
  posePass: restingProp(0.55),
  front: (c) => {
    const j = c.joints;
    const shield: RigPoint = { dx: j.hip.dx - 2, up: j.hip.up + 5 };
    return [
      // Pauldrons: plate takes a hard light rim, unlike the cloth beneath.
      ...shadedBox(j.shoulderFar, 6, 5, recessed(PLATE)),
      ...shadedBox(j.shoulderNear, 6, 5, PLATE),
      px(...cxy(j.shoulderFar, -2, 2), STEP.spark),
      // Cuirass: a chest bevel and a belt, so the torso is not one slab.
      ...shadedBox({ dx: j.shoulder.dx, up: j.shoulder.up - 9 }, c.build.shoulderW - 4, 3, PLATE),
      ...shadedBox({ dx: j.hip.dx, up: j.hip.up + 2 }, c.build.hipW + 1, 3, PLATE_DEEP),
      // The shield crosses the centerline: mirroring reads as a turn.
      stampAt(shield, cachedGlyph(SHIELD, c), 5, 9),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const headPt = alongProp(hand, dir, 12);
    return [
      ...shadedLimb(alongProp(hand, dir, -4), alongProp(hand, dir, 9), 3, 3, LEATHER),
      ...shadedBox(headPt, 5, 6, shade3(i(COPPER_300), i(COPPER_700), i(UMBER_900), i(UMBER_900))),
      ...shadedBox(alongProp(hand, dir, 14), 5, 2, PLATE),
    ];
  },
};

// ---------------------------------------------------------------------------
// Machinist — leather and copper. soot 900/700/500/300, umber 900/700/500/300,
// copper 700/300, amber 500 + glow. Goggles pushed up; the eye row stays bare.
// ---------------------------------------------------------------------------

/** Goggles pushed *up* onto the cap brim — the eye row stays bare (C.5). */
const MACHINIST_HEAD_SE = over(BARE_SE, {
  2: "...klllKK...",
  3: "..klllllKK..",
  4: ".kllllllllK.",
  5: ".kllllllllK.",
  6: ".K99KK99KKK.",
  7: ".K66KK66KKK.",
});

const MACHINIST_HEAD_NE = over(BARE_NE, {
  2: "...klllKK...",
  3: "..klllllKK..",
  4: ".kllllllllK.",
  5: ".kllllllllK.",
  6: ".KllllllllK.",
  7: ".K99999999K.",
});

/** Field pack: copper body, riveted lid, one amber cell window. */
const PACK = [
  "9999999999999",
  "8888888888886",
  "8666666666686",
  "88888888888M6",
  "8a888888888M6",
  "8a888888888M6",
  "8a888888888M6",
  "88888888888M6",
  "8666666666686",
  "88888888888M6",
  "88888888888M6",
  "88888888888M6",
  "8666666666686",
  "666666666666",
] as const;

const machinist: JobArt = {
  id: "machinist",
  read: "boxy backpack hump with an antenna spike above the shoulder line",
  build: { headW: 10, shoulderW: 12, hipW: 10, legW: 3, armW: 3, stance: 5, pitch: 0 },
  shades: {
    cloth: LEATHER,
    leather: LEATHER_DEEP,
    boot: shade3(i(SOOT_300), i(SOOT_500), i(SOOT_700), i(SOOT_700)),
    skin: SKIN,
    hair: shade3(i(UMBER_500), i(UMBER_700), i(UMBER_900), i(UMBER_900)),
    metal: shade3(i(COPPER_300), i(COPPER_700), i(UMBER_900), i(UMBER_900)),
  },
  head: (c) => head(c.view === "se" ? MACHINIST_HEAD_SE : MACHINIST_HEAD_NE)(c),
  back: (c) => {
    const j = c.joints;
    const packCenter: RigPoint = {
      dx: j.shoulder.dx + (c.view === "se" ? -4 : 0),
      up: j.shoulder.up - 4,
    };
    const mast: RigPoint = { dx: j.shoulder.dx + (c.view === "se" ? -7 : 5), up: j.shoulder.up + 3 };
    return [
      stampAt(packCenter, cachedGlyph(PACK, c), c.view === "se" ? 8 : 6, 7),
      // A bare whip antenna: the tip stays grey so it cannot be mistaken for
      // the Conduit's amber staff node at silhouette size.
      ...shadedLimb({ dx: mast.dx, up: mast.up - 2 }, { dx: mast.dx, up: mast.up + 8 }, 2, 1, PLATE),
      box({ dx: mast.dx, up: mast.up + 9 }, 2, 1, STEP.soot300),
      ...emissive({ dx: packCenter.dx - 3, up: packCenter.up + 2 }, 2, 2, c.pose.glow),
    ];
  },
  front: (c) => {
    const j = c.joints;
    return [
      // Tool harness: leather takes scuffs, not a rim.
      ...shadedLimb(
        { dx: j.shoulderNear.dx - 1, up: j.shoulderNear.up - 1 },
        { dx: j.hipFar.dx + 1, up: j.hipFar.up + 1 },
        3,
        3,
        LEATHER_DEEP,
      ),
      ...shadedBox({ dx: j.hip.dx, up: j.hip.up + 1 }, c.build.hipW, 3, LEATHER_DEEP),
      ...shadedBox({ dx: j.hip.dx - 3, up: j.hip.up + 2 }, 3, 5, GRAFT),
      ...shadedBox({ dx: j.hip.dx + 3, up: j.hip.up + 2 }, 3, 5, GRAFT),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const tip = alongProp(hand, dir, 8);
    return [
      ...shadedLimb(alongProp(hand, dir, -2), tip, 2, 2, PLATE),
      ...shadedBox(tip, 4, 2, GRAFT),
      box({ dx: tip.dx - 1, up: tip.up + 1 }, 1, 2, STEP.copper300),
      box({ dx: tip.dx + 1, up: tip.up + 1 }, 1, 2, STEP.copper700),
    ];
  },
};

// ---------------------------------------------------------------------------
// Conduit — dark technical cloth. soot 900/800/700/500, umber 900/700/500/300,
// copper 300, amber 500/300 + glow. The only bare, uncovered face in the roster.
// ---------------------------------------------------------------------------

/**
 * The only bare, uncovered face in the roster (C.5) — so it gets the longest
 * hair fall, past the jaw on the shadow side, and a copper collar clasp.
 */
const CONDUIT_HEAD_SE = over(BARE_SE, {
  11: ".hLsssSssHH.",
  12: ".hLssSSssHH.",
  13: "..LssSSsHH..",
  14: "...9ssS9....",
});

const CONDUIT_HEAD_NE = over(BARE_NE, {
  11: ".hHhhhhhhHH.",
  12: ".hHhhhhhhHH.",
  13: "..HhhhhhhH..",
  14: "...9ssS9....",
});

const conduit: JobArt = {
  id: "conduit",
  read: "slightest frame, tall coil staff breaking the top of the canvas, one amber node",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 4, pitch: 0 },
  shades: {
    cloth: CLOTH_DARK,
    leather: LEATHER_DEEP,
    boot: LEATHER_DEEP,
    skin: SKIN,
    hair: shade3(i(UMBER_300), i(UMBER_700), i(UMBER_900), i(UMBER_900)),
    metal: shade3(i(COPPER_300), i(UMBER_500), i(UMBER_900), i(UMBER_900)),
  },
  head: (c) => head(c.view === "se" ? CONDUIT_HEAD_SE : CONDUIT_HEAD_NE)(c),
  // The staff hand sits proud of the hip so the shaft reads clear of the coat.
  posePass: (p, ctx) =>
    ctx.state === "attack" || ctx.state === "downed"
      ? p
      : { ...p, handNear: { dx: p.handNear.dx + 2, up: p.handNear.up } },
  front: (c) => {
    const j = c.joints;
    const hem: RigPoint = { dx: j.hip.dx - 1, up: 9 };
    const prims: Prim[] = [
      // Long coat, open at the front: the hem stops above the boots.
      ...shadedLimb(
        { dx: j.hip.dx, up: j.hip.up + 2 },
        hem,
        c.build.hipW,
        c.build.hipW + 4,
        CLOTH_DARK,
        { soft: true },
      ),
      // The coat line: one unbroken line-step fold from waist to hem.
      ...shadedLimb({ dx: j.hip.dx, up: j.hip.up + 1 }, { dx: hem.dx, up: hem.up + 2 }, 1, 1, {
        ...CLOTH_DARK,
        base: CLOTH_DARK.line,
      }),
      // Hem: shadow row plus one checker transition row (Appendix C.2).
      box({ dx: hem.dx, up: hem.up }, c.build.hipW + 4, 1, CLOTH_DARK.shadow),
      shadedPatch({ dx: hem.dx, up: hem.up + 1 }, c.build.hipW + 3, 2, CLOTH_DARK.shadow),
      ...shadedBox({ dx: j.hip.dx - 3, up: j.hip.up - 1 }, 3, 9, LEATHER_DEEP),
    ];
    return prims;
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const coilShade = shade3(i(COPPER_300), i(UMBER_500), i(UMBER_900), i(UMBER_900));
    return [
      ...shadedLimb(alongProp(hand, dir, -14), alongProp(hand, dir, 20), 2, 2, LEATHER),
      ...shadedBox(alongProp(hand, dir, 15), 4, 1, coilShade),
      ...shadedBox(alongProp(hand, dir, 17), 4, 1, coilShade),
      ...shadedBox(alongProp(hand, dir, 19), 4, 1, coilShade),
      ...emissive(alongProp(hand, dir, 22), 2, 2, c.pose.glow, true),
    ];
  },
};

// ---------------------------------------------------------------------------
// Saboteur — hood and leather. umber 900/700/500/300, soot 900/700/500/300,
// copper 700/300, hazard. Face is a void with one glint (Appendix C.3).
// ---------------------------------------------------------------------------

const SABOTEUR_HEAD_SE = [
  "............",
  "....kllK....",
  "...klllKK...",
  "..klllllKK..",
  ".klllllllKK.",
  ".klllllllKK.",
  ".kll6666lKK.",
  ".kl666666KK.",
  ".kl666666KK.",
  ".kl6LL666KK.",
  ".kl6SS666KK.",
  ".kll6666lKK.",
  ".klll66llKK.",
  "..llll6lKK..",
  "...lllKK....",
] as const;

const SABOTEUR_HEAD_NE = [
  "............",
  "....kllK....",
  "...klllKK...",
  "..kklllKKK..",
  ".kkll6lllKK.",
  ".kkll6lllKK.",
  ".kkll6lllKK.",
  ".kkll6lllKK.",
  ".kkll6lllKK.",
  ".klll6llKKK.",
  ".klll6llKKK.",
  ".kKlll6lKKK.",
  ".kKKllllKKK.",
  "..KKllllKK..",
  "...KllKK....",
] as const;

/** Hip satchel: leather with a scuffed lid and a buckle. */
const SATCHEL = [
  ".kllllllK.",
  "kllllllllK",
  "kl666666lK",
  "kllllllllK",
  "kllllllllK",
  "kl2llll2lK",
  "kllllllllK",
  "kK6666666K",
  ".KllllllK.",
] as const;

const saboteur: JobArt = {
  id: "saboteur",
  read: "hooded and hunched, a hip satchel breaking the waistline, belt charges",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 5, pitch: 2 },
  shades: {
    cloth: LEATHER_DEEP,
    leather: LEATHER,
    boot: shade3(i(SOOT_300), i(SOOT_500), i(SOOT_700), i(SOOT_700)),
    skin: SKIN,
    hair: LEATHER_DEEP,
    metal: shade3(i(COPPER_300), i(COPPER_700), i(UMBER_900), i(UMBER_900)),
  },
  head: (c) => head(c.view === "se" ? SABOTEUR_HEAD_SE : SABOTEUR_HEAD_NE)(c),
  posePass: (p, ctx) =>
    ctx.state === "downed" ? p : { ...p, crouch: p.crouch + 1, headDrop: p.headDrop + 1 },
  front: (c) => {
    const j = c.joints;
    const side = c.view === "se" ? -1 : 1;
    const satchel: RigPoint = { dx: j.hip.dx + side * 4, up: j.hip.up - 1 };
    // Charges are 3px wide so the graft ramp has room for all three steps, and
    // their fuse tips are 1x2: Appendix C.2 has no allowance for a lone pixel.
    const charge = (dx: number): Prim[] => [
      ...shadedBox({ dx: j.hip.dx + dx, up: j.hip.up + 3 }, 3, 5, GRAFT),
      box({ dx: j.hip.dx + dx, up: j.hip.up + 6 }, 1, 2, STEP.hazard),
    ];
    return [
      ...shadedBox({ dx: j.hip.dx, up: j.hip.up + 1 }, c.build.hipW + 2, 3, LEATHER),
      ...charge(-4),
      ...charge(0),
      ...charge(4),
      stampAt(satchel, cachedGlyph(SATCHEL, c), 5, 4),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    return [
      ...shadedLimb(alongProp(hand, dir, -1), alongProp(hand, dir, 6), 3, 3, GRAFT),
      ...shadedBox(alongProp(hand, dir, 7), 3, 2, PLATE),
      box(alongProp(hand, dir, 9), 1, 2, STEP.hazard),
    ];
  },
};

// ---------------------------------------------------------------------------
// Chemist — pale coat and glass. soot 900/700/500/300/100, umber 900/700/500/300,
// copper 300, verdigris 700/500. Respirator over the mouth, eyes left visible.
// ---------------------------------------------------------------------------

/** Respirator over head rows 9-12; the eye row stays clear (C.3). */
const CHEMIST_HEAD_SE = over(BARE_SE, {
  11: ".hnmmmmmmMH.",
  12: ".hnmvvvmMMH.",
  13: "..nmvvvmMM..",
  14: "...mvvVM....",
});

const CHEMIST_HEAD_NE = over(BARE_NE, {
  11: ".hHmmmmmmHH.",
  12: ".HHHmmmHHHH.",
  13: "..LssSSsSH..",
  14: "....ssSS....",
});

const chemist: JobArt = {
  id: "chemist",
  read: "pale coat flaring to an A-shaped hem, flask bandolier, breathing mask",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 4, pitch: 0 },
  shades: {
    cloth: CLOTH_PALE,
    leather: shade3(i(UMBER_300), i(UMBER_500), i(UMBER_900), i(UMBER_900)),
    boot: shade3(i(UMBER_300), i(UMBER_500), i(UMBER_900), i(UMBER_900)),
    skin: SKIN,
    hair: shade3(i(UMBER_500), i(UMBER_900), i(UMBER_900), i(UMBER_900)),
    metal: PLATE,
  },
  head: (c) => head(c.view === "se" ? CHEMIST_HEAD_SE : CHEMIST_HEAD_NE)(c),
  front: (c) => {
    const j = c.joints;
    const hem: RigPoint = { dx: j.hip.dx, up: 8 };
    const flask = (dx: number, up: number): Prim[] => [
      ...shadedBox({ dx: j.shoulder.dx + dx, up: j.shoulder.up + up }, 3, 4, GLASS),
      box({ dx: j.shoulder.dx + dx, up: j.shoulder.up + up + 2 }, 2, 1, STEP.soot300),
    ];
    return [
      // The A-hem: widest silhouette below the waist in the roster.
      ...shadedLimb({ dx: j.hip.dx, up: j.hip.up + 2 }, hem, 10, 13, CLOTH_PALE, { soft: true }),
      // Open front: a narrow verdigris lining, so the coat is not one pale slab
      // and is not a dress either.
      ...shadedLimb(
        { dx: j.hip.dx, up: j.hip.up + 1 },
        { dx: hem.dx + 1, up: hem.up + 1 },
        3,
        4,
        GLASS,
      ),
      // Coat-front fold lines: line-step verticals, not full height (C.4).
      ...shadedLimb(
        { dx: j.hip.dx - 4, up: j.hip.up - 1 },
        { dx: hem.dx - 5, up: hem.up + 2 },
        1,
        1,
        { ...CLOTH_PALE, base: CLOTH_PALE.line },
      ),
      ...shadedLimb(
        { dx: j.hip.dx + 4, up: j.hip.up - 1 },
        { dx: hem.dx + 5, up: hem.up + 2 },
        1,
        1,
        { ...CLOTH_PALE, base: CLOTH_PALE.shadow },
      ),
      box({ dx: hem.dx, up: hem.up }, 13, 1, CLOTH_PALE.shadow),
      shadedPatch({ dx: hem.dx, up: hem.up + 1 }, 11, 2, CLOTH_PALE.shadow),
      // Bandolier and its flasks.
      ...shadedLimb(
        { dx: j.shoulderNear.dx - 1, up: j.shoulderNear.up - 2 },
        { dx: j.hipFar.dx + 1, up: j.hipFar.up + 2 },
        3,
        3,
        c.sh.leather,
      ),
      ...flask(3, -3),
      ...flask(-1, -6),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const body = alongProp(hand, dir, 3);
    return [
      ...shadedBox(body, 4, 7, GLASS),
      ...shadedBox({ dx: body.dx, up: body.up + 4 }, 4, 2, PLATE),
    ];
  },
};

// ---------------------------------------------------------------------------
// Augmented — flesh and graft metal. soot 900/700/500, umber 900/500/300,
// copper 700/300, amber 500 + glow, brightblood. Asymmetric by construction.
// ---------------------------------------------------------------------------

/** A temple plate bolted over the shadow side, brightblood running the neck. */
const AUGMENTED_HEAD_SE = over(BARE_SE, {
  4: ".hjhhhhhh9M.",
  5: ".hjjhhhhh8M.",
  6: ".hjhhhhhh8M.",
  7: ".hhhhhhhh8M.",
  8: ".hLsssssS8M.",
  9: ".hLssdssd8M.",
  10: ".hLssssss8M.",
  11: ".hLsssSss8M.",
  12: ".hLssSSssSp.",
  13: "..LssSSsSp..",
  14: "....ssSpp...",
});

const AUGMENTED_HEAD_NE = over(BARE_NE, {
  4: ".hjjhhhhh9M.",
  5: ".hjjhhhhh8M.",
  6: ".hjhhhhhh8M.",
  7: ".hjhhhhhh8M.",
  8: ".hhhhhhhh8M.",
  9: ".hhhhhhhh8M.",
  10: ".hhhhhhhh8M.",
  11: ".hHhhhhhh8M.",
  12: ".HHHhhhHHpH.",
  13: "..LssSSsSp..",
  14: "....ssSpp...",
});

const augmented: JobArt = {
  id: "augmented",
  read: "lopsided: one oversized copper graft arm with amber seams, brightblood on the neck",
  build: { headW: 10, shoulderW: 16, hipW: 12, legW: 4, armW: 3, stance: 6, pitch: 0 },
  shades: {
    cloth: shade3(i(SOOT_300), i(SOOT_500), i(SOOT_700), i(SOOT_700)),
    leather: shade3(i(UMBER_300), i(UMBER_500), i(UMBER_900), i(UMBER_900)),
    boot: shade3(i(SOOT_500), i(SOOT_700), i(UMBER_900), i(UMBER_900)),
    skin: SKIN,
    hair: shade3(i(UMBER_300), i(UMBER_500), i(UMBER_900), i(UMBER_900)),
    metal: GRAFT,
  },
  head: (c) => head(c.view === "se" ? AUGMENTED_HEAD_SE : AUGMENTED_HEAD_NE)(c),
  front: (c) => {
    const j = c.joints;
    return [
      ...shadedBox({ dx: j.shoulder.dx - 2, up: j.shoulder.up - 3 }, 6, 3, {
        light: i(UMBER_300),
        base: i(UMBER_500),
        shadow: i(UMBER_900),
        line: i(UMBER_900),
      }),
      // Brightblood scarring on the collarbone, left of the graft.
      box({ dx: j.shoulder.dx - 4, up: j.shoulder.up - 1 }, 2, 1, STEP.brightblood),
      box({ dx: j.shoulder.dx - 3, up: j.shoulder.up - 2 }, 1, 1, STEP.brightblood),
    ];
  },
  /**
   * The graft arm, drawn last so it stays on top: segmented plates with
   * `umber-900` gaps and an amber seam running the joins (Appendix C.4).
   */
  held: (c) => {
    const j = c.joints;
    const shoulder: RigPoint = { dx: j.shoulderNear.dx, up: j.shoulderNear.up + 1 };
    const elbow = j.elbowNear;
    const hand = j.handNear;
    const upper: RigPoint = { dx: (shoulder.dx + elbow.dx) / 2, up: (shoulder.up + elbow.up) / 2 };
    const lower: RigPoint = { dx: (elbow.dx + hand.dx) / 2, up: (elbow.up + hand.up) / 2 };
    const g = growth(c.pose.glow);
    const flat = (color: number): Shade3 => ({
      light: color,
      base: color,
      shadow: color,
      line: color,
    });
    return [
      // Segmented plates, gap lines, then the seam that runs the joins (C.4).
      ...shadedBox(shoulder, 7, 6, GRAFT),
      ...shadedLimb(shoulder, elbow, 6, 6, GRAFT),
      ...shadedLimb(elbow, hand, 6, 6, GRAFT),
      ...shadedLimb(upper, upper, 6, 6, flat(GRAFT.line)),
      ...shadedLimb(elbow, elbow, 6, 6, flat(GRAFT.line)),
      ...shadedBox(hand, 6, 4, shade3(i(COPPER_300), i(COPPER_700), i(UMBER_900), i(UMBER_900))),
      // The seam runs the whole arm so it reads as one lit line, not two dashes.
      ...shadedLimb(shoulder, elbow, 1 + g, 1 + g, flat(SEAM.body)),
      ...shadedLimb(elbow, hand, 1 + g, 1 + g, flat(SEAM.body)),
      ...shadedLimb(upper, upper, 2 + g, 2 + g, flat(SEAM.body)),
      ...shadedLimb(lower, lower, 2 + g, 2 + g, flat(SEAM.body)),
    ];
  },
};

// ---------------------------------------------------------------------------
// Railrunner — leather, goggles down, coupling hook. umber 900/700/500/300,
// soot 900/700/500/300/100, copper 700/500/300. The only copper-500 on a person.
// ---------------------------------------------------------------------------

/** Goggles *down* over the eye row, lensed, gleam on the left lens only (C.3). */
const RAILRUNNER_HEAD_SE = over(BARE_SE, {
  2: "...444444...",
  3: "..44444444..",
  4: ".4444444444.",
  5: ".2222222222.",
  6: ".K44444444K.",
  8: ".K999K999KK.",
  9: ".K166K666KK.",
});

const RAILRUNNER_HEAD_NE = over(BARE_NE, {
  2: "...444444...",
  3: "..44444444..",
  4: ".4444444444.",
  5: ".2222222222.",
  6: ".K44444444K.",
  8: ".K99999999K.",
});

const railrunner: JobArt = {
  id: "railrunner",
  read: "lean and pitched forward, coat tail streaming back, coupling hook at the hip",
  build: { headW: 10, shoulderW: 10, hipW: 10, legW: 3, armW: 3, stance: 5, pitch: 2 },
  shades: {
    cloth: LEATHER,
    leather: LEATHER_DEEP,
    boot: shade3(i(SOOT_300), i(SOOT_500), i(SOOT_700), i(SOOT_700)),
    skin: SKIN,
    hair: shade3(i(SOOT_500), i(SOOT_700), i(UMBER_900), i(UMBER_900)),
    metal: shade3(i(COPPER_300), i(COPPER_700), i(UMBER_900), i(UMBER_900)),
  },
  head: (c) => head(c.view === "se" ? RAILRUNNER_HEAD_SE : RAILRUNNER_HEAD_NE)(c),
  back: (c) => {
    const j = c.joints;
    const kick = c.state === "walk" ? 2 : 0;
    const tailWidth = c.view === "ne" ? 10 : 8;
    const tip: RigPoint = { dx: j.hip.dx - 8 - kick, up: 8 - kick };
    return [
      ...shadedLimb(
        { dx: j.hip.dx - 1, up: j.hip.up + 4 },
        tip,
        8,
        tailWidth,
        LEATHER_DEEP,
        { soft: true },
      ),
      shadedPatch({ dx: tip.dx, up: tip.up - 1 }, tailWidth - 2, 2, LEATHER_DEEP.line),
    ];
  },
  front: (c) => {
    const j = c.joints;
    return [
      ...shadedBox({ dx: j.hip.dx, up: j.hip.up + 1 }, c.build.hipW + 1, 3, LEATHER_DEEP),
      box({ dx: j.hip.dx + 3, up: j.hip.up + 2 }, 2, 1, STEP.grip),
    ];
  },
  held: (c) => {
    const dir = c.pose.propDir;
    const hand = c.joints.handNear;
    const neck = alongProp(hand, dir, 6);
    const tip = alongProp(hand, dir, 9);
    return [
      ...shadedLimb(alongProp(hand, dir, -2), neck, 2, 2, PLATE),
      // The coupling jaw: the reserved affordance color, on the thing it works.
      box(tip, 6, 2, STEP.grip),
      box({ dx: tip.dx + 2, up: tip.up - 2 }, 2, 4, STEP.grip),
      box({ dx: tip.dx + 1, up: tip.up - 4 }, 3, 2, STEP.grip),
      box({ dx: tip.dx, up: tip.up + 1 }, 5, 1, STEP.copper300),
      box({ dx: tip.dx + 2, up: tip.up - 3 }, 1, 2, STEP.copper700),
    ];
  },
};

/** Canvas coordinates of a rig point, offset — for one-off spark pixels. */
function cxy(p: RigPoint, dx: number, dy: number): [number, number] {
  return [Math.round(16 + p.dx + dx), Math.round(44 - p.up + dy)];
}

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
