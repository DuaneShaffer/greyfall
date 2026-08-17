// Pure terrain geometry generation: GameMap -> merged buffer data. No Three.js
// and no WebGL here so the builder is unit-testable in plain Node; `scene.ts`
// wraps the output in a single BufferGeometry with one draw group per material.
//
// Texturing, and the two rules that shape the UVs (ART_DIRECTION §5, D.4):
//
//  - **32 texels per world unit, everywhere.** A tile top is 32x32 across a 1x1
//    tile; a tile side is 32x16 across 1 x HEIGHT_STEP. One ruler, so a top and
//    the face under it show the same texel size and the board has no zoom at
//    which the ground changes density.
//  - **A column of height N stacks N side tiles.** Implemented as one quad whose
//    `v` runs 0..N against a repeating texture, not as N quads: identical texels,
//    a sixth of the vertices, and the strata cut line lands at the top of every
//    height step — which is the whole point of it, because that is what lets a
//    player count a four-step drop without moving the cursor.
//
// Quads come out grouped by texture so the mesh can be drawn as a handful of
// contiguous index ranges. There is no atlas: nine small textures with their own
// wrap mode and their own mip chain cost nine draw calls on a board that is one
// mesh, and buy exact `RepeatWrapping` — which is what the stacking rule above
// needs and what an atlas cannot give without a custom shader.

import { FACE_SHADE } from "../art/palette.js";
import { TILE_TEXTURE_IDS, tileTextureFor, type TileTextureId } from "../art/tiles.js";
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
import type { Rgb } from "./palette.js";

export type TerrainQuadKind = "top" | "side";

export interface TerrainUv {
  readonly u: number;
  readonly v: number;
}

export interface TerrainQuad {
  kind: TerrainQuadKind;
  tileX: number;
  tileY: number;
  corners: [WorldPoint, WorldPoint, WorldPoint, WorldPoint];
  /** Matches `corners` index for index. */
  uvs: [TerrainUv, TerrainUv, TerrainUv, TerrainUv];
  normal: WorldPoint;
  /** Per-tile brightness wobble times the face shade; the texture is the paint. */
  color: Rgb;
  texture: TileTextureId;
  /** Index into `TILE_TEXTURE_IDS`, and into the mesh's material list. */
  materialIndex: number;
  /** Height steps this face spans. 1 for a top; N for an N-step drop. */
  steps: number;
}

/** One contiguous run of the index buffer drawn with one material. */
export interface TerrainDrawGroup {
  readonly start: number;
  readonly count: number;
  readonly materialIndex: number;
  readonly texture: TileTextureId;
}

export interface TerrainMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Tile index (row-major) each triangle belongs to; drives raycast picking. */
  triangleTiles: Int32Array;
  groups: readonly TerrainDrawGroup[];
  quadCount: number;
  topQuadCount: number;
  sideQuadCount: number;
}

const HALF = TILE_SIZE / 2;
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

const MATERIAL_INDEX = new Map<TileTextureId, number>(TILE_TEXTURE_IDS.map((id, i) => [id, i]));

const materialIndexOf = (texture: TileTextureId): number => MATERIAL_INDEX.get(texture) as number;

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

/** (u,v) -> (v, 1-u): a quarter turn, no mirroring. */
const rotateUv = (uv: TerrainUv): TerrainUv => ({ u: uv.v, v: 1 - uv.u });

const shadeRgb = (factor: number): Rgb => [factor, factor, factor];

