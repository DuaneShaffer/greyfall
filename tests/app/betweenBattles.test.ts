/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, type ContentLibrary } from "../../src/core/index.js";
import { Campaign, type Unit } from "../../src/data/index.js";
import { CampaignSession } from "../../src/app/campaign.js";
import { BetweenBattleScreens } from "../../src/app/betweenBattles.js";
import { campaignStats } from "../../src/app/campaignViews.js";
import type { BattleResultsView } from "../../src/ui/index.js";
import { loadContent, loadUnits } from "../core/fixtures.js";

const CAMPAIGN_PATH = join(import.meta.dirname, "..", "..", "data", "campaigns", "foundry-chapter.json");
const chapter = (): Campaign => Campaign.parse(JSON.parse(readFileSync(CAMPAIGN_PATH, "utf8")));

const CONTENT: ContentLibrary = loadContent();
const UNITS: Record<string, Unit> = loadUnits();

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

interface Harness {
  session: CampaignSession;
  screens: BetweenBattleScreens;
  deployRequests: number;
  confirmRequests: number;
  replayRequests: string[];
  leaveRequests: number;
}

function harness(): Harness {
  const campaign = chapter();
  const h = {
    deployRequests: 0,
    confirmRequests: 0,
    replayRequests: [],
    leaveRequests: 0,
  } as unknown as Harness;
  h.session = new CampaignSession({
    campaign,
    content: CONTENT,
    state: createCampaign(campaign, UNITS),
    onChange: () => h.screens.refresh(),
    onError: (error) => h.screens.notify(error.message),
  });
  h.screens = new BetweenBattleScreens(h.session, {
    beginDeployment: () => {
      h.deployRequests += 1;
      h.session.beginDeployment("e1-marshaling-yard");
      h.screens.showFormation();
    },
    confirmDeployment: () => {
      h.confirmRequests += 1;
    },
    replayEncounter: (encounterId) => void h.replayRequests.push(encounterId),
    leaveCampaign: () => {
      h.leaveRequests += 1;
    },
  });
  h.screens.attach(document);
  h.screens.showRoster();
  return h;
}

