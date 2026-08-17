// The painted map-object faces as Three.js textures, and the box-slot layout
// that dresses a primitive with them (ART_DIRECTION §6, D.6).
//
// **The spriteId is the key.** `data/maps/*.json` authors object identity in
// `spriteId` and until this pass nothing in `src/render` read it, so a main and a
// switchboard — the same word in the file — landed on the same primitive. Here
// the word finally buys something: an object whose `spriteId` has delivered art
// wears it, and an object whose `spriteId` has none keeps the primitive it
// already had, unchanged. `cable-trough` and `charge-hoist` drop in by adding a
// sheet to `OBJECT_ART` and `src/art/masters/objects.ts`; nothing here changes.
//
// **Objects are still boxes.** Only units billboard, and only units should: a
// main blocks movement and line of sight, units walk around it and stand beside
// it, and a card turning to face the camera would break both the occlusion the
// tactical read depends on and the height the player counts off the strata lines
// (OBJECT_BRIEFS, delivery format). The art dresses the geometry; it does not
// replace it.
//
// Filtering follows the tile faces and the sprite sheet: `NearestFilter` on
// magnification so a machine shows hard texel edges at the zooms the camera sits
// at, trilinear on minification so a board pulled out to ~40 screen px per tile
// does not crawl. The chain is supplied rather than generated, for the same
// reason the other two supply theirs. Unlike a tile face these clamp — a machine
// face is laid once, not three hundred times.

import * as THREE from "three";
import { FACE_SHADE } from "../art/palette.js";
import type { ObjectFaceId, ObjectPowerState, ObjectSpriteId } from "../art/objects.js";
import { objectCarrierLevels, objectFaceLevels } from "../art/objectset.js";
import { flipRows } from "../art/sheet.js";

const asBytes = (data: Uint8ClampedArray): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const cache = new Map<string, THREE.Texture | null>();

const build = (levels: readonly { width: number; height: number; data: Uint8ClampedArray }[]): THREE.Texture => {
  // WebGL ignores flipY for buffer uploads, so every level ships bottom-up —
  // which also puts the painting's top row at v = 1, where a box's UVs want it.
  const flipped = levels.map(flipRows);
  const base = flipped[0] as (typeof flipped)[number];
  const texture = new THREE.DataTexture(asBytes(base.data), base.width, base.height, THREE.RGBAFormat);
  texture.mipmaps = flipped.map((level) => ({
    data: asBytes(level.data),
    width: level.width,
    height: level.height,
  }));
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
};

/**
 * The shared texture for one face in one of §6's states. Built once, cached for
 * the session, exactly as `unitSheet` caches a job sheet: a board with six mains
 * on it should upload three paintings, not eighteen.
 */
export function objectFaceTexture(
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectPowerState,
): THREE.Texture {
  const key = `paint:${sprite}:${face}:${state}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const texture = build(objectFaceLevels(sprite, face, state));
  cache.set(key, texture);
  return texture;
}

/**
 * The carrier's emissive map: the seam, its core and its halo, self-lit, so the
 * amber column is a light in the fiction rather than an ochre stripe the face
 * shade has already dimmed to 62%. `null` in the states §6 gives no halo, which
 * is how an unpowered main goes dead without a second painting.
 */
export function objectCarrierTexture(
  sprite: ObjectSpriteId,
  face: ObjectFaceId,
  state: ObjectPowerState,
): THREE.Texture | null {
  const key = `carrier:${sprite}:${face}:${state}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const levels = objectCarrierLevels(sprite, face, state);
  const texture = levels === null ? null : build(levels);
  cache.set(key, texture);
  return texture;
}

/**
 * Which painted face goes in each of `BoxGeometry`'s six material slots, in
 * three's own order: `+x, -x, +y, -y, +z, -z`.
 *
 * The box is always built with the object's **long axis on local z**, and a map
 * that runs it east-west turns the mesh a quarter about y instead of turning the
 * paint. That is what keeps the top cell — 32 across by 64 along — landing on the
 * one face whose UVs run u across and v along, at every orientation, without a
 * second painting or a rotated copy of the first.
 *
 * The underside is never seen: it sits on the terrain the object stands on. It
 * wears the top face so the slot is not left holding an untextured material.
 */
export const BOX_FACE_SLOTS: readonly ObjectFaceId[] = ["long", "long", "top", "top", "end", "end"];

/** Yaw that puts the object's long axis on the map's long axis. */
export const boxYaw = (runAxis: "x" | "z"): number => (runAxis === "x" ? Math.PI / 2 : 0);

/**
 * The face shade §5 and the shared spec fix, per painted face, for an object
 * turned this way on the map. The brief warns about exactly this: the engine does
 * not know which way an object is turned, so the long side faces east/west on a
 * main whose run is north-south and is shown at 62%, and faces north/south on a
 * main turned the other way and is shown at 78%. The painting survives both or it
 * survives neither.
 */
export const faceShade = (face: ObjectFaceId, runAxis: "x" | "z"): number => {
  if (face === "top") return FACE_SHADE.top;
  // A face is north/south when its normal has a z component, which is the same
  // test `render/terrain.ts` makes on a tile skirt. An end cap's normal points
  // along the run; a long side's points across it.
  const normalAxis = face === "end" ? runAxis : runAxis === "x" ? "z" : "x";
  return normalAxis === "z" ? FACE_SHADE.sideNorthSouth : FACE_SHADE.sideEastWest;
};
