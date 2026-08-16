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
  const state = className.includes("is-hp") && ratio <= 0.33 ? " is-low" : ratio >= 1 ? " is-ready" : "";
  return el("div", {
    class: `gf-meter ${className}${state}`,
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

/**
 * The plate header every panel wears: a stamped title on the left and an
 * optional readout stamped on the right (`CT 100`, `4 ENTRIES`, a team tag).
 */
export function plate(title: string, stamp?: string): HTMLElement {
  return el("h2", {
    class: "gf-plate gf-panel-title",
    children: [
      el("span", { class: "gf-plate-title", text: title }),
      stamp === undefined ? null : el("span", { class: "gf-plate-stamp", text: stamp }),
    ],
  });
}

/** A panel: plate header, body, hairline border. `variant` sets its weight. */
export function panel(options: {
  className?: string;
  title: string;
  stamp?: string;
  variant?: "live" | "quiet";
  children?: Child[];
  attrs?: ElOptions["attrs"];
}): HTMLElement {
  const variant = options.variant === undefined ? "" : ` is-${options.variant}`;
  return el("section", {
    class: `gf-panel${variant}${options.className === undefined ? "" : ` ${options.className}`}`,
    ...(options.attrs === undefined ? {} : { attrs: options.attrs }),
    children: [
      plate(options.title, options.stamp),
      el("div", { class: "gf-panel-body", children: options.children ?? [] }),
    ],
  });
}

/** One status / modifier chip. `tone` maps to the status category colors. */
export function chip(label: string, tone: string, note?: string): HTMLElement {
  return el("li", {
    class: `gf-chip is-${tone}`,
    children: [
      el("span", { class: "gf-chip-label", text: label }),
      note === undefined ? null : el("span", { class: "gf-chip-turns", text: note }),
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

export interface PortraitOptions {
  /** Job name; its initial is stamped on the card's tab. */
  jobName?: string | undefined;
  team?: string | undefined;
  size?: "small" | "large" | undefined;
}

/**
 * Painted portraits are the open art workstream (ART_DIRECTION §4, A.9). Until
 * they land every portrait slot draws the same designed stand-in: a monogram
 * record card with a job tab and a team-tint rim.
 */
export function portrait(
  portraitId: string | undefined,
  name: string,
  options: PortraitOptions = {},
): HTMLElement {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const sizeClass = options.size === undefined ? "" : ` is-${options.size}`;
  return el("div", {
    class: `gf-portrait${sizeClass}`,
    data: { portrait: portraitId ?? "unknown", ...(options.team === undefined ? {} : { team: options.team }) },
    attrs: { "aria-label": name, role: "img" },
    children: [
      el("span", { class: "gf-portrait-initials", text: initials }),
      options.jobName === undefined || options.jobName === ""
        ? null
        : el("span", { class: "gf-portrait-job", text: options.jobName.slice(0, 1).toUpperCase() }),
    ],
  });
}
