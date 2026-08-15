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
  | { type: "UnitFacingChanged"; unitId: string; facing: Facing }
  | { type: "AbilityUsed"; unitId: string; abilityId: string; target: TargetRef; tiles: TileCoord[] }
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
  | { type: "ObjectDamaged"; objectId: string; sourceUnitId: string | null; amount: number; hpRemaining: number }
  | { type: "ObjectRepaired"; objectId: string; amount: number; hpRemaining: number }
  | { type: "ObjectDestroyed"; objectId: string }
  | { type: "ObjectActivated"; unitId: string; objectId: string }
  | { type: "ObjectSpawned"; objectId: string; kind: MapObjectKind; owner: Team | null; tiles: TileCoord[] }
  | { type: "PowerChanged"; objectId: string; powered: boolean }
  | { type: "StandingAwarded"; unitId: string; amount: number; total: number }
  | { type: "TriggerFired"; triggerId: string }
  | { type: "DialogueRequested"; triggerId: string; lines: DialogueLine[] }
  | { type: "BattleEnded"; result: BattleResult };

export type BattleEventType = BattleEvent["type"];
