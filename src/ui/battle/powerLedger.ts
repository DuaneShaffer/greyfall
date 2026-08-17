import { Component, el, plate, replaceChildren } from "../dom.js";
import type {
  PowerComponentView,
  PowerEntryView,
  PowerLedgerView,
  PowerNetworkView,
  PowerNodeState,
  PowerNodeView,
} from "../state.js";

/**
 * The floor's power register: which machines are live, which are dead, and what
 * every network is carrying against what it is rated for.
 *
 * On a map where the mains are the fight, the only cue that the enemy had cut
 * them was the Operate entry greying out on a unit the player happened to be
 * standing beside. This states it, in the register, all the time — a ledger
 * line per machine, copper because machinery is copper and nothing else is.
 *
 * The LOAD line is what makes a trip a decision the player can plan instead of
 * a surprise they absorb (FLUX_GRID §2.5a).
 */
export class PowerLedger implements Component<PowerLedgerView | undefined> {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly plateEl: HTMLElement;

  constructor() {
    this.list = el("ul", { class: "gf-power-list" });
    this.plateEl = plate("Power", "");
    this.el = el("section", {
      class: "gf-panel is-quiet gf-power is-empty",
      attrs: { "aria-label": "Power register" },
      children: [this.plateEl, this.list],
    });
  }

  update(view: PowerLedgerView | undefined): void {
    const entries = view?.entries ?? [];
    const networks = view?.networks ?? [];
    const nodes = networks.flatMap((network) => [
      ...network.components.flatMap((component) => component.nodes),
      ...network.outOfCircuit,
    ]);
    const total = entries.length + nodes.length;
    this.el.classList.toggle("is-empty", total === 0);
    const live =
      entries.filter((entry) => entry.powered).length +
      nodes.filter((node) => node.state === "live" || node.state === "tie-closed").length;
    const stamp = this.plateEl.querySelector(".gf-plate-stamp");
    if (stamp) stamp.textContent = total === 0 ? "" : `${live}/${total}`;
    replaceChildren(this.list, [
      ...networks.map((network) => renderNetwork(network)),
      ...entries.map((entry) => renderEntry(entry)),
    ]);
  }

  destroy(): void {
    this.el.remove();
  }
}

const STATE_LABEL: Record<PowerNodeState, string> = {
  live: "Live",
  dead: "Dead",
  open: "Open",
  cut: "Cut",
  destroyed: "Destroyed",
  tripped: "Tripped",
  "tie-open": "Tie Open",
  "tie-closed": "Tie Closed",
};

/**
 * A thrown switch, a cut span and a wreck are different problems with different
 * answers, so they are different rows: copper for what is being fed, dim for
 * what is merely switched out, `overload-500` for the latch that blew, and the
 * destroyed language for the one nothing answers.
 */
const STATE_CLASS: Record<PowerNodeState, string> = {
  live: "is-live",
  dead: "is-dead",
  open: "is-dead",
  cut: "is-cut",
  destroyed: "is-wrecked",
  tripped: "is-tripped",
  "tie-open": "is-dead",
  "tie-closed": "is-live",
};

/** What feeds a bus, named — or the fact that nothing does. */
const componentName = (component: PowerComponentView): string =>
  component.sources.length === 0 ? "Unfed" : component.sources.join(" + ");

function renderComponent(component: PowerComponentView): HTMLElement {
  // A component with no rating has no LOAD line, and its absence is the
  // explanation: nothing feeds this, so there is no arithmetic to read.
  const load =
    component.capacity === 0
      ? []
      : [
          el("span", {
            class: `gf-power-load is-${component.level}`,
            text: `Load ${component.load}/${component.capacity}`,
          }),
        ];
  // What a reclose actually has to beat. A bus fed by two mains that latched
  // one after the other reads 18 against a rating of 28 and blew at 14, and
  // without this the second main's absence is invisible in the arithmetic.
  const held =
    component.state === "tripped" && component.held < component.capacity
      ? [
          el("span", {
            class: "gf-power-held",
            text: `${component.held}/${component.capacity} closed`,
          }),
        ]
      : [];
  const flag =
    component.state === "live"
      ? []
      : [
          el("span", {
            class: "gf-power-flag",
            text: component.state === "tripped" ? "Tripped" : "Dead",
          }),
        ];
  return el("li", {
    class: `gf-power-component is-${component.state}`,
    data: { component: component.id },
    children: [
      el("div", {
        class: "gf-power-component-head",
        children: [
          el("span", { class: "gf-power-name", text: componentName(component) }),
          ...load,
          ...held,
          ...flag,
        ],
      }),
      el("ul", {
        class: "gf-power-nodes",
        children: component.nodes.map((node) => renderNode(node)),
      }),
    ],
  });
}

function renderOutOfCircuit(nodes: readonly PowerNodeView[]): HTMLElement[] {
  if (nodes.length === 0) return [];
  return [
    el("li", {
      class: "gf-power-component is-out",
      children: [
        el("div", {
          class: "gf-power-component-head",
          children: [el("span", { class: "gf-power-name", text: "Out of circuit" })],
        }),
        el("ul", {
          class: "gf-power-nodes",
          children: nodes.map((node) => renderNode(node)),
        }),
      ],
    }),
  ];
}

function renderNetwork(network: PowerNetworkView): HTMLElement {
  return el("li", {
    class: "gf-power-network",
    data: { grid: network.gridId },
    children: [
      el("div", {
        class: "gf-power-network-head",
        children: [el("span", { class: "gf-power-name", text: network.name })],
      }),
      el("ul", {
        class: "gf-power-components",
        children: [
          ...network.components.map((component) => renderComponent(component)),
          ...renderOutOfCircuit(network.outOfCircuit),
        ],
      }),
    ],
  });
}

function renderNode(node: PowerNodeView): HTMLElement {
  return el("li", {
    class: `gf-power-entry ${STATE_CLASS[node.state]}`,
    data: { object: node.objectId },
    children: [
      el("span", { class: "gf-power-name", text: node.name }),
      el("span", { class: "gf-power-state", text: STATE_LABEL[node.state] }),
    ],
  });
}

function renderEntry(entry: PowerEntryView): HTMLElement {
  return el("li", {
    class: `gf-power-entry${entry.powered ? " is-live" : " is-dead"}`,
    data: { object: entry.objectId },
    children: [
      el("span", { class: "gf-power-name", text: entry.name }),
      el("span", { class: "gf-power-state", text: entry.powered ? "Live" : "Dead" }),
    ],
  });
}
