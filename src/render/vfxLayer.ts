// Everything transient the battle draws: damage popups and the four impact
// effects. One group, one update call, one `clear()` — because skipping the
// presentation means every transient is gone, not fast-forwarded.
//
// Emissive palette steps (amber-glow, overload-100, veinglass-100) are drawn
// bright and untonemapped; the elements that call `markBloomEligible` get their
// halo from `render/post.ts`, which keys on that layer rather than on luminance
// (ART_DIRECTION §2, D.2).

import * as THREE from "three";
import {
  AMBER_500,
  AMBER_GLOW,
  BLOOD_500,
  DAMAGE_NUMBER_COLOR,
  DAMAGE_TYPE_VFX,
  HAZARD,
  SOOT_300,
  VERDIGRIS_300,
  VERDIGRIS_500,
  hexToNumber,
  type Hex,
} from "../art/palette.js";
import {
  dither,
  paletteIndex,
  rasterize,
  writeGridToImageData,
  type PixelGrid,
} from "../art/pixel.js";
import { TICKS_PER_SECOND, TILE_TEXTURE_SIZE } from "../art/sprites.js";
import type { DamageType, TileCoord } from "../data/schemas/common.js";
import type { GameMap } from "../data/schemas/map.js";
import {
  CHEMICAL_LINGER_SECONDS,
  IMPACT_TIMING,
  conductiveTerrain,
  debrisDirections,
  impactFrame,
  jagPoints,
  type Vec3,
} from "./effects.js";
import { NUMBER_OUTLINE_INDEX, popupGrid } from "./glyphs.js";
import { HEIGHT_STEP, standingHeight, tileAt, tileCenter } from "./grid.js";
import { DRAW_ORDER, markBloomEligible } from "./layers.js";
import { terrainAccentColor, terrainTopColor } from "./palette.js";
import {
  PopupField,
  popupHeight,
  popupOpacity,
  type Popup,
  type PopupAnchor,
  type PopupSpec,
} from "./popups.js";

/** One glyph pixel, in world units. Popup glyphs read on the tile ruler. */
const POPUP_PIXEL_SCALE = 2;
const POPUP_PIXEL_UNIT = POPUP_PIXEL_SCALE / TILE_TEXTURE_SIZE;
/** Fades step rather than ramp, to stay in the pixel register. */
const FADE_STEPS = 4;

const DITHER_TEXTURE_SIZE = 16;
const CHEMICAL_PHASE_TICKS = DAMAGE_TYPE_VFX.chemical.ticksPerFrame;
const MUZZLE_SECONDS = 0.18;

const color = (hex: Hex): number => hexToNumber(hex);

interface Effect {
  readonly object: THREE.Object3D;
  age: number;
  readonly life: number;
  update(age: number): void;
  dispose(): void;
}

const disposeMaterial = (material: THREE.Material | THREE.Material[]): void => {
  if (Array.isArray(material)) for (const one of material) one.dispose();
  else material.dispose();
};

const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    const mesh = child as Partial<THREE.Mesh>;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) disposeMaterial(mesh.material);
  });
};

