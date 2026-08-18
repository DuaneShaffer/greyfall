import * as THREE from "three";
import { frameEndTick } from "../art/player.js";
import { TICKS_PER_SECOND } from "../art/sprites.js";
import { coordEq } from "../data/coords.js";
import type { DamageType, Facing, TileCoord } from "../data/schemas/common.js";
import type { GameMap } from "../data/schemas/map.js";
import { TacticsCamera } from "./camera.js";
import type { Vec3 } from "./effects.js";
import { HEIGHT_STEP, facingBetween, inBounds, standingHeight, tileCenter } from "./grid.js";
import { TileHighlights, type HighlightOptions } from "./highlights.js";
import { DRAW_ORDER } from "./layers.js";
import { ObjectVisual } from "./objects.js";
import { damagePopup, missPopup } from "./popups.js";
import { PostChain } from "./post.js";
import {
  PresentationQueue,
  easeInOut,
  instantAnimation,
  type Animation,
  type RenderEvent,
} from "./presentation.js";
import { palette } from "./palette.js";
import { buildTerrainMeshData, tileFromTriangle, type TerrainMeshData } from "./terrain.js";
import { TerrainTextures } from "./terrainTextures.js";
import { UnitVisual } from "./units.js";
import { VfxLayer } from "./vfxLayer.js";
import {
  cloneViewModel,
  findObjectView,
  findUnitView,
  type BattleViewModel,
  type UnitView,
} from "./viewmodel.js";

const STEP_SECONDS = 0.22;
/**
 * Enemy walks are watched, not steered, so they travel at a brisker tick than
 * the player's own — the AI's turn is presentation, and a long approach across
 * the board is the single biggest thing standing between two decisions.
 */
const AI_STEP_SECONDS = 0.13;
/** Ceiling on one walk however long the path is; a march is not a cutscene. */
const MAX_WALK_SECONDS = 1;
/** A move onto the unit's own tile: nothing to walk, one idle beat to read. */
const STAY_PUT_SECONDS = 0.14;
/**
 * Longest step one frame may advance the world by. It is a stall guard (a
 * backgrounded tab hands back a delta of minutes), so it sits well above any
 * frame a software GL context actually takes — clamp it tighter and every
 * animation stretches to several times its authored length on a slow machine.
 */
const MAX_FRAME_SECONDS = 0.25;
const HIT_SECONDS = 0.34;
const DOWN_SECONDS = 0.45;
const POWER_SECONDS = 0.12;
const COLLAPSE_SECONDS = 0.6;
const FOCUS_SECONDS = 0.12;
/**
 * How long the actor gets before the hit lands: the anticipate frames plus the
 * strike (ART_DIRECTION §4). The swing's follow-through plays out underneath
 * the target's recoil rather than delaying it.
 */
const STRIKE_LEAD_SECONDS = frameEndTick("attack", 2) / TICKS_PER_SECOND;
const CAST_RELEASE_SECONDS = frameEndTick("cast", 4) / TICKS_PER_SECOND - frameEndTick("cast", 3) / TICKS_PER_SECOND;
/** Volatile machinery flashes overload-100 before the silhouette goes. */
const OVERLOAD_FLASH_SECONDS = 0.3;
const TRIGGER_SECONDS = 0.42;
/** The seams settling onto a new headroom; the register's LOAD line in 3D. */
const GRID_STRAIN_SECONDS = 0.18;
/** A component blowing: every node in it flares once and goes out together. */
const GRID_TRIP_SECONDS = 0.4;
const GRID_SPAN_SECONDS = 0.3;
const MACHINE_SHOT_SECONDS = 0.24;
const EXIT_TILES = 3;
const EXIT_VANISH_SECONDS = 0.3;
/** Where a damage number floats and where an impact effect plays, over a unit. */
const POPUP_HEAD_HEIGHT = 1.6;
const IMPACT_HEIGHT = 0.8;

/** A unit shown standing somewhere it has not moved to. Presentation only. */
export interface MovePreview {
  unitId: string;
  tile: TileCoord;
}

export interface BattleRendererOptions {
  canvas: HTMLCanvasElement;
  onTileHover?: (tile: TileCoord | null) => void;
  onTileSelect?: (tile: TileCoord | null) => void;
}

const worldPositionOf = (map: GameMap, tile: TileCoord): THREE.Vector3 => {
  const center = tileCenter(map, tile.x, tile.y);
  return new THREE.Vector3(center.x, standingHeight(map, tile) * HEIGHT_STEP, center.z);
};

