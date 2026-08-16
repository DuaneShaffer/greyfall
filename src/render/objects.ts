import * as THREE from "three";
import type { GameMap } from "../data/schemas/map.js";
import { HEIGHT_STEP, TILE_SIZE, tileCenter, tileHeight } from "./grid.js";
import { markBloomEligible } from "./layers.js";
import { objectColor, palette } from "./palette.js";
import type { MapObjectView } from "./viewmodel.js";

/** Share of a cut run's length that opens as a gap, split across both ends. */
const SEVERED_GAP = 0.38;
/** Yaw between the parted ends, in radians: the run no longer lines up. */
const SEVERED_KINK = 0.13;
/** How far a cut run's body is pulled toward the dead-seam grey. */
const SEVERED_FADE = 0.5;

interface Footprint {
  center: THREE.Vector3;
  /** Top of the terrain the object rests on. */
  groundY: number;
  spanX: number;
  spanZ: number;
}

const footprintOf = (map: GameMap, view: MapObjectView): Footprint => {
  let sumX = 0;
  let sumZ = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let groundY = -Infinity;
  for (const tile of view.tiles) {
    const center = tileCenter(map, tile.x, tile.y);
    sumX += center.x;
    sumZ += center.z;
    minX = Math.min(minX, center.x);
    maxX = Math.max(maxX, center.x);
    minZ = Math.min(minZ, center.z);
    maxZ = Math.max(maxZ, center.z);
    groundY = Math.max(groundY, tileHeight(map, tile.x, tile.y) * HEIGHT_STEP);
  }
  const count = Math.max(1, view.tiles.length);
  return {
    center: new THREE.Vector3(sumX / count, Number.isFinite(groundY) ? groundY : 0, sumZ / count),
    groundY: Number.isFinite(groundY) ? groundY : 0,
    spanX: maxX - minX + TILE_SIZE,
    spanZ: maxZ - minZ + TILE_SIZE,
  };
};

/** A map object's primitive assembly plus its powered/destroyed visual state. */
export class ObjectVisual {
  readonly group = new THREE.Group();
  readonly objectId: string;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly poweredMaterials: THREE.MeshLambertMaterial[] = [];
  private readonly seamMaterials = new Set<THREE.MeshLambertMaterial>();
  private readonly baseColors = new Map<THREE.MeshLambertMaterial, number>();
  private readonly baseY: number;
  /** The footprint's longer side — the direction a run runs, and parts along. */
  private readonly runAxis: "x" | "z";
  private view: MapObjectView;
  private glowPhase: number;
  private collapse = 0;
  private overload = 0;
  private severed = false;

  constructor(map: GameMap, view: MapObjectView) {
    this.objectId = view.id;
    this.view = view;
    const footprint = footprintOf(map, view);
    this.baseY = footprint.groundY;
    this.runAxis = footprint.spanX >= footprint.spanZ ? "x" : "z";
    this.group.position.copy(footprint.center);
    this.glowPhase = (view.id.length % 7) * 0.5;
    this.build(view, footprint);
    this.setPowered(view.powered);
    this.setDestroyed(view.destroyed);
    this.setSevered(view.severed);
  }

  get currentView(): MapObjectView {
    return this.view;
  }

  setPowered(powered: boolean | null): void {
    this.view = { ...this.view, powered };
    const on = powered === true && !this.view.destroyed;
    for (const material of this.poweredMaterials) {
      material.emissive.setHex(on ? palette.fluxAmber : 0x000000);
      material.emissiveIntensity = on ? 1 : 0;
      this.baseColors.set(material, on ? objectColor.powered : objectColor.unpowered);
    }
    this.setCollapse(this.collapse);
    if (this.overload > 0) this.setOverload(this.overload);
  }

  setDestroyed(destroyed: boolean): void {
    this.view = { ...this.view, destroyed };
    if (destroyed) this.overload = 0;
    this.setCollapse(destroyed ? 1 : 0);
    this.setPowered(this.view.powered);
  }

  /**
   * 0 = intact, 1 = fully collapsed. Bodies go to soot rubble and seams go
   * umber-900 dead, which is the destroyed language of ART_DIRECTION §6 — a
   * single flat darkening would lose the seam/body distinction the powered
   * states spent the whole battle teaching.
   */
  setCollapse(progress: number): void {
    this.collapse = Math.min(1, Math.max(0, progress));
    this.applyPose();
    this.applyPaint();
  }

