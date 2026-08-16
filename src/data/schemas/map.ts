import { z } from "zod";
import { AutoAttack, ContactPayload, Effect } from "./effect.js";
import { Id, SchemaVersion, TileCoord } from "./common.js";

export const TerrainType = z.enum(["plain", "rail", "rough", "water", "impassable", "void"]);
export type TerrainType = z.infer<typeof TerrainType>;

export const Tile = z.object({
  height: z.int().nonnegative(),
  terrain: TerrainType,
});
export type Tile = z.infer<typeof Tile>;

export const MapObjectKind = z.enum([
  "machine",
  "cell",
  "switch",
  "wall",
  "catwalk",
  "lift",
  "turret",
  "mine",
  "drone",
]);
export type MapObjectKind = z.infer<typeof MapObjectKind>;

export const MapObject = z.object({
  id: Id,
  kind: MapObjectKind,
  name: z.string(),
  spriteId: Id,
  tiles: z.array(TileCoord).min(1),
  blocksMovement: z.boolean(),
  blocksLos: z.boolean(),
  // Catwalks/lifts: height of the standable surface they provide.
  surfaceHeight: z.int().nonnegative().optional(),
  integrity: z.discriminatedUnion("destructible", [
    z.object({ destructible: z.literal(true), hp: z.int().positive() }),
    z.object({ destructible: z.literal(false) }),
  ]),
  // null = not electrical. Under a grid this is the node's own isolator —
  // "this node's switch is closed" — and energization is derived from the graph.
  powered: z.boolean().nullable(),
  // The grid this object is a node of. Inert on a map that declares no grids;
  // binding as soon as one does.
  network: Id.optional(),
  // Operable: effects fired when a unit activates it (adjacency + action).
  // requiresPower gates activation on `powered`.
  operable: z
    .object({
      requiresPower: z.boolean(),
      targetObjectIds: z.array(Id),
      targetTiles: z.array(TileCoord),
      effects: z.array(Effect).min(1),
    })
    .nullable(),
  onDestroyed: z
    .object({
      targetTiles: z.array(TileCoord),
      effects: z.array(Effect),
    })
    .optional(),
  // Fires when a unit enters the footprint (mines). Never for the owning team.
  onContact: ContactPayload.optional(),
  // Fires at the nearest enemy of the owning team on its own CT clock (turrets,
  // drones). Object-sourced, so it has no caster.
  autoAttack: AutoAttack.optional(),
});
export type MapObject = z.infer<typeof MapObject>;

/**
 * One node of a grid. Nodes name objects, never tiles: everything physically
 * attackable is a node, so an edge carries no state of its own and a cable run
 * that can be cut is authored as a `line` object with hit points.
 */
export const GridNode = z.discriminatedUnion("role", [
  z.object({ role: z.literal("source"), objectId: Id, capacity: z.int().positive() }),
  z.object({ role: z.literal("sink"), objectId: Id, draw: z.int().nonnegative() }),
  z.object({ role: z.literal("line"), objectId: Id }),
  z.object({ role: z.literal("breaker"), objectId: Id }),
]);
export type GridNode = z.infer<typeof GridNode>;
export type GridRole = GridNode["role"];

/** Undirected. Stored with `a < b` so the pair has one spelling. */
export const GridEdge = z.object({ a: Id, b: Id });
export type GridEdge = z.infer<typeof GridEdge>;

const gridEdgeKey = (e: GridEdge): string => (e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`);

/**
 * A named graph declared beside the object list. Edges are authored rather than
 * derived from footprint adjacency, so deleting an unrelated wall cannot
 * silently rewire the floor.
 */
export const Grid = z
  .object({
    id: Id,
    name: z.string(),
    // Reserved so a steam/pressure network can join the union later without a
    // second graph implementation. Nothing reads it.
    kind: z.literal("flux"),
    nodes: z.array(GridNode).min(1).max(32),
    edges: z.array(GridEdge).max(64),
  })
  .refine((g) => new Set(g.nodes.map((n) => n.objectId)).size === g.nodes.length, {
    message: "a grid names each object at most once",
  })
  .refine((g) => g.nodes.some((n) => n.role === "source"), {
    message: "a grid needs at least one source",
  })
  .refine((g) => g.edges.every((e) => e.a !== e.b), { message: "no self-edges" })
  .refine((g) => new Set(g.edges.map(gridEdgeKey)).size === g.edges.length, {
    message: "no duplicate edges",
  })
  .refine(
    (g) => {
      const declared = new Set(g.nodes.map((n) => n.objectId));
      return g.edges.every((e) => declared.has(e.a) && declared.has(e.b));
    },
    { message: "every edge endpoint must be a declared node" },
  );
export type Grid = z.infer<typeof Grid>;

/**
 * A map's grids and the `network` tags on its objects must agree, but only once
 * the map declares a grid at all: `refinery-three` carries tags against a grid
 * nobody has authored yet and those stay inert (`docs/design/FLUX_GRID.md` §1.6).
 */
function gridsResolve(m: { objects: MapObject[]; grids: Grid[] }): boolean {
  if (m.grids.length === 0) return true;
  if (new Set(m.grids.map((g) => g.id)).size !== m.grids.length) return false;
  const byObject = new Map<string, string>();
  for (const grid of m.grids) {
    for (const node of grid.nodes) {
      if (byObject.has(node.objectId)) return false;
      byObject.set(node.objectId, grid.id);
    }
  }
  const objects = new Map(m.objects.map((o) => [o.id, o]));
  for (const [objectId, gridId] of byObject) {
    const object = objects.get(objectId);
    if (object === undefined || object.powered === null) return false;
    if (object.network !== gridId) return false;
  }
  for (const object of m.objects) {
    if (object.network === undefined) continue;
    if (byObject.get(object.id) !== object.network) return false;
  }
  return true;
}

export const GameMap = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    name: z.string(),
    width: z.int().positive().max(32),
    depth: z.int().positive().max(32),
    // Row-major, length must equal width * depth.
    tiles: z.array(Tile),
    objects: z.array(MapObject),
    deploymentTiles: z.array(TileCoord).min(1),
    grids: z.array(Grid).default([]),
  })
  .refine((m) => m.tiles.length === m.width * m.depth, {
    message: "tiles length must equal width * depth",
  })
  .refine(gridsResolve, {
    message: "every grid node and every network tag must name the other",
  });
export type GameMap = z.infer<typeof GameMap>;
