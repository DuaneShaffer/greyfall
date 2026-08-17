// The VFX half of the core seam: actor threading, damage-type threading, and
// the ordering that puts the attacker's swing ahead of the target's recoil.

import { describe, expect, it } from "vitest";
import {
  BASIC_ATTACK_ID,
  applyCommand,
  createBattle,
  unitMaxHp,
  type BattleEvent,
  type GameState,
} from "../../src/core/index.js";
import { toRenderEventList, toRenderEvents, viewModelFromGameState } from "../../src/render/adapter.js";
import { ObjectVisual } from "../../src/render/objects.js";
import { advanceTo, loadContent, rowen } from "../core/fixtures.js";
import {
  BENCH_ENCOUNTER_ID,
  BENCH_GRID_ID,
  benchContent,
  benchUnit,
} from "../core/gridFixtures.js";
import { openBattle, VALE } from "../app/fixtures.js";

const battle = (): GameState => openBattle([rowen(), VALE]).state;

const HAND = "bench-hand";

/** A battle on the grid bench, so grid events land against a declared grid. */
const benchState = (): GameState => {
  const start = createBattle(benchContent(), BENCH_ENCOUNTER_ID, [benchUnit(HAND)], [
    { unitId: HAND, position: { x: 4, y: 0 }, facing: "north" },
  ]);
  return advanceTo(start.state, HAND);
};

const act = (state: GameState, abilityId: string, objectId: string): GameState => {
  const result = applyCommand(state, {
    kind: "act",
    unitId: HAND,
    abilityId,
    target: { kind: "object", objectId },
  });
  expect(result.error).toBeNull();
  return result.state;
};

const attack: BattleEvent = {
  type: "AbilityUsed",
  unitId: "rowen",
  abilityId: BASIC_ATTACK_ID,
  target: { kind: "unit", unitId: "provocateur-a" },
  tiles: [{ x: 4, y: 0 }],
};

describe("actor threading", () => {
  const state = battle();

  it("plays a weapon ability as an attack swing", () => {
    expect(toRenderEvents(attack, state)).toEqual([
      { kind: "unitActed", unitId: "rowen", pose: "attack" },
    ]);
  });

  it("plays an item as a cast: a compound is applied, not swung", () => {
    expect(
      toRenderEvents(
        {
          type: "AbilityUsed",
          unitId: "rowen",
          abilityId: "item:coagulant-vial",
          target: { kind: "unit", unitId: "vale" },
          tiles: [{ x: 1, y: 4 }],
        },
        state,
      ),
    ).toEqual([{ kind: "unitActed", unitId: "rowen", pose: "cast" }]);
  });

  it("leaves ItemUsed to the AbilityUsed that follows it", () => {
    expect(
      toRenderEvents(
        { type: "ItemUsed", unitId: "rowen", itemId: "coagulant-vial", team: "player", remaining: 1 },
        state,
      ),
    ).toEqual([]);
  });

  it("plays a charged ability's resolution as a cast release", () => {
    expect(
      toRenderEvents(
        {
          type: "AbilityUsed",
          unitId: "vale",
          abilityId: "ground",
          target: { kind: "object", objectId: "yard-cell" },
          tiles: [{ x: 1, y: 1 }],
        },
        state,
      ),
    ).toEqual([{ kind: "unitActed", unitId: "vale", pose: "cast" }]);
  });

  it("parks a charge in the hold loop and releases it if it is cancelled", () => {
    expect(
      toRenderEvents(
        {
          type: "AbilityCharging",
          unitId: "vale",
          abilityId: "ground",
          target: { kind: "tile", tile: { x: 1, y: 1 } },
          chargeId: "charge-1",
          castSpeed: 60,
        },
        state,
      ),
    ).toEqual([{ kind: "unitActed", unitId: "vale", pose: "castHold" }]);
    expect(
      toRenderEvents(
        {
          type: "AbilityChargeCancelled",
          unitId: "vale",
          abilityId: "ground",
          chargeId: "charge-1",
        },
        state,
      ),
    ).toEqual([{ kind: "unitActed", unitId: "vale", pose: "rest" }]);
  });

  it("swings before the target recoils", () => {
    const max = unitMaxHp(state, "provocateur-a") ?? 0;
    const events = toRenderEventList(
      [
        attack,
        {
          type: "DamageDealt",
          unitId: "provocateur-a",
          sourceUnitId: "rowen",
          amount: 7,
          damageType: "kinetic",
          hpRemaining: max - 7,
        },
      ],
      state,
    );
    expect(events.map((event) => event.kind)).toEqual(["unitActed", "unitHit"]);
  });

  it("swings the reactor too", () => {
    expect(
      toRenderEvents(
        {
          type: "ReactionTriggered",
          unitId: "rowen",
          abilityId: "hold-the-line",
          againstUnitId: "provocateur-a",
        },
        state,
      ),
    ).toEqual([{ kind: "unitActed", unitId: "rowen", pose: "attack" }]);
  });

  it("names the target and the source of a miss", () => {
    expect(
      toRenderEvents(
        {
          type: "AbilityMissed",
          unitId: "rowen",
          abilityId: BASIC_ATTACK_ID,
          targetUnitId: "provocateur-a",
        },
        state,
      ),
    ).toEqual([{ kind: "unitMissed", unitId: "provocateur-a", sourceUnitId: "rowen" }]);
  });
});

