// THE CORE SEAM. The only module in `src/render` that imports `src/core`.
//
// Two directions cross here:
//   - `viewModelFromGameState` snapshots a battle into the renderer's derived
//     `BattleViewModel`, so the scene can be rebuilt from state at any time.
//   - `toRenderEvents` translates core's rule-level facts into the renderer's
//     presentation-shaped `RenderEvent`s. Per the contract at the top of
//     `presentation.ts`, every emitted event carries its terminal state, is
//     idempotent, and is safe to skip straight to the end.
//
// `stateAfter` is the state the command settled into, so events read their
// terminal values (hp fractions, facings) from it rather than from a
// mid-batch snapshot.

import {
  abilityInfo,
  allObjects,
  allUnits,
  battleMap,
  getUnit,
  itemIdFromAbilityId,
  objectEnergized,
  objectSevered,
  standHeight,
  unitMaxHp,
  type BattleEvent,
  type BattleUnit,
  type GameState,
  type ObjectRuntime,
} from "../core/index.js";
import type { DamageType, Facing, TileCoord } from "../data/schemas/common.js";
import { facingBetween } from "./grid.js";
import type { ActorPose, RenderEvent } from "./presentation.js";
import type { BattleViewModel, MapObjectView, UnitView } from "./viewmodel.js";

const hpFractionOf = (state: GameState, unit: BattleUnit): number => {
  const max = unitMaxHp(state, unit.id) ?? 0;
  if (max <= 0) return unit.downed ? 0 : 1;
  return Math.min(1, Math.max(0, unit.hp / max));
};

const unitViewOf = (state: GameState, unit: BattleUnit): UnitView => ({
  id: unit.id,
  name: unit.unit.name,
  spriteId: unit.unit.spriteId,
  team: unit.team,
  position: { ...unit.position },
  elevation: standHeight(state, unit.position),
  facing: unit.facing,
  hpFraction: hpFractionOf(state, unit),
  downed: unit.downed,
});

const objectViewOf = (state: GameState, object: ObjectRuntime): MapObjectView => ({
  id: object.def.id,
  kind: object.def.kind,
  spriteId: object.def.spriteId,
  tiles: object.def.tiles.map((tile) => ({ ...tile })),
  surfaceHeight: object.def.surfaceHeight ?? null,
  // The renderer's lit state is energization, not the isolator flag
  // (`docs/design/FLUX_GRID.md` §1.3) — otherwise a rebuild relights a bus the
  // `PowerChanged` batch had just taken dark.
  powered: object.powered === null ? null : objectEnergized(state, object.def.id),
  destroyed: object.destroyed,
  severed: objectSevered(state, object.def.id),
  volatile: object.def.onDestroyed !== undefined,
});

/** A renderer snapshot of the whole battle. Derived; never authoritative. */
export function viewModelFromGameState(state: GameState): BattleViewModel {
  return {
    map: battleMap(state),
    units: allUnits(state).map((unit) => unitViewOf(state, unit)),
    objects: allObjects(state).map((object) => objectViewOf(state, object)),
  };
}

const facingAfterPath = (path: readonly TileCoord[], fallback: Facing): Facing => {
  const to = path[path.length - 1];
  const from = path[path.length - 2];
  if (to === undefined || from === undefined) return fallback;
  return facingBetween(from, to);
};

const hitEvent = (
  state: GameState,
  unitId: string,
  amount: number,
  hpRemaining: number,
  damageType: DamageType | null,
  sourceUnitId: string | null,
): RenderEvent[] => {
  const unit = getUnit(state, unitId);
  const max = unit === null ? 0 : (unitMaxHp(state, unitId) ?? 0);
  const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, hpRemaining / max));
  return [{ kind: "unitHit", unitId, amount, hpFractionAfter: fraction, damageType, sourceUnitId }];
};

/** Every node of a grid, in object-id order, so an event carries its own scope. */
const gridNodeIds = (state: GameState, gridId: string): string[] => {
  const grid = battleMap(state).grids.find((candidate) => candidate.id === gridId);
  return grid === undefined ? [] : grid.nodes.map((node) => node.objectId).sort();
};

/**
 * How hard the bus is being worked, on the register's own three steps: at rest,
 * at its rating from 90%, and past it. Integer arithmetic, because the grid
 * never touches the `Amount` pipeline and the seams must not drift off the
 * LOAD line the player is reading.
 */
const strainOf = (load: number, capacity: number): number => {
  if (capacity <= 0) return load > 0 ? 1 : 0;
  if (load > capacity) return 1;
  return load * 10 >= capacity * 9 ? 0.6 : 0;
};

/**
 * Charged abilities announce themselves with `AbilityCharging`, so an
 * `AbilityUsed` naming one is the release, not the wind-up. An item is applied
 * rather than swung, so it borrows the cast pose whatever it does.
 */
const poseFor = (state: GameState, unitId: string, abilityId: string): ActorPose => {
  if (itemIdFromAbilityId(abilityId) !== null) return "cast";
  const ability = abilityInfo(state, unitId, abilityId);
  if (ability !== null && ability.slot === "action" && ability.castSpeed !== null) return "cast";
  return "attack";
};

