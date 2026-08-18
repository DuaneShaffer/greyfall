// Every pixel-art texture the renderer uploads is built the same way: levels
// supplied rather than generated, nearest on magnification so texels stay hard
// at the zooms the camera sits at, trilinear on minification so a pulled-out
// board does not crawl. Only the wrap differs — the ground repeats, sprite
// sheets and machine faces clamp.

import * as THREE from "three";
import { flipRows, type TextureLevel } from "../art/sheet.js";

const asBytes = (data: Uint8ClampedArray): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

export const configureTexture = (texture: THREE.Texture, wrap: THREE.Wrapping): THREE.Texture => {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  return texture;
};

/**
 * WebGL ignores flipY for buffer uploads, so every level ships bottom-up. That
 * also puts the art's own top row at v = 1, which is where the tile faces' strata
 * band and a box's UVs both need it.
 */
export const mippedTexture = (
  levels: readonly TextureLevel[],
  wrap: THREE.Wrapping,
): THREE.Texture => {
  const flipped = levels.map(flipRows);
  const base = flipped[0] as TextureLevel;
  const texture = new THREE.DataTexture(
    asBytes(base.data),
    base.width,
    base.height,
    THREE.RGBAFormat,
  );
  texture.mipmaps = flipped.map((level) => ({
    data: asBytes(level.data),
    width: level.width,
    height: level.height,
  }));
  configureTexture(texture, wrap);
  texture.needsUpdate = true;
  return texture;
};
