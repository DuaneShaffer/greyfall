import type { Ability, Encounter, GameMap, Item, Job, Status } from "../../data/index.js";
import { itemAbility, itemIdFromAbilityId } from "../rules/items.js";
import type { ActionAbility, BattleUnit, GameState, WeaponItem } from "./types.js";

/** Everything loaded from `data/`, keyed by id. Input to `createBattle`. */
export interface ContentLibrary {
  jobs: Readonly<Record<string, Job>>;
  abilities: Readonly<Record<string, Ability>>;
  items: Readonly<Record<string, Item>>;
  statuses: Readonly<Record<string, Status>>;
  maps: Readonly<Record<string, GameMap>>;
  encounters: Readonly<Record<string, Encounter>>;
}

/**
 * Id of the engine-synthesized weapon attack. It is not a content file: every
 * unit always has it, and its range and damage come from the equipped weapon.
 */
export const BASIC_ATTACK_ID = "basic-attack";

/** Stats used when a unit has no weapon equipped. */
export const UNARMED = {
  power: 3,
  damageType: "kinetic",
  range: { min: 1, max: 1, vertical: 1 },
} as const;

export function jobById(state: GameState, id: string): Job | undefined {
  return state.content.jobs[id];
}

export function statusById(state: GameState, id: string): Status | undefined {
  return state.content.statuses[id];
}

export function itemById(state: GameState, id: string): Item | undefined {
  return state.content.items[id];
}

/** The unit's equipped weapon, or undefined when unarmed. */
export function equippedWeapon(state: GameState, unit: BattleUnit): WeaponItem | undefined {
  const id = unit.unit.equipment.weapon;
  if (id === undefined) return undefined;
  const item = state.content.items[id];
  if (item === undefined || item.slot !== "weapon") return undefined;
  return item;
}

export function weaponPower(state: GameState, unit: BattleUnit): number {
  return equippedWeapon(state, unit)?.power ?? UNARMED.power;
}

/** The weapon attack for this unit, built from whatever it is holding. */
export function basicAttack(state: GameState, unit: BattleUnit): ActionAbility {
  const weapon = equippedWeapon(state, unit);
  const range = weapon?.range ?? UNARMED.range;
  const damageType = weapon?.damageType ?? UNARMED.damageType;
  return {
    schemaVersion: 1,
    id: BASIC_ATTACK_ID,
    name: "Attack",
    description: "Strike with the equipped weapon.",
    jobId: unit.unit.jobId,
    standingCost: 0,
    slot: "action",
    targeting: {
      range: { min: range.min, max: range.max, vertical: range.vertical },
      area: { shape: "single" },
      requiresLos: true,
      validTargets: ["enemy"],
    },
    chargeCost: 0,
    castSpeed: null,
    effects: [{ kind: "damage", damageType, amount: { base: "weapon", power: 100 } }],
  };
}

/**
 * Ability lookup that also resolves the two abilities the engine synthesizes:
 * the weapon attack, and `item:<id>` for a consumable as this unit would use it.
 */
export function abilityById(state: GameState, unit: BattleUnit, id: string): Ability | undefined {
  if (id === BASIC_ATTACK_ID) return basicAttack(state, unit);
  const itemId = itemIdFromAbilityId(id);
  if (itemId !== null) {
    const item = state.content.items[itemId];
    return item === undefined || item.slot !== "consumable" ? undefined : itemAbility(state, unit, item);
  }
  return state.content.abilities[id];
}

/**
 * Action abilities the unit may issue: the weapon attack, its learned list, and
 * the innate lists of its primary and secondary jobs. Sorted, deduplicated.
 */
export function knownActionAbilityIds(state: GameState, unit: BattleUnit): string[] {
  const ids = new Set<string>([BASIC_ATTACK_ID]);
  for (const id of unit.unit.learnedAbilityIds) ids.add(id);
  for (const jobId of [unit.unit.jobId, unit.unit.secondaryJobId]) {
    if (jobId === undefined) continue;
    const job = state.content.jobs[jobId];
    if (job === undefined) continue;
    for (const id of job.innateAbilityIds) ids.add(id);
  }
  const out: string[] = [];
  for (const id of ids) {
    const ability = abilityById(state, unit, id);
    if (ability !== undefined && ability.slot === "action") out.push(id);
  }
  return out.sort();
}

/** Passive support/movement abilities the unit has slotted, in a fixed order. */
export function passiveAbilities(
  abilities: Readonly<Record<string, Ability>>,
  supportId: string | undefined,
  movementId: string | undefined,
): Ability[] {
  const out: Ability[] = [];
  for (const id of [supportId, movementId]) {
    if (id === undefined) continue;
    const ability = abilities[id];
    if (ability !== undefined) out.push(ability);
  }
  return out;
}