/**
 * Core event -> renderer presentation. Events with no visual (`StandingAwarded`,
 * `TriggerFired`, bookkeeping) map to []. `DialogueRequested` deliberately does
 * NOT map here: dialogue is UI, and `src/app` routes it to the dialogue box.
 */
export function toRenderEvents(event: BattleEvent, stateAfter: GameState): RenderEvent[] {
  switch (event.type) {
    case "TurnStarted": {
      const unit = getUnit(stateAfter, event.unitId);
      return unit === null ? [] : [{ kind: "cameraFocused", tile: { ...unit.position } }];
    }
    case "UnitMoved": {
      const unit = getUnit(stateAfter, event.unitId);
      const path = event.path.map((tile) => ({ ...tile }));
      if (path.length === 0) return [];
      return [
        {
          kind: "unitMoved",
          unitId: event.unitId,
          path,
          facing: facingAfterPath(path, unit?.facing ?? "north"),
        },
      ];
    }
    case "UnitForcedMove": {
      const unit = getUnit(stateAfter, event.unitId);
      return [
        {
          kind: "unitMoved",
          unitId: event.unitId,
          path: [{ ...event.from }, { ...event.to }],
          facing: unit?.facing ?? facingBetween(event.from, event.to),
        },
      ];
    }
    case "UnitFacingChanged":
      return [{ kind: "unitFaced", unitId: event.unitId, facing: event.facing }];
    case "AbilityUsed":
      return [
        {
          kind: "unitActed",
          unitId: event.unitId,
          pose: poseFor(stateAfter, event.unitId, event.abilityId),
        },
      ];
    // A reaction is an action with a different reason: the reactor swings too.
    case "ReactionTriggered":
      return [
        {
          kind: "unitActed",
          unitId: event.unitId,
          pose: poseFor(stateAfter, event.unitId, event.abilityId),
        },
      ];
    case "AbilityCharging":
      return [{ kind: "unitActed", unitId: event.unitId, pose: "castHold" }];
    case "AbilityChargeCancelled":
      return [{ kind: "unitActed", unitId: event.unitId, pose: "rest" }];
    case "AbilityMissed":
      return [
        { kind: "unitMissed", unitId: event.targetUnitId, sourceUnitId: event.unitId },
      ];
    case "DamageDealt":
      return hitEvent(
        stateAfter,
        event.unitId,
        event.amount,
        event.hpRemaining,
        event.damageType,
        event.sourceUnitId,
      );
    // A heal is a negative hit: it drains the bar upward, carries no damage
    // type, and reuses the same terminal-state contract.
    case "Healed":
      return hitEvent(stateAfter, event.unitId, -event.amount, event.hpRemaining, null, event.sourceUnitId);
    case "UnitDowned":
      return [{ kind: "unitDowned", unitId: event.unitId }];
    case "UnitRemoved":
      return [{ kind: "unitRemoved", unitId: event.unitId }];
    case "PowerChanged":
      return [{ kind: "objectPowerChanged", objectId: event.objectId, powered: event.powered }];
    // The network-level half of §5.4's pair. The per-object `PowerChanged`
    // batch answers "what do I animate"; these answer "what happened to the
    // bus", and they never re-animate the per-object lights.
    case "GridChanged":
      return [
        {
          kind: "gridChanged",
          gridId: event.gridId,
          nodeIds: gridNodeIds(stateAfter, event.gridId),
          strain: strainOf(event.load, event.capacity),
        },
      ];
    case "GridTripped":
      return [
        {
          kind: "gridTripped",
          gridId: event.gridId,
          nodeIds: gridNodeIds(stateAfter, event.gridId),
          capacity: event.capacity,
          load: event.load,
        },
      ];
    case "GridReset":
      return [{ kind: "gridReset", gridId: event.gridId, nodeId: event.nodeId }];
    case "LineSevered":
      return [{ kind: "lineSevered", objectId: event.objectId }];
    case "LineSpliced":
      return [{ kind: "lineSpliced", objectId: event.objectId }];
    case "LoadAttached":
      return [
        { kind: "loadAttached", gridId: event.gridId, nodeId: event.nodeId, amount: event.amount },
      ];
    // Nothing to place: the load is already off the runtime by the time this is
    // emitted, so its node is unknowable here, and the `GridChanged` beside it
    // carries the network relaxing back off the rating.
    case "LoadExpired":
      return [];
    // `ObjectDamaged` carries no damage type; machinery takes the world's own
    // impact language until core names one.
    case "ObjectDamaged":
      return [{ kind: "objectHit", objectId: event.objectId, amount: event.amount, damageType: "kinetic" }];
    case "ObjectDestroyed":
      return [{ kind: "objectDestroyed", objectId: event.objectId }];
    case "ObjectTriggered":
      return [{ kind: "objectTriggered", objectId: event.objectId, unitId: event.unitId }];
    case "ObjectAttacked":
      return [
        {
          kind: "objectAttacked",
          objectId: event.objectId,
          targetUnitId: event.targetUnitId,
          hit: event.hit,
        },
      ];
    default:
      return [];
  }
}

/** Convenience for a whole command batch. */
export function toRenderEventList(
  events: readonly BattleEvent[],
  stateAfter: GameState,
): RenderEvent[] {
  return events.flatMap((event) => toRenderEvents(event, stateAfter));
}
