import * as THREE from "three";
import type { GameMap } from "../data/schemas/map.js";
import { HEIGHT_STEP, TILE_SIZE, baseY, tileCenter } from "./board.js";
import { easeInOut } from "./presentation.js";

const PITCH = THREE.MathUtils.degToRad(33);
const BASE_YAW = Math.PI / 4;
const QUARTER = Math.PI / 2;
const DISTANCE = 40;
const ZOOM_LEVELS = [4.5, 6, 8, 10.5, 13.5, 17] as const;
const ORBIT_SECONDS = 0.32;

/** Orthographic tactics rig: fixed elevation, 90° orbit steps, stepped zoom. */
export class TacticsCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
  readonly target = new THREE.Vector3();
  private aspect = 1;
  private zoomIndex = 2;
  private orbitStep = 0;
  private yawCurrent = BASE_YAW;
  private yawFrom = BASE_YAW;
  private yawTo = BASE_YAW;
  private orbitElapsed = ORBIT_SECONDS;
  private panLimit = 12;
  private autoZoom = true;
  private fitExtent = 8;
  private fitHeight = 2;

  constructor() {
    this.applyProjection();
    this.applyTransform();
  }

  get yaw(): number {
    return this.yawCurrent;
  }

  get isOrbiting(): boolean {
    return this.orbitElapsed < ORBIT_SECONDS;
  }

  setViewport(width: number, height: number): void {
    this.aspect = height > 0 ? width / height : 1;
    if (this.autoZoom) this.fitZoom();
    this.applyProjection();
  }

  /**
   * Re-measure the board without touching the view. A scene rebuild (a spawn,
   * mid-battle) goes through here: the player's orbit, zoom and pan are theirs,
   * and throwing them away because a turret appeared is not a camera decision.
   */
  setMapBounds(map: GameMap): void {
    const tallest = map.tiles.reduce((best, tile) => Math.max(best, tile.height), 0);
    const top = tallest * HEIGHT_STEP;
    const bottom = baseY(map);
    this.panLimit = Math.max(map.width, map.depth) * TILE_SIZE * 0.75;
    // Widest screen-space span of the board: the diagonal, at 45° yaw.
    this.fitExtent = ((map.width + map.depth) * TILE_SIZE) / Math.SQRT2;
    this.fitHeight = top - bottom;
    this.clampTarget();
    if (this.autoZoom) this.fitZoom();
    this.applyProjection();
    this.applyTransform();
  }

  /** Measure the board and centre on it. New board only. */
  frameMap(map: GameMap): void {
    const tallest = map.tiles.reduce((best, tile) => Math.max(best, tile.height), 0);
    const top = tallest * HEIGHT_STEP;
    const bottom = baseY(map);
    this.target.set(0, (top + bottom) / 2, 0);
    this.autoZoom = true;
    this.setMapBounds(map);
  }

  /** direction: +1 clockwise, -1 counter-clockwise. Tweened over ~0.3s. */
  orbit(direction: 1 | -1): void {
    this.orbitStep += direction;
    this.yawFrom = this.yawCurrent;
    this.yawTo = BASE_YAW + this.orbitStep * QUARTER;
    this.orbitElapsed = 0;
  }

  zoomStep(direction: 1 | -1): void {
    this.autoZoom = false;
    this.zoomIndex = THREE.MathUtils.clamp(this.zoomIndex + direction, 0, ZOOM_LEVELS.length - 1);
    this.applyProjection();
  }

  /** Smallest zoom level that still shows the whole board with margin. */
  private fitZoom(): void {
    const margin = 1.18;
    const needed = Math.max(
      (this.fitExtent * margin) / Math.max(0.1, this.aspect),
      this.fitExtent * Math.sin(PITCH) * margin + this.fitHeight + 1.2,
    );
    const index = ZOOM_LEVELS.findIndex((level) => level >= needed);
    this.zoomIndex = index === -1 ? ZOOM_LEVELS.length - 1 : index;
  }

  /** Screen-relative pan on the ground plane (x = right, z = forward). */
  pan(right: number, forward: number): void {
    if (right === 0 && forward === 0) return;
    const sin = Math.sin(this.yawCurrent);
    const cos = Math.cos(this.yawCurrent);
    this.target.x += right * cos - forward * sin;
    this.target.z += -right * sin - forward * cos;
    this.clampTarget();
    this.applyTransform();
  }

  /**
   * Grab-pan: keep the ground under the pointer under the pointer. Screen
   * vertical is foreshortened by the rig's fixed pitch, so a pixel down the
   * screen is a longer step across the ground than a pixel across it, and a
   * drag that ignored that would slide the board out from under the hand.
   */
  panPixels(dx: number, dy: number, viewportHeight: number): void {
    if (viewportHeight <= 0) return;
    const worldPerPixel = (this.camera.top - this.camera.bottom) / viewportHeight;
    this.pan(-dx * worldPerPixel, (dy * worldPerPixel) / Math.sin(PITCH));
  }

  focusOn(map: GameMap, tile: { x: number; y: number }): void {
    const center = tileCenter(map, tile.x, tile.y);
    this.target.set(center.x, center.y, center.z);
    this.clampTarget();
    this.applyTransform();
  }

  update(deltaSeconds: number): void {
    if (this.orbitElapsed >= ORBIT_SECONDS) return;
    this.orbitElapsed = Math.min(ORBIT_SECONDS, this.orbitElapsed + deltaSeconds);
    const t = easeInOut(this.orbitElapsed / ORBIT_SECONDS);
    this.yawCurrent = this.yawFrom + (this.yawTo - this.yawFrom) * t;
    this.applyTransform();
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -this.panLimit, this.panLimit);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -this.panLimit, this.panLimit);
  }

  private applyProjection(): void {
    const height = ZOOM_LEVELS[this.zoomIndex] ?? ZOOM_LEVELS[2];
    const width = height * this.aspect;
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
  }

  private applyTransform(): void {
    const horizontal = Math.cos(PITCH) * DISTANCE;
    this.camera.position.set(
      this.target.x + Math.sin(this.yawCurrent) * horizontal,
      this.target.y + Math.sin(PITCH) * DISTANCE,
      this.target.z + Math.cos(this.yawCurrent) * horizontal,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
