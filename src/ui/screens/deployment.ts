import { Component, el, meter, plate, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { DeploymentView } from "../state.js";
import { summarizeSatchel } from "./equipment.js";

const LIST_ID = "deployment-roster";

export interface DeploymentOptions {
  intents?: Partial<UiIntents>;
  /** The unit waiting for a tile changed; the app lights the map for it. */
  onPlacing?: (unitId: string | null) => void;
}

/**
 * Formation. The list is only half of it: the other half is the battlefield
 * behind this rail, where the deployment tiles are lit and clickable.
 *
 * Pick a unit here, then click a tile out there. Confirming a listed unit still
 * drops it on the first free tile, so a player who wants one click to start
 * never has to learn the placement flow at all.
 */
export class DeploymentScreen implements Component<DeploymentView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly options: DeploymentOptions;
  private readonly detail: HTMLElement;
  private readonly headerEl: HTMLElement;
  private view: DeploymentView | null = null;
  private placing: string | null = null;

  constructor(options: DeploymentOptions = {}) {
    this.options = options;
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-deploy-detail" });
    this.headerEl = el("p", { class: "gf-screen-note" });
    this.el = el("section", {
      class: "gf-screen gf-deployment",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [el("h1", { class: "gf-screen-title", text: "Formation" }), this.headerEl],
            }),
          ],
        }),
        el("div", { class: "gf-deploy-rail", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  /** The unit waiting for a tile, or null when nothing is being placed. */
  get placingUnitId(): string | null {
    return this.placing;
  }

  update(view: DeploymentView): void {
    this.view = view;
    if (this.placing !== null && !view.candidates.some((c) => c.unitId === this.placing)) {
      this.setPlacing(null);
    }
    const assigned = view.slots.filter((slot) => slot.unitId !== null).length;
    this.headerEl.textContent = `${view.encounterName} · ${assigned} of ${view.maxDeployed} tiles filled`;
    const menu = this.rosterMenu(view);
    if (this.menus.path[0] === LIST_ID) this.menus.refresh(menu);
    else this.menus.push(menu);
    this.renderSlots(view);
  }

  /**
   * A click on the field. Returns true when the formation consumed it: placing
   * the held unit, or picking up whoever already stands there.
   */
  pickTile(tileIndex: number): boolean {
    const view = this.view;
    const slot = view?.slots[tileIndex];
    if (view === undefined || view === null || slot === undefined) return false;
    if (this.placing !== null) {
      this.intents.assignDeployment(this.placing, tileIndex);
      this.setPlacing(null);
      return true;
    }
    if (slot.unitId !== null) {
      this.setPlacing(slot.unitId);
      return true;
    }
    return false;
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private setPlacing(unitId: string | null): void {
    if (this.placing === unitId) return;
    this.placing = unitId;
    this.options.onPlacing?.(unitId);
    if (this.view !== null) {
      this.menus.refresh(this.rosterMenu(this.view));
      this.renderSlots(this.view);
    }
  }

  private rosterMenu(view: DeploymentView): MenuDef {
    const held = view.candidates.find((candidate) => candidate.unitId === this.placing) ?? null;
    return {
      id: LIST_ID,
      title: "Deploy",
      cancellable: false,
      entries: [
        ...view.candidates.map((candidate) => ({
          id: candidate.unitId,
          label: candidate.name,
          detail: `${candidate.jobName} ${candidate.level}`,
          note:
            candidate.unitId === this.placing
              ? "Pick a tile on the field"
              : candidate.assigned
                ? "On the field"
                : "Reserve",
          disabled: candidate.unavailableReason !== undefined,
          ...(candidate.unavailableReason === undefined
            ? {}
            : { disabledReason: candidate.unavailableReason }),
        })),
        ...(held !== null && held.assigned
          ? [{ id: "__withdraw", label: `Withdraw ${held.name}`, note: "Back to reserve" }]
          : []),
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
        if (entry.id === "__withdraw") {
          const unitId = this.placing;
          this.setPlacing(null);
          if (unitId !== null) this.intents.toggleDeployment(unitId);
          return;
        }
        // Confirming the held unit again puts it down. A unit already on the
        // field is picked up for re-placement; a reserve unit takes the first
        // free tile, so one-click starts never need the placement flow.
        if (this.placing === entry.id) {
          this.setPlacing(null);
          return;
        }
        const candidate = view.candidates.find((c) => c.unitId === entry.id);
        if (candidate?.assigned === true) {
          this.setPlacing(entry.id);
          return;
        }
        this.intents.toggleDeployment(entry.id);
      },
      onCancel: () => {
        if (this.placing !== null) {
          this.setPlacing(null);
          return;
        }
        this.intents.closeScreen();
      },
    };
  }

  private renderSlots(view: DeploymentView): void {
    const held = view.candidates.find((candidate) => candidate.unitId === this.placing) ?? null;
    replaceChildren(this.detail, [
      plate("Deployment tiles", `${view.slots.length}`),
      el("ul", {
        class: "gf-deploy-slots",
        children: view.slots.map((slot, index) =>
          el("li", {
            class: `gf-deploy-slot${slot.unitId === null ? " is-empty" : ""}${
              this.placing !== null ? " is-placing" : ""
            }`,
            data: { tile: `${index}` },
            children: [
              el("span", { class: "gf-field-label", text: `${slot.tile.x},${slot.tile.y}` }),
              el("span", { class: "gf-field-value", text: slot.unitName ?? "—" }),
              el("span", { class: "gf-menu-detail", text: slot.unitId === null ? "empty" : "" }),
            ],
          }),
        ),
      }),
      el("div", {
        class: "gf-detail-body",
        children: [
          el("p", {
            class: "gf-detail-note",
            text:
              held === null
                ? "Confirm a unit to field it, or click one already out there to move them."
                : `Holding ${held.name}. Click a lit tile.`,
          }),
          el("p", { class: "gf-detail-sub gf-satchel", text: summarizeSatchel(view.satchel) }),
          ...view.candidates
            .filter((candidate) => candidate.assigned)
            .map((candidate) =>
              el("div", {
                class: "gf-unit-bar",
                children: [
                  el("span", { class: "gf-field-label", text: candidate.name }),
                  el("span", {
                    class: "gf-field-value",
                    text: `${candidate.hp} / ${candidate.maxHp}`,
                  }),
                  meter("is-hp", candidate.hp, candidate.maxHp),
                ],
              }),
            ),
        ],
      }),
    ]);
  }
}
