// THE UX PROBE — dev builds only.
//
// `window.__greyfall.describe()` serializes what is on screen: the panels as
// text, the menus as rows with their cursor and their inert state, and the battle
// exactly as the HUD was drawn — the same `BattleHudView` the panels rendered
// from, plus the overlay layers the controller is painting. Nothing here derives
// a second opinion about the game; a probe that computed its own answer could
// agree with itself while the interface said something else.
//
// `window.__greyfall.act(verb, target)` is semantic input: a menu row by label, a
// tile by coordinate, a key by name. Rows are activated by dispatching a real
// click on the row the player would click, so the probe travels the same code
// path and cannot pass where a player would be stuck.
//
// Everything fails loudly. A target that is not on screen throws with what WAS on
// screen, because a probe that quietly no-ops recreates the silent-failure class
// of bug it exists to catch.

import type { TileCoord } from "../data/index.js";
import type { BattleHudView, HudMode, LogEntryView } from "../ui/index.js";
import type { BattleController, ControllerPhase } from "./controller.js";

/** How many log entries `describe()` carries by default. */
const DEFAULT_LOG_TAIL = 20;

export interface ProbeHost {
  /** Where the probe looks for rendered panels. Defaults to `document`. */
  root?: Document | HTMLElement;
  /** The battle loop, when one is running. */
  controller?: () => BattleController | null;
  /** Which screen owns the frame; the host knows better than the DOM does. */
  screen?: () => string;
}

export interface ProbeMenuEntryView {
  id: string;
  label: string;
  detail: string | null;
  note: string | null;
  disabled: boolean;
  disabledReason: string | null;
  /** The cursor is on this row. */
  selected: boolean;
  /** The row is under an open submenu and takes no input. */
  inert: boolean;
}

export interface ProbeMenuView {
  id: string;
  title: string | null;
  /** This is the menu taking input. */
  active: boolean;
  /** Index of the selected row, or -1. */
  cursor: number;
  entries: ProbeMenuEntryView[];
}

export interface ProbePanelView {
  label: string;
  lines: string[];
}

export interface ProbeBattleView {
  phase: ControllerPhase;
  /** Tiles each overlay layer is painting, by layer id. */
  highlights: { layer: string; tiles: TileCoord[] }[];
  /** The frame the panels were drawn from, with the log trimmed to its tail. */
  view: BattleHudView;
}

export interface ProbeSnapshot {
  screen: string;
  mode: HudMode | null;
  menus: ProbeMenuView[];
  /** The notice in the slot, then its scrollback, newest first. */
  notices: string[];
  dialogue: { speaker: string; text: string }[];
  panels: ProbePanelView[];
  /** Every label `act("click", …)` would accept right now. */
  clickable: string[];
  battle: ProbeBattleView | null;
}

export type ProbeVerb = "click" | "hover" | "key";

export interface GreyfallProbe {
  describe(options?: { log?: number }): ProbeSnapshot;
  act(verb: ProbeVerb, target: string | TileCoord): void;
  /** The battle's record, newest entries last. */
  log(count?: number): readonly LogEntryView[];
  /** What is clickable by name right now. */
  labels(): string[];
}

