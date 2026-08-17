// Aiming at machinery, against the shipped map that has multi-tile machinery on
// it. Two ways an order could be offered and then refused with nothing spent:
// the overlay lighting a tile the command layer judges by a different one, and
// an order offered against something it has no way of touching.

import { describe, expect, it } from "vitest";
import {
  aimTarget,
  applyCommand,
  createBattle,
  legalTargetTiles,
  type ContentLibrary,
  type GameState,
} from "../../src/core/index.js";
import type { Ability, TileCoord } from "../../src/data/index.js";
import { advanceTo, loadContent, loadUnits } from "./fixtures.js";

const ENCOUNTER_ID = "s1-meter-house";
const HAND = "rowen";

/** Throw the Breaker's shape, at a reach that makes the tile choice matter. */
const SHORT_THROW: Ability = {
  schemaVersion: 1,
  id: "test-throw",
  name: "Test Throw",
  description: "Bench: one tile of reach, one isolator.",
  jobId: "conduit",
  standingCost: 0,
  slot: "action",
  targeting: {
    range: { min: 1, max: 1, vertical: 3 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["object"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [{ kind: "setPower", mode: "toggle" }],
};

function content(): ContentLibrary {
  const base = loadContent();
  return { ...base, abilities: { ...base.abilities, [SHORT_THROW.id]: SHORT_THROW } };
}

/** A battle with the hand standing exactly where the test wants it. */
function standing(at: TileCoord): GameState {
  const unit = loadUnits()[HAND]!;
  const armed = { ...unit, learnedAbilityIds: [...unit.learnedAbilityIds, SHORT_THROW.id] };
  const map = content().maps["meter-house"]!;
  const start = createBattle(content(), ENCOUNTER_ID, [armed], [
    { unitId: HAND, position: { ...map.deploymentTiles[0]! }, facing: "north" },
  ]);
  const state = advanceTo(start.state, HAND);
  state.units.find((u) => u.id === HAND)!.position = { ...at };
  return state;
}

const throwAt = (state: GameState, objectId: string) =>
  applyCommand(state, {
    kind: "act",
    unitId: HAND,
    abilityId: SHORT_THROW.id,
    target: { kind: "object", objectId },
  });

const lit = (state: GameState): TileCoord[] => legalTargetTiles(state, HAND, SHORT_THROW.id);

// `west-feeder` covers (2,8) and (3,8) and lists (2,8) first.
describe("a multi-tile object answers on any of its own tiles", () => {
  it("lights the tile it is reached through, and commits through it", () => {
    // Beside the far end only: the tile the object lists first is two away.
    const state = standing({ x: 3, y: 7 });
    expect(lit(state)).toContainEqual({ x: 3, y: 8 });
    expect(aimTarget(state, HAND, SHORT_THROW.id, { x: 3, y: 8 })).toEqual({
      kind: "object",
      objectId: "west-feeder",
    });
    const sent = throwAt(state, "west-feeder");
    expect(sent.error).toBeNull();
  });

  it("still refuses an object no tile of which is in reach", () => {
    const state = standing({ x: 8, y: 12 });
    expect(throwAt(state, "west-feeder").error?.code).toBe("out-of-range");
  });
});

// `drum-stack-west` is a stack of drums: `powered: null`, on no grid, with
// nothing an isolator could be thrown on.
describe("an order with nothing to work on is not offered and not accepted", () => {
  it("leaves an electrically inert object out of the legal targets", () => {
    const state = standing({ x: 3, y: 10 });
    expect(lit(state)).not.toContainEqual({ x: 3, y: 11 });
    expect(aimTarget(state, HAND, SHORT_THROW.id, { x: 3, y: 11 })).toBeNull();
  });

  it("refuses it with a reason, spending neither the action nor the charge", () => {
    const state = standing({ x: 3, y: 10 });
    const refused = throwAt(state, "drum-stack-west");
    expect(refused.error?.code).toBe("invalid-target");
    expect(refused.state.activeTurn?.acted).not.toBe(true);
  });

  it("still offers the machinery it can actually throw", () => {
    const state = standing({ x: 3, y: 10 });
    expect(aimTarget(state, HAND, SHORT_THROW.id, { x: 4, y: 9 })).toEqual({
      kind: "object",
      objectId: "west-board",
    });
  });
});
