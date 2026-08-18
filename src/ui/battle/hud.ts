import type { Facing } from "../../data/index.js";
import { Component, el } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import type { BattleHudView, HudMode } from "../state.js";
import { ActionMenu, type CameraYawIndex } from "./actionMenu.js";
import { BRIEFING_ID, NO_OBJECTIVE, briefingMenu } from "./battleMenu.js";
import { DialogueBox } from "./dialogue.js";
import { ForecastPanel } from "./forecast.js";
import { LogPanel } from "./logPanel.js";
import { ModeBar } from "./modeBar.js";
import { NoticeStrip, type NoticeTone } from "./notice.js";
import { PowerLedger } from "./powerLedger.js";
import { TurnOrderStrip } from "./turnOrder.js";
import { UnitStatusPanel } from "./unitStatus.js";

/** Modes in which the orders are the player's to give. */
const PLAYER_MODES = new Set<HudMode>(["orders", "move", "target", "facing"]);

/**
 * What one back-out actually did. The canvas asks for a withdraw on every
 * right-click and has no idea what is open, so the answer has to come back.
 */
export type WithdrawOutcome = "menu" | "unstaged" | "root" | "none";

/**
 * The battle overlay.
 *
 * Layout is the hierarchy (see docs/UI_DESIGN.md): the acting unit and its
 * orders are one object in the bottom-left and carry the live weight; the
 * forecast answers them from the bottom-right; the queue and the inspect card
 * are reference material and are styled down; the mode bar underneath always
 * says what the game is waiting for.
 */
export class BattleHud implements Component<BattleHudView> {
  readonly el: HTMLElement;
  readonly actionMenu: ActionMenu;
  readonly forecast: ForecastPanel;
  /** The hovered unit; quiet by design. */
  readonly status: UnitStatusPanel;
  /** The unit whose turn it is, joined to the order menu. */
  readonly acting: UnitStatusPanel;
  readonly turnOrder: TurnOrderStrip;
  /** Which machines are live; empty and hidden on maps that switch nothing. */
  readonly power: PowerLedger;
  /** The battle's record: what actually happened, after the numbers fade. */
  readonly log: LogPanel;
  readonly dialogue: DialogueBox;
  readonly mode: ModeBar;
  readonly notice: NoticeStrip;
  private readonly intents: UiIntents;
  /** Where the forfeit goes. The battle seam has no verb for it of its own. */
  private readonly onForfeit: () => void;
  /** The encounter's line, for the chip and the briefing's own page. */
  private objective: string | null = null;
  private readonly objectiveEl: HTMLElement;
  /** Who the orders belong to, for the withdraw affordance. */
  private actingUnitId: string | null = null;
  /** An order is staged and unsent: the forecast is answering something. */
  private staged = false;

  constructor(
    options: {
      intents?: Partial<UiIntents>;
      onAbilityPreview?: (abilityId: string | null) => void;
      /** The camera's bearing, from the mode bar's own buttons. */
      onOrbit?: (direction: 1 | -1) => void;
      /**
       * The player gave up the field. Nothing in the battle seam ends an
       * engagement by choice, so the app supplies the verb; without one the
       * briefing falls back to closing the screen.
       */
      onForfeit?: () => void;
    } = {},
  ) {
    const intents = withIntents(options.intents);
    this.intents = intents;
    this.onForfeit = options.onForfeit ?? ((): void => intents.closeScreen());
    this.actionMenu = new ActionMenu({
      intents,
      onRootCancel: () => void this.withdraw(),
      onRefuse: (reason) => this.notify(reason, "refusal"),
      onStaged: (label) => this.notify(`${label} staged — Commit sends it.`),
      ...(options.onAbilityPreview ? { onAbilityPreview: options.onAbilityPreview } : {}),
    });
    this.forecast = new ForecastPanel({
      intents: {
        ...intents,
        // The card's Withdraw is the same gesture as the mode bar's. On its own
        // it blanked the preview and left the row that staged it still armed.
        cancelSelection: () => void this.withdraw(),
      },
    });
    this.status = new UnitStatusPanel({ role: "inspect" });
    this.acting = new UnitStatusPanel({ role: "acting" });
    this.turnOrder = new TurnOrderStrip({ intents });
    this.power = new PowerLedger();
    this.log = new LogPanel();
    this.dialogue = new DialogueBox({ intents });
    this.mode = new ModeBar({
      onWithdraw: () => void this.withdraw(),
      onBriefing: () => this.openBriefing(),
      ...(options.onOrbit ? { onOrbit: options.onOrbit } : {}),
    });
    this.notice = new NoticeStrip();
    // What the engagement is for, kept where the reference material lives. Null
    // until an encounter says, and then it is not the interface's to invent.
    this.objectiveEl = el("p", {
      class: "gf-objective-chip is-hidden",
      attrs: { "aria-label": "Objective" },
    });
    this.el = el("div", {
      class: "gf-battle-hud",
      children: [
        this.status.el,
        this.notice.el,
        this.log.el,
        el("div", { class: "gf-order", children: [this.acting.el, this.actionMenu.el] }),
        this.forecast.el,
        el("div", {
          class: "gf-clock",
          children: [this.objectiveEl, this.turnOrder.el, this.power.el],
        }),
        this.dialogue.el,
        this.mode.el,
      ],
    });
  }

