// Browser entry: load content, open the Marshaling Yard with Rowen, mount the
// battle HUD over the 3D scene, and run the loop.
//
// This module is the only place Three.js, the DOM, and the core all meet; the
// controller sees them through the two ports it defines.

import "../ui/styles.css";
import { createBattle, type BattleResult, type Deployment } from "../core/index.js";
import type { DialogueLine, Facing, TileCoord } from "../data/index.js";
import { BattleRenderer, attachControls, palette } from "../render/index.js";
import { BattleHud, el, type BattleHudView, type MenuDef } from "../ui/index.js";
import { CONTENT, OPENING_ENCOUNTER_ID, PARTY } from "./content.js";
import { BattleController, type RendererPort, type UiPort } from "./controller.js";
import { stubAiCommand } from "./stubAi.js";

const canvas = document.getElementById("battle-canvas");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#battle-canvas missing");
const overlayHost = document.getElementById("ui-root");
if (!(overlayHost instanceof HTMLElement)) throw new Error("#ui-root missing");
const status = document.getElementById("debug-status");

const encounter = CONTENT.encounters[OPENING_ENCOUNTER_ID];
if (encounter === undefined) throw new Error(`missing encounter ${OPENING_ENCOUNTER_ID}`);
const map = CONTENT.maps[encounter.mapId];
if (map === undefined) throw new Error(`missing map ${encounter.mapId}`);

// TODO(deployment): the real formation screen picks the party and its tiles.
// Until it exists the party is auto-placed onto the first deployment tiles.
const deployment: Deployment[] = PARTY.slice(0, encounter.maxDeployedUnits).map((unit, index) => {
  const tile = map.deploymentTiles[index] ?? map.deploymentTiles[0];
  if (tile === undefined) throw new Error(`${map.id} has no deployment tiles`);
  return { unitId: unit.id, position: tile, facing: "north" };
});

const battle = createBattle(CONTENT, OPENING_ENCOUNTER_ID, PARTY, deployment);

const setStatus = (text: string): void => {
  if (status) status.textContent = text;
};

// --- renderer port ----------------------------------------------------------

const renderer = new BattleRenderer({
  canvas,
  onTileHover: (tile) => controller.onTileHover(tile),
  onTileSelect: (tile) => controller.onTileClick(tile),
});

const rendererPort: RendererPort = {
  buildScene: (view) => {
    renderer.buildScene(view);
    renderer.setHighlight("deployment", map.deploymentTiles, palette.highlightDeployment, {
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

// --- overlay chrome ---------------------------------------------------------

const bannerResult = el("p", { class: "gf-end-banner-result" });
const bannerNote = el("p", { class: "gf-end-banner-note" });
const banner = el("div", {
  class: "gf-end-banner is-hidden",
  attrs: { role: "status", id: "end-banner" },
  children: [el("div", { class: "gf-end-banner-plate", children: [bannerResult, bannerNote] })],
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
    bannerResult.textContent = result === "win" ? "Yard Held" : "Line Broken";
    bannerNote.textContent =
      result === "win" ? "The provocateurs are down." : "The watch detail is spent.";
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

// --- loop -------------------------------------------------------------------

const controller = new BattleController({
  state: battle.state,
  events: battle.events,
  renderer: rendererPort,
  ui: uiPort,
  ai: stubAiCommand,
});

const hud = new BattleHud({ intents: controller.intents });
overlayHost.classList.add("gf-root", "is-overlay");
overlayHost.append(hud.el, banner);
hud.attach(document);

attachControls(renderer, canvas, { panKeysEnabled: () => !controller.menuOpen });
renderer.start();

const tileLabel = (tile: TileCoord | null): string => (tile ? `${tile.x},${tile.y}` : "—");

renderer.addFrameHook((delta) => {
  controller.tick(delta);
  hud.dialogue.tick(delta * 1000);
  if (controller.phase !== "ended") {
    setStatus(`${controller.phase} · cursor ${tileLabel(renderer.hoveredTile)}`);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "x") controller.skipPresentation();
});

controller.start();

/**
 * Debug seam. Agents and humans drive the running battle from the devtools
 * console (and over CDP) through this handle; nothing in the app reads it.
 */
declare global {
  interface Window {
    greyfall?: {
      controller: BattleController;
      renderer: BattleRenderer;
      hud: BattleHud;
    };
  }
}
window.greyfall = { controller, renderer, hud };

console.info(
  `[greyfall] ${encounter.name}: ${map.width}x${map.depth} tiles, ${map.objects.length} objects`,
);
