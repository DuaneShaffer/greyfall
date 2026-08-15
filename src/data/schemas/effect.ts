import { z } from "zod";
import { DamageType, Id, StatMods } from "./common.js";

// Damage/heal magnitude: engine computes actual value from the acting unit.
// `mag`-based amounts are Attunement-scaled on both actor and target unless
// overridden via attunementScaled.
export const Amount = z.object({
  base: z.enum(["phys", "mag", "weapon", "fixed", "maxHpPercent"]),
  power: z.int(),
  attunementScaled: z.boolean().optional(),
});
export type Amount = z.infer<typeof Amount>;

const DamageEffect = z.object({
  kind: z.literal("damage"),
  damageType: DamageType,
  amount: Amount,
});

const HealEffect = z.object({
  kind: z.literal("heal"),
  amount: Amount,
});

const ApplyStatusEffect = z.object({
  kind: z.literal("applyStatus"),
  statusId: Id,
  chance: z.int().min(1).max(100),
});

const RemoveStatusEffect = z.object({
  kind: z.literal("removeStatus"),
  statusId: Id,
});

const ForceMoveEffect = z.object({
  kind: z.literal("forceMove"),
  direction: z.enum(["push", "pull", "toward-actor-facing"]),
  distance: z.int().positive(),
});

const SetPowerEffect = z.object({
  kind: z.literal("setPower"),
  mode: z.enum(["on", "off", "toggle"]),
});

const DamageObjectEffect = z.object({
  kind: z.literal("damageObject"),
  amount: Amount,
});

const RepairObjectEffect = z.object({
  kind: z.literal("repairObject"),
  amount: Amount,
});

const SpawnObjectEffect = z.object({
  kind: z.literal("spawnObject"),
  object: z.enum(["turret", "mine", "drone"]),
  hp: z.int().positive(),
});

const ModifyChargeEffect = z.object({
  kind: z.literal("modifyCharge"),
  amount: z.int(),
  siphonToActor: z.boolean().optional(),
});

const ModifyDispositionEffect = z.object({
  kind: z.literal("modifyDisposition"),
  stat: z.enum(["resolve", "attunement"]),
  amount: z.int(),
});

const ModifyStatsEffect = z.object({
  kind: z.literal("modifyStats"),
  mods: StatMods,
  duration: z.int().positive().optional(),
});

export const Effect = z.discriminatedUnion("kind", [
  DamageEffect,
  HealEffect,
  ApplyStatusEffect,
  RemoveStatusEffect,
  ForceMoveEffect,
  SetPowerEffect,
  DamageObjectEffect,
  RepairObjectEffect,
  SpawnObjectEffect,
  ModifyChargeEffect,
  ModifyDispositionEffect,
  ModifyStatsEffect,
]);
export type Effect = z.infer<typeof Effect>;
