import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCampaign,
  jobProgress,
  rosterUnit,
  type CampaignState,
  type ContentLibrary,
  type Deployment,
  type GameState,
  type ProgressionError,
} from "../../src/core/index.js";
import { Campaign, type Unit } from "../../src/data/index.js";
import { CampaignSession } from "../../src/app/campaign.js";
import {
  CampaignRunner,
  summarize,
  type BattlePort,
  type CampaignScreenPort,
} from "../../src/app/campaignRunner.js";
import { loadContent, loadUnits } from "../core/fixtures.js";
import { openBattle } from "./fixtures.js";

const CAMPAIGN_PATH = join(import.meta.dirname, "..", "..", "data", "campaigns", "foundry-chapter.json");

const chapter = (): Campaign => Campaign.parse(JSON.parse(readFileSync(CAMPAIGN_PATH, "utf8")));

const CONTENT: ContentLibrary = loadContent();
const UNITS: Record<string, Unit> = loadUnits();

const ENCOUNTER_ID = "e1-marshaling-yard";

interface Harness {
  session: CampaignSession;
  runner: CampaignRunner;
  errors: ProgressionError[];
  saves: CampaignState[];
  screens: FakeScreens;
  battle: FakeBattle;
}

interface FakeScreens extends CampaignScreenPort {
  shown: string[];
  notices: string[];
  refreshes: number;
}

interface FakeBattle extends BattlePort {
  started: { encounterId: string; party: string[]; deployment: Deployment[] }[];
  ends: number;
  finish(final: GameState): void;
}

function fakeScreens(): FakeScreens {
  const shown: string[] = [];
  const notices: string[] = [];
  const fake: FakeScreens = {
    shown,
    notices,
    refreshes: 0,
    showRoster: () => void shown.push("roster"),
    showFormation: () => void shown.push("formation"),
    hide: () => void shown.push("hidden"),
    refresh: () => {
      fake.refreshes += 1;
    },
    notify: (message) => void notices.push(message),
  };
  return fake;
}

function fakeBattle(): FakeBattle {
  let pending: ((final: GameState) => void) | null = null;
  const fake: FakeBattle = {
    started: [],
    ends: 0,
    start: (encounterId, party, deployment, onEnd) => {
      fake.started.push({
        encounterId,
        party: party.map((unit) => unit.id),
        deployment: deployment.map((placement) => ({ ...placement })),
      });
      pending = onEnd;
    },
    end: () => {
      fake.ends += 1;
    },
    finish: (final) => {
      const onEnd = pending;
      pending = null;
      onEnd?.(final);
    },
  };
  return fake;
}

/** A finished battle carrying the result, Standing, and casualties we want. */
function finished(options: {
  result: "win" | "loss";
  earned?: Record<string, number>;
  downed?: string[];
}): GameState {
  const state = structuredClone(openBattle().state);
  state.result = options.result;
  for (const unit of state.units) {
    if (unit.team !== "player") continue;
    unit.standingEarned = options.earned?.[unit.id] ?? 0;
    unit.downed = options.downed?.includes(unit.id) ?? false;
  }
  return state;
}

function harness(state?: CampaignState, content: ContentLibrary = CONTENT): Harness {
  const campaign = chapter();
  const errors: ProgressionError[] = [];
  const saves: CampaignState[] = [];
  const session = new CampaignSession({
    campaign,
    content,
    state: state ?? createCampaign(campaign, UNITS),
    onChange: (next) => void saves.push(next),
    onError: (error) => void errors.push(error),
  });
  const screens = fakeScreens();
  const battle = fakeBattle();
  const runner = new CampaignRunner({ session, battle, screens });
  return { session, runner, errors, saves, screens, battle };
}

describe("CampaignSession — content wiring", () => {
  it("builds the roster from data/units via startingRosterUnitIds", () => {
    const h = harness();
    const ids = h.session.state.roster.map((unit) => unit.id);
    expect(ids).toContain("rowen");
    expect(ids.length).toBe(chapter().startingRosterUnitIds.length);
    for (const id of ids) expect(UNITS[id]).toBeDefined();
  });

  it("builds every between-battle view model", () => {
    const h = harness();
    expect(h.session.partyView().members.length).toBe(h.session.state.roster.length);
    expect(h.session.unitSheetView("rowen")?.unit.name).toBe("Rowen Corvane");
    expect(h.session.learningView("rowen")?.entries.length).toBeGreaterThan(0);
    expect(h.session.equipmentView("rowen")?.jobEquipTags.length).toBeGreaterThan(0);
    expect(h.session.jobsView("rowen")?.options.length).toBe(Object.keys(CONTENT.jobs).length);
  });

  it("returns null view models for a unit that is not on the roster", () => {
    const h = harness();
    expect(h.session.unitSheetView("ghost")).toBeNull();
    expect(h.session.learningView("ghost")).toBeNull();
    expect(h.session.equipmentView("ghost")).toBeNull();
    expect(h.session.jobsView("ghost")).toBeNull();
  });

  it("routes a refused op to onError and leaves state alone", () => {
    const h = harness();
    const before = h.session.state;
    expect(h.session.learnAbility("rowen", "overload-cell")).toBe(false);
    expect(h.errors).toHaveLength(1);
    expect(h.session.state).toBe(before);
    expect(h.saves).toHaveLength(0);
  });

  it("reports a committed op through onChange", () => {
    const h = harness();
    const learnable = h.session.learningView("rowen")?.entries.find((entry) => !entry.learned);
    expect(learnable).toBeDefined();
    const standing = jobProgress(h.session.state, "rowen", "enforcer").balance;
    const affordable = (learnable?.standingCost ?? 0) <= standing;
    expect(h.session.learnAbility("rowen", learnable!.abilityId)).toBe(affordable);
    expect(h.saves.length).toBe(affordable ? 1 : 0);
  });
});

