import { Component, el, replaceChildren } from "../dom.js";
import type { HudMode } from "../state.js";

interface ModeCopy {
  /** The stamp: one word, always in the same place. */
  name: string;
  /** What the game wants next, in the Assay register. */
  ask: string;
  /** Controls that apply *in this mode*, beyond the camera's. */
  keys: readonly [string, string][];
}

const CAMERA_KEYS: readonly [string, string][] = [
  ["Q / E", "orbit"],
  ["Wheel", "zoom"],
  ["WASD", "pan"],
];

/** Modes the player entered on purpose, and can therefore leave. */
const WITHDRAWABLE = new Set<HudMode>(["move", "target", "facing"]);

const MODES: Record<HudMode, ModeCopy> = {
  orders: {
    name: "Orders",
    ask: "Choose an order.",
    keys: [
      ["Click", "or arrows to choose"],
      ["Enter", "confirm"],
    ],
  },
  move: {
    name: "Move",
    ask: "Pick a lit tile, then click it again to commit the move.",
    keys: [
      ["Click", "a lit tile, twice to commit"],
      ["Right-click", "or Esc to withdraw"],
    ],
  },
  target: {
    name: "Target",
    ask: "Pick a target, then commit from the forecast.",
    keys: [
      ["Click", "a target, then Commit"],
      ["Right-click", "or Esc to withdraw"],
    ],
  },
  facing: {
    name: "Facing",
    ask: "Set the facing this turn closes on.",
    keys: [
      ["Click", "a facing, or a tile to face it"],
      ["Right-click", "or Esc to withdraw"],
    ],
  },
  dialogue: {
    name: "Record",
    ask: "Click the line to continue.",
    keys: [["Enter", "continue"]],
  },
  presenting: {
    name: "Resolving",
    ask: "Playing out the last order.",
    keys: [["X", "skip"]],
  },
  ai: {
    name: "Opposition",
    ask: "The other side is acting.",
    keys: [["X", "skip"]],
  },
  deploy: {
    name: "Formation",
    ask: "Pick a unit, then a deployment tile.",
    keys: [
      ["Click", "place"],
      ["Enter", "move out"],
    ],
  },
  ended: {
    name: "Closed",
    ask: "The engagement is over.",
    keys: [],
  },
};

/**
 * The bottom rule of the HUD: the current mode, what it wants, and only the
 * controls that apply to it. Replaces the fixed dev legend, which said the same
 * five things whatever the game was actually waiting on.
 */
export class ModeBar implements Component<HudMode> {
  readonly el: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly askEl: HTMLElement;
  private readonly keysEl: HTMLElement;
  private readonly withdrawEl: HTMLElement;
  private mode: HudMode = "presenting";
  private detail: string | null = null;

  constructor(options: { onWithdraw?: () => void } = {}) {
    this.nameEl = el("span", { class: "gf-mode-name" });
    this.askEl = el("p", { class: "gf-mode-ask" });
    this.keysEl = el("div", { class: "gf-mode-keys" });
    // Every mode a player can get *into* with the mouse needs a way out with
    // the mouse. Escape and right-click both work; neither is visible.
    this.withdrawEl = el("button", {
      class: "gf-button is-quiet gf-mode-withdraw",
      attrs: { type: "button" },
      text: "Withdraw",
    });
    this.withdrawEl.addEventListener("click", () => options.onWithdraw?.());
    this.el = el("div", {
      class: "gf-mode-bar",
      attrs: { role: "status", "aria-live": "polite" },
      children: [this.nameEl, this.askEl, this.withdrawEl, this.keysEl],
    });
    this.update("presenting");
  }

  get current(): HudMode {
    return this.mode;
  }

  /** `detail` names the subject where one helps: the acting unit, the ability. */
  update(mode: HudMode, detail?: string | null): void {
    this.mode = mode;
    this.detail = detail ?? null;
    const copy = MODES[mode];
    this.el.dataset["mode"] = mode;
    this.withdrawEl.hidden = !WITHDRAWABLE.has(mode);
    this.nameEl.textContent = copy.name;
    this.askEl.textContent = this.detail === null ? copy.ask : `${this.detail} — ${copy.ask}`;
    replaceChildren(
      this.keysEl,
      [...copy.keys, ...CAMERA_KEYS].map(([key, meaning]) =>
        el("span", {
          class: "gf-mode-key",
          children: [el("b", { text: key }), meaning],
        }),
      ),
    );
  }

  destroy(): void {
    this.el.remove();
  }
}
