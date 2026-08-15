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
}

export function emit(ctx: Ctx, event: BattleEvent): void {
  ctx.events.push(event);
}

/** Clone everything but the immutable content snapshot, which is shared. */
export function cloneState(state: GameState): GameState {
  const { content, ...rest } = state;
  return { ...structuredClone(rest), content };
}

export function nextOrdinal(state: GameState): number {
  state.nextOrdinal += 1;
  return state.nextOrdinal;
}