describe("CampaignSession — formation", () => {
  it("auto-fills the deployment tiles from the top of the roster", () => {
    const h = harness();
    const pending = h.session.beginDeployment(ENCOUNTER_ID);
    expect(pending).not.toBeNull();
    const placements = h.session.deploymentPlacements();
    expect(placements.length).toBe(pending!.encounter.maxDeployedUnits);
    expect(placements.map((placement) => placement.unitId)).toEqual(
      h.session.state.roster.slice(0, placements.length).map((unit) => unit.id),
    );
    for (const placement of placements) {
      expect(
        pending!.map.deploymentTiles.some(
          (tile) => tile.x === placement.position.x && tile.y === placement.position.y,
        ),
      ).toBe(true);
    }
  });

  it("toggles a unit off its tile and back onto a free one", () => {
    const h = harness();
    h.session.beginDeployment(ENCOUNTER_ID);
    const first = h.session.state.roster[0]!.id;
    expect(h.session.toggleDeployment(first)).toBe(true);
    expect(h.session.deploymentPlacements().some((p) => p.unitId === first)).toBe(false);
    expect(h.session.toggleDeployment(first)).toBe(true);
    expect(h.session.deploymentPlacements().some((p) => p.unitId === first)).toBe(true);
  });

  it("refuses to deploy past the tile count", () => {
    const h = harness();
    const pending = h.session.beginDeployment(ENCOUNTER_ID)!;
    const spare = h.session.state.roster[pending.encounter.maxDeployedUnits];
    expect(spare).toBeDefined();
    expect(h.session.toggleDeployment(spare!.id)).toBe(false);
  });

  it("refuses an unknown unit and an unknown encounter", () => {
    const h = harness();
    expect(h.session.beginDeployment("nope")).toBeNull();
    h.session.beginDeployment(ENCOUNTER_ID);
    expect(h.session.toggleDeployment("ghost")).toBe(false);
  });

  it("hands out a deep copy of the deployed party", () => {
    const h = harness();
    h.session.beginDeployment(ENCOUNTER_ID);
    const party = h.session.deployedParty();
    party[0]!.level = 99;
    expect(rosterUnit(h.session.state, party[0]!.id)?.level).not.toBe(99);
  });

  it("builds a formation view model that mirrors the staged assignments", () => {
    const h = harness();
    h.session.beginDeployment(ENCOUNTER_ID);
    const view = h.session.deploymentView()!;
    expect(view.encounterId).toBe(ENCOUNTER_ID);
    expect(view.slots.length).toBe(view.maxDeployed);
    expect(view.candidates.filter((c) => c.assigned).length).toBe(view.maxDeployed);
    expect(view.canConfirm).toBe(true);
    const reserve = view.candidates.find((c) => !c.assigned);
    expect(reserve?.unavailableReason).toBe("No deployment tile free");
  });

  it("blocks confirmation with an empty formation", () => {
    const h = harness();
    const pending = h.session.beginDeployment(ENCOUNTER_ID)!;
    for (const unitId of [...pending.assignments]) {
      if (unitId !== null) h.session.toggleDeployment(unitId);
    }
    const view = h.session.deploymentView()!;
    expect(view.canConfirm).toBe(false);
    expect(view.blockedReason).toBe("Deploy at least one unit");
  });
});

