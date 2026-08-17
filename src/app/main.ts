// Browser entry: open the campaign register, then run the campaign the player
// picks — roster, formation, battle, results, roster.
//
// This module is the only place Three.js, the DOM, and the core all meet; the
// battle controller and the campaign runner each see them through ports.
//
// The renderer, HUD, and end banner are built once and outlive every campaign;
// the session, the between-battle screens, and the runner belong to whichever
// campaign is open and are rebuilt when another one is.

import "../ui/styles.css";
import {
  createBattle,
  createCampaign,
  type BattleResult,
  type Deployment,
  type GameState,
  type InventoryStack,
} from "../core/index.js";
import type { DialogueLine, Encounter, Facing, TileCoord, Unit } from "../data/index.js";
import { BattleRenderer, attachControls, palette } from "../render/index.js";
import { viewModelFromGameState } from "../render/adapter.js";
import {
  BattleHud,
  CampaignSelectScreen,
  el,
  noopIntents,
  type BattleHudView,
  type CampaignSelectView,
  type HudMode,
  type MenuDef,
  type NoticeTone,
  type UiIntents,
} from "../ui/index.js";
import { BetweenBattleScreens } from "./betweenBattles.js";
import { CampaignSession } from "./campaign.js";
import { CampaignRunner, type BattlePort } from "./campaignRunner.js";
import { CONTENT, UNITS, campaignById, campaignList } from "./content.js";
import { BattleController, type RendererPort, type UiPort } from "./controller.js";
import { loadCampaign, migrateSaves, saveCampaign } from "./save.js";
import { stubAiCommand } from "./stubAi.js";

const canvas = document.getElementById("battle-canvas");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#battle-canvas missing");
const uiRoot = document.getElementById("ui-root");
if (!(uiRoot instanceof HTMLElement)) throw new Error("#ui-root missing");
// A narrowed `const` loses its narrowing inside a hoisted function declaration,
// and mounting a campaign's screens happens inside one.
const overlayHost: HTMLElement = uiRoot;

// --- the open campaign ------------------------------------------------------
// Saves are filed per campaign; a file written before that was true is moved to
// the key for the campaign it names before anything reads one.

migrateSaves();

let session: CampaignSession | null = null;
let screens: BetweenBattleScreens | null = null;
let runner: CampaignRunner | null = null;

// --- battle layer -----------------------------------------------------------

const renderer = new BattleRenderer({
  canvas,
  onTileHover: (tile) => controller?.onTileHover(tile),
  onTileSelect: (tile) => onTileSelected(tile),
});

let controller: BattleController | null = null;
let deploymentTiles: readonly TileCoord[] = [];

const rendererPort: RendererPort = {
  buildScene: (view) => {
    renderer.buildScene(view);
    renderer.setHighlight("deployment", deploymentTiles, palette.highlightDeployment, {
      opacity: 0.14,
    });
  },
  applyRenderEvents: (events) => renderer.applyRenderEvents(events),
  setHighlight: (layerId, tiles, color, options) =>
    renderer.setHighlight(layerId, tiles, color, options),
  clearHighlight: (layerId) => renderer.clearHighlight(layerId),
  setMovePreview: (preview) => renderer.setMovePreview(preview),
  skipPresentation: () => renderer.skipPresentation(),
  isPresentationIdle: () => renderer.queue.isIdle,
};

const bannerResult = el("p", { class: "gf-end-banner-result" });
const bannerNote = el("p", { class: "gf-end-banner-note" });
const bannerContinue = el("button", {
  class: "gf-button",
  text: "Continue",
  attrs: { type: "button" },
});
const banner = el("div", {
  class: "gf-end-banner is-hidden",
  attrs: { role: "status", id: "end-banner" },
  children: [
    el("div", {
      class: "gf-end-banner-plate",
      children: [bannerResult, bannerNote, bannerContinue],
    }),
  ],
});

const FACING_LABELS: Record<Facing, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};
const FACING_ORDER: readonly Facing[] = ["north", "east", "south", "west"];
const FACING_MENU_ID = "action-facing";

