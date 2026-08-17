// The nine tile-face textures as Three.js materials, one per face of the set
// (ART_DIRECTION §5, D.4). Built once per renderer and indexed by the material
// index `src/render/terrain.ts` puts on every quad.
//
// **Nine textures, not an atlas.** Weighed and decided here rather than left
// implicit. An atlas would draw the board in one call; nine textures draw it in
// as many groups as the map actually uses (three to five, in practice). Against
// that, an atlas costs two things this set cannot pay:
//
//  1. **No `RepeatWrapping`.** §5 stacks N side tiles up an N-step face. With a
//     texture of its own that is one quad and `v` from 0 to N. Inside an atlas
//     the same thing needs either N quads or a custom shader doing the wrap by
//     hand in a sub-rectangle. Nine draw calls is a smaller price than either.
//  2. **Bleeding at the mip levels.** A 32px cell in an atlas has to be padded
//     with duplicated edges, and the padding has to survive every level of the
//     chain — which is exactly the border a tiling texture must not have, since
//     its edge pixel's true neighbour is the pixel on the opposite edge. Nine
//     separate textures wrap correctly at every level for free.
//
// Filtering follows the sprite sheet (`render/sprites.ts`): NearestFilter on
// magnification so the ground shows hard texel edges at the zooms the camera
// actually sits at, trilinear on minification so a board pulled out to 40 screen
// px per tile does not crawl. The chain is supplied by `src/art/tileset.ts`
// rather than generated, because `gl.generateMipmap` clamps at the texture edge
// and this is a texture whose edges meet themselves 300 times a board.

import * as THREE from "three";
import { TICKS_PER_SECOND } from "../art/sprites.js";
import { TILE_TEXTURE, TILE_TEXTURE_IDS, type TileTextureId } from "../art/tiles.js";
import { tileTextureLevels } from "../art/tileset.js";
import { flipRows } from "../art/sheet.js";

/**
 * §5 asks for a 2-frame water shimmer alternating every 30 ticks. Wave 1
 * delivered one frame, so the alternation is done here instead: the water top is
 * the one texture with `offset` animated, stepping the whole surface one texel
 * north and back on the same 30-tick beat. It is a translation of the delivered
 * painting, not a repaint of it — the shimmer bands land at two different heights,
 * which is what the two frames were for. The second frame stays on the owner's
 * regenerate list; when it lands this constant is what it replaces.
 */
export const WATER_SHIMMER_TICKS = 30;
export const WATER_SHIMMER_SECONDS = WATER_SHIMMER_TICKS / TICKS_PER_SECOND;
export const WATER_SHIMMER_TEXTURE: TileTextureId = "water-top";

const asBytes = (data: Uint8ClampedArray): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const buildTexture = (id: TileTextureId): THREE.Texture => {
  // WebGL ignores flipY for buffer uploads, so every level ships bottom-up. That
  // also puts the art's own top row at v = 1, which is where the strata band has
  // to be for a stacked face to show a cut line at every height step.
  const levels = tileTextureLevels(id).map(flipRows);
  const base = levels[0] as (typeof levels)[number];
  const texture = new THREE.DataTexture(asBytes(base.data), base.width, base.height, THREE.RGBAFormat);
  texture.mipmaps = levels.map((level) => ({
    data: asBytes(level.data),
    width: level.width,
    height: level.height,
  }));
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
};

/**
 * One material per tile face, in `TILE_TEXTURE_IDS` order so a quad's material
 * index is an index into `materials`. Vertex colour carries the per-tile
 * brightness wobble and the face shade of §5; the texture carries the paint.
 */
export class TerrainTextures {
  readonly materials: readonly THREE.MeshLambertMaterial[];
  private readonly textures: readonly THREE.Texture[];
  private readonly water: THREE.Texture;
  private elapsed = 0;

  constructor() {
    this.textures = TILE_TEXTURE_IDS.map(buildTexture);
    this.materials = this.textures.map(
      (map) => new THREE.MeshLambertMaterial({ map, vertexColors: true }),
    );
    const waterAt = TILE_TEXTURE_IDS.indexOf(WATER_SHIMMER_TEXTURE);
    this.water = this.textures[waterAt] as THREE.Texture;
  }

  /** The interim water shimmer. One texel of the shipped face, on the 30-tick beat. */
  advance(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    const frame = Math.floor(this.elapsed / WATER_SHIMMER_SECONDS) % 2;
    this.water.offset.y = frame === 0 ? 0 : 1 / TILE_TEXTURE[WATER_SHIMMER_TEXTURE].height;
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
