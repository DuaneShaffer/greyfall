import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createBattle,
  createCampaign,
  inventoryCount,
  jobProgress,
  rosterUnit,
  type CampaignState,
  type ContentLibrary,
  type Deployment,
  type GameState,
  type InventoryStack,
  type ProgressionError,
} from "../../src/core/index.js";
import { Campaign, type Unit } from "../../src/data/index.js";
import { CampaignSession } from "../../src/app/campaign.js";
import {
  CampaignRunner,
  type BattlePort,
  type CampaignScreenPort,
} from "../../src/app/campaignRunner.js";
import type { BattleResultsView, ChapterCloseView } from "../../src/ui/index.js";
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
  results: BattleResultsView[];
  closes: ChapterCloseView[];
  /** The record the screens are holding; null once it has been filed. */
  pendingAdvance: (() => void) | null;
  /** Set false to leave a record on screen, as the real screens do. */
  autoAdvance: boolean;
}

interface FakeBattle extends BattlePort {
  started: { encounterId: string; party: string[]; deployment: Deployment[]; carried: InventoryStack[] }[];
  ends: number;
  finish(final: GameState): void;
}

function fakeScreens(): FakeScreens {
  const shown: string[] = [];
  const notices: string[] = [];
  const hold = (onAdvance: () => void): void => {
    fake.pendingAdvance = onAdvance;
    if (!fake.autoAdvance) return;
    fake.pendingAdvance = null;
    onAdvance();
  };
  const fake: FakeScreens = {
    shown,
    notices,
    refreshes: 0,
    results: [],
    closes: [],
    pendingAdvance: null,
    autoAdvance: true,
    showRoster: () => void shown.push("roster"),
    showFormation: () => void shown.push("formation"),
    showResults: (view, onAdvance) => {
      shown.push("results");
      fake.results.push(view);
      hold(onAdvance);
    },
    showChapterClose: (view, onAdvance) => {
      shown.push("chapter-close");
      fake.closes.push(view);
      hold(onAdvance);
    },
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
    start: (encounterId, party, deployment, carried, onEnd) => {
      fake.started.push({
        encounterId,
        party: party.map((unit) => unit.id),
        deployment: deployment.map((placement) => ({ ...placement })),
        carried: carried.map((stack) => ({ ...stack })),
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
  satchel?: InventoryStack[];
}): GameState {
  const state = structuredClone(openBattle(undefined, undefined, options.satchel ?? []).state);
  state.result = options.result;
  for (const unit of state.units) {
    if (unit.team !== "player") continue;
    unit.standingEarned = options.earned?.[unit.id] ?? 0;
    unit.downed = options.downed?.includes(unit.id) ?? false;
  }
  return state;
}

/** A won battle in a named encounter, so the chapter can be walked end to end. */
function won(encounterId: string, earned: Record<string, number> = {}): GameState {
  const encounter = CONTENT.encounters[encounterId]!;
  const map = CONTENT.maps[encounter.mapId]!;
  const party = [UNITS["rowen"]!];
  const start = createBattle(CONTENT, encounterId, party, [
    { unitId: "rowen", position: { ...map.deploymentTiles[0]! }, facing: "north" },
  ]);
  const state = structuredClone(start.state);
  state.result = "win";
  for (const unit of state.units) {
    if (unit.team !== "player") continue;
    unit.standingEarned = earned[unit.id] ?? 0;
    unit.downed = false;
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

  it("squares every deployed unit up to its nearest enemy, not a fixed compass point", () => {
    const h = harness();
    h.session.beginDeployment(ENCOUNTER_ID);
    // The yard's one provocateur stands at (4,0): due east of the (0,4) tile
    // on the tie-break, north-of-east from the rest of the line.
    const byTile = new Map(
      h.session.deploymentPlacements().map((p) => [`${p.position.x},${p.position.y}`, p.facing]),
    );
    expect(byTile.get("0,4")).toBe("east");
    expect(byTile.get("1,4")).toBe("north");
    expect(byTile.get("0,5")).toBe("north");
    expect(byTile.get("1,5")).toBe("north");
    expect(byTile.size).toBeGreaterThanOrEqual(4);
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

  it("keeps the formation the player laid out when they walk back into it", () => {
    const h = harness();
    const pending = h.session.beginDeployment(ENCOUNTER_ID)!;
    const benched = pending.assignments[0]!;
    expect(h.session.toggleDeployment(benched)).toBe(true);
    const laidOut = [...pending.assignments];

    // Move out, off the screen and back on again: the same engagement.
    expect(h.session.beginDeployment(ENCOUNTER_ID)!.assignments).toEqual(laidOut);
    expect(h.session.deploymentPlacements().some((p) => p.unitId === benched)).toBe(false);
  });

  it("re-fills from the roster head for a different engagement", () => {
    const h = harness();
    const pending = h.session.beginDeployment(ENCOUNTER_ID)!;
    h.session.toggleDeployment(pending.assignments[0]!);
    const other = h.session.beginDeployment("e2-foundry-floor-nine")!;
    expect(other.assignments[0]).toBe(h.session.state.roster[0]!.id);
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

  it("takes a forfeited battle as the loss it is, and files the record for it", () => {
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    const before = h.session.state;
    // The briefing's forfeit hands the battle over unfinished: the rules never
    // called it, so the state carries no result at all.
    const given = finished({ result: "win", earned: { rowen: 70 } });
    given.result = null;
    h.battle.finish(given);

    expect(h.runner.lastOutcome?.result).toBe("loss");
    expect(h.runner.lastOutcome?.advanced).toBe(false);
    expect(h.session.state).toBe(before);
    expect(h.screens.results).toHaveLength(1);
    expect(h.runner.phase).toBe("roster");
    expect(h.runner.beginDeployment()).toBe(true);
  });

  it("keeps the staged formation when Move out is pressed a second time", () => {
    h.runner.start();
    h.runner.beginDeployment();
    const benched = h.session.deployment!.assignments[0]!;
    expect(h.session.toggleDeployment(benched)).toBe(true);
    const laidOut = [...h.session.deployment!.assignments];

    // Back to the roster off the formation screen, then out again: same
    // engagement, so the layout is the player's and not the roster head's.
    expect(h.runner.beginDeployment()).toBe(true);
    expect(h.session.deployment!.assignments).toEqual(laidOut);
  });

  it("strikes a unit that stayed down through a win", () => {
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(finished({ result: "win", downed: ["rowen"] }));

    expect(rosterUnit(h.session.state, "rowen")).toBeNull();
    expect(h.session.state.fallen.map((entry) => entry.unitId)).toEqual(["rowen"]);
    const record = h.screens.results.at(-1)!;
    expect(record.fallen.map((entry) => entry.name)).toEqual(["Rowen Corvane"]);
    expect(record.fallen[0]?.encounterName).toBe(CONTENT.encounters[ENCOUNTER_ID]?.name);
  });

  it("hands the battle's record to the player before the roster comes back", () => {
    h.screens.autoAdvance = false;
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(finished({ result: "win", earned: { rowen: 70 } }));

    expect(h.runner.phase).toBe("results");
    expect(h.screens.shown.at(-1)).toBe("results");
    const record = h.screens.results.at(-1)!;
    expect(record.result).toBe("win");
    expect(record.standingTotal).toBe(70);
    expect(record.standing[0]).toMatchObject({ unitId: "rowen", name: "Rowen Corvane", amount: 70 });

    h.screens.pendingAdvance!();
    expect(h.runner.phase).toBe("roster");
    expect(h.screens.shown.at(-1)).toBe("roster");
  });

  it("files a loss as a record of its own, banking nothing", () => {
    h.screens.autoAdvance = false;
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(finished({ result: "loss", earned: { rowen: 70 }, downed: ["rowen"] }));

    const record = h.screens.results.at(-1)!;
    expect(record.result).toBe("loss");
    expect(record.headline).toBe("Line Broken");
    expect(record.standing).toEqual([]);
    expect(record.standingTotal).toBe(0);
    expect(record.fallen).toEqual([]);
  });

  it("stops rather than replaying the last battle while later encounters are unauthored", () => {
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
    expect(h.session.playableEncounterId()).toBeNull();

    expect(h.runner.beginDeployment()).toBe(false);
    expect(h.screens.notices.at(-1)).toContain("not authored yet");
  });

  it("runs the chapter out and reaches the end of it", () => {
    h.runner.start();
    for (const encounterId of chapter().encounterIds) {
      expect(h.runner.beginDeployment(), encounterId).toBe(true);
      expect(h.session.deployment?.encounterId).toBe(encounterId);
      h.runner.confirmDeployment();
      h.battle.finish(won(encounterId, { rowen: 20 }));
    }

    expect(h.runner.phase).toBe("complete");
    expect(h.session.playableEncounterId()).toBeNull();

    // The chapter closes on a record, not a toast: engagements won, Standing
    // banked, who is still standing.
    const closing = h.screens.closes.at(-1)!;
    expect(closing.chapterName).toBe(chapter().name);
    expect(closing.engagements.map((entry) => entry.encounterId)).toEqual(chapter().encounterIds);
    expect(closing.standingTotal).toBeGreaterThan(0);
    expect(closing.survivors.map((unit) => unit.name)).toContain("Rowen Corvane");

    expect(h.runner.beginDeployment()).toBe(false);
    expect(h.screens.notices.at(-1)).toContain("Return to a completed engagement");
  });

  it("returns to a completed engagement, banking again without advancing", () => {
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(won(ENCOUNTER_ID));
    const index = h.session.state.encounterIndex;
    const banked = jobProgress(h.session.state, "rowen", "enforcer").balance;

    expect(h.session.completedEncounters().map((entry) => entry.id)).toEqual([ENCOUNTER_ID]);
    expect(h.runner.replayEncounter(ENCOUNTER_ID)).toBe(true);
    expect(h.runner.phase).toBe("formation");
    expect(h.runner.confirmDeployment()).toBe(true);
    expect(h.battle.started.at(-1)?.encounterId).toBe(ENCOUNTER_ID);
    h.battle.finish(won(ENCOUNTER_ID, { rowen: 35 }));

    expect(h.runner.lastOutcome?.advanced).toBe(false);
    expect(h.session.state.encounterIndex).toBe(index);
    expect(jobProgress(h.session.state, "rowen", "enforcer").balance).toBe(banked + 35);
  });

  it("refuses to return to an engagement that has not been won", () => {
    h.runner.start();
    expect(h.runner.replayEncounter("e5-charterhouse-steps")).toBe(false);
    expect(h.runner.phase).toBe("roster");
    expect(h.screens.notices.at(-1)).toContain("not on the record");
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

describe("the chapter's closing record", () => {
  it("is presented once; the roster says it in one line afterwards", () => {
    const campaign = chapter();
    const state = createCampaign(campaign, UNITS);
    state.encounterIndex = campaign.encounterIds.length;
    const h = harness(state);

    h.runner.start();
    expect(h.screens.closes).toHaveLength(1);
    expect(h.screens.notices).toHaveLength(0);

    h.runner.openRoster();
    expect(h.screens.closes).toHaveLength(1);
    expect(h.screens.notices.at(-1)).toContain("no further engagements");
  });
});

describe("the chapter satchel", () => {
  it("hands the whole consumable stock to the battle, and nothing else", () => {
    const h = harness();
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    const carried = h.battle.started[0]?.carried ?? [];
    expect(carried.length).toBeGreaterThan(0);
    for (const stack of carried) {
      expect(CONTENT.items[stack.itemId]?.slot, `${stack.itemId} is not a consumable`).toBe(
        "consumable",
      );
      expect(stack.count).toBe(inventoryCount(h.session.state, stack.itemId));
    }
    expect(carried.map((stack) => stack.itemId)).not.toContain("riot-shield");
  });

  it("takes the spent stock out of stock when the field is held", () => {
    const h = harness();
    const before = inventoryCount(h.session.state, "coagulant-vial");
    expect(before).toBeGreaterThan(1);
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    const carried = h.battle.started[0]?.carried ?? [];
    const home = carried.map((stack) =>
      stack.itemId === "coagulant-vial" ? { ...stack, count: stack.count - 2 } : { ...stack },
    );
    h.battle.finish(finished({ result: "win", satchel: home }));
    expect(inventoryCount(h.session.state, "coagulant-vial")).toBe(before - 2);
    expect(h.runner.lastOutcome?.consumed).toEqual([{ itemId: "coagulant-vial", count: 2 }]);
    expect(h.screens.results.at(-1)?.consumed).toEqual([
      { itemId: "coagulant-vial", name: CONTENT.items["coagulant-vial"]?.name, count: 2 },
    ]);
  });

  it("gives it all back after a wipe", () => {
    const h = harness();
    const before = inventoryCount(h.session.state, "coagulant-vial");
    h.runner.start();
    h.runner.beginDeployment();
    h.runner.confirmDeployment();
    h.battle.finish(finished({ result: "loss", satchel: [] }));
    expect(inventoryCount(h.session.state, "coagulant-vial")).toBe(before);
  });
});
