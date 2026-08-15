// The chapter loop: roster -> formation -> battle -> results -> roster.
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
//     +------------------- finishBattle ----------------------------+
//
// `complete` is terminal: the chapter's encounter list ran out.

import type { Deployment, GameState } from "../core/index.js";
import type { Unit } from "../data/index.js";
import type { BattleOutcome } from "../core/index.js";
import { CampaignSession } from "./campaign.js";

export type CampaignPhase = "roster" | "formation" | "battle" | "complete";

/** What the runner needs from the battle layer. */
export interface BattlePort {
  /**
   * Open `encounterId` with this party and formation. The runner is handed the
   * final `GameState` through `onEnd` once the battle resolves.
   */
  start(
    encounterId: string,
    party: readonly Unit[],
    deployment: readonly Deployment[],
    onEnd: (final: GameState) => void,
  ): void;
  /** Tear the battle down before the roster comes back up. */
  end(): void;
}

/** What the runner needs from the between-battle overlay. */
export interface CampaignScreenPort {
  showRoster(): void;
  showFormation(): void;
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
      this.screens.showRoster();
      this.screens.notify("The chapter has no further engagements.");
      return;
    }
    this.currentPhase = "roster";
    this.screens.showRoster();
  }

  /** Roster -> formation. Refuses when there is nothing left to deploy into. */
  beginDeployment(): boolean {
    const encounterId = this.session.playableEncounterId();
    if (encounterId === null) {
      this.screens.notify("No engagement is available.");
      return false;
    }
    if (this.session.state.roster.length === 0) {
      this.screens.notify("The roster is empty.");
      return false;
    }
    if (this.session.beginDeployment(encounterId) === null) {
      this.screens.notify(`Encounter ${encounterId} is missing its map.`);
      return false;
    }
    if (this.session.awaitingContent()) {
      this.screens.notify(`Next engagement not authored yet — replaying ${encounterId}.`);
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
    this.currentPhase = "battle";
    this.screens.hide();
    this.battle.start(pending.encounterId, party, placements, (final) => this.finishBattle(final));
    return true;
  }

  /** Battle -> roster. Banks Standing, buries the fallen, advances the chapter. */
  finishBattle(final: GameState): BattleOutcome {
    const outcome = this.session.finishBattle(final);
    this.lastOutcomeSummary = outcome;
    this.battle.end();
    this.onOutcome(outcome);
    this.screens.notify(summarize(outcome));
    this.openRoster();
    return outcome;
  }
}

export function summarize(outcome: BattleOutcome): string {
  if (outcome.result === "loss") return "Line broken — nothing banked. Try the engagement again.";
  const banked = outcome.standing.reduce((total, award) => total + award.amount, 0);
  const lost =
    outcome.fallen.length === 0
      ? ""
      : ` Lost: ${outcome.fallen.map((entry) => entry.name).join(", ")}.`;
  return `Field held. ${banked} Standing banked.${lost}`;
}
