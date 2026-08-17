// The tile-face materials, and the interim water shimmer standing in for the
// second `water-top` frame Wave 1 did not deliver.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TILE_TEXTURE, TILE_TEXTURE_IDS } from "../../src/art/tiles.js";
import {
  TerrainTextures,
  WATER_SHIMMER_SECONDS,
  WATER_SHIMMER_TEXTURE,
  WATER_SHIMMER_TICKS,
} from "../../src/render/terrainTextures.js";

describe("terrain materials", () => {
  it("builds one material per tile face, in the order the quads index", () => {
    const terrain = new TerrainTextures();
    expect(terrain.materials).toHaveLength(TILE_TEXTURE_IDS.length);
    terrain.materials.forEach((material, i) => {
      const spec = TILE_TEXTURE[TILE_TEXTURE_IDS[i] as (typeof TILE_TEXTURE_IDS)[number]];
      const map = material.map as THREE.Texture;
      const image = map.image as { width: number; height: number };
      expect(material.vertexColors).toBe(true);
      expect([image.width, image.height]).toEqual([spec.width, spec.height]);
    });
    terrain.dispose();
  });

  it("keeps the pixel look close in and a full mip chain far out", () => {
    const terrain = new TerrainTextures();
    for (const material of terrain.materials) {
      const map = material.map as THREE.Texture;
      expect(map.magFilter).toBe(THREE.NearestFilter);
      expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(map.generateMipmaps).toBe(false);
      expect(map.mipmaps.length).toBeGreaterThan(1);
      const last = map.mipmaps[map.mipmaps.length - 1] as { width: number; height: number };
      expect([last.width, last.height]).toEqual([1, 1]);
      expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
      // The stacking rule of §5 needs a repeating wrap on both axes.
      expect(map.wrapS).toBe(THREE.RepeatWrapping);
      expect(map.wrapT).toBe(THREE.RepeatWrapping);
    }
    terrain.dispose();
  });

  it("alternates the water surface by one texel on the 30-tick beat", () => {
    const terrain = new TerrainTextures();
    const waterAt = TILE_TEXTURE_IDS.indexOf(WATER_SHIMMER_TEXTURE);
    const water = terrain.materials[waterAt]?.map as THREE.Texture;
    const texel = 1 / TILE_TEXTURE[WATER_SHIMMER_TEXTURE].height;

    expect(WATER_SHIMMER_TICKS).toBe(30);
    terrain.advance(0);
    expect(water.offset.y).toBe(0);
    terrain.advance(WATER_SHIMMER_SECONDS * 0.9);
    expect(water.offset.y).toBe(0);
    terrain.advance(WATER_SHIMMER_SECONDS * 0.2);
    expect(water.offset.y).toBeCloseTo(texel, 10);
    terrain.advance(WATER_SHIMMER_SECONDS);
    expect(water.offset.y).toBe(0);
    terrain.dispose();
  });

  it("leaves every other face still", () => {
    const terrain = new TerrainTextures();
    terrain.advance(WATER_SHIMMER_SECONDS * 3);
    TILE_TEXTURE_IDS.forEach((id, i) => {
      if (id === WATER_SHIMMER_TEXTURE) return;
      const map = terrain.materials[i]?.map as THREE.Texture;
      expect([map.offset.x, map.offset.y], id).toEqual([0, 0]);
    });
    terrain.dispose();
  });
});
