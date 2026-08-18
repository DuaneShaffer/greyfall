import { describe, expect, it } from "vitest";
import type { GameMap, MapObject } from "../../src/data/schemas/map.js";
import type { Unit } from "../../src/data/schemas/unit.js";
import { facingToward } from "../../src/data/coords.js";
import { facingYaw, standingHeight } from "../../src/render/board.js";
import {
  blockedTiles,
  buildViewModel,
  cloneViewModel,
  findObjectView,
  findUnitView,
  unitViewFromPlacement,
} from "../../src/render/viewmodel.js";

const lift: MapObject = {
  id: "freight-lift",
  kind: "lift",
  name: "Freight Lift",
  spriteId: "freight-lift",
  tiles: [{ x: 1, y: 0 }],
  blocksMovement: false,
  blocksLos: false,
  surfaceHeight: 3,
  integrity: { destructible: false },
  powered: true,
  operable: null,
};

const crates: MapObject = {
  id: "crate-stack",
  kind: "wall",
  name: "Crate Stack",
  spriteId: "crate-stack",
  tiles: [{ x: 1, y: 1 }],
  blocksMovement: true,
  blocksLos: true,
  integrity: { destructible: true, hp: 30 },
  powered: null,
  operable: null,
};

const map: GameMap = {
  schemaVersion: 1,
  id: "test-map",
  name: "Test Map",
  width: 2,
  depth: 2,
  tiles: [
    { height: 0, terrain: "plain" },
    { height: 1, terrain: "plain" },
    { height: 0, terrain: "rail" },
    { height: 0, terrain: "plain" },
  ],
  objects: [lift, crates],
  deploymentTiles: [{ x: 0, y: 0 }],
  grids: [],
};

const unit: Unit = {
  schemaVersion: 1,
  id: "rowen",
  name: "Rowen Corvane",
  level: 1,
  jobId: "enforcer",
  disposition: { resolve: 72, attunement: 38 },
  learnedAbilityIds: [],
  equipment: {},
};

describe("view-model derivation", () => {
  it("derives elevation from the terrain the unit stands on", () => {
    const view = unitViewFromPlacement(map, {
      unit,
      team: "player",
      position: { x: 0, y: 0 },
      facing: "south",
    });

    expect(view.elevation).toBe(0);
    expect(view.hpFraction).toBe(1);
    expect(view.downed).toBe(false);
    expect(view.team).toBe("player");
    expect(view.jobId).toBe("enforcer");
  });

  it("prefers an object surface over the terrain height", () => {
    expect(standingHeight(map, { x: 1, y: 0 })).toBe(3);
    const view = unitViewFromPlacement(map, {
      unit,
      team: "enemy",
      position: { x: 1, y: 0 },
      facing: "north",
    });

    expect(view.elevation).toBe(3);
  });

  it("treats a zero hp fraction as downed", () => {
    const view = unitViewFromPlacement(map, {
      unit,
      team: "player",
      position: { x: 0, y: 0 },
      facing: "north",
      hpFraction: 0,
    });

    expect(view.downed).toBe(true);
  });

  it("clamps hp fractions into 0..1", () => {
    const high = unitViewFromPlacement(map, {
      unit,
      team: "player",
      position: { x: 0, y: 0 },
      facing: "north",
      hpFraction: 4,
    });

    expect(high.hpFraction).toBe(1);
  });

  it("carries object power and footprint into the view model", () => {
    const viewModel = buildViewModel(map, []);
    const liftView = findObjectView(viewModel, "freight-lift");
    const crateView = findObjectView(viewModel, "crate-stack");

    expect(liftView?.powered).toBe(true);
    expect(liftView?.surfaceHeight).toBe(3);
    expect(liftView?.destroyed).toBe(false);
    expect(crateView?.powered).toBeNull();
    expect(crateView?.tiles).toEqual([{ x: 1, y: 1 }]);
  });

  it("clones deeply so mutating a snapshot cannot leak backwards", () => {
    const viewModel = buildViewModel(map, [
      { unit, team: "player", position: { x: 0, y: 0 }, facing: "north" },
    ]);
    const copy = cloneViewModel(viewModel);
    const copied = findUnitView(copy, "rowen");
    if (!copied) throw new Error("unit missing from clone");
    copied.position.x = 1;
    copied.hpFraction = 0.2;

    expect(findUnitView(viewModel, "rowen")?.position.x).toBe(0);
    expect(findUnitView(viewModel, "rowen")?.hpFraction).toBe(1);
    expect(copy.map).toBe(viewModel.map);
  });

  it("reports movement-blocking footprints", () => {
    expect(blockedTiles(map)).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("facing helpers", () => {
  it("yaws a +Z-facing quad toward each compass facing", () => {
    expect(facingYaw("south")).toBeCloseTo(0);
    expect(facingYaw("east")).toBeCloseTo(Math.PI / 2);
    expect(facingYaw("north")).toBeCloseTo(Math.PI);
    expect(facingYaw("west")).toBeCloseTo(-Math.PI / 2);
  });

  it("derives step facing from tile deltas", () => {
    expect(facingToward({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe("east");
    expect(facingToward({ x: 1, y: 0 }, { x: 0, y: 0 })).toBe("west");
    expect(facingToward({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe("south");
    expect(facingToward({ x: 0, y: 1 }, { x: 0, y: 0 })).toBe("north");
  });
});
