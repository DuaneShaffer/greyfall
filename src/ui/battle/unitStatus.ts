import { Component, chip, el, meter, plate, portrait, replaceChildren } from "../dom.js";
import type { ObjectInspectView, PowerNodeState, UnitView } from "../state.js";

export type UnitPanelRole = "acting" | "inspect";

const ROLE_TITLE: Record<UnitPanelRole, string> = {
  acting: "Acting",
  inspect: "Inspecting",
};

const POWER_LABEL: Record<PowerNodeState, string> = {
  live: "Live",
  dead: "Dead",
  open: "Open",
  cut: "Cut",
  destroyed: "Destroyed",
  tripped: "Tripped",
  "tie-open": "Tie Open",
  "tie-closed": "Tie Closed",
};

const isObject = (view: UnitView | ObjectInspectView): view is ObjectInspectView =>
  "kind" in view && view.kind === "object";

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
export class UnitStatusPanel implements Component<UnitView | ObjectInspectView | null> {
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

  update(subject: UnitView | ObjectInspectView | null): void {
    this.el.classList.toggle("is-empty", subject === null);
    this.el.classList.toggle("is-machine", subject !== null && isObject(subject));
    if (!subject) {
      replaceChildren(this.el, [
        plate(ROLE_TITLE[this.role]),
        el("p", { class: "gf-empty-note", text: "No unit selected." }),
      ]);
      return;
    }
    if (isObject(subject)) {
      this.updateObject(subject);
      return;
    }
    const unit = subject;
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
              // Facing is the acting unit's to change, so it is printed where it
              // is actionable. A hovered unit's absolute facing is on its sprite,
              // and the angle that decides a hit is on the forecast.
              this.role === "acting"
                ? el("p", { class: "gf-unit-facing", text: `Facing ${unit.facing}` })
                : null,
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
          // A committed charge is a fact about this unit, and the card is where
          // the player is already looking when they ask what it is doing.
          unit.charging === undefined
            ? null
            : el("div", {
                class: "gf-unit-charging",
                children: [
                  el("span", { class: "gf-field-label", text: "Charging" }),
                  el("span", { class: "gf-field-value", text: unit.charging.abilityName }),
                  el("span", {
                    class: "gf-unit-charging-when",
                    text:
                      unit.charging.ticksUntil === null
                        ? "Resolves later"
                        : unit.charging.ticksUntil === 0
                          ? "Resolves now"
                          : `Resolves in ${unit.charging.ticksUntil}`,
                  }),
                ],
              }),
          // Three figures the player reads rather than watches. CT had a meter of
          // its own until the queue beside it started printing the same fact in
          // ticks; what is left is the number, punched beside the pair the Assay
          // files on everyone.
          el("div", {
            class: "gf-unit-gauges",
            children: [
              this.gauge("CT", String(unit.ct)),
              this.gauge("Resolve", String(unit.disposition.resolve)),
              this.gauge("Attunement", String(unit.disposition.attunement)),
            ],
          }),
        ],
      }),
      // Nothing in force draws no row. "No status effects" was a chip, a rule and
      // a strip of padding spent saying that a list is empty, which an empty list
      // says by being absent — and the room it cost is room the figures above it
      // now use.
      unit.statuses.length === 0 && modifiers.length === 0
        ? null
        : el("ul", {
            class: "gf-chip-row gf-unit-statuses",
            children: [
              ...unit.statuses.map((status) =>
                this.statusChip(status.name, status.category, status.remainingTurns, "gf-unit-status"),
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

  /**
   * A machine's readout, in the same panel and the same shape. Machinery is
   * copper (ART_DIRECTION §2), so the panel says so through the plate stamp and
   * its own class rather than by borrowing a team tint it does not have.
   */
  private updateObject(object: ObjectInspectView): void {
    delete this.el.dataset["team"];
    const power = object.power === null ? "Inert" : POWER_LABEL[object.power];
    replaceChildren(this.el, [
      plate(ROLE_TITLE[this.role], "MACHINE"),
      el("header", {
        class: "gf-unit-head",
        children: [
          el("div", {
            class: "gf-unit-ident",
            children: [
              el("h2", { class: "gf-unit-name", text: object.name }),
              el("p", { class: "gf-unit-job", text: object.category }),
            ],
          }),
        ],
      }),
      el("div", {
        class: "gf-unit-readout",
        children: [
          object.maxHp === null || object.hp === null
            ? el("div", {
                class: "gf-unit-bar",
                children: [
                  el("span", { class: "gf-field-label", text: "Integrity" }),
                  el("span", { class: "gf-field-value", text: "Indestructible" }),
                ],
              })
            : this.bar(
                "Integrity",
                `${object.hp} / ${object.maxHp}`,
                meter("is-hp", object.hp, object.maxHp),
              ),
          el("div", { class: "gf-unit-gauges", children: [this.gauge("Power", power)] }),
        ],
      }),
      object.destroyed && el("p", { class: "gf-unit-downed", text: "Destroyed" }),
    ]);
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

  /** One punched figure: what it is over what it reads. */
  private gauge(label: string, value: string): HTMLElement {
    return el("div", {
      class: "gf-gauge",
      children: [
        el("span", { class: "gf-gauge-label", text: label }),
        el("span", { class: "gf-gauge-value", text: value }),
      ],
    });
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
