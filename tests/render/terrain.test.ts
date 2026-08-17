import { describe, expect, it } from "vitest";
import { FACE_SHADE } from "../../src/art/palette.js";
import { TILE_TEXTURE, TILE_TEXTURE_IDS } from "../../src/art/tiles.js";
import type { GameMap, Tile } from "../../src/data/schemas/map.js";
import { HEIGHT_STEP, SKIRT_DEPTH, baseY } from "../../src/render/grid.js";
import {
  buildTerrainMeshData,
  buildTerrainQuads,
  tileFromTriangle,
  tileShade,
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
  grids: [],
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

  it("varies tile colour slightly so the grid reads", () => {
    const map = makeMap(3, 1, [tile(0), tile(0), tile(0)]);
    const tops = buildTerrainQuads(map).filter((quad) => quad.kind === "top");
    const reds = new Set(tops.map((quad) => quad.color[0].toFixed(6)));

    expect(reds.size).toBe(3);
  });

  it("leaves the paint to the texture: vertex colour is shade only", () => {
    const map = makeMap(2, 1, [tile(0, "water"), tile(0, "rail")]);
    for (const quad of buildTerrainQuads(map)) {
      expect(quad.color[0]).toBeCloseTo(quad.color[1]);
      expect(quad.color[1]).toBeCloseTo(quad.color[2]);
      const face = quad.kind === "top" ? "top" : quad.normal.z !== 0 ? "sideNorthSouth" : "sideEastWest";
      expect(quad.color[0]).toBeCloseTo(tileShade(quad.tileX, quad.tileY) * FACE_SHADE[face], 6);
    }
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
    expect(data.uvs.length).toBe(data.quadCount * 8);
    expect(Math.max(...data.indices)).toBe(data.quadCount * 4 - 1);
  });
});

