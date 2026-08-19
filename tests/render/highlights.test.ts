/**
 * The overlay layer contract. `blocked` and `support` are painted by the
 * controller and drawn by the field: the controller decides which tiles are in
 * the set, the renderer decides what the set looks like. That split is the whole
 * guarantee behind UI_DESIGN §14.3 — a tile painted as a target can be trusted
 * to be one, because the layer that means "refused" cannot be given the target
 * colour by whoever paints it.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { GameMap } from "../../src/data/schemas/map.js";
import {
  HIGHLIGHT_STYLES,
  LAYER_BLOCKED,
  LAYER_DEPLOYMENT,
  LAYER_SUPPORT,
  TileHighlights,
  highlightStyleFor,
} from "../../src/render/highlights.js";
import { palette } from "../../src/render/palette.js";

const map: GameMap = {
  schemaVersion: 1,
  id: "highlight-map",
  name: "Highlight Map",
  width: 3,
  depth: 3,
  tiles: Array.from({ length: 9 }, () => ({ height: 0, terrain: "plain" as const })),
  objects: [],
  deploymentTiles: [{ x: 0, y: 0 }],
  grids: [],
};

const tiles = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

const fillOf = (highlights: TileHighlights): THREE.MeshBasicMaterial => {
  const fill = highlights.group.children.find(
    (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
  );
  expect(fill).toBeDefined();
  return (fill as THREE.Mesh).material as THREE.MeshBasicMaterial;
};

describe("the blocked layer", () => {
  it("is dimmed, stippled, and never the target colour", () => {
    const style = highlightStyleFor(LAYER_BLOCKED);
    expect(style).not.toBeNull();
    expect(style?.hatched).toBe(true);
    expect(style?.color).not.toBe(palette.highlightTarget);
    expect(style?.opacity).toBeLessThan(0.5);
  });

  it("keeps the field's colour whatever the caller paints it with", () => {
    const highlights = new TileHighlights(map);
    highlights.set(LAYER_BLOCKED, tiles, palette.highlightTarget);
    const material = fillOf(highlights);

    expect(material.color.getHex()).toBe(palette.highlightBlocked);
    expect(material.alphaMap).not.toBeNull();
    highlights.clearAll();
  });

  it("stacks over the reach wash it cuts into", () => {
    const blocked = highlightStyleFor(LAYER_BLOCKED);
    const support = highlightStyleFor(LAYER_SUPPORT);
    expect(blocked?.yOffset).toBeGreaterThan(0.025);
    expect(support?.yOffset).toBeGreaterThan(0.025);
  });
});

describe("the support layer", () => {
  it("paints beneficial aim in verdigris, not in blood", () => {
    const highlights = new TileHighlights(map);
    highlights.set(LAYER_SUPPORT, tiles, palette.highlightTarget);
    const material = fillOf(highlights);

    expect(material.color.getHex()).toBe(palette.highlightSupport);
    expect(material.color.getHex()).not.toBe(palette.highlightTarget);
    // Support is a wash, not a mask: only the refused half is stippled.
    expect(material.alphaMap ?? null).toBeNull();
    highlights.clearAll();
  });
});

/**
 * Re-playtest N5. The deployment tiles were a permanent verdigris wash over four
 * tiles for the whole battle, and the support layer is the same verdigris — so a
 * green tile meant either "this order can help somebody here" or "somebody
 * started here", which is the ambiguity the layer split exists to remove.
 */
describe("the deployment layer", () => {
  it("is a ring, not a wash, so it cannot be read as an answer to an aim", () => {
    const style = highlightStyleFor(LAYER_DEPLOYMENT);
    expect(style?.outlineOnly).toBe(true);
    expect(style?.hatched ?? false).toBe(false);
    const support = highlightStyleFor(LAYER_SUPPORT);
    expect(support?.outlineOnly ?? false).toBe(false);
    expect(style?.color).not.toBe(support?.color);
  });

  it("stays in the friendly family, and paints no fill on the board", () => {
    const highlights = new TileHighlights(map);
    highlights.set(LAYER_DEPLOYMENT, tiles, palette.highlightSupport);
    const fill = highlights.group.children.find(
      (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
    ) as THREE.Mesh;
    const line = highlights.group.children.find(
      (child): child is THREE.LineSegments => (child as THREE.LineSegments).isLineSegments === true,
    ) as THREE.LineSegments;

    expect(fill.visible).toBe(false);
    expect(line.visible).toBe(true);
    expect((line.material as THREE.LineBasicMaterial).color.getHex()).toBe(palette.oxidizedCopper);
    // Repainted in place — same layer, same count, moved tiles — still a ring.
    highlights.set(LAYER_DEPLOYMENT, [{ x: 2, y: 2 }, { x: 1, y: 0 }], palette.highlightSupport);
    expect(highlights.group.children).toContain(fill);
    expect(fill.visible).toBe(false);
    highlights.clearAll();
  });
});

describe("layer ids the renderer has no opinion about", () => {
  it("draws them exactly as asked instead of failing", () => {
    expect(highlightStyleFor("some-wave-invented-this")).toBeNull();
    const highlights = new TileHighlights(map);
    expect(() =>
      highlights.set("some-wave-invented-this", tiles, palette.highlightPath, { opacity: 0.5 }),
    ).not.toThrow();
    const material = fillOf(highlights);

    expect(material.color.getHex()).toBe(palette.highlightPath);
    expect(material.opacity).toBe(0.5);
    highlights.clearAll();
  });

  it("leaves the existing layers' look to their callers", () => {
    for (const layerId of ["move", "target", "cursor", "selection", "path"]) {
      expect(HIGHLIGHT_STYLES[layerId], layerId).toBeUndefined();
    }
  });
});

describe("the tile quad", () => {
  it("carries one uv unit per tile, so a stipple repeats per tile", () => {
    const highlights = new TileHighlights(map);
    highlights.set(LAYER_BLOCKED, tiles, palette.highlightBlocked);
    const fill = highlights.group.children.find(
      (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
    ) as THREE.Mesh;
    const uv = fill.geometry.getAttribute("uv");

    expect(uv.count).toBe(tiles.length * 4);
    for (let i = 0; i < uv.count; i += 1) {
      expect([0, 1]).toContain(uv.getX(i));
      expect([0, 1]).toContain(uv.getY(i));
    }
    highlights.clearAll();
  });
});
