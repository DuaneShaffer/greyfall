import * as THREE from "three";
import { AnimationPlayer } from "../art/player.js";
import { resolveFacing, type AnimState, type CameraYaw, type DrawnView } from "../art/sprites.js";
import type { Facing, Team } from "../data/schemas/common.js";
import { facingYaw } from "./grid.js";
import { DRAW_ORDER, markBloomOnly } from "./layers.js";
import { palette, teamColor } from "./palette.js";
import {
  SPRITE_ANCHOR_Y,
  SPRITE_PIXELS_PER_TILE,
  SPRITE_PIXELS_X,
  SPRITE_PIXELS_Y,
  applyCellUV,
  emissiveKeyMaterial,
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
  // Sits forward of the feet so the billboard's sub-floor band cannot hide it,
  // and inside MARKER_INNER so it never collides with the team ring.
  const positions = new Float32Array([-0.12, 0, 0.1, 0.12, 0, 0.1, 0, 0, 0.3]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
  );
  geometry.setIndex([0, 2, 1]);
  return geometry;
};

// Tile-relative, so the treatment survives any change to the sprite metrics.
const MARKER_INNER = 0.34;
const MARKER_OUTER = 0.46;
const MARKER_OPACITY = 0.9;
const MARKER_OPACITY_DOWNED = 0.35;
/** Team-tinted halo thickness around the silhouette, in tiles. */
const RIM_THICKNESS = 0.04;
const RIM_DEPTH_OFFSET = 0.006;

/**
 * Side identity is carried by ring *shape* as well as hue, so it survives
 * colourblindness and the low-contrast ground the sprites sit on: the player
 * gets one unbroken ring, the enemy four heavy segments, neutrals a fine dashed
 * one. `duty` is the fraction of each arc's slot that is drawn.
 */
const TEAM_MARKER_SHAPE: Record<Team, { arcs: number; duty: number }> = {
  player: { arcs: 1, duty: 1 },
  enemy: { arcs: 4, duty: 0.6 },
  neutral: { arcs: 8, duty: 0.34 },
};