declare global {
  interface Window {
    __greyfall?: GreyfallProbe;
  }
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const isTile = (target: unknown): target is TileCoord =>
  typeof target === "object" &&
  target !== null &&
  typeof (target as TileCoord).x === "number" &&
  typeof (target as TileCoord).y === "number";

/** On screen: not inside anything hidden, and not display:none itself. */
function visible(node: Element): boolean {
  let current: Element | null = node;
  while (current !== null) {
    if (current.classList.contains("is-hidden")) return false;
    if (current.hasAttribute("hidden")) return false;
    const style = (current as HTMLElement).style;
    if (style !== undefined && style.display === "none") return false;
    current = current.parentElement;
  }
  return true;
}

const trimmed = (node: Element | null): string | null => {
  if (node === null) return null;
  const text = (node.textContent ?? "").trim();
  return text === "" ? null : text;
};

/**
 * The element's text as the lines a reader would see. `textContent` runs a whole
 * panel into one word-jammed string, which is useless for diffing against a
 * view model, so each leaf's text is kept as its own line.
 */
function textLines(node: Element): string[] {
  const out: string[] = [];
  const visit = (element: Element): void => {
    if (!visible(element)) return;
    if (element.children.length === 0) {
      const text = trimmed(element);
      if (text !== null) out.push(text);
      return;
    }
    for (const child of element.childNodes) {
      if (child.nodeType === TEXT_NODE) {
        const text = (child.textContent ?? "").trim();
        if (text !== "") out.push(text);
        continue;
      }
      if (child.nodeType === ELEMENT_NODE) visit(child as Element);
    }
  };
  visit(node);
  return out;
}

/** One thing on screen the player could click, by the name they would read. */
interface Clickable {
  node: HTMLElement;
  label: string;
  id: string | null;
  disabled: boolean;
  disabledReason: string | null;
  /** In the menu currently taking input. */
  active: boolean;
}

function clickables(root: Document | HTMLElement): Clickable[] {
  const out: Clickable[] = [];
  for (const node of root.querySelectorAll(".gf-menu-entry")) {
    if (!(node instanceof HTMLElement) || !visible(node)) continue;
    const label = trimmed(node.querySelector(".gf-menu-label"));
    if (label === null) continue;
    out.push({
      node,
      label,
      id: node.dataset["entry"] ?? null,
      disabled: node.classList.contains("is-disabled"),
      disabledReason: trimmed(node.querySelector(".gf-menu-reason")) ?? node.title ?? null,
      active: node.closest(".gf-menu")?.classList.contains("is-active") === true,
    });
  }
  for (const node of root.querySelectorAll("button")) {
    if (!(node instanceof HTMLButtonElement) || !visible(node)) continue;
    const label = trimmed(node);
    if (label === null) continue;
    out.push({
      node,
      label,
      id: null,
      disabled: node.disabled,
      disabledReason: null,
      active: true,
    });
  }
  return out;
}

function menuViews(root: Document | HTMLElement): ProbeMenuView[] {
  const out: ProbeMenuView[] = [];
  for (const menu of root.querySelectorAll(".gf-menu")) {
    if (!(menu instanceof HTMLElement) || !visible(menu)) continue;
    const entries: ProbeMenuEntryView[] = [];
    for (const row of menu.querySelectorAll(".gf-menu-entry")) {
      if (!(row instanceof HTMLElement)) continue;
      entries.push({
        id: row.dataset["entry"] ?? "",
        label: trimmed(row.querySelector(".gf-menu-label")) ?? "",
        detail: trimmed(row.querySelector(".gf-menu-detail")),
        note: trimmed(row.querySelector(".gf-menu-note")),
        disabled: row.classList.contains("is-disabled"),
        disabledReason: trimmed(row.querySelector(".gf-menu-reason")) ?? null,
        selected: row.classList.contains("is-selected"),
        inert: row.classList.contains("is-inert"),
      });
    }
    out.push({
      id: menu.dataset["menu"] ?? "",
      title: trimmed(menu.querySelector(".gf-menu-title")),
      active: menu.classList.contains("is-active"),
      cursor: entries.findIndex((entry) => entry.selected),
      entries,
    });
  }
  return out;
}

function panelViews(root: Document | HTMLElement): ProbePanelView[] {
  const out: ProbePanelView[] = [];
  for (const panel of root.querySelectorAll("section.gf-panel")) {
    if (!(panel instanceof HTMLElement) || !visible(panel)) continue;
    const label =
      panel.getAttribute("aria-label") ?? trimmed(panel.querySelector(".gf-plate-title")) ?? panel.className;
    out.push({ label, lines: textLines(panel) });
  }
  return out;
}

function noticeViews(root: Document | HTMLElement): string[] {
  const out: string[] = [];
  const live = root.querySelector(".gf-notice.is-shown");
  const first = live === null ? null : trimmed(live);
  if (first !== null) out.push(first);
  for (const line of root.querySelectorAll(".gf-notice-log .gf-notice-line")) {
    const text = trimmed(line);
    if (text !== null) out.push(text);
  }
  return out;
}

function dialogueViews(root: Document | HTMLElement): { speaker: string; text: string }[] {
  const box = root.querySelector(".gf-dialogue");
  if (box === null || !visible(box)) return [];
  return [
    {
      speaker: trimmed(box.querySelector(".gf-dialogue-speaker")) ?? "",
      text: trimmed(box.querySelector(".gf-dialogue-text")) ?? "",
    },
  ];
}

/** Which screen owns the frame, when the host has not said. */
function inferScreen(root: Document | HTMLElement): string {
  const banner = root.querySelector(".gf-end-banner");
  if (banner !== null && visible(banner)) return "battle-result";
  const hud = root.querySelector(".gf-battle-hud");
  if (hud !== null && visible(hud)) return "battle";
  const between = root.querySelector(".gf-between");
  if (between !== null && visible(between)) return "between-battles";
  const register = root.querySelector(".gf-campaign-boot");
  if (register !== null && visible(register)) return "register";
  return "unknown";
}

function hudMode(root: Document | HTMLElement): HudMode | null {
  const hud = root.querySelector(".gf-battle-hud");
  if (!(hud instanceof HTMLElement)) return null;
  const mode = hud.dataset["mode"];
  return mode === undefined ? null : (mode as HudMode);
}

/** The probe, built over one host. Exported so a test can drive it directly. */
export function createProbe(host: ProbeHost): GreyfallProbe {
  const rootOf = (): Document | HTMLElement => host.root ?? document;
  const docOf = (): Document => {
    const root = rootOf();
    return root instanceof Document ? root : (root.ownerDocument ?? document);
  };
  const controllerOf = (): BattleController | null => host.controller?.() ?? null;

  const battleView = (logTail: number): ProbeBattleView | null => {
    const controller = controllerOf();
    if (controller === null) return null;
    const view = controller.lastView;
    if (view === null) return null;
    const log = view.log ?? [];
    return {
      phase: controller.phase,
      highlights: [...controller.highlights.entries()].map(([layer, tiles]) => ({
        layer,
        tiles: tiles.map((tile) => ({ ...tile })),
      })),
      view: { ...view, log: log.slice(Math.max(0, log.length - logTail)) },
    };
  };

  const describe = (options: { log?: number } = {}): ProbeSnapshot => {
    const root = rootOf();
    return {
      screen: host.screen?.() ?? inferScreen(root),
      mode: hudMode(root),
      menus: menuViews(root),
      notices: noticeViews(root),
      dialogue: dialogueViews(root),
      panels: panelViews(root),
      clickable: clickables(root).map((entry) => entry.label),
      battle: battleView(options.log ?? DEFAULT_LOG_TAIL),
    };
  };

  const actOnTile = (verb: ProbeVerb, tile: TileCoord): void => {
    const controller = controllerOf();
    if (controller === null) {
      throw new Error(`greyfall probe: act("${verb}", tile) needs a battle on the field; none is running`);
    }
    const field = controller.lastView?.field;
    if (field !== undefined) {
      const inside = tile.x >= 0 && tile.y >= 0 && tile.x < field.width && tile.y < field.depth;
      if (!inside) {
        throw new Error(
          `greyfall probe: tile (${tile.x}, ${tile.y}) is off the board (${field.width} x ${field.depth})`,
        );
      }
    }
    const at: TileCoord = { x: tile.x, y: tile.y };
    if (verb === "hover") controller.onTileHover(at);
    else controller.onTileClick(at);
  };

  const actOnLabel = (verb: ProbeVerb, label: string): void => {
    const wanted = label.trim().toLowerCase();
    const found = clickables(rootOf());
    const matches = found.filter(
      (entry) => entry.label.toLowerCase() === wanted || entry.id?.toLowerCase() === wanted,
    );
    const target = matches.find((entry) => entry.active) ?? matches[0];
    if (target === undefined) {
      const seen = found.map((entry) => entry.label);
      throw new Error(
        `greyfall probe: nothing labelled "${label}" is on screen. Visible: ${
          seen.length === 0 ? "(nothing clickable)" : seen.join(" | ")
        }`,
      );
    }
    if (target.disabled) {
      const why = target.disabledReason === null ? "" : ` — ${target.disabledReason}`;
      throw new Error(`greyfall probe: "${target.label}" is on screen but greyed out${why}`);
    }
    // Hovering moves the cursor (a non-bubbling mouseenter, as the menu binds it);
    // clicking is the real click the player would land on that row.
    if (verb === "hover") target.node.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    else target.node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };

  const act = (verb: ProbeVerb, target: string | TileCoord): void => {
    if (verb !== "click" && verb !== "hover" && verb !== "key") {
      throw new Error(`greyfall probe: unknown verb "${String(verb)}"; use click, hover or key`);
    }
    if (verb === "key") {
      if (typeof target !== "string") {
        throw new Error('greyfall probe: act("key", …) takes a key name, not a tile');
      }
      docOf().dispatchEvent(new KeyboardEvent("keydown", { key: target, bubbles: true, cancelable: true }));
      return;
    }
    if (isTile(target)) {
      actOnTile(verb, target);
      return;
    }
    if (typeof target !== "string") {
      throw new Error(`greyfall probe: act("${verb}", …) takes a label or a tile`);
    }
    actOnLabel(verb, target);
  };

  return {
    describe,
    act,
    log: (count = DEFAULT_LOG_TAIL) => {
      const entries = controllerOf()?.log ?? [];
      return count <= 0 ? [] : entries.slice(Math.max(0, entries.length - count));
    },
    labels: () => clickables(rootOf()).map((entry) => entry.label),
  };
}

/**
 * File the probe on `window.__greyfall`. Callers gate this on
 * `import.meta.env.DEV`: the handle is a test seam, not a feature, and it must
 * not exist in a build.
 */
export function installProbe(host: ProbeHost): GreyfallProbe {
  const probe = createProbe(host);
  if (typeof window !== "undefined") window.__greyfall = probe;
  return probe;
}
