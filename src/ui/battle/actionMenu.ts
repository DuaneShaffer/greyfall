import { Component, el } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuEntry, MenuStack } from "../menu.js";
import type { ActionMenuView, SkillsetView } from "../state.js";

export interface ActionMenuOptions {
  intents?: Partial<UiIntents>;
  /** Cursor moved onto an ability — the caller shows a forecast preview. */
  onAbilityPreview?: (abilityId: string | null) => void;
}

const ROOT_ID = "action-root";
const SKILLSETS_ID = "action-skillsets";
const OPERABLES_ID = "action-operables";
const ITEMS_ID = "action-items";

/** Move / Act / Item / Wait, with Act opening the unit's skillsets. */
export class ActionMenu implements Component<ActionMenuView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly options: ActionMenuOptions;
  private view: ActionMenuView | null = null;

  constructor(options: ActionMenuOptions = {}) {
    this.options = options;
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.el = el("div", { class: "gf-action-menu", children: [this.menus.el] });
  }

  update(view: ActionMenuView): void {
    this.view = view;
    const root = this.rootMenu(view);
    if (this.menus.depth === 0) this.menus.push(root);
    else this.menus.refresh(root);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private rootMenu(view: ActionMenuView): MenuDef {
    const entries: MenuEntry[] = [
      {
        id: "move",
        label: "Move",
        disabled: !view.canMove,
        ...(view.canMove ? {} : { disabledReason: view.moveBlockedReason ?? "Move already spent" }),
      },
      {
        id: "act",
        label: "Act",
        disabled: !view.canAct,
        ...(view.canAct ? {} : { disabledReason: view.actBlockedReason ?? "Action already spent" }),
      },
    ];
    const items = view.items ?? [];
    if (items.length > 0) {
      const carried = items.reduce((total, item) => total + item.count, 0);
      entries.push({
        id: "item",
        label: "Item",
        detail: `${carried}`,
        disabled: !view.canAct,
        ...(view.canAct ? {} : { disabledReason: view.actBlockedReason ?? "Action already spent" }),
      });
    }
    const operables = view.operables ?? [];
    if (operables.length > 0) {
      const only = operables.length === 1 ? operables[0]?.name : undefined;
      entries.push({
        id: "operate",
        label: "Operate",
        detail: `${operables.length}`,
        ...(only === undefined ? {} : { note: only }),
      });
    }
    entries.push({ id: "wait", label: "Wait", note: "Ends the turn" });
    return {
      id: ROOT_ID,
      // The unit is named on the panel directly above; repeating it here is
      // noise. This menu answers "what may they do", not "who are they".
      title: "Orders",
      cancellable: false,
      entries,
      onSelect: (entry) => this.onRootSelect(entry),
    };
  }

  private onRootSelect(entry: MenuEntry): void {
    const view = this.view;
    if (!view) return;
    if (entry.id === "move") {
      this.intents.beginMove(view.unit.id);
      return;
    }
    if (entry.id === "wait") {
      this.intents.wait(view.unit.id, view.unit.facing);
      return;
    }
    if (entry.id === "item") {
      this.menus.push(this.itemMenu(view));
      return;
    }
    if (entry.id === "operate") {
      this.menus.push(this.operableMenu(view));
      return;
    }
    if (view.skillsets.length === 1) {
      const only = view.skillsets[0];
      if (only) this.menus.push(this.skillsetMenu(view, only));
      return;
    }
    this.menus.push(this.skillsetChooser(view));
  }

  /** The shared satchel. Counts are the force's, not this unit's. */
  private itemMenu(view: ActionMenuView): MenuDef {
    const items = view.items ?? [];
    return {
      id: ITEMS_ID,
      title: "Field Kit",
      entries: items.map((item) => ({
        id: item.itemId,
        label: item.name,
        detail: `x${item.count}`,
        note: item.description,
        disabled: item.unavailableReason !== undefined,
        ...(item.unavailableReason === undefined ? {} : { disabledReason: item.unavailableReason }),
      })),
      onSelect: (entry) => this.intents.selectItem(view.unit.id, entry.id),
      onCancel: () => this.intents.cancelSelection(view.unit.id),
    };
  }

  private operableMenu(view: ActionMenuView): MenuDef {
    const operables = view.operables ?? [];
    return {
      id: OPERABLES_ID,
      title: "Operate",
      entries: operables.map((operable) => ({ id: operable.objectId, label: operable.name })),
      onSelect: (entry) => this.intents.activateObject(view.unit.id, entry.id),
      onCancel: () => this.intents.cancelSelection(view.unit.id),
    };
  }

  private skillsetChooser(view: ActionMenuView): MenuDef {
    return {
      id: SKILLSETS_ID,
      title: "Act",
      entries: view.skillsets.map((set) => ({
        id: set.jobId,
        label: set.name,
        detail: `${set.abilities.length}`,
        disabled: set.abilities.length === 0,
        disabledReason: "No abilities learned",
      })),
      onSelect: (entry) => {
        const set = view.skillsets.find((s) => s.jobId === entry.id);
        if (set) this.menus.push(this.skillsetMenu(view, set));
      },
      onCancel: () => this.intents.cancelSelection(view.unit.id),
    };
  }

  private skillsetMenu(view: ActionMenuView, set: SkillsetView): MenuDef {
    return {
      id: `skillset-${set.jobId}`,
      title: set.name,
      entries: set.abilities.map((ability) => ({
        id: ability.id,
        label: ability.name,
        detail: `Charge ${ability.chargeCost}`,
        ...(ability.castSpeed === null ? {} : { note: `Cast ${ability.castSpeed}` }),
        disabled: ability.unavailableReason !== undefined,
        ...(ability.unavailableReason === undefined ? {} : { disabledReason: ability.unavailableReason }),
      })),
      onCursor: (entry) => this.options.onAbilityPreview?.(entry.id),
      onSelect: (entry) => this.intents.selectAbility(view.unit.id, entry.id),
      onCancel: () => {
        this.options.onAbilityPreview?.(null);
        this.intents.cancelSelection(view.unit.id);
      },
    };
  }
}
