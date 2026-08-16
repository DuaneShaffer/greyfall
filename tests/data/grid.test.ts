import { describe, expect, it } from "vitest";
import { Ability, Effect, GameMap, Grid, type MapObject } from "../../src/data/index.js";
import { benchMap } from "../core/gridFixtures.js";

function grid(over: Partial<ReturnType<typeof baseGrid>> = {}) {
  return { ...baseGrid(), ...over };
}

function baseGrid() {
  return {
    id: "g",
    name: "G",
    kind: "flux" as const,
    nodes: [
      { role: "source" as const, objectId: "main", capacity: 10 },
      { role: "line" as const, objectId: "bus" },
      { role: "sink" as const, objectId: "press", draw: 4 },
    ],
    edges: [
      { a: "bus", b: "main" },
      { a: "bus", b: "press" },
    ],
  };
}

describe("the Grid schema", () => {
  it("accepts a well-formed grid", () => {
    expect(() => Grid.parse(baseGrid())).not.toThrow();
  });

  it("reserves `kind` for a second network type that does not exist yet", () => {
    expect(() => Grid.parse(grid({ kind: "steam" as never }))).toThrow();
  });

  it("names each object at most once", () => {
    const nodes = [...baseGrid().nodes, { role: "line" as const, objectId: "bus" }];
    expect(() => Grid.parse(grid({ nodes }))).toThrow();
  });

  it("needs at least one source", () => {
    const nodes = baseGrid().nodes.filter((n) => n.role !== "source");
    expect(() => Grid.parse(grid({ nodes, edges: [{ a: "bus", b: "press" }] }))).toThrow();
  });

  it("rejects self-edges, duplicates, and endpoints that are not nodes", () => {
    expect(() => Grid.parse(grid({ edges: [{ a: "bus", b: "bus" }] }))).toThrow();
    expect(() =>
      Grid.parse(grid({ edges: [...baseGrid().edges, { a: "main", b: "bus" }] })),
    ).toThrow();
    expect(() => Grid.parse(grid({ edges: [{ a: "bus", b: "nowhere" }] }))).toThrow();
  });

  it("caps a grid well above anything an FFT-scale map wants", () => {
    const many = Array.from({ length: 33 }, (_, i) => ({ role: "line" as const, objectId: `n${i}` }));
    expect(() => Grid.parse(grid({ nodes: many, edges: [] }))).toThrow();
    const edges = Array.from({ length: 65 }, (_, i) => ({ a: "bus", b: `x${i}` }));
    expect(() => Grid.parse(grid({ edges }))).toThrow();
  });
});

describe("a map's grids and its network tags", () => {
  it("accepts the bench map", () => {
    expect(() => GameMap.parse(benchMap())).not.toThrow();
  });

  it("defaults `grids` to empty, so every shipped map still validates", () => {
    const { grids: _grids, ...rest } = benchMap();
    const objects = rest.objects.map((o) => {
      const { network: _network, ...bare } = o;
      return bare as MapObject;
    });
    const parsed = GameMap.parse({ ...rest, objects });
    expect(parsed.grids).toEqual([]);
  });

  // The transition rule: `refinery-three` carries tags against a grid nobody has
  // authored, and those stay inert until the map declares one.
  it("leaves an unresolved network tag alone while the map declares no grids", () => {
    const { grids: _grids, ...rest } = benchMap();
    expect(() => GameMap.parse(rest)).not.toThrow();
  });

  it("binds every network tag the moment a grid is declared", () => {
    const map = benchMap();
    const objects = map.objects.map((o) =>
      o.id === "press-east" ? ({ ...o, network: "no-such-grid" } as MapObject) : o,
    );
    expect(() => GameMap.parse({ ...map, objects })).toThrow();
  });

  it("requires a node's object to exist, to be electrical, and to name the grid back", () => {
    const map = benchMap();
    expect(() =>
      GameMap.parse({ ...map, objects: map.objects.filter((o) => o.id !== "press-east") }),
    ).toThrow();
    expect(() =>
      GameMap.parse({
        ...map,
        objects: map.objects.map((o) => (o.id === "press-east" ? { ...o, powered: null } : o)),
      }),
    ).toThrow();
    expect(() =>
      GameMap.parse({
        ...map,
        objects: map.objects.map((o) => {
          if (o.id !== "press-east") return o;
          const { network: _network, ...bare } = o;
          return bare as MapObject;
        }),
      }),
    ).toThrow();
  });

  it("lets an object hold only one grid", () => {
    const map = benchMap();
    const second = {
      ...baseGrid(),
      id: "second-grid",
      nodes: [
        { role: "source" as const, objectId: "press-east", capacity: 4 },
        { role: "line" as const, objectId: "bus" },
      ],
      edges: [{ a: "bus", b: "press-east" }],
    };
    expect(() => GameMap.parse({ ...map, grids: [...map.grids, second] })).toThrow();
  });
});

describe("the new effect primitives and requirements", () => {
  it("parses addLoad and severLine as payload effects", () => {
    expect(() => Effect.parse({ kind: "addLoad", amount: 8, durationTurns: 3 })).not.toThrow();
    expect(() => Effect.parse({ kind: "severLine", mode: "sever" })).not.toThrow();
    expect(() => Effect.parse({ kind: "severLine", mode: "splice" })).not.toThrow();
    expect(() => Effect.parse({ kind: "addLoad", amount: 0, durationTurns: 3 })).toThrow();
    expect(() => Effect.parse({ kind: "severLine", mode: "cut" })).toThrow();
  });

  it("takes the four grid requirements flat, beside the ones already shipped", () => {
    const ability = {
      schemaVersion: 1,
      id: "a",
      name: "A",
      description: "",
      jobId: "conduit",
      standingCost: 0,
      slot: "action",
      targeting: {
        range: { min: 0, max: 4, vertical: 2 },
        area: { shape: "single" },
        requiresLos: false,
        validTargets: ["object"],
      },
      chargeCost: 0,
      castSpeed: null,
      effects: [{ kind: "severLine", mode: "sever" }],
    };
    for (const requirement of ["targetLine", "targetSource", "targetBreaker", "targetEnergized", "targetPowered"]) {
      expect(() => Ability.parse({ ...ability, requires: [requirement] })).not.toThrow();
    }
    expect(() => Ability.parse({ ...ability, requires: ["targetGridRole"] })).toThrow();
  });
});
