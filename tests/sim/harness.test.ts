import { describe, expect, it } from "vitest";
import { Encounter, GameMap, type Tile } from "../../src/data/index.js";
import { simContent } from "../../src/sim/content.js";
import { runBattle, type BattleRecord } from "../../src/sim/harness.js";
import { arenaMap, arenaMatchup, buildMatchup, jobUnit, mapMatchup } from "../../src/sim/matchup.js";

const { library } = simContent();

function withoutTiming(record: BattleRecord): Omit<BattleRecord, "elapsedMs"> {
  const { elapsedMs: _elapsed, ...rest } = record;
  return rest;
}

/** A 12x12 arena cut in half by an impassable band: neither side can ever reach the other. */
function splitArena(): GameMap {
  const size = 12;
  const tiles: Tile[] = Array.from({ length: size * size }, (_, i) => ({
    height: 0,
    terrain: Math.floor(i / size) === 5 ? ("impassable" as const) : ("plain" as const),
  }));
  return {
    schemaVersion: 1,
    id: "sim-split",
    name: "Split Arena",
    width: size,
    depth: size,
    tiles,
    objects: [],
    deploymentTiles: [{ x: 5, y: 9 }],
  };
}

describe("sim harness", () => {
  it("is deterministic: the same seed reproduces the record", () => {
    const matchup = arenaMatchup(
      library,
      "det-enforcer-saboteur",
      [jobUnit(library, "enforcer", 2, "sim-a-enforcer-0")],
      [jobUnit(library, "saboteur", 2, "sim-b-saboteur-0")],
    );
    const first = runBattle(library, { kind: "matchup", matchup }, 4242);
    const second = runBattle(library, { kind: "matchup", matchup }, 4242);
    expect(withoutTiming(second)).toEqual(withoutTiming(first));
    expect(first.commands).toBeGreaterThan(0);
  });

  it("a different seed can change the battle", () => {
    const matchup = arenaMatchup(
      library,
      "seed-chemist-machinist",
      [jobUnit(library, "chemist", 1, "sim-a-chemist-0")],
      [jobUnit(library, "machinist", 1, "sim-b-machinist-0")],
    );
    const records = [1, 2, 3, 4, 5, 6].map((seed) => runBattle(library, { kind: "matchup", matchup }, seed));
    const shapes = new Set(records.map((r) => `${r.outcome}:${r.turns}:${r.commands}`));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("caps commands and reports a stalemate when neither side can reach the other", () => {
    const map = splitArena();
    const player = [jobUnit(library, "enforcer", 1, "sim-a-enforcer-0", { fullKit: false, passives: false })];
    const enemy = [jobUnit(library, "enforcer", 1, "sim-b-enforcer-0", { fullKit: false, passives: false })];
    const matchup = buildMatchup(
      library,
      "sim-split-duel",
      map,
      { units: player, positions: [{ x: 5, y: 9 }], facing: "north" },
      { units: enemy, positions: [{ x: 5, y: 1 }], facing: "south" },
    );
    const record = runBattle(library, { kind: "matchup", matchup }, 1, { commandCap: 60 });
    expect(record.capped).toBe(true);
    expect(record.outcome).toBe("stalemate");
    expect(record.winner).toBe("none");
    expect(record.commands).toBe(60);
    expect(record.firstDownTurn).toBeNull();
  });

  it("the cap is a hard ceiling on an ordinary battle too", () => {
    const matchup = arenaMatchup(
      library,
      "cap-enforcer-enforcer",
      [jobUnit(library, "enforcer", 1, "sim-a-enforcer-0")],
      [jobUnit(library, "enforcer", 1, "sim-b-enforcer-0")],
    );
    const record = runBattle(library, { kind: "matchup", matchup }, 9, { commandCap: 3 });
    expect(record.commands).toBe(3);
    expect(record.outcome).toBe("stalemate");
  });

  it("built matchups validate against the content schemas", () => {
    const jobs = ["enforcer", "conduit", "chemist", "machinist", "saboteur", "railrunner", "augmented"];
    expect(() => GameMap.parse(arenaMap())).not.toThrow();
    for (const job of jobs) {
      const arena = arenaMatchup(
        library,
        `schema-${job}`,
        [jobUnit(library, job, 3, `sim-a-${job}-0`)],
        [jobUnit(library, "enforcer", 3, "sim-b-enforcer-0")],
        { turnLimit: 40 },
      );
      expect(() => Encounter.parse(arena.encounter)).not.toThrow();
      expect(() => GameMap.parse(arena.map)).not.toThrow();
      expect(arena.deployment.every((d) => arena.map.deploymentTiles.some((t) => t.x === d.position.x && t.y === d.position.y))).toBe(true);
    }
    const yard = library.maps["marshaling-yard"]!;
    const real = mapMatchup(
      library,
      "schema-yard",
      yard,
      [jobUnit(library, "enforcer", 1, "sim-a-enforcer-0")],
      [jobUnit(library, "saboteur", 1, "sim-b-saboteur-0")],
    );
    expect(() => Encounter.parse(real.encounter)).not.toThrow();
    for (const placed of real.encounter.enemies) {
      expect(placed.position.x).toBeLessThan(yard.width);
      expect(placed.position.y).toBeLessThan(yard.depth);
    }
  });

  it("runs an authored encounter end to end", () => {
    const encounterId = Object.keys(library.encounters).sort()[0];
    expect(encounterId).toBeDefined();
    const encounter = library.encounters[encounterId!]!;
    const map = library.maps[encounter.mapId]!;
    const party = [simContent().units["rowen"]!];
    const record = runBattle(
      library,
      {
        kind: "encounter",
        encounterId: encounterId!,
        party,
        deployment: [{ unitId: "rowen", position: { ...map.deploymentTiles[0]! } }],
      },
      77,
      { commandCap: 400 },
    );
    expect(["win", "loss", "stalemate"]).toContain(record.outcome);
    expect(record.encounterId).toBe(encounterId);
    expect(record.units.length).toBeGreaterThanOrEqual(2);
  });
});
