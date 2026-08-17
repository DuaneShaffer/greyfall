import { describe, expect, it } from "vitest";
import {
  applyCommand,
  canUndoMove,
  createBattle,
  getUnit,
  objectEnergized,
  type BattleEvent,
  type ContentLibrary,
  type GameState,
} from "../../src/core/index.js";
import type { Encounter, GameMap, Tile, Unit } from "../../src/data/index.js";
import { advanceTo, enemyAt, enforcer, loadContent } from "./fixtures.js";

const MAP_ID = "undo-bench";
const ENCOUNTER_ID = "e-undo-bench";

/**
 * A bench for the undo ruling: a mine east of the deployment corner and a
 * scripted beat south of it, so one walk can be made to detonate, spawn, and
 * flip power and another can be made to do nothing at all.
 */
function benchMap(): GameMap {
  const size = 8;
  const tiles: Tile[] = Array.from({ length: size * size }, () => ({ height: 0, terrain: "plain" as const }));
  return {
    schemaVersion: 1,
    id: MAP_ID,
    name: "Undo Bench",
    width: size,
    depth: size,
    tiles,
    grids: [],
    deploymentTiles: [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
    ],
    objects: [
      {
        id: "yard-mine",
        kind: "mine",
        name: "Yard Mine",
        spriteId: "mine",
        tiles: [{ x: 2, y: 0 }],
        blocksMovement: false,
        blocksLos: false,
        integrity: { destructible: true, hp: 1 },
        powered: null,
        operable: null,
        onContact: {
          effects: [{ kind: "damage", damageType: "kinetic", amount: { base: "fixed", power: 400 } }],
        },
      },
      {
        id: "yard-lamp",
        kind: "machine",
        name: "Yard Lamp",
        spriteId: "machine",
        tiles: [{ x: 5, y: 5 }],
        blocksMovement: false,
        blocksLos: false,
        integrity: { destructible: false },
        powered: true,
        operable: null,
      },
    ],
  };
}

const SCRIPTED_BEAT: Encounter["triggers"] = [
  {
    id: "lights-out",
    when: { kind: "unitEntersTiles", tiles: [{ x: 0, y: 2 }] },
    once: true,
    actions: [
      { kind: "dialogue", lines: [{ speaker: "Rowen", text: "Something just tripped." }] },
      { kind: "setPower", objectId: "yard-lamp", powered: false },
    ],
  },
];

function benchContent(): ContentLibrary {
  const base = loadContent();
  const encounter: Encounter = {
    schemaVersion: 1,
    id: ENCOUNTER_ID,
    name: "Undo Bench",
    mapId: MAP_ID,
    rngSeed: 4242,
    maxDeployedUnits: 2,
    enemies: [enemyAt(enforcer("mark", "Mark"), { x: 2, y: 1 }, "north")],
    winConditions: [{ kind: "rout" }],
    lossConditions: [{ kind: "partyRout" }],
    triggers: SCRIPTED_BEAT,
  };
  return {
    ...base,
    maps: { ...base.maps, [MAP_ID]: benchMap() },
    encounters: { ...base.encounters, [ENCOUNTER_ID]: encounter },
  };
}

const PARTY: Unit[] = [enforcer("rowen", "Rowen Corvane"), enforcer("nessa", "Nessa Kiln")];

/** Rowen at the corner with the mine three east and the scripted tile two south. */
function bench(): GameState {
  const state = createBattle(benchContent(), ENCOUNTER_ID, PARTY, [
    { unitId: "rowen", position: { x: 0, y: 0 }, facing: "south" },
    { unitId: "nessa", position: { x: 3, y: 3 }, facing: "south" },
  ]).state;
  return advanceTo(state, "rowen");
}

function move(state: GameState, unitId: string, x: number, y: number) {
  const result = applyCommand(state, { kind: "move", unitId, to: { x, y } });
  expect(result.error).toBeNull();
  return result;
}

function types(events: readonly BattleEvent[]): string[] {
  return events.map((e) => e.type);
}