describe("damage-type threading", () => {
  const state = battle();

  it("carries the damage type and the source onto the hit", () => {
    const max = unitMaxHp(state, "rowen") ?? 0;
    expect(
      toRenderEvents(
        {
          type: "DamageDealt",
          unitId: "rowen",
          sourceUnitId: null,
          amount: 24,
          damageType: "thermal",
          hpRemaining: max - 24,
        },
        state,
      ),
    ).toEqual([
      {
        kind: "unitHit",
        unitId: "rowen",
        amount: 24,
        hpFractionAfter: (max - 24) / max,
        damageType: "thermal",
        sourceUnitId: null,
      },
    ]);
  });

  it("makes a heal a typeless negative hit", () => {
    const max = unitMaxHp(state, "rowen") ?? 0;
    expect(
      toRenderEvents(
        { type: "Healed", unitId: "rowen", sourceUnitId: "vale", amount: 6, hpRemaining: max },
        state,
      ),
    ).toEqual([
      {
        kind: "unitHit",
        unitId: "rowen",
        amount: -6,
        hpFractionAfter: 1,
        damageType: null,
        sourceUnitId: "vale",
      },
    ]);
  });

  it("gives machinery the world's own impact language", () => {
    expect(
      toRenderEvents(
        {
          type: "ObjectDamaged",
          objectId: "crate-stack",
          sourceUnitId: "rowen",
          amount: 12,
          hpRemaining: 18,
        },
        state,
      ),
    ).toEqual([{ kind: "objectHit", objectId: "crate-stack", amount: 12, damageType: "kinetic" }]);
  });
});

describe("beats that used to be scene rebuilds", () => {
  const state = battle();

  it("animates a scripted removal", () => {
    expect(toRenderEvents({ type: "UnitRemoved", unitId: "provocateur-b" }, state)).toEqual([
      { kind: "unitRemoved", unitId: "provocateur-b" },
    ]);
  });

  it("animates a deployable going off under a unit", () => {
    expect(
      toRenderEvents({ type: "ObjectTriggered", objectId: "yard-cell", unitId: "rowen" }, state),
    ).toEqual([{ kind: "objectTriggered", objectId: "yard-cell", unitId: "rowen" }]);
  });

  it("animates machinery firing, hit or miss", () => {
    for (const hit of [true, false]) {
      expect(
        toRenderEvents(
          { type: "ObjectAttacked", objectId: "yard-turret", targetUnitId: "rowen", hit },
          state,
        ),
      ).toEqual([
        { kind: "objectAttacked", objectId: "yard-turret", targetUnitId: "rowen", hit },
      ]);
    }
  });

  /**
   * The undo's two answers (COMBAT_RULES §10b). The flag is the whole decision:
   * a walk that set nothing off is a sprite put back, and one that set something
   * off is beyond any RenderEvent, so this stays silent and `src/app` rebuilds
   * the scene from state.
   */
  it("puts a bare undone walk back with a snap and no travel", () => {
    expect(
      toRenderEvents(
        {
          type: "UnitMoveUndone",
          unitId: "rowen",
          from: { x: 0, y: 3 },
          to: { x: 0, y: 4 },
          facing: "north",
          revertedConsequences: false,
        },
        state,
      ),
    ).toEqual([{ kind: "unitSnapped", unitId: "rowen", tile: { x: 0, y: 4 }, facing: "north" }]);
  });

  it("animates nothing when the undo took back more than the walk", () => {
    expect(
      toRenderEvents(
        {
          type: "UnitMoveUndone",
          unitId: "rowen",
          from: { x: 0, y: 3 },
          to: { x: 0, y: 4 },
          facing: "north",
          revertedConsequences: true,
        },
        state,
      ),
    ).toEqual([]);
  });

  it("is idempotent and terminal-state complete", () => {
    const events: BattleEvent[] = [
      attack,
      {
        type: "DamageDealt",
        unitId: "rowen",
        sourceUnitId: "provocateur-a",
        amount: 5,
        damageType: "arc",
        hpRemaining: 10,
      },
      { type: "UnitRemoved", unitId: "provocateur-b" },
      { type: "ObjectAttacked", objectId: "yard-turret", targetUnitId: "rowen", hit: true },
    ];
    const first = toRenderEventList(events, state);
    expect(first).toEqual(toRenderEventList(events, state));
    for (const event of first) {
      if (event.kind === "unitHit") expect(event.hpFractionAfter).toBeTypeOf("number");
    }
  });
});

