import { z } from "zod";
import { Effect } from "./effect.js";
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
  // null = not electrical. Post-slice, `network` groups objects into grids.
  powered: z.boolean().nullable(),
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
});
export type MapObject = z.infer<typeof MapObject>;

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
  })
  .refine((m) => m.tiles.length === m.width * m.depth, {
    message: "tiles length must equal width * depth",
  });
export type GameMap = z.infer<typeof GameMap>;