/** Dialogue owns Enter/Space while it is open; the menus take them otherwise. */
const focusDialogue = (open: boolean): void => {
  if (open) {
    hud.actionMenu.menus.detach();
    hud.dialogue.attach(document);
  } else {
    hud.dialogue.detach();
    hud.actionMenu.attach(document);
  }
};

let onBattleEnd: ((final: GameState) => void) | null = null;
/** The engagement on the field, for the flavour the end banner reads. */
let currentEncounter: Encounter | null = null;

const uiPort: UiPort = {
  // Deliberately not `hud.update`: that would restart an open dialogue's reveal
  // on every refresh. Dialogue is driven through showDialogue instead.
  render: (view: BattleHudView) => hud.render(view),
  setMode: (mode: HudMode, detail?: string | null) => hud.setMode(mode, detail),
  lockForecast: () => hud.forecast.lock(),
  showFinalState: (view: BattleHudView | null, _result: BattleResult | null) => {
    if (view !== null) hud.render(view);
    // Nothing on the field is live any more: no pending action, no orders, and
    // nothing to inspect that the closing panel does not already say.
    hud.forecast.clear();
    hud.status.update(null);
    hud.setMode("ended", null);
    hud.actionMenu.menus.detach();
  },
  showDialogue: (lines: DialogueLine[]) => {
    hud.dialogue.update(lines);
    focusDialogue(true);
  },
  hideDialogue: () => {
    hud.dialogue.update([]);
    focusDialogue(false);
  },
  showResult: (result: BattleResult) => {
    bannerResult.textContent = result === "win" ? "Field Held" : "Line Broken";
    const authored = result === "win" ? currentEncounter?.endText?.win : currentEncounter?.endText?.loss;
    bannerNote.textContent =
      authored ?? (result === "win" ? "The field is yours." : "The line did not hold.");
    banner.classList.toggle("is-loss", result === "loss");
    banner.classList.remove("is-hidden");
    bannerContinue.focus();
  },
  promptFacing: (current, onPick, onCancel) => {
    const menu: MenuDef = {
      id: FACING_MENU_ID,
      title: "Face",
      entries: FACING_ORDER.map((facing) => ({
        id: facing,
        label: FACING_LABELS[facing],
        ...(facing === current ? { detail: "current" } : {}),
      })),
      onSelect: (entry) => onPick(entry.id as Facing),
      onCancel: () => onCancel(),
    };
    hud.actionMenu.menus.push(menu);
  },
  closePrompt: () => {
    if (hud.actionMenu.menus.path.includes(FACING_MENU_ID)) hud.actionMenu.menus.pop();
  },
  resetMenus: () => {
    while (hud.actionMenu.menus.depth > 1) hud.actionMenu.menus.pop();
  },
  setBusy: (busy) => {
    if (busy) hud.actionMenu.menus.detach();
    else if (!hud.dialogue.isOpen) hud.actionMenu.attach(document);
  },
  notify: (message, tone?: NoticeTone) => hud.notify(message, tone ?? "info"),
};

/**
 * The HUD is built once and outlives every battle, so its intents forward to
 * whichever controller currently holds the floor rather than to a fixed one.
 */
function forwardingIntents(): UiIntents {
  const out = {} as UiIntents;
  for (const name of Object.keys(noopIntents()) as (keyof UiIntents)[]) {
    (out as unknown as Record<string, (...args: never[]) => void>)[name] = (...args: never[]) => {
      const target = controller?.intents as
        | Record<string, ((...args: never[]) => void) | undefined>
        | undefined;
      target?.[name]?.(...args);
    };
  }
  return out;
}

const hud = new BattleHud({
  intents: forwardingIntents(),
  onOrbit: (direction) => renderer.rig.orbit(direction),
});

