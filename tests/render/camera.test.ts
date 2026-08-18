/**
 * The grab has to be exact. An orthographic rig translates every world point by
 * the same screen offset, so one probe point proves the whole board: if it
 * lands back under the pointer, nothing slid out from under the hand.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TacticsCamera } from "../../src/render/camera.js";

const VIEW_W = 800;
const VIEW_H = 600;

function screenOf(rig: TacticsCamera, point: THREE.Vector3): { x: number; y: number } {
  const ndc = point.clone().project(rig.camera);
  return { x: ((ndc.x + 1) / 2) * VIEW_W, y: ((1 - ndc.y) / 2) * VIEW_H };
}

function rigAt(yawSteps: number): TacticsCamera {
  const rig = new TacticsCamera();
  rig.setViewport(VIEW_W, VIEW_H);
  for (let i = 0; i < Math.abs(yawSteps); i += 1) rig.orbit(yawSteps > 0 ? 1 : -1);
  rig.update(1);
  return rig;
}

describe("panPixels", () => {
  it.each([0, 1, 2, 3])("carries the ground with the pointer at bearing %i", (steps) => {
    const rig = rigAt(steps);
    const probe = new THREE.Vector3(1.5, 0.5, -2);
    const before = screenOf(rig, probe);

    rig.panPixels(40, 25, VIEW_H);

    const after = screenOf(rig, probe);
    expect(after.x - before.x).toBeCloseTo(40, 6);
    expect(after.y - before.y).toBeCloseTo(25, 6);
  });

  it("scales with the zoom level, so a drag is pixels either way", () => {
    const rig = rigAt(0);
    rig.zoomStep(1);
    const probe = new THREE.Vector3(0, 0, 0);
    const before = screenOf(rig, probe);

    rig.panPixels(-30, -12, VIEW_H);

    const after = screenOf(rig, probe);
    expect(after.x - before.x).toBeCloseTo(-30, 6);
    expect(after.y - before.y).toBeCloseTo(-12, 6);
  });

  it("ignores a viewport with no height rather than dividing by it", () => {
    const rig = rigAt(0);
    const target = rig.target.clone();

    rig.panPixels(40, 25, 0);

    expect(rig.target.equals(target)).toBe(true);
  });
});
