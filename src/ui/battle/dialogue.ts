import type { DialogueLine } from "../../data/index.js";
import { Component, el, portrait } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";

export interface DialogueOptions {
  intents?: Partial<UiIntents>;
  /** Milliseconds per revealed character. */
  charIntervalMs?: number;
  onFinished?: () => void;
}

const ADVANCE_KEYS = new Set(["Enter", " "]);

/**
 * Speaker plate plus per-character reveal. The caller pumps `tick(deltaMs)`
 * (rAF in the browser, explicit steps in tests) so nothing here reads a clock.
 */
export class DialogueBox implements Component<DialogueLine[]> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private readonly options: DialogueOptions;
  private readonly speakerEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly portraitSlot: HTMLElement;
  private lines: DialogueLine[] = [];
  private index = 0;
  private revealed = 0;
  private elapsed = 0;
  private keyTarget: EventTarget | null = null;
  private readonly onKeyDown = (event: Event): void => {
    if (ADVANCE_KEYS.has((event as KeyboardEvent).key)) {
      event.preventDefault();
      this.advance();
    }
  };

  constructor(options: DialogueOptions = {}) {
    this.options = options;
    this.intents = withIntents(options.intents);
    this.speakerEl = el("div", { class: "gf-dialogue-speaker" });
    this.textEl = el("p", { class: "gf-dialogue-text" });
    this.promptEl = el("span", { class: "gf-dialogue-prompt", text: "▾" });
    this.portraitSlot = el("div", { class: "gf-dialogue-portrait" });
    this.el = el("section", {
      class: "gf-dialogue is-hidden",
      attrs: { "aria-live": "polite", "aria-label": "Dialogue" },
      children: [
        this.portraitSlot,
        el("div", {
          class: "gf-dialogue-body",
          children: [this.speakerEl, this.textEl, this.promptEl],
        }),
      ],
    });
  }

  get lineIndex(): number {
    return this.index;
  }

  get currentLine(): DialogueLine | null {
    return this.lines[this.index] ?? null;
  }

  get isRevealing(): boolean {
    const line = this.currentLine;
    return line !== null && this.revealed < line.text.length;
  }

  get visibleText(): string {
    return this.textEl.textContent ?? "";
  }

  get isOpen(): boolean {
    return this.lines.length > 0 && this.index < this.lines.length;
  }

  update(lines: DialogueLine[]): void {
    this.lines = lines;
    this.index = 0;
    this.revealed = 0;
    this.elapsed = 0;
    this.el.classList.toggle("is-hidden", lines.length === 0);
    this.render();
  }

  /** Advances the reveal; call once per frame with the frame delta. */
  tick(deltaMs: number): void {
    if (!this.isRevealing) return;
    const interval = this.options.charIntervalMs ?? 18;
    this.elapsed += deltaMs;
    const steps = Math.floor(this.elapsed / interval);
    if (steps <= 0) return;
    this.elapsed -= steps * interval;
    this.revealed = Math.min(this.revealed + steps, this.currentLine?.text.length ?? 0);
    this.render();
  }

  revealAll(): void {
    this.revealed = this.currentLine?.text.length ?? 0;
    this.elapsed = 0;
    this.render();
  }

  /** Enter: finish the reveal, else move to the next line. */
  advance(): void {
    if (!this.isOpen) return;
    if (this.isRevealing) {
      this.revealAll();
      return;
    }
    this.intents.advanceDialogue(this.index);
    this.index += 1;
    this.revealed = 0;
    this.elapsed = 0;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }
    this.render();
  }

  close(): void {
    this.el.classList.add("is-hidden");
    this.intents.endDialogue();
    this.options.onFinished?.();
  }

  attach(target: EventTarget = document): void {
    this.detach();
    this.keyTarget = target;
    target.addEventListener("keydown", this.onKeyDown);
  }

  detach(): void {
    this.keyTarget?.removeEventListener("keydown", this.onKeyDown);
    this.keyTarget = null;
  }

  destroy(): void {
    this.detach();
    this.el.remove();
  }

  private render(): void {
    const line = this.currentLine;
    if (!line) {
      this.textEl.textContent = "";
      this.speakerEl.textContent = "";
      this.portraitSlot.replaceChildren();
      return;
    }
    this.speakerEl.textContent = line.speaker;
    this.textEl.textContent = line.text.slice(0, this.revealed);
    this.promptEl.classList.toggle("is-ready", !this.isRevealing);
    this.portraitSlot.replaceChildren(portrait(line.portraitId, line.speaker));
  }
}