const topQuad = (map: GameMap, x: number, y: number, terrain: TerrainType): TerrainQuad => {
  const c = tileCenter(map, x, y);
  const corners: [WorldPoint, WorldPoint, WorldPoint, WorldPoint] = [
    { x: c.x - HALF, y: c.y, z: c.z - HALF },
    { x: c.x - HALF, y: c.y, z: c.z + HALF },
    { x: c.x + HALF, y: c.y, z: c.z + HALF },
    { x: c.x + HALF, y: c.y, z: c.z - HALF },
  ];
  // u east, v north: the texture's top row faces north on every tile, so a run
  // of tiles reads as one continuous surface rather than a patchwork.
  let uvs = corners.map((corner) => ({
    u: (corner.x - (c.x - HALF)) / TILE_SIZE,
    v: (c.z + HALF - corner.z) / TILE_SIZE,
  })) as [TerrainUv, TerrainUv, TerrainUv, TerrainUv];
  // Rails are drawn running north-south; an east-west run is the same texture
  // turned a quarter, which is what the brief promised the engine would do.
  if (terrain === "rail" && !railRunsNorthSouth(map, x, y)) {
    uvs = uvs.map(rotateUv) as [TerrainUv, TerrainUv, TerrainUv, TerrainUv];
  }
  const texture = tileTextureFor(terrain, "top") as TileTextureId;
  return {
    kind: "top",
    tileX: x,
    tileY: y,
    corners,
    uvs,
    normal: { x: 0, y: 1, z: 0 },
    color: shadeRgb(tileShade(x, y) * FACE_SHADE.top),
    texture,
    materialIndex: materialIndexOf(texture),
    steps: 1,
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
  const corners: [WorldPoint, WorldPoint, WorldPoint, WorldPoint] = [
    { x: a.x, y: yLow, z: a.z },
    { x: b.x, y: yLow, z: b.z },
    { x: b.x, y: yHigh, z: b.z },
    { x: a.x, y: yHigh, z: a.z },
  ];
  // u runs with +x on the north/south faces and with +z on the east/west ones,
  // from the tile's own low corner. Deriving it from world position rather than
  // from the winding is what keeps every wall in a run unmirrored and in step.
  const alongX = dz !== 0;
  const origin = alongX ? c.x - HALF : c.z - HALF;
  const uvs = corners.map((corner) => ({
    u: ((alongX ? corner.x : corner.z) - origin) / TILE_SIZE,
    v: (corner.y - yLow) / HEIGHT_STEP,
  })) as [TerrainUv, TerrainUv, TerrainUv, TerrainUv];
  const face = dz !== 0 ? "sideNorthSouth" : "sideEastWest";
  const texture = tileTextureFor(terrain, "side") as TileTextureId;
  return {
    kind: "side",
    tileX: x,
    tileY: y,
    corners,
    uvs,
    normal: { x: dx, y: 0, z: dz },
    color: shadeRgb(tileShade(x, y) * FACE_SHADE[face]),
    texture,
    materialIndex: materialIndexOf(texture),
    steps: Math.round((yHigh - yLow) / HEIGHT_STEP),
  };
};

/**
 * Every drawn face of the board, grouped by texture. Within a group the order is
 * the map's own row-major walk, so the geometry is stable for a given map and the
 * triangle-to-tile table below it is stable with it.
 */
export const buildTerrainQuads = (map: GameMap): TerrainQuad[] => {
  const byMaterial = new Map<TileTextureId, TerrainQuad[]>();
  const push = (quad: TerrainQuad): void => {
    const bucket = byMaterial.get(quad.texture);
    if (bucket) bucket.push(quad);
    else byMaterial.set(quad.texture, [quad]);
  };
  const floor = baseY(map);
  for (let y = 0; y < map.depth; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.tiles[tileIndex(map, x, y)];
      if (!tile || tile.terrain === "void") continue;
      push(topQuad(map, x, y, tile.terrain));
      const top = tile.height * HEIGHT_STEP;
      for (const direction of NEIGHBORS) {
        const nx = x + direction[0];
        const ny = y + direction[1];
        const neighborTop = inBounds(map, nx, ny) ? surfaceY(map, nx, ny) : floor;
        if (neighborTop >= top) continue;
        push(sideQuad(map, x, y, tile.terrain, direction, neighborTop, top));
      }
    }
  }
  return TILE_TEXTURE_IDS.flatMap((id) => byMaterial.get(id) ?? []);
};

export const quadsToMeshData = (map: GameMap, quads: TerrainQuad[]): TerrainMeshData => {
  const vertexCount = quads.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(quads.length * 6);
  const triangleTiles = new Int32Array(quads.length * 2);
  const groups: TerrainDrawGroup[] = [];

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
      const uvAt = (base + cornerIdx) * 2;
      uvs[uvAt] = (quad.uvs[cornerIdx] as TerrainUv).u;
      uvs[uvAt + 1] = (quad.uvs[cornerIdx] as TerrainUv).v;
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

    const open = groups[groups.length - 1];
    if (open && open.texture === quad.texture) {
      groups[groups.length - 1] = { ...open, count: open.count + 6 };
    } else {
      groups.push({ start: i, count: 6, materialIndex: quad.materialIndex, texture: quad.texture });
    }
  });

  return {
    positions,
    normals,
    colors,
    uvs,
    indices,
    triangleTiles,
    groups,
    quadCount: quads.length,
    topQuadCount: quads.filter((q) => q.kind === "top").length,
    sideQuadCount: quads.filter((q) => q.kind === "side").length,
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
