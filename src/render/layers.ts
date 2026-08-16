// The ground-overlay stack, in one place. Everything drawn between the terrain
// and the camera declares its band here rather than picking a number locally —
// that is how a move wash ended up painted over the team rings it is supposed
// to sit under (ART_DIRECTION Appendix D).
//
// Lower draws first. Three.js sorts the opaque and transparent lists
// separately, so these values only order objects *within* a list; the terrain
// and the unit billboards are opaque and are already under every transparent
// overlay whatever their band says.

export const DRAW_ORDER = {
  terrain: 0,
  /** Contact shadow: a darkening of the ground, so a tile wash covers it. */
  unitShadow: 1,
  highlightFill: 2,
  highlightOutline: 3,
  /** Team ring and facing wedge: unit furniture, never tinted by a wash. */
  unitMarker: 4,
  unitRim: 5,
  unitSprite: 6,
  vfx: 7,
  popup: 8,
} as const;