const markerGeometry = (team: Team): THREE.BufferGeometry => {
  const { arcs, duty } = TEAM_MARKER_SHAPE[team];
  const slot = (Math.PI * 2) / arcs;
  const span = slot * duty;
  const steps = Math.max(2, Math.ceil(span / (Math.PI / 16)));
  const positions: number[] = [];

  for (let arc = 0; arc < arcs; arc += 1) {
    const start = arc * slot - span / 2;
    for (let step = 0; step < steps; step += 1) {
      const a0 = start + (span * step) / steps;
      const a1 = start + (span * (step + 1)) / steps;
      const i0 = [Math.sin(a0) * MARKER_INNER, 0, Math.cos(a0) * MARKER_INNER];
      const o0 = [Math.sin(a0) * MARKER_OUTER, 0, Math.cos(a0) * MARKER_OUTER];
      const i1 = [Math.sin(a1) * MARKER_INNER, 0, Math.cos(a1) * MARKER_INNER];
      const o1 = [Math.sin(a1) * MARKER_OUTER, 0, Math.cos(a1) * MARKER_OUTER];
      positions.push(...i0, ...o0, ...o1, ...i0, ...o1, ...i1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
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
  private readonly marker: THREE.Mesh;
  private readonly markerMaterial: THREE.MeshBasicMaterial;
  private readonly rim: THREE.Mesh;
  private readonly rimMaterial: THREE.MeshBasicMaterial;
  private readonly glow: THREE.Mesh;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly rimGeo: THREE.PlaneGeometry;
  private readonly wedgeGeo: THREE.BufferGeometry;
  private readonly shadowGeo: THREE.CircleGeometry;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private markerGeo: THREE.BufferGeometry;
  private markerTeam: Team;
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
    this.billboard.name = "unit-billboard";
    this.billboard.renderOrder = DRAW_ORDER.unitSprite;

    // Same sheet, same UV window, one rim thickness larger and pushed away from
    // the camera: the billboard covers its own interior, leaving a team-tinted
    // outline outside the silhouette. Parented to the billboard so the depth
    // offset stays behind it through every orbit.
    this.rimGeo = new THREE.PlaneGeometry(
      SPRITE_WIDTH + 2 * RIM_THICKNESS,
      SPRITE_HEIGHT + 2 * RIM_THICKNESS,
    );
    this.rimGeo.translate(0, ANCHOR_LIFT, 0);
    this.rimMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: teamColor[view.team],
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    // The sheet supplies the silhouette, not the colour: a sprite's edge pixels
    // are its soot-900 outline, and multiplying the team tint by black would
    // leave no rim at all. Sprite alpha is 0 or 255 (ART_DIRECTION §3), so the
    // cut is exact.
    this.rimMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        "#ifdef USE_MAP\n\tif ( texture2D( map, vMapUv ).a < 0.5 ) discard;\n#endif",
      );
    };
    this.rim = new THREE.Mesh(this.rimGeo, this.rimMaterial);
    this.rim.name = "team-rim";
    this.rim.position.z = -RIM_DEPTH_OFFSET;
    this.rim.renderOrder = DRAW_ORDER.unitRim;
    this.billboard.add(this.rim);

    // Same quad, same sheet, same UV window — a bloom-pass-only twin that keeps
    // the sprite's emissive pixels and discards the rest. Parented to the
    // billboard so it turns with it and needs no separate frame bookkeeping.
    this.glowMaterial = emissiveKeyMaterial(this.texture);
    this.glow = new THREE.Mesh(this.geometry, this.glowMaterial);
    this.glow.name = "sprite-glow";
    markBloomOnly(this.glow);
    this.billboard.add(this.glow);

    this.markerTeam = view.team;
    this.markerGeo = markerGeometry(view.team);
    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: teamColor[view.team],
      transparent: true,
      opacity: MARKER_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.marker = new THREE.Mesh(this.markerGeo, this.markerMaterial);
    this.marker.name = "team-marker";
    this.marker.position.y = 0.028;
    this.marker.renderOrder = DRAW_ORDER.unitMarker;

    this.wedgeGeo = wedgeGeometry();
    this.wedgeMaterial = new THREE.MeshBasicMaterial({
      color: teamColor[view.team],
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    });
    this.wedge = new THREE.Mesh(this.wedgeGeo, this.wedgeMaterial);
    this.wedge.name = "facing-wedge";
    this.wedge.position.y = 0.034;
    this.wedge.renderOrder = DRAW_ORDER.unitMarker;

    this.shadowGeo = new THREE.CircleGeometry(0.3, 12);
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(this.shadowGeo, this.shadowMaterial);
    this.shadow.name = "unit-shadow";
    this.shadow.position.y = 0.02;
    this.shadow.renderOrder = DRAW_ORDER.unitShadow;

    this.group.add(this.shadow, this.marker, this.wedge, this.billboard);
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
      this.rimMaterial.map = this.texture;
      this.rimMaterial.needsUpdate = true;
      this.glowMaterial.map = this.texture;
      this.glowMaterial.needsUpdate = true;
      this.stamp = "";
    }
    this.view = view;
    this.setTeam(view.team);
    this.setFacing(view.facing);
    this.setDowned(view.downed);
    this.refreshFrame(true);
  }

  /** Repaints the team cues, rebuilding the ring when its shape changes. */
  private setTeam(team: Team): void {
    const color = teamColor[team];
    this.wedgeMaterial.color.setHex(color);
    this.markerMaterial.color.setHex(color);
    this.rimMaterial.color.setHex(color);
    if (team === this.markerTeam) return;
    this.markerTeam = team;
    this.markerGeo.dispose();
    this.markerGeo = markerGeometry(team);
    this.marker.geometry = this.markerGeo;
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
    // A downed unit still belongs to a side, so the ring stays and only dims;
    // facing and the silhouette rim are cues about a combatant that is standing.
    this.wedge.visible = !downed;
    this.rim.visible = !downed;
    this.markerMaterial.opacity = downed ? MARKER_OPACITY_DOWNED : MARKER_OPACITY;
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
    this.rimGeo.dispose();
    this.rimMaterial.dispose();
    this.glowMaterial.dispose();
    this.markerGeo.dispose();
    this.markerMaterial.dispose();
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
