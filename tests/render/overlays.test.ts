/** @vitest-environment happy-dom */
// The ground-overlay stack (ART_DIRECTION Appendix D). It is an ordering rule
// with no visual test behind it, so it is asserted on the scene graph.

import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMap } from "../../src/data/schemas/map.js";
import { TileHighlights } from "../../src/render/highlights.js";
import { DRAW_ORDER } from "../../src/render/layers.js";
import { palette } from "../../src/render/palette.js";
import { UnitVisual } from "../../src/render/units.js";
import type { UnitView } from "../../src/render/viewmodel.js";

const map: GameMap = {
  schemaVersion: 1,
  id: "overlay-map",
  name: "Overlay Map",
  width: 2,
  depth: 2,
  tiles: Array.from({ length: 4 }, () => ({ height: 0, terrain: "plain" as const })),
  objects: [],
  deploymentTiles: [{ x: 0, y: 0 }],
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

const named = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const found = root.getObjectByName(name);
  expect(found, name).toBeDefined();
  return found as THREE.Object3D;
};

describe("ground overlay stacking", () => {
  beforeAll(stubCanvas2d);

  it("runs terrain -> shadow -> wash -> unit furniture -> sprite -> vfx, once each", () => {
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
