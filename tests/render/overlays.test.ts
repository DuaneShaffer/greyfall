/** @vitest-environment happy-dom */
// The ground-overlay stack (ART_DIRECTION Appendix D) and the bloom layer the
// post chain renders on its own. Both are ordering rules with no visual test
// behind them, so they are asserted directly on the scene graph.

import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMap } from "../../src/data/schemas/map.js";
import { TileHighlights } from "../../src/render/highlights.js";
import { BASE_LAYER, BLOOM_LAYER, DRAW_ORDER } from "../../src/render/layers.js";
import { ObjectVisual } from "../../src/render/objects.js";
import { palette } from "../../src/render/palette.js";
import { UnitVisual } from "../../src/render/units.js";
import type { MapObjectView, UnitView } from "../../src/render/viewmodel.js";

const map: GameMap = {
  schemaVersion: 1,
  id: "overlay-map",
  name: "Overlay Map",
  width: 2,
  depth: 2,
  tiles: Array.from({ length: 4 }, () => ({ height: 0, terrain: "plain" as const })),
  objects: [],
  deploymentTiles: [{ x: 0, y: 0 }],
  grids: [],
};

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

const unitView = (): UnitView => ({
  id: "rowen",
  name: "Rowen Corvane",
  spriteId: "conduit",
  team: "player",
  position: { x: 0, y: 0 },
  elevation: 0,
  facing: "north",
  hpFraction: 1,
  downed: false,
});

const cellView = (): MapObjectView => ({
  id: "cell-a",
  kind: "cell",
  spriteId: "cell",
  tiles: [{ x: 0, y: 0 }],
  surfaceHeight: null,
  gridRole: null,
  powered: true,
  destroyed: false,
  severed: false,
  volatile: false,
});

const named = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const found = root.getObjectByName(name);
  expect(found, name).toBeDefined();
  return found as THREE.Object3D;
};

describe("ground overlay stacking", () => {
  beforeAll(stubCanvas2d);

  it("orders the stack terrain -> shadow -> wash -> unit furniture -> sprite -> vfx", () => {
    const order = [
      DRAW_ORDER.terrain,
      DRAW_ORDER.unitShadow,
      DRAW_ORDER.highlightFill,
      DRAW_ORDER.highlightOutline,
      DRAW_ORDER.unitMarker,
      DRAW_ORDER.unitRim,
      DRAW_ORDER.unitSprite,
      DRAW_ORDER.vfx,
      DRAW_ORDER.popup,
    ];

    expect(order).toStrictEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  it("draws a tile wash under the team ring and facing wedge it covers", () => {
    const highlights = new TileHighlights(map);
    highlights.set("move", [{ x: 0, y: 0 }], palette.highlightMove);
    const fill = highlights.group.children[0] as THREE.Mesh;
    const outline = highlights.group.children[1] as THREE.LineSegments;

    const visual = new UnitVisual(unitView());
    const marker = named(visual.group, "team-marker");
    const wedge = named(visual.group, "facing-wedge");

    expect(fill.renderOrder).toBeLessThan(outline.renderOrder);
    expect(outline.renderOrder).toBeLessThan(marker.renderOrder);
    expect(outline.renderOrder).toBeLessThan(wedge.renderOrder);
    // The contact shadow is a darkening of the ground, so the wash covers it.
    expect(named(visual.group, "unit-shadow").renderOrder).toBeLessThan(fill.renderOrder);

    highlights.clearAll();
    visual.dispose();
  });
});

describe("bloom layer", () => {
  beforeAll(stubCanvas2d);

  it("hangs a bloom-only twin of the sprite off the billboard", () => {
    const visual = new UnitVisual(unitView());
    const billboard = named(visual.group, "unit-billboard") as THREE.Mesh;
    const glow = named(visual.group, "sprite-glow") as THREE.Mesh;

    expect(glow.parent).toBe(billboard);
    expect(glow.layers.test(new THREE.Layers())).toBe(false);
    expect(glow.layers.isEnabled(BLOOM_LAYER)).toBe(true);
    // Same sheet and the same UV window: one frame update covers both.
    expect((glow.material as THREE.MeshBasicMaterial).map).toBe(
      (billboard.material as THREE.MeshBasicMaterial).map,
    );

    visual.dispose();
  });

  it("keeps the sprite itself out of the bloom render", () => {
    const visual = new UnitVisual(unitView());
    const base = new THREE.Layers();
    base.set(BASE_LAYER);

    for (const name of ["unit-billboard", "team-rim", "team-marker", "facing-wedge"]) {
      expect(named(visual.group, name).layers.isEnabled(BLOOM_LAYER), name).toBe(false);
    }
    expect(named(visual.group, "unit-billboard").layers.test(base)).toBe(true);

    visual.dispose();
  });

  it("marks a powered object's seam meshes and nothing around them", () => {
    const visual = new ObjectVisual(map, cellView());
    const meshes = visual.group.children.filter(
      (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
    );
    const blooming = meshes.filter((mesh) => mesh.layers.isEnabled(BLOOM_LAYER));

    expect(meshes.length).toBeGreaterThan(blooming.length);
    expect(blooming).toHaveLength(1);
    // The bloom pass sees no lights, so a seam contributes exactly its emissive.
    expect((blooming[0]!.material as THREE.MeshLambertMaterial).emissive.getHex()).toBe(
      palette.fluxAmber,
    );

    visual.dispose();
  });
});
