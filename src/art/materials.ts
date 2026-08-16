// The material vocabulary of ART_DIRECTION Appendix C.4, as palette-index
// shade triples. A form picks a material here and inherits its ramp; nothing in
// `jobs.ts` reaches past this file for a shading step, which is what keeps the
// light direction and the 12-color budget honest.

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
  UMBER_300,
  UMBER_500,
  UMBER_700,
  UMBER_900,
  VERDIGRIS_300,
  VERDIGRIS_500,
  VERDIGRIS_700,
  type Hex,
} from "./palette.js";
import { paletteIndex, shade3, type Shade3 } from "./pixel.js";

const i = (hex: Hex): number => paletteIndex(hex);

/** Skin: the umber ramp with copper-300 borrowed as the lit facet. */
export const SKIN: Shade3 = shade3(i(COPPER_300), i(UMBER_300), i(UMBER_500), i(UMBER_900));

/** Plate armor: hard-edged soot, with soot-100 held back as a spark. */
export const PLATE: Shade3 = shade3(i(SOOT_300), i(SOOT_500), i(SOOT_700), i(SOOT_800));
export const PLATE_DEEP: Shade3 = shade3(i(SOOT_500), i(SOOT_700), i(SOOT_800), i(SOOT_800));

/** Leather: umber, lit only at wear points. */
export const LEATHER: Shade3 = shade3(i(UMBER_300), i(UMBER_500), i(UMBER_700), i(UMBER_900));
export const LEATHER_DEEP: Shade3 = shade3(i(UMBER_500), i(UMBER_700), i(UMBER_900), i(UMBER_900));

/** Pale lab cloth. */
export const CLOTH_PALE: Shade3 = shade3(i(SOOT_100), i(SOOT_300), i(SOOT_500), i(SOOT_700));
/** Dark technical cloth — the Conduit's coat register. */
export const CLOTH_DARK: Shade3 = shade3(i(SOOT_500), i(SOOT_700), i(SOOT_800), i(UMBER_900));

/**
 * Graft and machine metal. The middle copper step is deliberately skipped:
 * `copper-500` stays the operable affordance of §6, so the gap between 700 and
 * 300 is what lets a grip be findable on a body.
 */
export const GRAFT: Shade3 = shade3(i(COPPER_300), i(COPPER_700), i(UMBER_900), i(UMBER_900));

/** Glass and chemistry. No line step — glass has no interior separation. */
export const GLASS: Shade3 = shade3(i(VERDIGRIS_300), i(VERDIGRIS_500), i(VERDIGRIS_700), i(VERDIGRIS_700));

/** Emissive: body plus core, no shadow step (the halo replaces the outline). */
export const SEAM = { body: i(AMBER_500), core: i(AMBER_300) } as const;

/** Loose steps a glyph may name directly, for helmets, lenses and trim. */
export const STEP = {
  spark: i(SOOT_100),
  soot300: i(SOOT_300),
  soot500: i(SOOT_500),
  soot700: i(SOOT_700),
  soot800: i(SOOT_800),
  umber900: i(UMBER_900),
  umber700: i(UMBER_700),
  umber500: i(UMBER_500),
  umber300: i(UMBER_300),
  copper700: i(COPPER_700),
  copper300: i(COPPER_300),
  /** Reserved: only on a grip, lever or coupling the unit actually works. */
  grip: i(COPPER_500),
  verdigris700: i(VERDIGRIS_700),
  verdigris500: i(VERDIGRIS_500),
  verdigris300: i(VERDIGRIS_300),
  amber500: i(AMBER_500),
  amber300: i(AMBER_300),
  brightblood: i(BRIGHTBLOOD),
  hazard: i(HAZARD),
} as const;
