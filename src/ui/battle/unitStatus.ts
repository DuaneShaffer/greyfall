import { Component, chip, el, meter, plate, portrait, replaceChildren } from "../dom.js";
import type { UnitView } from "../state.js";

export type UnitPanelRole = "acting" | "inspect";

const ROLE_TITLE: Record<UnitPanelRole, string> = {
  acting: "Acting",
  inspect: "Inspecting",
};

const TEAM_STAMP: Record<string, string> = {
  player: "OURS",
  enemy: "HOSTILE",
  neutral: "NEUTRAL",
};

/**
 * One unit's readout. Two of these are on screen: the acting unit's, joined to
 * its order menu and carrying the panel's live weight, and a quieter one for
 * whatever the cursor is over. The plate says which is which — the panels are
 * otherwise identical, so the player learns one shape.
 */
export class UnitStatusPanel implements Component<UnitView | null> {
  readonly el: HTMLElement;
  private readonly role: UnitPanelRole;

  constructor(options: { role?: UnitPanelRole } = {}) {
    this.role = options.role ?? "inspect";
    this.el = el("section", {
      class: `gf-panel gf-unit-panel is-empty is-${this.role} ${
        this.role === "acting" ? "is-live" : "is-quiet"
      }`,
      attrs: { "aria-label": `${ROLE_TITLE[this.role]} unit` },
    });
    this.update(null);
  }

  update(unit: UnitView | null): void {
    this.el.classList.toggle("is-empty", unit === null);
    if (!unit) {
      replaceChildren(this.el, [
        plate(ROLE_TITLE[this.role]),
        el("p", { class: "gf-empty-note", text: "No unit selected." }),
      ]);
      return;
    }
    this.el.dataset["team"] = unit.team;
    const modifiers = unit.modifiers ?? [];
    replaceChildren(this.el, [
      plate(ROLE_TITLE[this.role], TEAM_STAMP[unit.team] ?? unit.team.toUpperCase()),
      el("header", {
        class: "gf-unit-head",
        children: [
          portrait(unit.portraitId, unit.name, { team: unit.team, jobName: unit.jobName }),
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
      el("div", {
        class: "gf-unit-readout",
        children: [
          this.bar("HP", `${unit.hp} / ${unit.maxHp}`, meter("is-hp", unit.hp, unit.maxHp)),
          this.bar(
            "Charge",
            `${unit.charge} / ${unit.maxCharge}`,
            meter("is-charge", unit.charge, unit.maxCharge),
          ),
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
        ],
      }),
      el("ul", {
        class: "gf-chip-row gf-unit-statuses",
        children:
          unit.statuses.length === 0 && modifiers.length === 0
            ? [el("li", { class: "gf-chip is-none gf-unit-status", text: "No status effects" })]
            : [
                ...unit.statuses.map((status) =>
                  this.statusChip(
                    status.name,
                    status.category,
                    status.remainingTurns,
                    "gf-unit-status",
                  ),
                ),
                // Timed stat changes used to be invisible: the number moved and
                // nothing on screen said why or for how long.
                ...modifiers.map((mod) =>
                  this.statusChip(
                    mod.label,
                    mod.direction === "loss" ? "mod is-loss" : "mod",
                    mod.remainingTurns,
                    "gf-unit-modifier",
                  ),
                ),
              ],
      }),
      unit.downed && el("p", { class: "gf-unit-downed", text: "Downed" }),
    ]);
  }

  destroy(): void {
    this.el.remove();
  }

  private statusChip(
    label: string,
    tone: string,
    remainingTurns: number | null,
    className: string,
  ): HTMLElement {
    const node = chip(
      label,
      tone,
      remainingTurns === null ? undefined : ` (${remainingTurns})`,
    );
    node.classList.add(className);
    node.title = remainingTurns === null ? "Until removed" : `${remainingTurns} turns remaining`;
    return node;
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
