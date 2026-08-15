// Pure terrain geometry generation: GameMap -> merged buffer data. No Three.js
// and no WebGL here so the builder is unit-testable in plain Node; `scene.ts`
// wraps the output in a single BufferGeometry.

import type { GameMap, TerrainType } from "../data/schemas/map.js";
import {
  HEIGHT_STEP,
  TILE_SIZE,
  baseY,
  inBounds,
  tileAt,
  tileCenter,
  tileHeight,
  tileIndex,
  type WorldPoint,
} from "./grid.js";
import { hexToRgb, railStripColor, scaleRgb, terrainSideColor, terrainTopColor, type Rgb } from "./palette.js";

export type TerrainQuadKind = "top" | "side" | "detail";

export interface TerrainQuad {
  kind: TerrainQuadKind;
  tileX: number;
  tileY: number;
  corners: [WorldPoint, WorldPoint, WorldPoint, WorldPoint];
  normal: WorldPoint;
  color: Rgb;
}

export interface TerrainMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** Tile index (row-major) each triangle belongs to; drives raycast picking. */
  triangleTiles: Int32Array;
  quadCount: number;
  topQuadCount: number;
  sideQuadCount: number;
  detailQuadCount: number;
}

const HALF = TILE_SIZE / 2;
const DETAIL_LIFT = 0.012;
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Deterministic per-tile brightness wobble so the grid reads without lines. */
export const tileShade = (x: number, y: number): number => {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return 0.93 + (h - Math.floor(h)) * 0.14;
};

const surfaceY = (map: GameMap, x: number, y: number): number => {
  const tile = tileAt(map, x, y);
  if (!tile || tile.terrain === "void") return baseY(map);
  return tile.height * HEIGHT_STEP;
};

const railRunsNorthSouth = (map: GameMap, x: number, y: number): boolean => {
  const isRail = (tx: number, ty: number): boolean =>
    inBounds(map, tx, ty) && tileAt(map, tx, ty)?.terrain === "rail";
  const alongZ = Number(isRail(x, y - 1)) + Number(isRail(x, y + 1));
  const alongX = Number(isRail(x - 1, y)) + Number(isRail(x + 1, y));
  return alongZ >= alongX;
};

const topQuad = (
  map: GameMap,
  x: number,
  y: number,
  terrain: TerrainType,
): TerrainQuad => {
  const c = tileCenter(map, x, y);
  const color = scaleRgb(hexToRgb(terrainTopColor[terrain]), tileShade(x, y));
  return {
    kind: "top",
    tileX: x,
    tileY: y,
    corners: [
      { x: c.x - HALF, y: c.y, z: c.z - HALF },
      { x: c.x - HALF, y: c.y, z: c.z + HALF },
      { x: c.x + HALF, y: c.y, z: c.z + HALF },
      { x: c.x + HALF, y: c.y, z: c.z - HALF },
    ],
    normal: { x: 0, y: 1, z: 0 },
    color,
  };
};

const sideQuad = (
  map: GameMap,
  x: number,
  y: number,
  terrain: TerrainType,
  direction: readonly [number, number],
  yLow: number,
  yHigh: number,
): TerrainQuad => {
  const c = tileCenter(map, x, y);
  const [dx, dz] = direction;
  const mid = { x: c.x + dx * HALF, z: c.z + dz * HALF };
  const perp = { x: -dz, z: dx };
  const a = { x: mid.x + perp.x * HALF, z: mid.z + perp.z * HALF };
  const b = { x: mid.x - perp.x * HALF, z: mid.z - perp.z * HALF };
  const shade = tileShade(x, y) * (dz !== 0 ? 0.86 : 0.72);
  return {
    kind: "side",
    tileX: x,
    tileY: y,
    corners: [
      { x: a.x, y: yLow, z: a.z },
      { x: b.x, y: yLow, z: b.z },
      { x: b.x, y: yHigh, z: b.z },
      { x: a.x, y: yHigh, z: a.z },
    ],
    normal: { x: dx, y: 0, z: dz },
    color: scaleRgb(hexToRgb(terrainSideColor[terrain]), shade),
  };
};

