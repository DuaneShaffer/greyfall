import { Component, el } from "../dom.js";

export type NoticeTone = "info" | "refusal" | "machine";

const HOLD_MS = 2600;
/**
 * A demoted line is guaranteed this much of a read even if it was replaced the
 * instant it appeared. An enemy turn that cuts a line, trips a bus and drops a
 * lift deck used to leave only the third of those on screen.
 *
 * It outlives the live slot on purpose, and by enough that a whole enemy batch
 * is still readable once the batch has finished arriving: at 1.8s the trail
 * retired while the turn that wrote it was still animating, and the acceptance
 * play never saw more than two lines survive at once.
 */
const SCROLLBACK_MS = 6800;
/** How far back the strip remembers. Past this the oldest line is dropped. */
const SCROLLBACK_LINES = 5;

interface LoggedNotice {
  el: HTMLElement;
  remaining: number;
}

/**
 * Non-modal feedback: a refused click, a machine that just changed state. It
 * sits above the field, says one line, and retires itself. Nothing here blocks
 * input — a refusal that needs dismissing is worse than the silence it fixes.
 *
 * The newest line holds the slot; the ones it displaced stack underneath as a
 * short scrollback, each on its own retention clock, so a batch cannot eat
 * itself. The scrollback is out of the live region (it was announced when it was
 * live) and takes no pointer.
 *
 * The caller pumps `tick(deltaMs)`, so this reads no clock (same contract as
 * the dialogue reveal).
 */
export class NoticeStrip implements Component<null> {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly log: LoggedNotice[] = [];
  private remaining = 0;
  private tone: NoticeTone = "info";

  constructor() {
    this.body = el("p", { class: "gf-notice", attrs: { role: "status", "aria-live": "polite" } });
    this.logEl = el("ol", { class: "gf-notice-log", attrs: { "aria-hidden": "true" } });
    this.el = el("div", { class: "gf-notice-slot", children: [this.body, this.logEl] });
  }

  get message(): string {
    return this.remaining > 0 ? (this.body.textContent ?? "") : "";
  }

  /** The lines the newest one displaced, newest first. */
  get scrollback(): string[] {
    return this.log.map((entry) => entry.el.textContent ?? "");
  }

  show(message: string, tone: NoticeTone = "info"): void {
    this.demote();
    this.body.textContent = message;
    this.body.className = `gf-notice is-shown is-${tone}`;
    this.tone = tone;
    this.remaining = HOLD_MS;
  }

  clear(): void {
    this.remaining = 0;
    this.body.classList.remove("is-shown");
    for (const entry of this.log) entry.el.remove();
    this.log.length = 0;
  }

  tick(deltaMs: number): void {
    for (const entry of [...this.log]) {
      entry.remaining -= deltaMs;
      if (entry.remaining > 0) continue;
      entry.el.remove();
      this.log.splice(this.log.indexOf(entry), 1);
    }
    if (this.remaining <= 0) return;
    this.remaining -= deltaMs;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.body.classList.remove("is-shown");
    }
  }

  update(): void {
    /* nothing: notices are pushed, not derived */
  }

  destroy(): void {
    this.el.remove();
  }

  /** Move the line in the slot into the scrollback, keeping its tone and clock. */
  private demote(): void {
    if (this.remaining <= 0) return;
    const line = el("li", {
      class: `gf-notice-line is-${this.tone}`,
      text: this.body.textContent ?? "",
    });
    this.logEl.prepend(line);
    this.log.unshift({ el: line, remaining: Math.max(this.remaining, SCROLLBACK_MS) });
    while (this.log.length > SCROLLBACK_LINES) {
      this.log.pop()?.el.remove();
    }
  }
}
