import { Component, el, plate, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { JobOptionView, JobsView, formatStanding } from "../state.js";

const LIST_ID = "jobs-list";
const MAX_JOB_LEVEL = 8;

/**
 * The rule the playtest never found: Standing is not a wallet. It is banked per
 * job, 10 for every action a unit resolves, and only a battle it wins banks it.
 */
export const STANDING_RULE =
  "Standing is banked per job: 10 for every action a unit resolves in a battle it wins. Each job spends only its own.";

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
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [
                el("h1", { class: "gf-screen-title", text: "Jobs" }),
                this.headerEl,
                el("p", { class: "gf-screen-note gf-standing-rule", text: STANDING_RULE }),
              ],
            }),
          ],
        }),
        el("div", { class: "gf-screen-cols", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  update(view: JobsView): void {
    this.headerEl.textContent = `${view.unitName} · Primary: ${view.primaryJobName} · Secondary: ${
      view.secondaryJobName ?? "none borrowed"
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
        // "Lv 3" read as the unit's level on a screen that also shows the unit's
        // level; it is the job's, and it says so.
        detail: `Job level ${option.jobLevel} · ${formatStanding(option.standing)} here`,
        ...(option.isPrimary
          ? { note: "Primary — its stat curve and skillset are the unit's own" }
          : option.isSecondary
            ? { note: "Secondary — its learned abilities are on loan to the Act menu" }
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
          note: "Its stat curve and skillset become the unit's own. Standing already banked in each job stays with that job.",
          disabled: option.isPrimary,
          disabledReason: "Already the primary job",
        },
        {
          id: "secondary",
          label: "Borrow as secondary",
          note: "Its learned abilities join the Act menu. Nothing else about the unit changes.",
          disabled: option.isPrimary || option.isSecondary,
          disabledReason: option.isPrimary ? "Already the primary job" : "Already borrowed",
        },
        { id: "clear", label: "Clear secondary", note: "Hand the borrowed skillset back." },
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
      replaceChildren(this.detail, [
        plate("Job"),
        el("p", { class: "gf-empty-note", text: "No job selected." }),
      ]);
      return;
    }
    replaceChildren(this.detail, [
      plate(
        "Job",
        option.isPrimary
          ? "PRIMARY"
          : option.isSecondary
            ? "SECONDARY"
            : `JOB LV ${option.jobLevel}`,
      ),
      el("div", {
        class: "gf-detail-body",
        children: [
          el("h2", { class: "gf-detail-title", text: option.name }),
          el("dl", {
            class: "gf-ledger",
            children: [
              el("dt", { text: "Job level" }),
              el("dd", { text: `${option.jobLevel} of ${MAX_JOB_LEVEL}` }),
              el("dt", { text: "Standing banked here" }),
              el("dd", { class: "gf-detail-standing", text: String(option.standing) }),
            ],
          }),
          el("p", { class: "gf-detail-text", text: option.description }),
          option.lockedReason !== undefined &&
            el("p", { class: "gf-detail-note is-refused", text: option.lockedReason }),
        ],
      }),
    ]);
  }
}