const railDetailQuads = (map: GameMap, x: number, y: number): TerrainQuad[] => {
  const c = tileCenter(map, x, y);
  const top = c.y + DETAIL_LIFT;
  const alongZ = railRunsNorthSouth(map, x, y);
  const color = scaleRgb(hexToRgb(railStripColor), tileShade(x, y));
  const stripHalfWidth = 0.06;
  const offsets = [-0.22, 0.22];
  return offsets.map((offset) => {
    const corners: [WorldPoint, WorldPoint, WorldPoint, WorldPoint] = alongZ
      ? [
          { x: c.x + offset - stripHalfWidth, y: top, z: c.z - HALF },
          { x: c.x + offset - stripHalfWidth, y: top, z: c.z + HALF },
          { x: c.x + offset + stripHalfWidth, y: top, z: c.z + HALF },
          { x: c.x + offset + stripHalfWidth, y: top, z: c.z - HALF },
        ]
      : [
          { x: c.x - HALF, y: top, z: c.z + offset - stripHalfWidth },
          { x: c.x - HALF, y: top, z: c.z + offset + stripHalfWidth },
          { x: c.x + HALF, y: top, z: c.z + offset + stripHalfWidth },
          { x: c.x + HALF, y: top, z: c.z + offset - stripHalfWidth },
        ];
    return {
      kind: "detail" as const,
      tileX: x,
      tileY: y,
      corners,
      normal: { x: 0, y: 1, z: 0 },
      color,
    };
  });
};

export const buildTerrainQuads = (map: GameMap): TerrainQuad[] => {
  const quads: TerrainQuad[] = [];
  const floor = baseY(map);
  for (let y = 0; y < map.depth; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.tiles[tileIndex(map, x, y)];
      if (!tile || tile.terrain === "void") continue;
      quads.push(topQuad(map, x, y, tile.terrain));
      if (tile.terrain === "rail") quads.push(...railDetailQuads(map, x, y));
      const top = tile.height * HEIGHT_STEP;
      for (const direction of NEIGHBORS) {
        const nx = x + direction[0];
        const ny = y + direction[1];
        const neighborTop = inBounds(map, nx, ny) ? surfaceY(map, nx, ny) : floor;
        if (neighborTop >= top) continue;
        quads.push(sideQuad(map, x, y, tile.terrain, direction, neighborTop, top));
      }
    }
  }
  return quads;
};

export const quadsToMeshData = (map: GameMap, quads: TerrainQuad[]): TerrainMeshData => {
  const vertexCount = quads.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(quads.length * 6);
  const triangleTiles = new Int32Array(quads.length * 2);

  quads.forEach((quad, quadIdx) => {
    const base = quadIdx * 4;
    quad.corners.forEach((corner, cornerIdx) => {
      const offset = (base + cornerIdx) * 3;
      positions[offset] = corner.x;
      positions[offset + 1] = corner.y;
      positions[offset + 2] = corner.z;
      normals[offset] = quad.normal.x;
      normals[offset + 1] = quad.normal.y;
      normals[offset + 2] = quad.normal.z;
      colors[offset] = quad.color[0];
      colors[offset + 1] = quad.color[1];
      colors[offset + 2] = quad.color[2];
    });
    const i = quadIdx * 6;
    indices[i] = base;
    indices[i + 1] = base + 1;
    indices[i + 2] = base + 2;
    indices[i + 3] = base;
    indices[i + 4] = base + 2;
    indices[i + 5] = base + 3;
    const tile = tileIndex(map, quad.tileX, quad.tileY);
    triangleTiles[quadIdx * 2] = tile;
    triangleTiles[quadIdx * 2 + 1] = tile;
  });

  return {
    positions,
    normals,
    colors,
    indices,
    triangleTiles,
    quadCount: quads.length,
    topQuadCount: quads.filter((q) => q.kind === "top").length,
    sideQuadCount: quads.filter((q) => q.kind === "side").length,
    detailQuadCount: quads.filter((q) => q.kind === "detail").length,
  };
};

export const buildTerrainMeshData = (map: GameMap): TerrainMeshData =>
  quadsToMeshData(map, buildTerrainQuads(map));

export const tileFromTriangle = (
  map: GameMap,
  data: TerrainMeshData,
  triangleIndex: number,
): { x: number; y: number } | null => {
  const index = data.triangleTiles[triangleIndex];
  if (index === undefined || index < 0) return null;
  return { x: index % map.width, y: Math.floor(index / map.width) };
};

export const terrainSurfaceY = (map: GameMap, x: number, y: number): number =>
  tileHeight(map, x, y) * HEIGHT_STEP;
