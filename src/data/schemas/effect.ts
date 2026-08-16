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

// Repositions the acting unit itself, unlike forceMove which moves the units in
// the area. `toward-target`/`away-from-target` are measured against the first
// tile of the ability's area; `forward` follows the actor's facing.
const MoveSelfEffect = z.object({
  kind: z.literal("moveSelf"),
  direction: z.enum(["toward-target", "away-from-target", "forward"]),
  distance: z.int().positive(),
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

// A timed draw hung on a grid node. Flat and never Attunement-scaled: a player
// reading `LOAD 11/12` must be able to conclude that +8 trips it without
// computing the caster's Mag first.
const AddLoadEffect = z.object({
  kind: z.literal("addLoad"),
  amount: z.int().positive(),
  // The caster's own turns, the clock statuses and `modifyStats` already use.
  durationTurns: z.int().positive(),
});

// The reversible cut, and its undo. Destruction is the permanent verb and stays
// `damageObject`.
const SeverLineEffect = z.object({
  kind: z.literal("severLine"),
  mode: z.enum(["sever", "splice"]),
});

// Every effect except `spawnObject`. A deployable's payload is drawn from this
// set so the union stays non-recursive: a mine cannot lay another mine.
const PAYLOAD_EFFECTS = [
  DamageEffect,
  HealEffect,
  ApplyStatusEffect,
  RemoveStatusEffect,
  ForceMoveEffect,
  MoveSelfEffect,
  SetPowerEffect,
  DamageObjectEffect,
  RepairObjectEffect,
  ModifyChargeEffect,
  ModifyDispositionEffect,
  ModifyStatsEffect,
  AddLoadEffect,
  SeverLineEffect,
] as const;

export const PayloadEffect = z.discriminatedUnion("kind", PAYLOAD_EFFECTS);
export type PayloadEffect = z.infer<typeof PayloadEffect>;

// What a deployable does when a unit steps into its footprint. Mines: the
// payload fires and the object destroys itself. Never fires for the team that
// deployed it.
export const ContactPayload = z.object({
  effects: z.array(PayloadEffect).min(1),
  destroysSelf: z.boolean().optional(),
});
export type ContactPayload = z.infer<typeof ContactPayload>;

// What a deployable shoots with. It rides its own CT timeline at `speed` and
// fires at the nearest enemy of its owning team inside `range`.
export const AutoAttack = z.object({
  amount: Amount,
  damageType: DamageType,
  range: z.object({
    min: z.int().nonnegative(),
    max: z.int().positive(),
    vertical: z.int().nonnegative(),
  }),
  requiresLos: z.boolean().optional(),
  speed: z.int().positive(),
});
export type AutoAttack = z.infer<typeof AutoAttack>;

const SpawnObjectEffect = z.object({
  kind: z.literal("spawnObject"),
  object: z.enum(["turret", "mine", "drone"]),
  hp: z.int().positive(),
  onContact: ContactPayload.optional(),
  attack: AutoAttack.optional(),
});

export const Effect = z.discriminatedUnion("kind", [...PAYLOAD_EFFECTS, SpawnObjectEffect]);
export type Effect = z.infer<typeof Effect>;
