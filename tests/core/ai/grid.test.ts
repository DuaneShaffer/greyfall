/**
 * The value function on a graph (`docs/design/FLUX_GRID.md` §4.5). Everything
 * here is scored against the grid bench, because no shipped map declares a grid
 * — which is also what the last case proves: on an ungridded map every new term
 * is exactly zero and the old arithmetic comes back untouched.
 */

import { describe, expect, it } from "vitest";
import type { Encounter, GameMap, TileCoord } from "../../../src/data/index.js";
import { createBattle, type ContentLibrary, type Deployment, type GameState } from "../../../src/core/index.js";
import { WEIGHTS, buildContext, type AiContext } from "../../../src/core/ai/index.js";
import { GRID_AFFINITY_BONUS } from "../../../src/core/ai/weights.js";
import { abilityValue } from "../../../src/core/ai/score.js";
import { getAbility } from "../../../src/core/state/content.js";
import type { ActionAbility, TargetRef } from "../../../src/core/state/types.js";
import { advanceTo } from "../fixtures.js";
import { BENCH_ENCOUNTER_ID, BENCH_MAP_ID, benchContent, benchEncounter, benchMap, benchUnit } from "../gridFixtures.js";

const HAND = "bench-hand";
const MATE = "bench-mate";
const FOE = "bench-foe";

const DECK: TileCoord = { x: 3, y: 2 };
const CORNER: TileCoord = { x: 0, y: 1 };
const NEAR_PRESS: TileCoord = { x: 4, y: 0 };

interface BenchOptions {
  /** Close the normally-open gallery tie, bringing the second main onto the bus. */
  tieClosed?: boolean;
  /** Open the west main's isolator, so the west branch has no feed of its own. */
  westMainOpen?: boolean;
  /** Strip the grid declaration; the `network` tags stay and go inert (§1.6). */
  ungridded?: boolean;
  /** Give the mains hit points, so a source can be killed rather than opened. */
  breakableMains?: boolean;
  foeAt?: TileCoord;
}

function benchWith(options: BenchOptions): ContentLibrary {
  const map: GameMap = benchMap();
  const mains = options.breakableMains === true;
  const objects = map.objects.map((object) => {
    const integrity = mains && object.id.endsWith("-main") ? { destructible: true as const, hp: 10 } : object.integrity;
    if (object.id === "gallery-tie") return { ...object, integrity, powered: options.tieClosed === true };
    if (object.id === "west-main") return { ...object, integrity, powered: options.westMainOpen !== true };
    return { ...object, integrity };
  });
  const encounter: Encounter = {
    ...benchEncounter(),
    maxDeployedUnits: 2,
    enemies: [
      {
        unit: benchUnit(FOE, "enforcer"),
        team: "enemy",
        position: options.foeAt ?? { x: 8, y: 5 },
        facing: "west",
      },
    ],
  };
  const base = benchContent();
  return {
    ...base,
    maps: {
      ...base.maps,
      [BENCH_MAP_ID]: {
        ...map,
        objects,
        deploymentTiles: [CORNER, DECK, NEAR_PRESS],
        grids: options.ungridded === true ? [] : map.grids,
      },
    },
    encounters: { ...base.encounters, [BENCH_ENCOUNTER_ID]: encounter },
  };
}

function battle(options: BenchOptions, deployment: readonly Deployment[]): GameState {
  const party = deployment.map((placement) => benchUnit(placement.unitId));
  const start = createBattle(benchWith(options), BENCH_ENCOUNTER_ID, party, deployment);
  return advanceTo(start.state, HAND);
}

/** The hand alone in the corner; the deck stands empty. */
function alone(options: BenchOptions = {}): GameState {
  return battle(options, [{ unitId: HAND, position: CORNER, facing: "east" }]);
}

/** The hand in the corner with a friend parked on the lift deck. */
function withMateOnDeck(options: BenchOptions = {}): GameState {
  return battle(options, [
    { unitId: HAND, position: CORNER, facing: "east" },
    { unitId: MATE, position: DECK, facing: "east" },
  ]);
}

function contextOf(state: GameState): AiContext {
  const actor = state.units.find((unit) => unit.id === HAND)!;
  return buildContext(state, actor, WEIGHTS);
}

function ability(state: GameState, id: string): ActionAbility {
  const actor = state.units.find((unit) => unit.id === HAND)!;
  const found = getAbility(state, actor, id);
  if (found === undefined || found.slot !== "action") throw new Error(`no action ability ${id}`);
  return found;
}

const at = (objectId: string): TargetRef => ({ kind: "object", objectId });

/** One (ability, node) pair scored from where the hand is standing. */
function score(state: GameState, abilityId: string, objectId: string, ctx = contextOf(state)): number {
  return abilityValue(ctx, state, ability(state, abilityId), at(objectId));
}

