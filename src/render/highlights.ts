import * as THREE from "three";
import type { TileCoord } from "../data/schemas/common.js";
import type { GameMap } from "../data/schemas/map.js";
import { TILE_SIZE, tileCenter } from "./board.js";
import { DRAW_ORDER } from "./layers.js";

const HALF = TILE_SIZE / 2;

const writeTileQuadPositions = (
  map: GameMap,
  tiles: readonly TileCoord[],
  yOffset: number,
  inset: number,
  positions: Float32Array,
): void => {
  const half = HALF - inset;
  tiles.forEach((tile, i) => {
    const c = tileCenter(map, tile.x, tile.y);
    const y = c.y + yOffset;
    const base = i * 12;
    const corners = [
      [c.x - half, y, c.z - half],
      [c.x - half, y, c.z + half],
      [c.x + half, y, c.z + half],
      [c.x + half, y, c.z - half],
    ];
    corners.forEach((corner, k) => {
      positions[base + k * 3] = corner[0] as number;
      positions[base + k * 3 + 1] = corner[1] as number;
      positions[base + k * 3 + 2] = corner[2] as number;
    });
  });
};

export const buildTileQuadGeometry = (
  map: GameMap,
  tiles: readonly TileCoord[],
  yOffset: number,
  inset: number,
): THREE.BufferGeometry => {
  const positions = new Float32Array(tiles.length * 12);
  writeTileQuadPositions(map, tiles, yOffset, inset, positions);
  const indices: number[] = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const v = i * 4;
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const writeTileOutlinePositions = (
  map: GameMap,
  tiles: readonly TileCoord[],
  yOffset: number,
  inset: number,
  positions: Float32Array,
): void => {
  const half = HALF - inset;
  let cursor = 0;
  for (const tile of tiles) {
    const c = tileCenter(map, tile.x, tile.y);
    const y = c.y + yOffset;
    const corners: Array<[number, number]> = [
      [c.x - half, c.z - half],
      [c.x - half, c.z + half],
      [c.x + half, c.z + half],
      [c.x + half, c.z - half],
    ];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i] as [number, number];
      const b = corners[(i + 1) % 4] as [number, number];
      positions[cursor] = a[0];
      positions[cursor + 1] = y;
      positions[cursor + 2] = a[1];
      positions[cursor + 3] = b[0];
      positions[cursor + 4] = y;
      positions[cursor + 5] = b[1];
      cursor += 6;
    }
  }
};

export const buildTileOutlineGeometry = (
  map: GameMap,
  tiles: readonly TileCoord[],
  yOffset: number,
  inset: number,
): THREE.BufferGeometry => {
  const positions = new Float32Array(tiles.length * 24);
  writeTileOutlinePositions(map, tiles, yOffset, inset, positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
};

interface Layer {
  fill: THREE.Mesh;
  outline: THREE.LineSegments;
  fillMaterial: THREE.MeshBasicMaterial;
  outlineMaterial: THREE.LineBasicMaterial;
  tileCount: number;
  yOffset: number;
  inset: number;
}

const rewritePositions = (
  geometry: THREE.BufferGeometry,
  write: (positions: Float32Array) => void,
): void => {
  const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
  write(attribute.array as Float32Array);
  attribute.needsUpdate = true;
  geometry.computeBoundingSphere();
};

export interface HighlightOptions {
  opacity?: number;
  yOffset?: number;
  inset?: number;
}

/** Named, colour-tagged tile overlays: move range, target range, cursor. */
export class TileHighlights {
  readonly group = new THREE.Group();
  private readonly layers = new Map<string, Layer>();
  private map: GameMap;

  constructor(map: GameMap) {
    this.map = map;
    this.group.renderOrder = DRAW_ORDER.highlightFill;
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.clearAll();
  }

  set(
    layerId: string,
    tiles: readonly TileCoord[],
    color: number,
    options: HighlightOptions = {},
  ): void {
    if (tiles.length === 0) {
      this.clear(layerId);
      return;
    }
    const yOffset = options.yOffset ?? 0.025;
    const inset = options.inset ?? 0.04;
    const opacity = options.opacity ?? 0.32;
    const existing = this.layers.get(layerId);
    if (
      existing &&
      existing.tileCount === tiles.length &&
      existing.yOffset === yOffset &&
      existing.inset === inset
    ) {
      rewritePositions(existing.fill.geometry, (positions) => {
        writeTileQuadPositions(this.map, tiles, yOffset, inset, positions);
      });
      rewritePositions(existing.outline.geometry, (positions) => {
        writeTileOutlinePositions(this.map, tiles, yOffset + 0.004, inset, positions);
      });
      existing.fillMaterial.color.setHex(color);
      existing.fillMaterial.opacity = opacity;
      existing.outlineMaterial.color.setHex(color);
      return;
    }
    this.clear(layerId);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    });
    const outlineMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    });
    const fill = new THREE.Mesh(buildTileQuadGeometry(this.map, tiles, yOffset, inset), fillMaterial);
    const outline = new THREE.LineSegments(
      buildTileOutlineGeometry(this.map, tiles, yOffset + 0.004, inset),
      outlineMaterial,
    );
    fill.renderOrder = DRAW_ORDER.highlightFill;
    outline.renderOrder = DRAW_ORDER.highlightOutline;
    this.group.add(fill, outline);
    this.layers.set(layerId, {
      fill,
      outline,
      fillMaterial,
      outlineMaterial,
      tileCount: tiles.length,
      yOffset,
      inset,
    });
  }

  setOpacity(layerId: string, opacity: number): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    layer.fillMaterial.opacity = opacity;
  }

  has(layerId: string): boolean {
    return this.layers.has(layerId);
  }

  clear(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    this.group.remove(layer.fill, layer.outline);
    layer.fill.geometry.dispose();
    layer.outline.geometry.dispose();
    layer.fillMaterial.dispose();
    layer.outlineMaterial.dispose();
    this.layers.delete(layerId);
  }

  clearAll(): void {
    for (const layerId of [...this.layers.keys()]) this.clear(layerId);
  }
}
