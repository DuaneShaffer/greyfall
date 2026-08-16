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
 * The spine of every menu in the game: a stack of lists with wraparound,
 * skipped-but-visible disabled entries, and a cursor position remembered per
 * menu id (FFT re-opens Act on the ability you last looked at).
 *
 * Keyboard and mouse are equals. Hovering moves the cursor and clicking
 * confirms it, which only works because the cursor never rebuilds the list:
 * `setCursor` is a no-op when the index has not changed, and `refresh` patches
 * in place unless the entries themselves changed.
 */
export class MenuStack implements Component<void> {
  readonly el: HTMLElement;
  private readonly stack: MenuDef[] = [];
  private readonly cursors = new Map<string, number>();
  /** Live entry nodes per menu id, so the cursor can move without a rebuild. */
  private readonly nodes = new Map<string, { list: HTMLElement; entries: HTMLElement[] }>();
  private keyTarget: EventTarget | null = null;
  private readonly onKeyDown = (event: Event): void => {
    if (this.handleKey(event as KeyboardEvent)) event.preventDefault();
  };

  constructor() {
    this.el = focusable(el("div", { class: "gf-menu-stack", attrs: { role: "presentation" } }));
    // Right-click is the mouse's Escape. Without it a player who never touches
    // the keyboard can open a submenu and has no way back out of it.
    this.el.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.cancel();
    });
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
    const previous = this.stack[index];
    this.stack[index] = menu;
    this.setCursor(menu, this.cursors.get(menu.id) ?? 0, { silent: true });
    // Rebuilding entry nodes under a resting pointer costs the player their
    // mouse (the node that would receive mousedown is replaced first), so a
    // refresh that changes nothing visible must not touch the DOM at all.
    if (previous !== undefined && sameEntries(previous.entries, menu.entries)) {
      this.syncSelection();
      return;
    }
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
    const next =
      resolved === -1 ? Math.max(0, Math.min(index, menu.entries.length - 1)) : resolved;
    const previous = this.cursors.get(menu.id);
    this.cursors.set(menu.id, next);
    if (options.silent) return;
    // A cursor that did not move is not an event. Re-rendering (and re-firing
    // onCursor) here is what used to put a resting pointer into a permanent
    // rebuild loop and swallow every click.
    if (previous === next) return;
    this.syncSelection();
    this.notifyCursor();
  }

  /** Move the highlight over the nodes already on screen; never rebuild them. */
  private syncSelection(): void {
    const top = this.stack.length - 1;
    this.stack.forEach((menu, level) => {
      const nodes = this.nodes.get(menu.id);
      if (nodes === undefined) return;
      const cursor = this.cursors.get(menu.id) ?? 0;
      const active = level === top;
      nodes.list.setAttribute("aria-activedescendant", active ? `${menu.id}-${cursor}` : "");
      nodes.entries.forEach((node, index) => {
        node.classList.toggle("is-selected", active && index === cursor);
        const caret = node.querySelector(".gf-menu-cursor");
        if (caret) caret.textContent = active && index === cursor ? "▸" : " ";
      });
    });
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
    this.nodes.clear();
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
    this.nodes.set(menu.id, { list, entries: items });
    return el("div", {
      class: `gf-menu${active ? " is-active" : ""}`,
      data: { menu: menu.id },
      children: [
        menu.title !== undefined && el("h2", { class: "gf-menu-title", text: menu.title }),
        list,
      ],
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
    // Handlers match the menu by id, not by identity: a `refresh` that changed
    // nothing keeps these nodes but hands the stack a fresh MenuDef, and an
    // identity check would quietly make every surviving node inert.
    const liveEntry = (): MenuEntry | null => {
      const active = this.active;
      if (active === null || active.id !== menu.id) return null;
      return active.entries[index] ?? null;
    };
    node.addEventListener("mouseenter", () => {
      const current = liveEntry();
      if (current === null || current.disabled === true) return;
      this.setCursor(menu, index);
    });
    node.addEventListener("click", () => {
      const current = liveEntry();
      if (current === null) return;
      if (current.disabled === true) {
        this.flash();
        return;
      }
      this.setCursor(menu, index);
      this.confirm();
    });
    return node;
  }
}

/** True when two entry lists would draw identically. */
function sameEntries(a: readonly MenuEntry[], b: readonly MenuEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      entry.id === other.id &&
      entry.label === other.label &&
      entry.detail === other.detail &&
      entry.note === other.note &&
      (entry.disabled ?? false) === (other.disabled ?? false) &&
      entry.disabledReason === other.disabledReason
    );
  });
}
