import { Component, el, meter, plate, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { PartyView, RosterEntryView } from "../state.js";
import { takeVerbHint } from "./firstUse.js";
import { fallenPanel } from "./results.js";

const ROSTER_ID = "roster";

/**
 * Where the unit stands with the formation. The roster is where the player
 * decides who fights and it used to print neither the membership nor the count,
 * so "Move out" was a leap.
 */
function rosterNote(member: RosterEntryView): string | undefined {
  if (member.hp === 0) return "Downed";
  if (member.deployed === true) return "Deployed";
  if (member.deployed === false) return "Reserve";
  return member.note;
}

/** "3/4 deployed", from the staged formation rather than from the limit alone. */
function deployedLine(view: PartyView): string {
  const deployed =
    view.deployedCount ?? view.members.filter((member) => member.deployed === true).length;
  return `${deployed}/${view.deployedLimit} deployed`;
}

/** Between-battle party list; the hub the other screens open from. */
export class RosterScreen implements Component<PartyView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly detail: HTMLElement;
  private readonly fallen: HTMLElement;
  private readonly verbHint: HTMLElement;
  private view: PartyView | null = null;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-roster-detail" });
    this.fallen = el("div", { class: "gf-roster-fallen" });
    this.verbHint = el("p", { class: "gf-hint gf-verb-hint is-hidden" });
    this.el = el("section", {
      class: "gf-screen gf-roster",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [
                el("h1", { class: "gf-screen-title", text: "Party Roster" }),
                el("p", { class: "gf-screen-note" }),
                this.verbHint,
              ],
            }),
          ],
        }),
        el("div", {
          class: "gf-screen-cols",
          children: [
            el("div", { class: "gf-screen-col", children: [this.menus.el, this.fallen] }),
            this.detail,
          ],
        }),
      ],
    });
  }

  update(view: PartyView): void {
    this.view = view;
    const menu = this.rosterMenu(view);
    if (this.menus.depth === 0) this.menus.push(menu);
    else this.menus.refresh(menu);
    this.renderDetail(view.members[Math.max(0, this.menus.cursor)] ?? null);
    // The roster is the party's record, and the dead are on it: kept beside the
    // living, never mixed into the list the player deploys from.
    const fallen = view.fallen ?? [];
    replaceChildren(this.fallen, fallen.length === 0 ? [] : [fallenPanel(fallen, { compact: true })]);
    const note = this.el.querySelector(".gf-screen-note");
    if (note) note.textContent = deployedLine(view);
    this.showVerbHint();
  }

  /** The verb, on whichever menu the session happens to open on. */
  private showVerbHint(): void {
    if (this.verbHint.textContent !== "") return;
    const hint = takeVerbHint();
    if (hint === null) return;
    this.verbHint.textContent = hint;
    this.verbHint.classList.remove("is-hidden");
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
      // One fact per column: who, what they are, and what shape they are in.
      // The job used to be printed twice per row, once as a level and once as a
      // sentence; the job level now lives in the record beside the list.
      entries: view.members.map((member) => {
        const note = rosterNote(member);
        return {
          id: member.unitId,
          label: member.name,
          detail: `${member.jobName} ${member.level}`,
          ...(note === undefined ? {} : { note }),
          disabled: member.hp === 0,
          disabledReason: "Downed — unavailable until the next engagement",
        };
      }),
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

  /** The record beside the list: everything the row deliberately leaves out. */
  private renderDetail(member: RosterEntryView | null): void {
    if (!member) {
      replaceChildren(this.detail, [
        plate("Record"),
        el("p", { class: "gf-empty-note", text: "No unit selected." }),
      ]);
      return;
    }
    replaceChildren(this.detail, [
      plate("Record", (rosterNote(member) ?? "on roster").toUpperCase()),
      el("div", {
        class: "gf-detail-head",
        children: [
          portrait(member.portraitId, member.name, {
            size: "large",
            team: "player",
            jobName: member.jobName,
          }),
          el("div", {
            children: [
              el("h2", { class: "gf-detail-title", text: member.name }),
              el("p", { class: "gf-detail-sub", text: member.jobName }),
            ],
          }),
        ],
      }),
      el("div", {
        class: "gf-detail-body",
        children: [
          el("div", {
            class: "gf-unit-bar",
            children: [
              el("span", { class: "gf-field-label", text: "HP" }),
              el("span", { class: "gf-field-value", text: `${member.hp} / ${member.maxHp}` }),
              meter("is-hp", member.hp, member.maxHp),
            ],
          }),
          el("dl", {
            class: "gf-ledger",
            children: [
              // Two tracks, named. "Level 1" here beside "Enforcer level 2" was
              // the same contradiction the unit sheet was printing.
              el("dt", { text: "Unit level" }),
              el("dd", { class: "gf-detail-unit-level", text: String(member.level) }),
              ...(member.jobLevel === undefined
                ? []
                : [
                    el("dt", { text: `Job level (${member.jobName})` }),
                    el("dd", { class: "gf-detail-job-level", text: String(member.jobLevel) }),
                  ]),
              el("dt", { text: `Standing (${member.jobName})` }),
              el("dd", { class: "gf-detail-standing", text: String(member.standing) }),
              // Resolve and Attunement are measured, not hidden: everywhere a
              // unit is read, the record prints what the Assay filed.
              ...(member.disposition === undefined
                ? []
                : [
                    el("dt", { text: "Resolve" }),
                    el("dd", { class: "gf-detail-resolve", text: String(member.disposition.resolve) }),
                    el("dt", { text: "Attunement" }),
                    el("dd", {
                      class: "gf-detail-attunement",
                      text: String(member.disposition.attunement),
                    }),
                  ]),
            ],
          }),
          el("p", { class: "gf-hint", text: "Enter opens the unit's record, kit, and jobs." }),
        ],
      }),
    ]);
  }
}