// The network-level half of §5.4's pair: what happened to the bus, never a
// second pass over the per-object lights the `PowerChanged` batch owns.
describe("the grid's own events", () => {
  const state = battle();

  it("carries every one of them to the renderer's own vocabulary", () => {
    const events: BattleEvent[] = [
      { type: "GridChanged", gridId: BENCH_GRID_ID, capacity: 22, load: 10, liveNodes: [], tripped: false },
      { type: "GridTripped", gridId: BENCH_GRID_ID, capacity: 12, load: 14 },
      { type: "GridReset", gridId: BENCH_GRID_ID, nodeId: "west-main", unitId: HAND },
      { type: "LineSevered", objectId: "north-bus", unitId: HAND },
      { type: "LineSpliced", objectId: "north-bus", unitId: HAND },
      { type: "LoadAttached", gridId: BENCH_GRID_ID, nodeId: "west-bus", amount: 8, turns: 3, unitId: HAND },
    ];
    expect(toRenderEventList(events, benchState()).map((event) => event.kind)).toEqual([
      "gridChanged",
      "gridTripped",
      "gridReset",
      "lineSevered",
      "lineSpliced",
      "loadAttached",
    ]);
  });

  // The load is off the runtime before the event is emitted, so its node is
  // unknowable here; the `GridChanged` beside it carries the bus relaxing.
  it("leaves a load expiring to the GridChanged beside it", () => {
    expect(toRenderEvents({ type: "LoadExpired", loadId: "load-1" }, state)).toEqual([]);
  });

  // Strain belongs to a component and never to a grid: the numbers on the
  // event are the whole network's, and the seams must read the bus each node is
  // actually standing on.
  it("paints each bus at its own strain, off the state rather than the event", () => {
    const painted = (grid: GameState): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const event of toRenderEvents(
        { type: "GridChanged", gridId: BENCH_GRID_ID, capacity: 0, load: 0, liveNodes: [], tripped: false },
        grid,
      )) {
        if (event.kind !== "gridChanged") continue;
        for (const nodeId of event.nodeIds) out[nodeId] = event.strain;
      }
      return out;
    };
    // At rest both halves are quiet: 6 of 12 and 4 of 10.
    expect(painted(benchState())).toMatchObject({ "west-main": 0, "east-main": 0 });
    // Overdrawn, the west half is past its rating and the east half is not.
    const blown = act(benchState(), "bench-overdraw", "west-bus");
    expect(painted(blown)).toMatchObject({ "west-main": 1, "west-bus": 1, "east-main": 0 });
    // And a half with nothing feeding it is not straining, it is dead.
    const dark = act(benchState(), "bench-isolate", "west-main");
    expect(painted(dark)).toMatchObject({ "north-bus": 0, "press-west": 0 });
  });

  /**
   * The cut used to live only in the animation that made it, so every rebuild
   * (`src/app/controller.ts` rebuilds the scene from state on a spawn, and
   * load-game and resize do the same) put the span back together. It lives on
   * the grid runtime, so the snapshot has to carry it.
   */
  it("carries a cut span through the snapshot the scene rebuilds from", () => {
    const content = loadContent();
    const hand = rowen();
    const tile = content.maps["meter-house"]!.deploymentTiles[0]!;
    const grid = createBattle(content, "s1-meter-house", [hand], [
      { unitId: hand.id, position: { ...tile }, facing: "north" },
    ]).state;

    expect(viewModelFromGameState(grid).objects.filter((o) => o.severed)).toEqual([]);
    grid.grids[0]!.nodes.find((node) => node.objectId === "gallery-run")!.severed = true;

    const view = viewModelFromGameState(grid);
    expect(view.objects.filter((o) => o.severed).map((o) => o.id)).toEqual(["gallery-run"]);
    // And what the cut took dark is dark in the snapshot too: the renderer's lit
    // state is energization, not the isolator each of those objects still holds.
    const dark = view.objects.filter((o) => o.powered === false).map((o) => o.id);
    // The gallery tie is normally open, so it starts dark and stays dark.
    expect(dark).toEqual(["gallery-run", "gallery-tie", "meter-lift", "west-lamps"]);

    // And the rebuilt visual reads cut rather than whole, without any event.
    const run = view.objects.find((o) => o.id === "gallery-run")!;
    const cut = new ObjectVisual(view.map, run);
    const whole = new ObjectVisual(view.map, { ...run, severed: false });
    expect(cut.group.scale.z).toBeLessThan(whole.group.scale.z);
    expect(cut.group.rotation.y).not.toBe(whole.group.rotation.y);
    cut.dispose();
    whole.dispose();
  });

  it("still animates the power flip a cause is attached to", () => {
    expect(
      toRenderEvents(
        {
          type: "PowerChanged",
          objectId: "freight-lift",
          powered: false,
          cause: { gridId: "g", nodeId: "main", reason: "tripped" },
        },
        state,
      ),
    ).toEqual([{ kind: "objectPowerChanged", objectId: "freight-lift", powered: false }]);
  });
});
