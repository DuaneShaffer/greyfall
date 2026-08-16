// Animation playback as pure logic: a tick clock over the frame tables in
// `sprites.ts`. No Three.js, no DOM — the renderer owns textures, this owns
// which frame is current.

import {
  ANIMATIONS,
  TICKS_PER_SECOND,
  clipDurationTicks,
  frameAtTick,
  type AnimState,
} from "./sprites.js";

export function frameStartTick(state: AnimState, frame: number): number {
  const clip = ANIMATIONS[state];
  let tick = 0;
  for (let i = 0; i < Math.min(frame, clip.frames); i += 1) tick += clip.ticks[i] ?? 0;
  return tick;
}

export function frameEndTick(state: AnimState, frame: number): number {
  return frameStartTick(state, frame) + (ANIMATIONS[state].ticks[frame] ?? 0);
}

export interface PlayOptions {
  /** Sit in the clip's hold loop (cast, while a charged action waits on CT). */
  readonly hold?: boolean;
}

/**
 * One unit's animation clock. `idle` loops by default; one-shot clips fall back
 * to the rest state when they end, except `downed`, which holds its last frame.
 */
export class AnimationPlayer {
  private current: AnimState;
  private rest: AnimState;
  private tick = 0;
  private holding = false;
  private finished = false;

  constructor(initial: AnimState = "idle") {
    this.current = initial;
    this.rest = initial === "downed" ? "downed" : "idle";
  }

  get state(): AnimState {
    return this.current;
  }

  get frame(): number {
    return frameAtTick(this.current, this.tick);
  }

  get elapsedTicks(): number {
    return this.tick;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get isHolding(): boolean {
    return this.holding && ANIMATIONS[this.current].holdLoop !== null;
  }

  get restState(): AnimState {
    return this.rest;
  }

  /** The state a finished one-shot returns to. `downed` is terminal. */
  setRest(state: AnimState): void {
    this.rest = state;
  }

  play(state: AnimState, options: PlayOptions = {}): void {
    this.current = state;
    this.tick = 0;
    this.holding = options.hold ?? false;
    this.finished = false;
    if (state === "downed") this.rest = "downed";
  }

  /** Leave the hold loop; the clip runs on to its release frames. */
  release(): void {
    this.holding = false;
  }

  advanceSeconds(seconds: number): void {
    this.advance(seconds * TICKS_PER_SECOND);
  }

  advance(ticks: number): void {
    if (ticks <= 0) return;
    const clip = ANIMATIONS[this.current];
    this.tick += ticks;

    const holdLoop = clip.holdLoop;
    if (holdLoop !== null && this.holding) {
      const start = frameStartTick(this.current, holdLoop[0]);
      const end = frameEndTick(this.current, holdLoop[1]);
      const span = Math.max(1, end - start);
      if (this.tick >= end) this.tick = start + ((this.tick - start) % span);
      return;
    }

    const total = clipDurationTicks(this.current);
    if (this.tick < total) return;
    if (clip.loop) {
      this.tick %= total;
      return;
    }
    this.finished = true;
    if (clip.holdLast) {
      this.tick = total;
      return;
    }
    this.current = this.rest;
    this.tick = 0;
  }
}
