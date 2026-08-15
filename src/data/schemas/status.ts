import { z } from "zod";
import { DamageType, Id, SchemaVersion, StatMods } from "./common.js";

export const Status = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string(),
  description: z.string(),
  category: z.enum(["buff", "debuff"]),
  duration: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("turns"), turns: z.int().positive() }),
    z.object({ kind: z.literal("untilRemoved") }),
  ]),
  hooks: z
    .object({
      preventsAction: z.boolean(),
      preventsMove: z.boolean(),
      preventsReaction: z.boolean(),
      statMods: StatMods,
      tickDamage: z.object({ damageType: DamageType, amount: z.int().positive() }),
      ctMultiplierPercent: z.int().positive(),
    })
    .partial(),
});
export type Status = z.infer<typeof Status>;
