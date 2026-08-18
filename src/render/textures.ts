// Every pixel-art texture the renderer uploads is built the same way: levels
// supplied rather than generated, nearest on magnification so texels stay hard
// at the zooms the camera sits at, trilinear on minification so a pulled-out
// board does not crawl. Only the wrap differs — the ground repeats, sprite
// sheets and machine faces clamp.

import * as THREE from "three";
import { flipRows, type TextureLevel } from "../art/sheet.js";
import { writeGridToImageData, type PixelGrid } from "../art/pixel.js";

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

/**
 * A palette-index grid as a crisp texture: integer size, no filtering, no mip
 * chain. This is the path for anything rasterized at draw time rather than built
 * into a sheet — popup numbers, the cursor's elevation readout.
 */
export const gridCanvasTexture = (grid: PixelGrid, label: string): THREE.Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(`2d canvas context unavailable for ${label}`);
  const image = ctx.createImageData(grid.width, grid.height);
  writeGridToImageData(image, grid);
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};
