import { Component, el } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import type { BattleHudView, HudMode } from "../state.js";
import { ActionMenu } from "./actionMenu.js";
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
  /** Who the orders belong to, for the withdraw affordance. */
  private actingUnitId: string | null = null;

  constructor(
    options: {
      intents?: Partial<UiIntents>;
      onAbilityPreview?: (abilityId: string | null) => void;
      /** The camera's bearing, from the mode bar's own buttons. */
      onOrbit?: (direction: 1 | -1) => void;
    } = {},
  ) {
    const intents = withIntents(options.intents);
    this.intents = intents;
    this.actionMenu = new ActionMenu({
      intents,
      ...(options.onAbilityPreview ? { onAbilityPreview: options.onAbilityPreview } : {}),
    });
    this.forecast = new ForecastPanel({ intents });
    this.status = new UnitStatusPanel({ role: "inspect" });
    this.acting = new UnitStatusPanel({ role: "acting" });
    this.turnOrder = new TurnOrderStrip({ intents });
    this.power = new PowerLedger();
    this.log = new LogPanel();
    this.dialogue = new DialogueBox({ intents });
    this.mode = new ModeBar({
      onWithdraw: () => this.withdraw(),
      ...(options.onOrbit ? { onOrbit: options.onOrbit } : {}),
    });
    this.notice = new NoticeStrip();
    this.el = el("div", {
      class: "gf-battle-hud",
      children: [
        this.status.el,
        this.notice.el,
        this.log.el,
        el("div", { class: "gf-order", children: [this.acting.el, this.actionMenu.el] }),
        this.forecast.el,
        el("div", { class: "gf-clock", children: [this.turnOrder.el, this.power.el] }),
        this.dialogue.el,
        this.mode.el,
      ],
    });
  }

  /**
   * Back out of whatever the player opened, from one button. A submenu pops
   * (and reports its own cancel); a bare targeting or move selection is
   * withdrawn outright.
   */
  withdraw(): void {
    if (this.actionMenu.menus.depth > 1) {
      this.actionMenu.menus.cancel();
      return;
    }
    if (this.actingUnitId !== null) this.intents.cancelSelection(this.actingUnitId);
  }

  /** Everything but the dialogue, whose reveal must not restart on a redraw. */
  render(view: BattleHudView): void {
    this.actingUnitId = view.action.unit.id;
    this.actionMenu.update(view.action);
    this.acting.update(view.action.unit);
    // The acting unit already has a panel; repeating it as "inspecting" is
    // noise, so the inspect card only appears for somebody else.
    this.status.update(
      view.inspected === null || view.inspected.id === view.action.unit.id ? null : view.inspected,
    );
    this.turnOrder.update(view.turnOrder);
    this.power.update(view.power);
    this.log.update(view.log ?? []);
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
