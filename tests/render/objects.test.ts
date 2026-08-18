// The grid roles have to be separable across the floor without hovering
// anything (FLUX_GRID §2.5): a main, a run, a board and a driven machine are all
// `kind: "machine"` in the map file and must not share a silhouette.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { OBJECT_ART } from "../../src/art/objects.js";
import { FACE_SHADE } from "../../src/art/palette.js";
import type { GridRole } from "../../src/data/schemas/map.js";
import type { GameMap } from "../../src/data/schemas/map.js";
import { BASE_LAYER, BLOOM_LAYER } from "../../src/render/layers.js";
import { ObjectVisual } from "../../src/render/objects.js";
import { palette } from "../../src/render/palette.js";
import type { MapObjectView } from "../../src/render/viewmodel.js";

const map: GameMap = {
  schemaVersion: 1,
  id: "object-bench",
  name: "Object Bench",
  width: 6,
  depth: 6,
  tiles: Array.from({ length: 36 }, () => ({ height: 0, terrain: "plain" as const })),
  objects: [],
  deploymentTiles: [{ x: 0, y: 0 }],
  grids: [],
};

/** Two tiles running north–south, the footprint every grid object here shares. */
const RUN_Z = [
  { x: 2, y: 2 },
  { x: 2, y: 3 },
];

const view = (overrides: Partial<MapObjectView> = {}): MapObjectView => ({
  id: "node-a",
  kind: "machine",
  spriteId: "machine",
  tiles: RUN_Z,
  surfaceHeight: null,
  gridRole: null,
  powered: true,
  destroyed: false,
  severed: false,
  volatile: false,
  ...overrides,
});

const built = (overrides: Partial<MapObjectView> = {}): ObjectVisual =>
  new ObjectVisual(map, view(overrides));

const meshes = (visual: ObjectVisual): THREE.Mesh[] =>
  visual.group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);

const size = (visual: ObjectVisual): THREE.Vector3 =>
  new THREE.Box3().setFromObject(visual.group).getSize(new THREE.Vector3());

/** What the eye gets across a board: how many parts, how tall, how long. */
const signature = (visual: ObjectVisual): string => {
  const box = size(visual);
  return [meshes(visual).length, box.x.toFixed(2), box.y.toFixed(2), box.z.toFixed(2)].join("/");
};

const lit = (visual: ObjectVisual): boolean =>
  meshes(visual).some(
    (mesh) => (mesh.material as THREE.MeshLambertMaterial).emissive.getHex() === palette.fluxAmber,
  );

const ROLES: readonly GridRole[] = ["source", "line", "sink", "breaker"];

describe("grid roles as primitives", () => {
  it("gives each of the four roles a visibly different assembly", () => {
    const signatures = ROLES.map((gridRole) => signature(built({ gridRole })));
    expect(new Set(signatures).size).toBe(ROLES.length);
  });

  it("stands a source tall over a low run", () => {
    const source = size(built({ gridRole: "source" }));
    const line = size(built({ gridRole: "line" }));
    const breaker = size(built({ gridRole: "breaker" }));
    // A main is the heaviest mass in its bay; a board is about a metre of
    // cabinet; a trough is a lip laid in the floor (OBJECT_BRIEFS wave 1).
    expect(source.y).toBeGreaterThan(breaker.y);
    expect(breaker.y).toBeGreaterThan(line.y * 2);
    expect(line.y).toBeLessThan(0.3);
  });

  it("runs a line along its footprint's long axis", () => {
    const alongZ = size(built({ gridRole: "line" }));
    expect(alongZ.z).toBeGreaterThan(alongZ.x);
    const alongX = size(
      built({
        gridRole: "line",
        tiles: [
          { x: 1, y: 4 },
          { x: 2, y: 4 },
          { x: 3, y: 4 },
        ],
      }),
    );
    expect(alongX.x).toBeGreaterThan(alongX.z);
  });

  it("leaves daylight under a sink's beam and none inside a source", () => {
    const sink = built({ gridRole: "sink" });
    const source = built({ gridRole: "source" });
    const midY = 0.8;
    const spans = (visual: ObjectVisual): number =>
      meshes(visual).filter((mesh) => {
        const box = new THREE.Box3().setFromObject(mesh);
        return box.min.y < midY && box.max.y > midY && box.max.x - box.min.x > 0.3;
      }).length;
    // The gap under the beam is the sink's silhouette: nothing wide crosses the
    // middle of it, where the main is solid.
    expect(spans(sink)).toBe(0);
    expect(spans(source)).toBeGreaterThan(0);
  });

  it("gives a breaker one reachable handle per tile of its footprint", () => {
    const board = meshes(built({ gridRole: "breaker" })).filter((mesh) => mesh.rotation.x !== 0);
    const tie = meshes(built({ gridRole: "breaker", tiles: [{ x: 4, y: 4 }] })).filter(
      (mesh) => mesh.rotation.x !== 0,
    );
    expect(board.length).toBe(2);
    expect(tie.length).toBe(1);
  });

  it("keeps a powered seam on every role, so the emissive states still work", () => {
    for (const gridRole of ROLES) expect(lit(built({ gridRole }))).toBe(true);
    expect(lit(built())).toBe(true);
  });

  it("still parts a severed line, and only along the run", () => {
    const cut = built({ gridRole: "line", severed: true });
    const whole = built({ gridRole: "line" });
    expect(cut.group.scale.z).toBeLessThan(whole.group.scale.z);
    expect(cut.group.scale.x).toBe(whole.group.scale.x);
    expect(cut.group.rotation.y).not.toBe(whole.group.rotation.y);
    // A cut span carries nothing: the filament goes out with it.
    expect(lit(cut)).toBe(false);
    cut.setSevered(false);
    expect(cut.group.rotation.y).toBe(whole.group.rotation.y);
  });
});