/** The part of a unit's visual a walk drives. `UnitVisual` satisfies it. */
export interface Walker {
  setWorldPosition(x: number, y: number, z: number): void;
  setFacing(facing: Facing): void;
  playWalk(): void;
  rest(): void;
}

/**
 * Walk a unit along `path`, tile by tile, and leave it standing on the last one.
 *
 * A one-tile path is a move onto the unit's own tile — a legal choice the move
 * range offers — so there is no leg to interpolate along: it holds one idle
 * beat and settles. Enemy walks run on a brisker tick, and no walk however long
 * runs past `MAX_WALK_SECONDS`.
 */
export function walkAnimation(
  map: GameMap,
  path: readonly TileCoord[],
  facing: Facing,
  visual: Walker,
  view: UnitView,
): Animation | null {
  const destination = path[path.length - 1];
  if (destination === undefined) return null;
  const points = path.map((tile) => worldPositionOf(map, tile));
  const end = points[points.length - 1] as THREE.Vector3;

  const settle = (): void => {
    visual.setWorldPosition(end.x, end.y, end.z);
    visual.setFacing(facing);
    visual.rest();
    view.position = { ...destination };
    view.elevation = standingHeight(map, destination);
    view.facing = facing;
  };

  const legs = points.length - 1;
  if (legs < 1) return { duration: STAY_PUT_SECONDS, update: () => {}, finish: settle };

  const step = view.team === "player" ? STEP_SECONDS : AI_STEP_SECONDS;
  const duration = Math.min(MAX_WALK_SECONDS, legs * step);
  return {
    duration,
    update: (elapsed) => {
      visual.playWalk();
      const progress = Math.min(1, elapsed / duration);
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
      visual.setFacing(facingBetween(path[leg] as TileCoord, path[leg + 1] as TileCoord));
    },
    finish: settle,
  };
}

/**
 * Stand a unit on a tile instantly, snapshot and all. This is the undo's
 * presentation: a rolled-back walk did not happen, so there is nothing to
 * interpolate along and no step to play (COMBAT_RULES §10b). Writing the
 * snapshot back is the load-bearing half — the move preview measures its offset
 * off the unit's recorded tile, so a snap that skipped it would leave the next
 * preview hanging off the tile the unit no longer stands on.
 */
export function snapAnimation(
  map: GameMap,
  tile: TileCoord,
  facing: Facing,
  visual: Walker,
  view: UnitView,
): Animation {
  const position = worldPositionOf(map, tile);
  return instantAnimation(() => {
    visual.setWorldPosition(position.x, position.y, position.z);
    visual.setFacing(facing);
    visual.rest();
    view.position = { ...tile };
    view.elevation = standingHeight(map, tile);
    view.facing = facing;
  });
}

/** The part of an object's visual the network-level events drive. */
export interface GridNodeVisual {
  setOverload(amount: number): void;
}

/**
 * Settle a network's nodes onto new headroom. `strain` is the whole terminal
 * state — the register's three steps, read off the LOAD line — so a skip lands
 * on the right seams and applying it twice changes nothing.
 */
export function gridStrainAnimation(
  visuals: readonly GridNodeVisual[],
  strain: number,
): Animation {
  const settle = (): void => {
    for (const visual of visuals) visual.setOverload(strain);
  };
  return {
    duration: GRID_STRAIN_SECONDS,
    update: (elapsed) => {
      const t = Math.min(1, elapsed / GRID_STRAIN_SECONDS);
      for (const visual of visuals) visual.setOverload(strain * t);
    },
    finish: settle,
  };
}

/**
 * A component blowing: every node in it flares once and goes out together. The
 * trip is total, so there is nothing to leave straining afterwards.
 */
export function gridTripAnimation(visuals: readonly GridNodeVisual[]): Animation {
  return {
    duration: GRID_TRIP_SECONDS,
    update: (elapsed) => {
      const flare = Math.sin(Math.PI * Math.min(1, elapsed / GRID_TRIP_SECONDS));
      for (const visual of visuals) visual.setOverload(flare);
    },
    finish: () => {
      for (const visual of visuals) visual.setOverload(0);
    },
  };
}

/** The part of an object's visual a cut and its splice drive. */
export interface SpanVisual {
  setSevered(severed: boolean): void;
}

/**
 * The reversible verb: the span sparks where it parts, or glows where it is
 * made good, and settles into the state the event names. `play` fires once
 * however the animation is driven.
 */
