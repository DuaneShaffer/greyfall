import type {
  DamageType,
  DialogueLine,
  Facing,
  MapObjectKind,
  StatMods,
  Team,
  TileCoord,
} from "../../data/index.js";
import type { BattleResult, TargetRef } from "../state/types.js";

/** Why an object's energization moved, so the annunciator can name the verb that answers it. */
export interface PowerCause {
  gridId: string;
  nodeId: string;
  reason: "isolated" | "cut" | "destroyed" | "tripped" | "restored";
}

/**
 * Everything that happened, in the order it happened. Serializable facts only —
 * the renderer, UI, audio, logs and tests are all driven from this stream and
 * none of them may touch `GameState`.
 */
export type BattleEvent =
  | { type: "BattleStarted"; encounterId: string; mapId: string }
  | { type: "TurnStarted"; unitId: string; turn: number; clock: number }
  | { type: "TurnEnded"; unitId: string; ctSpent: number }
  | { type: "ClockAdvanced"; clock: number }
  | { type: "UnitMoved"; unitId: string; from: TileCoord; to: TileCoord; path: TileCoord[] }
  | { type: "UnitForcedMove"; unitId: string; from: TileCoord; to: TileCoord }
  // The whole battle is back where it stood before the move. `revertedConsequences`
  // says the move had set something off besides itself, so a renderer holding
  // derived scene state has to rebuild from `GameState` rather than snap a sprite.
  | {
      type: "UnitMoveUndone";
      unitId: string;
      from: TileCoord;
      to: TileCoord;
      facing: Facing;
      revertedConsequences: boolean;
    }
  | { type: "UnitFacingChanged"; unitId: string; facing: Facing }
  | { type: "AbilityUsed"; unitId: string; abilityId: string; target: TargetRef; tiles: TileCoord[] }
  // Precedes the `AbilityUsed` the item resolves through; `remaining` is what
  // the team satchel has left of it afterwards.
  | { type: "ItemUsed"; unitId: string; itemId: string; team: Team; remaining: number }
  | { type: "AbilityCharging"; unitId: string; abilityId: string; target: TargetRef; chargeId: string; castSpeed: number }
  | { type: "AbilityChargeCancelled"; unitId: string; abilityId: string; chargeId: string }
  | { type: "AbilityMissed"; unitId: string; abilityId: string; targetUnitId: string }
  | { type: "DamageDealt"; unitId: string; sourceUnitId: string | null; amount: number; damageType: DamageType; hpRemaining: number }
  | { type: "Healed"; unitId: string; sourceUnitId: string | null; amount: number; hpRemaining: number }
  | { type: "StatusApplied"; unitId: string; statusId: string; turnsRemaining: number | null }
  | { type: "StatusResisted"; unitId: string; statusId: string }
  | { type: "StatusRemoved"; unitId: string; statusId: string }
  | { type: "StatsModified"; unitId: string; mods: StatMods; turnsRemaining: number | null }
  | { type: "ChargeChanged"; unitId: string; delta: number; charge: number }
  | { type: "DispositionChanged"; unitId: string; stat: "resolve" | "attunement"; value: number }
  | { type: "ReactionTriggered"; unitId: string; abilityId: string; againstUnitId: string | null }
  | { type: "UnitDowned"; unitId: string }
  | { type: "UnitSpawned"; unitId: string; team: Team; position: TileCoord }
  | { type: "UnitRemoved"; unitId: string }
  | { type: "ObjectDamaged"; objectId: string; sourceUnitId: string | null; amount: number; hpRemaining: number }
  | { type: "ObjectRepaired"; objectId: string; amount: number; hpRemaining: number }
  | { type: "ObjectDestroyed"; objectId: string }
  | { type: "ObjectActivated"; unitId: string; objectId: string }
  | { type: "ObjectSpawned"; objectId: string; kind: MapObjectKind; owner: Team | null; tiles: TileCoord[] }
  | { type: "ObjectTriggered"; objectId: string; unitId: string }
  | { type: "ObjectAttacked"; objectId: string; targetUnitId: string; hit: boolean }
  // Reports *energization*, the value derived from the grid, not the isolator
  // flag that feeds it. `cause` is present only for objects on a declared grid.
  | { type: "PowerChanged"; objectId: string; powered: boolean; cause?: PowerCause }
  // Any recompute that changed something, emitted before its `PowerChanged` batch.
  | { type: "GridChanged"; gridId: string; capacity: number; load: number; liveNodes: string[]; tripped: boolean }
  | { type: "GridTripped"; gridId: string; capacity: number; load: number }
  | { type: "GridReset"; gridId: string; nodeId: string; unitId: string | null }
  | { type: "LineSevered"; objectId: string; unitId: string | null }
  | { type: "LineSpliced"; objectId: string; unitId: string | null }
  | { type: "LoadAttached"; gridId: string; nodeId: string; amount: number; turns: number | null; unitId: string | null }
  | { type: "LoadExpired"; loadId: string }
  | { type: "StandingAwarded"; unitId: string; amount: number; total: number }
  | { type: "TriggerFired"; triggerId: string }
  | { type: "DialogueRequested"; triggerId: string; lines: DialogueLine[] }
  | { type: "BattleEnded"; result: BattleResult };

export type BattleEventType = BattleEvent["type"];