describe("BetweenBattleScreens", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it("opens on the roster and lists the whole party", () => {
    expect(h.screens.current).toBe("roster");
    const entries = h.screens.roster.el.querySelectorAll(".gf-menu-entry");
    expect(entries.length).toBe(h.session.state.roster.length);
    expect(h.screens.el.textContent).toContain("Rowen Corvane");
  });

  it("carries the campaign name in the chrome", () => {
    expect(h.screens.el.querySelector(".gf-between-brand")?.textContent).toBe(chapter().name);
  });

  it("opens the per-unit screens from the roster's action menu", () => {
    h.screens.roster.menus.handleKey(key("Enter"));
    h.screens.roster.menus.handleKey(key("Enter"));
    expect(h.screens.current).toBe("sheet");

    h.screens.showRoster();
    h.screens.roster.menus.handleKey(key("Enter"));
    h.screens.roster.menus.handleKey(key("ArrowDown"));
    h.screens.roster.menus.handleKey(key("Enter"));
    expect(h.screens.current).toBe("learning");
  });

  it("spends Standing through the learning screen's own menus", () => {
    h.screens.roster.menus.handleKey(key("Enter"));
    h.screens.roster.menus.handleKey(key("ArrowDown"));
    h.screens.roster.menus.handleKey(key("Enter"));
    expect(h.screens.current).toBe("learning");

    const view = h.session.learningView("rowen")!;
    const affordable = view.entries.find(
      (entry) => !entry.learned && entry.standingCost <= view.standing,
    );
    expect(affordable).toBeDefined();

    const row = h.screens.learning.el.querySelector<HTMLElement>(
      `.gf-menu-entry[data-entry="${affordable!.abilityId}"]`,
    );
    row!.click();
    const confirm = h.screens.learning.el.querySelector<HTMLElement>(
      '.gf-menu-entry[data-entry="confirm"]',
    );
    expect(confirm).toBeDefined();
    confirm!.click();

    expect(h.session.state.progress.find((p) => p.unitId === "rowen")!.learned).toContain(
      affordable!.abilityId,
    );
    expect(h.session.learningView("rowen")!.standing).toBe(view.standing - affordable!.standingCost);
  });

  it("acknowledges the Standing it just spent", () => {
    h.screens.roster.menus.handleKey(key("Enter"));
    h.screens.roster.menus.handleKey(key("ArrowDown"));
    h.screens.roster.menus.handleKey(key("Enter"));
    const view = h.session.learningView("rowen")!;
    const affordable = view.entries.find(
      (entry) => !entry.learned && entry.standingCost <= view.standing,
    )!;

    h.screens.learning.el
      .querySelector<HTMLElement>(`.gf-menu-entry[data-entry="${affordable.abilityId}"]`)!
      .click();
    h.screens.learning.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="confirm"]')!.click();

    const toast = h.screens.el.querySelector(".gf-toast")!;
    expect(toast.classList.contains("is-hidden")).toBe(false);
    expect(toast.textContent).toContain(affordable.name);
    expect(toast.textContent).toContain("Rowen Corvane");
    expect(toast.textContent).toContain(`${affordable.standingCost} Standing spent`);
    expect(toast.textContent).toContain(`${h.session.learningView("rowen")!.standing} left`);
  });

  it("shows a toast when an op is refused, and retires it on tick", () => {
    h.session.learnAbility("rowen", "overload-cell");
    expect(h.screens.el.querySelector(".gf-toast")?.classList.contains("is-hidden")).toBe(false);
    for (let i = 0; i < 5; i += 1) h.screens.tick();
    expect(h.screens.el.querySelector(".gf-toast")?.classList.contains("is-hidden")).toBe(true);
  });

  // A toast answers the thing the player just did on the page they did it on.
  // Carried across, it reads as the next screen's own answer — which is how a
  // reopened file came to be announced by "Progress filed." (finding D).
  it("retires a toast rather than carrying it onto the next screen", () => {
    h.session.learnAbility("rowen", "overload-cell");
    const toast = h.screens.el.querySelector(".gf-toast")!;
    expect(toast.classList.contains("is-hidden")).toBe(false);

    [...h.screens.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")]
      .find((node) => node.textContent === "Move out")!
      .click();

    expect(h.screens.current).toBe("formation");
    expect(toast.classList.contains("is-hidden")).toBe(true);
  });

  it("moves out into the formation screen and lists the deployment tiles", () => {
    const moveOut = [...h.screens.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")].find(
      (node) => node.textContent === "Move out",
    );
    expect(moveOut).toBeDefined();
    moveOut!.click();

    expect(h.deployRequests).toBe(1);
    expect(h.screens.current).toBe("formation");
    const slots = h.screens.formation.el.querySelectorAll(".gf-deploy-slot");
    expect(slots.length).toBe(h.session.deployment!.assignments.length);
    expect(h.screens.formation.el.textContent).toContain("tiles filled");
  });

  it("reads the other side of the board onto the formation screen", () => {
    [...h.screens.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")]
      .find((node) => node.textContent === "Move out")!
      .click();

    const enemies = h.screens.formation.el.querySelectorAll<HTMLElement>(".gf-deploy-enemy");
    const encounter = CONTENT.encounters["e1-marshaling-yard"]!;
    expect(enemies.length).toBe(encounter.enemies.length);
    // Absolute HP off the same derivation the battle runs, not a fraction of it.
    const stats = campaignStats(CONTENT, encounter.enemies[0]!.unit)!;
    expect(enemies[0]!.textContent).toContain(`${stats.hp} / ${stats.hp}`);
    expect(h.screens.formation.el.textContent).toContain("The opposition forms up to the");
  });

  it("names whoever the pointer found out on the field", () => {
    [...h.screens.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")]
      .find((node) => node.textContent === "Move out")!
      .click();

    const intel = h.screens.formation.el.querySelector<HTMLElement>(".gf-deploy-intel")!;
    expect(intel.classList.contains("is-hidden")).toBe(true);

    h.screens.hoverFieldUnit({ id: "provocateur-a" });
    expect(intel.classList.contains("is-hidden")).toBe(false);
    expect(intel.textContent).toContain("Provocateur");

    h.screens.hoverFieldUnit(null);
    expect(intel.classList.contains("is-hidden")).toBe(true);
  });

  it("offers the engagements already won, and nothing before one is", () => {
    // "Return to…" named nowhere; the destination is an engagement already won.
    const returnTo = [...h.screens.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")].find(
      (node) => node.textContent === "Return to an engagement",
    );
    expect(returnTo).toBeDefined();

    returnTo!.click();
    expect(h.screens.el.textContent).toContain("No engagement has been won yet.");

    h.session.state.completedEncounterIds.push("e1-marshaling-yard");
    returnTo!.click();
    expect(
      h.screens.roster.el.querySelector<HTMLElement>('[data-menu="replay-engagements"] .gf-menu-title')
        ?.textContent,
    ).toBe("Engagements won");
    const entry = h.screens.roster.el.querySelector<HTMLElement>(
      '.gf-menu-entry[data-entry="e1-marshaling-yard"]',
    );
    expect(entry).toBeDefined();
    entry!.click();
    expect(h.replayRequests).toEqual(["e1-marshaling-yard"]);
  });

  it("counts the staged formation on the roster it deploys from", () => {
    h.session.beginDeployment("e1-marshaling-yard");
    h.screens.showRoster();
    const note = h.screens.roster.el.querySelector(".gf-screen-note")?.textContent ?? "";
    expect(note).toMatch(/^\d+\/\d+ deployed$/);
  });

  it("offers a way back to the campaign register", () => {
    const campaigns = [...h.screens.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")].find(
      (node) => node.textContent === "Campaigns",
    );
    expect(campaigns).toBeDefined();
    campaigns!.click();
    expect(h.leaveRequests).toBe(1);
  });

  it("leaves the register button off the bar when there is nowhere to go back to", () => {
    const bare = new BetweenBattleScreens(h.session, {
      beginDeployment: () => undefined,
      confirmDeployment: () => undefined,
    });
    const labels = [...bare.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")].map(
      (node) => node.textContent,
    );
    expect(labels).not.toContain("Campaigns");
  });

  it("picks a fielded unit up for re-placement, and withdraws it on demand", () => {
    h.session.beginDeployment("e1-marshaling-yard");
    h.screens.showFormation();
    const first = h.session.state.roster[0]!.id;
    const entry = h.screens.formation.el.querySelector<HTMLElement>(
      `.gf-menu-entry[data-entry="${first}"]`,
    );
    expect(entry).toBeDefined();
    entry!.click();
    expect(h.screens.formation.placingUnitId).toBe(first);
    expect(h.screens.formation.el.textContent).toContain("Pick a tile on the field");

    const withdraw = h.screens.formation.el.querySelector<HTMLElement>(
      '.gf-menu-entry[data-entry="__withdraw"]',
    );
    expect(withdraw).not.toBeNull();
    withdraw!.click();
    expect(h.session.deployment!.assignments).not.toContain(first);
    expect(h.screens.formation.el.textContent).toContain("Reserve");
  });

  it("places a held unit on a tile clicked out on the field", () => {
    h.session.beginDeployment("e1-marshaling-yard");
    h.screens.showFormation();
    const roster = h.session.state.roster;
    const first = roster[0]!.id;
    const entry = h.screens.formation.el.querySelector<HTMLElement>(
      `.gf-menu-entry[data-entry="${first}"]`,
    );
    entry!.click();
    expect(h.screens.formation.pickTile(2)).toBe(true);
    expect(h.session.deployment!.assignments[2]).toBe(first);
    expect(h.screens.formation.placingUnitId).toBeNull();
  });

  it("reports the confirm through the handler", () => {
    h.session.beginDeployment("e1-marshaling-yard");
    h.screens.showFormation();
    const confirm = h.screens.formation.el.querySelector<HTMLElement>(
      '.gf-menu-entry[data-entry="__confirm"]',
    );
    confirm!.click();
    expect(h.confirmRequests).toBe(1);
  });

  it("keeps exactly one screen on the keyboard", () => {
    h.session.beginDeployment("e1-marshaling-yard");
    h.screens.showFormation();
    const rosterDepth = h.screens.roster.menus.depth;
    document.dispatchEvent(key("Enter"));
    expect(h.screens.current).toBe("formation");
    expect(h.screens.roster.menus.depth).toBe(rosterDepth);

    h.screens.showRoster();
    document.dispatchEvent(key("Enter"));
    expect(h.screens.roster.menus.depth).toBe(2);
  });

  // The sheet is the only page with no menu of its own, so it was the only page
  // nothing was listening on: its own hint promised Escape and Escape was dead.
  it("hands the unit sheet back to the roster on Escape", () => {
    h.screens.roster.menus.handleKey(key("Enter"));
    h.screens.roster.menus.handleKey(key("Enter"));
    expect(h.screens.current).toBe("sheet");

    document.dispatchEvent(key("Escape"));
    expect(h.screens.current).toBe("roster");
  });

  it("gives the keyboard back rather than keeping a second listener on it", () => {
    h.screens.roster.menus.handleKey(key("Enter"));
    h.screens.roster.menus.handleKey(key("Enter"));
    document.dispatchEvent(key("Escape"));
    expect(h.screens.current).toBe("roster");

    // The roster's own cancel key still reaches the roster: the sheet's listener
    // is off the target, not stacked under the one that replaced it.
    expect(h.screens.roster.menus.depth).toBe(2);
    document.dispatchEvent(key("Escape"));
    expect(h.screens.roster.menus.depth).toBe(1);
    expect(h.screens.current).toBe("roster");
  });

  it("falls back to the roster when a screen has no view model", () => {
    h.screens.showFormation();
    h.session.cancelDeployment();
    h.screens.refresh();
    expect(h.screens.current).toBe("roster");
  });

  it("hides and reopens around a battle", () => {
    h.screens.hide();
    expect(h.screens.el.classList.contains("is-hidden")).toBe(true);
    h.screens.showRoster();
    expect(h.screens.el.classList.contains("is-hidden")).toBe(false);
  });

  it("lists the chapter's fallen on the roster, apart from the party", () => {
    h.session.state.fallen.push({
      unitId: "ivo",
      name: "Ivo Brace",
      jobId: "machinist",
      level: 3,
      encounterId: "e1-marshaling-yard",
    });
    h.screens.showRoster();

    const roll = h.screens.roster.el.querySelector(".gf-roster-fallen");
    expect(roll?.textContent).toContain("Ivo Brace");
    expect(roll?.textContent).toContain("Fell at The Marshaling Yard");
    expect(h.screens.roster.el.querySelector('.gf-menu-entry[data-entry="ivo"]')).toBeNull();
  });

  describe("the battle's record", () => {
    const record = (): BattleResultsView => ({
      result: "win",
      encounterId: "e1-marshaling-yard",
      encounterName: "The Marshaling Yard",
      headline: "Field Held",
      note: "Engagement closed and entered on the chapter.",
      standing: [
        {
          unitId: "rowen",
          name: "Rowen Corvane",
          jobName: "Enforcer",
          amount: 110,
          jobLevel: 3,
          jobLevelsGained: 1,
          struck: false,
        },
      ],
      standingTotal: 110,
      fallen: [
        {
          unitId: "ivo",
          name: "Ivo Brace",
          jobName: "Machinist",
          level: 3,
          encounterName: "The Marshaling Yard",
        },
      ],
      consumed: [],
      advanced: true,
    });

    it("stands between the battle and the roster, and does not retire itself", () => {
      let filed = 0;
      h.screens.showResults(record(), () => (filed += 1));

      expect(h.screens.current).toBe("results");
      const text = h.screens.el.textContent ?? "";
      expect(text).toContain("Field Held");
      expect(text).toContain("110");
      expect(text).toContain("Ivo Brace");

      // The toast's clock must not reach it: this page is closed by hand.
      for (let i = 0; i < 20; i += 1) h.screens.tick(1000);
      expect(h.screens.current).toBe("results");
      expect(filed).toBe(0);

      h.screens.el
        .querySelector<HTMLElement>('.gf-menu-entry[data-entry="advance"]')!
        .click();
      expect(filed).toBe(1);
    });

    it("stands the chapter's chrome down while it is up", () => {
      h.screens.showResults(record(), () => undefined);
      expect(h.screens.el.classList.contains("is-record")).toBe(true);
      h.screens.showRoster();
      expect(h.screens.el.classList.contains("is-record")).toBe(false);
    });

    it("takes the keyboard, and hands it back to the roster", () => {
      let filed = 0;
      h.screens.showResults(record(), () => {
        filed += 1;
        h.screens.showRoster();
      });
      document.dispatchEvent(key("Enter"));
      expect(filed).toBe(1);
      expect(h.screens.current).toBe("roster");
    });
  });

  describe("Move out, once the chapter is closed", () => {
    const moveOut = (): HTMLButtonElement =>
      [...h.screens.el.querySelectorAll<HTMLButtonElement>(".gf-between-bar .gf-button")].find(
        (node) => node.textContent === "Move out",
      )!;

    it("is live while an engagement is waiting", () => {
      expect(moveOut().disabled).toBe(false);
      expect(h.screens.el.querySelector(".gf-bar-reason")?.classList.contains("is-hidden")).toBe(
        true,
      );
    });

    it("is disabled with its reason on the bar once the chapter runs out", () => {
      h.session.state.encounterIndex = h.session.campaign.encounterIds.length;
      h.screens.showRoster();

      expect(moveOut().disabled).toBe(true);
      expect(moveOut().title).toContain("chapter is closed");
      const reason = h.screens.el.querySelector(".gf-bar-reason")!;
      expect(reason.classList.contains("is-hidden")).toBe(false);
      expect(reason.textContent).toContain("return to an engagement already won");

      moveOut().click();
      expect(h.deployRequests).toBe(0);
    });

  });
});
