import { Component, el, panel, plate, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuEntry, MenuStack } from "../menu.js";
import {
  EQUIP_SLOT_LABELS,
  EquipSlot,
  EquipmentView,
  ItemEntryView,
  ItemOptionView,
  StatLineView,
} from "../state.js";
import { equipTagList, formatStatDelta, formatStatShift } from "./vocabulary.js";

const SLOTS_ID = "equipment-slots";

/** Kit the unit could put in this slot right now — not merely kit that exists. */
function availableCount(view: EquipmentView, slot: EquipSlot): number {
  return (view.options[slot] ?? []).filter(
    (option) => option.unavailableReason === undefined && !option.equipped,
  ).length;
}

/** Slot list on the left, tag-filtered kit on the right, deltas in the panel. */
export class EquipmentScreen implements Component<EquipmentView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly detail: HTMLElement;
  private readonly headerEl: HTMLElement;
  private readonly tagsEl: HTMLElement;
  private readonly fieldKit: HTMLElement;
  private view: EquipmentView | null = null;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-equip-detail" });
    this.headerEl = el("p", { class: "gf-screen-note" });
    this.tagsEl = el("p", { class: "gf-screen-note gf-equip-tags" });
    this.fieldKit = el("div", { class: "gf-field-kit" });
    this.el = el("section", {
      class: "gf-screen gf-equipment",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [
                el("h1", { class: "gf-screen-title", text: "Equipment" }),
                this.headerEl,
                this.tagsEl,
              ],
            }),
          ],
        }),
        el("div", {
          class: "gf-screen-cols",
          children: [
            el("div", { class: "gf-screen-col", children: [this.menus.el, this.fieldKit] }),
            this.detail,
          ],
        }),
      ],
    });
  }

  update(view: EquipmentView): void {
    this.view = view;
    this.headerEl.textContent = `${view.unitName} · ${view.jobName}`;
    this.tagsEl.textContent = `Can carry: ${equipTagList(view.jobEquipTags)}`;
    // The kit is a stock list beside the slots now; naming it in the header too
    // was the same list twice.
    replaceChildren(this.fieldKit, [fieldKitPanel(view.satchel)]);
    const menu = this.slotsMenu(view);
    if (this.menus.path[0] === SLOTS_ID) this.menus.refresh(menu);
    else this.menus.push(menu);
    this.renderSlotDetail(view, view.slots[Math.max(0, this.menus.cursor)]?.slot ?? null);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private slotsMenu(view: EquipmentView): MenuDef {
    return {
      id: SLOTS_ID,
      title: "Slots",
      cancellable: false,
      entries: view.slots.map((slot) => {
        const available = availableCount(view, slot.slot);
        return {
          id: slot.slot,
          label: EQUIP_SLOT_LABELS[slot.slot],
          // An empty slot used to say only "Empty", which reads as a dead end.
          detail:
            slot.itemName ??
            (available === 0 ? "Empty — nothing available" : `Empty — ${available} available`),
          ...(slot.itemId === null ? {} : { note: slot.summary }),
          disabled: slot.lockedReason !== undefined,
          ...(slot.lockedReason === undefined ? {} : { disabledReason: slot.lockedReason }),
        };
      }),
      onCursor: (entry) => this.renderSlotDetail(view, entry.id as EquipSlot),
      onSelect: (entry) => this.menus.push(this.optionsMenu(view, entry.id as EquipSlot)),
      onCancel: () => this.intents.closeScreen(),
    };
  }

  private optionsMenu(view: EquipmentView, slot: EquipSlot): MenuDef {
    const options = view.options[slot] ?? [];
    const current = view.slots.find((s) => s.slot === slot);
    const entries: MenuEntry[] = options.map((option) => ({
      id: option.itemId,
      label: option.name,
      detail: summarizeDeltas(option),
      ...(option.equipped ? { note: "Equipped" } : {}),
      disabled: option.unavailableReason !== undefined,
      ...(option.unavailableReason === undefined ? {} : { disabledReason: option.unavailableReason }),
    }));
    if (current?.itemId) entries.unshift({ id: "__unequip", label: "Remove", detail: current.itemName ?? "" });
    return {
      id: `equipment-options-${slot}`,
      title: EQUIP_SLOT_LABELS[slot],
      entries:
        entries.length > 0
          ? entries
          : [
              {
                id: "__none",
                label: "No compatible kit",
                disabled: true,
                disabledReason: `A ${view.jobName} carries ${equipTagList(view.jobEquipTags)}; nothing in stock does`,
              },
            ],
      onCursor: (entry) => {
        const option = options.find((o) => o.itemId === entry.id) ?? null;
        this.renderOptionDetail(view, option, slot);
      },
      onSelect: (entry) => {
        this.intents.equipItem(view.unitId, slot, entry.id === "__unequip" ? null : entry.id);
        this.menus.pop();
      },
    };
  }

  private renderSlotDetail(view: EquipmentView, slot: EquipSlot | null): void {
    const current = slot === null ? undefined : view.slots.find((s) => s.slot === slot);
    if (!current) {
      replaceChildren(this.detail, [
        plate("Slot"),
        el("p", { class: "gf-empty-note", text: "No slot selected." }),
      ]);
      return;
    }
    const available = availableCount(view, current.slot);
    replaceChildren(this.detail, [
      plate("Slot", EQUIP_SLOT_LABELS[current.slot].toUpperCase()),
      el("div", {
        class: "gf-detail-body",
        children: [
          el("h2", { class: "gf-detail-title", text: current.itemName ?? "Empty" }),
          el("p", { class: "gf-detail-sub", text: current.itemId === null ? "Nothing worn" : current.summary }),
          el("p", {
            class: "gf-detail-note",
            text: alternativesLine(available, current.itemId !== null),
          }),
        ],
      }),
    ]);
  }

  private renderOptionDetail(
    view: EquipmentView,
    option: ItemOptionView | null,
    slot: EquipSlot,
  ): void {
    if (!option) {
      replaceChildren(this.detail, [
        plate("Kit", EQUIP_SLOT_LABELS[slot].toUpperCase()),
        el("div", {
          class: "gf-detail-body",
          children: [
            el("h2", { class: "gf-detail-title", text: EQUIP_SLOT_LABELS[slot] }),
            el("p", { class: "gf-detail-text", text: "Removing leaves the slot empty." }),
          ],
        }),
      ]);
      return;
    }
    replaceChildren(this.detail, [
      plate("Kit", EQUIP_SLOT_LABELS[slot].toUpperCase()),
      el("div", {
        class: "gf-detail-body",
        children: [
          el("h2", { class: "gf-detail-title", text: option.name }),
          // The piece's own figures, then who is allowed to carry it. The prose
          // used to be printed here as well as below it, word for word.
          el("p", { class: "gf-detail-sub", text: option.summary }),
          el("p", { class: "gf-detail-note", text: `Carried as: ${equipTagList(option.equipTags)}` }),
          deltaList(option, view.stats),
          el("p", { class: "gf-detail-text", text: option.description }),
          option.unavailableReason !== undefined &&
            el("p", { class: "gf-detail-note is-refused", text: option.unavailableReason }),
        ],
      }),
    ]);
  }
}

