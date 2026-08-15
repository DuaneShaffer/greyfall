import { Component, el, focusable, replaceChildren } from "./dom.js";

export interface MenuEntry {
  id: string;
  label: string;
  /** Right-aligned cost or value column: "Charge 8", "250". */
  detail?: string;
  /** Second line under the label. */
  note?: string;
  disabled?: boolean;
  /** Shown as a tooltip on a greyed entry: "Insufficient charge". */
  disabledReason?: string;
}

export interface MenuDef {
  id: string;
  title?: string;
  entries: MenuEntry[];
  onSelect?: (entry: MenuEntry, index: number) => void;
  /** Cursor landed on an entry — drives previews (status panel, forecast). */
  onCursor?: (entry: MenuEntry, index: number) => void;
  /** Escape / right-click. Fires before the menu pops. */
  onCancel?: () => void;
  /** false keeps the menu on screen when cancelled (the root battle menu). */
  cancellable?: boolean;
}

const KEY_UP = new Set(["ArrowUp", "w", "W"]);
const KEY_DOWN = new Set(["ArrowDown", "s", "S"]);
const KEY_CONFIRM = new Set(["Enter", " "]);
const KEY_CANCEL = new Set(["Escape", "Backspace"]);

/**
 * The spine of every menu in the game: a stack of keyboard-driven lists with
 * wraparound, skipped-but-visible disabled entries, and a cursor position
 * remembered per menu id (FFT re-opens Act on the ability you last looked at).
 */
export class MenuStack implements Component<void> {
  readonly el: HTMLElement;
  private readonly stack: MenuDef[] = [];
  private readonly cursors = new Map<string, number>();
  private keyTarget: EventTarget | null = null;
  private readonly onKeyDown = (event: Event): void => {
    if (this.handleKey(event as KeyboardEvent)) event.preventDefault();
  };

  constructor() {
    this.el = focusable(el("div", { class: "gf-menu-stack", attrs: { role: "presentation" } }));
    this.render();
  }

  get depth(): number {
    return this.stack.length;
  }

  get active(): MenuDef | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get cursor(): number {
    const active = this.active;
    return active ? (this.cursors.get(active.id) ?? 0) : -1;
  }

  get cursorEntry(): MenuEntry | null {
    const active = this.active;
    if (!active) return null;
    return active.entries[this.cursor] ?? null;
  }

  /** Menu ids from root to top; handy for tests and debugging. */
  get path(): string[] {
    return this.stack.map((menu) => menu.id);
  }

  attach(target: EventTarget = document): void {
    this.detach();
    this.keyTarget = target;
    target.addEventListener("keydown", this.onKeyDown);
  }

  detach(): void {
    this.keyTarget?.removeEventListener("keydown", this.onKeyDown);
    this.keyTarget = null;
  }

  push(menu: MenuDef): void {
    this.stack.push(menu);
    this.setCursor(menu, this.cursors.get(menu.id) ?? 0, { silent: true });
    this.render();
    this.notifyCursor();
  }

  pop(): boolean {
    if (this.stack.length === 0) return false;
    this.stack.pop();
    this.render();
    this.notifyCursor();
    return true;
  }

  /** Swap the top menu without disturbing the levels below it. */
  replaceTop(menu: MenuDef): void {
    if (this.stack.length > 0) this.stack.pop();
    this.push(menu);
  }

  clearStack(): void {
    this.stack.length = 0;
    this.render();
  }

  /** Re-render an already-pushed menu after its entries change (costs, affordability). */
  refresh(menu: MenuDef): void {
    const index = this.stack.findIndex((m) => m.id === menu.id);
    if (index === -1) return;
    this.stack[index] = menu;
    this.setCursor(menu, this.cursors.get(menu.id) ?? 0, { silent: true });
    this.render();
  }

  moveCursor(delta: number): void {
    const active = this.active;
    if (!active) return;
    const next = this.findSelectable(active, this.cursor + delta, Math.sign(delta) || 1);
    if (next === -1) return;
    this.setCursor(active, next);
  }

  confirm(): void {
    const active = this.active;
    if (!active) return;
    const index = this.cursor;
    const entry = active.entries[index];
    if (!entry || entry.disabled) {
      this.flash();
      return;
    }
    active.onSelect?.(entry, index);
  }

