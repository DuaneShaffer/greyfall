/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, type ContentLibrary } from "../../src/core/index.js";
import { Campaign, type Unit } from "../../src/data/index.js";
import { CampaignSession } from "../../src/app/campaign.js";
import { BetweenBattleScreens } from "../../src/app/betweenBattles.js";
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
}

function harness(): Harness {
  const campaign = chapter();
  const h = { deployRequests: 0, confirmRequests: 0, replayRequests: [] } as unknown as Harness;
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

  it("shows a toast when an op is refused, and retires it on tick", () => {
    h.session.learnAbility("rowen", "overload-cell");
    expect(h.screens.el.querySelector(".gf-toast")?.classList.contains("is-hidden")).toBe(false);
    for (let i = 0; i < 5; i += 1) h.screens.tick();
    expect(h.screens.el.querySelector(".gf-toast")?.classList.contains("is-hidden")).toBe(true);
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
    expect(h.screens.formation.el.textContent).toContain("deployed");
  });

  it("offers the engagements already won, and nothing before one is", () => {
    const returnTo = [...h.screens.el.querySelectorAll<HTMLElement>(".gf-between-bar .gf-button")].find(
      (node) => node.textContent === "Return to…",
    );
    expect(returnTo).toBeDefined();

    returnTo!.click();
    expect(h.screens.el.textContent).toContain("No engagement has been won yet.");

    h.session.state.completedEncounterIds.push("e1-marshaling-yard");
    returnTo!.click();
    const entry = h.screens.roster.el.querySelector<HTMLElement>(
      '.gf-menu-entry[data-entry="e1-marshaling-yard"]',
    );
    expect(entry).toBeDefined();
    entry!.click();
    expect(h.replayRequests).toEqual(["e1-marshaling-yard"]);
  });

  it("toggles a unit off the field from the formation list", () => {
    h.session.beginDeployment("e1-marshaling-yard");
    h.screens.showFormation();
    const first = h.session.state.roster[0]!.id;
    const entry = h.screens.formation.el.querySelector<HTMLElement>(
      `.gf-menu-entry[data-entry="${first}"]`,
    );
    expect(entry).toBeDefined();
    entry!.click();
    expect(h.session.deployment!.assignments).not.toContain(first);
    expect(h.screens.formation.el.textContent).toContain("Reserve");
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
});
