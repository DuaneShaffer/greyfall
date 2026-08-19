// THE UI SEAM, mechanics side. One derivation of "what does this order actually
// do", read off the data definition, for every place an ability or an item is
// listed: the battle menus, the field kit, and the purchase screens.
//
// It lives beside `viewmodels.ts` because both seam builders need it and neither
// side may own it: `src/app/viewmodels.ts` reads a battle's synthesized ability
// (a weapon attack, an item as this unit throws it) and
// `src/app/campaignViews.ts` reads the shipped definition with no battle at all.
// The input is therefore the ability shape both can produce, never GameState.

import type { Amount, DamageType, Effect, Targeting } from "../data/index.js";
import type {
  MechanicsAmountView,
  MechanicsAreaView,
  MechanicsScale,
  MechanicsTargetKind,
  MechanicsView,
} from "../ui/index.js";

/** The parts of an action ability the mechanics are read from. */
export interface MechanicsSource {
  targeting: Targeting;
  effects: readonly Effect[];
  chargeCost: number;
  castSpeed: number | null;
}

export interface MechanicsOptions {
  /** Stock left in the satchel. Items only. */
  usesRemaining?: number;
  /** Status id to name; the id stands in when nothing resolves it. */
  statusName?: (statusId: string) => string;
}

const TARGET_KINDS: Record<Targeting["validTargets"][number], MechanicsTargetKind> = {
  enemy: "enemy",
  ally: "ally",
  self: "self",
  object: "object",
  emptyTile: "tile",
};

const TARGET_LABELS: Record<MechanicsTargetKind, string> = {
  enemy: "Enemy",
  ally: "Ally",
  self: "Self",
  object: "Machinery",
  tile: "Empty tile",
};

/**
 * How a power reads against its base. Only `fixed` is a number the player can
 * hold the game to; the rest are scales the engine resolves against the acting
 * unit, and printing them as totals would be a forecast, not a stat.
 */
function scaleLabel(scale: MechanicsScale, power: number): string {
  switch (scale) {
    case "fixed":
      return String(power);
    case "weapon":
      return `Weapon ${power}%`;
    case "maxHpPercent":
      return `${power}% max HP`;
    case "phys":
      return `Phys ×${power}`;
    case "mag":
      return `Mag ×${power}`;
  }
}

function amountView(
  kind: MechanicsAmountView["kind"],
  against: MechanicsAmountView["against"],
  amount: Amount,
  damageType?: DamageType,
): MechanicsAmountView {
  const scale = amount.base;
  const label = `${scaleLabel(scale, amount.power)}${damageType === undefined ? "" : ` ${damageType}`}`;
  return {
    kind,
    against,
    scale,
    power: amount.power,
    ...(damageType === undefined ? {} : { damageType }),
    label,
  };
}

const amountsOf = (effects: readonly Effect[]): MechanicsAmountView[] => {
  const out: MechanicsAmountView[] = [];
  for (const effect of effects) {
    if (effect.kind === "damage") out.push(amountView("damage", "unit", effect.amount, effect.damageType));
    if (effect.kind === "heal") out.push(amountView("recovery", "unit", effect.amount));
    if (effect.kind === "damageObject") out.push(amountView("damage", "integrity", effect.amount));
    if (effect.kind === "repairObject") out.push(amountView("recovery", "integrity", effect.amount));
  }
  return out;
};

const areaView = (targeting: Targeting): MechanicsAreaView => {
  const area = targeting.area;
  if (area.shape === "radius") return { shape: "radius", radius: area.size, vertical: area.vertical };
  if (area.shape === "line") return { shape: "line", length: area.length };
  return { shape: "single" };
};

const areaLabel = (area: MechanicsAreaView): string => {
  if (area.shape === "radius") return `Radius ${area.radius}`;
  if (area.shape === "line") return `Line ${area.length}`;
  return "Single target";
};

const rangeLabel = (range: Targeting["range"]): string => {
  const reach = range.min === range.max ? `${range.max}` : `${range.min}–${range.max}`;
  return `Range ${reach} (±${range.vertical}h)`;
};

/** "Enemy", "Ally or self", "Machinery or empty tile". */
const targetsLabel = (targets: readonly MechanicsTargetKind[]): string => {
  const labels = targets.map((kind) => TARGET_LABELS[kind]);
  if (labels.length === 0) return "—";
  if (labels.length === 1) return labels[0] ?? "—";
  const head = labels.slice(0, -1).join(", ");
  return `${head} or ${(labels[labels.length - 1] ?? "").toLowerCase()}`;
};

const amountLabel = (amount: MechanicsAmountView): string =>
  `${amount.kind === "recovery" ? "Recovery" : amount.against === "integrity" ? "Integrity" : "Damage"} ${amount.label}`;

/**
 * The mechanics of one order, derived from its definition. Everything a row
 * needs to stop making the player learn it by spending an action on it.
 */
export function mechanicsView(source: MechanicsSource, options: MechanicsOptions = {}): MechanicsView {
  const naming = options.statusName ?? ((statusId: string) => statusId);
  const targets = source.targeting.validTargets.map((kind) => TARGET_KINDS[kind]);
  const area = areaView(source.targeting);
  const amounts = amountsOf(source.effects);
  const statuses = source.effects
    .filter((effect): effect is Extract<Effect, { kind: "applyStatus" }> => effect.kind === "applyStatus")
    .map((effect) => ({ id: effect.statusId, name: naming(effect.statusId), chancePercent: effect.chance }));

  const summary = [
    rangeLabel(source.targeting.range),
    areaLabel(area),
    targetsLabel(targets),
    ...amounts.map(amountLabel),
    ...statuses.map((status) => `${status.name} ${status.chancePercent}%`),
    source.chargeCost > 0 ? `Charge ${source.chargeCost}` : null,
    source.castSpeed === null ? null : `Cast ${source.castSpeed}`,
    // The figure is `count - 1` — what is left once this one is spent — so the
    // kit read "Caustic Flask x1 · 0 in stock" against itself. The in-battle
    // forecast already had the right words for it.
    options.usesRemaining === undefined ? null : `${options.usesRemaining} left after use`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return {
    range: { ...source.targeting.range },
    area,
    targets,
    targetsLabel: targetsLabel(targets),
    requiresLos: source.targeting.requiresLos,
    amounts,
    statuses,
    chargeCost: source.chargeCost,
    castSpeed: source.castSpeed,
    ...(options.usesRemaining === undefined ? {} : { usesRemaining: options.usesRemaining }),
    summary,
  };
}
