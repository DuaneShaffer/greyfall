import { Component, el, meter, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { DeploymentView } from "../state.js";

const LIST_ID = "deployment-roster";

/**
 * Formation screen. Deliberately minimal: confirming a roster entry drops it on
 * the next free deployment tile and confirming it again pulls it back off, so
 * the whole screen is one list and the same confirm key the rest of the game
 * uses. Choosing *which* tile is a later pass.
 */
export class DeploymentScreen implements Component<DeploymentView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly detail: HTMLElement;
  private readonly headerEl: HTMLElement;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-deploy-detail" });
    this.headerEl = el("p", { class: "gf-screen-note" });
    this.el = el("section", {
      class: "gf-screen gf-deployment",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [el("h1", { class: "gf-screen-title", text: "Formation" }), this.headerEl],
        }),
        el("div", { class: "gf-screen-cols", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  update(view: DeploymentView): void {
    const assigned = view.slots.filter((slot) => slot.unitId !== null).length;
    this.headerEl.textContent = `${view.encounterName} · ${assigned}/${view.maxDeployed} deployed`;
    const menu = this.rosterMenu(view);
    if (this.menus.path[0] === LIST_ID) this.menus.refresh(menu);
    else this.menus.push(menu);
    this.renderSlots(view);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private rosterMenu(view: DeploymentView): MenuDef {
    return {
      id: LIST_ID,
      title: "Deploy",
      cancellable: false,
      entries: [
        ...view.candidates.map((candidate) => ({
          id: candidate.unitId,
          label: candidate.name,
          detail: `${candidate.jobName} · ${candidate.level}`,
          note: candidate.assigned ? "On the field" : "Reserve",
          disabled: candidate.unavailableReason !== undefined,
          ...(candidate.unavailableReason === undefined
            ? {}
            : { disabledReason: candidate.unavailableReason }),
        })),
        {
          id: "__confirm",
          label: "Move out",
          disabled: !view.canConfirm,
          ...(view.blockedReason === undefined ? {} : { disabledReason: view.blockedReason }),
        },
        { id: "__back", label: "Back to roster" },
      ],
      onSelect: (entry) => {
        if (entry.id === "__confirm") {
          this.intents.confirmDeployment();
          return;
        }
        if (entry.id === "__back") {
          this.intents.closeScreen();
          return;
        }
        this.intents.toggleDeployment(entry.id);
      },
      onCancel: () => this.intents.closeScreen(),
    };
  }

  private renderSlots(view: DeploymentView): void {
    replaceChildren(this.detail, [
      el("h2", { class: "gf-detail-title", text: "Deployment tiles" }),
      el("ul", {
        class: "gf-deploy-slots",
        children: view.slots.map((slot) =>
          el("li", {
            class: `gf-deploy-slot${slot.unitId === null ? " is-empty" : ""}`,
            children: [
              el("span", { class: "gf-field-label", text: `${slot.tile.x},${slot.tile.y}` }),
              el("span", { class: "gf-field-value", text: slot.unitName ?? "—" }),
            ],
          }),
        ),
      }),
      ...view.candidates
        .filter((candidate) => candidate.assigned)
        .map((candidate) =>
          el("div", {
            class: "gf-unit-bar",
            children: [
              el("span", { class: "gf-field-label", text: candidate.name }),
              el("span", { class: "gf-field-value", text: `${candidate.hp} / ${candidate.maxHp}` }),
              meter("is-hp", candidate.hp, candidate.maxHp),
            ],
          }),
        ),
    ]);
  }
}