const battlePort: BattlePort = {
  start: (
    encounterId,
    party: readonly Unit[],
    deployment: readonly Deployment[],
    carried: readonly InventoryStack[],
    onEnd,
  ) => {
    const encounter = CONTENT.encounters[encounterId];
    if (encounter === undefined) throw new Error(`missing encounter ${encounterId}`);
    const map = CONTENT.maps[encounter.mapId];
    if (map === undefined) throw new Error(`missing map ${encounter.mapId}`);
    deploymentTiles = map.deploymentTiles;

    const battle = createBattle(CONTENT, encounterId, party, deployment, carried);
    onBattleEnd = onEnd;
    currentEncounter = encounter;
    banner.classList.add("is-hidden");
    clearFieldPreview();

    const next = new BattleController({
      state: battle.state,
      events: battle.events,
      renderer: rendererPort,
      ui: uiPort,
      ai: stubAiCommand,
    });
    controller = next;
    hud.notice.clear();
    hud.el.classList.remove("is-hidden");
    next.start();
    console.info(
      `[greyfall] ${encounter.name}: ${map.width}x${map.depth} tiles, ${map.objects.length} objects`,
    );
  },
  end: () => {
    hud.actionMenu.menus.detach();
    hud.dialogue.detach();
    hud.notice.clear();
    hud.el.classList.add("is-hidden");
    banner.classList.add("is-hidden");
    controller = null;
    onBattleEnd = null;
    currentEncounter = null;
  },
};

// --- formation on the field --------------------------------------------------
// The formation screen drives the real renderer: the map is built from the
// staged formation, the deployment tiles are lit, and a click out there places
// the held unit. Picking tiles from a list of coordinates was never a formation.

let previewSignature = "";
let placingUnitId: string | null = null;

function clearFieldPreview(): void {
  previewSignature = "";
  placingUnitId = null;
  renderer.clearHighlight("deploy-open");
  renderer.clearHighlight("deploy-taken");
}

/** Rebuild the preview battle only when the staged formation actually moved. */
function showFieldPreview(): void {
  const active = session;
  if (active === null) return;
  const pending = active.deployment;
  const view = active.deploymentView();
  if (pending === null || view === null) return;
  const placements = active.deploymentPlacements();
  const signature = `${pending.encounterId}|${pending.assignments.join(",")}`;
  if (signature !== previewSignature) {
    previewSignature = signature;
    deploymentTiles = pending.map.deploymentTiles;
    try {
      const preview = createBattle(
        CONTENT,
        pending.encounterId,
        active.deployedParty(),
        placements,
        active.carriedItems(),
      );
      renderer.buildScene(viewModelFromGameState(preview.state));
    } catch (error) {
      console.warn("[greyfall] formation preview unavailable", error);
      return;
    }
  }
  const taken = view.slots.filter((slot) => slot.unitId !== null).map((slot) => slot.tile);
  const open = view.slots.filter((slot) => slot.unitId === null).map((slot) => slot.tile);
  renderer.setHighlight("deploy-taken", taken, palette.highlightMove, { opacity: 0.22 });
  renderer.setHighlight(
    "deploy-open",
    open,
    placingUnitId === null ? palette.highlightDeployment : palette.highlightPath,
    { opacity: placingUnitId === null ? 0.2 : 0.42, yOffset: 0.04 },
  );
}

/** Canvas clicks belong to the battle, or to the formation when one is staged. */
function onTileSelected(tile: TileCoord | null): void {
  if (controller !== null) {
    controller.onTileClick(tile);
    return;
  }
  if (tile === null || session === null || screens === null) return;
  if (screens.current !== "formation") return;
  const view = session.deploymentView();
  const index = view?.slots.findIndex((slot) => slot.tile.x === tile.x && slot.tile.y === tile.y);
  if (index === undefined || index === -1) {
    screens.notify("Not a deployment tile.");
    return;
  }
  screens.formation.pickTile(index);
}

// --- the campaign register --------------------------------------------------

const picker = new CampaignSelectScreen({ onPick: (campaignId) => startCampaign(campaignId) });
const pickerHost = el("section", {
  class: "gf-root gf-campaign-boot",
  children: [picker.el],
});

function registerView(): CampaignSelectView {
  return {
    campaigns: campaignList().map((campaign) => {
      const filed = loadCampaign(campaign.id);
      return {
        campaignId: campaign.id,
        name: campaign.name,
        description: campaign.description,
        encounterCount: campaign.encounterIds.length,
        file: filed.ok
          ? { engagementsClosed: filed.campaign.completedEncounterIds.length }
          : null,
      };
    }),
  };
}

function showRegister(): void {
  picker.update(registerView());
  pickerHost.classList.remove("is-hidden");
  picker.attach(document);
}

