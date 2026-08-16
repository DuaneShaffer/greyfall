// Browser entry: load the chapter, open the between-battle layer, and run the
// campaign loop — roster, formation, battle, results, roster.
//
// This module is the only place Three.js, the DOM, and the core all meet; the
// battle controller and the campaign runner each see them through ports.

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
import { BattleHud, el, noopIntents, type BattleHudView, type MenuDef, type UiIntents } from "../ui/index.js";
import { BetweenBattleScreens } from "./betweenBattles.js";
import { CampaignSession } from "./campaign.js";
import { CampaignRunner, type BattlePort } from "./campaignRunner.js";
import { CONTENT, UNITS, openingCampaign } from "./content.js";
import { BattleController, type RendererPort, type UiPort } from "./controller.js";
import { loadCampaign, saveCampaign } from "./save.js";
import { stubAiCommand } from "./stubAi.js";

const canvas = document.getElementById("battle-canvas");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#battle-canvas missing");
const overlayHost = document.getElementById("ui-root");
if (!(overlayHost instanceof HTMLElement)) throw new Error("#ui-root missing");
const status = document.getElementById("debug-status");

const setStatus = (text: string): void => {
  if (status) status.textContent = text;
};

// --- chapter ----------------------------------------------------------------

const campaign = openingCampaign();
const restored = loadCampaign();
const campaignState =
  restored.ok && restored.campaign.campaignId === campaign.id
    ? restored.campaign
    : createCampaign(campaign, UNITS);

const session = new CampaignSession({
  campaign,
  content: CONTENT,
  state: campaignState,
  onChange: (next) => {
    saveCampaign(next);
    screens.refresh();
  },
  onError: (error) => screens.notify(error.message),
});

// --- battle layer -----------------------------------------------------------

const renderer = new BattleRenderer({
  canvas,
  onTileHover: (tile) => controller?.onTileHover(tile),
  onTileSelect: (tile) => controller?.onTileClick(tile),
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
  render: (view: BattleHudView) => {
    hud.actionMenu.update(view.action);
    hud.status.update(view.inspected);
    hud.turnOrder.update(view.turnOrder);
    hud.forecast.update(view.forecast);
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
    setStatus(`battle over — ${result}`);
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
    hud.actionMenu.el.classList.toggle("is-busy", busy);
    if (busy) hud.actionMenu.menus.detach();
    else if (!hud.dialogue.isOpen) hud.actionMenu.attach(document);
  },
  notify: (message) => setStatus(message),
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

const hud = new BattleHud({ intents: forwardingIntents() });

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

    const next = new BattleController({
      state: battle.state,
      events: battle.events,
      renderer: rendererPort,
      ui: uiPort,
      ai: stubAiCommand,
    });
    controller = next;
    hud.el.classList.remove("is-hidden");
    next.start();
    console.info(
      `[greyfall] ${encounter.name}: ${map.width}x${map.depth} tiles, ${map.objects.length} objects`,
    );
  },
  end: () => {
    hud.actionMenu.menus.detach();
    hud.dialogue.detach();
    hud.el.classList.add("is-hidden");
    banner.classList.add("is-hidden");
    controller = null;
    onBattleEnd = null;
    currentEncounter = null;
  },
};

// --- between-battle layer ---------------------------------------------------

const screens: BetweenBattleScreens = new BetweenBattleScreens(session, {
  beginDeployment: () => void runner.beginDeployment(),
  confirmDeployment: () => void runner.confirmDeployment(),
  replayEncounter: (encounterId) => void runner.replayEncounter(encounterId),
  save: () => {
    saveCampaign(session.state);
    screens.notify("Chapter saved.");
  },
  load: () => {
    const loaded = loadCampaign();
    if (!loaded.ok) {
      screens.notify(loaded.reason);
      return;
    }
    session.replaceState(loaded.campaign);
    runner.openRoster();
  },
});

const runner = new CampaignRunner({ session, battle: battlePort, screens });

bannerContinue.addEventListener("click", () => {
  const final = controller?.state;
  const finish = onBattleEnd;
  if (final === undefined || finish === null) return;
  onBattleEnd = null;
  finish(final);
});

overlayHost.classList.add("gf-root", "is-overlay");
overlayHost.append(hud.el, banner, screens.el);
hud.el.classList.add("is-hidden");
screens.attach(document);

attachControls(renderer, canvas, { panKeysEnabled: () => !(controller?.menuOpen ?? false) });
renderer.start();

const tileLabel = (tile: TileCoord | null): string => (tile ? `${tile.x},${tile.y}` : "—");

let toastClock = 0;
renderer.addFrameHook((delta) => {
  controller?.tick(delta);
  hud.dialogue.tick(delta * 1000);
  toastClock += delta;
  if (toastClock >= 1) {
    toastClock = 0;
    screens.tick();
  }
  if (controller !== null && controller.phase !== "ended") {
    setStatus(`${controller.phase} · cursor ${tileLabel(renderer.hoveredTile)}`);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "x") controller?.skipPresentation();
});

runner.start();

/**
 * Debug seam. Agents and humans drive the running chapter from the devtools
 * console (and over CDP) through this handle; nothing in the app reads it.
 */
declare global {
  interface Window {
    greyfall?: {
      renderer: BattleRenderer;
      hud: BattleHud;
      session: CampaignSession;
      runner: CampaignRunner;
      controller: () => BattleController | null;
    };
  }
}
window.greyfall = {
  renderer,
  hud,
  session,
  runner,
  controller: () => controller,
};
