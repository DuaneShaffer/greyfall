import { Component, el } from "../dom.js";

export type NoticeTone = "info" | "refusal" | "machine";

const HOLD_MS = 2600;

/**
 * Non-modal feedback: a refused click, a machine that just changed state. It
 * sits above the field, says one line, and retires itself. Nothing here blocks
 * input — a refusal that needs dismissing is worse than the silence it fixes.
 *
 * The caller pumps `tick(deltaMs)`, so this reads no clock (same contract as
 * the dialogue reveal).
 */
export class NoticeStrip implements Component<null> {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private remaining = 0;

  constructor() {
    this.body = el("p", { class: "gf-notice", attrs: { role: "status", "aria-live": "polite" } });
    this.el = el("div", { class: "gf-notice-slot", children: [this.body] });
  }

  get message(): string {
    return this.remaining > 0 ? (this.body.textContent ?? "") : "";
  }

  show(message: string, tone: NoticeTone = "info"): void {
    this.body.textContent = message;
    this.body.className = `gf-notice is-shown is-${tone}`;
    this.remaining = HOLD_MS;
  }

  clear(): void {
    this.remaining = 0;
    this.body.classList.remove("is-shown");
  }

  tick(deltaMs: number): void {
    if (this.remaining <= 0) return;
    this.remaining -= deltaMs;
    if (this.remaining <= 0) this.clear();
  }

  update(): void {
    /* nothing: notices are pushed, not derived */
  }

  destroy(): void {
    this.el.remove();
  }
}
