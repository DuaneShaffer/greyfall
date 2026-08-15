import { Component, el } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import type { BattleHudView } from "../state.js";
import { ActionMenu } from "./actionMenu.js";
import { DialogueBox } from "./dialogue.js";
import { ForecastPanel } from "./forecast.js";
import { TurnOrderStrip } from "./turnOrder.js";
import { UnitStatusPanel } from "./unitStatus.js";

/** The battle overlay: status, action menu, forecast, turn order, dialogue. */
export class BattleHud implements Component<BattleHudView> {
  readonly el: HTMLElement;
  readonly actionMenu: ActionMenu;
  readonly forecast: ForecastPanel;
  readonly status: UnitStatusPanel;
  readonly turnOrder: TurnOrderStrip;
  readonly dialogue: DialogueBox;

  constructor(options: { intents?: Partial<UiIntents>; onAbilityPreview?: (abilityId: string | null) => void } = {}) {
    const intents = withIntents(options.intents);
    this.actionMenu = new ActionMenu({
      intents,
      ...(options.onAbilityPreview ? { onAbilityPreview: options.onAbilityPreview } : {}),
    });
    this.forecast = new ForecastPanel({ intents });
    this.status = new UnitStatusPanel();
    this.turnOrder = new TurnOrderStrip({ intents });
    this.dialogue = new DialogueBox({ intents });
    this.el = el("div", {
      class: "gf-battle-hud",
      children: [
        this.status.el,
        this.actionMenu.el,
        this.forecast.el,
        this.turnOrder.el,
        this.dialogue.el,
      ],
    });
  }

  update(view: BattleHudView): void {
    this.actionMenu.update(view.action);
    this.status.update(view.inspected);
    this.turnOrder.update(view.turnOrder);
    this.forecast.update(view.forecast);
    this.dialogue.update(view.dialogue);
  }

  /** Dialogue takes keys while it is open; the menus take them otherwise. */
  attach(target: EventTarget = document): void {
    this.actionMenu.attach(target);
  }

  destroy(): void {
    this.actionMenu.destroy();
    this.forecast.destroy();
    this.status.destroy();
    this.turnOrder.destroy();
    this.dialogue.destroy();
    this.el.remove();
  }
}
