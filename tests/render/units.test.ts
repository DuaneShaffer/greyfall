// Pure playback/facing logic only: constructing a UnitVisual needs a DOM
// canvas, so these cover the math the renderer derives its frames from.

import { describe, expect, it } from "vitest";
import {
  APPARENT_VIEWS,
  CAMERA_YAW_CORNERS,
  apparentView,
  resolveFacing,
  type CameraYaw,
} from "../../src/art/sprites.js";
import type { Facing } from "../../src/data/schemas/common.js";
import { cameraYawIndex } from "../../src/render/units.js";

const FACINGS: readonly Facing[] = ["north", "east", "south", "west"];
const QUARTER = Math.PI / 2;
const BASE_YAW = Math.PI / 4;

describe("camera yaw index", () => {
  it("starts over the SE corner and steps around the corner list", () => {
    expect(CAMERA_YAW_CORNERS[0]).toBe("se");
    expect(cameraYawIndex(BASE_YAW)).toBe(0);
    // The rig turns the camera one way; the corner list reads the other.
    expect(cameraYawIndex(BASE_YAW + QUARTER)).toBe(3);
    expect(cameraYawIndex(BASE_YAW + 2 * QUARTER)).toBe(2);
    expect(cameraYawIndex(BASE_YAW + 3 * QUARTER)).toBe(1);
    expect(cameraYawIndex(BASE_YAW + 4 * QUARTER)).toBe(0);
    expect(cameraYawIndex(BASE_YAW - QUARTER)).toBe(1);
  });

  it("snaps to the nearest corner mid-orbit", () => {
    expect(cameraYawIndex(BASE_YAW + QUARTER * 0.2)).toBe(0);
    expect(cameraYawIndex(BASE_YAW + QUARTER * 0.8)).toBe(3);
  });
});

describe("facing to drawn view", () => {
  it("resolves all four apparent views from two drawn ones", () => {
    for (let yaw = 0 as CameraYaw; yaw < 4; yaw = ((yaw + 1) as CameraYaw)) {
      const seen = new Set<string>();
      for (const facing of FACINGS) {
        const apparent = apparentView(facing, yaw);
        seen.add(apparent);
        expect(resolveFacing(facing, yaw)).toEqual(APPARENT_VIEWS[apparent]);
      }
      expect(seen.size).toBe(4);
    }
  });

  it("uses the mirror mapping the spec fixes", () => {
    expect(APPARENT_VIEWS["front-right"]).toEqual({ view: "se", mirrored: false });
    expect(APPARENT_VIEWS["front-left"]).toEqual({ view: "se", mirrored: true });
    expect(APPARENT_VIEWS["back-right"]).toEqual({ view: "ne", mirrored: false });
    expect(APPARENT_VIEWS["back-left"]).toEqual({ view: "ne", mirrored: true });
  });

  it("turns the sprite when the camera orbits, not just when the unit turns", () => {
    const still: string[] = [];
    for (let yaw = 0 as CameraYaw; yaw < 4; yaw = ((yaw + 1) as CameraYaw)) {
      const selection = resolveFacing("north", yaw);
      still.push(`${selection.view}:${selection.mirrored}`);
    }
    expect(new Set(still).size).toBe(4);
  });

  it("derives the same selection through the camera yaw angle", () => {
    for (let step = -4; step <= 4; step += 1) {
      const yaw = BASE_YAW + step * QUARTER;
      const index = cameraYawIndex(yaw);
      expect(resolveFacing("east", index)).toEqual(APPARENT_VIEWS[apparentView("east", index)]);
    }
  });
});
