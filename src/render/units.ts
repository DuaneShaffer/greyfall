import * as THREE from "three";
import type { Facing } from "../data/schemas/common.js";
import { facingYaw } from "./grid.js";
import { palette, teamColor } from "./palette.js";
import {
  SPRITE_ANCHOR_Y,
  SPRITE_PIXELS_PER_TILE,
  SPRITE_PIXELS_X,
  SPRITE_PIXELS_Y,
  unitTexture,
} from "./sprites.js";
import type { UnitView } from "./viewmodel.js";

const SPRITE_WIDTH = SPRITE_PIXELS_X / SPRITE_PIXELS_PER_TILE;
const SPRITE_HEIGHT = SPRITE_PIXELS_Y / SPRITE_PIXELS_PER_TILE;
// Rows below the feet anchor hang under the tile surface (sub-floor band).
const ANCHOR_LIFT =
  SPRITE_HEIGHT / 2 - (SPRITE_PIXELS_Y - SPRITE_ANCHOR_Y) / SPRITE_PIXELS_PER_TILE;

const wedgeGeometry = (): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  // Sits forward of the feet so the billboard's sub-floor band cannot hide it.
  const positions = new Float32Array([-0.15, 0, 0.14, 0.15, 0, 0.14, 0, 0, 0.42]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
  );
  geometry.setIndex([0, 2, 1]);
  return geometry;
};

/** One unit: an upright camera-facing billboard anchored at its feet. */
export class UnitVisual {
  readonly group = new THREE.Group();
  readonly unitId: string;
  private readonly billboard: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly wedge: THREE.Mesh;
  private readonly wedgeMaterial: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly wedgeGeo: THREE.BufferGeometry;
  private readonly shadowGeo: THREE.CircleGeometry;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private view: UnitView;
  private flash = 0;

  constructor(view: UnitView) {
    this.unitId = view.id;
    this.view = view;

    this.geometry = new THREE.PlaneGeometry(SPRITE_WIDTH, SPRITE_HEIGHT);
    this.geometry.translate(0, ANCHOR_LIFT, 0);
    this.material = new THREE.MeshBasicMaterial({
      map: unitTexture(view.team, view.downed),
      transparent: false,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.billboard = new THREE.Mesh(this.geometry, this.material);
    this.billboard.renderOrder = 2;

    this.wedgeGeo = wedgeGeometry();
    this.wedgeMaterial = new THREE.MeshBasicMaterial({
      color: teamColor[view.team],
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    });
    this.wedge = new THREE.Mesh(this.wedgeGeo, this.wedgeMaterial);
    this.wedge.position.y = 0.03;
    this.wedge.renderOrder = 1;

    this.shadowGeo = new THREE.CircleGeometry(0.3, 12);
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(this.shadowGeo, this.shadowMaterial);
    this.shadow.position.y = 0.02;

    this.group.add(this.shadow, this.wedge, this.billboard);
    this.setFacing(view.facing);
    this.setDowned(view.downed);
  }

  get currentView(): UnitView {
    return this.view;
  }

  setView(view: UnitView): void {
    this.view = view;
    this.material.map = unitTexture(view.team, view.downed);
    this.material.needsUpdate = true;
    this.wedgeMaterial.color.setHex(teamColor[view.team]);
    this.setFacing(view.facing);
    this.setDowned(view.downed);
  }

  setWorldPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  setFacing(facing: Facing): void {
    this.view = { ...this.view, facing };
    this.wedge.rotation.y = facingYaw(facing);
  }

  setDowned(downed: boolean): void {
    this.view = { ...this.view, downed };
    this.material.map = unitTexture(this.view.team, downed);
    this.material.needsUpdate = true;
    this.wedge.visible = !downed;
    this.applyTint();
  }

  setHpFraction(fraction: number): void {
    this.view = { ...this.view, hpFraction: Math.min(1, Math.max(0, fraction)) };
    this.applyTint();
  }

  /** 0 = normal, 1 = full white hit flash. */
  setFlash(amount: number): void {
    this.flash = Math.min(1, Math.max(0, amount));
    this.applyTint();
  }

  /** Keeps the quad upright and turned toward the camera through orbits. */
  faceCamera(yaw: number): void {
    this.billboard.rotation.y = yaw;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.wedgeGeo.dispose();
    this.wedgeMaterial.dispose();
    this.shadowGeo.dispose();
    this.shadowMaterial.dispose();
  }

  private applyTint(): void {
    const wounded = this.view.downed ? 0.55 : 0.78 + 0.22 * this.view.hpFraction;
    this.material.color.setScalar(wounded);
    if (this.flash > 0) {
      this.material.color.lerp(new THREE.Color(palette.overloadViolet), this.flash);
      this.material.color.addScalar(this.flash * 0.6);
    }
  }
}
