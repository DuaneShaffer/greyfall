// The between-battle overlay: one root element that swaps between the roster,
// the three per-unit screens, and the formation picker, keeping exactly one of
// them attached to the keyboard.
//
// It is the `CampaignScreenPort` the chapter loop drives, and the only place in
// `src/app` that both a `CampaignSession` and DOM components meet.

import {
  BattleResultsScreen,
  ChapterCloseScreen,
  DeploymentScreen,
  EquipmentScreen,
  JobScreen,
  LearningScreen,
  RosterScreen,
  UnitSheetScreen,
  el,
  replaceChildren,
  type BattleResultsView,
  type ChapterCloseView,
  type ProgressionIntents,
  type UiIntents,
} from "../ui/index.js";
import { progressionIntents, type CampaignSession } from "./campaign.js";
import type { CampaignScreenPort } from "./campaignRunner.js";

export type BetweenScreenId =
  | "roster"
  | "sheet"
  | "learning"
  | "equipment"
  | "jobs"
  | "formation"
  | "results"
  | "chapterClose";

/** Filed records: the chapter's chrome stands down while one is being read. */
const RECORD_SCREENS: ReadonlySet<BetweenScreenId> = new Set<BetweenScreenId>([
  "results",
  "chapterClose",
]);

export interface BetweenBattleHandlers {
  /** Player asked to move out; the runner decides whether that is allowed. */
  beginDeployment(): void;
  /** Formation locked in. */
  confirmDeployment(): void;
  /** Player chose an engagement already won and wants it again. */
  replayEncounter?(encounterId: string): void;
  /**
   * The staged formation changed, or a unit is waiting for a tile. The app
   * redraws the battlefield preview and lights the deployment tiles.
   */
  onFormationChanged?(placingUnitId: string | null): void;
  /** The formation screen is no longer up; drop the preview highlights. */
  onFormationClosed?(): void;
  save?(): void;
  load?(): void;
}

const REPLAY_MENU_ID = "replay-engagements";

/** What each screen is for, said once, at the foot of the page. */
const SCREEN_HINT: Record<BetweenScreenId, string> = {
  roster: "Confirm a name to open their record, kit and jobs. Move out when the party is ready.",
  sheet: "Read-only record. Escape returns to the roster.",
  learning: "Confirm an ability to spend Standing on it.",
  equipment: "Confirm a slot to see what the job can carry in it.",
  jobs: "Confirm a job to take it as primary or borrow its skillset.",
  formation: "Confirm a unit, then click a deployment tile on the field. Move out when the formation is set.",
  results: "The engagement's record. File it when you have read it; nothing else closes this page.",
  chapterClose: "The chapter's record. Close it when you have read it.",
};

const TOAST_MS = 3200;

export class BetweenBattleScreens implements CampaignScreenPort {
  readonly el: HTMLElement;
  readonly roster: RosterScreen;
  readonly sheet: UnitSheetScreen;
  readonly learning: LearningScreen;
  readonly equipment: EquipmentScreen;
  readonly jobs: JobScreen;
  readonly formation: DeploymentScreen;
  readonly results: BattleResultsScreen;
  readonly chapterClose: ChapterCloseScreen;

  private readonly session: CampaignSession;
  private readonly stage: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly moveOut: HTMLButtonElement;
  private readonly moveOutReason: HTMLElement;
  private screen: BetweenScreenId = "roster";
  private selectedUnitId: string | null = null;
  private keyTarget: EventTarget | null = null;
  private toastMs = 0;
  private resultsView: BattleResultsView | null = null;
  private chapterCloseView: ChapterCloseView | null = null;
  private advanceRecord: (() => void) | null = null;
  private readonly handlers: BetweenBattleHandlers;

