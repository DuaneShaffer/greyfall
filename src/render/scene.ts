import * as THREE from "three";
import type { TileCoord } from "../data/schemas/common.js";
import type { GameMap } from "../data/schemas/map.js";
import { TacticsCamera } from "./camera.js";
import { HEIGHT_STEP, facingBetween, standingHeight, tileCenter } from "./grid.js";
import { TileHighlights, type HighlightOptions } from "./highlights.js";
import { ObjectVisual } from "./objects.js";
import {
  PresentationQueue,
  easeInOut,
  instantAnimation,
  type Animation,
  type RenderEvent,
} from "./presentation.js";
import { palette } from "./palette.js";
import { buildTerrainMeshData, tileFromTriangle, type TerrainMeshData } from "./terrain.js";
import { UnitVisual } from "./units.js";
import { cloneViewModel, findObjectView, findUnitView, type BattleViewModel } from "./viewmodel.js";

const STEP_SECONDS = 0.22;
const HIT_SECONDS = 0.34;
const DOWN_SECONDS = 0.45;
const POWER_SECONDS = 0.28;
const COLLAPSE_SECONDS = 0.6;
const FOCUS_SECONDS = 0.28;

export interface BattleRendererOptions {
  canvas: HTMLCanvasElement;
  onTileHover?: (tile: TileCoord | null) => void;
  onTileSelect?: (tile: TileCoord | null) => void;
}

const worldPositionOf = (map: GameMap, tile: TileCoord): THREE.Vector3 => {
  const center = tileCenter(map, tile.x, tile.y);
  return new THREE.Vector3(center.x, standingHeight(map, tile) * HEIGHT_STEP, center.z);
};

/**
 * Owns the Three.js scene graph. Renderer state is derived: `buildScene` can be
 * called with any view-model snapshot at any time and fully rebuilds the graph;
 * `applyRenderEvent` only animates the transition between snapshots.
 */
export class BattleRenderer {
  readonly rig = new TacticsCamera();
  readonly scene = new THREE.Scene();
  readonly queue: PresentationQueue;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly boardGroup = new THREE.Group();
  private readonly unitGroup = new THREE.Group();
  private readonly objectGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly units = new Map<string, UnitVisual>();
  private readonly objects = new Map<string, ObjectVisual>();
  private readonly onTileHover: ((tile: TileCoord | null) => void) | undefined;
  private readonly onTileSelect: ((tile: TileCoord | null) => void) | undefined;

  private highlights: TileHighlights | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private terrainData: TerrainMeshData | null = null;
  private viewModel: BattleViewModel | null = null;
  private hovered: TileCoord | null = null;
  private selected: TileCoord | null = null;
  private readonly frameHooks: Array<(deltaSeconds: number) => void> = [];
  private clock = 0;
  private frameHandle = 0;
  private lastFrameMs = 0;

  constructor(options: BattleRendererOptions) {
    this.canvas = options.canvas;
    this.onTileHover = options.onTileHover;
    this.onTileSelect = options.onTileSelect;
    this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    this.renderer.setClearColor(palette.soot, 1);

    this.scene.background = new THREE.Color(palette.soot);
    // Ortho depth is measured from the rig's fixed distance, so the near plane
    // of the fog sits just in front of the board: only its far half hazes.
    this.scene.fog = new THREE.Fog(palette.skyGrey, 39, 66);
    this.scene.add(this.boardGroup, this.objectGroup, this.unitGroup);
    this.addLighting();
    this.queue = new PresentationQueue((event) => this.createAnimation(event));
    this.resize();
  }

  get snapshot(): BattleViewModel | null {
    return this.viewModel;
  }

  get hoveredTile(): TileCoord | null {
    return this.hovered;
  }

  get selectedTile(): TileCoord | null {
    return this.selected;
  }

  /** Full rebuild from a snapshot. Safe to call at any time. */
  buildScene(viewModel: BattleViewModel): void {
    this.queue.reset();
    this.disposeSceneContents();
    this.viewModel = cloneViewModel(viewModel);
    const map = this.viewModel.map;

    this.terrainData = buildTerrainMeshData(map);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.terrainData.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(this.terrainData.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.terrainData.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(this.terrainData.indices, 1));
    geometry.computeBoundingSphere();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.boardGroup.add(this.terrainMesh);

    this.highlights = new TileHighlights(map);
    this.boardGroup.add(this.highlights.group);

    for (const objectView of this.viewModel.objects) {
      const visual = new ObjectVisual(map, objectView);
      this.objects.set(objectView.id, visual);
      this.objectGroup.add(visual.group);
    }

    for (const unitView of this.viewModel.units) {
      const visual = new UnitVisual(unitView);
      const position = worldPositionOf(map, unitView.position);
      visual.setWorldPosition(position.x, position.y, position.z);
      this.units.set(unitView.id, visual);
      this.unitGroup.add(visual.group);
    }

    this.rig.frameMap(map);
    this.hovered = null;
    this.selected = null;
    this.updateBillboards();
  }

