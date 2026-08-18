import { Component, el, plate, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import type { LogEntryView, TurnOrderEntryView, TurnOrderView } from "../state.js";

/** Whose side a row is on, in the word the record uses for it. */
const ALLEGIANCE: Record<string, string> = {
  player: "ally",
  enemy: "hostile",
  neutral: "neutral",
};

/**
 * Joins the queue has not answered for yet.
 *
 * A reinforcement that walks on mid-battle arrives in the queue as a name the
 * player has never seen, on a side they have to guess at. The band says who it
 * is and whose line they came in on, and it stands down the moment they have
 * taken a turn — by then the queue has introduced them itself.
 */
function unexplainedJoins(log: readonly LogEntryView[]): LogEntryView[] {
  const joins = log.filter((entry) => entry.kind === "join" && entry.actor !== undefined);
  if (joins.length === 0) return [];
  return joins.filter(
    (join) =>
      !log.some(
        (later) =>
          later.index > join.index && later.kind === "turn" && later.actor?.id === join.actor?.id,
      ),
  );
}

/**
 * Upcoming turns, charging casts included, soonest first — the order the engine
 * will actually resolve them in.
 *
 * Several units are routinely tied at the CT threshold, and calling all of them
 * "Now" told the player nothing. The queue is numbered instead: one Now, one
 * Next, then the ties that resolve behind it, then the tick countdown. Two rows
 * both stamped NEXT is the same lie in a smaller font — only one of them is
 * next, and the serial column already says which.
 */
export class TurnOrderStrip implements Component<TurnOrderView> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private readonly list: HTMLElement;
  private readonly joinsEl: HTMLElement;
  private readonly plateEl: HTMLElement;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.list = el("ol", { class: "gf-turn-list" });
    this.joinsEl = el("ul", { class: "gf-turn-joins" });
    this.plateEl = plate("Turn Order", "");
    this.el = el("section", {
      class: "gf-panel is-quiet gf-turn-order",
      attrs: { "aria-label": "Turn order" },
      children: [this.plateEl, this.joinsEl, this.list],
    });
  }

  /**
   * `log` is the battle's record, read only for the joins it names. The queue
   * itself is the view model's; nothing here re-derives an order of resolution.
   */
  update(view: TurnOrderView, log: readonly LogEntryView[] = []): void {
    const stamp = this.plateEl.querySelector(".gf-plate-stamp");
    if (stamp) stamp.textContent = `${view.entries.length}`;
    replaceChildren(
      this.joinsEl,
      unexplainedJoins(log).map((entry) => renderJoin(entry)),
    );
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
    // Ties at the threshold resolve in the order the preview lists them, so
    // exactly one of them is next and the rest come after it.
    const next = index === 1 && entry.ticksUntil === 0;
    const tied = index > 1 && entry.ticksUntil === 0;
    const classes = [
      "gf-turn-entry",
      `is-${entry.team}`,
      entry.kind === "cast" ? "is-cast" : "",
      now ? "is-now" : "",
      next ? "is-next" : "",
      tied ? "is-tied" : "",
    ]
      .filter((name) => name !== "")
      .join(" ");
    const when = now ? "Now" : next ? "Next" : tied ? "Then" : `+${entry.ticksUntil}`;
    const node = el("li", {
      class: classes,
      data: { unit: entry.unitId, kind: entry.kind, team: entry.team },
      // The rail says whose row this is in colour; this says it in words, for a
      // reader who cannot spend the colour.
      attrs: { "aria-label": `${entry.name} — ${ALLEGIANCE[entry.team] ?? entry.team} — ${when}` },
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
        el("span", { class: "gf-turn-ticks", text: when }),
      ],
    });
    node.addEventListener("mouseenter", () => this.intents.inspectUnit(entry.unitId));
    node.addEventListener("mouseleave", () => this.intents.inspectUnit(null));
    return node;
  }
}

function renderJoin(entry: LogEntryView): HTMLElement {
  const actor = entry.actor;
  const team = actor?.team ?? null;
  const side = team === null ? "" : ` — ${ALLEGIANCE[team] ?? team}`;
  return el("li", {
    class: `gf-turn-join${team === null ? "" : ` is-${team}`}`,
    data: { unit: actor?.id },
    text: `${actor?.name ?? "A newcomer"} joins the line${side}`,
  });
}