describe("undoMove", () => {
  it("puts the unit back where it stood, facing where it faced, move unspent", () => {
    const start = bench();
    const before = getUnit(start, "rowen")!;
    expect(canUndoMove(start, "rowen")).toBe(false);

    const walked = move(start, "rowen", 1, 0).state;
    expect(canUndoMove(walked, "rowen")).toBe(true);

    const undone = applyCommand(walked, { kind: "undoMove", unitId: "rowen" });
    expect(undone.error).toBeNull();
    expect(types(undone.events)).toEqual(["UnitMoveUndone"]);
    expect(undone.events[0]).toMatchObject({
      type: "UnitMoveUndone",
      unitId: "rowen",
      from: { x: 1, y: 0 },
      to: { x: 0, y: 0 },
      facing: before.facing,
      revertedConsequences: false,
    });
    const after = getUnit(undone.state, "rowen")!;
    expect(after.position).toEqual(before.position);
    expect(after.facing).toBe(before.facing);
    expect(undone.state.activeTurn).toEqual({ unitId: "rowen", moved: false, acted: false });
    expect(canUndoMove(undone.state, "rowen")).toBe(false);
  });

  it("gives the move back, so the turn can be walked somewhere else", () => {
    const undone = applyCommand(move(bench(), "rowen", 1, 0).state, {
      kind: "undoMove",
      unitId: "rowen",
    }).state;
    const again = move(undone, "rowen", 0, 1);
    expect(getUnit(again.state, "rowen")!.position).toEqual({ x: 0, y: 1 });
  });

  it("is one step deep and closes the moment anything else is spent", () => {
    const start = bench();
    expect(applyCommand(start, { kind: "undoMove", unitId: "rowen" }).error?.code).toBe("nothing-to-undo");

    const walked = move(start, "rowen", 1, 1).state;
    expect(applyCommand(walked, { kind: "undoMove", unitId: "nessa" }).error?.code).toBe("not-active-unit");

    const acted = applyCommand(walked, {
      kind: "act",
      unitId: "rowen",
      abilityId: "basic-attack",
      target: { kind: "unit", unitId: "mark" },
    });
    expect(acted.error).toBeNull();
    expect(applyCommand(acted.state, { kind: "undoMove", unitId: "rowen" }).error?.code).toBe(
      "nothing-to-undo",
    );

    const waited = applyCommand(walked, { kind: "wait", unitId: "rowen", facing: "east" });
    expect(waited.error).toBeNull();
    expect(applyCommand(waited.state, { kind: "undoMove", unitId: "rowen" }).error?.code).toBe(
      "nothing-to-undo",
    );

    const twice = applyCommand(walked, { kind: "undoMove", unitId: "rowen" }).state;
    expect(applyCommand(twice, { kind: "undoMove", unitId: "rowen" }).error?.code).toBe("nothing-to-undo");
  });

  it("takes the scripted beat back with the step that set it off", () => {
    const start = bench();
    const walked = move(start, "rowen", 0, 2);
    expect(types(walked.events)).toContain("TriggerFired");
    expect(types(walked.events)).toContain("DialogueRequested");
    expect(walked.state.firedTriggerIds).toContain("lights-out");
    expect(objectEnergized(walked.state, "yard-lamp")).toBe(false);

    const undone = applyCommand(walked.state, { kind: "undoMove", unitId: "rowen" });
    expect(undone.events[0]).toMatchObject({ revertedConsequences: true });
    expect(undone.state.firedTriggerIds).not.toContain("lights-out");
    expect(objectEnergized(undone.state, "yard-lamp")).toBe(true);
    expect(undone.state.rng).toEqual(start.rng);
  });

  it("un-downs a unit its own walk killed, mine and all", () => {
    const start = bench();
    const walked = move(start, "rowen", 2, 0);
    expect(types(walked.events)).toContain("ObjectTriggered");
    expect(getUnit(walked.state, "rowen")!.downed).toBe(true);
    expect(walked.state.result).toBeNull();
    // The walk cost Rowen the turn, so the clock has moved on without her.
    expect(walked.state.activeTurn?.unitId).not.toBe("rowen");
    expect(canUndoMove(walked.state, "rowen")).toBe(true);

    const undone = applyCommand(walked.state, { kind: "undoMove", unitId: "rowen" });
    expect(undone.error).toBeNull();
    const back = getUnit(undone.state, "rowen")!;
    expect(back.downed).toBe(false);
    expect(back.hp).toBe(getUnit(start, "rowen")!.hp);
    expect(back.position).toEqual({ x: 0, y: 0 });
    expect(undone.state.map.objects.find((o) => o.def.id === "yard-mine")!.destroyed).toBe(false);
    expect(undone.state.activeTurn).toEqual({ unitId: "rowen", moved: false, acted: false });
    expect(undone.state.clock).toBe(start.clock);
    expect(undone.state.turn).toBe(start.turn);
    expect(undone.state.rng).toEqual(start.rng);
  });

  it("re-walking the same path re-rolls it identically", () => {
    const start = bench();
    const first = move(start, "rowen", 2, 0);
    const undone = applyCommand(first.state, { kind: "undoMove", unitId: "rowen" }).state;
    const second = move(undone, "rowen", 2, 0);
    expect(second.events).toEqual(first.events);
    expect({ ...second.state, content: null, moveUndo: null }).toEqual({
      ...first.state,
      content: null,
      moveUndo: null,
    });
  });
});
