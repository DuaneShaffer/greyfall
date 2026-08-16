import { Component, el, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuEntry, MenuStack } from "../menu.js";
import {
  EQUIP_SLOT_LABELS,
  EquipSlot,
  EquipmentView,
  ItemEntryView,
  ItemOptionView,
  formatSigned,
} from "../state.js";

const SLOTS_ID = "equipment-slots";

/** Slot list on the left, tag-filtered kit on the right, deltas in the panel. */
export class EquipmentScreen implements Component<EquipmentView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly detail: HTMLElement;
  private readonly headerEl: HTMLElement;
  private readonly satchelEl: HTMLElement;
  private view: EquipmentView | null = null;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-equip-detail" });
    this.headerEl = el("p", { class: "gf-screen-note" });
    this.satchelEl = el("p", { class: "gf-screen-note gf-satchel" });
    this.el = el("section", {
      class: "gf-screen gf-equipment",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("h1", { class: "gf-screen-title", text: "Equipment" }),
            this.headerEl,
            this.satchelEl,
          ],
        }),
        el("div", { class: "gf-screen-cols", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  update(view: EquipmentView): void {
    this.view = view;
    this.headerEl.textContent = `${view.unitName} · ${view.jobName} · ${view.jobEquipTags.join(", ")}`;
    this.satchelEl.textContent = summarizeSatchel(view.satchel);
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
      entries: view.slots.map((slot) => ({
        id: slot.slot,
        label: EQUIP_SLOT_LABELS[slot.slot],
        detail: slot.itemName ?? "Empty",
        note: slot.summary,
        disabled: slot.lockedReason !== undefined,
        ...(slot.lockedReason === undefined ? {} : { disabledReason: slot.lockedReason }),
      })),
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
          : [{ id: "__none", label: "No compatible kit", disabled: true, disabledReason: `No item carries a ${view.jobName} tag` }],
      onCursor: (entry) => {
        const option = options.find((o) => o.itemId === entry.id) ?? null;
        this.renderOptionDetail(option, slot);
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
      replaceChildren(this.detail, [el("p", { class: "gf-empty-note", text: "No slot selected." })]);
      return;
    }
    replaceChildren(this.detail, [
      el("h2", { class: "gf-detail-title", text: EQUIP_SLOT_LABELS[current.slot] }),
      el("p", { class: "gf-detail-sub", text: current.itemName ?? "Empty" }),
      el("p", { class: "gf-detail-text", text: current.summary }),
    ]);
  }

  private renderOptionDetail(option: ItemOptionView | null, slot: EquipSlot): void {
    if (!option) {
      replaceChildren(this.detail, [
        el("h2", { class: "gf-detail-title", text: EQUIP_SLOT_LABELS[slot] }),
        el("p", { class: "gf-detail-text", text: "Removing leaves the slot empty." }),
      ]);
      return;
    }
    replaceChildren(this.detail, [
      el("h2", { class: "gf-detail-title", text: option.name }),
      el("p", { class: "gf-detail-sub", text: `${option.summary} · ${option.equipTags.join(", ")}` }),
      el("p", { class: "gf-detail-text", text: option.description }),
      el("ul", {
        class: "gf-delta-list",
        children:
          option.deltas.length === 0
            ? [el("li", { class: "gf-delta is-flat", text: "No stat change" })]
            : option.deltas.map((delta) =>
                el("li", {
                  class: `gf-delta ${delta.delta > 0 ? "is-gain" : delta.delta < 0 ? "is-loss" : "is-flat"}`,
                  text: `${delta.label} ${formatSigned(delta.delta)}`,
                }),
              ),
      }),
      option.unavailableReason !== undefined &&
        el("p", { class: "gf-detail-note is-refused", text: option.unavailableReason }),
    ]);
  }
}

/** Consumables are carried, not worn: the screen reports the pool, never edits it. */
export function summarizeSatchel(satchel: readonly ItemEntryView[]): string {
  if (satchel.length === 0) return "Field kit: empty";
  return `Field kit: ${satchel.map((entry) => `${entry.name} x${entry.count}`).join(" · ")}`;
}

function summarizeDeltas(option: ItemOptionView): string {
  if (option.deltas.length === 0) return option.summary;
  return option.deltas.map((delta) => `${delta.label} ${formatSigned(delta.delta)}`).join(" · ");
}
