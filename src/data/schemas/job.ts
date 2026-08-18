import { z } from "zod";
import { Id, SchemaVersion } from "./common.js";

// Per-stat growth and multiplier, FFT-style: growth adds per level,
// multiplier scales the grown base while in this job. Move/jump/evade
// don't grow; they are per-job base values below.
const GrowStatKey = z.enum(["hp", "charge", "speed", "phys", "mag"]);
const StatCurve = z.record(GrowStatKey, z.object({ growth: z.int(), multiplierPercent: z.int().positive() }));

export const Job = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string(),
  description: z.string(),
  // jobId -> minimum job level required.
  prerequisites: z.record(Id, z.int().positive()),
  statCurve: StatCurve,
  baseMove: z.int().positive(),
  baseJump: z.int().positive(),
  baseEvade: z.int().nonnegative(),
  innateAbilityIds: z.array(Id),
  // Ability ids learnable with Standing; costs live on the abilities.
  learnableAbilityIds: z.array(Id).min(1),
  equipTags: z.array(z.string()).min(1),
});
export type Job = z.infer<typeof Job>;
