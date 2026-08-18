/** @vitest-environment happy-dom */
/**
 * The cursor's elevation readout. Height decides half the aim gate (UI_DESIGN
 * §14.3) and the field printed it nowhere: a blind playtest could get it only by
 * counting strata on a side face. The delta is the gate's own convention —
 * positive means the target stands higher — and it is absent outside a targeting
 * mode, because a resting hover has nothing to be measured against.
 */

import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameMap } from "../../src/data/schemas/map.js";
import { HEIGHT_STEP, tileCenter } from "../../src/render/board.js";
import { hasGlyph } from "../../src/render/glyphs.js";
import { CursorReadout, heightReadoutText } from "../../src/render/readout.js";

const map: GameMap = {
  schemaVersion: 1,
  id: "readout-map",
  name: "Readout Map",
  width: 2,
  depth: 2,
  tiles: [
    { height: 0, terrain: "plain" },
    { height: 3, terrain: "plain" },
    { height: 1, terrain: "plain" },
    { height: 2, terrain: "plain" },
  ],
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

describe("what the readout says", () => {
  it("prints the height on its own when nothing is being aimed", () => {
    expect(heightReadoutText(0, null)).toBe("H0");
    expect(heightReadoutText(3, null)).toBe("H3");
  });

  it("prints the difference beside it while an order is being aimed", () => {
    expect(heightReadoutText(3, 2)).toBe("H3 +2");
    expect(heightReadoutText(1, -2)).toBe("H1 -2");
    // Level with the actor is a fact worth stating, not an absence.
    expect(heightReadoutText(2, 0)).toBe("H2 +0");
  });

  it("is spelled in glyphs the atlas actually has", () => {
    for (const char of heightReadoutText(12, -3)) {
      expect(hasGlyph(char), char).toBe(true);
    }
  });
});

describe("where the readout sits", () => {
  beforeAll(stubCanvas2d);

  it("rides the tile it is reporting, at that tile's own height", () => {
    const readout = new CursorReadout();
    readout.show(map, { x: 1, y: 0 }, 3, null);
    const sprite = readout.group.getObjectByName("cursor-readout") as THREE.Sprite;
    const centre = tileCenter(map, 1, 0);

    expect(sprite.visible).toBe(true);
    expect(sprite.position.x).toBeCloseTo(centre.x);
    expect(sprite.position.z).toBeCloseTo(centre.z);
    expect(sprite.position.y).toBeGreaterThan(3 * HEIGHT_STEP);
    expect(readout.label).toBe("H3");
    readout.dispose();
  });

  it("goes quiet when the pointer leaves the board", () => {
    const readout = new CursorReadout();
    readout.show(map, { x: 0, y: 0 }, 0, null);
    readout.hide();

    expect(readout.label).toBeNull();
    readout.dispose();
  });

  it("reletters as the cursor moves rather than growing a sprite per tile", () => {
    const readout = new CursorReadout();
    readout.show(map, { x: 0, y: 0 }, 0, 1);
    readout.show(map, { x: 1, y: 1 }, 2, -1);

    expect(readout.group.children).toHaveLength(1);
    expect(readout.label).toBe("H2 -1");
    readout.dispose();
  });

  it("reuses one texture per phrase, however often it is shown", () => {
    const readout = new CursorReadout();
    readout.show(map, { x: 0, y: 0 }, 1, null);
    const sprite = readout.group.getObjectByName("cursor-readout") as THREE.Sprite;
    const first = sprite.material.map;
    readout.show(map, { x: 1, y: 1 }, 2, null);
    readout.show(map, { x: 0, y: 1 }, 1, null);

    expect(sprite.material.map).toBe(first);
    readout.dispose();
  });
});
