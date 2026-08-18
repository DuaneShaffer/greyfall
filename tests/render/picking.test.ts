/** @vitest-environment happy-dom */
/**
 * What the pointer landed on. A unit's sprite is a tile and a half tall and
 * stands over the tiles behind it, so aiming at a torso answered with whichever
 * roof happened to be drawn under the pointer — or, over a sprite standing at
 * the board's edge, with nothing at all. The figure answers for its own tile
 * now, and the empty air inside its quad still answers for the ground.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveFieldPick, type PickableFigure } from "../../src/render/scene.js";
import { UnitVisual } from "../../src/render/units.js";
import type { UnitView } from "../../src/render/viewmodel.js";

const unitView = (overrides: Partial<UnitView> = {}): UnitView => ({
  id: "rowen",
  name: "Rowen Corvane",
  jobId: "enforcer",
  team: "player",
  position: { x: 3, y: 4 },
  elevation: 0,
  facing: "south",
  hpFraction: 1,
  downed: false,
  ...overrides,
});

const terrain = new THREE.Object3D();

const figure = (covers: (u: number, v: number) => boolean): PickableFigure => ({
  unitId: "rowen",
  currentView: unitView(),
  coversUv: covers,
});

const hit = (
  object: THREE.Object3D,
  distance: number,
  extra: { faceIndex?: number; uv?: THREE.Vector2 } = {},
): THREE.Intersection =>
  ({ object, distance, ...extra }) as unknown as THREE.Intersection;

const tileOfFace = (faceIndex: number): { x: number; y: number } => ({ x: faceIndex, y: 0 });

describe("resolving a pick", () => {
  it("gives a figure's own tile when the ray struck its body", () => {
    const body = figure(() => true);
    const pick = resolveFieldPick(
      [hit(new THREE.Object3D(), 1, { uv: new THREE.Vector2(0.5, 0.5) }), hit(terrain, 4, { faceIndex: 9 })],
      terrain,
      tileOfFace,
      () => body,
    );

    expect(pick).toEqual({ tile: { x: 3, y: 4 }, unitId: "rowen" });
  });

  it("falls through the empty air inside the quad to the ground behind it", () => {
    const air = figure(() => false);
    const pick = resolveFieldPick(
      [hit(new THREE.Object3D(), 1, { uv: new THREE.Vector2(0.02, 0.98) }), hit(terrain, 4, { faceIndex: 9 })],
      terrain,
      tileOfFace,
      () => air,
    );

    expect(pick).toEqual({ tile: { x: 9, y: 0 }, unitId: null });
  });

  it("leaves a figure behind a wall behind it", () => {
    const body = figure(() => true);
    const pick = resolveFieldPick(
      [hit(terrain, 2, { faceIndex: 5 }), hit(new THREE.Object3D(), 6, { uv: new THREE.Vector2(0.5, 0.5) })],
      terrain,
      tileOfFace,
      () => body,
    );

    expect(pick).toEqual({ tile: { x: 5, y: 0 }, unitId: null });
  });

  it("answers with nothing off the board", () => {
    expect(resolveFieldPick([], terrain, tileOfFace, () => undefined)).toEqual({
      tile: null,
      unitId: null,
    });
  });

  it("hands back a copy of the tile, not the figure's own", () => {
    const body = figure(() => true);
    const pick = resolveFieldPick(
      [hit(new THREE.Object3D(), 1, { uv: new THREE.Vector2(0.5, 0.5) })],
      terrain,
      tileOfFace,
      () => body,
    );
    expect(pick.tile).not.toBe(body.currentView.position);
  });

  it("ignores a hit on a mesh no figure claims", () => {
    const pick = resolveFieldPick(
      [
        hit(new THREE.Object3D(), 1, { uv: new THREE.Vector2(0.5, 0.5) }),
        hit(terrain, 3, { faceIndex: 2 }),
      ],
      terrain,
      tileOfFace,
      () => undefined,
    );

    expect(pick).toEqual({ tile: { x: 2, y: 0 }, unitId: null });
  });
});

describe("the silhouette, not the rectangle", () => {
  it("is opaque over the figure and clear over the air beside it", () => {
    const visual = new UnitVisual(unitView());
    const samples = 21;
    let covered = 0;
    for (let row = 0; row < samples; row += 1) {
      for (let column = 0; column < samples; column += 1) {
        if (visual.coversUv(column / (samples - 1), row / (samples - 1))) covered += 1;
      }
    }

    // A figure fills a good part of its cell and nothing like all of it; the
    // point of the alpha test is that the difference is pickable.
    const fraction = covered / (samples * samples);
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.8);
    visual.dispose();
  });

  it("leaves the band above the head to the board behind it", () => {
    const visual = new UnitVisual(unitView());
    for (let column = 0; column <= 20; column += 1) {
      expect(visual.coversUv(column / 20, 1), `u=${column / 20}`).toBe(false);
    }
    visual.dispose();
  });

  it("keeps the figure pickable through an orbit's mirrored view", () => {
    const visual = new UnitVisual(unitView({ facing: "east" }));
    visual.faceCamera(Math.PI / 4 + Math.PI / 2);
    let covered = 0;
    for (let row = 0; row <= 20; row += 1) {
      for (let column = 0; column <= 20; column += 1) {
        if (visual.coversUv(column / 20, row / 20)) covered += 1;
      }
    }

    expect(covered).toBeGreaterThan(0);
    visual.dispose();
  });

  it("stands in with the whole quad when the sheet cannot be read", () => {
    const visual = new UnitVisual(unitView());
    (visual as unknown as { texture: { image: unknown } }).texture.image = null;

    expect(visual.coversUv(0, 1)).toBe(true);
    visual.dispose();
  });
});
