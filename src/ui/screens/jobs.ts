import { Component, el, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { JobOptionView, JobsView, formatStanding } from "../state.js";

const LIST_ID = "jobs-list";

/** Pick a primary job or borrow a secondary skillset. */
export class JobScreen implements Component<JobsView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly detail: HTMLElement;
  private readonly headerEl: HTMLElement;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-jobs-detail" });
    this.headerEl = el("p", { class: "gf-screen-note" });
    this.el = el("section", {
      class: "gf-screen gf-jobs",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [el("h1", { class: "gf-screen-title", text: "Jobs" }), this.headerEl],
        }),
        el("div", { class: "gf-screen-cols", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  update(view: JobsView): void {
    this.headerEl.textContent = `${view.unitName} · ${view.primaryJobName}${
      view.secondaryJobName === null ? "" : ` / ${view.secondaryJobName}`
    }`;
    const menu = this.listMenu(view);
    if (this.menus.path[0] === LIST_ID) this.menus.refresh(menu);
    else this.menus.push(menu);
    this.renderDetail(view.options[Math.max(0, this.menus.cursor)] ?? null);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private listMenu(view: JobsView): MenuDef {
    return {
      id: LIST_ID,
      title: "Jobs",
      cancellable: false,
      entries: view.options.map((option) => ({
        id: option.jobId,
        label: option.name,
        detail: `Lv ${option.jobLevel} · ${formatStanding(option.standing)}`,
        ...(option.isPrimary
          ? { note: "Primary" }
          : option.isSecondary
            ? { note: "Secondary" }
            : {}),
        disabled: option.lockedReason !== undefined,
        ...(option.lockedReason === undefined ? {} : { disabledReason: option.lockedReason }),
      })),
      onCursor: (entry) => {
        this.renderDetail(view.options.find((o) => o.jobId === entry.id) ?? null);
      },
      onSelect: (entry) => {
        const option = view.options.find((o) => o.jobId === entry.id);
        if (option) this.menus.push(this.actionsMenu(view, option));
      },
      onCancel: () => this.intents.closeScreen(),
    };
  }

  private actionsMenu(view: JobsView, option: JobOptionView): MenuDef {
    return {
      id: `jobs-actions-${option.jobId}`,
      title: option.name,
      entries: [
        {
          id: "primary",
          label: "Take as primary",
          disabled: option.isPrimary,
          disabledReason: "Already the primary job",
        },
        {
          id: "secondary",
          label: "Borrow as secondary",
          disabled: option.isPrimary || option.isSecondary,
          disabledReason: option.isPrimary ? "Already the primary job" : "Already borrowed",
        },
        { id: "clear", label: "Clear secondary" },
      ],
      onSelect: (choice) => {
        if (choice.id === "primary") this.intents.changeJob(view.unitId, option.jobId);
        if (choice.id === "secondary") this.intents.setSecondaryJob(view.unitId, option.jobId);
        if (choice.id === "clear") this.intents.setSecondaryJob(view.unitId, null);
        this.menus.pop();
      },
    };
  }

  private renderDetail(option: JobOptionView | null): void {
    if (!option) {
      replaceChildren(this.detail, [el("p", { class: "gf-empty-note", text: "No job selected." })]);
      return;
    }
    replaceChildren(this.detail, [
      el("h2", { class: "gf-detail-title", text: option.name }),
      el("p", { class: "gf-detail-sub", text: `Job level ${option.jobLevel}` }),
      el("p", { class: "gf-detail-text", text: option.description }),
      el("p", { class: "gf-detail-cost", text: formatStanding(option.standing) }),
      option.lockedReason !== undefined &&
        el("p", { class: "gf-detail-note is-refused", text: option.lockedReason }),
    ]);
  }
}
