import { Component, el, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { LearnableView, LearningView, formatStanding } from "../state.js";

const LIST_ID = "learning-list";

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
          children: [el("h1", { class: "gf-screen-title", text: "Abilities" }), this.standingEl],
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
        { id: "confirm", label: `Spend ${entry.standingCost}`, note: `Remaining ${view.standing - entry.standingCost}` },
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
      replaceChildren(this.detail, [el("p", { class: "gf-empty-note", text: "No ability selected." })]);
      return;
    }
    replaceChildren(this.detail, [
      el("h2", { class: "gf-detail-title", text: entry.name }),
      el("p", { class: "gf-detail-sub", text: `${entry.slot} · Charge ${entry.chargeCost}` }),
      el("p", { class: "gf-detail-text", text: entry.description }),
      el("p", { class: "gf-detail-cost", text: formatStanding(entry.standingCost) }),
      el("p", {
        class: "gf-detail-note",
        text: entry.learned
          ? "Already learned"
          : entry.standingCost > standing
            ? `Insufficient Standing — ${entry.standingCost - standing} short`
            : `Standing after: ${standing - entry.standingCost}`,
      }),
    ]);
  }
}