describe("terrain texturing", () => {
  it("wears the texture its terrain type calls for, and rail borrows plain's sides", () => {
    const map = makeMap(2, 2, [tile(0, "rail"), tile(0, "water"), tile(1, "rough"), tile(0, "impassable")]);
    const worn = new Map<string, Set<string>>();
    for (const quad of buildTerrainQuads(map)) {
      const key = `${quad.tileX},${quad.tileY}`;
      const at = worn.get(key) ?? new Set<string>();
      at.add(`${quad.kind}:${quad.texture}`);
      worn.set(key, at);
    }

    expect(worn.get("0,0")).toContain("top:rail-top");
    expect(worn.get("0,0")).toContain("side:plain-side");
    expect(worn.get("1,0")).toContain("top:water-top");
    expect(worn.get("1,0")).toContain("side:water-side");
    expect(worn.get("0,1")).toContain("top:rough-top");
    expect(worn.get("1,1")).toContain("top:impassable-top");
  });

  it("gives every quad a material index that indexes the tile texture list", () => {
    const map = makeMap(2, 2, [tile(0, "rail"), tile(0, "water"), tile(1, "rough"), tile(0)]);
    for (const quad of buildTerrainQuads(map)) {
      expect(TILE_TEXTURE_IDS[quad.materialIndex]).toBe(quad.texture);
    }
  });

  it("groups the index buffer into one contiguous run per material", () => {
    const tiles = [tile(0, "rail"), tile(0, "water"), tile(1, "rough"), tile(0), tile(2, "impassable"), tile(0, "rail")];
    const data = buildTerrainMeshData(makeMap(3, 2, tiles));

    expect(data.groups.reduce((n, g) => n + g.count, 0)).toBe(data.indices.length);
    let cursor = 0;
    const seen = new Set<string>();
    for (const group of data.groups) {
      expect(group.start).toBe(cursor);
      expect(seen.has(group.texture)).toBe(false);
      seen.add(group.texture);
      cursor += group.count;
    }
    // Nine textures at most, and only the ones the map actually uses.
    expect(data.groups.length).toBeLessThanOrEqual(TILE_TEXTURE_IDS.length);
  });

  it("maps a tile top to exactly one texture tile, north row up", () => {
    const map = makeMap(1, 1, [tile(0)]);
    const top = buildTerrainQuads(map).find((quad) => quad.kind === "top");
    const uvs = top?.uvs ?? [];

    // Corner order is NW, SW, SE, NE; v = 1 is the texture's own top row.
    expect(uvs.map((uv) => [uv.u, uv.v])).toEqual([
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it("turns the rail top a quarter for an east-west run, without mirroring it", () => {
    const northSouth = makeMap(1, 3, [tile(0, "rail"), tile(0, "rail"), tile(0, "rail")]);
    const eastWest = makeMap(3, 1, [tile(0, "rail"), tile(0, "rail"), tile(0, "rail")]);
    const middle = (map: GameMap) =>
      buildTerrainQuads(map).find(
        (quad) => quad.kind === "top" && quad.tileX === (map.width === 1 ? 0 : 1) && quad.tileY === (map.depth === 1 ? 0 : 1),
      );

    expect(middle(northSouth)?.uvs.map((uv) => [uv.u, uv.v])).toEqual([
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(middle(eastWest)?.uvs.map((uv) => [uv.u, uv.v])).toEqual([
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ]);
  });

  it("stacks one side texture per height step up a tall face", () => {
    const map = makeMap(2, 1, [tile(0), tile(4)]);
    const step = buildTerrainQuads(map).find(
      (quad) => quad.kind === "side" && quad.tileX === 1 && quad.normal.x === -1,
    );

    expect(step?.steps).toBe(4);
    // v = 0 at the bottom, one whole texture per height step going up.
    expect(step?.uvs.map((uv) => uv.v)).toEqual([0, 0, 4, 4]);
    expect(new Set(step?.uvs.map((uv) => uv.u))).toEqual(new Set([0, 1]));
  });

  it("counts the skirt in whole height steps too, so the strata band lands square", () => {
    const map = makeMap(1, 1, [tile(0)]);
    for (const quad of buildTerrainQuads(map).filter((q) => q.kind === "side")) {
      expect(quad.steps).toBe(SKIRT_DEPTH / HEIGHT_STEP);
      expect(Number.isInteger(quad.steps)).toBe(true);
    }
  });

  it("runs side u with the world axis, never mirrored face to face", () => {
    const map = makeMap(1, 1, [tile(0)]);
    for (const quad of buildTerrainQuads(map).filter((q) => q.kind === "side")) {
      const along = quad.normal.z !== 0 ? "x" : "z";
      quad.corners.forEach((corner, i) => {
        const expected = (along === "x" ? corner.x : corner.z) + 0.5;
        expect(quad.uvs[i]?.u).toBeCloseTo(expected, 6);
      });
    }
  });

  it("keeps 32 texels per world unit on every face", () => {
    const map = makeMap(2, 1, [tile(0), tile(3)]);
    for (const quad of buildTerrainQuads(map)) {
      const spec = TILE_TEXTURE[quad.texture];
      const us = quad.uvs.map((uv) => uv.u);
      const vs = quad.uvs.map((uv) => uv.v);
      const xs = quad.corners.map((c) => (quad.kind === "top" ? c.x : quad.normal.z !== 0 ? c.x : c.z));
      const ys = quad.corners.map((c) => (quad.kind === "top" ? c.z : c.y));
      const uSpan = Math.max(...us) - Math.min(...us);
      const vSpan = Math.max(...vs) - Math.min(...vs);
      const xSpan = Math.max(...xs) - Math.min(...xs);
      const ySpan = Math.max(...ys) - Math.min(...ys);
      expect((uSpan * spec.width) / xSpan).toBeCloseTo(32, 6);
      expect((vSpan * spec.height) / ySpan).toBeCloseTo(32, 6);
    }
  });
});
