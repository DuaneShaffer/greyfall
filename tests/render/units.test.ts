/** @vitest-environment happy-dom */
// Frame/facing math, plus the team cues a UnitVisual hangs off the billboard.
// happy-dom has no 2d context, so `stubCanvas2d` supplies the little of it the
// sheet builder touches.

import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import {
  APPARENT_VIEWS,
  CAMERA_YAW_CORNERS,
  apparentView,
  drawnViewFor,
  type CameraYaw,
} from "../../src/art/sprites.js";
import type { Facing, Team } from "../../src/data/schemas/common.js";
import { teamColor } from "../../src/render/palette.js";
import { UnitVisual, cameraYawIndex } from "../../src/render/units.js";
import type { UnitView } from "../../src/render/viewmodel.js";

const FACINGS: readonly Facing[] = ["north", "east", "south", "west"];
const QUARTER = Math.PI / 2;
const BASE_YAW = Math.PI / 4;

const stubCanvas2d = (): void => {
  const proto = globalThis.HTMLCanvasElement.prototype as unknown as {
    getContext: (id: string) => unknown;
  };
  proto.getContext = (id: string) =>
    id === "2d"
      ? {
          createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: () => {},
        }
      : null;
};

const unitView = (team: Team, downed = false): UnitView => ({
  id: "rowen",
  name: "Rowen Corvane",
  jobId: "railrunner",
  team,
  position: { x: 0, y: 0 },
  elevation: 0,
  facing: "north",
  hpFraction: 1,
  downed,
});

const meshNamed = (visual: UnitVisual, name: string): THREE.Mesh => {
  const found = visual.group.getObjectByName(name);
  expect(found, name).toBeDefined();
  return found as THREE.Mesh;
};

const colorOf = (mesh: THREE.Mesh): number =>
  (mesh.material as THREE.MeshBasicMaterial).color.getHex();

/** Radii of every vertex of a ground marker, deduplicated. */
const markerRadii = (mesh: THREE.Mesh): number[] => {
  const position = mesh.geometry.getAttribute("position");
  const radii = new Set<number>();
  for (let i = 0; i < position.count; i += 1) {
    radii.add(Number(Math.hypot(position.getX(i), position.getZ(i)).toFixed(4)));
  }
  return [...radii].sort((a, b) => a - b);
};

/** How many separate arcs the ring is drawn in — the shape half of the cue. */
const markerArcs = (mesh: THREE.Mesh): number => {
  const position = mesh.geometry.getAttribute("position");
  const angles = new Set<number>();
  for (let i = 0; i < position.count; i += 1) {
    angles.add(Number(Math.atan2(position.getX(i), position.getZ(i)).toFixed(4)));
  }
  const sorted = [...angles].sort((a, b) => a - b);
  let gaps = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const here = sorted[i]!;
    const next = i === sorted.length - 1 ? sorted[0]! + Math.PI * 2 : sorted[i + 1]!;
    if (next - here > 0.3) gaps += 1;
  }
  return Math.max(1, gaps);
};

const onDispose = (target: THREE.BufferGeometry | THREE.Material) => {
  const state = { disposed: false };
  target.addEventListener("dispose", () => {
    state.disposed = true;
  });
  return state;
};

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
        expect(drawnViewFor(facing, yaw)).toEqual(APPARENT_VIEWS[apparent]);
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
      const selection = drawnViewFor("north", yaw);
      still.push(`${selection.view}:${selection.mirrored}`);
    }
    expect(new Set(still).size).toBe(4);
  });

  it("derives the same selection through the camera yaw angle", () => {
    for (let step = -4; step <= 4; step += 1) {
      const yaw = BASE_YAW + step * QUARTER;
      const index = cameraYawIndex(yaw);
      expect(drawnViewFor("east", index)).toEqual(APPARENT_VIEWS[apparentView("east", index)]);
    }
  });
});

