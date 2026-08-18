import * as THREE from "three";
import { objectArtFor, type ObjectArtSpec, type ObjectFaceId, type ObjectPowerState } from "../art/objects.js";
import type { GameMap, GridRole, MapObjectKind } from "../data/schemas/map.js";
import { HEIGHT_STEP, TILE_SIZE, tileCenter, tileHeight } from "./grid.js";
import { markBloomEligible, markBloomOnly } from "./layers.js";
import {
  BOX_FACE_SLOTS,
  boxYaw,
  faceShade,
  objectCarrierTexture,
  objectFaceTexture,
} from "./objectTextures.js";
import { objectColor, palette } from "./palette.js";
import { emissiveKeyMaterial } from "./sprites.js";
import type { MapObjectView } from "./viewmodel.js";

/** Share of a cut run's length that opens as a gap, split across both ends. */
const SEVERED_GAP = 0.38;
/** Yaw between the parted ends, in radians: the run no longer lines up. */
const SEVERED_KINK = 0.13;
/** How far a cut run's body is pulled toward the dead-seam grey. */
const SEVERED_FADE = 0.5;

/**
 * Kinds whose own primitive carries something the rules or the tactical read
 * depend on — a deck to stand on, a grate, a blocking silhouette, a cell — and
 * which therefore outrank the grid role. Everything else (`machine`, and the
 * switch a breaker is) is built out of what it does on the bus, because that is
 * what the player has to tell apart across the floor (FLUX_GRID §2.5).
 *
 * The assemblies below are cheap placeholder boxes on the massing of
 * art-src/OBJECT_BRIEFS.md wave 1 — a main at 1.5 world units, a trough at 0.25,
 * a hoist at 1.75 — and a delivered `spriteId` replaces the one it answers with
 * the painted faces at the same massing (`buildPainted`, D.6). The main has
 * landed; the trough and the hoist still stand here.
 */
const KIND_OVER_ROLE: ReadonlySet<MapObjectKind> = new Set<MapObjectKind>([
  "lift",
  "cell",
  "wall",
  "catwalk",
  "turret",
]);

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

/**
 * A map object's assembly plus its powered/destroyed visual state: painted faces
 * on a box where its `spriteId` has delivered art (D.6), the placeholder
 * primitive where it has not.
 */
export class ObjectVisual {
  readonly group = new THREE.Group();
  readonly objectId: string;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly poweredMaterials: THREE.MeshLambertMaterial[] = [];
  private readonly seamMaterials = new Set<THREE.MeshLambertMaterial>();
  private readonly baseColors = new Map<THREE.MeshLambertMaterial, number>();
  /**
   * The painted faces, when this object's `spriteId` has delivered art: which
   * face each material carries, so a state change re-points the maps instead of
   * repainting a colour. Empty on every object still drawn as a primitive.
   */
  private readonly paintedBody: { material: THREE.MeshLambertMaterial; face: ObjectFaceId }[] = [];
  private readonly paintedHalo: { material: THREE.MeshBasicMaterial; face: ObjectFaceId }[] = [];
  private paintedArt: ObjectArtSpec | null = null;
  private paintedState: ObjectPowerState | null = null;
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
    this.refreshPaintedFaces();
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
    this.refreshPaintedFaces();
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
    // §6's 2-frame pulse, on the painted carrier's own light rather than on the
    // whole face: the seam is what breathes, and on a painted box the seam is a
    // mask over the frame, not a mesh beside it.
    for (const { material } of this.paintedBody) {
      if (material.emissiveMap !== null) material.emissiveIntensity = pulse;
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const { material } of this.paintedHalo) material.dispose();
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

  /** A box measured along the run axis first, so a run reads the same either way. */
  private runBox(along: number, height: number, across: number): THREE.BoxGeometry {
    return this.runAxis === "x"
      ? new THREE.BoxGeometry(along, height, across)
      : new THREE.BoxGeometry(across, height, along);
  }

  /** Position from run-axis coordinates: distance along the run, height, offset across. */
  private place(along: number, y: number, across = 0): [number, number, number] {
    return this.runAxis === "x" ? [along, y, across] : [across, y, along];
  }

