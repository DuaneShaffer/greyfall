import * as THREE from "three";
import type { TileCoord } from "../data/schemas/common.js";
import type { GameMap } from "../data/schemas/map.js";
import { TILE_SIZE, tileCenter } from "./board.js";
import { DRAW_ORDER } from "./layers.js";
import { palette } from "./palette.js";

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

/** One tile edge per uv unit, corner for corner with `writeTileQuadPositions`. */
const QUAD_UVS: readonly number[] = [0, 0, 0, 1, 1, 1, 1, 0];

export const buildTileQuadGeometry = (
  map: GameMap,
  tiles: readonly TileCoord[],
  yOffset: number,
  inset: number,
): THREE.BufferGeometry => {
  const positions = new Float32Array(tiles.length * 12);
  writeTileQuadPositions(map, tiles, yOffset, inset, positions);
  const uvs = new Float32Array(tiles.length * 8);
  const indices: number[] = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const v = i * 4;
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    for (let k = 0; k < 8; k += 1) uvs[i * 8 + k] = QUAD_UVS[k] as number;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
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

/** Repeat of the stipple across one tile. Reads as hatching, not as noise. */
const HATCH_TEXELS = 8;
let hatchTexture: THREE.DataTexture | null = null;

/**
 * A 45° stipple, one texel wide, as an alpha mask. Built as a data texture
 * rather than drawn on a canvas so the overlay stack needs no DOM, and cut on
 * texel parity so the diagonal is hard-edged at the nearest filter the rest of
 * the board is sampled with.
 */
const hatchMask = (): THREE.DataTexture => {
  if (hatchTexture !== null) return hatchTexture;
  const data = new Uint8Array(HATCH_TEXELS * HATCH_TEXELS * 4);
  for (let y = 0; y < HATCH_TEXELS; y += 1) {
    for (let x = 0; x < HATCH_TEXELS; x += 1) {
      // `alphaMap` samples green, so that is the channel the mask is written to.
      const lit = (x + y) % 4 === 0;
      data[(y * HATCH_TEXELS + x) * 4 + 1] = lit ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, HATCH_TEXELS, HATCH_TEXELS, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  hatchTexture = texture;
  return texture;
};

/** In-range tiles the aim gate refuses. Wave-facing name, pinned cross-module. */
export const LAYER_BLOCKED = "blocked";
/** Beneficial aim: a heal, a ward, a shunt onto an ally. */
export const LAYER_SUPPORT = "support";

/**
 * How a named layer is drawn, whatever the caller asks for. Colour, opacity and
 * stacking are the renderer's to own for these ids: the controller decides which
 * tiles are in the set and the field decides what the set looks like, so a
 * refused tile cannot be painted as a target by the layer that names it.
 */
export interface HighlightLayerStyle {
  color: number;
  opacity: number;
  yOffset: number;
  inset: number;
  /** Stippled fill: reachable, and not a place an order may be sent. */
  hatched?: boolean;
}

export const HIGHLIGHT_STYLES: Readonly<Record<string, HighlightLayerStyle>> = {
  [LAYER_BLOCKED]: {
    color: palette.highlightBlocked,
    opacity: 0.3,
    // Above the reach wash it cuts into, below the cursor that rides over both.
    yOffset: 0.035,
    inset: 0.03,
    hatched: true,
  },
  [LAYER_SUPPORT]: {
    color: palette.highlightSupport,
    opacity: 0.34,
    yOffset: 0.032,
    inset: 0.03,
  },
};

/** null for a layer the renderer holds no opinion about; never throws. */
export const highlightStyleFor = (layerId: string): HighlightLayerStyle | null =>
  HIGHLIGHT_STYLES[layerId] ?? null;

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

/** Ignored for a layer `HIGHLIGHT_STYLES` names: that look is the field's. */
export interface HighlightOptions {
  opacity?: number;
  yOffset?: number;
  inset?: number;
}

/**
 * Named, colour-tagged tile overlays: move range, target range, cursor. A layer
 * id the renderer holds no style for is drawn exactly as the caller asked, so
 * painting an unknown id is a no-op rather than a crash.
 */
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
    const style = highlightStyleFor(layerId);
    const paint = style?.color ?? color;
    const yOffset = style?.yOffset ?? options.yOffset ?? 0.025;
    const inset = style?.inset ?? options.inset ?? 0.04;
    const opacity = style?.opacity ?? options.opacity ?? 0.32;
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
      existing.fillMaterial.color.setHex(paint);
      existing.fillMaterial.opacity = opacity;
      existing.outlineMaterial.color.setHex(paint);
      return;
    }
    this.clear(layerId);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: paint,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      ...(style?.hatched === true ? { alphaMap: hatchMask() } : {}),
    });
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: paint,
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
