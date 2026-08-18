import { Component, el, plate, replaceChildren } from "../dom.js";
import type { LogEntryView } from "../state.js";

/** The tail a collapsed panel keeps: one enemy turn's worth of lines. */
const COLLAPSED_LINES = 3;

export interface LogPanelOptions {
  /** Lines the collapsed panel keeps. The rest are behind the toggle. */
  collapsedLines?: number;
}

const KIND_CLASS: Record<LogEntryView["kind"], string> = {
  battle: "is-battle",
  turn: "is-turn",
  action: "is-action",
  effect: "is-effect",
  join: "is-join",
  left: "is-left",
  death: "is-death",
  grid: "is-grid",
};

/** Sent at somebody and landed on nobody: the one reading a miss deserves. */
const wholeMiss = (entry: LogEntryView): boolean =>
  entry.targets.length > 0 && entry.targets.every((target) => target.hit === false);

const tookSomebodyDown = (entry: LogEntryView): boolean =>
  entry.kind === "death" || entry.targets.some((target) => target.downed);

/**
 * The battle's record, printed from `BattleHudView.log`.
 *
 * The floating damage numbers say what just happened to whoever the camera was
 * pointed at; this is the part that outlives them. A blind playtest lost three
 * different facts to the same gap — whether an attack hit, what an enemy turn
 * did in the three tenths of a second it took, and what resolved behind a
 * dialogue box — and all three are the same fix: a durable line per action,
 * every unit, every side, in the order the rules resolved them.
 *
 * It prints `entry.text`, which the record side of the seam has already
 * formatted from the events. Nothing here re-derives a figure: a heal that
 * restored nothing to an unhurt unit reads `0 recovered`, because that is what
 * the rules did (UI_DESIGN §14.2).
 */
export class LogPanel implements Component<readonly LogEntryView[] | undefined> {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly plateEl: HTMLElement;
  private readonly toggleEl: HTMLButtonElement;
  private readonly collapsedLines: number;
  private entries: readonly LogEntryView[] = [];
  private open = false;

  constructor(options: LogPanelOptions = {}) {
    this.collapsedLines = options.collapsedLines ?? COLLAPSED_LINES;
    this.list = el("ol", { class: "gf-log-list" });
    this.plateEl = plate("Record", "");
    this.toggleEl = el("button", {
      class: "gf-log-toggle",
      attrs: { type: "button", "aria-expanded": "false" },
    });
    this.toggleEl.addEventListener("click", () => this.setOpen(!this.open));
    // The panel carries the one focusable control in the overlay's left column,
    // and the orders menu takes Enter off the document. Consuming the key here
    // is what stops one press from both working the drawer and confirming the
    // row underneath it.
    this.toggleEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      this.setOpen(!this.open);
    });
    this.el = el("section", {
      class: "gf-panel is-quiet gf-log is-empty",
      attrs: { "aria-label": "Battle record" },
      children: [this.plateEl, this.list, this.toggleEl],
    });
  }

  /** True while the whole history is showing. */
  get expanded(): boolean {
    return this.open;
  }

  /** The lines on screen, oldest first — what the player can actually read. */
  get lines(): string[] {
    return [...this.list.querySelectorAll<HTMLElement>(".gf-log-text")].map(
      (node) => node.textContent ?? "",
    );
  }

  update(view: readonly LogEntryView[] | undefined): void {
    this.entries = view ?? [];
    this.render();
  }

  destroy(): void {
    this.el.remove();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.render();
  }

  private render(): void {
    const total = this.entries.length;
    const shown = this.open ? this.entries : this.entries.slice(-this.collapsedLines);
    const hidden = total - shown.length;
    this.el.classList.toggle("is-empty", total === 0);
    this.el.classList.toggle("is-expanded", this.open);
    const stamp = this.plateEl.querySelector(".gf-plate-stamp");
    if (stamp) stamp.textContent = total === 0 ? "" : `${total}`;
    replaceChildren(
      this.list,
      shown.map((entry) => renderEntry(entry)),
    );
    this.toggleEl.textContent = this.open ? "Collapse" : `Full record (${hidden} earlier)`;
    this.toggleEl.setAttribute("aria-expanded", this.open ? "true" : "false");
    // Nothing to expand into is nothing to offer: a drawer pull that opens onto
    // the same three lines is a control that lies about having a history.
    this.toggleEl.classList.toggle("is-hidden", hidden <= 0 && !this.open);
    // Newest last, so the tail is what the eye lands on; an expanded panel is
    // scrolled to it rather than to the opening of the battle.
    this.list.scrollTop = this.list.scrollHeight;
  }
}

function renderEntry(entry: LogEntryView): HTMLElement {
  const classes = [
    "gf-log-entry",
    KIND_CLASS[entry.kind],
    entry.actor === undefined || entry.actor.team === null ? "" : `is-${entry.actor.team}`,
    wholeMiss(entry) ? "is-miss" : "",
    tookSomebodyDown(entry) ? "is-down" : "",
  ]
    .filter((name) => name !== "")
    .join(" ");
  return el("li", {
    class: classes,
    data: { index: entry.index, kind: entry.kind },
    children: [
      el("span", { class: "gf-log-turn", text: `T${entry.turn}` }),
      el("span", { class: "gf-log-text", text: entry.text }),
    ],
  });
}
