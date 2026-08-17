// The grid roles have to be separable across the floor without hovering
// anything (FLUX_GRID §2.5): a main, a run, a board and a driven machine are all
// `kind: "machine"` in the map file and must not share a silhouette.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { GridRole } from "../../src/data/schemas/map.js";
import type { GameMap } from "../../src/data/schemas/map.js";
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