  /** A cut only reads while the object is still standing; a wreck is a wreck. */
  private get cut(): boolean {
    return this.severed && !this.view.destroyed;
  }

  private applyPose(): void {
    const grow = 1 + 0.12 * this.collapse;
    const parted = this.cut ? 1 - SEVERED_GAP : 1;
    this.group.scale.set(
      grow * (this.runAxis === "x" ? parted : 1),
      1 - 0.78 * this.collapse,
      grow * (this.runAxis === "z" ? parted : 1),
    );
    this.group.rotation.z = this.collapse * 0.06;
    this.group.rotation.y = this.cut ? SEVERED_KINK : 0;
    this.group.position.y = this.baseY - 0.02 * this.collapse;
  }

  private applyPaint(): void {
    const seamRubble = new THREE.Color(objectColor.destroyed);
    const bodyRubble = new THREE.Color(objectColor.rubble);
    // A cut span carries no light at all, so its seams go the whole way to the
    // dead grey the unpowered state already taught the player to read.
    const deadSeam = new THREE.Color(objectColor.unpowered);
    for (const material of this.materials) {
      const base = this.baseColors.get(material) ?? 0xffffff;
      const seam = this.seamMaterials.has(material);
      material.color.setHex(base).lerp(seam ? seamRubble : bodyRubble, this.collapse);
      if (this.cut) material.color.lerp(deadSeam, seam ? 1 : SEVERED_FADE);
      if (this.collapse > 0 || this.cut) {
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
      }
    }
  }

  /**
   * 0 = normal, 1 = seams at overload-100. The staged flash a volatile object
   * throws before it collapses; the seam ramp is the state readout, so the
   * warning has to arrive through the seams and not through a new color.
   */
  setOverload(amount: number): void {
    // A cut span is out of the circuit: it does not strain with the bus it left.
    this.overload = this.cut ? 0 : Math.min(1, Math.max(0, amount));
    if (this.overload <= 0) {
      this.setPowered(this.view.powered);
      return;
    }
    const seam = new THREE.Color(objectColor.overloadingSeam);
    const core = new THREE.Color(objectColor.overloading);
    for (const material of this.seamMaterials) {
      material.color.copy(seam).lerp(core, this.overload);
      material.emissive.setHex(objectColor.overloading);
      material.emissiveIntensity = 0.6 + 1.4 * this.overload;
    }
  }

  /**
   * A cut span parts: the run opens a gap at both ends, kinks out of line with
   * itself, and goes dark. Deliberately not the collapse ramp — a wreck squashes
   * and tilts into rubble, and the reversible verb must not read as the
   * permanent one. It is driven from `MapObjectView.severed` at build time too,
   * so a rebuilt scene shows a cut the player made ten turns ago.
   */
  setSevered(severed: boolean): void {
    if (this.severed === severed) return;
    this.severed = severed;
    this.view = { ...this.view, severed };
    this.applyPose();
    this.applyPaint();
  }

  /** Used when a deployable goes off: the object is simply not there any more. */
  setHidden(hidden: boolean): void {
    this.group.visible = !hidden;
  }

