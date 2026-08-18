import type { Ability, Effect, ItemStack, Targeting, Team } from "../../data/index.js";
import type { Ctx } from "../state/ctx.js";
import type { ActionAbility, BattleUnit, ConsumableItem, GameState } from "../state/types.js";

/**
 * Consumables, the Chemist's half of the game.
 *
 * A use is modelled as an ability the engine synthesizes from the item, the
 * same trick `basicAttack` plays with the equipped weapon: targeting, area
 * resolution, forecasting and AI scoring then all read a consumable through the
 * exact code path they read an ability through, and only possession, the carry
 * pool, and the potency bonus are new rules.
 */

/** Namespace prefix for a synthesized item ability. `Id` forbids `:` in content. */
export const ITEM_ABILITY_PREFIX = "item:";

export function itemAbilityId(itemId: string): string {
  return `${ITEM_ABILITY_PREFIX}${itemId}`;
}

/** The item behind a synthesized ability id, or null for a real ability. */
export function itemIdFromAbilityId(abilityId: string): string | null {
  if (!abilityId.startsWith(ITEM_ABILITY_PREFIX)) return null;
  return abilityId.slice(ITEM_ABILITY_PREFIX.length);
}

/**
 * How an item with no authored `targeting` is applied: pressed into a hand at
 * arm's length. FFT's Item default, and the reason a thrown flask has to say so.
 */
export const DEFAULT_CONSUMABLE_TARGETING: Targeting = {
  range: { min: 0, max: 1, vertical: 1 },
  area: { shape: "single" },
  requiresLos: false,
  validTargets: ["self", "ally"],
};

type ItemMastery = Extract<Ability, { slot: "support" }>["passive"];

function supportPassive(state: GameState, unit: BattleUnit): ItemMastery {
  const id = unit.unit.supportAbilityId;
  if (id === undefined) return {};
  const ability = state.content.abilities[id];
  if (ability === undefined || ability.slot !== "support") return {};
  return ability.passive;
}

/** Percent added to a consumable's damage and heal power by item mastery. */
export function consumablePotencyBonus(state: GameState, unit: BattleUnit): number {
  return supportPassive(state, unit).consumableEffectBonusPercent ?? 0;
}

/** Tiles added to a consumable's reach by item mastery — the throw. */
export function consumableRangeBonus(state: GameState, unit: BattleUnit): number {
  return supportPassive(state, unit).consumableRangeBonus ?? 0;
}

const scalePower = (power: number, bonusPercent: number): number =>
  Math.floor((power * (100 + bonusPercent)) / 100);

/** Potency applies to magnitude only: a status either lands or it does not. */
function scaleEffects(effects: readonly Effect[], bonusPercent: number): Effect[] {
  if (bonusPercent === 0) return [...effects];
  return effects.map((effect) => {
    if (effect.kind !== "damage" && effect.kind !== "heal") return effect;
    return { ...effect, amount: { ...effect.amount, power: scalePower(effect.amount.power, bonusPercent) } };
  });
}

/**
 * The item as this unit would use it: authored targeting widened by the
 * carrier's throw, effects scaled by the carrier's potency. Instant, free of
 * flux, and spending the unit's action — the cost is the item itself.
 */
export function itemAbility(state: GameState, unit: BattleUnit, item: ConsumableItem): ActionAbility {
  const base = item.targeting ?? DEFAULT_CONSUMABLE_TARGETING;
  const reach = consumableRangeBonus(state, unit);
  return {
    schemaVersion: 1,
    id: itemAbilityId(item.id),
    name: item.name,
    description: item.description,
    jobId: unit.unit.jobId,
    standingCost: 0,
    slot: "action",
    targeting: {
      range: { ...base.range, max: base.range.max + reach },
      area: { ...base.area },
      requiresLos: base.requiresLos,
      validTargets: [...base.validTargets],
    },
    chargeCost: 0,
    castSpeed: null,
    effects: scaleEffects(item.effects, consumablePotencyBonus(state, unit)),
  };
}

export function consumableItem(state: GameState, itemId: string): ConsumableItem | undefined {
  const item = state.content.items[itemId];
  return item !== undefined && item.slot === "consumable" ? item : undefined;
}

/** The shared pool one team draws from, in item-id order. Never mutated here. */
export function teamSatchel(state: GameState, team: Team): readonly ItemStack[] {
  return state.satchels.find((entry) => entry.team === team)?.items ?? [];
}

export function satchelCount(state: GameState, team: Team, itemId: string): number {
  return teamSatchel(state, team).find((stack) => stack.itemId === itemId)?.count ?? 0;
}

/** Whether the unit's job carries a tag the item is issued against. */
export function canCarryItem(state: GameState, unit: BattleUnit, item: ConsumableItem): boolean {
  const job = state.content.jobs[unit.unit.jobId];
  if (job === undefined) return false;
  return item.equipTags.some((tag) => job.equipTags.includes(tag));
}

/**
 * Consumables in the unit's team satchel, in id order. Not filtered by job:
 * a menu lists what the force is carrying and greys what this unit cannot
 * reach for, so the reason is visible rather than the entry missing.
 */
export function carriedItemIds(state: GameState, unit: BattleUnit): string[] {
  const out: string[] = [];
  for (const stack of teamSatchel(state, unit.team)) {
    if (stack.count <= 0) continue;
    const item = consumableItem(state, stack.itemId);
    if (item === undefined) continue;
    out.push(item.id);
  }
  return out;
}

/** Take one item out of the team's satchel. Empty stacks are dropped. */
export function spendItem(ctx: Ctx, team: Team, itemId: string): number {
  const satchel = ctx.state.satchels.find((entry) => entry.team === team);
  if (satchel === undefined) return 0;
  const stack = satchel.items.find((entry) => entry.itemId === itemId);
  if (stack === undefined) return 0;
  stack.count -= 1;
  const remaining = stack.count;
  if (stack.count <= 0) satchel.items = satchel.items.filter((entry) => entry.itemId !== itemId);
  return remaining;
}

/** Build the battle's satchel list from carry pools, in team order. */
export function buildSatchels(
  pools: readonly { team: Team; items: readonly ItemStack[] }[],
): GameState["satchels"] {
  const out: GameState["satchels"] = [];
  for (const pool of pools) {
    const items = pool.items
      .filter((stack) => stack.count > 0)
      .map((stack) => ({ itemId: stack.itemId, count: stack.count }))
      .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
    if (items.length === 0) continue;
    out.push({ team: pool.team, items });
  }
  out.sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : 0));
  return out;
}
