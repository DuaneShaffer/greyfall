import { z } from "zod";

export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const SchemaVersion = z.literal(1);

export const TileCoord = z.object({ x: z.int().nonnegative(), y: z.int().nonnegative() });
export type TileCoord = z.infer<typeof TileCoord>;

export const Facing = z.enum(["north", "east", "south", "west"]);
export type Facing = z.infer<typeof Facing>;

export const Team = z.enum(["player", "enemy", "neutral"]);
export type Team = z.infer<typeof Team>;

export const DamageType = z.enum(["kinetic", "arc", "thermal", "chemical"]);
export type DamageType = z.infer<typeof DamageType>;

// Core stat keys. `charge` is the MP analog: carried flux a unit can spend.
export const StatKey = z.enum(["hp", "charge", "speed", "phys", "mag", "move", "jump", "evade"]);
export type StatKey = z.infer<typeof StatKey>;

export const StatMods = z.partialRecord(StatKey, z.int());
export type StatMods = z.infer<typeof StatMods>;

// Hidden pair (Brave/Faith analog), 0–100.
export const Disposition = z.object({
  resolve: z.int().min(0).max(100),
  attunement: z.int().min(0).max(100),
});
export type Disposition = z.infer<typeof Disposition>;

export const DialogueLine = z.object({
  speaker: z.string(),
  portraitId: Id.optional(),
  text: z.string(),
});
export type DialogueLine = z.infer<typeof DialogueLine>;
