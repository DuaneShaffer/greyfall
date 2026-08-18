import { describe, expect, it } from "vitest";
import type { GameMap } from "../../src/data/schemas/map.js";
import type { Facing, TileCoord } from "../../src/data/schemas/common.js";
import { snapAnimation, walkAnimation, type Walker } from "../../src/render/scene.js";
import type { UnitView } from "../../src/render/viewmodel.js";

const flatMap = (size = 8): GameMap => ({
  schemaVersion: 1,
  id: "walk-test",
  name: "Walk Test",
  width: size,
  depth: size,
  tiles: Array.from({ length: size * size }, () => ({ height: 0, terrain: "plain" as const })),
  objects: [],
  deploymentTiles: [{ x: 0, y: 0 }],
  grids: [],
});

const unitView = (team: UnitView["team"], position: TileCoord): UnitView => ({
  id: "rowen",
  name: "Rowen Corvane",
  jobId: "railrunner",
  team,
  position: { ...position },
  elevation: 0,
  facing: "north",
  hpFraction: 1,
  downed: false,
});

interface Spy extends Walker {
  positions: [number, number, number][];
  facings: Facing[];
  walked: number;
  rested: number;
}

const spyWalker = (): Spy => ({
  positions: [],
  facings: [],
  walked: 0,
  rested: 0,
  setWorldPosition(x, y, z) {
    this.positions.push([x, y, z]);
  },
  setFacing(facing) {
    this.facings.push(facing);
  },
  playWalk() {
    this.walked += 1;
  },
  rest() {
    this.rested += 1;
  },
});

/** Play an animation frame by frame the way `PresentationQueue` does. */
const play = (animation: { duration: number; update(t: number): void; finish(): void }): void => {
  const frames = 12;
  for (let i = 0; i <= frames; i += 1) animation.update((animation.duration * i) / frames);
  animation.finish();
};

describe("walk animation", () => {
  it("plays a move onto the unit's own tile as an idle beat, then settles", () => {
    const map = flatMap();
    const view = unitView("player", { x: 4, y: 1 });
    const walker = spyWalker();

    const animation = walkAnimation(map, [{ x: 4, y: 1 }], "east", walker, view);

    expect(animation).not.toBeNull();
    expect(animation!.duration).toBeGreaterThan(0);
    expect(() => play(animation!)).not.toThrow();
    expect(walker.walked).toBe(0);
    expect(walker.rested).toBe(1);
    expect(view.position).toEqual({ x: 4, y: 1 });
    expect(view.facing).toBe("east");
  });

  it("declines an empty path", () => {
    expect(walkAnimation(flatMap(), [], "east", spyWalker(), unitView("player", { x: 0, y: 0 }))).toBeNull();
  });

  it("walks a multi-tile path and lands on the last tile", () => {
    const map = flatMap();
    const view = unitView("player", { x: 0, y: 0 });
    const walker = spyWalker();
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];

    const animation = walkAnimation(map, path, "east", walker, view);

    expect(() => play(animation!)).not.toThrow();
    expect(walker.walked).toBeGreaterThan(0);
    expect(view.position).toEqual({ x: 2, y: 0 });
    expect(view.facing).toBe("east");
  });

  it("walks enemies faster than the player and caps the longest march", () => {
    const map = flatMap(16);
    const path = Array.from({ length: 4 }, (_, x) => ({ x, y: 0 }));
    const long = Array.from({ length: 12 }, (_, x) => ({ x, y: 0 }));

    const player = walkAnimation(map, path, "east", spyWalker(), unitView("player", path[0]!))!;
    const enemy = walkAnimation(map, path, "east", spyWalker(), unitView("enemy", path[0]!))!;
    const march = walkAnimation(map, long, "east", spyWalker(), unitView("player", long[0]!))!;

    expect(enemy.duration).toBeLessThan(player.duration);
    expect(march.duration).toBeLessThanOrEqual(1);
  });
});

// The undo's presentation (COMBAT_RULES §10b): a rolled-back walk did not
// happen, so there is no step to play and nowhere to interpolate from.
describe("undo snap", () => {
  const raised = (): GameMap => {
    const map = flatMap();
    map.tiles[1 + 3 * 8] = { height: 2, terrain: "plain" };
    return map;
  };

  it("stands the unit on the tile at once, snapshot and all", () => {
    const map = raised();
    const view = unitView("player", { x: 4, y: 4 });
    const walker = spyWalker();

    const animation = snapAnimation(map, { x: 1, y: 3 }, "west", walker, view);

    expect(animation.duration).toBe(0);
    animation.finish();
    expect(walker.walked).toBe(0);
    expect(walker.rested).toBe(1);
    expect(walker.facings).toEqual(["west"]);
    expect(view.position).toEqual({ x: 1, y: 3 });
    expect(view.facing).toBe("west");
    // The snapshot carries the height too: the move preview measures its offset
    // off this record, so a stale one hangs the next preview in the air.
    expect(view.elevation).toBe(2);
  });

  it("is skip-safe and idempotent, like every other event", () => {
    const map = flatMap();
    const view = unitView("player", { x: 0, y: 0 });
    const walker = spyWalker();

    const animation = snapAnimation(map, { x: 2, y: 2 }, "south", walker, view);
    animation.update(0);
    animation.finish();
    animation.finish();

    expect(view.position).toEqual({ x: 2, y: 2 });
    expect(new Set(walker.positions.map((p) => p.join(",")))).toHaveLength(1);
  });
});