  /** Enqueue a presentation. Terminal state lands in the snapshot on finish. */
  applyRenderEvent(event: RenderEvent): void {
    this.queue.push(event);
  }

  applyRenderEvents(events: readonly RenderEvent[]): void {
    this.queue.pushAll(events);
  }

  /** Jump every pending animation to its end state. */
  skipPresentation(): void {
    this.queue.skip();
  }

  setHighlight(
    layerId: string,
    tiles: readonly TileCoord[],
    color: number,
    options?: HighlightOptions,
  ): void {
    this.highlights?.set(layerId, tiles, color, options);
  }

  clearHighlight(layerId: string): void {
    this.highlights?.clear(layerId);
  }

  setHoveredTile(tile: TileCoord | null): void {
    if (sameTileOrNull(tile, this.hovered)) return;
    this.hovered = tile;
    if (tile) {
      this.setHighlight("cursor", [tile], palette.highlightCursor, {
        opacity: 0.22,
        yOffset: 0.045,
        inset: 0.02,
      });
    } else {
      this.clearHighlight("cursor");
    }
    this.onTileHover?.(tile);
  }

  selectTile(tile: TileCoord | null): void {
    this.selected = tile;
    if (tile) {
      this.setHighlight("selection", [tile], palette.fluxAmber, {
        opacity: 0.3,
        yOffset: 0.05,
        inset: 0.01,
      });
    } else {
      this.clearHighlight("selection");
    }
    this.onTileSelect?.(tile);
  }

  /** Client-space pointer -> tile, via raycast against the terrain mesh. */
  pickTile(clientX: number, clientY: number): TileCoord | null {
    if (!this.terrainMesh || !this.terrainData || !this.viewModel) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hit = this.raycaster.intersectObject(this.terrainMesh, false)[0];
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return null;
    return tileFromTriangle(this.viewModel.map, this.terrainData, hit.faceIndex);
  }

  resize(): void {
    const width = this.canvas.clientWidth || this.canvas.width || 1;
    const height = this.canvas.clientHeight || this.canvas.height || 1;
    this.renderer.setSize(width, height, false);
    this.rig.setViewport(width, height);
  }

  /** Called at the top of every frame; used by the input controls. */
  addFrameHook(hook: (deltaSeconds: number) => void): () => void {
    this.frameHooks.push(hook);
    return () => {
      const index = this.frameHooks.indexOf(hook);
      if (index >= 0) this.frameHooks.splice(index, 1);
    };
  }

  /** One simulation+draw step. `start()` drives this from requestAnimationFrame. */
  frame(deltaSeconds: number): void {
    for (const hook of this.frameHooks) hook(deltaSeconds);
    this.clock += deltaSeconds;
    this.rig.update(deltaSeconds);
    this.queue.update(deltaSeconds);
    for (const object of this.objects.values()) object.update(this.clock);
    for (const unit of this.units.values()) unit.update(deltaSeconds);
    this.updateBillboards();
    this.renderer.render(this.scene, this.rig.camera);
  }

  start(): void {
    if (this.frameHandle !== 0) return;
    const loop = (nowMs: number): void => {
      const delta = this.lastFrameMs === 0 ? 0 : Math.min(0.1, (nowMs - this.lastFrameMs) / 1000);
      this.lastFrameMs = nowMs;
      this.frame(delta);
      this.frameHandle = requestAnimationFrame(loop);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.frameHandle !== 0) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.lastFrameMs = 0;
  }

  dispose(): void {
    this.stop();
    this.disposeSceneContents();
    this.renderer.dispose();
  }

  private updateBillboards(): void {
    const yaw = this.rig.yaw;
    for (const unit of this.units.values()) unit.faceCamera(yaw);
  }

  private addLighting(): void {
    // Greyfall daylight: soot-warm key from the west, cool sky bounce.
    const key = new THREE.DirectionalLight(0xf3e4c8, 1.35);
    key.position.set(-14, 22, 9);
    const sky = new THREE.HemisphereLight(0x9fa7b0, 0x3a332c, 0.75);
    const fill = new THREE.AmbientLight(palette.daylight, 0.22);
    this.scene.add(key, sky, fill);
  }

