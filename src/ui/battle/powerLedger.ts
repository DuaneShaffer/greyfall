import { Component, el, plate, replaceChildren } from "../dom.js";
import type {
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
    const nodes = networks.flatMap((network) => network.nodes);
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
  tripped: "Tripped",
  "tie-open": "Tie Open",
  "tie-closed": "Tie Closed",
};

/**
 * A thrown switch and a cut span are different problems with different
 * answers, so they are different rows: copper for what is being fed, dim for
 * what is merely switched out, `overload-500` for the latch that blew.
 */
const STATE_CLASS: Record<PowerNodeState, string> = {
  live: "is-live",
  dead: "is-dead",
  open: "is-dead",
  cut: "is-cut",
  tripped: "is-tripped",
  "tie-open": "is-dead",
  "tie-closed": "is-live",
};

function renderNetwork(network: PowerNetworkView): HTMLElement {
  const head = el("div", {
    class: "gf-power-network-head",
    children: [
      el("span", { class: "gf-power-name", text: network.name }),
      el("span", {
        class: `gf-power-load is-${network.level}`,
        text: `Load ${network.load}/${network.capacity}`,
      }),
      ...(network.tripped ? [el("span", { class: "gf-power-flag", text: "Tripped" })] : []),
    ],
  });
  return el("li", {
    class: "gf-power-network",
    data: { grid: network.gridId },
    children: [
      head,
      el("ul", {
        class: "gf-power-nodes",
        children: network.nodes.map((node) => renderNode(node)),
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