/** What else the unit could put here — which is a different fact when the slot
    is already occupied than when it is bare. */
function alternativesLine(available: number, occupied: boolean): string {
  if (available === 0) {
    return occupied ? "Nothing else in stock fits this slot." : "Nothing in stock fits this slot.";
  }
  const piece = available === 1 ? "piece" : "pieces";
  return occupied
    ? `${available} other ${piece} in stock would fit.`
    : `${available} ${piece} in stock would fit.`;
}

/**
 * Before→after, not a bare delta. "+24" is a number with nothing to measure it
 * against; the sheet's own figure is the thing the player is comparing to.
 */
function deltaList(option: ItemOptionView, stats: readonly StatLineView[] | undefined): HTMLElement {
  if (option.deltas.length === 0) {
    return el("ul", {
      class: "gf-delta-list",
      children: [el("li", { class: "gf-delta is-flat", text: "No stat change" })],
    });
  }
  const before = new Map((stats ?? []).map((line) => [line.key, line.value]));
  return el("ul", {
    class: "gf-delta-list",
    children: option.deltas.map((delta) => {
      const current = before.get(delta.key);
      const shift =
        current === undefined
          ? formatStatDelta(delta.key, delta.delta)
          : `${formatStatShift(delta.key, current, delta.delta)} (${formatStatDelta(delta.key, delta.delta)})`;
      return el("li", {
        class: `gf-delta ${delta.delta > 0 ? "is-gain" : delta.delta < 0 ? "is-loss" : "is-flat"}`,
        text: `${delta.label} ${shift}`,
      });
    }),
  });
}

/** Consumables are carried, not worn: the screen reports the pool, never edits it. */
export function summarizeSatchel(satchel: readonly ItemEntryView[]): string {
  if (satchel.length === 0) return "Field kit: empty";
  return `Field kit: ${satchel.map((entry) => `${entry.name} x${entry.count}`).join(" · ")}`;
}

/**
 * The field kit as a stock list rather than a header sentence: one row per
 * consumable, with what it does. It is the party's only healing and the screen
 * used to name it and stop there.
 */
export function fieldKitPanel(satchel: readonly ItemEntryView[]): HTMLElement {
  const total = satchel.reduce((sum, entry) => sum + entry.count, 0);
  return panel({
    className: "gf-kit-panel",
    title: "Field Kit",
    stamp: `${total} IN STOCK`,
    children:
      satchel.length === 0
        ? [el("p", { class: "gf-empty-note", text: "Nothing in the satchel." })]
        : [
            el("ul", {
              class: "gf-kit-list",
              children: satchel.map((entry) =>
                el("li", {
                  class: "gf-kit-entry",
                  data: { item: entry.itemId },
                  children: [
                    el("span", { class: "gf-kit-name", text: entry.name }),
                    el("span", { class: "gf-kit-count", text: `x${entry.count}` }),
                    el("p", {
                      class: "gf-kit-mechanics",
                      text: entry.mechanics?.summary ?? entry.description,
                    }),
                  ],
                }),
              ),
            }),
            el("p", {
              class: "gf-kit-note",
              text: "One pile, drawn on by the whole force. Stock spent in a battle does not come back.",
            }),
          ],
  });
}

function summarizeDeltas(option: ItemOptionView): string {
  if (option.deltas.length === 0) return option.summary;
  return option.deltas
    .map((delta) => `${delta.label} ${formatStatDelta(delta.key, delta.delta)}`)
    .join(" · ");
}
