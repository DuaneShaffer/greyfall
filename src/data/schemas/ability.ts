import { z } from "zod";
import { Id, SchemaVersion, StatMods } from "./common.js";
import { Effect } from "./effect.js";

export const Targeting = z.object({
  range: z.object({
    min: z.int().nonnegative(),
    max: z.int().positive(),
    // Max height difference (in height units) between actor and target tile.
    vertical: z.int().nonnegative(),
  }),
  area: z.discriminatedUnion("shape", [
    z.object({ shape: z.literal("single") }),
    z.object({ shape: z.literal("radius"), size: z.int().positive(), vertical: z.int().nonnegative() }),
    z.object({ shape: z.literal("line"), length: z.int().positive() }),
  ]),
  requiresLos: z.boolean(),
  validTargets: z.array(z.enum(["enemy", "ally", "self", "object", "emptyTile"])).min(1),
});
export type Targeting = z.infer<typeof Targeting>;

const AbilityBase = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string(),
  description: z.string(),
  jobId: Id,
  standingCost: z.int().nonnegative(),
});

// Battlefield conditions an ability needs beyond flux and HP. `railUnderfoot`
// and `adjacentPoweredObject` read the actor's tile; `targetPowered` reads what
// the ability is aimed at.
export const AbilityRequirement = z.enum([
  "railUnderfoot",
  "adjacentPoweredObject",
  "targetPowered",
]);
export type AbilityRequirement = z.infer<typeof AbilityRequirement>;

const ActionAbility = AbilityBase.extend({
  slot: z.literal("action"),
  targeting: Targeting,
  requires: z.array(AbilityRequirement).min(1).optional(),
  chargeCost: z.int().nonnegative(),
  hpCost: z.int().nonnegative().optional(),
  // null = instant; otherwise CT-style cast speed (higher resolves sooner).
  castSpeed: z.int().positive().nullable(),
  effects: z.array(Effect).min(1),
});

const ReactionAbility = AbilityBase.extend({
  slot: z.literal("reaction"),
  // Trigger rate scales with Resolve.
  trigger: z.enum(["damaged", "targetedByAction", "hpCritical", "allyDowned"]),
  effects: z.array(Effect).min(1),
});

const SupportAbility = AbilityBase.extend({
  slot: z.literal("support"),
  passive: z
    .object({
      statMods: StatMods,
      ignoreHeightPenalty: z.boolean(),
      // Item mastery, the two halves the Chemist's bench buys: potency scales a
      // consumable's damage and heal power, reach extends how far it is thrown.
      consumableEffectBonusPercent: z.int(),
      consumableRangeBonus: z.int().nonnegative(),
    })
    .partial(),
});

const MovementAbility = AbilityBase.extend({
  slot: z.literal("movement"),
  passive: z
    .object({
      statMods: StatMods,
      railMoveMultiplier: z.int().positive(),
      ignoresHazardTiles: z.boolean(),
      moveThroughEnemies: z.boolean(),
    })
    .partial(),
});

export const Ability = z.discriminatedUnion("slot", [
  ActionAbility,
  ReactionAbility,
  SupportAbility,
  MovementAbility,
]);
export type Ability = z.infer<typeof Ability>;
