/**
 * UI_DESIGN §8's parity rule, measured against the terrain raycast the pointer
 * actually uses: everything the keyboard can do, the mouse can do.
 *
 * At the one bearing the rig opens on, the Meter House's height-3 east wall
 * stands between the camera and the x=14 column, so the whole East Main — the
 * source a ranged order most wants to aim at — could not be picked with the
 * mouse at all. Orbit was on Q/E and on nothing else, which made a keyboard the
 * requirement for reaching 22 tiles (acceptance finding C).
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TacticsCamera } from "../../src/render/camera.js";
import { tileCenter } from "../../src/render/board.js";
import { buildTerrainMeshData, tileFromTriangle } from "../../src/render/terrain.js";
import { loadContent } from "../core/fixtures.js";

const map = loadContent().maps["meter-house"]!;
const data = buildTerrainMeshData(map);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
const terrain = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
terrain.updateMatrixWorld();

/** The rig as the app builds it, turned `steps` quarters and let settle. */
function rig(steps: number): TacticsCamera {
  const camera = new TacticsCamera();
  camera.frameMap(map);
  camera.setViewport(1600, 900);
  for (let step = 0; step < Math.abs(steps); step += 1) camera.orbit(steps > 0 ? 1 : -1);
  camera.update(1);
  return camera;
}

/**
 * Tiles the pointer can land on: each tile's own centre is projected to the
 * screen and cast back, exactly as `BattleRenderer.pickTile` does. A tile whose
 * own centre answers with somebody else's roof is a tile the mouse cannot aim
 * at.
 */
function reachable(camera: TacticsCamera): Set<string> {
  const raycaster = new THREE.Raycaster();
  const out = new Set<string>();
  for (let y = 0; y < map.depth; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const centre = tileCenter(map, x, y);
      const ndc = new THREE.Vector3(centre.x, centre.y, centre.z).project(camera.camera);
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera.camera);
      const hit = raycaster.intersectObject(terrain, false)[0];
      if (hit?.faceIndex === undefined || hit.faceIndex === null) continue;
      const tile = tileFromTriangle(map, data, hit.faceIndex);
      if (tile?.x === x && tile.y === y) out.add(`${x},${y}`);
    }
  }
  return out;
}

const EAST_MAIN = ["14,7", "14,8"];

describe("the pointer can reach the whole board once the mouse can orbit", () => {
  it("cannot reach the East Main at the bearing the battle opens on", () => {
    const opening = reachable(rig(0));
    for (const tile of EAST_MAIN) expect(opening.has(tile)).toBe(false);
    expect(map.width * map.depth - opening.size).toBeGreaterThan(20);
  });

  it("reaches it after one quarter turn — the turn the mouse now has", () => {
    for (const steps of [-1, 2]) {
      const turned = reachable(rig(steps));
      for (const tile of EAST_MAIN) expect(turned.has(tile)).toBe(true);
    }
  });

  // The parity claim itself: no tile is unreachable from every bearing, so a
  // player who never touches the keyboard is not locked out of any of them.
  it("leaves no tile unreachable from all four bearings", () => {
    const union = new Set<string>();
    for (const steps of [0, 1, 2, 3]) for (const tile of reachable(rig(steps))) union.add(tile);
    expect(union.size).toBe(map.width * map.depth);
  });
});