  private disposeSceneContents(): void {
    for (const unit of this.units.values()) {
      this.unitGroup.remove(unit.group);
      unit.dispose();
    }
    this.units.clear();
    for (const object of this.objects.values()) {
      this.objectGroup.remove(object.group);
      object.dispose();
    }
    this.objects.clear();
    if (this.highlights) {
      this.highlights.clearAll();
      this.boardGroup.remove(this.highlights.group);
      this.highlights = null;
    }
    if (this.terrainMesh) {
      this.boardGroup.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      (this.terrainMesh.material as THREE.Material).dispose();
      this.terrainMesh = null;
    }
    this.terrainData = null;
  }

  private createAnimation(event: RenderEvent): Animation | null {
    const viewModel = this.viewModel;
    if (!viewModel) return null;
    const map = viewModel.map;

    switch (event.kind) {
      case "unitMoved": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view || event.path.length === 0) return null;
        const points = event.path.map((tile) => worldPositionOf(map, tile));
        const legs = Math.max(1, points.length - 1);
        const settle = (): void => {
          const destination = event.path[event.path.length - 1] as TileCoord;
          const end = points[points.length - 1] as THREE.Vector3;
          visual.setWorldPosition(end.x, end.y, end.z);
          visual.setFacing(event.facing);
          visual.rest();
          view.position = { ...destination };
          view.elevation = standingHeight(map, destination);
          view.facing = event.facing;
        };
        return {
          duration: legs * STEP_SECONDS,
          update: (elapsed) => {
            visual.playWalk();
            const progress = Math.min(1, elapsed / (legs * STEP_SECONDS));
            const scaled = progress * legs;
            const leg = Math.min(legs - 1, Math.floor(scaled));
            const t = scaled - leg;
            const from = points[leg] as THREE.Vector3;
            const to = points[leg + 1] as THREE.Vector3;
            const hop = Math.sin(Math.PI * t) * (0.06 + Math.abs(to.y - from.y) * 0.35);
            visual.setWorldPosition(
              from.x + (to.x - from.x) * t,
              from.y + (to.y - from.y) * t + hop,
              from.z + (to.z - from.z) * t,
            );
            const a = event.path[leg] as TileCoord;
            const b = event.path[leg + 1] as TileCoord;
            visual.setFacing(facingBetween(a, b));
          },
          finish: settle,
        };
      }
      case "unitFaced": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view) return null;
        return instantAnimation(() => {
          visual.setFacing(event.facing);
          view.facing = event.facing;
        });
      }
      case "unitHit": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view) return null;
        const start = visual.currentView.hpFraction;
        // A negative amount is a heal reusing this event, and does not recoil.
        // The acting unit is not named by `unitHit`, so the attacker's swing is
        // not triggered here; call `UnitVisual.playAttack()` from wherever the
        // actor is known (see the hook on UnitVisual).
        if (event.amount > 0) visual.playHurt();
        return {
          duration: HIT_SECONDS,
          update: (elapsed) => {
            const t = Math.min(1, elapsed / HIT_SECONDS);
            visual.setFlash(1 - easeInOut(t));
            visual.setHpFraction(start + (event.hpFractionAfter - start) * t);
          },
          finish: () => {
            visual.setFlash(0);
            visual.setHpFraction(event.hpFractionAfter);
            view.hpFraction = event.hpFractionAfter;
          },
        };
      }
      case "unitDowned": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view) return null;
        return {
          duration: DOWN_SECONDS,
          update: (elapsed) => visual.setFlash(0.5 * (1 - elapsed / DOWN_SECONDS)),
          finish: () => {
            visual.setFlash(0);
            visual.setDowned(true);
            visual.setHpFraction(0);
            view.downed = true;
            view.hpFraction = 0;
          },
        };
      }
      case "objectPowerChanged": {
        const visual = this.objects.get(event.objectId);
        const view = findObjectView(viewModel, event.objectId);
        if (!visual || !view) return null;
        return {
          duration: POWER_SECONDS,
          update: () => {},
          finish: () => {
            visual.setPowered(event.powered);
            view.powered = event.powered;
          },
        };
      }
      case "objectDestroyed": {
        const visual = this.objects.get(event.objectId);
        const view = findObjectView(viewModel, event.objectId);
        if (!visual || !view) return null;
        return {
          duration: COLLAPSE_SECONDS,
          update: (elapsed) => visual.setCollapse(easeInOut(elapsed / COLLAPSE_SECONDS)),
          finish: () => {
            visual.setDestroyed(true);
            view.destroyed = true;
          },
        };
      }
      case "cameraFocused": {
        const tile = event.tile;
        return {
          duration: FOCUS_SECONDS,
          update: () => {},
          finish: () => this.rig.focusOn(map, tile),
        };
      }
      default:
        return null;
    }
  }
}

const sameTileOrNull = (a: TileCoord | null, b: TileCoord | null): boolean => {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
};