describe("team cues", () => {
  beforeAll(stubCanvas2d);

  it("rings every unit in its own team colour", () => {
    for (const team of ["player", "enemy", "neutral"] as const) {
      const visual = new UnitVisual(unitView(team));
      const marker = meshNamed(visual, "team-marker");

      expect(marker.visible).toBe(true);
      expect(colorOf(marker)).toBe(teamColor[team]);
      expect(colorOf(meshNamed(visual, "team-rim"))).toBe(teamColor[team]);
      expect(colorOf(meshNamed(visual, "facing-wedge"))).toBe(teamColor[team]);
      visual.dispose();
    }
  });

  it("separates the sides by ring shape, not only by hue", () => {
    const arcs = (["player", "enemy", "neutral"] as const).map((team) => {
      const visual = new UnitVisual(unitView(team));
      const count = markerArcs(meshNamed(visual, "team-marker"));
      visual.dispose();
      return count;
    });

    expect(arcs[0]).toBe(1);
    expect(new Set(arcs).size).toBe(3);
  });

  it("draws the ring outside the facing wedge so the two cues stay separate", () => {
    const visual = new UnitVisual(unitView("player"));
    const radii = markerRadii(meshNamed(visual, "team-marker"));
    const wedge = meshNamed(visual, "facing-wedge").geometry;
    wedge.computeBoundingSphere();

    expect(radii).toHaveLength(2);
    expect(radii[0]).toBeGreaterThan(wedge.boundingSphere!.radius);
    expect(radii[1]!).toBeGreaterThan(radii[0]!);
    visual.dispose();
  });

  it("backs the sprite with an oversized rim quad set behind the billboard", () => {
    const visual = new UnitVisual(unitView("player"));
    const billboard = meshNamed(visual, "unit-billboard");
    const rim = meshNamed(visual, "team-rim");
    billboard.geometry.computeBoundingBox();
    rim.geometry.computeBoundingBox();
    const sprite = billboard.geometry.boundingBox!.getSize(new THREE.Vector3());
    const backing = rim.geometry.boundingBox!.getSize(new THREE.Vector3());

    expect(rim.parent).toBe(billboard);
    expect(rim.position.z).toBeLessThan(0);
    expect(backing.x).toBeGreaterThan(sprite.x);
    expect(backing.y).toBeGreaterThan(sprite.y);
    visual.dispose();
  });

  it("reshapes and repaints the ring when a unit changes side", () => {
    const visual = new UnitVisual(unitView("player"));
    const marker = meshNamed(visual, "team-marker");
    const retired = onDispose(marker.geometry);

    visual.setView(unitView("enemy"));

    expect(retired.disposed).toBe(true);
    expect(colorOf(marker)).toBe(teamColor.enemy);
    expect(colorOf(meshNamed(visual, "team-rim"))).toBe(teamColor.enemy);
    expect(markerArcs(marker)).toBeGreaterThan(1);
    visual.dispose();
  });

  it("keeps a downed unit's ring, dimmed, and drops its facing and rim", () => {
    const visual = new UnitVisual(unitView("enemy"));
    const marker = meshNamed(visual, "team-marker");
    const material = marker.material as THREE.MeshBasicMaterial;
    const standing = material.opacity;

    visual.setDowned(true);

    expect(marker.visible).toBe(true);
    expect(material.opacity).toBeLessThan(standing);
    expect(meshNamed(visual, "facing-wedge").visible).toBe(false);
    expect(meshNamed(visual, "team-rim").visible).toBe(false);

    visual.setDowned(false);

    expect(material.opacity).toBe(standing);
    expect(meshNamed(visual, "facing-wedge").visible).toBe(true);
    expect(meshNamed(visual, "team-rim").visible).toBe(true);
    visual.dispose();
  });

  it("releases every marker geometry and material it owns", () => {
    const visual = new UnitVisual(unitView("enemy"));
    const marker = meshNamed(visual, "team-marker");
    const rim = meshNamed(visual, "team-rim");
    const retired = [
      onDispose(marker.geometry),
      onDispose(marker.material as THREE.Material),
      onDispose(rim.geometry),
      onDispose(rim.material as THREE.Material),
    ];

    visual.dispose();

    expect(retired.map((entry) => entry.disposed)).toEqual([true, true, true, true]);
  });
});

describe("the move preview", () => {
  it("stands the figure clear of its tile and leaves the team ring behind", () => {
    const visual = new UnitVisual(unitView("player"));
    const billboard = meshNamed(visual, "unit-billboard");
    const shadow = meshNamed(visual, "unit-shadow");
    const wedge = meshNamed(visual, "facing-wedge");
    const marker = meshNamed(visual, "team-marker");
    const restY = { shadow: shadow.position.y, wedge: wedge.position.y };

    visual.setPreviewOffset({ x: 2, y: 1, z: -3 });

    expect(billboard.position.toArray()).toEqual([2, 1, -3]);
    expect([shadow.position.x, shadow.position.z]).toEqual([2, -3]);
    expect(shadow.position.y).toBeCloseTo(restY.shadow + 1, 6);
    expect([wedge.position.x, wedge.position.z]).toEqual([2, -3]);
    expect(wedge.position.y).toBeCloseTo(restY.wedge + 1, 6);
    // The unit is really still here, and the ring is what says so.
    expect([marker.position.x, marker.position.z]).toEqual([0, 0]);
    expect(visual.group.position.toArray()).toEqual([0, 0, 0]);
    expect(visual.previewOffset).toEqual({ x: 2, y: 1, z: -3 });

    visual.setPreviewOffset(null);

    expect(billboard.position.toArray()).toEqual([0, 0, 0]);
    expect(shadow.position.y).toBeCloseTo(restY.shadow, 6);
    expect(wedge.position.y).toBeCloseTo(restY.wedge, 6);
    expect(visual.previewOffset).toBeNull();
    visual.dispose();
  });
});
