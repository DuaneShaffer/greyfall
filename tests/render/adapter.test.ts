// The VFX half of the core seam: actor threading, damage-type threading, and
// the ordering that puts the attacker's swing ahead of the target's recoil.

import { describe, expect, it } from "vitest";
import { BASIC_ATTACK_ID, unitMaxHp, type BattleEvent, type GameState } from "../../src/core/index.js";
import { toRenderEventList, toRenderEvents } from "../../src/render/adapter.js";
import { rowen } from "../core/fixtures.js";
import { openBattle, VALE } from "../app/fixtures.js";

const battle = (): GameState => openBattle([rowen(), VALE]).state;

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

// Phase A ships the grid's events without their presentation: the per-object
// `PowerChanged` batch beside them is what the renderer plays, and the register
// and annunciator that read the rest belong to `src/ui`.
describe("the grid's own events", () => {
  const state = battle();

  it("passes through without an animation and without throwing", () => {
    const events: BattleEvent[] = [
      { type: "GridChanged", gridId: "g", capacity: 12, load: 14, liveNodes: ["a"], tripped: true },
      { type: "GridTripped", gridId: "g", capacity: 12, load: 14 },
      { type: "GridReset", gridId: "g", nodeId: "main", unitId: "rowen" },
      { type: "LineSevered", objectId: "bus", unitId: "rowen" },
      { type: "LineSpliced", objectId: "bus", unitId: "rowen" },
      { type: "LoadAttached", gridId: "g", nodeId: "bus", amount: 8, turns: 3, unitId: "rowen" },
      { type: "LoadExpired", loadId: "load-1" },
    ];
    expect(toRenderEventList(events, state)).toEqual([]);
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
