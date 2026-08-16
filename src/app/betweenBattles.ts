// The between-battle overlay: one root element that swaps between the roster,
// the three per-unit screens, and the formation picker, keeping exactly one of
// them attached to the keyboard.
//
// It is the `CampaignScreenPort` the chapter loop drives, and the only place in
// `src/app` that both a `CampaignSession` and DOM components meet.

import {
  DeploymentScreen,
  EquipmentScreen,
  JobScreen,
  LearningScreen,
  RosterScreen,
  UnitSheetScreen,
  el,
  replaceChildren,
  type ProgressionIntents,
  type UiIntents,
} from "../ui/index.js";
import { progressionIntents, type CampaignSession } from "./campaign.js";
import type { CampaignScreenPort } from "./campaignRunner.js";

export type BetweenScreenId = "roster" | "sheet" | "learning" | "equipment" | "jobs" | "formation";

export interface BetweenBattleHandlers {
  /** Player asked to move out; the runner decides whether that is allowed. */
  beginDeployment(): void;
  /** Formation locked in. */
  confirmDeployment(): void;
  /** Player chose an engagement already won and wants it again. */
  replayEncounter?(encounterId: string): void;
  save?(): void;
  load?(): void;
}

const REPLAY_MENU_ID = "replay-engagements";

const TOAST_TICKS = 4;

export class BetweenBattleScreens implements CampaignScreenPort {
  readonly el: HTMLElement;
  readonly roster: RosterScreen;
  readonly sheet: UnitSheetScreen;
  readonly learning: LearningScreen;
  readonly equipment: EquipmentScreen;
  readonly jobs: JobScreen;
  readonly formation: DeploymentScreen;

  private readonly session: CampaignSession;
  private readonly stage: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly bar: HTMLElement;
  private screen: BetweenScreenId = "roster";
  private selectedUnitId: string | null = null;
  private keyTarget: EventTarget | null = null;
  private toastTicks = 0;

  constructor(session: CampaignSession, handlers: BetweenBattleHandlers) {
    this.session = session;

    const navigation: Pick<
      ProgressionIntents,
      | "selectRosterUnit"
      | "openUnitSheet"
      | "openLearning"
      | "openEquipment"
      | "openJobs"
      | "beginDeployment"
      | "confirmDeployment"
      | "closeScreen"
    > = {
      selectRosterUnit: (unitId) => {
        this.selectedUnitId = unitId;
      },
      openUnitSheet: (unitId) => this.openUnit("sheet", unitId),
      openLearning: (unitId) => this.openUnit("learning", unitId),
      openEquipment: (unitId) => this.openUnit("equipment", unitId),
      openJobs: (unitId) => this.openUnit("jobs", unitId),
      beginDeployment: () => handlers.beginDeployment(),
      confirmDeployment: () => handlers.confirmDeployment(),
      closeScreen: () => this.showRoster(),
    };

    // Every intent redraws: the screens are projections of CampaignState, so a
    // committed op and a refused one both need the panel to re-read it.
    const routed = progressionIntents(session, navigation);
    const intents: Partial<UiIntents> = {};
    for (const [name, fn] of Object.entries(routed)) {
      (intents as Record<string, (...args: never[]) => void>)[name] = (...args: never[]) => {
        (fn as (...a: never[]) => void)(...args);
        this.render();
      };
    }

    this.roster = new RosterScreen({ intents });
    this.sheet = new UnitSheetScreen();
    this.learning = new LearningScreen({ intents });
    this.equipment = new EquipmentScreen({ intents });
    this.jobs = new JobScreen({ intents });
    this.formation = new DeploymentScreen({ intents });

    this.toast = el("p", { class: "gf-toast is-hidden", attrs: { role: "status" } });
    this.stage = el("div", { class: "gf-between-stage" });
    this.bar = el("div", { class: "gf-between-bar" });
    this.el = el("section", {
      class: "gf-between gf-root",
      children: [this.bar, this.stage, this.toast],
    });

    this.buildBar(handlers);
  }

  // --- CampaignScreenPort ---------------------------------------------------

  showRoster(): void {
    this.show("roster");
  }

  showFormation(): void {
    this.show("formation");
  }

  hide(): void {
    this.detachAll();
    this.el.classList.add("is-hidden");
  }

  refresh(): void {
    this.render();
  }

  notify(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.remove("is-hidden");
    this.toastTicks = TOAST_TICKS;
  }