  /**
   * The one way back out, wherever it is asked from: the mode bar's button,
   * Escape, the forecast card's Withdraw, and the canvas right-click. It is
   * correct at every depth *including the root*, and a no-op only when the
   * orders are not the player's to give — never a silent no-op inside a turn.
   *
   *   "menu"     — an open submenu popped one level and reported its own cancel.
   *   "unstaged" — a staged move, aim or facing was withdrawn; the field cursor
   *                is the player's again and nothing is left armed.
   *   "root"     — nothing was staged, so the root answered for itself.
   *   "none"     — not a mode the player entered; nothing to leave.
   */
  withdraw(): WithdrawOutcome {
    if (!PLAYER_MODES.has(this.mode.current)) return "none";
    // Nothing has been drawn yet, so there is nothing to leave — and a briefing
    // pushed here would become the root the orders never get back.
    if (this.actionMenu.menus.depth === 0) return "none";
    if (this.actionMenu.menus.depth > 1) {
      this.actionMenu.menus.cancel();
      return "menu";
    }
    if (this.hasStaged || this.mode.current !== "orders") {
      if (this.actingUnitId !== null) this.intents.cancelSelection(this.actingUnitId);
      // A committed order keeps its numbers (the panel refuses this while
      // locked); an uncommitted one leaves nothing behind.
      this.forecast.update(null);
      this.staged = false;
      return "unstaged";
    }
    this.rootWithdraw();
    return "root";
  }

  /**
   * Nothing is staged and the orders stand, so the gesture opens the briefing:
   * a root that answered Escape with silence is the finding this replaces.
   */
  private rootWithdraw(): void {
    this.openBriefing();
  }

  /** The briefing, from Escape at the root or from the mode bar's own entry. */
  openBriefing(): void {
    if (this.actionMenu.menus.depth === 0) return;
    if (this.actionMenu.menus.path.includes(BRIEFING_ID)) return;
    this.actionMenu.menus.push(
      briefingMenu(this.actionMenu.menus, {
        objective: () => this.objective,
        onForfeit: () => this.forfeit(),
      }),
    );
  }

  private forfeit(): void {
    while (this.actionMenu.menus.depth > 1) this.actionMenu.menus.pop();
    this.notify("The field is given up.", "refusal");
    this.onForfeit();
  }

  /** An unsent order the forecast is answering. A committed one is a record. */
  private get hasStaged(): boolean {
    return this.staged && !this.forecast.isLocked;
  }

  /** Everything but the dialogue, whose reveal must not restart on a redraw. */
  render(view: BattleHudView): void {
    this.actingUnitId = view.action.unit.id;
    this.setObjective(view.objective ?? null);
    this.actionMenu.update(view.action);
    this.acting.update(view.action.unit);
    // The acting unit already has a panel; repeating it as "inspecting" is
    // noise, so the inspect card only appears for somebody else.
    this.status.update(
      view.inspected === null || view.inspected.id === view.action.unit.id ? null : view.inspected,
    );
    this.turnOrder.update(view.turnOrder, view.log ?? []);
    this.power.update(view.power);
    this.log.update(view.log ?? []);
    this.staged = view.forecast !== null;
    this.forecast.update(view.forecast);
    // A staged order is a new question, and the notices from the last one must
    // not be sitting beside the answer to this one.
    this.notice.enterContext(
      "order",
      view.forecast?.armed === true ? view.forecast.abilityId : "",
    );
  }

  update(view: BattleHudView): void {
    this.render(view);
    this.dialogue.update(view.dialogue);
  }

  /** The encounter's line. Absent is a fact about the encounter, not a blank. */
  private setObjective(objective: string | null): void {
    this.objective = objective;
    this.objectiveEl.textContent = objective ?? NO_OBJECTIVE;
    this.objectiveEl.classList.toggle("is-hidden", objective === null);
  }

  setMode(mode: HudMode, detail?: string | null): void {
    // Every turn change and every selection change comes through here, which
    // makes this the one place that knows the moment a notice belonged to is over.
    this.notice.enterContext("mode", `${mode}|${detail ?? ""}`);
    this.mode.update(mode, detail);
    this.el.dataset["mode"] = mode;
    const playersTurn = PLAYER_MODES.has(mode);
    // Only the panel the mode is about wears the live weight, and the orders
    // stand down exactly when they are not the player's to give.
    this.acting.el.classList.toggle("is-live", playersTurn);
    this.actionMenu.el.classList.toggle("is-busy", !playersTurn);
  }

  notify(message: string, tone: NoticeTone = "info"): void {
    this.notice.show(message, tone);
  }

  /**
   * Which way the rig is looking, in orbit steps. Only the compass rose reads
   * it, and only so that "north" is drawn where north actually is.
   */
  setCameraYaw(index: CameraYawIndex): void {
    this.actionMenu.setCameraYaw(index);
  }

  /** Ask which way the unit's turn closes. */
  promptFacing(current: Facing, onPick: (facing: Facing) => void, onCancel: () => void): void {
    this.actionMenu.promptFacing(current, onPick, onCancel);
  }

  closePrompt(): void {
    this.actionMenu.closePrompt();
  }

  /** Frame pump: the dialogue reveal and the notice both need it. */
  tick(deltaMs: number): void {
    this.dialogue.tick(deltaMs);
    // Opening or closing a submenu is a new context too, and the menus report to
    // nobody when they do it. Read before the notices age: a line raised this
    // frame has not been read yet, whatever the player did to it.
    this.notice.enterContext("menu", this.actionMenu.menus.path.join("/"));
    this.notice.tick(deltaMs);
  }

  /** Dialogue takes keys while it is open; the menus take them otherwise. */
  attach(target: EventTarget = document): void {
    this.actionMenu.attach(target);
  }

  destroy(): void {
    this.actionMenu.destroy();
    this.forecast.destroy();
    this.status.destroy();
    this.acting.destroy();
    this.turnOrder.destroy();
    this.power.destroy();
    this.log.destroy();
    this.dialogue.destroy();
    this.mode.destroy();
    this.notice.destroy();
    this.el.remove();
  }
}
