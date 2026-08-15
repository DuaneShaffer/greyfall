import type { Facing, TileCoord } from "../../data/index.js";
import type { BattleEvent } from "../events/types.js";
import type { GameState, TargetRef } from "../state/types.js";

/**
 * The only way to change a battle. Serializable intents, identical whether they
 * come from the player's input layer, the AI, or an encounter trigger.
 */
export type Command =
  | { kind: "move"; unitId: string; to: TileCoord }
  | { kind: "act"; unitId: string; abilityId: string; target: TargetRef }
  | { kind: "activateObject"; unitId: string; objectId: string }
  | { kind: "wait"; unitId: string; facing: Facing }
  | { kind: "endTurn"; unitId: string };

export type CommandKind = Command["kind"];

export type CommandErrorCode =
  | "battle-over"
  | "no-active-turn"
  | "not-active-unit"
  | "unknown-unit"
  | "unknown-object"
  | "unknown-ability"
  | "unit-downed"
  | "already-moved"
  | "already-acted"
  | "move-prevented"
  | "action-prevented"
  | "unreachable"
  | "ability-not-available"
  | "insufficient-charge"
  | "insufficient-hp"
  | "out-of-range"
  | "no-line-of-sight"
  | "invalid-target"
  | "not-adjacent"
  | "not-operable"
  | "object-destroyed"
  | "object-unpowered";

/** Why a command was rejected. State is returned unchanged when this is set. */
export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export interface CommandResult {
  state: GameState;
  events: BattleEvent[];
  error: CommandError | null;
}

export function commandError(code: CommandErrorCode, message: string): CommandError {
  return { code, message };
}