/** Open a campaign on its own record, or on a fresh one if it has none. */
function startCampaign(campaignId: string): void {
  const campaign = campaignById(campaignId);
  closeCampaign();
  const filed = loadCampaign(campaign.id);
  picker.menus.detach();
  pickerHost.classList.add("is-hidden");

  const opened = new CampaignSession({
    campaign,
    content: CONTENT,
    state: filed.ok ? filed.campaign : createCampaign(campaign, UNITS),
    onChange: (next) => {
      saveCampaign(next);
      screens?.refresh();
    },
    onError: (error) => screens?.notify(error.message),
  });
  session = opened;

  screens = new BetweenBattleScreens(opened, {
    beginDeployment: () => void runner?.beginDeployment(),
    confirmDeployment: () => void runner?.confirmDeployment(),
    replayEncounter: (encounterId) => void runner?.replayEncounter(encounterId),
    onFormationChanged: (placing) => {
      placingUnitId = placing;
      showFieldPreview();
    },
    onFormationClosed: () => clearFieldPreview(),
    save: () => {
      saveCampaign(opened.state);
      screens?.notify("Progress filed.");
    },
    load: () => {
      const loaded = loadCampaign(campaign.id);
      if (!loaded.ok) {
        screens?.notify(loaded.reason);
        return;
      }
      opened.replaceState(loaded.campaign);
      runner?.openRoster();
      // Reopening the file reported only when it failed, so a successful load
      // was indistinguishable from a dead button — under a "Progress filed."
      // toast that was still on screen from the save before it.
      screens?.notify("File reopened.");
    },
    leaveCampaign: () => {
      closeCampaign();
      showRegister();
    },
  });
  overlayHost.append(screens.el);
  screens.attach(document);

  runner = new CampaignRunner({ session: opened, battle: battlePort, screens });
  runner.start();
}

/** File the open campaign's record and tear its layer down. */
function closeCampaign(): void {
  const active = session;
  if (active === null) return;
  saveCampaign(active.state);
  battlePort.end();
  clearFieldPreview();
  screens?.destroy();
  session = null;
  screens = null;
  runner = null;
}

bannerContinue.addEventListener("click", () => {
  const final = controller?.state;
  const finish = onBattleEnd;
  if (final === undefined || finish === null) return;
  onBattleEnd = null;
  finish(final);
});

overlayHost.classList.add("gf-root", "is-overlay");
overlayHost.append(hud.el, banner, pickerHost);
hud.el.classList.add("is-hidden");

/**
 * Camera keys are the player's whenever nothing on screen is listening for
 * them. A dialogue box, an open menu, or a between-battle screen all own the
 * keyboard; arrow keys panning the map out from under an open dialogue is the
 * overlay leaking input it never took.
 */
const uiOwnsKeyboard = (): boolean => {
  if (hud.dialogue.isOpen) return true;
  if (!banner.classList.contains("is-hidden")) return true;
  if (!pickerHost.classList.contains("is-hidden")) return true;
  if (screens !== null && !screens.el.classList.contains("is-hidden")) return true;
  return controller?.phase === "player";
};

attachControls(renderer, canvas, { panKeysEnabled: () => !uiOwnsKeyboard() });
renderer.start();

renderer.addFrameHook((delta) => {
  controller?.tick(delta);
  hud.tick(delta * 1000);
  screens?.tick(delta * 1000);
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "x") controller?.skipPresentation();
});

showRegister();

/**
 * Debug seam. Agents and humans drive the running campaign from the devtools
 * console (and over CDP) through this handle; nothing in the app reads it.
 * `session` and `runner` are getters because both are null until a campaign is
 * picked and are replaced when another one is.
 */
declare global {
  interface Window {
    greyfall?: {
      renderer: BattleRenderer;
      hud: BattleHud;
      readonly session: CampaignSession | null;
      readonly runner: CampaignRunner | null;
      controller: () => BattleController | null;
      campaigns: () => string[];
      start: (campaignId: string) => void;
    };
  }
}
window.greyfall = {
  renderer,
  hud,
  get session() {
    return session;
  },
  get runner() {
    return runner;
  },
  controller: () => controller,
  campaigns: () => campaignList().map((campaign) => campaign.id),
  start: (campaignId: string) => startCampaign(campaignId),
};
