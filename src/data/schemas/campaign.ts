import { z } from "zod";
import { Id, ItemStack, SchemaVersion } from "./common.js";

const InventoryEntry = ItemStack;
export type InventoryEntry = z.infer<typeof InventoryEntry>;

// A chapter: the ordered encounter list the campaign loop walks, plus the
// party and kit it opens with. Deliberately thin — everything that changes
// during play lives in CampaignState, never here.
export const Campaign = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string(),
  description: z.string(),
  // Played in order; the campaign's progress marker is an index into this list.
  encounterIds: z.array(Id).min(1),
  startingRosterUnitIds: z.array(Id).min(1),
  // Standing granted to each starting roster unit, banked in its primary job.
  startingStandingBonus: z.int().nonnegative().optional(),
  startingInventory: z.array(InventoryEntry).optional(),
});
export type Campaign = z.infer<typeof Campaign>;
