import type { Facing } from "../../data/index.js";
import { Component, el, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuEntry, MenuStack } from "../menu.js";
import type { ActionMenuView, MechanicsView, SkillsetView } from "../state.js";

export interface ActionMenuOptions {
  intents?: Partial<UiIntents>;
  /** Cursor moved onto an ability — the caller shows a forecast preview. */
  onAbilityPreview?: (abilityId: string | null) => void;
  /**
   * Escape / right-click at the root. The root is not the place to decide what
   * backing out means: the HUD owns the whole unwind (`BattleHud.withdraw`), and
   * without this the root swallowed the gesture and said nothing.
   */
  onRootCancel?: () => void;
  /** A row refused input, with the reason; the HUD prints it. */
  onRefuse?: (reason: string) => void;
  /** An order is staged for the forecast to answer. Nothing has been sent. */
  onStaged?: (label: string) => void;
}

const ROOT_ID = "action-root";
export const FACING_MENU_ID = "action-facing";
const SKILLSETS_ID = "action-skillsets";
const OPERABLES_ID = "action-operables";
const ITEMS_ID = "action-items";
const UNDO_ID = "undo-move";

/** Why the player is being asked at all — the rule the pick is worth anything for. */
export const FACING_NOTE = "Attacks from the side and behind land harder.";

/** Staging is not sending, and the row has to say which one it just did. */
export const OPERATE_NOTE = "Forecast only — the stamp sends it.";

const FACING_LABELS: Record<Facing, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

const FACING_ORDER: readonly Facing[] = ["north", "east", "south", "west"];

/**
 * The rig's bearing in orbit steps, as `cameraYawIndex` (src/render/units.ts)
 * reports it: 0 puts the camera over the board's south-east corner. The compass
 * rose is placed off this — a rose that does not turn with the camera points
 * three of its four arms at the wrong part of the board.
 */
export type CameraYawIndex = 0 | 1 | 2 | 3;

/**
 * The seam joins the mechanics line with " · " (src/app/mechanics.ts). A row
 * that already prints the charge in its own right-hand column does not print it
 * again in the line underneath.
 */
export function rowMechanics(mechanics: MechanicsView): string {
  return mechanics.summary
    .split(" · ")
    .filter((part) => !/^Charge \d+$/.test(part) && !/^\d+ in stock$/.test(part))
    .join(" · ");
}

/**
 * Move / Act / Item / Wait, with Act opening the unit's skillsets, and a row for
 * taking the walk back for as long as the rules hold it open.
 */
