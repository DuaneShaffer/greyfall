import { z } from "zod";
import { Targeting } from "./ability.js";
import { DamageType, Id, SchemaVersion, StatMods } from "./common.js";
import { Effect } from "./effect.js";

const ItemBase = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string(),
  description: z.string(),
  // Jobs may equip an item when they share at least one equipTag with it.
  equipTags: z.array(z.string()).min(1),
  price: z.int().nonnegative(),
});

const Weapon = ItemBase.extend({
  slot: z.literal("weapon"),
  power: z.int().positive(),
  damageType: DamageType,
  range: z.object({ min: z.int().nonnegative(), max: z.int().positive(), vertical: z.int().nonnegative() }),
  statMods: StatMods.optional(),
});

const Armor = ItemBase.extend({
  slot: z.enum(["shield", "head", "body", "accessory"]),
  statMods: StatMods,
});

const Consumable = ItemBase.extend({
  slot: z.literal("consumable"),
  // How the item is applied. Optional: an item that omits it falls back to the
  // engine's default consumable rule (reach 0-1, single tile, self or ally).
  targeting: Targeting.optional(),
  effects: z.array(Effect).min(1),
});

export const Item = z.discriminatedUnion("slot", [Weapon, Armor, Consumable]);
export type Item = z.infer<typeof Item>;
