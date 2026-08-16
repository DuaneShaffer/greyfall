import { Component, el, labelledValue, plate, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { ForecastTargetView, ForecastView, formatDamageRange, formatSigned } from "../state.js";

const FACING_LABELS: Record<NonNullable<ForecastTargetView["relativeFacing"]>, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};

/** An item costs no flux and no cast time; what it costs is itself. */
function costLine(view: ForecastView): string {
  if (view.item) return `Field kit · ${view.item.remaining} left after use`;
  return `Charge ${view.chargeCost} · ${view.castSpeed === null ? "Immediate" : `Cast ${view.castSpeed}`}`;
}

/**
 * The commit-or-back-out panel: who, at what odds, for how much.
 *
 * `lock()` is what the controller calls the instant an action is sent. The
 * numbers stay on screen — they are the record of what was ordered — but the
 * stamp goes dead, so a panel describing an action already in flight can never
 * be committed a second time.
 */
export class ForecastPanel implements Component<ForecastView | null> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private view: ForecastView | null = null;
  private readonly body: HTMLElement;
  private commitButton: HTMLButtonElement | null = null;
  private locked = false;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.body = el("div", { class: "gf-forecast-body" });
    this.el = el("section", {
      class: "gf-panel is-live gf-forecast is-empty",
      attrs: { "aria-label": "Action forecast" },
      children: [plate("Forecast"), this.body],
    });
  }

  get isLocked(): boolean {
    return this.locked;
  }

  update(view: ForecastView | null): void {
    // A committed order is the record of what was sent (UI_DESIGN §8): the
    // redraw that follows it carries no pending selection, and letting that
    // blank the panel threw the numbers away the instant they mattered most.
    // It holds until a new order is staged, or `clear()` closes the field.
    if (view === null && this.locked) return;
    this.view = view;
    this.locked = false;
    this.el.classList.toggle("is-empty", view === null);
    this.el.classList.remove("is-locked");
    if (!view) {
      this.commitButton = null;
      replaceChildren(this.body, [el("p", { class: "gf-empty-note", text: "No action selected." })]);
      return;
    }
    // An action aimed at nothing has nothing to commit. Offering the stamp
    // anyway is the panel claiming an outcome it cannot produce — but an
    // ability whose whole payload is a machine laid on an empty tile has an
    // outcome and no rows, and refusing it was the same lie in reverse.
    const empty = view.targets.length === 0 && view.effects.length === 0;
    const commit = el("button", {
      class: "gf-button",
      attrs: { type: "button", ...(empty ? { disabled: true } : {}) },
      text: "Commit",
    });
    commit.addEventListener("click", () => this.confirm());
    this.commitButton = commit;
    // Backing out needs a target the mouse can hit; Escape alone strands a
    // player who is only clicking.
    const withdraw = el("button", {
      class: "gf-button is-quiet gf-forecast-withdraw",
      attrs: { type: "button" },
      text: "Withdraw",
    });
    withdraw.addEventListener("click", () => {
      if (this.locked) return;
      this.intents.cancelSelection(view.attacker.unitId);
    });
    replaceChildren(this.body, [
      el("header", {
        class: "gf-forecast-head",
        children: [
          portrait(view.attacker.portraitId, view.attacker.name, {
            jobName: view.attacker.jobName,
          }),
          el("div", {
            class: "gf-forecast-heading",
            children: [
              el("h2", { class: "gf-forecast-ability", text: view.abilityName }),
              el("p", {
                class: "gf-forecast-attacker",
                text: `${view.attacker.name} · ${view.attacker.jobName}`,
              }),
              el("p", { class: "gf-forecast-cost", text: costLine(view) }),
            ],
          }),
        ],
      }),
      ...(view.effects.length === 0
        ? []
        : [
            el("ul", {
              class: "gf-forecast-effects is-ability",
              children: view.effects.map((line) =>
                el("li", { class: "gf-forecast-effect", text: line }),
              ),
            }),
          ]),
      empty
        ? el("p", { class: "gf-empty-note", text: "Nothing in the area. Pick another tile." })
        : view.targets.length === 0
          ? el("p", { class: "gf-empty-note", text: "Nobody in the area — the order stands." })
          : el("ul", {
              class: "gf-forecast-targets",
              children: view.targets.map((target) => this.renderTarget(target)),
            }),
      el("footer", {
        class: "gf-forecast-footer",
        children: [commit, withdraw],
      }),
    ]);
  }

  /** Commits the pending action against what it is actually aimed at. */
  confirm(): void {
    const view = this.view;
    if (!view || this.locked) return;
    if (view.targets.length === 0 && view.effects.length === 0) return;
    if (view.item) {
      this.intents.confirmItemTarget(view.attacker.unitId, view.item.itemId, view.aimedAt);
      return;
    }
    this.intents.confirmTarget(view.attacker.unitId, view.abilityId, view.aimedAt);
  }

  /** The order is away: keep the numbers, kill the stamp. */
  lock(): void {
    if (this.view === null) return;
    this.locked = true;
    this.el.classList.add("is-locked");
    if (this.commitButton !== null) {
      this.commitButton.disabled = true;
      this.commitButton.textContent = "Committed";
    }
  }

  /** Empty the panel whether or not it is holding a committed record. */
  clear(): void {
    this.locked = false;
    this.update(null);
  }

  destroy(): void {
    this.el.remove();
  }

  private renderTarget(target: ForecastTargetView): HTMLElement {
    const damage = target.damage;
    const damageLabel = damage?.kind === "heal" ? "Recovery" : "Damage";
    const damageText =
      damage === null
        ? "—"
        : `${formatDamageRange(damage)}${damage.damageType ? ` ${damage.damageType}` : ""}`;
    // Machinery has no facing and no portrait: it reads as a machine, in copper.
    const isObject = target.relativeFacing === null && target.portraitId === undefined;
    // An order that deals no damage prints no damage row: "Damage —" beside a
    // three-turn buff reads as "this does nothing".
    const silent = target.statuses.length === 0 && target.effects.length === 0;
    return el("li", {
      class: `gf-forecast-target${isObject ? " is-object" : ""}`,
      data: { unit: target.unitId },
      children: [
        portrait(target.portraitId, target.name),
        el("div", {
          class: "gf-forecast-numbers",
          children: [
            el("h3", { class: "gf-forecast-target-name", text: target.name }),
            labelledValue("Hit", `${target.hitChancePercent}%`, "gf-forecast-hit"),
            ...(damage === null ? [] : [labelledValue(damageLabel, damageText, "gf-forecast-damage")]),
            el("ul", {
              class: "gf-forecast-statuses",
              children: silent
                ? [el("li", { class: "gf-forecast-status is-none", text: "No further effect" })]
                : target.statuses.map((status) =>
                    el("li", {
                      class: "gf-forecast-status",
                      text: `${status.name} ${status.chancePercent}%`,
                    }),
                  ),
            }),
            ...(target.effects.length === 0
              ? []
              : [
                  el("ul", {
                    class: "gf-forecast-effects",
                    children: target.effects.map((line) =>
                      el("li", { class: "gf-forecast-effect", text: line }),
                    ),
                  }),
                ]),
            el("p", {
              class: "gf-forecast-modifiers",
              text: [
                target.relativeFacing ? FACING_LABELS[target.relativeFacing] : null,
                target.heightAdvantage === 0 ? null : `Height ${formatSigned(target.heightAdvantage)}`,
              ]
                .filter((part): part is string => part !== null)
                .join(" · "),
            }),
          ],
        }),
      ],
    });
  }
}
