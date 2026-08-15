import type { z } from "zod";
import { Ability } from "./schemas/ability.js";
import { Campaign } from "./schemas/campaign.js";
import { Encounter } from "./schemas/encounter.js";
import { GameMap } from "./schemas/map.js";
import { Item } from "./schemas/item.js";
import { Job } from "./schemas/job.js";
import { Status } from "./schemas/status.js";
import { Unit } from "./schemas/unit.js";

export * from "./schemas/common.js";
export * from "./schemas/effect.js";
export { Ability, Targeting } from "./schemas/ability.js";
export { Campaign, type InventoryEntry } from "./schemas/campaign.js";
export { Encounter } from "./schemas/encounter.js";
export { GameMap, MapObject, MapObjectKind, TerrainType, Tile } from "./schemas/map.js";
export { Item } from "./schemas/item.js";
export { Job } from "./schemas/job.js";
export { Status } from "./schemas/status.js";
export { Unit } from "./schemas/unit.js";

// data/<directory> -> schema for every file in it.
export const contentRegistry = {
  jobs: Job,
  abilities: Ability,
  items: Item,
  statuses: Status,
  units: Unit,
  maps: GameMap,
  encounters: Encounter,
  campaigns: Campaign,
} satisfies Record<string, z.ZodType>;
export type ContentKind = keyof typeof contentRegistry;
