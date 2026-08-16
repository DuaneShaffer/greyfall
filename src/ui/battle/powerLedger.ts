import { Component, el, plate, replaceChildren } from "../dom.js";
import type { PowerEntryView, PowerLedgerView } from "../state.js";

/**
 * The floor's power register: which machines are live and which are dead.
 *
 * On a map where the mains are the fight, the only cue that the enemy had cut
 * them was the Operate entry greying out on a unit the player happened to be
 * standing beside. This states it, in the register, all the time — a ledger
 * line per machine, copper because machinery is copper and nothing else is.
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
    this.el.classList.toggle("is-empty", entries.length === 0);
    const live = entries.filter((entry) => entry.powered).length;
    const stamp = this.plateEl.querySelector(".gf-plate-stamp");
    if (stamp) stamp.textContent = entries.length === 0 ? "" : `${live}/${entries.length}`;
    replaceChildren(
      this.list,
      entries.map((entry) => renderEntry(entry)),
    );
  }

  destroy(): void {
    this.el.remove();
  }
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
