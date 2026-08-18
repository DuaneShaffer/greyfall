import { el } from "../dom.js";
import type { MechanicsAreaView, MechanicsView } from "../state.js";

// One reading of `MechanicsView` for every between-battle page that lists an
// order: the purchase list, the field kit, the unit's own record. The playtest
// called buying an ability a blind gamble, and it was — the prose said what the
// order was for and nothing said what it did.
//
// Two densities, one source: `mechanicsSummary` for a row, `mechanicsLedger` for
// whichever entry the cursor is on.

const AREA_TEXT = (area: MechanicsAreaView): string => {
  if (area.shape === "radius") {
    return `Radius ${area.radius}${area.vertical === 0 ? "" : `, ±${area.vertical} height`}`;
  }
  if (area.shape === "line") return `Line ${area.length}`;
  return "Single target";
};

const RANGE_TEXT = (range: MechanicsView["range"]): string => {
  const reach = range.min === range.max ? `${range.max}` : `${range.min}–${range.max}`;
  const tiles = range.max === 1 && range.min === 1 ? "tile" : "tiles";
  return `${reach} ${tiles}, ±${range.vertical} height`;
};

const AMOUNT_LABEL = (amount: MechanicsView["amounts"][number]): string =>
  amount.kind === "recovery"
    ? amount.against === "integrity"
      ? "Repairs"
      : "Recovery"
    : amount.against === "integrity"
      ? "Integrity damage"
      : "Damage";

/** True when a figure is a scale the engine resolves, not a number to hold us to. */
const isScaled = (amount: MechanicsView["amounts"][number]): boolean => amount.scale !== "fixed";

/** The one-line reading a list row carries beside the name. */
export function mechanicsSummary(mechanics: MechanicsView | undefined): string | undefined {
  return mechanics?.summary;
}

/** What a slot with no mechanics of its own is, said rather than left blank. */
export const PASSIVE_SLOT_TEXT: Record<"action" | "reaction" | "support" | "movement", string> = {
  // An action ability always carries mechanics; if one reaches here the seam
  // failed, and saying so is better than printing a passive's line over it.
  action: "Action — mechanics not on file",
  reaction: "Reaction — fires on its own trigger, never ordered",
  support: "Support — always in force once equipped",
  movement: "Movement — always in force once equipped",
};

/**
 * The full reading, for the entry under the cursor. Every figure states its
 * scale: a total would be a forecast wearing a stat's clothes (UI_DESIGN §14.1).
 */
export function mechanicsLedger(mechanics: MechanicsView): HTMLElement {
  const rows: HTMLElement[] = [
    el("dt", { text: "Range" }),
    el("dd", { text: RANGE_TEXT(mechanics.range) }),
    el("dt", { text: "Area" }),
    el("dd", { text: AREA_TEXT(mechanics.area) }),
    el("dt", { text: "Targets" }),
    el("dd", { text: mechanics.targetsLabel }),
    el("dt", { text: "Line of sight" }),
    el("dd", { text: mechanics.requiresLos ? "Required" : "Not required" }),
  ];

  for (const amount of mechanics.amounts) {
    rows.push(el("dt", { text: AMOUNT_LABEL(amount) }));
    rows.push(el("dd", { class: "gf-mechanics-amount", text: amount.label }));
  }

  for (const status of mechanics.statuses) {
    rows.push(el("dt", { text: status.name }));
    rows.push(el("dd", { text: `${status.chancePercent}% chance` }));
  }

  rows.push(el("dt", { text: "Charge" }));
  rows.push(el("dd", { text: mechanics.chargeCost === 0 ? "None" : String(mechanics.chargeCost) }));
  rows.push(el("dt", { text: "Cast" }));
  rows.push(
    el("dd", {
      text: mechanics.castSpeed === null ? "Resolves at once" : `Charges for ${mechanics.castSpeed}`,
    }),
  );

  if (mechanics.usesRemaining !== undefined) {
    rows.push(el("dt", { text: "Left after this" }));
    rows.push(el("dd", { text: String(mechanics.usesRemaining) }));
  }

  return el("div", {
    class: "gf-mechanics",
    children: [
      el("dl", { class: "gf-ledger gf-mechanics-ledger", children: rows }),
      mechanics.amounts.some(isScaled) &&
        el("p", {
          class: "gf-mechanics-scale-note",
          text: "Scaled figures resolve against the unit and its kit; a plain number is fixed.",
        }),
    ],
  });
}

/** The ledger, or a line saying why there is none to print. */
export function mechanicsBlock(
  mechanics: MechanicsView | undefined,
  absent: string,
): HTMLElement {
  if (mechanics === undefined) return el("p", { class: "gf-mechanics-absent", text: absent });
  return mechanicsLedger(mechanics);
}
