import { Component, el, plate, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { LearnableView, LearningView, formatStanding } from "../state.js";
import { PASSIVE_SLOT_TEXT, mechanicsBlock } from "./mechanics.js";

const LIST_ID = "learning-list";

const SLOT_LABELS: Record<LearnableView["slot"], string> = {
  action: "Action",
  reaction: "Reaction",
  support: "Support",
  movement: "Movement",
};

/** What the row says the order does, in one line. Never the prose. */
function rowNote(entry: LearnableView): string {
  if (entry.mechanics !== undefined) return entry.mechanics.summary;
  return PASSIVE_SLOT_TEXT[entry.slot];
}

/** Spend Standing on the current job's ability list. */
export class LearningScreen implements Component<LearningView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly detail: HTMLElement;
  private readonly standingEl: HTMLElement;
  private view: LearningView | null = null;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-learn-detail" });
    this.standingEl = el("p", { class: "gf-screen-note gf-standing" });
    this.el = el("section", {
      class: "gf-screen gf-learning",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [
                el("h1", { class: "gf-screen-title", text: "Abilities" }),
                this.standingEl,
                el("p", {
                  class: "gf-screen-note gf-standing-rule",
                  text: "Standing is banked per job: 10 for every action a unit resolves in a battle it wins.",
                }),
              ],
            }),
          ],
        }),
        el("div", { class: "gf-screen-cols", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  update(view: LearningView): void {
    this.view = view;
    this.standingEl.textContent = `${view.unitName} · ${view.jobName} · ${formatStanding(view.standing)}`;
    const menu = this.listMenu(view);
    if (this.menus.path[0] === LIST_ID) this.menus.refresh(menu);
    else this.menus.push(menu);
    this.renderDetail(view.entries[Math.max(0, this.menus.cursor)] ?? null, view.standing);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private listMenu(view: LearningView): MenuDef {
    return {
      id: LIST_ID,
      title: "Learnable",
      cancellable: false,
      entries: view.entries.map((entry) => {
        const reason = entry.learned
          ? "Already learned"
          : entry.standingCost > view.standing
            ? "Insufficient Standing"
            : undefined;
        return {
          id: entry.abilityId,
          label: entry.name,
          detail: formatStanding(entry.standingCost),
          // What it does, on the row, before a single point is spent.
          note: rowNote(entry),
          disabled: reason !== undefined,
          ...(reason === undefined ? {} : { disabledReason: reason }),
        };
      }),
      onCursor: (entry) => {
        const learnable = view.entries.find((e) => e.abilityId === entry.id) ?? null;
        this.renderDetail(learnable, view.standing);
      },
      onSelect: (entry) => {
        const learnable = view.entries.find((e) => e.abilityId === entry.id);
        if (learnable) this.menus.push(this.confirmMenu(view, learnable));
      },
      onCancel: () => this.intents.closeScreen(),
    };
  }

  private confirmMenu(view: LearningView, entry: LearnableView): MenuDef {
    return {
      id: `learning-confirm-${entry.abilityId}`,
      title: entry.name,
      entries: [
        {
          id: "confirm",
          label: `Spend ${entry.standingCost}`,
          detail: `Remaining ${view.standing - entry.standingCost}`,
          // The stamp itself repeats what is being bought: the record beside the
          // list is the fuller answer, but this is the row under the cursor.
          note: rowNote(entry),
        },
        { id: "withdraw", label: "Withdraw" },
      ],
      onSelect: (choice) => {
        if (choice.id === "confirm") this.intents.learnAbility(view.unitId, entry.abilityId);
        this.menus.pop();
      },
    };
  }

  private renderDetail(entry: LearnableView | null, standing: number): void {
    if (!entry) {
      replaceChildren(this.detail, [
        plate("Ability"),
        el("p", { class: "gf-empty-note", text: "No ability selected." }),
      ]);
      return;
    }
    replaceChildren(this.detail, [
      plate("Ability", entry.learned ? "LEARNED" : SLOT_LABELS[entry.slot].toUpperCase()),
      el("div", {
        class: "gf-detail-body",
        children: [
          el("h2", { class: "gf-detail-title", text: entry.name }),
          el("p", {
            class: "gf-detail-sub",
            text: `${SLOT_LABELS[entry.slot]} · ${formatStanding(entry.standingCost)}`,
          }),
          // The mechanics come before the prose: the prose says what the order is
          // for, and it used to be the only thing on the page that said anything.
          mechanicsBlock(
            entry.mechanics,
            `${PASSIVE_SLOT_TEXT[entry.slot]}. It issues no order, so it has no reach of its own.`,
          ),
          el("p", { class: "gf-detail-text", text: entry.description }),
          el("p", {
            class: "gf-detail-note",
            text: entry.learned
              ? "Already learned"
              : entry.standingCost > standing
                ? `Insufficient Standing — ${entry.standingCost - standing} short`
                : `Standing after: ${standing - entry.standingCost}`,
          }),
        ],
      }),
    ]);
  }
}
