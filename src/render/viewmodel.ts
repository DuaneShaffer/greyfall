// The renderer's read-only picture of a battle. It is DERIVED, never
// authoritative: `BattleRenderer.buildScene(viewModel)` can rebuild everything
// from a snapshot at any time (load-game, debug rewind, resize).
//
// `render/adapter.ts` builds it from a `GameState`. Nothing else in
// `src/render` may import core — that adapter is the only crossing.

import type { Facing, Team, TileCoord } from "../data/schemas/common.js";
import type { GameMap, GridRole, MapObject, MapObjectKind } from "../data/schemas/map.js";
import type { Unit } from "../data/schemas/unit.js";
import { standingHeight } from "./grid.js";

export interface UnitView {
  id: string;
  name: string;
  spriteId: string;
  team: Team;
  position: TileCoord;
  /** Height of the surface the unit stands on, in map height units. */
  elevation: number;
  facing: Facing;
  hpFraction: number;
  downed: boolean;
}

export interface MapObjectView {
  id: string;
  kind: MapObjectKind;
  spriteId: string;
  tiles: TileCoord[];
  surfaceHeight: number | null;
  /** What it does on its grid (FLUX_GRID §1.2); null = on no declared grid. */
  gridRole: GridRole | null;
  /** null = the object is not electrical. */
  powered: boolean | null;
  destroyed: boolean;
  /** A cut span. Reversible, unlike `destroyed`, and it must survive a rebuild. */
  severed: boolean;
  /** Carries an `onDestroyed` payload: it overloads before it collapses. */
  volatile: boolean;
}

export interface BattleViewModel {
  map: GameMap;
  units: UnitView[];
  objects: MapObjectView[];
}

/** Minimal placement shape — matches encounter `PlacedUnit` structurally. */
export interface UnitPlacement {
  unit: Unit;
  team: Team;
  position: TileCoord;
  facing: Facing;
  hpFraction?: number;
  downed?: boolean;
}

export const unitViewFromPlacement = (map: GameMap, placement: UnitPlacement): UnitView => ({
  id: placement.unit.id,
  name: placement.unit.name,
  spriteId: placement.unit.spriteId,
  team: placement.team,
  position: { ...placement.position },
  elevation: standingHeight(map, placement.position),
  facing: placement.facing,
  hpFraction: clamp01(placement.hpFraction ?? 1),
  downed: placement.downed ?? (placement.hpFraction !== undefined && placement.hpFraction <= 0),
});

/** The role the authored topology gives this object, without asking core. */
export const gridRoleOf = (map: GameMap, objectId: string): GridRole | null => {
  for (const grid of map.grids) {
    const node = grid.nodes.find((candidate) => candidate.objectId === objectId);
    if (node !== undefined) return node.role;
  }
  return null;
};

export const objectViewFromMapObject = (
  object: MapObject,
  gridRole: GridRole | null = null,
): MapObjectView => ({
  id: object.id,
  kind: object.kind,
  spriteId: object.spriteId,
  tiles: object.tiles.map((tile) => ({ ...tile })),
  surfaceHeight: object.surfaceHeight ?? null,
  gridRole,
  powered: object.powered,
  destroyed: false,
  severed: false,
  volatile: object.onDestroyed !== undefined,
});

export const buildViewModel = (map: GameMap, placements: UnitPlacement[]): BattleViewModel => ({
  map,
  units: placements.map((placement) => unitViewFromPlacement(map, placement)),
  objects: map.objects.map((object) => objectViewFromMapObject(object, gridRoleOf(map, object.id))),
});

export const findUnitView = (viewModel: BattleViewModel, unitId: string): UnitView | undefined =>
  viewModel.units.find((unit) => unit.id === unitId);

export const findObjectView = (
  viewModel: BattleViewModel,
  objectId: string,
): MapObjectView | undefined => viewModel.objects.find((object) => object.id === objectId);

export const cloneViewModel = (viewModel: BattleViewModel): BattleViewModel => ({
  map: viewModel.map,
  units: viewModel.units.map((unit) => ({ ...unit, position: { ...unit.position } })),
  objects: viewModel.objects.map((object) => ({
    ...object,
    tiles: object.tiles.map((tile) => ({ ...tile })),
  })),
});

/** Object footprints a unit cannot share; used to keep placeholder deploys sane. */
export const blockedTiles = (map: GameMap): TileCoord[] =>
  map.objects
    .filter((object) => object.blocksMovement)
    .flatMap((object) => object.tiles.map((tile) => ({ ...tile })));

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