  update(timeSeconds: number): void {
    if (this.view.destroyed || this.cut || this.overload > 0 || this.view.powered !== true) return;
    const pulse = 0.75 + 0.25 * Math.sin(timeSeconds * 2.2 + this.glowPhase);
    for (const material of this.poweredMaterials) material.emissiveIntensity = pulse;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private mat(color: number, options?: { powered?: boolean; emissive?: number }): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color });
    if (options?.emissive !== undefined) {
      material.emissive.setHex(options.emissive);
      material.emissiveIntensity = 1;
    }
    this.materials.push(material);
    this.baseColors.set(material, color);
    if (options?.powered) {
      this.poweredMaterials.push(material);
      this.seamMaterials.add(material);
    }
    return material;
  }

  private add(
    geometry: THREE.BufferGeometry,
    material: THREE.MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    // A seam carries the object's only emissive; the bloom pass sees no lights,
    // so it renders exactly that and nothing of the body around it.
    if (this.seamMaterials.has(material)) markBloomEligible(mesh);
    this.group.add(mesh);
    return mesh;
  }

  private build(view: MapObjectView, footprint: Footprint): void {
    const w = footprint.spanX;
    const d = footprint.spanZ;
    switch (view.kind) {
      case "switch": {
        this.add(new THREE.BoxGeometry(0.34, 0.5, 0.28), this.mat(objectColor.frame), 0, 0.25, 0);
        const lever = this.add(
          new THREE.BoxGeometry(0.08, 0.44, 0.08),
          this.mat(objectColor.operable),
          0,
          0.68,
          0,
        );
        lever.rotation.x = -0.5;
        this.add(new THREE.BoxGeometry(0.44, 0.08, 0.36), this.mat(objectColor.frameDark), 0, 0.04, 0);
        break;
      }
      case "lift": {
        const surfaceY = (view.surfaceHeight ?? 0) * HEIGHT_STEP - footprint.groundY;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          this.add(
            new THREE.BoxGeometry(0.1, Math.max(0.2, surfaceY), 0.1),
            this.mat(objectColor.frameDark),
            sx * (w / 2 - 0.12),
            Math.max(0.2, surfaceY) / 2,
            sz * (d / 2 - 0.12),
          );
        }
        this.add(
          new THREE.BoxGeometry(w * 0.92, 0.12, d * 0.92),
          this.mat(objectColor.frame),
          0,
          surfaceY,
          0,
        );
        this.add(
          new THREE.BoxGeometry(w * 0.6, 0.05, 0.07),
          this.mat(objectColor.unpowered, { powered: true }),
          0,
          surfaceY + 0.09,
          d * 0.4,
        );
        break;
      }
      case "cell": {
        this.add(
          new THREE.CylinderGeometry(0.26, 0.3, 0.62, 8),
          this.mat(objectColor.unpowered, { powered: true, emissive: palette.fluxAmber }),
          0,
          0.36,
          0,
        );
        this.add(new THREE.BoxGeometry(0.62, 0.1, 0.62), this.mat(objectColor.frameDark), 0, 0.05, 0);
        this.add(new THREE.TorusGeometry(0.3, 0.045, 6, 12), this.mat(objectColor.frame), 0, 0.36, 0)
          .rotateX(Math.PI / 2);
        this.add(new THREE.BoxGeometry(0.16, 0.14, 0.16), this.mat(objectColor.frame), 0, 0.74, 0);
        break;
      }
      case "wall": {
        const rows = Math.max(1, Math.round(d / TILE_SIZE));
        for (let row = 0; row < rows; row += 1) {
          const z = (row - (rows - 1) / 2) * TILE_SIZE;
          const stack = 1 + (row % 2);
          for (let level = 0; level < stack; level += 1) {
            this.add(
              new THREE.BoxGeometry(0.82, 0.55, 0.82),
              this.mat(level % 2 === 0 ? objectColor.frame : objectColor.frameDark),
              (level % 2 === 0 ? 0 : 0.06) - 0.03,
              0.28 + level * 0.56,
              z,
            );
          }
        }
        break;
      }
      case "catwalk": {
        const surfaceY = (view.surfaceHeight ?? 1) * HEIGHT_STEP - footprint.groundY;
        this.add(
          new THREE.BoxGeometry(w * 0.96, 0.09, d * 0.96),
          this.mat(objectColor.catwalkGrate),
          0,
          surfaceY,
          0,
        );
        for (const side of [-1, 1] as const) {
          this.add(
            new THREE.BoxGeometry(w * 0.96, 0.05, 0.05),
            this.mat(objectColor.frameDark),
            0,
            surfaceY + 0.36,
            side * (d / 2 - 0.06),
          );
        }
        break;
      }
      case "turret": {
        this.add(new THREE.CylinderGeometry(0.3, 0.34, 0.24, 8), this.mat(objectColor.frameDark), 0, 0.12, 0);
        this.add(new THREE.BoxGeometry(0.4, 0.34, 0.4), this.mat(objectColor.frame), 0, 0.4, 0);
        this.add(
          new THREE.BoxGeometry(0.12, 0.12, 0.6),
          this.mat(objectColor.unpowered, { powered: true }),
          0,
          0.44,
          0.3,
        );
        break;
      }
      default: {
        this.add(new THREE.BoxGeometry(w * 0.7, 0.7, d * 0.7), this.mat(objectColor.frame), 0, 0.35, 0);
        this.add(
          new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6),
          this.mat(objectColor.unpowered, { powered: true }),
          w * 0.22,
          0.45,
          0,
        );
        break;
      }
    }
  }
}
