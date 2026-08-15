import { Component, el, meter, portrait, replaceChildren } from "../dom.js";
import type { UnitView } from "../state.js";

/** Hovered or selected unit: condition, charge, CT, standing statuses. */
export class UnitStatusPanel implements Component<UnitView | null> {
  readonly el: HTMLElement;

  constructor() {
    this.el = el("section", {
      class: "gf-panel gf-unit-status is-empty",
      attrs: { "aria-label": "Unit status" },
    });
    this.update(null);
  }

  update(unit: UnitView | null): void {
    this.el.classList.toggle("is-empty", unit === null);
    if (!unit) {
      replaceChildren(this.el, [el("p", { class: "gf-empty-note", text: "No unit selected." })]);
      return;
    }
    this.el.dataset["team"] = unit.team;
    replaceChildren(this.el, [
      el("header", {
        class: "gf-unit-head",
        children: [
          portrait(unit.portraitId, unit.name),
          el("div", {
            class: "gf-unit-ident",
            children: [
              el("h2", { class: "gf-unit-name", text: unit.name }),
              el("p", { class: "gf-unit-job", text: `${unit.jobName} · Level ${unit.level}` }),
              el("p", { class: "gf-unit-facing", text: `Facing ${unit.facing}` }),
            ],
          }),
        ],
      }),
      this.bar("HP", `${unit.hp} / ${unit.maxHp}`, meter("is-hp", unit.hp, unit.maxHp)),
      this.bar("Charge", `${unit.charge} / ${unit.maxCharge}`, meter("is-charge", unit.charge, unit.maxCharge)),
      this.bar("CT", `${unit.ct} / 100`, meter("is-ct", unit.ct, 100)),
      el("div", {
        class: "gf-unit-disposition",
        children: [
          el("span", { class: "gf-field-label", text: "Resolve" }),
          el("span", { class: "gf-field-value", text: String(unit.disposition.resolve) }),
          el("span", { class: "gf-field-label", text: "Attunement" }),
          el("span", { class: "gf-field-value", text: String(unit.disposition.attunement) }),
        ],
      }),
      el("ul", {
        class: "gf-unit-statuses",
        children:
          unit.statuses.length === 0
            ? [el("li", { class: "gf-unit-status is-none", text: "No status effects" })]
            : unit.statuses.map((status) =>
                el("li", {
                  class: `gf-unit-status is-${status.category}`,
                  title: status.remainingTurns === null ? "Until removed" : `${status.remainingTurns} turns remaining`,
                  text:
                    status.remainingTurns === null
                      ? status.name
                      : `${status.name} (${status.remainingTurns})`,
                }),
              ),
      }),
      unit.downed && el("p", { class: "gf-unit-downed", text: "Downed" }),
    ]);
  }

  destroy(): void {
    this.el.remove();
  }

  private bar(label: string, value: string, bar: HTMLElement): HTMLElement {
    return el("div", {
      class: "gf-unit-bar",
      children: [
        el("span", { class: "gf-field-label", text: label }),
        el("span", { class: "gf-field-value", text: value }),
        bar,
      ],
    });
  }
}