  /** Call once a second-ish; retires the toast without a wall clock in the app. */
  tick(): void {
    if (this.toastTicks === 0) return;
    this.toastTicks -= 1;
    if (this.toastTicks === 0) this.toast.classList.add("is-hidden");
  }

  // --- plumbing -------------------------------------------------------------

  get current(): BetweenScreenId {
    return this.screen;
  }

  attach(target: EventTarget = document): void {
    this.keyTarget = target;
    this.attachCurrent();
  }

  destroy(): void {
    this.detachAll();
    this.el.remove();
  }

  /** The list of engagements already won, over the roster it deploys from. */
  private openReplayMenu(replay: (encounterId: string) => void): void {
    const completed = this.session.completedEncounters();
    if (completed.length === 0) {
      this.notify("No engagement has been won yet.");
      return;
    }
    this.showRoster();
    if (this.roster.menus.path.includes(REPLAY_MENU_ID)) return;
    this.roster.menus.push({
      id: REPLAY_MENU_ID,
      title: "Return to",
      entries: completed.map((entry) => ({ id: entry.id, label: entry.name })),
      onSelect: (entry) => {
        this.roster.menus.pop();
        replay(entry.id);
      },
    });
  }

  private openUnit(screen: BetweenScreenId, unitId: string): void {
    this.selectedUnitId = unitId;
    this.show(screen);
  }

  private show(screen: BetweenScreenId): void {
    this.screen = screen;
    this.el.classList.remove("is-hidden");
    this.render();
    this.attachCurrent();
  }

  private render(): void {
    const unitId = this.selectedUnitId ?? this.session.state.roster[0]?.id ?? null;
    this.selectedUnitId = unitId;

    switch (this.screen) {
      case "roster":
        this.roster.update(this.session.partyView());
        replaceChildren(this.stage, [this.roster.el]);
        break;
      case "sheet": {
        const view = unitId === null ? null : this.session.unitSheetView(unitId);
        if (view === null) return this.show("roster");
        this.sheet.update(view);
        replaceChildren(this.stage, [this.sheet.el]);
        break;
      }
      case "learning": {
        const view = unitId === null ? null : this.session.learningView(unitId);
        if (view === null) return this.show("roster");
        this.learning.update(view);
        replaceChildren(this.stage, [this.learning.el]);
        break;
      }
      case "equipment": {
        const view = unitId === null ? null : this.session.equipmentView(unitId);
        if (view === null) return this.show("roster");
        this.equipment.update(view);
        replaceChildren(this.stage, [this.equipment.el]);
        break;
      }
      case "jobs": {
        const view = unitId === null ? null : this.session.jobsView(unitId);
        if (view === null) return this.show("roster");
        this.jobs.update(view);
        replaceChildren(this.stage, [this.jobs.el]);
        break;
      }
      case "formation": {
        const view = this.session.deploymentView();
        if (view === null) return this.show("roster");
        this.formation.update(view);
        replaceChildren(this.stage, [this.formation.el]);
        break;
      }
    }
  }

  private attachCurrent(): void {
    this.detachAll();
    if (this.keyTarget === null) return;
    const menus =
      this.screen === "roster"
        ? this.roster.menus
        : this.screen === "learning"
          ? this.learning.menus
          : this.screen === "equipment"
            ? this.equipment.menus
            : this.screen === "jobs"
              ? this.jobs.menus
              : this.screen === "formation"
                ? this.formation.menus
                : null;
    menus?.attach(this.keyTarget);
  }

  private detachAll(): void {
    this.roster.menus.detach();
    this.learning.menus.detach();
    this.equipment.menus.detach();
    this.jobs.menus.detach();
    this.formation.menus.detach();
  }

  private buildBar(handlers: BetweenBattleHandlers): void {
    const button = (label: string, onClick: () => void): HTMLElement => {
      const node = el("button", { class: "gf-button", text: label, attrs: { type: "button" } });
      node.addEventListener("click", onClick);
      return node;
    };
    const children: HTMLElement[] = [
      el("span", { class: "gf-between-brand", text: this.session.campaign.name }),
      button("Roster", () => this.showRoster()),
      button("Move out", () => handlers.beginDeployment()),
    ];
    const replay = handlers.replayEncounter;
    if (replay) children.push(button("Return to…", () => this.openReplayMenu(replay)));
    if (handlers.save) children.push(button("Save", handlers.save));
    if (handlers.load) children.push(button("Load", handlers.load));
    replaceChildren(this.bar, children);
  }
}