  cancel(): void {
    const active = this.active;
    if (!active) return;
    active.onCancel?.();
    if (active.cancellable !== false) this.pop();
  }

  handleKey(event: KeyboardEvent): boolean {
    if (this.stack.length === 0) return false;
    if (KEY_UP.has(event.key)) {
      this.moveCursor(-1);
      return true;
    }
    if (KEY_DOWN.has(event.key)) {
      this.moveCursor(1);
      return true;
    }
    if (KEY_CONFIRM.has(event.key)) {
      this.confirm();
      return true;
    }
    if (KEY_CANCEL.has(event.key)) {
      this.cancel();
      return true;
    }
    return false;
  }

  update(): void {
    this.render();
  }

  destroy(): void {
    this.detach();
    this.clearStack();
    this.el.remove();
  }

  private setCursor(menu: MenuDef, index: number, options: { silent?: boolean } = {}): void {
    const resolved = this.findSelectable(menu, index, 1);
    this.cursors.set(menu.id, resolved === -1 ? Math.max(0, Math.min(index, menu.entries.length - 1)) : resolved);
    if (!options.silent) {
      this.render();
      this.notifyCursor();
    }
  }

  /** Nearest selectable entry from `start`, wrapping in `step`'s direction. */
  private findSelectable(menu: MenuDef, start: number, step: number): number {
    const count = menu.entries.length;
    if (count === 0) return -1;
    const wrapped = ((start % count) + count) % count;
    for (let i = 0; i < count; i++) {
      const index = ((wrapped + i * step) % count + count) % count;
      if (!menu.entries[index]?.disabled) return index;
    }
    return -1;
  }

  private notifyCursor(): void {
    const active = this.active;
    if (!active) return;
    const entry = active.entries[this.cursor];
    if (entry) active.onCursor?.(entry, this.cursor);
  }

  private flash(): void {
    this.el.classList.remove("is-refused");
    void this.el.offsetWidth;
    this.el.classList.add("is-refused");
  }

  private render(): void {
    replaceChildren(
      this.el,
      this.stack.map((menu, level) => this.renderMenu(menu, level === this.stack.length - 1)),
    );
  }

  private renderMenu(menu: MenuDef, active: boolean): HTMLElement {
    const cursor = this.cursors.get(menu.id) ?? 0;
    const items = menu.entries.map((entry, index) => this.renderEntry(menu, entry, index, active && index === cursor));
    const list = el("ul", {
      class: "gf-menu-list",
      attrs: {
        role: "menu",
        "aria-activedescendant": active ? `${menu.id}-${cursor}` : null,
      },
      children: items,
    });
    return el("div", {
      class: `gf-menu${active ? " is-active" : ""}`,
      data: { menu: menu.id },
      children: [menu.title !== undefined && el("h2", { class: "gf-menu-title", text: menu.title }), list],
    });
  }

  private renderEntry(menu: MenuDef, entry: MenuEntry, index: number, selected: boolean): HTMLElement {
    const classes = ["gf-menu-entry"];
    if (selected) classes.push("is-selected");
    if (entry.disabled) classes.push("is-disabled");
    const node = el("li", {
      class: classes.join(" "),
      title: entry.disabled ? entry.disabledReason : undefined,
      data: { entry: entry.id },
      attrs: {
        id: `${menu.id}-${index}`,
        role: "menuitem",
        "aria-disabled": entry.disabled ? "true" : null,
      },
      children: [
        el("span", { class: "gf-menu-cursor", text: selected ? "▸" : " " }),
        el("span", { class: "gf-menu-label", text: entry.label }),
        entry.detail !== undefined && el("span", { class: "gf-menu-detail", text: entry.detail }),
        entry.note !== undefined && el("span", { class: "gf-menu-note", text: entry.note }),
        entry.disabled &&
          entry.disabledReason !== undefined &&
          el("span", { class: "gf-menu-reason", text: entry.disabledReason }),
      ],
    });
    node.addEventListener("mouseenter", () => {
      if (this.active !== menu || entry.disabled) return;
      this.setCursor(menu, index);
    });
    node.addEventListener("click", () => {
      if (this.active !== menu) return;
      this.setCursor(menu, index);
      this.confirm();
    });
    return node;
  }
}