  private build(view: MapObjectView, footprint: Footprint): void {
    // The map author's word for what a thing *is* outranks both the grid role and
    // the kind, but only where it has been answered with paint. Everything else
    // falls through to the primitive it already had.
    const art = objectArtFor(view.spriteId);
    if (art !== null) {
      this.buildPainted(art, footprint);
      return;
    }
    if (view.gridRole !== null && !KIND_OVER_ROLE.has(view.kind)) {
      this.buildGridRole(view.gridRole, view.tiles.length, footprint);
      return;
    }
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

  /**
   * A delivered object, wearing its painted faces on the primitive massing the
   * placeholder already stood at: one box on the map's footprint, the brief's
   * height, and a face texture per side.
   *
   * Two meshes over one geometry. The first is the object as the player sees it:
   * three `MeshLambertMaterial`s across six slots, each carrying one painting and
   * a `color` that is nothing but §5's face shade, so the paint is the texture's
   * and the shading is the engine's exactly as the shared spec promises the
   * artist. The second exists only in the bloom pass and
   * only to be blurred: `emissiveKeyMaterial` discards every texel that is not one
   * of §2's three bloom-eligible colours, which is how the amber column gets the
   * halo the brief told the artist *not* to paint.
   */
  private buildPainted(art: ObjectArtSpec, footprint: Footprint): void {
    this.paintedArt = art;
    const along = this.runAxis === "x" ? footprint.spanX : footprint.spanZ;
    const across = this.runAxis === "x" ? footprint.spanZ : footprint.spanX;
    // Built long-axis-on-z and turned; see BOX_FACE_SLOTS.
    const geometry = new THREE.BoxGeometry(across, art.heightUnits, along);
    this.geometries.push(geometry);

    const paint = new Map<ObjectFaceId, THREE.MeshLambertMaterial>();
    const halo = new Map<ObjectFaceId, THREE.Material>();
    for (const face of new Set(BOX_FACE_SLOTS)) {
      const texture = objectFaceTexture(art.id, face, "powered");
      const material = new THREE.MeshLambertMaterial({ map: texture });
      // The only thing the body's colour carries is §5's face shade. Everything
      // else the player sees on this box is the delivered painting.
      material.color.setScalar(faceShade(face, this.runAxis));
      this.materials.push(material);
      this.baseColors.set(material, material.color.getHex());
      this.paintedBody.push({ material, face });
      paint.set(face, material);

      const key = emissiveKeyMaterial(texture);
      this.paintedHalo.push({ material: key, face });
      halo.set(face, key);
    }

    const body = new THREE.Mesh(
      geometry,
      BOX_FACE_SLOTS.map((face) => paint.get(face) as THREE.MeshLambertMaterial),
    );
    const glow = new THREE.Mesh(
      geometry,
      BOX_FACE_SLOTS.map((face) => halo.get(face) as THREE.Material),
    );
    markBloomOnly(glow);
    for (const mesh of [body, glow]) {
      mesh.position.set(0, art.heightUnits / 2, 0);
      mesh.rotation.y = boxYaw(this.runAxis);
      this.group.add(mesh);
    }
  }

  /**
   * Re-point every painted face at §6's state table. The amber carrier ramp is
   * the readout, so a state swaps five palette steps and leaves the cast frame
   * alone — identical shapes, dead, which is the whole reason §6 draws the
   * unpowered state as the powered one with the light taken out. The carrier's
   * emissive map goes with it, and is `null` in exactly the states §6 gives no
   * halo, so "no halo, no pulse" is one branch rather than a special case.
   */
  private refreshPaintedFaces(): void {
    if (this.paintedArt === null) return;
    const state: ObjectPowerState = this.view.destroyed
      ? "destroyed"
      : this.overload > 0
        ? "overloading"
        : this.view.powered === true
          ? "powered"
          : "unpowered";
    const changed = state !== this.paintedState;
    this.paintedState = state;
    for (const { material, face } of this.paintedBody) {
      const carrier = objectCarrierTexture(this.paintedArt.id, face, state);
      if (changed) {
        material.map = objectFaceTexture(this.paintedArt.id, face, state);
        material.emissiveMap = carrier;
        material.needsUpdate = true;
      }
      material.emissive.setHex(carrier === null ? 0x000000 : 0xffffff);
      material.emissiveIntensity = carrier === null ? 0 : 1;
    }
    if (!changed) return;
    for (const { material, face } of this.paintedHalo) {
      material.map = objectFaceTexture(this.paintedArt.id, face, state);
      material.needsUpdate = true;
    }
  }

  private buildGridRole(role: GridRole, tileCount: number, footprint: Footprint): void {
    switch (role) {
      case "source":
        this.buildSource(footprint);
        return;
      case "line":
        this.buildLine(footprint);
        return;
      case "breaker":
        this.buildBreaker(tileCount, footprint);
        return;
      case "sink":
        this.buildSink(footprint);
        return;
    }
  }

  /**
   * A main: the heaviest mass in its bay, on a plinth, under a flared cap, with
   * the amber column climbing its full height. Nothing else in the set is
   * allowed that column — it is how a player picks out where the floor's power
   * comes from without hovering anything.
   */
  private buildSource(footprint: Footprint): void {
    const w = footprint.spanX;
    const d = footprint.spanZ;
    const column = 1.1;
    const midY = 0.14 + column / 2;
    this.add(new THREE.BoxGeometry(w * 0.72, 0.14, d * 0.72), this.mat(objectColor.frameDark), 0, 0.07, 0);
    this.add(new THREE.BoxGeometry(w * 0.44, column, d * 0.44), this.mat(objectColor.frame), 0, midY, 0);
    for (const side of [-1, 1] as const) {
      this.add(
        new THREE.BoxGeometry(0.07, column * 0.94, 0.07),
        this.mat(objectColor.unpowered, { powered: true }),
        side * w * 0.24,
        midY,
        0,
      );
    }
    this.add(
      new THREE.CylinderGeometry(Math.min(w, d) * 0.34, w * 0.24, 0.22, 6),
      this.mat(objectColor.frame),
      0,
      0.14 + column + 0.11,
      0,
    );
  }

  /**
   * A run: a channel laid in the floor along its long axis, end-capped, with one
   * filament down the middle that either runs the whole way or does not run at
   * all. The caps are what make `setSevered` read — the parting pulls the span
   * back from both tile edges, and a capped end is a visible end.
   */
  private buildLine(footprint: Footprint): void {
    const along = this.runAxis === "x" ? footprint.spanX : footprint.spanZ;
    const across = this.runAxis === "x" ? footprint.spanZ : footprint.spanX;
    const width = Math.min(0.46, across * 0.62);
    this.add(this.runBox(along * 0.98, 0.08, width), this.mat(objectColor.frameDark), ...this.place(0, 0.04));
    for (const side of [-1, 1] as const) {
      this.add(
        this.runBox(along * 0.98, 0.2, 0.07),
        this.mat(objectColor.frame),
        ...this.place(0, 0.1, side * (width / 2)),
      );
      this.add(
        this.runBox(0.1, 0.24, width * 1.15),
        this.mat(objectColor.frame),
        ...this.place(side * along * 0.47, 0.12),
      );
    }
    this.add(
      this.runBox(along * 0.94, 0.05, width * 0.3),
      this.mat(objectColor.unpowered, { powered: true }),
      ...this.place(0, 0.11),
    );
  }

  /**
   * A board: a cabinet with the copper handles a player can reach — one per tile
   * of its footprint, capped at three, so a two-tile switchboard is not the
   * one-tile gallery tie and a long bank does not become a picket fence.
   * Its only seam is the indicator strip — a breaker carries no column.
   */
  private buildBreaker(tileCount: number, footprint: Footprint): void {
    const w = footprint.spanX;
    const d = footprint.spanZ;
    this.add(new THREE.BoxGeometry(w * 0.66, 0.1, d * 0.66), this.mat(objectColor.frameDark), 0, 0.05, 0);
    this.add(new THREE.BoxGeometry(w * 0.5, 0.56, d * 0.44), this.mat(objectColor.frame), 0, 0.38, 0);
    this.add(
      new THREE.BoxGeometry(w * 0.34, 0.05, d * 0.1),
      this.mat(objectColor.unpowered, { powered: true }),
      0,
      0.69,
      0,
    );
    const levers = Math.min(3, Math.max(1, tileCount));
    for (let index = 0; index < levers; index += 1) {
      const lever = this.add(
        new THREE.BoxGeometry(0.07, 0.4, 0.07),
        this.mat(objectColor.operable),
        ...this.place((index - (levers - 1) / 2) * 0.3, 0.86),
      );
      lever.rotation.x = -0.5;
    }
  }

  /**
   * A driven machine: a portal frame with daylight under the beam and a drum and
   * hook hanging in it. The gap is the silhouette — it is what separates a thing
   * that consumes from the solid mass of the main that feeds it. One indicator
   * seam and no more: a sink does not supply.
   */
  private buildSink(footprint: Footprint): void {
    const along = this.runAxis === "x" ? footprint.spanX : footprint.spanZ;
    const across = this.runAxis === "x" ? footprint.spanZ : footprint.spanX;
    const legs = 1.4;
    this.add(this.runBox(along * 0.86, 0.08, across * 0.8), this.mat(objectColor.frameDark), ...this.place(0, 0.04));
    for (const side of [-1, 1] as const) {
      this.add(
        this.runBox(0.14, legs, 0.14),
        this.mat(objectColor.frame),
        ...this.place(side * along * 0.34, 0.08 + legs / 2),
      );
    }
    this.add(
      this.runBox(along * 0.9, 0.18, across * 0.34),
      this.mat(objectColor.frame),
      ...this.place(0, legs + 0.17),
    );
    const drum = this.add(
      new THREE.CylinderGeometry(0.15, 0.15, across * 0.4, 8),
      this.mat(objectColor.frameDark),
      ...this.place(0, legs - 0.06),
    );
    if (this.runAxis === "x") drum.rotation.x = Math.PI / 2;
    else drum.rotation.z = Math.PI / 2;
    this.add(this.runBox(0.12, 0.34, 0.12), this.mat(objectColor.frameDark), ...this.place(0, legs - 0.4));
    this.add(
      this.runBox(0.12, 0.08, 0.12),
      this.mat(objectColor.unpowered, { powered: true }),
      ...this.place(along * 0.2, legs + 0.3),
    );
  }
}