describe("kinds that outrank their role", () => {
  it("builds the old primitive for an object on no grid", () => {
    const machine = meshes(built());
    expect(machine.length).toBe(2);
    const lever = meshes(built({ kind: "switch" })).filter((mesh) => mesh.rotation.x !== 0);
    expect(lever.length).toBe(1);
  });

  it("keeps a lift's deck even though the grid calls it a sink", () => {
    const deck = built({ kind: "lift", surfaceHeight: 2, gridRole: "sink" });
    const plain = built({ kind: "lift", surfaceHeight: 2 });
    expect(signature(deck)).toBe(signature(plain));
    expect(size(deck).y).toBeCloseTo(size(plain).y);
  });

  it("keeps a cell a cell", () => {
    expect(signature(built({ kind: "cell", gridRole: "sink" }))).toBe(
      signature(built({ kind: "cell" })),
    );
  });
});

// The legibility bug OBJECT_BRIEFS exists to fix: `data/maps/*.json` authors
// object identity in `spriteId` and nothing in `src/render` read it, so a main
// and a switchboard — the same word in the file — landed on the same primitive.
// A delivered `spriteId` now buys painted faces; an undelivered one changes
// nothing at all.
describe("spriteId with delivered art", () => {
  const MAIN = { spriteId: "flux-main", gridRole: "source" as const };

  const layersOf = (which: number): THREE.Layers => {
    const layers = new THREE.Layers();
    layers.set(which);
    return layers;
  };
  const BASE_ONLY = layersOf(BASE_LAYER);
  const BLOOM_ONLY = layersOf(BLOOM_LAYER);

  /** The object as the player sees it: the mesh the beauty pass draws. */
  const box = (visual: ObjectVisual): THREE.Mesh =>
    meshes(visual).find((mesh) => mesh.layers.test(BASE_ONLY)) as THREE.Mesh;

  const paintOf = (visual: ObjectVisual): THREE.MeshLambertMaterial[] =>
    box(visual).material as unknown as THREE.MeshLambertMaterial[];

  it("dresses a main's box instead of assembling the placeholder", () => {
    const painted = built(MAIN);
    const placeholder = built({ gridRole: "source" });
    // Two meshes over one box: the object, and the bloom pass's halo key.
    expect(meshes(painted)).toHaveLength(2);
    expect(meshes(placeholder).length).toBeGreaterThan(2);
  });

  it("stands it at the brief's height on the map's footprint", () => {
    const box3 = size(built(MAIN));
    expect(box3.y).toBeCloseTo(OBJECT_ART["flux-main"].heightUnits, 5);
    // RUN_Z is two tiles north-south, so the long axis is z.
    expect(box3.z).toBeCloseTo(2, 5);
    expect(box3.x).toBeCloseTo(1, 5);
    // Still taller than the boards it has to be told apart from.
    expect(box3.y).toBeGreaterThan(size(built({ gridRole: "breaker" })).y);
  });

  it("puts the right painting in each of the box's six slots", () => {
    const materials = paintOf(built(MAIN));
    expect(materials).toHaveLength(6);
    const sizes = materials.map((m) => {
      const texture = m.map as THREE.DataTexture;
      return [texture.image.width, texture.image.height];
    });
    const long = [64, 48];
    const end = [32, 48];
    const top = [32, 64];
    // three's slot order is +x, -x, +y, -y, +z, -z, and the box is built with the
    // long axis on local z.
    expect(sizes).toEqual([long, long, top, top, end, end]);
  });

  it("gates painted faces on alpha so a transparent texel becomes a hole", () => {
    const visual = built(MAIN);
    for (const material of paintOf(visual)) expect(material.alphaTest).toBe(0.5);
    const halo = meshes(visual).find((mesh) => mesh.layers.test(BLOOM_ONLY)) as THREE.Mesh;
    const keys = halo.material as unknown as THREE.MeshBasicMaterial[];
    for (const key of keys) expect(key.alphaTest).toBe(0.5);
  });

  it("turns the mesh, not the paint, for an east-west main", () => {
    const alongZ = built(MAIN);
    const alongX = built({
      ...MAIN,
      tiles: [
        { x: 1, y: 4 },
        { x: 2, y: 4 },
      ],
    });
    expect(box(alongZ).rotation.y).toBe(0);
    expect(box(alongX).rotation.y).toBeCloseTo(Math.PI / 2, 5);
    const turned = size(alongX);
    expect(turned.x).toBeCloseTo(2, 5);
    expect(turned.z).toBeCloseTo(1, 5);
    // The top cell lands on the same slot at both orientations, so the paint is
    // the same three textures either way.
    expect(paintOf(alongX).map((m) => m.map)).toEqual(paintOf(alongZ).map((m) => m.map));
  });

  it("shades the faces the engine's way, and warns the artist by doing it", () => {
    const alongZ = paintOf(built(MAIN)).map((m) => m.color.getHex());
    const alongX = paintOf(
      built({
        ...MAIN,
        tiles: [
          { x: 1, y: 4 },
          { x: 2, y: 4 },
        ],
      }),
    ).map((m) => m.color.getHex());
    const grey = (factor: number) => new THREE.Color().setScalar(factor).getHex();
    // Long face on ±x when the run is north-south: east/west, 62%.
    expect(alongZ[0]).toBe(grey(FACE_SHADE.sideEastWest));
    expect(alongZ[4]).toBe(grey(FACE_SHADE.sideNorthSouth));
    expect(alongZ[2]).toBe(grey(FACE_SHADE.top));
    // Turn the main and the same painting is shown at the other side shade —
    // exactly what the brief warns the artist to keep its value range mid for.
    expect(alongX[0]).toBe(grey(FACE_SHADE.sideNorthSouth));
    expect(alongX[4]).toBe(grey(FACE_SHADE.sideEastWest));
  });

  it("shares one texture per face and state across every main on the board", () => {
    const a = paintOf(built(MAIN));
    const b = paintOf(built({ ...MAIN, id: "node-b" }));
    for (let i = 0; i < a.length; i += 1) expect(a[i]?.map).toBe(b[i]?.map);
    // Materials are per object: the collapse ramp mutates their colour.
    expect(a[0]).not.toBe(b[0]);
  });

  it("swaps the carrier column to the dead grey when the main goes out", () => {
    const visual = built(MAIN);
    const live = paintOf(visual).map((m) => m.map);
    visual.setPowered(false);
    const dead = paintOf(visual).map((m) => m.map);
    expect(dead).not.toEqual(live);
    visual.setPowered(true);
    expect(paintOf(visual).map((m) => m.map)).toEqual(live);
  });

  it("moves the readout to the overload ramp and then to rubble", () => {
    const visual = built(MAIN);
    const live = paintOf(visual).map((m) => m.map);
    visual.setOverload(0.5);
    const straining = paintOf(visual).map((m) => m.map);
    expect(straining).not.toEqual(live);
    visual.setDestroyed(true);
    expect(paintOf(visual).map((m) => m.map)).not.toEqual(straining);
    // The wreck still collapses: the paint is a state, not a replacement for one.
    expect(size(visual).y).toBeLessThan(OBJECT_ART["flux-main"].heightUnits);
  });

  it("keeps the halo out of the beauty pass and the body out of the bloom pass", () => {
    const all = meshes(built(MAIN));
    const halo = all.filter((mesh) => mesh.layers.test(BLOOM_ONLY));
    expect(halo).toHaveLength(1);
    expect(halo[0]?.layers.test(BASE_ONLY)).toBe(false);
    expect(box(built(MAIN)).layers.test(BLOOM_ONLY)).toBe(false);
    // The brief tells the artist to paint no glow and no halo; the halo key is the
    // engine's half of that bargain, keyed on the three colours §2 lets it bloom.
    const keys = halo[0]?.material as unknown as THREE.MeshBasicMaterial[];
    expect(keys).toHaveLength(6);
    for (const key of keys) expect(key.map).not.toBeNull();
  });

  it("leaves every spriteId without art on the primitive it already had", () => {
    for (const spriteId of ["switch-board", "gantry-grate", "hydraulic-press", "machine"]) {
      const named = built({ spriteId, gridRole: "source" });
      const anonymous = built({ gridRole: "source" });
      expect(signature(named), spriteId).toBe(signature(anonymous));
    }
  });
});
