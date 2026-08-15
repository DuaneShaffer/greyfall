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
  allObjects,
  allUnits,
  battleMap,
  getUnit,
  standHeight,
  unitMaxHp,
  type BattleEvent,
  type BattleUnit,
  type GameState,
  type ObjectRuntime,
} from "../core/index.js";
import type { Facing, TileCoord } from "../data/schemas/common.js";
import { facingBetween } from "./grid.js";
import type { RenderEvent } from "./presentation.js";
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

const objectViewOf = (object: ObjectRuntime): MapObjectView => ({
  id: object.def.id,
  kind: object.def.kind,
  spriteId: object.def.spriteId,
  tiles: object.def.tiles.map((tile) => ({ ...tile })),
  surfaceHeight: object.def.surfaceHeight ?? null,
  powered: object.powered,
  destroyed: object.destroyed,
});

/** A renderer snapshot of the whole battle. Derived; never authoritative. */
export function viewModelFromGameState(state: GameState): BattleViewModel {
  return {
    map: battleMap(state),
    units: allUnits(state).map((unit) => unitViewOf(state, unit)),
    objects: allObjects(state).map(objectViewOf),
  };
}

const facingAfterPath = (path: readonly TileCoord[], fallback: Facing): Facing => {
  const to = path[path.length - 1];
  const from = path[path.length - 2];
  if (to === undefined || from === undefined) return fallback;
  return facingBetween(from, to);
};

const hitEvent = (state: GameState, unitId: string, amount: number, hpRemaining: number): RenderEvent[] => {
  const unit = getUnit(state, unitId);
  const max = unit === null ? 0 : (unitMaxHp(state, unitId) ?? 0);
  const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, hpRemaining / max));
  return [{ kind: "unitHit", unitId, amount, hpFractionAfter: fraction }];
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
    case "DamageDealt":
      return hitEvent(stateAfter, event.unitId, event.amount, event.hpRemaining);
    // No heal presentation exists yet; a negative hit drains the bar upward and
    // reuses the same terminal-state contract.
    case "Healed":
      return hitEvent(stateAfter, event.unitId, -event.amount, event.hpRemaining);
    case "UnitDowned":
      return [{ kind: "unitDowned", unitId: event.unitId }];
    case "PowerChanged":
      return [{ kind: "objectPowerChanged", objectId: event.objectId, powered: event.powered }];
    case "ObjectDestroyed":
      return [{ kind: "objectDestroyed", objectId: event.objectId }];
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
