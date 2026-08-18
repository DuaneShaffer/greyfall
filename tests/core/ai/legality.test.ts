/**
 * Aim legality is one function. `applyCommand` refuses by `aimRefusal` and the
 * AI's search offers by it, so an order the search picks is an order the rules
 * accept. These are the two ways the copies had already drifted while the AI
 * kept a hand-rolled gate of its own: it did not ask whether an object-verb had
 * anything to work on, and it measured reach against the tile a machine happens
 * to list first rather than against the machine.
 */

import { describe, expect, it } from "vitest";
import type { Ability, Encounter, GameMap, MapObject, TileCoord, Unit } from "../../../src/data/index.js";
import {
  applyCommand,
  createBattle,
  type Command,
  type ContentLibrary,
  type Deployment,
  type GameState,
} from "../../../src/core/index.js";
import { chooseCommand } from "../../../src/core/ai/index.js";
import { advanceTo } from "../fixtures.js";
import { BENCH_ENCOUNTER_ID, BENCH_MAP_ID, benchContent, benchEncounter, benchMap, benchUnit } from "../gridFixtures.js";

const HAND = "bench-hand";
const CORNER: TileCoord = { x: 0, y: 1 };

/** Radius blast on a machine: an object verb whose payload lands on people. */
const BLAST: Ability = {
  schemaVersion: 1,
  id: "bench-blast",
  name: "Bench Blast",
  description: "Bench: dump the isolator and let the flash carry.",
  jobId: "conduit",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 0, max: 2, vertical: 9 },
    area: { shape: "radius", size: 1, vertical: 9 },
    requiresLos: false,
    validTargets: ["object"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [
    { kind: "setPower", mode: "off" },
    { kind: "damage", damageType: "thermal", amount: { base: "fixed", power: 40 } },
  ],
};

function machine(id: string, tiles: TileCoord[], powered: boolean | null): MapObject {
  return {
    id,
    kind: "machine",
    name: id,
    spriteId: "machine",
    tiles,
    blocksMovement: false,
    blocksLos: false,
    integrity: { destructible: false },
    powered,
    operable: null,
  };
}

function benchWith(objects: MapObject[], foes: TileCoord[]): ContentLibrary {
  const map: GameMap = benchMap();
  const encounter: Encounter = {
    ...benchEncounter(),
    enemies: foes.map((position, index) => ({
      unit: benchUnit(`bench-foe-${index}`, "enforcer"),
      team: "enemy" as const,
      position,
      facing: "north" as const,
    })),
  };
  const base = benchContent();
  return {
    ...base,
    abilities: { ...base.abilities, [BLAST.id]: BLAST },
    maps: { ...base.maps, [BENCH_MAP_ID]: { ...map, objects: [...map.objects, ...objects] } },
    encounters: { ...base.encounters, [BENCH_ENCOUNTER_ID]: encounter },
  };
}

/** The hand in the corner with the blast and nothing else it chose to learn. */
function battle(objects: MapObject[], foes: TileCoord[]): GameState {
  const hand: Unit = { ...benchUnit(HAND), learnedAbilityIds: [BLAST.id] };
  const deployment: Deployment[] = [{ unitId: HAND, position: CORNER, facing: "east" }];
  const start = createBattle(benchWith(objects, foes), BENCH_ENCOUNTER_ID, [hand], deployment);
  return advanceTo(start.state, HAND);
}

function hand(state: GameState) {
  const found = state.units.find((unit) => unit.id === HAND);
  if (found === undefined) throw new Error(`no unit ${HAND}`);
  return found;
}

/** Every command the AI issues for the hand's turn, each one applied for real. */
function playTurn(state: GameState): { state: GameState; commands: Command[] } {
  const commands: Command[] = [];
  let current = state;
  for (let step = 0; step < 6; step += 1) {
    if (current.activeTurn === null || current.activeTurn.unitId !== HAND) break;
    const command = chooseCommand(current);
    commands.push(command);
    const result = applyCommand(current, command);
    expect(result.error).toBeNull();
    current = result.state;
  }
  return { state: current, commands };
}

const actOf = (commands: Command[]): Extract<Command, { kind: "act" }> | undefined =>
  commands.find((command): command is Extract<Command, { kind: "act" }> => command.kind === "act");

describe("the AI aims by the rules the command layer enforces", () => {
  it("passes over the machine its verb has nothing to do to, and takes the one it can work", () => {
    // The drums are not electrical, so the blast's isolator flip has nothing to
    // throw and the whole order is inert on them — however good the flash
    // looks: they cover both foes, the post covers one.
    const state = battle(
      [machine("drum-stack", [{ x: 0, y: 3 }], null), machine("feed-post", [{ x: 1, y: 2 }], true)],
      [{ x: 0, y: 4 }, { x: 1, y: 3 }],
    );

    const refused = applyCommand(state, {
      kind: "act",
      unitId: HAND,
      abilityId: BLAST.id,
      target: { kind: "object", objectId: "drum-stack" },
    });
    expect(refused.error?.code).toBe("invalid-target");

    const played = playTurn(state);
    const act = actOf(played.commands);
    expect(act).toBeDefined();
    expect(act?.target).toEqual({ kind: "object", objectId: "feed-post" });
  });

  it("reaches a machine by the tile that is actually near, not the one listed first", () => {
    // A four-tile run listed from its far end. The near end is two tiles from
    // the corner and the far end is five, and the foes stand at the far end.
    const run = machine(
      "press-run",
      [{ x: 0, y: 6 }, { x: 0, y: 5 }, { x: 0, y: 4 }, { x: 0, y: 3 }],
      true,
    );
    const state = battle([run], [{ x: 1, y: 6 }, { x: 0, y: 7 }]);
    // Kettled, so the corner is the only tile it can shoot from: walking up the
    // run would put the far end in range whichever tile the gate measures.
    hand(state).statuses.push({ statusId: "kettled", turnsRemaining: 2 });
    const before = state.units.filter((unit) => unit.team === "enemy").map((unit) => unit.hp);

    const played = playTurn(state);
    const act = actOf(played.commands);
    expect(act?.target).toEqual({ kind: "object", objectId: "press-run" });
    const after = played.state.units.filter((unit) => unit.team === "enemy").map((unit) => unit.hp);
    expect(after.every((hp, index) => hp < before[index]!)).toBe(true);
  });
});
