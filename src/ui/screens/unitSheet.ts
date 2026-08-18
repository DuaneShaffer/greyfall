import { Component, el, labelledValue, meter, panel, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { EQUIP_SLOT_LABELS, UnitSheetView, formatSigned } from "../state.js";
import { formatStatValue } from "./vocabulary.js";

const PASSIVE_LABELS: Record<"reaction" | "support" | "movement", string> = {
  reaction: "Reaction",
  support: "Support",
  movement: "Movement",
};

const MAX_JOB_LEVEL = 8;

/**
 * Where Standing comes from, in one line. `STANDING_PER_ACTION` is 10 and a win
 * is what banks it (src/core/rules/abilities.ts, src/core/progression/ops.ts).
 * The playtest read "Standing" as a shared purse and it is neither shared nor a
 * purse.
 */
export const STANDING_EARNED_RULE =
  "10 Standing for every action this unit resolves in a battle, banked into the job it fought in — and only if the battle is won.";

/** How an empty passive slot gets filled, said on the slot itself. */
const PASSIVE_HINT = "Learn one from a job, then equip it here";

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
              el("p", { class: "gf-screen-note", text: unit.jobName }),
            ],
          }),
        ],
      }),
      el("div", {
        class: "gf-sheet-cols",
        children: [
          // Two levels, two names. The same unit read "Level 1" here and
          // "Enforcer level 2" on the roster, which is two tracks and not a
          // contradiction — but only once the record says which is which.
          panel({
            className: "gf-sheet-record",
            title: "Record",
            children: [
              labelledValue("Unit Level", String(unit.level), "gf-unit-level"),
              labelledValue(
                `Job Level (${unit.jobName})`,
                view.jobLevel === undefined
                  ? "—"
                  : `${view.jobLevel} of ${MAX_JOB_LEVEL}`,
                "gf-job-level",
              ),
              labelledValue(
                `Standing (${unit.jobName})`,
                String(view.standing),
                "gf-sheet-standing",
              ),
              el("p", { class: "gf-sheet-rule", text: STANDING_EARNED_RULE }),
            ],
          }),
          panel({
            title: "Condition",
            children: [
              this.bar("HP", `${unit.hp} / ${unit.maxHp}`, meter("is-hp", unit.hp, unit.maxHp)),
              this.bar("Charge", `${unit.charge} / ${unit.maxCharge}`, meter("is-charge", unit.charge, unit.maxCharge)),
              labelledValue("Resolve", String(unit.disposition.resolve)),
              labelledValue("Attunement", String(unit.disposition.attunement)),
            ],
          }),
          // Every stat the rules read off this unit, in its own unit. The record
          // used to leave the ones that decide a turn off the page entirely.
          panel({
            title: "Attributes",
            children: [
              ...view.stats.map((stat) =>
                labelledValue(
                  // The Condition panel above prints HP and Charge as
                  // current-of-max; these are the maxima the rules derive.
                  stat.key === "hp" || stat.key === "charge" ? `Max ${stat.label}` : stat.label,
                  stat.delta === undefined || stat.delta === 0
                    ? formatStatValue(stat.key, stat.value)
                    : `${formatStatValue(stat.key, stat.value)} (${formatSigned(stat.delta)})`,
                  stat.delta === undefined || stat.delta === 0 ? "" : stat.delta > 0 ? "is-gain" : "is-loss",
                ),
              ),
              labelledValue("Move", formatStatValue("move", view.move), "gf-stat-move"),
              labelledValue("Jump", formatStatValue("jump", view.jump), "gf-stat-jump"),
              labelledValue("Evade", formatStatValue("evade", view.evade), "gf-stat-evade"),
            ],
          }),
          panel({
            title: "Equipment",
            children: [
              ...view.equipment.map((slot) =>
                labelledValue(EQUIP_SLOT_LABELS[slot.slot], slot.itemName ?? "Empty", "gf-equip-line"),
              ),
              el("h3", { class: "gf-panel-subtitle", text: "Ability slots" }),
              // An unfilled slot is a free upgrade sitting on the floor. It used
              // to say "Unassigned" and leave the player to guess it was theirs.
              ...view.passives.map((passive) =>
                labelledValue(
                  PASSIVE_LABELS[passive.slot],
                  passive.abilityName ?? PASSIVE_HINT,
                  passive.abilityName === null ? "gf-slot-empty" : "",
                ),
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
                          data: { ability: ability.id },
                          children: [
                            el("span", { class: "gf-ability-name", text: ability.name }),
                            el("span", {
                              class: "gf-ability-cost",
                              text: ability.chargeCost === 0 ? "No charge" : `Charge ${ability.chargeCost}`,
                            }),
                            ability.mechanics !== undefined &&
                              el("p", {
                                class: "gf-ability-mechanics",
                                text: ability.mechanics.summary,
                              }),
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