describe("CampaignRunner", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it("opens on the roster", () => {
    h.runner.start();
    expect(h.runner.phase).toBe("roster");
    expect(h.screens.shown).toEqual(["roster"]);
  });

  it("walks roster -> formation -> battle", () => {
    h.runner.start();
    expect(h.runner.beginDeployment()).toBe(true);
    expect(h.runner.phase).toBe("formation");
    expect(h.runner.confirmDeployment()).toBe(true);
    expect(h.runner.phase).toBe("battle");
    expect(h.screens.shown).toEqual(["roster", "formation", "hidden"]);
    expect(h.battle.started).toHaveLength(1);
    expect(h.battle.started[0]?.encounterId).toBe(ENCOUNTER_ID);
    expect(h.battle.started[0]?.party).toEqual(
      h.battle.started[0]?.deployment.map((placement) => placement.unitId),
    );
  });

  it("refuses to start a battle with nobody deployed", () => {
    h.runner.start();
    h.runner.beginDeployment();
    for (const unitId of [...h.session.deployment!.assignments]) {
      if (unitId !== null) h.session.toggleDeployment(unitId);
    }
    expect(h.runner.confirmDeployment()).toBe(false);
    expect(h.runner.phase).toBe("formation");
    expect(h.screens.notices.at(-1)).toBe("Deploy at least one unit.");
  });

  it("banks a win, advances the chapter, and returns to the roster", () => {
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(finished({ result: "win", earned: { rowen: 70 } }));

    expect(h.runner.phase).toBe("roster");
    expect(h.battle.ends).toBe(1);
    expect(h.runner.lastOutcome?.advanced).toBe(true);
    expect(h.session.state.encounterIndex).toBe(1);
    expect(jobProgress(h.session.state, "rowen", "enforcer").balance).toBe(
      (chapter().startingStandingBonus ?? 0) + 70,
    );
    expect(h.session.deployment).toBeNull();
    expect(h.saves.at(-1)).toBe(h.session.state);
  });

  it("banks nothing on a loss and lets the encounter be retried", () => {
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    const before = h.session.state;
    h.battle.finish(finished({ result: "loss", earned: { rowen: 70 }, downed: ["rowen"] }));

    expect(h.session.state).toBe(before);
    expect(h.session.state.encounterIndex).toBe(0);
    expect(h.runner.phase).toBe("roster");
    expect(h.runner.beginDeployment()).toBe(true);
    expect(h.session.deployment?.encounterId).toBe(ENCOUNTER_ID);
  });

  it("strikes a unit that stayed down through a win", () => {
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(finished({ result: "win", downed: ["rowen"] }));

    expect(rosterUnit(h.session.state, "rowen")).toBeNull();
    expect(h.session.state.fallen.map((entry) => entry.unitId)).toEqual(["rowen"]);
    expect(h.screens.notices.at(-1)).toContain("Lost: Rowen Corvane");
  });

  it("falls back to replaying the last battle while later encounters are unauthored", () => {
    const pruned: ContentLibrary = {
      ...CONTENT,
      encounters: { [ENCOUNTER_ID]: CONTENT.encounters[ENCOUNTER_ID]! },
    };
    h = harness(undefined, pruned);
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(finished({ result: "win" }));

    expect(h.session.expectedEncounterId()).toBe(chapter().encounterIds[1]);
    expect(h.session.awaitingContent()).toBe(true);
    expect(h.session.playableEncounterId()).toBe(ENCOUNTER_ID);

    expect(h.runner.beginDeployment()).toBe(true);
    expect(h.screens.notices.at(-1)).toContain("not authored yet");
    expect(h.runner.confirmDeployment()).toBe(true);
    expect(h.battle.started.at(-1)?.encounterId).toBe(ENCOUNTER_ID);

    h.battle.finish(finished({ result: "win", earned: { rowen: 10 } }));
    expect(h.runner.lastOutcome?.advanced).toBe(false);
    expect(h.session.state.encounterIndex).toBe(1);
  });

  it("goes complete when the chapter has no playable encounter at all", () => {
    const campaign = chapter();
    const state = createCampaign(campaign, UNITS);
    state.encounterIndex = campaign.encounterIds.length;
    const h2 = harness(state);
    h2.runner.start();
    expect(h2.runner.phase).toBe("complete");
    expect(h2.runner.beginDeployment()).toBe(false);
  });

  it("refuses a formation with an empty roster", () => {
    const campaign = chapter();
    const state = createCampaign(campaign, UNITS);
    state.roster = [];
    const h2 = harness(state);
    h2.runner.start();
    expect(h2.runner.beginDeployment()).toBe(false);
    expect(h2.screens.notices.at(-1)).toBe("The roster is empty.");
  });
});

describe("summarize", () => {
  it("reads out banked Standing and casualties", () => {
    expect(
      summarize({
        result: "win",
        encounterId: ENCOUNTER_ID,
        standing: [
          { unitId: "rowen", jobId: "enforcer", amount: 40 },
          { unitId: "vale", jobId: "conduit", amount: 20 },
        ],
        fallen: [
          { unitId: "vale", name: "Vale Tarn", jobId: "conduit", level: 1, encounterId: ENCOUNTER_ID },
        ],
        advanced: true,
      }),
    ).toBe("Field held. 60 Standing banked. Lost: Vale Tarn.");
  });

  it("says nothing was banked on a loss", () => {
    expect(
      summarize({
        result: "loss",
        encounterId: ENCOUNTER_ID,
        standing: [],
        fallen: [],
        advanced: false,
      }),
    ).toContain("nothing banked");
  });
});
