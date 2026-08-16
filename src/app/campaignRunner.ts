// The chapter loop: roster -> formation -> battle -> results -> roster.
//
// The results step is a screen, not a toast: a win banks and buries
// (PROGRESSION §3), and the burying is the part the player has to be shown.
//
// It talks to the battle layer and the between-battle screens through the two
// ports below, never to Three.js or the DOM, so the whole loop is constructible
// in a test with fakes on both sides — the same shape `BattleController` uses.
//
// Phase machine (`CampaignPhase`):
//
//   roster --beginDeployment--> formation --confirmDeployment--> battle
//     ^                             |                              |
//     +------ closeScreen ----------+                              |
//     +--- results <---------------------- finishBattle ------------+
//
// `complete` is where the chapter ends: its encounter list ran out. It is not a
// dead end — `replayEncounter` re-enters an engagement already won from either
// `roster` or `complete`, and lands back where it started.

import type { Deployment, GameState, InventoryStack } from "../core/index.js";
import type { Unit } from "../data/index.js";
import type { BattleOutcome } from "../core/index.js";
import type { BattleResultsView, ChapterCloseView } from "../ui/index.js";
import { CampaignSession } from "./campaign.js";

export type CampaignPhase = "roster" | "formation" | "battle" | "results" | "complete";

/** What the runner needs from the battle layer. */
export interface BattlePort {
  /**
   * Open `encounterId` with this party, formation, and field kit. The runner is
   * handed the final `GameState` through `onEnd` once the battle resolves.
   */
  start(
    encounterId: string,
    party: readonly Unit[],
    deployment: readonly Deployment[],
    carried: readonly InventoryStack[],
    onEnd: (final: GameState) => void,
  ): void;
  /** Tear the battle down before the roster comes back up. */
  end(): void;
}

/** What the runner needs from the between-battle overlay. */
export interface CampaignScreenPort {
  showRoster(): void;
  showFormation(): void;
  /**
   * The battle's filed record. Nothing retires this screen but `onAdvance`:
   * the player reads the casualties and files it themselves.
   */
  showResults(view: BattleResultsView, onAdvance: () => void): void;
  /** The chapter's closing record, on the same terms. */
  showChapterClose(view: ChapterCloseView, onAdvance: () => void): void;
  hide(): void;
  /** Re-read the session's view models; called after every state change. */
  refresh(): void;
  notify(message: string): void;
}

export interface CampaignRunnerOptions {
  session: CampaignSession;
  battle: BattlePort;
  screens: CampaignScreenPort;
  /** Called after every battle with what the chapter took from it. */
  onOutcome?: (outcome: BattleOutcome) => void;
}

export class CampaignRunner {
  private readonly session: CampaignSession;
  private readonly battle: BattlePort;
  private readonly screens: CampaignScreenPort;
  private readonly onOutcome: (outcome: BattleOutcome) => void;
  private currentPhase: CampaignPhase = "roster";
  private lastOutcomeSummary: BattleOutcome | null = null;
  /** The closing record is a moment, not a state: it is presented once. */
  private chapterClosePresented = false;

  constructor(options: CampaignRunnerOptions) {
    this.session = options.session;
    this.battle = options.battle;
    this.screens = options.screens;
    this.onOutcome = options.onOutcome ?? ((): void => undefined);
  }

  get phase(): CampaignPhase {
    return this.currentPhase;
  }

  get lastOutcome(): BattleOutcome | null {
    return this.lastOutcomeSummary;
  }

  start(): void {
    this.openRoster();
  }

  openRoster(): void {
    this.session.cancelDeployment();
    if (this.session.playableEncounterId() === null) {
      this.currentPhase = "complete";
      if (this.session.awaitingContent()) {
        this.screens.showRoster();
        this.screens.notify("The next engagement is not authored yet.");
        return;
      }
      if (!this.chapterClosePresented) {
        this.chapterClosePresented = true;
        this.screens.showChapterClose(this.session.chapterCloseView(), () =>
          this.screens.showRoster(),
        );
        return;
      }
      this.screens.showRoster();
      this.screens.notify(closingNotice(this.session));
      return;
    }
    this.currentPhase = "roster";
    this.screens.showRoster();
  }

  /** Roster -> formation. Refuses when there is nothing left to deploy into. */
  beginDeployment(): boolean {
    const encounterId = this.session.playableEncounterId();
    if (encounterId === null) {
      this.screens.notify(
        this.session.awaitingContent()
          ? "The next engagement is not authored yet."
          : "The chapter is closed. Return to a completed engagement instead.",
      );
      return false;
    }
    return this.enterFormation(encounterId);
  }

  /**
   * Return to an engagement already won — the grind valve. Progression banks
   * and buries on a replay exactly as it does the first time; only the chapter
   * index stays where it is.
   */
  replayEncounter(encounterId: string): boolean {
    if (!this.session.completedEncounters().some((entry) => entry.id === encounterId)) {
      this.screens.notify("That engagement is not on the record.");
      return false;
    }
    return this.enterFormation(encounterId);
  }

  private enterFormation(encounterId: string): boolean {
    if (this.session.state.roster.length === 0) {
      this.screens.notify("The roster is empty.");
      return false;
    }
    if (this.session.beginDeployment(encounterId) === null) {
      this.screens.notify(`Encounter ${encounterId} is missing its map.`);
      return false;
    }
    this.currentPhase = "formation";
    this.screens.showFormation();
    return true;
  }

  /** Formation -> battle. */
  confirmDeployment(): boolean {
    const pending = this.session.deployment;
    if (pending === null) return false;
    const placements = this.session.deploymentPlacements();
    if (placements.length === 0) {
      this.screens.notify("Deploy at least one unit.");
      return false;
    }
    const party = this.session.deployedParty();
    const carried = this.session.carriedItems();
    this.currentPhase = "battle";
    this.screens.hide();
    this.battle.start(pending.encounterId, party, placements, carried, (final) =>
      this.finishBattle(final),
    );
    return true;
  }

  /**
   * Battle -> results. Banks Standing, buries the fallen, advances the chapter,
   * and hands the record to the player; the roster comes back when they file it.
   */
  finishBattle(final: GameState): BattleOutcome {
    const before = this.session.state;
    const outcome = this.session.finishBattle(final);
    this.lastOutcomeSummary = outcome;
    this.battle.end();
    this.onOutcome(outcome);
    this.currentPhase = "results";
    this.screens.showResults(this.session.battleResultsView(before, outcome), () =>
      this.openRoster(),
    );
    return outcome;
  }
}

/**
 * The chapter's close, as one line. The closing *record* is a screen
 * (`showChapterClose`); this is what the roster says afterwards, once the
 * player has already read it.
 */
export function closingNotice(session: CampaignSession): string {
  const state = session.state;
  const banked = state.progress.reduce(
    (total, unit) => total + unit.jobs.reduce((sum, job) => sum + job.earned, 0),
    0,
  );
  const held = state.roster.map((unit) => unit.name).join(", ");
  const standing = held === "" ? "Nobody came back." : `Still standing: ${held}.`;
  const lost =
    state.fallen.length === 0
      ? "Nobody was left behind."
      : `Left behind: ${state.fallen.map((entry) => entry.name).join(", ")}.`;
  return `The chapter has no further engagements. ${standing} ${banked} Standing banked. ${lost}`;
}
