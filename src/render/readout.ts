// How high the tile under the cursor is, and — while an order is being aimed —
// how that compares with the tile the actor is standing on.
//
// Elevation decides half the aim gate (UI_DESIGN §14.3) and the field printed it
// nowhere: it could be had only by counting strata on a side face, or by not
// having it. It is drawn as pixel glyphs on the board rather than as DOM chrome
// because it belongs to the tile — it moves with the cursor, and it is read while
// looking at the board rather than at the panels.

import * as THREE from "three";
import { SOOT_100 } from "../art/palette.js";
import { paletteIndex } from "../art/pixel.js";
import { TILE_TEXTURE_SIZE } from "../art/sprites.js";
import type { TileCoord } from "../data/schemas/common.js";
import type { GameMap } from "../data/schemas/map.js";
import { HEIGHT_STEP, tileCenter } from "./board.js";
import { NUMBER_OUTLINE_INDEX, popupGrid } from "./glyphs.js";
import { DRAW_ORDER } from "./layers.js";
import { gridCanvasTexture } from "./textures.js";

/** One glyph pixel in world units, on the damage numbers' own ruler. */
const READOUT_PIXEL_UNIT = 2 / TILE_TEXTURE_SIZE;
/** Clear of the tile's own paint, well under the popup lane over a head. */
const READOUT_LIFT = 0.45;

/**
 * `H2` at rest, `H2 +1` while aiming. The sign is the gate's own convention:
 * positive means the hovered tile stands higher than the acting unit's.
 */
export const heightReadoutText = (height: number, heightDelta: number | null): string => {
  const at = `H${Math.round(height)}`;
  if (heightDelta === null) return at;
  const delta = Math.round(heightDelta);
  return `${at} ${delta < 0 ? "-" : "+"}${Math.abs(delta)}`;
};

/** The cursor's elevation label: one sprite, moved and relettered as it goes. */
export class CursorReadout {
  readonly group = new THREE.Group();

  private readonly textures = new Map<string, THREE.Texture>();
  private readonly material: THREE.SpriteMaterial;
  private readonly sprite: THREE.Sprite;
  private text: string | null = null;

  constructor() {
    this.group.renderOrder = DRAW_ORDER.popup;
    this.material = new THREE.SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.name = "cursor-readout";
    this.sprite.renderOrder = DRAW_ORDER.popup;
    this.sprite.visible = false;
    this.group.add(this.sprite);
  }

  get label(): string | null {
    return this.sprite.visible ? this.text : null;
  }

  show(map: GameMap, tile: TileCoord, height: number, heightDelta: number | null): void {
    const text = heightReadoutText(height, heightDelta);
    if (text !== this.text) {
      this.text = text;
      const texture = this.textureFor(text);
      this.material.map = texture;
      this.material.needsUpdate = true;
      const image = texture.image as { width?: number; height?: number } | null;
      this.sprite.scale.set(
        (image?.width ?? 1) * READOUT_PIXEL_UNIT,
        (image?.height ?? 1) * READOUT_PIXEL_UNIT,
        1,
      );
    }
    const centre = tileCenter(map, tile.x, tile.y);
    this.sprite.position.set(centre.x, height * HEIGHT_STEP + READOUT_LIFT, centre.z);
    this.sprite.visible = true;
  }

  hide(): void {
    this.sprite.visible = false;
  }

  dispose(): void {
    this.hide();
    this.material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }

  private textureFor(text: string): THREE.Texture {
    const cached = this.textures.get(text);
    if (cached) return cached;
    // Soot-100 on the §7 outline: the readout is reference, not an event, so it
    // spends none of the palette's reserved colour.
    const texture = gridCanvasTexture(
      popupGrid(text, paletteIndex(SOOT_100), NUMBER_OUTLINE_INDEX),
      "cursor readout",
    );
    this.textures.set(text, texture);
    return texture;
  }
}
