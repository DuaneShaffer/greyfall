import * as THREE from "three";
import { AnimationPlayer } from "../art/player.js";
import { resolveFacing, type AnimState, type CameraYaw, type DrawnView } from "../art/sprites.js";
import type { Facing } from "../data/schemas/common.js";
import { facingYaw } from "./grid.js";
import { palette, teamColor } from "./palette.js";
import {
  SPRITE_ANCHOR_Y,
  SPRITE_PIXELS_PER_TILE,
  SPRITE_PIXELS_X,
  SPRITE_PIXELS_Y,
  applyCellUV,
  releaseSheetView,
  unitSheetView,
} from "./sprites.js";
import type { UnitView } from "./viewmodel.js";

const SPRITE_WIDTH = SPRITE_PIXELS_X / SPRITE_PIXELS_PER_TILE;
const SPRITE_HEIGHT = SPRITE_PIXELS_Y / SPRITE_PIXELS_PER_TILE;
// Rows below the feet anchor hang under the tile surface (sub-floor band).
const ANCHOR_LIFT =
  SPRITE_HEIGHT / 2 - (SPRITE_PIXELS_Y - SPRITE_ANCHOR_Y) / SPRITE_PIXELS_PER_TILE;

// The rig's yaw 0 sits over the SE map corner; orbiting +1 step moves the
// camera counter-clockwise in world space, which is -1 on the spec's corner
// list (se, sw, nw, ne).
const BASE_YAW = Math.PI / 4;
const QUARTER = Math.PI / 2;

export const cameraYawIndex = (yaw: number): CameraYaw => {
  const step = Math.round((yaw - BASE_YAW) / QUARTER);
  return ((((-step % 4) + 4) % 4) as CameraYaw);
};

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
  private readonly player: AnimationPlayer;
  private texture: THREE.Texture;
  private sheetId: string;
  private view: UnitView;
  private flash = 0;
  private yawIndex: CameraYaw = 0;
  private drawnView: DrawnView = "se";
  private mirrored = false;
  private stamp = "";

  constructor(view: UnitView) {
    this.unitId = view.id;
    this.view = view;
    this.player = new AnimationPlayer(view.downed ? "downed" : "idle");

    this.geometry = new THREE.PlaneGeometry(SPRITE_WIDTH, SPRITE_HEIGHT);
    this.geometry.translate(0, ANCHOR_LIFT, 0);
    this.sheetId = `${view.spriteId}:${view.team}`;
    this.texture = unitSheetView(view.spriteId, view.team);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
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
    this.refreshFrame(true);
  }

  get currentView(): UnitView {
    return this.view;
  }

  get animationState(): AnimState {
    return this.player.state;
  }

  get animationFrame(): number {
    return this.player.frame;
  }

  /** Which drawn view the camera-relative facing currently selects. */
  get drawn(): { view: DrawnView; mirrored: boolean } {
    return { view: this.drawnView, mirrored: this.mirrored };
  }

  setView(view: UnitView): void {
    const sheetId = `${view.spriteId}:${view.team}`;
    if (sheetId !== this.sheetId) {
      releaseSheetView(this.texture);
      this.texture = unitSheetView(view.spriteId, view.team);
      this.sheetId = sheetId;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
      this.stamp = "";
    }
    this.view = view;
    this.wedgeMaterial.color.setHex(teamColor[view.team]);
    this.setFacing(view.facing);
    this.setDowned(view.downed);
    this.refreshFrame(true);
  }

  setWorldPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  setFacing(facing: Facing): void {
    this.view = { ...this.view, facing };
    this.wedge.rotation.y = facingYaw(facing);
    this.refreshFrame();
  }

  setDowned(downed: boolean): void {
    const wasDowned = this.view.downed;
    this.view = { ...this.view, downed };
    this.wedge.visible = !downed;
    if (downed && !(wasDowned && this.player.state === "downed")) {
      this.player.play("downed");
    } else if (!downed && this.player.state === "downed") {
      this.player.setRest("idle");
      this.player.play("idle");
    }
    this.applyTint();
    this.refreshFrame();
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

  // -- animation state machine ---------------------------------------------

  /** Walk cycle while a path is being traversed. */
  playWalk(): void {
    if (this.view.downed || this.player.state === "walk") return;
    this.player.play("walk");
    this.refreshFrame();
  }

  /** Back to the resting state after a traversal or one-shot. */
  rest(): void {
    if (this.view.downed) return;
    if (this.player.state === "idle") return;
    this.player.play("idle");
    this.refreshFrame();
  }

  playHurt(): void {
    if (this.view.downed) return;
    this.player.play("hurt");
    this.refreshFrame();
  }

  /**
   * Attack swing. The presentation queue calls this on the acting unit; the
   * `unitHit` event only names the target, so scene wiring triggers it from
   * wherever the actor is known (see `scene.ts`).
   */
  playAttack(): void {
    if (this.view.downed) return;
    this.player.play("attack");
    this.refreshFrame();
  }

  /** `cast` doubles as operate. `hold` parks it in the CT charge loop. */
  playCast(hold = false): void {
    if (this.view.downed) return;
    this.player.play("cast", { hold });
    this.refreshFrame();
  }

  releaseCast(): void {
    this.player.release();
  }

  /** Advance the animation clock. Called once per rendered frame. */
  update(deltaSeconds: number): void {
    this.player.advanceSeconds(deltaSeconds);
    this.refreshFrame();
  }

  /** Keeps the quad upright and turned toward the camera through orbits. */
  faceCamera(yaw: number): void {
    this.billboard.rotation.y = yaw;
    const index = cameraYawIndex(yaw);
    if (index !== this.yawIndex) {
      this.yawIndex = index;
      this.refreshFrame();
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    releaseSheetView(this.texture);
    this.wedgeGeo.dispose();
    this.wedgeMaterial.dispose();
    this.shadowGeo.dispose();
    this.shadowMaterial.dispose();
  }

  private refreshFrame(force = false): void {
    const selection = resolveFacing(this.view.facing, this.yawIndex);
    this.drawnView = selection.view;
    this.mirrored = selection.mirrored;
    const state = this.player.state;
    const frame = this.player.frame;
    const stamp = `${state}:${frame}:${selection.view}:${selection.mirrored ? 1 : 0}`;
    if (!force && stamp === this.stamp) return;
    this.stamp = stamp;
    applyCellUV(this.texture, state, selection.view, frame, selection.mirrored);
  }

  private applyTint(): void {
    const wounded = this.view.downed ? 0.55 : 0.78 + 0.22 * this.view.hpFraction;
    this.material.color.setScalar(wounded);
    if (this.flash > 0) {
      this.material.color.lerp(new THREE.Color(palette.overloadCore), this.flash);
      this.material.color.addScalar(this.flash * 0.6);
    }
  }
}
