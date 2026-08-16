import { Component, el, labelledValue, portrait, replaceChildren } from "../dom.js";
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

/** The commit-or-back-out panel: who, at what odds, for how much. */
export class ForecastPanel implements Component<ForecastView | null> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private view: ForecastView | null = null;
  private readonly body: HTMLElement;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.body = el("div", { class: "gf-forecast-body" });
    this.el = el("section", {
      class: "gf-panel gf-forecast is-empty",
      attrs: { "aria-label": "Action forecast" },
      children: [this.body],
    });
  }

  update(view: ForecastView | null): void {
    this.view = view;
    this.el.classList.toggle("is-empty", view === null);
    if (!view) {
      replaceChildren(this.body, [el("p", { class: "gf-empty-note", text: "No action selected." })]);
      return;
    }
    replaceChildren(this.body, [
      el("header", {
        class: "gf-forecast-head",
        children: [
          portrait(view.attacker.portraitId, view.attacker.name),
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
      el("ul", {
        class: "gf-forecast-targets",
        children: view.targets.map((target) => this.renderTarget(target)),
      }),
      el("footer", {
        class: "gf-forecast-footer",
        children: [
          el("button", {
            class: "gf-button",
            attrs: { type: "button" },
            text: "Commit",
          }),
          el("span", { class: "gf-hint", text: "Escape withdraws" }),
        ],
      }),
    ]);
    const commit = this.el.querySelector<HTMLButtonElement>(".gf-button");
    commit?.addEventListener("click", () => this.confirm());
  }

  /** Commits the pending action against its first target. */
  confirm(): void {
    const view = this.view;
    const first = view?.targets[0];
    if (!view || !first) return;
    const target = { kind: "unit" as const, unitId: first.unitId };
    if (view.item) {
      this.intents.confirmItemTarget(view.attacker.unitId, view.item.itemId, target);
      return;
    }
    this.intents.confirmTarget(view.attacker.unitId, view.abilityId, target);
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
    return el("li", {
      class: "gf-forecast-target",
      data: { unit: target.unitId },
      children: [
        portrait(target.portraitId, target.name),
        el("div", {
          class: "gf-forecast-numbers",
          children: [
            el("h3", { class: "gf-forecast-target-name", text: target.name }),
            labelledValue("Hit", `${target.hitChancePercent}%`, "gf-forecast-hit"),
            labelledValue(damageLabel, damageText, "gf-forecast-damage"),
            el("ul", {
              class: "gf-forecast-statuses",
              children:
                target.statuses.length === 0
                  ? [el("li", { class: "gf-forecast-status is-none", text: "No status effects" })]
                  : target.statuses.map((status) =>
                      el("li", {
                        class: "gf-forecast-status",
                        text: `${status.name} ${status.chancePercent}%`,
                      }),
                    ),
            }),
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
