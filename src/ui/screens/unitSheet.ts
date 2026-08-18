import { Component, el, labelledValue, meter, panel, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { EQUIP_SLOT_LABELS, UnitSheetView, formatSigned, formatStanding } from "../state.js";

const PASSIVE_LABELS: Record<"reaction" | "support" | "movement", string> = {
  reaction: "Reaction",
  support: "Support",
  movement: "Movement",
};

const CANCEL_KEYS = new Set(["Escape", "Backspace"]);

/** Read-only record of a unit: stats, kit, learned abilities. */
export class UnitSheetScreen implements Component<UnitSheetView> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private keyTarget: EventTarget | null = null;
  // The sheet is the one between-battle page with no menu of its own, so it is
  // the one page nothing was listening on: the hint said Escape returned to the
  // roster and Escape did nothing at all.
  private readonly onKeyDown = (event: Event): void => {
    if (!CANCEL_KEYS.has((event as KeyboardEvent).key)) return;
    event.preventDefault();
    this.intents.closeScreen();
  };

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.el = el("section", { class: "gf-screen gf-unit-sheet" });
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

  update(view: UnitSheetView): void {
    const unit = view.unit;
    replaceChildren(this.el, [
      el("header", {
        class: "gf-screen-head",
        children: [
          portrait(unit.portraitId, unit.name, {
            size: "large",
            team: unit.team,
            jobName: unit.jobName,
          }),
          el("div", {
            class: "gf-screen-head-text",
            children: [
              el("h1", { class: "gf-screen-title", text: unit.name }),
              el("p", { class: "gf-screen-note", text: `${unit.jobName} · Level ${unit.level}` }),
              el("p", { class: "gf-screen-note", text: formatStanding(view.standing) }),
            ],
          }),
        ],
      }),
      el("div", {
        class: "gf-sheet-cols",
        children: [
          panel({
            title: "Condition",
            children: [
              this.bar("HP", `${unit.hp} / ${unit.maxHp}`, meter("is-hp", unit.hp, unit.maxHp)),
              this.bar("Charge", `${unit.charge} / ${unit.maxCharge}`, meter("is-charge", unit.charge, unit.maxCharge)),
              labelledValue("Resolve", String(unit.disposition.resolve)),
              labelledValue("Attunement", String(unit.disposition.attunement)),
            ],
          }),
          panel({
            title: "Attributes",
            children: [
              ...view.stats.map((stat) =>
                labelledValue(
                  stat.label,
                  stat.delta === undefined || stat.delta === 0
                    ? String(stat.value)
                    : `${stat.value} (${formatSigned(stat.delta)})`,
                  stat.delta === undefined || stat.delta === 0 ? "" : stat.delta > 0 ? "is-gain" : "is-loss",
                ),
              ),
              labelledValue("Move", String(view.move)),
              labelledValue("Jump", String(view.jump)),
              labelledValue("Evade", `${view.evade}%`),
            ],
          }),
          panel({
            title: "Equipment",
            children: [
              ...view.equipment.map((slot) =>
                labelledValue(EQUIP_SLOT_LABELS[slot.slot], slot.itemName ?? "Empty", "gf-equip-line"),
              ),
              el("h3", { class: "gf-panel-subtitle", text: "Slots" }),
              ...view.passives.map((passive) =>
                labelledValue(PASSIVE_LABELS[passive.slot], passive.abilityName ?? "Unassigned"),
              ),
            ],
          }),
          panel({
            title: "Abilities",
            children: [
              el("ul", {
                class: "gf-ability-list",
                children:
                  view.learnedAbilities.length === 0
                    ? [el("li", { class: "gf-empty-note", text: "None learned." })]
                    : view.learnedAbilities.map((ability) =>
                        el("li", {
                          class: "gf-ability",
                          children: [
                            el("span", { class: "gf-ability-name", text: ability.name }),
                            el("span", { class: "gf-ability-cost", text: `Charge ${ability.chargeCost}` }),
                            el("p", { class: "gf-ability-text", text: ability.description }),
                          ],
                        }),
                      ),
              }),
            ],
          }),
        ],
      }),
    ]);
  }

  destroy(): void {
    this.detach();
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
