// Presentation layer: the renderer's own event vocabulary plus the queue that
// plays those events back at animation pace, one at a time, skippably.
//
// THE SEAM (read before wiring `src/core`):
// `RenderEvent` is deliberately declared here and NOT imported from core. Core
// emits rule-level facts (`UnitMoved`, `CatwalkCollapsed`, …) that carry the
// information the rules need; the renderer needs presentation-shaped facts
// (a full path to walk, an hp fraction to drain a bar to). When core lands,
// write ONE adapter — `render/adapter.ts: toRenderEvents(coreEvent, state):
// RenderEvent[]` — and keep every other render module importing only this
// file. Rules for keeping the seam clean:
//   1. RenderEvents are plain serializable data; no Three.js objects, no
//      callbacks, no references to core types.
//   2. Every RenderEvent must carry enough to reach its terminal state on its
//      own, because `skip()` jumps straight there without playing frames.
//   3. Applying an event twice must be idempotent — the queue may finish an
//      animation that was already visually complete.

import type { DamageType, Facing, TileCoord } from "../data/schemas/common.js";

/**
 * What the acting unit's body is doing. `castHold` parks a charged action in
 * the `cast` hold loop until the charge resolves; `rest` releases it if the
 * charge is cancelled instead.
 */
export type ActorPose = "attack" | "cast" | "castHold" | "rest";

export type RenderEvent =
  /** Walk a unit along `path` (path[0] is the current tile). */
  | { kind: "unitMoved"; unitId: string; path: TileCoord[]; facing: Facing }
  | { kind: "unitFaced"; unitId: string; facing: Facing }
  /** The actor's own swing/cast, emitted ahead of the hits it causes. */
  | { kind: "unitActed"; unitId: string; pose: ActorPose }
  | {
      kind: "unitHit";
      unitId: string;
      /** Negative is a heal. */
      amount: number;
      hpFractionAfter: number;
      damageType: DamageType | null;
      sourceUnitId: string | null;
    }
  | { kind: "unitMissed"; unitId: string; sourceUnitId: string | null }
  | { kind: "unitDowned"; unitId: string }
  /** Taken off the field without being downed: walks out and is gone. */
  | { kind: "unitRemoved"; unitId: string }
  | { kind: "objectPowerChanged"; objectId: string; powered: boolean }
  | { kind: "objectHit"; objectId: string; amount: number; damageType: DamageType }
  | { kind: "objectDestroyed"; objectId: string }
  /** A deployable set off by contact: bursts and is gone. */
  | { kind: "objectTriggered"; objectId: string; unitId: string }
  /** Machinery firing on a unit. */
  | { kind: "objectAttacked"; objectId: string; targetUnitId: string; hit: boolean }
  | { kind: "cameraFocused"; tile: TileCoord };

export type RenderEventKind = RenderEvent["kind"];

export interface Animation {
  /** Seconds. 0 means "apply instantly on the frame it starts". */
  readonly duration: number;
  /** Called with elapsed seconds in [0, duration]. */
  update(elapsed: number): void;
  /** Jump to the terminal state. Must be idempotent. */
  finish(): void;
}

export type AnimationFactory = (event: RenderEvent) => Animation | null;

export const instantAnimation = (apply: () => void): Animation => ({
  duration: 0,
  update: () => {},
  finish: apply,
});

interface ActiveStep {
  event: RenderEvent;
  animation: Animation;
  elapsed: number;
}

/**
 * FIFO, one animation at a time. Animations are created lazily when their step
 * starts so each one reads the scene state left by the previous one.
 */
export class PresentationQueue {
  private readonly factory: AnimationFactory;
  private readonly queued: RenderEvent[] = [];
  private active: ActiveStep | null = null;
  private playedLog: RenderEvent[] = [];

  constructor(factory: AnimationFactory) {
    this.factory = factory;
  }

  push(event: RenderEvent): void {
    this.queued.push(event);
  }

  pushAll(events: readonly RenderEvent[]): void {
    for (const event of events) this.push(event);
  }

  get isIdle(): boolean {
    return this.active === null && this.queued.length === 0;
  }

  get pendingCount(): number {
    return this.queued.length + (this.active ? 1 : 0);
  }

  get currentEvent(): RenderEvent | null {
    return this.active?.event ?? null;
  }

  /** Events whose animations have completed, in completion order. */
  get played(): readonly RenderEvent[] {
    return this.playedLog;
  }

  clearPlayedLog(): void {
    this.playedLog = [];
  }

  update(deltaSeconds: number): void {
    let remaining = Math.max(0, deltaSeconds);
    for (let guard = 0; guard < 1024; guard += 1) {
      if (!this.active && !this.startNext()) return;
      const step = this.active;
      if (!step) return;
      const left = step.animation.duration - step.elapsed;
      if (remaining < left) {
        step.elapsed += remaining;
        step.animation.update(step.elapsed);
        return;
      }
      remaining -= left;
      this.complete(step);
      if (remaining <= 0 && this.queued.length === 0) return;
    }
  }

  /** Finish the running animation only; queued events still play normally. */
  skipCurrent(): void {
    if (this.active) this.complete(this.active);
  }

  /** Finish everything immediately, in order, leaving the queue idle. */
  skip(): void {
    for (let guard = 0; guard < 4096; guard += 1) {
      if (this.active) {
        this.complete(this.active);
        continue;
      }
      if (!this.startNext()) return;
    }
  }

  /** Drop everything without applying it. Used when rebuilding the scene. */
  reset(): void {
    this.queued.length = 0;
    this.active = null;
  }

  private startNext(): boolean {
    while (this.queued.length > 0) {
      const event = this.queued.shift() as RenderEvent;
      const animation = this.factory(event);
      if (!animation) {
        this.playedLog.push(event);
        continue;
      }
      this.active = { event, animation, elapsed: 0 };
      animation.update(0);
      return true;
    }
    return false;
  }

  private complete(step: ActiveStep): void {
    step.animation.finish();
    this.playedLog.push(step.event);
    if (this.active === step) this.active = null;
  }
}

export const easeInOut = (t: number): number =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
