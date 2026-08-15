import { Component, el, meter, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { PartyView, RosterEntryView, formatStanding } from "../state.js";

const ROSTER_ID = "roster";

/** Between-battle party list; the hub the other screens open from. */
export class RosterScreen implements Component<PartyView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly detail: HTMLElement;
  private view: PartyView | null = null;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-roster-detail" });
    this.el = el("section", {
      class: "gf-screen gf-roster",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("h1", { class: "gf-screen-title", text: "Party Roster" }),
            el("p", { class: "gf-screen-note" }),
          ],
        }),
        el("div", { class: "gf-screen-cols", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  update(view: PartyView): void {
    this.view = view;
    const menu = this.rosterMenu(view);
    if (this.menus.depth === 0) this.menus.push(menu);
    else this.menus.refresh(menu);
    this.renderDetail(view.members[Math.max(0, this.menus.cursor)] ?? null);
    const note = this.el.querySelector(".gf-screen-note");
    if (note) note.textContent = `Deployment limit: ${view.deployedLimit}`;
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private rosterMenu(view: PartyView): MenuDef {
    return {
      id: ROSTER_ID,
      title: "Roster",
      cancellable: false,
      entries: view.members.map((member) => ({
        id: member.unitId,
        label: member.name,
        detail: `${member.jobName} · ${member.level}`,
        ...(member.note === undefined ? {} : { note: member.note }),
        disabled: member.hp === 0,
        disabledReason: "Downed — unavailable until the next engagement",
      })),
      onCursor: (entry) => {
        const member = view.members.find((m) => m.unitId === entry.id) ?? null;
        this.renderDetail(member);
        if (member) this.intents.selectRosterUnit(member.unitId);
      },
      onSelect: (entry) => this.menus.push(this.unitActionsMenu(entry.id)),
    };
  }

  private unitActionsMenu(unitId: string): MenuDef {
    return {
      id: `roster-actions-${unitId}`,
      title: this.view?.members.find((m) => m.unitId === unitId)?.name ?? "Unit",
      entries: [
        { id: "sheet", label: "Unit Sheet" },
        { id: "abilities", label: "Abilities" },
        { id: "equipment", label: "Equipment" },
        { id: "jobs", label: "Jobs" },
      ],
      onSelect: (entry) => {
        if (entry.id === "sheet") this.intents.openUnitSheet(unitId);
        if (entry.id === "abilities") this.intents.openLearning(unitId);
        if (entry.id === "equipment") this.intents.openEquipment(unitId);
        if (entry.id === "jobs") this.intents.openJobs(unitId);
      },
    };
  }

  private renderDetail(member: RosterEntryView | null): void {
    if (!member) {
      replaceChildren(this.detail, [el("p", { class: "gf-empty-note", text: "No unit selected." })]);
      return;
    }
    replaceChildren(this.detail, [
      portrait(member.portraitId, member.name),
      el("h2", { class: "gf-detail-title", text: member.name }),
      el("p", { class: "gf-detail-sub", text: `${member.jobName} · Level ${member.level}` }),
      el("div", {
        class: "gf-unit-bar",
        children: [
          el("span", { class: "gf-field-label", text: "HP" }),
          el("span", { class: "gf-field-value", text: `${member.hp} / ${member.maxHp}` }),
          meter("is-hp", member.hp, member.maxHp),
        ],
      }),
      el("p", { class: "gf-detail-standing", text: formatStanding(member.standing) }),
      member.note !== undefined && el("p", { class: "gf-detail-note", text: member.note }),
    ]);
  }
}
