import { Component, el, plate, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import type { TurnOrderEntryView, TurnOrderView } from "../state.js";

/**
 * Upcoming turns, charging casts included, soonest first — the order the engine
 * will actually resolve them in.
 *
 * Several units are routinely tied at the CT threshold, and calling all of them
 * "Now" told the player nothing. The queue is numbered instead: one Now, then
 * Next for everything else already at the line, then the tick countdown.
 */
export class TurnOrderStrip implements Component<TurnOrderView> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private readonly list: HTMLElement;
  private readonly plateEl: HTMLElement;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.list = el("ol", { class: "gf-turn-list" });
    this.plateEl = plate("Turn Order", "");
    this.el = el("section", {
      class: "gf-panel is-quiet gf-turn-order",
      attrs: { "aria-label": "Turn order" },
      children: [this.plateEl, this.list],
    });
  }

  update(view: TurnOrderView): void {
    const stamp = this.plateEl.querySelector(".gf-plate-stamp");
    if (stamp) stamp.textContent = `${view.entries.length}`;
    replaceChildren(
      this.list,
      view.entries.map((entry, index) => this.renderEntry(entry, index)),
    );
  }

  destroy(): void {
    this.el.remove();
  }

  private renderEntry(entry: TurnOrderEntryView, index: number): HTMLElement {
    const now = index === 0;
    // Ties at the threshold resolve in the order the preview lists them.
    const next = !now && entry.ticksUntil === 0;
    const classes = [
      "gf-turn-entry",
      `is-${entry.team}`,
      entry.kind === "cast" ? "is-cast" : "",
      now ? "is-now" : "",
      next ? "is-next" : "",
    ]
      .filter((name) => name !== "")
      .join(" ");
    const node = el("li", {
      class: classes,
      data: { unit: entry.unitId, kind: entry.kind },
      children: [
        el("span", { class: "gf-turn-index", text: String(index + 1).padStart(2, "0") }),
        portrait(entry.portraitId, entry.name, {
          size: "small",
          team: entry.team,
          jobName: entry.jobName,
        }),
        el("div", {
          class: "gf-turn-labels",
          children: [
            el("span", { class: "gf-turn-name", text: entry.name }),
            // A queue row is a name and a number. The job was a second line on
            // every row that the chip's job tab and the inspect card both
            // already carried; a charging cast is the one thing the row is the
            // only place to read, so it keeps its line.
            entry.kind === "cast"
              ? el("span", {
                  class: "gf-turn-detail",
                  text: `Charging · ${entry.abilityName ?? "Ability"}`,
                })
              : null,
          ],
        }),
        el("span", {
          class: "gf-turn-ticks",
          text: now ? "Now" : next ? "Next" : `+${entry.ticksUntil}`,
        }),
      ],
    });
    node.addEventListener("mouseenter", () => this.intents.inspectUnit(entry.unitId));
    node.addEventListener("mouseleave", () => this.intents.inspectUnit(null));
    return node;
  }
}