/** A palette-index grid as a crisp texture: integer size, no filtering. */
const gridTexture = (grid: PixelGrid, label: string): THREE.Texture => {
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

const popupTextures = new Map<string, THREE.Texture>();

const popupTexture = (spec: PopupSpec): THREE.Texture => {
  const key = `${spec.style}|${spec.outlined ? 1 : 0}|${spec.text}`;
  const cached = popupTextures.get(key);
  if (cached) return cached;
  const texture = gridTexture(
    popupGrid(
      spec.text,
      paletteIndex(DAMAGE_NUMBER_COLOR[spec.style]),
      spec.outlined ? NUMBER_OUTLINE_INDEX : null,
    ),
    "damage popups",
  );
  popupTextures.set(key, texture);
  return texture;
};

const chemicalTextures = new Map<number, THREE.Texture>();

/** 50% checker dither, alpha 0 or 255 — the register's translucency. */
const chemicalTexture = (phase: number): THREE.Texture => {
  const cached = chemicalTextures.get(phase);
  if (cached) return cached;
  const size = DITHER_TEXTURE_SIZE;
  const texture = gridTexture(
    rasterize({
      width: size,
      height: size,
      layers: [
        {
          name: "cloud",
          prims: [
            dither(0, 0, size, size, paletteIndex(VERDIGRIS_500), phase),
            dither(5, 5, 6, 6, paletteIndex(VERDIGRIS_300), phase),
          ],
        },
      ],
    }),
    "chemical clouds",
  );
  chemicalTextures.set(phase, texture);
  return texture;
};

export interface ImpactOptions {
  /** Where the blow came from, when the renderer knows. */
  readonly from?: Vec3 | null;
  /** Tile under the impact, for terrain-borrowed debris and ground flash. */
  readonly tile?: TileCoord | null;
}

export class VfxLayer {
  readonly group = new THREE.Group();
  readonly popups = new PopupField();

  private map: GameMap | null = null;
  private readonly sprites = new Map<number, THREE.Sprite>();
  private readonly effects: Effect[] = [];

  constructor() {
    this.group.renderOrder = DRAW_ORDER.vfx;
  }

  setMap(map: GameMap | null): void {
    this.map = map;
  }

  /** World point on the surface a unit would stand on, for tile-space effects. */
  private groundOf(tile: TileCoord | null): Vec3 | null {
    if (tile === null || this.map === null) return null;
    const center = tileCenter(this.map, tile.x, tile.y);
    return { x: center.x, y: standingHeight(this.map, tile) * HEIGHT_STEP, z: center.z };
  }

  // --- popups ---------------------------------------------------------------

  popup(spec: PopupSpec, anchor: PopupAnchor): void {
    const popup = this.popups.spawn(spec, anchor);
    const texture = popupTexture(spec);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    const width = texture.image instanceof HTMLCanvasElement ? texture.image.width : 1;
    const height = texture.image instanceof HTMLCanvasElement ? texture.image.height : 1;
    sprite.scale.set(width * POPUP_PIXEL_UNIT, height * POPUP_PIXEL_UNIT, 1);
    sprite.renderOrder = DRAW_ORDER.popup;
    this.placePopup(sprite, popup);
    this.sprites.set(popup.id, sprite);
    this.group.add(sprite);
  }

  private placePopup(sprite: THREE.Sprite, popup: Popup): void {
    sprite.position.set(popup.anchor.x, popupHeight(popup), popup.anchor.z);
    const material = sprite.material;
    material.opacity = Math.round(popupOpacity(popup) * FADE_STEPS) / FADE_STEPS;
  }

  // --- impacts --------------------------------------------------------------

  impact(type: DamageType, at: Vec3, options: ImpactOptions = {}): void {
    switch (type) {
      case "kinetic":
        this.add(this.kineticBurst(at, options));
        return;
      case "arc": {
        const from = options.from ?? null;
        if (from !== null) this.arcJag(from, at, options.tile ?? null);
        else this.add(this.arcFlash(options.tile ?? null));
        return;
      }
      case "thermal":
        this.thermalFlare(this.groundOf(options.tile ?? null) ?? { ...at, y: at.y - 0.9 });
        return;
      case "chemical":
        this.add(this.chemicalCloud(this.groundOf(options.tile ?? null) ?? { ...at, y: at.y - 0.9 }));
        return;
    }
  }

  /** Straight-segment chain from source to target; the fastest effect drawn. */
  arcJag(from: Vec3, to: Vec3, tile: TileCoord | null = null): void {
    const points = jagPoints(from, to).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: color(DAMAGE_TYPE_VFX.arc.core),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    markBloomEligible(line);

    const spreadGeometry = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, p.y + 0.05, p.z)),
    );
    const spreadMaterial = new THREE.LineBasicMaterial({
      color: color(DAMAGE_TYPE_VFX.arc.spread),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const spread = new THREE.Line(spreadGeometry, spreadMaterial);

    const group = new THREE.Group();
    group.add(line, spread);
    const life = IMPACT_TIMING.arc.seconds;
    this.add({
      object: group,
      age: 0,
      life,
      update: (age) => {
        // 4 frames at 3 ticks: the chain strobes rather than fades.
        const frame = impactFrame("arc", age);
        const on = frame % 2 === 0 ? 1 : 0.45;
        material.opacity = on;
        spreadMaterial.opacity = on * 0.7;
      },
      dispose: () => disposeObject(group),
    });
    this.add(this.arcFlash(tile));
  }

  private arcFlash(tile: TileCoord | null): Effect | null {
    const ground = this.groundOf(tile);
    if (tile === null || ground === null || this.map === null) return null;
    const terrain = tileAt(this.map, tile.x, tile.y)?.terrain;
    if (terrain === undefined || !conductiveTerrain(terrain)) return null;
    const geometry = new THREE.CircleGeometry(0.42, 12);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: color(VERDIGRIS_500),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(ground.x, ground.y + 0.05, ground.z);
    const life = IMPACT_TIMING.arc.seconds;
    return {
      object: mesh,
      age: 0,
      life,
      update: (age) => {
        material.opacity = 0.7 * (1 - age / life);
      },
      dispose: () => disposeObject(mesh),
    };
  }

  /** Hard wedge at the contact point plus debris in the terrain's own colors. */
  private kineticBurst(at: Vec3, options: ImpactOptions): Effect {
    const group = new THREE.Group();
    const vfx = DAMAGE_TYPE_VFX.kinetic;

    const wedge = new THREE.BufferGeometry();
    wedge.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-0.22, -0.12, 0, 0.22, -0.12, 0, 0, 0.26, 0]),
        3,
      ),
    );
    const wedgeMaterial = new THREE.MeshBasicMaterial({
      color: color(vfx.core),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const wedgeMesh = new THREE.Mesh(wedge, wedgeMaterial);
    wedgeMesh.position.set(at.x, at.y, at.z);
    group.add(wedgeMesh);

    const tile = options.tile ?? null;
    const terrain =
      tile === null || this.map === null ? undefined : tileAt(this.map, tile.x, tile.y)?.terrain;
    const debrisPalette = [
      color(vfx.body),
      terrain === undefined ? color(vfx.spread) : terrainTopColor[terrain],
      terrain === undefined ? color(SOOT_300) : terrainAccentColor[terrain],
    ];
    const count = 9;
    const along =
      options.from == null
        ? null
        : { x: at.x - options.from.x, y: 0, z: at.z - options.from.z };
    const directions = debrisDirections(count, along);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const rgb = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = at.x;
      positions[i * 3 + 1] = at.y;
      positions[i * 3 + 2] = at.z;
      rgb.setHex(debrisPalette[i % debrisPalette.length] as number);
      colors[i * 3] = rgb.r;
      colors[i * 3 + 1] = rgb.g;
      colors[i * 3 + 2] = rgb.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, pointsMaterial);
    group.add(points);

    const life = IMPACT_TIMING.kinetic.seconds;
    return {
      object: group,
      age: 0,
      life,
      update: (age) => {
        const t = Math.min(1, age / life);
        const frame = impactFrame("kinetic", age);
        wedgeMaterial.opacity = frame === 0 ? 1 : 1 - t;
        wedgeMesh.scale.setScalar(1 + t * 0.6);
        const attribute = geometry.getAttribute("position");
        for (let i = 0; i < count; i += 1) {
          const dir = directions[i] as Vec3;
          const reach = t * 0.55;
          attribute.setXYZ(
            i,
            at.x + dir.x * reach,
            at.y + dir.y * reach - 1.6 * t * t * 0.25,
            at.z + dir.z * reach,
          );
        }
        attribute.needsUpdate = true;
        pointsMaterial.opacity = 1 - t * t;
      },
      dispose: () => disposeObject(group),
    };
  }

  /** Bottom-anchored rising flare, amber-500 -> hazard -> blood-500. */
  thermalFlare(at: Vec3, scale = 1): void {
    const group = new THREE.Group();
    const ramp = [color(AMBER_500), color(HAZARD), color(BLOOD_500)];
    const columns: THREE.Mesh[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 3; i += 1) {
      const geometry = new THREE.PlaneGeometry(0.3 * scale, 1 * scale);
      geometry.translate(0, 0.5 * scale, 0);
      const material = new THREE.MeshBasicMaterial({
        color: ramp[0] as number,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(at.x + (i - 1) * 0.16 * scale, at.y, at.z);
      mesh.rotation.y = i * 0.7;
      columns.push(mesh);
      materials.push(material);
      group.add(mesh);
    }

    const glowGeometry = new THREE.SphereGeometry(0.22 * scale, 8, 6);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color(AMBER_GLOW),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(at.x, at.y + 0.15 * scale, at.z);
    markBloomEligible(glow);
    group.add(glow);

    const life = IMPACT_TIMING.thermal.seconds;
    this.add({
      object: group,
      age: 0,
      life,
      update: (age) => {
        const t = Math.min(1, age / life);
        const frame = impactFrame("thermal", age);
        const step = ramp[Math.min(ramp.length - 1, Math.floor((frame / 5) * ramp.length))];
        for (let i = 0; i < columns.length; i += 1) {
          const mesh = columns[i] as THREE.Mesh;
          const material = materials[i] as THREE.MeshBasicMaterial;
          material.color.setHex(step as number);
          material.opacity = 1 - t * t;
          mesh.scale.set(1 - 0.3 * t, 0.4 + 1.5 * t, 1);
        }
        glowMaterial.opacity = Math.max(0, 1 - t * 2.2);
        glow.scale.setScalar(1 + t * 1.4);
      },
      dispose: () => disposeObject(group),
    });
  }

  /**
   * Healing is flux-driven chemistry: sparse rising amber-glow motes over a
   * verdigris-300 flash — warm source, chemical result (ART_DIRECTION §7).
   */
  healMotes(at: Vec3): void {
    const group = new THREE.Group();
    const flashGeometry = new THREE.SphereGeometry(0.3, 8, 6);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: color(VERDIGRIS_300),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.set(at.x, at.y, at.z);
    group.add(flash);

    const count = 5;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = at.x + (i / (count - 1) - 0.5) * 0.5;
      positions[i * 3 + 1] = at.y - 0.3;
      positions[i * 3 + 2] = at.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const moteMaterial = new THREE.PointsMaterial({
      color: color(AMBER_GLOW),
      size: 0.08,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const motes = new THREE.Points(geometry, moteMaterial);
    markBloomEligible(motes);
    group.add(motes);

    const life = IMPACT_TIMING.chemical.seconds * 0.5;
    this.add({
      object: group,
      age: 0,
      life,
      update: (age) => {
        const t = Math.min(1, age / life);
        flashMaterial.opacity = Math.max(0, 1 - t * 2);
        flash.scale.setScalar(1 + t);
        motes.position.y = t * 0.9;
        moteMaterial.opacity = 1 - t;
      },
      dispose: () => disposeObject(group),
    });
  }

  /** Amber muzzle glow on a machine that just fired. */
  muzzleGlow(at: Vec3): void {
    const geometry = new THREE.SphereGeometry(0.16, 8, 6);
    const material = new THREE.MeshBasicMaterial({
      color: color(AMBER_GLOW),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(at.x, at.y, at.z);
    markBloomEligible(mesh);
    this.add({
      object: mesh,
      age: 0,
      life: MUZZLE_SECONDS,
      update: (age) => {
        const t = Math.min(1, age / MUZZLE_SECONDS);
        material.opacity = 1 - t;
        mesh.scale.setScalar(1 + t);
      },
      dispose: () => disposeObject(mesh),
    });
  }

  /** The one effect that stays in tile space after it plays. */
  private chemicalCloud(at: Vec3): Effect {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      map: chemicalTexture(0),
      transparent: false,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(at.x, at.y + 0.06, at.z);
    const life = CHEMICAL_LINGER_SECONDS;
    return {
      object: mesh,
      age: 0,
      life,
      update: (age) => {
        const phase = Math.floor((age * TICKS_PER_SECOND) / CHEMICAL_PHASE_TICKS) % 2;
        material.map = chemicalTexture(phase);
        const t = Math.min(1, age / life);
        mesh.scale.setScalar(0.7 + 0.5 * t);
      },
      dispose: () => disposeObject(mesh),
    };
  }

  // --- frame ----------------------------------------------------------------

  update(deltaSeconds: number): void {
    const delta = Math.max(0, deltaSeconds);
    this.popups.advance(delta);
    const live = new Set(this.popups.active.map((popup) => popup.id));
    for (const [id, sprite] of [...this.sprites]) {
      if (live.has(id)) continue;
      this.group.remove(sprite);
      sprite.material.dispose();
      this.sprites.delete(id);
    }
    for (const popup of this.popups.active) {
      const sprite = this.sprites.get(popup.id);
      if (sprite) this.placePopup(sprite, popup);
    }

    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i] as Effect;
      effect.age += delta;
      if (effect.age >= effect.life) {
        this.group.remove(effect.object);
        effect.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      effect.update(effect.age);
    }
  }

  /** Skip, rebuild, battle end: nothing transient survives. */
  clear(): void {
    this.popups.clear();
    for (const sprite of this.sprites.values()) {
      this.group.remove(sprite);
      sprite.material.dispose();
    }
    this.sprites.clear();
    for (const effect of this.effects) {
      this.group.remove(effect.object);
      effect.dispose();
    }
    this.effects.length = 0;
  }

  dispose(): void {
    this.clear();
  }

  private add(effect: Effect | null): void {
    if (effect === null) return;
    this.effects.push(effect);
    this.group.add(effect.object);
    effect.update(0);
  }
}
