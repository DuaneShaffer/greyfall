import { z } from "zod";
import { Disposition, Id, SchemaVersion } from "./common.js";

// A unit as it exists between battles (party roster or encounter roster).
// Battle-time state (position, hp, ct, statuses) lives in core GameState.
export const Unit = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string(),
  portraitId: Id.optional(),
  level: z.int().positive(),
  jobId: Id,
  secondaryJobId: Id.optional(),
  disposition: Disposition,
  learnedAbilityIds: z.array(Id),
  reactionAbilityId: Id.optional(),
  supportAbilityId: Id.optional(),
  movementAbilityId: Id.optional(),
  equipment: z
    .object({
      weapon: Id,
      shield: Id,
      head: Id,
      body: Id,
      accessory: Id,
    })
    .partial(),
});
export type Unit = z.infer<typeof Unit>;
