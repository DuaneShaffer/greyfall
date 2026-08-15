// Browser content load: every file under `data/` pulled in by directory glob
// and validated with its zod schema, so malformed content fails at startup
// rather than mid-battle. Node-side callers (tests, sim) read the same files
// off disk.
//
// Globbing rather than hand-listing is deliberate: the content workstream adds
// jobs, abilities, items, statuses, and units continuously, and nothing here
// should need editing when it does.

import type { ContentLibrary } from "../core/index.js";
import {
  Ability,
  Campaign,
  Encounter,
  GameMap,
  Item,
  Job,
  Status,
  Unit,
  type ContentKind,
} from "../data/index.js";

type Loaded = Record<string, unknown>;

const MODULES: Record<ContentKind, Loaded> = {
  jobs: import.meta.glob("../../data/jobs/*.json", { eager: true, import: "default" }),
  abilities: import.meta.glob("../../data/abilities/*.json", { eager: true, import: "default" }),
  items: import.meta.glob("../../data/items/*.json", { eager: true, import: "default" }),
  statuses: import.meta.glob("../../data/statuses/*.json", { eager: true, import: "default" }),
  units: import.meta.glob("../../data/units/*.json", { eager: true, import: "default" }),
  maps: import.meta.glob("../../data/maps/*.json", { eager: true, import: "default" }),
  encounters: import.meta.glob("../../data/encounters/*.json", { eager: true, import: "default" }),
  campaigns: import.meta.glob("../../data/campaigns/*.json", { eager: true, import: "default" }),
};

/** Parse a directory into an id-keyed record, in path order for determinism. */
function parseDir<T extends { id: string }>(
  kind: ContentKind,
  schema: { parse: (value: unknown) => T },
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const path of Object.keys(MODULES[kind]).sort()) {
    const parsed = schema.parse(MODULES[kind][path]);
    out[parsed.id] = parsed;
  }
  return out;
}

export const CONTENT: ContentLibrary = {
  jobs: parseDir("jobs", Job),
  abilities: parseDir("abilities", Ability),
  items: parseDir("items", Item),
  statuses: parseDir("statuses", Status),
  maps: parseDir("maps", GameMap),
  encounters: parseDir("encounters", Encounter),
};

/** Roster unit definitions — the campaign's seed, not part of `ContentLibrary`. */
export const UNITS: Record<string, Unit> = parseDir("units", Unit);

export const CAMPAIGNS: Record<string, Campaign> = parseDir("campaigns", Campaign);

export const OPENING_CAMPAIGN_ID = "foundry-chapter";

export function openingCampaign(): Campaign {
  const campaign = CAMPAIGNS[OPENING_CAMPAIGN_ID];
  if (campaign === undefined) {
    throw new Error(`missing data/campaigns/${OPENING_CAMPAIGN_ID}.json`);
  }
  return campaign;
}
