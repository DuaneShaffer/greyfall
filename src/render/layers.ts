// The ground-overlay stack, in one place. Everything drawn between the terrain
// and the camera declares its band here rather than picking a number locally —
// that is how a move wash ended up painted over the team rings it is supposed
// to sit under (ART_DIRECTION Appendix D).
//
// Lower draws first. Three.js sorts the opaque and transparent lists
// separately, so these values only order objects *within* a list; the terrain
// and the unit billboards are opaque and are already under every transparent
// overlay whatever their band says.

import type * as THREE from "three";

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

/**
 * Bloom-eligible geometry lives on its own camera layer; the post chain renders
 * that layer alone into the blur. Objects that also appear in the beauty pass
 * `enable` it; a mesh that exists only to be blurred `set`s it.
 */
export const BASE_LAYER = 0;
export const BLOOM_LAYER = 1;

export const markBloomEligible = (object: THREE.Object3D): void => {
  object.layers.enable(BLOOM_LAYER);
};

export const markBloomOnly = (object: THREE.Object3D): void => {
  object.layers.set(BLOOM_LAYER);
};
