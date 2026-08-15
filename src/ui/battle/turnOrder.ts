import { Component, el, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import type { TurnOrderEntryView, TurnOrderView } from "../state.js";

/** Upcoming turns, charging casts included, soonest first. */
export class TurnOrderStrip implements Component<TurnOrderView> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private readonly list: HTMLElement;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.list = el("ol", { class: "gf-turn-list" });
    this.el = el("section", {
      class: "gf-panel gf-turn-order",
      attrs: { "aria-label": "Turn order" },
      children: [el("h2", { class: "gf-panel-title", text: "Turn Order" }), this.list],
    });
  }

  update(view: TurnOrderView): void {
    replaceChildren(
      this.list,
      view.entries.map((entry, index) => this.renderEntry(entry, index)),
    );
  }

  destroy(): void {
    this.el.remove();
  }

  private renderEntry(entry: TurnOrderEntryView, index: number): HTMLElement {
    const node = el("li", {
      class: `gf-turn-entry is-${entry.team}${entry.kind === "cast" ? " is-cast" : ""}${index === 0 ? " is-now" : ""}`,
      data: { unit: entry.unitId, kind: entry.kind },
      children: [
        portrait(entry.portraitId, entry.name),
        el("div", {
          class: "gf-turn-labels",
          children: [
            el("span", { class: "gf-turn-name", text: entry.name }),
            el("span", {
              class: "gf-turn-detail",
              text: entry.kind === "cast" ? `Charging · ${entry.abilityName ?? "Ability"}` : entry.jobName,
            }),
          ],
        }),
        el("span", {
          class: "gf-turn-ticks",
          text: entry.ticksUntil === 0 ? "Now" : `+${entry.ticksUntil}`,
        }),
      ],
    });
    node.addEventListener("mouseenter", () => this.intents.inspectUnit(entry.unitId));
    node.addEventListener("mouseleave", () => this.intents.inspectUnit(null));
    return node;
  }
}
