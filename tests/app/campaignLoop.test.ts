import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createBattle,
  createCampaign,
  jobProgress,
  type ContentLibrary,
  type GameState,
} from "../../src/core/index.js";
import { Campaign, type Unit } from "../../src/data/index.js";
import { chooseCommand } from "../../src/app/stubAi.js";
import { CampaignSession } from "../../src/app/campaign.js";
import {
  CampaignRunner,
  type BattlePort,
  type CampaignScreenPort,
} from "../../src/app/campaignRunner.js";
import { decodeSave, encodeSave } from "../../src/app/save.js";
import { loadContent, loadUnits } from "../core/fixtures.js";

// End-to-end: the shipped chapter definition, the shipped content, a real
// `createBattle`, a real battle played out through `applyCommand`, and the
// result folded back into the campaign. No doctored GameState anywhere.

const CAMPAIGN_PATH = join(import.meta.dirname, "..", "..", "data", "campaigns", "foundry-chapter.json");
const chapter = (): Campaign => Campaign.parse(JSON.parse(readFileSync(CAMPAIGN_PATH, "utf8")));

const CONTENT: ContentLibrary = loadContent();
const UNITS: Record<string, Unit> = loadUnits();

/** Both sides on the AI, until the battle resolves. */
function playOut(start: GameState, maxCommands = 2000): GameState {
  let state = start;
  for (let i = 0; i < maxCommands; i += 1) {
    if (state.result !== null) return state;
    if (state.activeTurn === null) throw new Error("battle stalled with nobody acting");
    const result = applyCommand(state, chooseCommand(state));
    if (result.error !== null) throw new Error(result.error.message);
    state = result.state;
  }
  throw new Error("battle never resolved");
}

function autoBattlePort(content: ContentLibrary): BattlePort & { finals: GameState[] } {
  const port: BattlePort & { finals: GameState[] } = {
    finals: [],
    start: (encounterId, party, deployment, onEnd) => {
      const battle = createBattle(content, encounterId, party, deployment);
      const final = playOut(battle.state);
      port.finals.push(final);
      onEnd(final);
    },
    end: () => undefined,
  };
  return port;
}

function silentScreens(): CampaignScreenPort & { notices: string[] } {
  const notices: string[] = [];
  return {
    notices,
    showRoster: () => undefined,
    showFormation: () => undefined,
    hide: () => undefined,
    refresh: () => undefined,
    notify: (message) => void notices.push(message),
  };
}

describe("the chapter loop, end to end", () => {
  it("deploys into battle 1, plays it, banks the result, and comes back to the roster", () => {
    const campaign = chapter();
    const session = new CampaignSession({
      campaign,
      content: CONTENT,
      state: createCampaign(campaign, UNITS),
    });
    const battle = autoBattlePort(CONTENT);
    const screens = silentScreens();
    const runner = new CampaignRunner({ session, battle, screens });

    runner.start();
    expect(runner.phase).toBe("roster");
    expect(runner.beginDeployment()).toBe(true);
    expect(runner.confirmDeployment()).toBe(true);

    const final = battle.finals[0]!;
    expect(final.result).not.toBeNull();
    expect(runner.phase).toBe("roster");

    const outcome = runner.lastOutcome!;
    expect(outcome.encounterId).toBe("e1-marshaling-yard");
    expect(outcome.result).toBe(final.result);

    if (final.result === "win") {
      expect(outcome.advanced).toBe(true);
      expect(session.state.encounterIndex).toBe(1);
      const banked = outcome.standing.reduce((total, award) => total + award.amount, 0);
      expect(banked).toBeGreaterThan(0);
      const rowen = outcome.standing.find((award) => award.unitId === "rowen");
      if (rowen !== undefined) {
        expect(jobProgress(session.state, "rowen", "enforcer").balance).toBe(
          (campaign.startingStandingBonus ?? 0) + rowen.amount,
        );
      }
    } else {
      expect(outcome.advanced).toBe(false);
      expect(session.state.encounterIndex).toBe(0);
    }
  });

  it("loops straight back into a playable battle afterwards", () => {
    const campaign = chapter();
    const session = new CampaignSession({
      campaign,
      content: CONTENT,
      state: createCampaign(campaign, UNITS),
    });
    const battle = autoBattlePort(CONTENT);
    const runner = new CampaignRunner({ session, battle, screens: silentScreens() });

    runner.start();
    runner.beginDeployment();
    runner.confirmDeployment();

    // Battles 2-5 have no encounter files yet: the loop replays battle 1.
    expect(runner.phase).toBe("roster");
    expect(runner.beginDeployment()).toBe(true);
    expect(runner.confirmDeployment()).toBe(true);
    expect(battle.finals).toHaveLength(2);
    expect(session.state.completedEncounterIds.length).toBeLessThanOrEqual(1);
  });

  it("survives a save round trip mid-chapter", () => {
    const campaign = chapter();
    const session = new CampaignSession({
      campaign,
      content: CONTENT,
      state: createCampaign(campaign, UNITS),
    });
    const runner = new CampaignRunner({
      session,
      battle: autoBattlePort(CONTENT),
      screens: silentScreens(),
    });

    runner.start();
    runner.beginDeployment();
    runner.confirmDeployment();

    const text = encodeSave(session.state);
    const restored = decodeSave(text);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    session.replaceState(restored.campaign);
    expect(encodeSave(session.state)).toBe(text);
    expect(session.deployment).toBeNull();
    expect(runner.beginDeployment()).toBe(true);
  });
});
