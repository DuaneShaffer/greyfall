// Minimal DOM helpers. The UI layer is vanilla TypeScript over a DOM overlay:
// tactics menus are finite and keyboard-driven, so a framework buys nothing.

export type Child = Node | string | null | undefined | false;

export interface ElOptions {
  class?: string | undefined;
  text?: string | undefined;
  title?: string | undefined;
  attrs?: Record<string, string | number | boolean | null | undefined> | undefined;
  data?: Record<string, string | number | undefined> | undefined;
  children?: Child[] | undefined;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class !== undefined) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title !== undefined) node.title = options.title;
  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const [key, value] of Object.entries(options.data ?? {})) {
    if (value === undefined) continue;
    node.dataset[key] = String(value);
  }
  append(node, options.children ?? []);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function replaceChildren(parent: Node, children: Child[]): void {
  clear(parent);
  append(parent, children);
}

export function mount(parent: Node, component: Component<never> | { el: HTMLElement }): void {
  parent.appendChild(component.el);
}

export function unmount(component: { el: HTMLElement }): void {
  component.el.remove();
}

/** Every screen and panel is a component: an element plus update/destroy. */
export interface Component<V> {
  readonly el: HTMLElement;
  update(view: V): void;
  destroy(): void;
}

/** Remembers what had focus so a closing overlay can hand it back. */
export class FocusMemory {
  private readonly stack: HTMLElement[] = [];

  capture(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement) this.stack.push(active);
    else this.stack.push(document.body);
  }

  restore(): void {
    this.stack.pop()?.focus();
  }
}

export function focusable(node: HTMLElement): HTMLElement {
  if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
  return node;
}

/** Horizontal meter used for hp / charge / CT readouts. */
export function meter(className: string, value: number, max: number): HTMLElement {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return el("div", {
    class: `gf-meter ${className}`,
    attrs: {
      role: "meter",
      "aria-valuenow": value,
      "aria-valuemin": 0,
      "aria-valuemax": max,
    },
    children: [
      el("div", { class: "gf-meter-fill", attrs: { style: `width: ${(ratio * 100).toFixed(1)}%` } }),
    ],
  });
}

export function labelledValue(label: string, value: string, className = ""): HTMLElement {
  return el("div", {
    class: `gf-field ${className}`.trim(),
    children: [
      el("span", { class: "gf-field-label", text: label }),
      el("span", { class: "gf-field-value", text: value }),
    ],
  });
}

/** Placeholder portrait block until art lands; keyed by portraitId for colour. */
export function portrait(portraitId: string | undefined, name: string): HTMLElement {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return el("div", {
    class: "gf-portrait",
    data: { portrait: portraitId ?? "unknown" },
    attrs: { "aria-label": name },
    children: [el("span", { class: "gf-portrait-initials", text: initials })],
  });
}
