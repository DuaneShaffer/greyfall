import type { BattleEvent } from "../events/types.js";
import type { GameState } from "./types.js";

/**
 * Working area for one `applyCommand` call: a private clone of the state plus
 * the event list being built. Rules mutate the clone; the caller never sees a
 * partially-applied state.
 */
export interface Ctx {
  state: GameState;
  events: BattleEvent[];
  /** Recursion guard for deployables set off by other deployables' shoves. */
  contactDepth?: number;
}

export function emit(ctx: Ctx, event: BattleEvent): void {
  ctx.events.push(event);
}

/**
 * Clone everything but the immutable content snapshot, which is shared. The
 * undo slot is carried by reference too: it is written whole and read whole,
 * never mutated in place, and deep-copying a whole spare battle on every
 * command would cost what the slot exists to make cheap.
 */
export function cloneState(state: GameState): GameState {
  const { content, moveUndo, ...rest } = state;
  return { ...structuredClone(rest), content, moveUndo };
}

export function nextOrdinal(state: GameState): number {
  state.nextOrdinal += 1;
  return state.nextOrdinal;
}
