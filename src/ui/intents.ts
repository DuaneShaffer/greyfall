import type { Facing, TileCoord } from "../data/index.js";
import type { EquipSlot } from "./state.js";

// THE SEAM. The UI never mutates game state and never calls into core; it
// reports what the player asked for through this one callback interface.
//
// Next phase, `src/app` supplies an implementation that constructs core
// Commands from these intents and feeds them to `applyCommand`; the resulting
// events come back as fresh view models (src/ui/state.ts) pushed into the
// components. Every method here maps to either a core Command (battle intents)
// or a between-battle roster mutation (progression intents). Nothing in
// src/ui imports from src/core, src/render, or src/art.

export type TargetRef =
  | { kind: "unit"; unitId: string }
  | { kind: "tile"; tile: TileCoord }
  | { kind: "object"; objectId: string }
  | { kind: "self" };

export interface BattleIntents {
  /** Player picked Move; renderer should light the reachable tiles. */
  beginMove(unitId: string): void;
  /** Player confirmed a destination tile. -> MoveUnit command. */
  confirmMove(unitId: string, tile: TileCoord): void;
  /** Player picked an ability from a skillset menu; targeting begins. */
  selectAbility(unitId: string, abilityId: string): void;
  /** Player confirmed the target of the pending ability. -> UseAbility command. */
  confirmTarget(unitId: string, abilityId: string, target: TargetRef): void;
  /** Player chose adjacent machinery to operate. -> ActivateObject command. */
  activateObject(unitId: string, objectId: string): void;
  /** Backed out of targeting or a submenu without committing anything. */
  cancelSelection(unitId: string): void;
  /** End the turn, locking in facing. -> Wait command. */
  wait(unitId: string, facing: Facing): void;
  /** Cursor moved onto a unit; drives the status panel, mutates nothing. */
  inspectUnit(unitId: string | null): void;
  /** Dialogue box finished a line and the player asked for the next one. */
  advanceDialogue(lineIndex: number): void;
  /** Dialogue ran out of lines. */
  endDialogue(): void;
}

export interface ProgressionIntents {
  /** Roster cursor landed on a unit. */
  selectRosterUnit(unitId: string): void;
  openUnitSheet(unitId: string): void;
  openLearning(unitId: string): void;
  openEquipment(unitId: string): void;
  openJobs(unitId: string): void;
  /** Confirmed spending Standing on an ability. */
  learnAbility(unitId: string, abilityId: string): void;
  /** Confirmed an equipment change; itemId null unequips the slot. */
  equipItem(unitId: string, slot: EquipSlot, itemId: string | null): void;
  /** Assigned a learned passive to its slot. */
  setAbilitySlot(unitId: string, slot: "reaction" | "support" | "movement", abilityId: string | null): void;
  /** Confirmed a primary job change. */
  changeJob(unitId: string, jobId: string): void;
  /** Borrowed a second skillset; jobId null clears it. */
  setSecondaryJob(unitId: string, jobId: string | null): void;
  /** Left the roster for the formation screen. */
  beginDeployment(): void;
  /** Put a unit on the next free deployment tile, or pull it back off. */
  toggleDeployment(unitId: string): void;
  /** Formation locked in; the battle starts. */
  confirmDeployment(): void;
  closeScreen(): void;
}

export type UiIntents = BattleIntents & ProgressionIntents;

export type IntentName = keyof UiIntents;

export interface IntentCall {
  name: IntentName;
  args: unknown[];
}

/** Every intent as a no-op; components take a partial and fall back to this. */
export function noopIntents(): UiIntents {
  const sink = (): void => undefined;
  return {
    beginMove: sink,
    confirmMove: sink,
    selectAbility: sink,
    confirmTarget: sink,
    activateObject: sink,
    cancelSelection: sink,
    wait: sink,
    inspectUnit: sink,
    advanceDialogue: sink,
    endDialogue: sink,
    selectRosterUnit: sink,
    openUnitSheet: sink,
    openLearning: sink,
    openEquipment: sink,
    openJobs: sink,
    learnAbility: sink,
    equipItem: sink,
    setAbilitySlot: sink,
    changeJob: sink,
    setSecondaryJob: sink,
    beginDeployment: sink,
    toggleDeployment: sink,
    confirmDeployment: sink,
    closeScreen: sink,
  };
}

/** Records intents for tests and for the harness's intent log. */
export function recordingIntents(onCall?: (call: IntentCall) => void): {
  intents: UiIntents;
  calls: IntentCall[];
} {
  const calls: IntentCall[] = [];
  const base = noopIntents();
  const intents = {} as UiIntents;
  for (const name of Object.keys(base) as IntentName[]) {
    (intents as unknown as Record<string, (...args: unknown[]) => void>)[name] = (...args: unknown[]) => {
      const call = { name, args };
      calls.push(call);
      onCall?.(call);
    };
  }
  return { intents, calls };
}

export function withIntents(partial: Partial<UiIntents> | undefined): UiIntents {
  return { ...noopIntents(), ...partial };
}