export function spanAnimation(visual: SpanVisual, severed: boolean, play: () => void): Animation {
  let played = false;
  const once = (): void => {
    if (played) return;
    played = true;
    play();
  };
  return {
    duration: GRID_SPAN_SECONDS,
    update: once,
    finish: () => {
      once();
      visual.setSevered(severed);
    },
  };
}

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
  private readonly post: PostChain;
  private readonly canvas: HTMLCanvasElement;
  private readonly boardGroup = new THREE.Group();
  private readonly unitGroup = new THREE.Group();
  private readonly objectGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly units = new Map<string, UnitVisual>();
  private readonly objects = new Map<string, ObjectVisual>();
  private readonly vfx = new VfxLayer();
  /** The tile-face materials, shared by every board this renderer builds. */
  private readonly terrain = new TerrainTextures();
  private readonly onTileHover: ((tile: TileCoord | null) => void) | undefined;
  private readonly onTileSelect: ((tile: TileCoord | null) => void) | undefined;

  private highlights: TileHighlights | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private terrainData: TerrainMeshData | null = null;
  private viewModel: BattleViewModel | null = null;
  private hovered: TileCoord | null = null;
  private selected: TileCoord | null = null;
  private preview: MovePreview | null = null;
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
    this.scene.add(this.boardGroup, this.objectGroup, this.unitGroup, this.vfx.group);
    this.addLighting();
    this.post = new PostChain(this.renderer, this.scene, this.rig.camera);
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

  get movePreview(): MovePreview | null {
    return this.preview === null ? null : { unitId: this.preview.unitId, tile: { ...this.preview.tile } };
  }

  /** Full rebuild from a snapshot. Safe to call at any time. */
  buildScene(viewModel: BattleViewModel): void {
    this.queue.reset();
    const previousMap = this.viewModel?.map ?? null;
    this.disposeSceneContents();
    this.viewModel = cloneViewModel(viewModel);
    const map = this.viewModel.map;
    this.vfx.clear();
    this.vfx.setMap(map);

    this.terrainData = buildTerrainMeshData(map);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.terrainData.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(this.terrainData.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.terrainData.colors, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(this.terrainData.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(this.terrainData.indices, 1));
    for (const group of this.terrainData.groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    geometry.computeBoundingSphere();
    this.terrainMesh = new THREE.Mesh(geometry, [...this.terrain.materials]);
    this.terrainMesh.renderOrder = DRAW_ORDER.terrain;
    this.boardGroup.add(this.terrainMesh);
    this.post.setOccluders([this.terrainMesh]);

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

    // A rebuild on the same board is a spawn, not a new engagement: re-measure
    // it, but leave the player's orbit, zoom and pan exactly where they put it.
    const sameBoard =
      previousMap !== null &&
      previousMap.id === map.id &&
      previousMap.width === map.width &&
      previousMap.depth === map.depth;
    if (sameBoard) this.rig.setMapBounds(map);
    else this.rig.frameMap(map);
    this.hovered = null;
    this.selected = null;
    this.preview = null;
    this.updateBillboards();
  }

  /**
   * FFT's move preview: the unit's own figure stands on the tile the cursor is
   * over, at that tile's height, so the player judges the position from the
   * sprite rather than from a highlight. Its team ring stays on the tile it is
   * really on, which is the whole marker of where the preview is lying.
   *
   * Derived presentation: no game state moves, and `null` restores the figure
   * immediately. A preview and an animation are never on screen together — the
   * queue clears it (see `applyRenderEvents`), so a walk plays from the true
   * origin however the caller ordered the two.
   */
  setMovePreview(preview: MovePreview | null): void {
    const current = this.preview;
    if (current !== null && (preview === null || preview.unitId !== current.unitId)) {
      this.units.get(current.unitId)?.setPreviewOffset(null);
      this.preview = null;
    }
    const viewModel = this.viewModel;
    if (preview === null || viewModel === null) return;
    if (this.preview !== null && sameTileOrNull(this.preview.tile, preview.tile)) return;
    const visual = this.units.get(preview.unitId);
    const view = findUnitView(viewModel, preview.unitId);
    if (!visual || !view) return;
    const from = worldPositionOf(viewModel.map, view.position);
    const to = worldPositionOf(viewModel.map, preview.tile);
    visual.setPreviewOffset({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
    this.preview = { unitId: preview.unitId, tile: { ...preview.tile } };
  }

  /** Enqueue a presentation. Terminal state lands in the snapshot on finish. */
  applyRenderEvent(event: RenderEvent): void {
    this.setMovePreview(null);
    this.queue.push(event);
  }

  applyRenderEvents(events: readonly RenderEvent[]): void {
    if (events.length > 0) this.setMovePreview(null);
    this.queue.pushAll(events);
  }

  /**
   * Jump every pending animation to its end state. Transients (popups, impact
   * effects) have no terminal state to reach: skipping means they are gone.
   */
  skipPresentation(): void {
    this.queue.skip();
    this.vfx.clear();
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
    this.post.setSize(width, height);
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
    this.terrain.advance(deltaSeconds);
    this.queue.update(deltaSeconds);
    for (const object of this.objects.values()) object.update(this.clock);
    for (const unit of this.units.values()) unit.update(deltaSeconds);
    this.vfx.update(deltaSeconds);
    this.updateBillboards();
    this.post.render();
  }

  start(): void {
    if (this.frameHandle !== 0) return;
    const loop = (nowMs: number): void => {
      // Scheduled before the frame runs, not after: whatever the frame throws,
      // the loop lives. A `stop()` from inside the frame still cancels the
      // handle this line just set.
      this.frameHandle = requestAnimationFrame(loop);
      const delta =
        this.lastFrameMs === 0 ? 0 : Math.min(MAX_FRAME_SECONDS, (nowMs - this.lastFrameMs) / 1000);
      this.lastFrameMs = nowMs;
      try {
        this.frame(delta);
      } catch (error) {
        console.error("[greyfall] frame failed", error);
      }
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
    this.vfx.dispose();
    this.terrain.dispose();
    this.post.dispose();
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
      this.post.setOccluders([]);
      this.boardGroup.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      // The materials outlive the mesh: they are the shared tile-face set.
      this.terrainMesh = null;
    }
    this.terrainData = null;
  }

  /** World point above a unit's feet: popups ride the head, impacts the chest. */
  private unitPoint(unitId: string, height: number): Vec3 | null {
    const visual = this.units.get(unitId);
    if (!visual) return null;
    const position = visual.group.position;
    return { x: position.x, y: position.y + height, z: position.z };
  }

  /** The standing visuals of a grid's nodes. A wreck is off the network. */
  private gridVisuals(nodeIds: readonly string[]): ObjectVisual[] {
    const out: ObjectVisual[] = [];
    for (const nodeId of nodeIds) {
      const visual = this.objects.get(nodeId);
      if (visual && !visual.currentView.destroyed) out.push(visual);
    }
    return out;
  }

  private objectPoint(objectId: string, height: number): Vec3 | null {
    const visual = this.objects.get(objectId);
    if (!visual) return null;
    const position = visual.group.position;
    return { x: position.x, y: position.y + height, z: position.z };
  }

  /** The number and the impact effect a hit throws, per ART_DIRECTION §7. */
  private playHitVfx(
    unitId: string,
    amount: number,
    damageType: DamageType | null,
    sourceUnitId: string | null,
    tile: TileCoord,
  ): void {
    const head = this.unitPoint(unitId, POPUP_HEAD_HEIGHT);
    if (head) this.vfx.popup(damagePopup(amount, damageType), head);
    const contact = this.unitPoint(unitId, IMPACT_HEIGHT);
    if (!contact) return;
    if (amount < 0) {
      this.vfx.healMotes(contact);
      return;
    }
    const from =
      sourceUnitId === null || sourceUnitId === unitId
        ? null
        : this.unitPoint(sourceUnitId, IMPACT_HEIGHT);
    this.vfx.impact(damageType ?? "kinetic", contact, { from, tile });
  }

  private createAnimation(event: RenderEvent): Animation | null {
    const viewModel = this.viewModel;
    if (!viewModel) return null;
    const map = viewModel.map;

    switch (event.kind) {
      case "unitMoved": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view) return null;
        return walkAnimation(map, event.path, event.facing, visual, view);
      }
      case "unitSnapped": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view) return null;
        return snapAnimation(map, event.tile, event.facing, visual, view);
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
      case "unitActed": {
        const visual = this.units.get(event.unitId);
        if (!visual) return null;
        if (event.pose === "castHold") return instantAnimation(() => visual.playCast(true));
        if (event.pose === "rest") {
          return instantAnimation(() => {
            visual.releaseCast();
            visual.rest();
          });
        }
        // The clip runs on its own clock and returns itself to idle, so the
        // terminal state here is "the swing has started" — skipping cannot
        // strand the actor mid-pose.
        let swung = false;
        const swing = (): void => {
          if (swung) return;
          swung = true;
          if (event.pose !== "cast") {
            visual.playAttack();
            return;
          }
          if (visual.animationState === "cast") visual.releaseCast();
          else visual.playCast();
        };
        return {
          duration: event.pose === "cast" ? CAST_RELEASE_SECONDS : STRIKE_LEAD_SECONDS,
          update: swing,
          finish: swing,
        };
      }
      case "unitMissed": {
        const head = this.unitPoint(event.unitId, POPUP_HEAD_HEIGHT);
        if (!head) return null;
        return instantAnimation(() => this.vfx.popup(missPopup(), head));
      }
      case "unitHit": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view) return null;
        const start = visual.currentView.hpFraction;
        // A negative amount is a heal reusing this event, and does not recoil.
        if (event.amount > 0) visual.playHurt();
        this.playHitVfx(event.unitId, event.amount, event.damageType, event.sourceUnitId, view.position);
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
      case "unitRemoved": {
        const visual = this.units.get(event.unitId);
        const view = findUnitView(viewModel, event.unitId);
        if (!visual || !view) return null;
        const origin = { ...view.position };
        const exit = exitDirection(map, origin);
        // Always walks the full distance: past the edge is off the board, which
        // is where a unit leaving the battle is going.
        const destination: TileCoord = {
          x: origin.x + exit.dx * EXIT_TILES,
          y: origin.y + exit.dy * EXIT_TILES,
        };
        const start = worldPositionOf(map, origin);
        const end = worldPositionOf(map, destination);
        if (!inBounds(map, destination.x, destination.y)) end.y = start.y;
        const walkSeconds = EXIT_TILES * STEP_SECONDS;
        const retire = (): void => {
          this.unitGroup.remove(visual.group);
          visual.dispose();
          this.units.delete(event.unitId);
          viewModel.units = viewModel.units.filter((unit) => unit.id !== event.unitId);
        };
        return {
          duration: walkSeconds + EXIT_VANISH_SECONDS,
          update: (elapsed) => {
            if (elapsed < walkSeconds) {
              visual.playWalk();
              visual.setFacing(facingBetween(origin, destination));
              const t = elapsed / walkSeconds;
              visual.setWorldPosition(
                start.x + (end.x - start.x) * t,
                start.y + (end.y - start.y) * t,
                start.z + (end.z - start.z) * t,
              );
              return;
            }
            // No alpha fade: §3 forbids partial alpha on sprites, so the exit
            // is a shrink toward the feet anchor instead.
            const t = Math.min(1, (elapsed - walkSeconds) / EXIT_VANISH_SECONDS);
            visual.rest();
            visual.setWorldPosition(end.x, end.y, end.z);
            visual.group.scale.setScalar(Math.max(0.001, 1 - t));
          },
          finish: retire,
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
      // --- the network level ------------------------------------------------
      // These carry what happened to the bus, never a second pass over the
      // per-object lights the `objectPowerChanged` batch beside them owns.
      case "gridChanged": {
        const visuals = this.gridVisuals(event.nodeIds);
        return visuals.length === 0 ? null : gridStrainAnimation(visuals, event.strain);
      }
      case "gridTripped": {
        const visuals = this.gridVisuals(event.nodeIds);
        return visuals.length === 0 ? null : gridTripAnimation(visuals);
      }
      case "gridReset": {
        const visual = this.objects.get(event.nodeId);
        if (!visual) return null;
        const anchor = this.objectPoint(event.nodeId, 0.5);
        let struck = false;
        const reclose = (): void => {
          if (!struck && anchor) this.vfx.muzzleGlow(anchor);
          struck = true;
          visual.setOverload(0);
        };
        return { duration: MACHINE_SHOT_SECONDS, update: reclose, finish: reclose };
      }
      case "lineSevered":
      case "lineSpliced": {
        const visual = this.objects.get(event.objectId);
        const view = findObjectView(viewModel, event.objectId);
        if (!visual || !view) return null;
        const severed = event.kind === "lineSevered";
        const contact = this.objectPoint(event.objectId, IMPACT_HEIGHT);
        const base = this.objectPoint(event.objectId, 0);
        view.severed = severed;
        return spanAnimation(visual, severed, () => {
          if (!contact || !base) return;
          if (severed) this.vfx.arcJag(contact, base, view.tiles[0] ?? null);
          else this.vfx.healMotes(contact);
        });
      }
      case "loadAttached": {
        const shunt = this.objectPoint(event.nodeId, POPUP_HEAD_HEIGHT);
        const contact = this.objectPoint(event.nodeId, IMPACT_HEIGHT);
        const view = findObjectView(viewModel, event.nodeId);
        if (!shunt || !contact) return null;
        let hung = false;
        const hang = (): void => {
          if (hung) return;
          hung = true;
          this.vfx.arcJag(shunt, contact, view?.tiles[0] ?? null);
        };
        return { duration: GRID_SPAN_SECONDS, update: hang, finish: hang };
      }
      case "objectHit": {
        const view = findObjectView(viewModel, event.objectId);
        const contact = this.objectPoint(event.objectId, IMPACT_HEIGHT);
        if (!view || !contact) return null;
        const head = this.objectPoint(event.objectId, POPUP_HEAD_HEIGHT);
        const tile = view.tiles[0] ?? null;
        let struck = false;
        const strike = (): void => {
          if (struck) return;
          struck = true;
          if (head) this.vfx.popup(damagePopup(event.amount, event.damageType), head);
          this.vfx.impact(event.damageType, contact, { tile });
        };
        return { duration: MACHINE_SHOT_SECONDS, update: strike, finish: strike };
      }
      case "objectDestroyed": {
        const visual = this.objects.get(event.objectId);
        const view = findObjectView(viewModel, event.objectId);
        if (!visual || !view) return null;
        // Anything with an `onDestroyed` payload announces it: the seams run up
        // to overload-100 first, then the silhouette goes.
        const flash = view.volatile ? OVERLOAD_FLASH_SECONDS : 0;
        return {
          duration: flash + COLLAPSE_SECONDS,
          update: (elapsed) => {
            if (elapsed < flash) {
              visual.setOverload(elapsed / flash);
              return;
            }
            visual.setOverload(0);
            visual.setCollapse(easeInOut((elapsed - flash) / COLLAPSE_SECONDS));
          },
          finish: () => {
            visual.setDestroyed(true);
            view.destroyed = true;
          },
        };
      }
      case "objectTriggered": {
        const visual = this.objects.get(event.objectId);
        const view = findObjectView(viewModel, event.objectId);
        if (!visual || !view) return null;
        const anchor = this.objectPoint(event.objectId, 0);
        let burst = false;
        return {
          duration: TRIGGER_SECONDS,
          update: () => {
            if (burst || anchor === null) return;
            burst = true;
            this.vfx.thermalFlare(anchor, 1.3);
          },
          finish: () => {
            visual.setDestroyed(true);
            visual.setHidden(true);
            view.destroyed = true;
          },
        };
      }
      case "objectAttacked": {
        const muzzle = this.objectPoint(event.objectId, 0.5);
        const contact = this.unitPoint(event.targetUnitId, IMPACT_HEIGHT);
        const targetView = findUnitView(viewModel, event.targetUnitId);
        if (!muzzle || !contact) return null;
        let fired = false;
        const fire = (): void => {
          if (fired) return;
          fired = true;
          this.vfx.muzzleGlow(muzzle);
          this.vfx.arcJag(muzzle, contact, targetView?.position ?? null);
          if (event.hit) return;
          const head = this.unitPoint(event.targetUnitId, POPUP_HEAD_HEIGHT);
          if (head) this.vfx.popup(missPopup(), head);
        };
        return { duration: MACHINE_SHOT_SECONDS, update: fire, finish: fire };
      }
      case "cameraFocused": {
        const tile = event.tile;
        // The rig glides on its own clock, so the queue only holds long enough
        // to read the cut; the pan finishes underneath whatever plays next.
        let focused = false;
        const focus = (): void => {
          if (focused) return;
          focused = true;
          this.rig.focusOn(map, tile);
        };
        return { duration: FOCUS_SECONDS, update: focus, finish: focus };
      }
      default:
        return null;
    }
  }
}

/** Shortest way off the board, for a unit walking out of the battle. */
const exitDirection = (
  map: GameMap,
  tile: TileCoord,
): { dx: number; dy: number; distance: number } => {
  const options = [
    { dx: -1, dy: 0, distance: tile.x },
    { dx: 1, dy: 0, distance: map.width - 1 - tile.x },
    { dx: 0, dy: -1, distance: tile.y },
    { dx: 0, dy: 1, distance: map.depth - 1 - tile.y },
  ];
  return options.reduce((best, option) => (option.distance < best.distance ? option : best));
};

const sameTileOrNull = (a: TileCoord | null, b: TileCoord | null): boolean =>
  a === null || b === null ? a === b : coordEq(a, b);