export class ActionMenu implements Component<ActionMenuView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly options: ActionMenuOptions;
  /** The focused row, at length: what a compact row could not hold. */
  private readonly detailEl: HTMLElement;
  private view: ActionMenuView | null = null;

  constructor(options: ActionMenuOptions = {}) {
    this.options = options;
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack({ onRefuse: (reason) => this.options.onRefuse?.(reason) });
    this.detailEl = el("div", { class: "gf-action-detail is-empty" });
    this.el = el("div", {
      class: "gf-action-menu",
      data: { yaw: "0" },
      children: [this.menus.el, this.detailEl],
    });
  }

  /** Which way the rig is looking; the compass rose is placed off it. */
  setCameraYaw(index: CameraYawIndex): void {
    this.el.dataset["yaw"] = String(index);
  }

  /**
   * Ask which way the unit's turn closes. A rose rather than a list of four
   * words: facing is a direction on the board, and the board is on screen.
   */
  promptFacing(current: Facing, onPick: (facing: Facing) => void, onCancel: () => void): void {
    this.menus.push({
      id: FACING_MENU_ID,
      title: "Face",
      entries: FACING_ORDER.map((facing) => ({
        id: facing,
        label: FACING_LABELS[facing],
        ...(facing === current ? { detail: "current" } : {}),
      })),
      onCursor: () => this.setDetail(FACING_NOTE),
      onSelect: (entry) => {
        const facing = FACING_ORDER.find((option) => option === entry.id);
        if (facing !== undefined) onPick(facing);
      },
      onCancel: () => {
        this.setDetail(null);
        onCancel();
      },
    });
  }

  /** Take the facing prompt back down, however the turn was closed. */
  closePrompt(): void {
    if (!this.menus.path.includes(FACING_MENU_ID)) return;
    this.menus.pop();
    this.setDetail(null);
  }

  update(view: ActionMenuView): void {
    this.view = view;
    const root = this.rootMenu(view);
    if (this.menus.depth === 0) this.menus.push(root);
    else this.menus.refresh(root);
    // The root's rows are orders, not mechanics; nothing under them to read.
    if (this.menus.depth === 1) this.setDetail(null);
  }

  /** The focused row's fuller reading: prose first, then the figures. */
  private setDetail(note: string | null, mechanics?: MechanicsView): void {
    const summary = mechanics === undefined ? null : mechanics.summary;
    this.detailEl.classList.toggle("is-empty", note === null && summary === null);
    replaceChildren(this.detailEl, [
      note === null ? null : el("p", { class: "gf-action-detail-note", text: note }),
      summary === null ? null : el("p", { class: "gf-action-detail-line", text: summary }),
    ]);
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
      // Directly under the order it answers, and only while the rules would
      // take it: an order that is not offered needs no greyed row explaining
      // itself (UI_DESIGN §8).
      ...(view.canUndoMove === true
        ? [{ id: UNDO_ID, label: "Undo move", note: "Take the step back" }]
        : []),
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
      onCancel: () => this.options.onRootCancel?.(),
    };
  }

  private onRootSelect(entry: MenuEntry): void {
    const view = this.view;
    if (!view) return;
    if (entry.id === "move") {
      this.intents.beginMove(view.unit.id);
      return;
    }
    if (entry.id === UNDO_ID) {
      this.intents.undoMove(view.unit.id);
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
        // What it does beats what it is called: the prose is a line away, on the
        // focused row's detail line, and used to be the only thing here.
        note: item.mechanics === undefined ? item.description : rowMechanics(item.mechanics),
        disabled: item.unavailableReason !== undefined,
        ...(item.unavailableReason === undefined ? {} : { disabledReason: item.unavailableReason }),
      })),
      onCursor: (entry) => {
        const item = items.find((candidate) => candidate.itemId === entry.id);
        this.setDetail(item?.description ?? null, item?.mechanics);
      },
      onSelect: (entry) => this.intents.selectItem(view.unit.id, entry.id),
      onCancel: () => {
        this.setDetail(null);
        this.intents.cancelSelection(view.unit.id);
      },
    };
  }

  private operableMenu(view: ActionMenuView): MenuDef {
    const operables = view.operables ?? [];
    return {
      id: OPERABLES_ID,
      title: "Operate",
      entries: operables.map((operable) => ({ id: operable.objectId, label: operable.name })),
      onCursor: (entry) => {
        this.setDetail(OPERATE_NOTE);
        this.intents.previewOperable(view.unit.id, entry.id);
      },
      // One commit model. The row *stages* the order exactly as resting on it
      // does, and the forecast's stamp is the only thing that sends it — the
      // playtest saw this order forecast once and fire instantly the next time.
      // Re-selecting a row re-stages it, which is the way back from a Withdraw
      // that blanked the preview and left the row still armed.
      onSelect: (entry) => {
        this.intents.previewOperable(view.unit.id, entry.id);
        this.options.onStaged?.(entry.label);
      },
      onCancel: () => {
        this.setDetail(null);
        this.intents.previewOperable(view.unit.id, null);
        this.intents.cancelSelection(view.unit.id);
      },
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
        // Reach, area, whose side and how hard, on the row that offers it. The
        // playtest could only get at any of it by spending the action first.
        ...(ability.mechanics !== undefined
          ? { note: rowMechanics(ability.mechanics) }
          : ability.castSpeed === null
            ? {}
            : { note: `Cast ${ability.castSpeed}` }),
        disabled: ability.unavailableReason !== undefined,
        ...(ability.unavailableReason === undefined ? {} : { disabledReason: ability.unavailableReason }),
      })),
      onCursor: (entry) => {
        const ability = set.abilities.find((candidate) => candidate.id === entry.id);
        this.setDetail(ability?.description ?? null, ability?.mechanics);
        this.options.onAbilityPreview?.(entry.id);
      },
      onSelect: (entry) => this.intents.selectAbility(view.unit.id, entry.id),
      onCancel: () => {
        this.setDetail(null);
        this.options.onAbilityPreview?.(null);
        this.intents.cancelSelection(view.unit.id);
      },
    };
  }
}