  constructor(session: CampaignSession, handlers: BetweenBattleHandlers) {
    this.session = session;
    this.handlers = handlers;

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
    // Spending Standing is the one op with nothing on screen to show for it:
    // the list re-reads as "learned" only if the player is still looking at it.
    intents.learnAbility = (unitId, abilityId) => this.learn(unitId, abilityId);

    this.roster = new RosterScreen({ intents });
    this.sheet = new UnitSheetScreen();
    this.learning = new LearningScreen({ intents });
    this.equipment = new EquipmentScreen({ intents });
    this.jobs = new JobScreen({ intents });
    this.formation = new DeploymentScreen({
      intents,
      onPlacing: (unitId) => handlers.onFormationChanged?.(unitId),
    });
    const advance = { onAdvance: (): void => this.fileRecord() };
    this.results = new BattleResultsScreen(advance);
    this.chapterClose = new ChapterCloseScreen(advance);

    this.toast = el("p", { class: "gf-toast is-hidden", attrs: { role: "status" } });
    this.hint = el("p", { class: "gf-hint gf-between-hint" });
    this.stage = el("div", { class: "gf-between-stage" });
    this.bar = el("div", { class: "gf-between-bar" });
    this.moveOut = el("button", {
      class: "gf-button",
      text: "Move out",
      attrs: { type: "button" },
    });
    this.moveOutReason = el("span", { class: "gf-bar-reason is-hidden" });
    this.el = el("section", {
      class: "gf-between gf-root",
      children: [
        this.bar,
        this.stage,
        el("footer", { class: "gf-between-foot", children: [this.hint, this.toast] }),
      ],
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

  showResults(view: BattleResultsView, onAdvance: () => void): void {
    this.resultsView = view;
    this.advanceRecord = onAdvance;
    this.show("results");
  }

  showChapterClose(view: ChapterCloseView, onAdvance: () => void): void {
    this.chapterCloseView = view;
    this.advanceRecord = onAdvance;
    this.show("chapterClose");
  }

  hide(): void {
    this.detachAll();
    this.el.classList.add("is-hidden");
    if (this.screen === "formation") this.handlers.onFormationClosed?.();
  }

  refresh(): void {
    this.render();
  }

  notify(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.remove("is-hidden");
    this.toastMs = TOAST_MS;
  }

  /**
   * Frame pump; retires the toast without a wall clock in the shell. Records
   * are deliberately outside its reach: only `fileRecord` closes one.
   */
  tick(deltaMs = 1000): void {
    if (this.toastMs <= 0) return;
    this.toastMs -= deltaMs;
    if (this.toastMs <= 0) this.toast.classList.add("is-hidden");
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

  /** Spend Standing, then say so: the op is otherwise silent. */
  private learn(unitId: string, abilityId: string): void {
    const before = this.session.learningView(unitId);
    const entry = before?.entries.find((candidate) => candidate.abilityId === abilityId) ?? null;
    const learned = this.session.learnAbility(unitId, abilityId);
    this.render();
    if (!learned || entry === null || before === null) return;
    const remaining = this.session.learningView(unitId)?.standing ?? 0;
    this.notify(
      `${entry.name} entered on ${before.unitName}'s record — ${entry.standingCost} Standing spent, ${remaining} left.`,
    );
  }

  /** The player closing a record. The only way off the results page. */
  private fileRecord(): void {
    const advance = this.advanceRecord;
    this.advanceRecord = null;
    advance?.();
  }

  private openUnit(screen: BetweenScreenId, unitId: string): void {
    this.selectedUnitId = unitId;
    this.show(screen);
  }

  private show(screen: BetweenScreenId): void {
    const leavingFormation = this.screen === "formation" && screen !== "formation";
    this.screen = screen;
    this.el.classList.remove("is-hidden");
    // Formation runs as a rail over the live battlefield; every other screen is
    // a full page of chrome.
    this.el.classList.toggle("is-field", screen === "formation");
    // A record is read, not navigated around: the chapter's own chrome would
    // offer moves the page cannot honour.
    this.el.classList.toggle("is-record", RECORD_SCREENS.has(screen));
    this.render();
    this.attachCurrent();
    if (leavingFormation) this.handlers.onFormationClosed?.();
  }

  private render(): void {
    const unitId = this.selectedUnitId ?? this.session.state.roster[0]?.id ?? null;
    this.selectedUnitId = unitId;
    this.hint.textContent = SCREEN_HINT[this.screen];
    this.syncMoveOut();

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
        this.handlers.onFormationChanged?.(this.formation.placingUnitId);
        break;
      }
      case "results": {
        const view = this.resultsView;
        if (view === null) return this.show("roster");
        this.results.update(view);
        replaceChildren(this.stage, [this.results.el]);
        break;
      }
      case "chapterClose": {
        const view = this.chapterCloseView;
        if (view === null) return this.show("roster");
        this.chapterClose.update(view);
        replaceChildren(this.stage, [this.chapterClose.el]);
        break;
      }
    }
  }

  /** UI_DESIGN §8: a panel never offers what it cannot do. */
  private syncMoveOut(): void {
    const reason =
      this.session.playableEncounterId() !== null
        ? null
        : this.session.awaitingContent()
          ? "The next engagement is not authored yet."
          : "The chapter is closed — return to an engagement already won.";
    this.moveOut.disabled = reason !== null;
    this.moveOut.title = reason ?? "";
    this.moveOutReason.textContent = reason ?? "";
    this.moveOutReason.classList.toggle("is-hidden", reason === null);
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
                : this.screen === "results"
                  ? this.results.menus
                  : this.screen === "chapterClose"
                    ? this.chapterClose.menus
                    : null;
    menus?.attach(this.keyTarget);
  }

  private detachAll(): void {
    this.roster.menus.detach();
    this.learning.menus.detach();
    this.equipment.menus.detach();
    this.jobs.menus.detach();
    this.formation.menus.detach();
    this.results.menus.detach();
    this.chapterClose.menus.detach();
  }

  private buildBar(handlers: BetweenBattleHandlers): void {
    // Exactly one loud button on the bar: the thing the chapter is waiting for.
    // The rest are utilities and are styled as such.
    const button = (label: string, onClick: () => void): HTMLElement => {
      const node = el("button", {
        class: "gf-button is-quiet",
        text: label,
        attrs: { type: "button" },
      });
      node.addEventListener("click", onClick);
      return node;
    };
    const children: HTMLElement[] = [
      el("span", { class: "gf-between-brand", text: this.session.campaign.name }),
      button("Roster", () => this.showRoster()),
    ];
    const replay = handlers.replayEncounter;
    if (replay) children.push(button("Return to…", () => this.openReplayMenu(replay)));
    if (handlers.save) children.push(button("Save", handlers.save));
    if (handlers.load) children.push(button("Load", handlers.load));
    this.moveOut.addEventListener("click", () => handlers.beginDeployment());
    children.push(this.moveOutReason, this.moveOut);
    replaceChildren(this.bar, children);
    this.syncMoveOut();
  }
}
