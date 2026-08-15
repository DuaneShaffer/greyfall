/**
 * Node-side content load for the balance simulator. The browser reads `data/`
 * through Vite's glob (`src/app/content.ts`); the sim reads the same files off
 * disk so it can run headless under vitest.
 *
 * Directories are globbed, never hand-listed: `data/encounters` and
 * `data/units` grow under this workstream. A file that fails its schema is
 * skipped and recorded rather than thrown, so one half-authored encounter does
 * not take the whole sweep down.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

export interface SimContent {
  library: ContentLibrary;
  units: Record<string, Unit>;
  campaigns: Record<string, Campaign>;
  /** `kind/file: reason` for everything that would not parse. */
  skipped: string[];
}

export function dataDir(): string {
  return join(import.meta.dirname, "..", "..", "data");
}

function loadDir<T extends { id: string }>(
  root: string,
  kind: ContentKind,
  schema: { parse: (value: unknown) => T },
  skipped: string[],
): Record<string, T> {
  const out: Record<string, T> = {};
  let files: string[];
  try {
    files = readdirSync(join(root, kind)).sort();
  } catch {
    skipped.push(`${kind}: directory missing`);
    return out;
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = schema.parse(JSON.parse(readFileSync(join(root, kind, file), "utf8")));
      out[parsed.id] = parsed;
    } catch (err) {
      skipped.push(`${kind}/${file}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
  }
  return out;
}

export function loadContent(root: string = dataDir()): SimContent {
  const skipped: string[] = [];
  const library: ContentLibrary = {
    jobs: loadDir(root, "jobs", Job, skipped),
    abilities: loadDir(root, "abilities", Ability, skipped),
    items: loadDir(root, "items", Item, skipped),
    statuses: loadDir(root, "statuses", Status, skipped),
    maps: loadDir(root, "maps", GameMap, skipped),
    encounters: loadDir(root, "encounters", Encounter, skipped),
  };
  return {
    library,
    units: loadDir(root, "units", Unit, skipped),
    campaigns: loadDir(root, "campaigns", Campaign, skipped),
    skipped,
  };
}

let cached: SimContent | null = null;

/** Parsed once per process; the sweeps call this thousands of times. */
export function simContent(): SimContent {
  if (cached === null) cached = loadContent();
  return cached;
}

/** A library with extra maps and encounters folded in, leaving the original untouched. */
export function withContent(
  library: ContentLibrary,
  extra: { maps?: readonly GameMap[]; encounters?: readonly Encounter[]; jobs?: readonly Job[]; items?: readonly Item[] },
): ContentLibrary {
  const maps = { ...library.maps };
  for (const map of extra.maps ?? []) maps[map.id] = map;
  const encounters = { ...library.encounters };
  for (const enc of extra.encounters ?? []) encounters[enc.id] = enc;
  const jobs = { ...library.jobs };
  for (const job of extra.jobs ?? []) jobs[job.id] = job;
  const items = { ...library.items };
  for (const item of extra.items ?? []) items[item.id] = item;
  return { ...library, maps, encounters, jobs, items };
}
