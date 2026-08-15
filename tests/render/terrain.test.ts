import { describe, expect, it } from "vitest";
import type { GameMap, Tile } from "../../src/data/schemas/map.js";
import { HEIGHT_STEP, baseY } from "../../src/render/grid.js";
import {
  buildTerrainMeshData,
  buildTerrainQuads,
  tileFromTriangle,
} from "../../src/render/terrain.js";

const tile = (height: number, terrain: Tile["terrain"] = "plain"): Tile => ({ height, terrain });

const makeMap = (width: number, depth: number, tiles: Tile[]): GameMap => ({
  schemaVersion: 1,
  id: "test-map",
  name: "Test Map",
  width,
  depth,
  tiles,
  objects: [],
  deploymentTiles: [{ x: 0, y: 0 }],
});

describe("terrain geometry", () => {
  it("emits a top face and four skirt faces for a lone tile", () => {
    const map = makeMap(1, 1, [tile(0)]);
    const data = buildTerrainMeshData(map);

    expect(data.topQuadCount).toBe(1);
    expect(data.sideQuadCount).toBe(4);
    expect(data.quadCount).toBe(5);
    expect(data.positions.length).toBe(5 * 4 * 3);
    expect(data.indices.length).toBe(5 * 6);
    expect(data.triangleTiles.length).toBe(5 * 2);
  });

  it("only walls the sides that are actually exposed", () => {
    const map = makeMap(2, 1, [tile(0), tile(1)]);
    const data = buildTerrainMeshData(map);

    // Low tile: 3 outward edges (its east neighbour is taller and hides it).
    // High tile: 3 outward edges + the step down onto its west neighbour.
    expect(data.topQuadCount).toBe(2);
    expect(data.sideQuadCount).toBe(7);
    expect(data.positions.length).toBe(9 * 4 * 3);
    expect(data.indices.length).toBe(9 * 6);
  });

  it("extrudes each column to its own height", () => {
    const map = makeMap(1, 1, [tile(3)]);
    const quads = buildTerrainQuads(map);
    const top = quads.find((quad) => quad.kind === "top");
    const side = quads.find((quad) => quad.kind === "side");

    expect(top?.corners.every((corner) => corner.y === 3 * HEIGHT_STEP)).toBe(true);
    const ys = side?.corners.map((corner) => corner.y) ?? [];
    expect(Math.max(...ys)).toBeCloseTo(3 * HEIGHT_STEP);
    expect(Math.min(...ys)).toBeCloseTo(baseY(map));
  });

  it("steps between neighbours span exactly the height difference", () => {
    const map = makeMap(2, 1, [tile(0), tile(4)]);
    const quads = buildTerrainQuads(map);
    const step = quads.find(
      (quad) => quad.kind === "side" && quad.tileX === 1 && quad.normal.x === -1,
    );
    const ys = step?.corners.map((corner) => corner.y) ?? [];

    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(4 * HEIGHT_STEP);
  });

  it("punches holes for void tiles and walls their neighbours", () => {
    const map = makeMap(2, 1, [tile(0), tile(0, "void")]);
    const quads = buildTerrainQuads(map);

    expect(quads.some((quad) => quad.tileX === 1)).toBe(false);
    expect(quads.filter((quad) => quad.kind === "top")).toHaveLength(1);
    // The solid tile now walls all four sides, including the one facing void.
    expect(quads.filter((quad) => quad.kind === "side")).toHaveLength(4);
  });

  it("adds inset strips so rail tiles read as rail", () => {
    const plain = buildTerrainMeshData(makeMap(1, 1, [tile(0)]));
    const rail = buildTerrainMeshData(makeMap(1, 1, [tile(0, "rail")]));

    expect(plain.detailQuadCount).toBe(0);
    expect(rail.detailQuadCount).toBe(2);
  });

  it("varies tile colour slightly so the grid reads", () => {
    const map = makeMap(3, 1, [tile(0), tile(0), tile(0)]);
    const tops = buildTerrainQuads(map).filter((quad) => quad.kind === "top");
    const reds = new Set(tops.map((quad) => quad.color[0].toFixed(6)));

    expect(reds.size).toBe(3);
  });

  it("maps every triangle back to its tile for picking", () => {
    const map = makeMap(2, 2, [tile(0), tile(1), tile(2), tile(0)]);
    const data = buildTerrainMeshData(map);
    const quads = buildTerrainQuads(map);

    quads.forEach((quad, index) => {
      expect(tileFromTriangle(map, data, index * 2)).toEqual({ x: quad.tileX, y: quad.tileY });
      expect(tileFromTriangle(map, data, index * 2 + 1)).toEqual({ x: quad.tileX, y: quad.tileY });
    });
    expect(tileFromTriangle(map, data, data.triangleTiles.length + 5)).toBeNull();
  });

  it("produces one merged buffer, never one mesh per tile", () => {
    const tiles = Array.from({ length: 16 }, (_, i) => tile(i % 3));
    const data = buildTerrainMeshData(makeMap(4, 4, tiles));

    expect(data.positions.length).toBe(data.quadCount * 12);
    expect(data.normals.length).toBe(data.positions.length);
    expect(data.colors.length).toBe(data.positions.length);
    expect(Math.max(...data.indices)).toBe(data.quadCount * 4 - 1);
  });
});