/** Latch a source open. However it got there, a reclose is the only way back. */
function latch(state: GameState, objectId: string): GameState {
  const node = state.grids[0]?.nodes.find((n) => n.objectId === objectId);
  if (node === undefined) throw new Error(`no node ${objectId}`);
  node.tripped = true;
  return state;
}

describe("grid valuation", () => {
  it("prefers the cut that actually darkens something over one the tie covers", () => {
    // Tie closed: the bus carries 10 against 22, so severing the west feeder
    // leaves every machine lit off the east main.
    const state = alone({ tieClosed: true, foeAt: DECK });
    const ctx = contextOf(state);

    const covered = score(state, "bench-cut", "west-bus", ctx);
    const real = score(state, "bench-cut", "north-bus", ctx);

    expect(covered).toBe(0);
    expect(real).toBeGreaterThan(0);
    expect(real).toBeGreaterThan(covered);
  });

  it("prices a source kill by what it takes down with it, not by the source", () => {
    // With the tie closed the east main carries the whole bus at 10 of 10, so
    // killing the west main darkens nothing and is worth nothing.
    const redundant = alone({ breakableMains: true, tieClosed: true, foeAt: DECK });
    const sole = alone({ breakableMains: true, tieClosed: false, foeAt: DECK });

    expect(score(redundant, "bench-demolish", "west-main")).toBe(0);
    expect(score(sole, "bench-demolish", "west-main")).toBeGreaterThan(0);
  });

  it("values a splice, a tie-close and a reclose when our own side is dark", () => {
    const spliceable = withMateOnDeck();
    const severed = spliceable.grids[0]!.nodes.find((n) => n.objectId === "north-bus")!;
    severed.severed = true;
    expect(score(spliceable, "bench-splice", "north-bus")).toBeGreaterThan(0);

    // The west branch has lost its own feed; closing the gallery tie brings the
    // east main onto it and the deck back up under the friend standing on it.
    const tieable = withMateOnDeck({ westMainOpen: true });
    expect(score(tieable, "bench-cross-tie", "gallery-tie")).toBeGreaterThan(0);

    const latched = latch(withMateOnDeck(), "west-main");
    expect(score(latched, "bench-reclose", "west-main")).toBeGreaterThan(0);
  });

  it("scores an overdraw that trips the component well above one that does not", () => {
    const noHeadroom = alone({ tieClosed: false });
    const spare = alone({ tieClosed: true });

    const trips = score(noHeadroom, "bench-overdraw", "lift-deck");
    const absorbed = score(spare, "bench-overdraw", "lift-deck");

    expect(trips).toBeGreaterThan(0);
    expect(absorbed).toBe(0);
  });

  it("prices blacking out a deck an ally is standing on as a loss", () => {
    const state = withMateOnDeck();
    expect(score(state, "bench-isolate", "lift-deck")).toBeLessThan(0);
    expect(score(state, "bench-cut", "north-bus")).toBeLessThan(0);
  });

  it("runs one hypothetical per (ability, node) however many tiles ask", () => {
    const state = alone({ tieClosed: false });
    const ctx = contextOf(state);
    const cut = ability(state, "bench-cut");

    const first = abilityValue(ctx, state, cut, at("north-bus"));
    const elsewhere: GameState = {
      ...state,
      units: state.units.map((unit) => (unit.id === HAND ? { ...unit, position: { x: 5, y: 5 } } : unit)),
    };
    const second = abilityValue(ctx, elsewhere, cut, at("north-bus"));

    expect(second).toBe(first);
    expect(ctx.gridMemo.size).toBe(1);
  });

  it("is exactly zero on a map that declares no grid", () => {
    const state = withMateOnDeck({ ungridded: true });
    const ctx = contextOf(state);

    // The kit carries cutters and an overdraw, so the affinity is on — and it
    // still buys nothing, because every grid term is zero without a graph.
    expect(ctx.profile.gridPercent).toBe(100 + GRID_AFFINITY_BONUS);

    expect(score(state, "bench-cut", "north-bus", ctx)).toBe(0);
    expect(score(state, "bench-splice", "north-bus", ctx)).toBe(0);
    expect(score(state, "bench-overdraw", "lift-deck", ctx)).toBe(0);
    expect(ctx.gridMemo.size).toBe(0);

    // The one power term that survives is the pre-grid one: a deck dropping out
    // from under a friend, priced at `deckPoint` and nothing else.
    expect(score(state, "bench-isolate", "lift-deck", ctx)).toBe(
      Math.floor((-WEIGHTS.deckPoint * ctx.profile.objectPercent) / 100),
    );
  });
});
