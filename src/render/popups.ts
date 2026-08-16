// Floating damage/heal/miss numbers, as pure lifecycle logic. No Three.js and
// no DOM: this decides what a popup says, what color it is, how far it has
// risen, how faded it is, and which lane it stacks into when several land at
// once. `vfxLayer.ts` draws whatever this reports.
//
// Skip semantics: a popup carries no terminal state — skipping the
// presentation means the numbers are gone, so `clear()` is the whole story.

import { DAMAGE_NUMBER_COLOR } from "../art/palette.js";
import { TICKS_PER_SECOND } from "../art/sprites.js";
import type { DamageType } from "../data/schemas/common.js";

export type PopupStyle = keyof Omit<typeof DAMAGE_NUMBER_COLOR, "outline">;

export const POPUP_TICKS = 40;
export const POPUP_SECONDS = POPUP_TICKS / TICKS_PER_SECOND;
/** World units a popup climbs over its life. */
export const POPUP_RISE = 0.55;
/** Vertical gap between stacked lanes, in world units. */
export const POPUP_LANE_HEIGHT = 0.3;
/** Popups closer together than this in the ground plane share a lane stack. */
export const POPUP_STACK_RADIUS = 0.75;
/** Fraction of the life spent at full opacity before the fade starts. */
const HOLD_FRACTION = 0.55;

export interface PopupSpec {
  readonly text: string;
  readonly style: PopupStyle;
  /** Misses are unoutlined so they stay quiet (ART_DIRECTION §7). */
  readonly outlined: boolean;
}

export interface PopupAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Popup {
  readonly id: number;
  readonly spec: PopupSpec;
  readonly anchor: PopupAnchor;
  readonly lane: number;
  age: number;
}

/**
 * ART_DIRECTION §7 fixes a closed set of number colors: soot-100 normally,
 * amber-300 on a crit, verdigris-300 on a heal, overload-100 for arc, soot-300
 * for a miss. The other damage types carry their identity in the impact effect,
 * not in the digits.
 */
export function popupStyleFor(amount: number, damageType: DamageType | null): PopupStyle {
  if (amount < 0) return "heal";
  if (damageType === "arc") return "arc";
  return "normal";
}

export const damagePopup = (amount: number, damageType: DamageType | null): PopupSpec => {
  const style = popupStyleFor(amount, damageType);
  const magnitude = Math.max(0, Math.round(Math.abs(amount)));
  return {
    text: style === "heal" ? `+${magnitude}` : `${magnitude}`,
    style,
    outlined: true,
  };
};

export const missPopup = (): PopupSpec => ({ text: "MISS", style: "miss", outlined: false });

const distanceSquared = (a: PopupAnchor, b: PopupAnchor): number =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Eased rise: fast off the head, slowing as it fades. */
const easeOut = (t: number): number => 1 - (1 - t) ** 2;

/** Every live popup. Ages them, retires them, and keeps them from overlapping. */
export class PopupField {
  private readonly popups: Popup[] = [];
  private nextId = 1;

  get active(): readonly Popup[] {
    return this.popups;
  }

  get count(): number {
    return this.popups.length;
  }

  /**
   * Lowest lane not already taken by a live popup over the same spot, so two
   * numbers that land on the same frame stack instead of printing on top of
   * each other.
   */
  laneFor(anchor: PopupAnchor): number {
    const taken = new Set<number>();
    for (const popup of this.popups) {
      if (distanceSquared(popup.anchor, anchor) <= POPUP_STACK_RADIUS ** 2) {
        taken.add(popup.lane);
      }
    }
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    return lane;
  }

  spawn(spec: PopupSpec, anchor: PopupAnchor): Popup {
    const popup: Popup = {
      id: this.nextId,
      spec,
      anchor: { ...anchor },
      lane: this.laneFor(anchor),
      age: 0,
    };
    this.nextId += 1;
    this.popups.push(popup);
    return popup;
  }

  advance(seconds: number): void {
    if (seconds <= 0) return;
    for (const popup of this.popups) popup.age += seconds;
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const popup = this.popups[i] as Popup;
      if (popup.age >= POPUP_SECONDS) this.popups.splice(i, 1);
    }
  }

  /** Skip = gone. */
  clear(): void {
    this.popups.length = 0;
  }
}

export const popupProgress = (popup: Popup): number =>
  Math.min(1, Math.max(0, popup.age / POPUP_SECONDS));

/** World-space y of a popup right now: anchor + lane offset + rise. */
export const popupHeight = (popup: Popup): number =>
  popup.anchor.y + popup.lane * POPUP_LANE_HEIGHT + POPUP_RISE * easeOut(popupProgress(popup));

export const popupOpacity = (popup: Popup): number => {
  const t = popupProgress(popup);
  if (t <= HOLD_FRACTION) return 1;
  return Math.max(0, 1 - (t - HOLD_FRACTION) / (1 - HOLD_FRACTION));
};
