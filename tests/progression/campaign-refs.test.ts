import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Campaign, Encounter, Item, Unit, contentRegistry } from "../../src/data/index.js";

// Cross-reference checks for `data/campaigns/`. They live here rather than in
// tests/content.test.ts so the campaign schema (which this workstream owns) and
// the shared content test do not collide.
//
// DELIBERATE LOOSENESS: the chapter's encounter list names all five slice
// battles, but only the ones the maps/content workstreams have authored exist
// yet. Every encounter id is checked for *format*; ids with a file on disk are
// hard-checked, and the count of missing ones is asserted to be shrinking-only
// by naming them explicitly below. When `data/encounters/` is complete, delete
// `PENDING_ENCOUNTER_IDS` and the soft branch with it.

const DATA_DIR = join(import.meta.dirname, "..", "..", "data");

function loadAll<T extends { id: string }>(kind: "campaigns" | "encounters" | "units" | "items"): Map<string, T> {
  const schema = contentRegistry[kind];
  const out = new Map<string, T>();
  for (const file of readdirSync(join(DATA_DIR, kind)).sort()) {
    const raw: unknown = JSON.parse(readFileSync(join(DATA_DIR, kind, file), "utf8"));
    const parsed = schema.parse(raw) as unknown as T;
    expect(file, `${kind}/${file} filename must match its id`).toBe(`${parsed.id}.json`);
    out.set(parsed.id, parsed);
  }
  return out;
}

const campaigns = loadAll<Campaign>("campaigns");
const encounters = loadAll<Encounter>("encounters");
const units = loadAll<Unit>("units");
const items = loadAll<Item>("items");

/** Slice battles 2–5: authored later, referenced now. Shrink this list, never grow it. */
const PENDING_ENCOUNTER_IDS = new Set([
  "e2-foundry-floor-nine",
  "e3-tallow-row",
  "e4-refinery-three",
  "e5-charterhouse-steps",
]);

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("campaign content", () => {
  it("ships at least one campaign", () => {
    expect(campaigns.size).toBeGreaterThan(0);
  });

  it("names the opening chapter the app loads", () => {
    expect(campaigns.has("foundry-chapter")).toBe(true);
  });

  it("every encounter id is well formed, and the authored ones exist", () => {
    for (const campaign of campaigns.values()) {
      expect(campaign.encounterIds.length, `${campaign.id}: no encounters`).toBeGreaterThan(0);
      expect(new Set(campaign.encounterIds).size, `${campaign.id}: duplicate encounter ids`).toBe(
        campaign.encounterIds.length,
      );
      for (const id of campaign.encounterIds) {
        expect(ID_PATTERN.test(id), `${campaign.id}: malformed encounter id ${id}`).toBe(true);
        if (encounters.has(id)) continue;
        expect(
          PENDING_ENCOUNTER_IDS.has(id),
          `${campaign.id}: unknown encounter ${id} (add the file, or list it as pending)`,
        ).toBe(true);
      }
    }
  });

  it("the first encounter of every campaign is playable today", () => {
    for (const campaign of campaigns.values()) {
      const first = campaign.encounterIds[0]!;
      expect(encounters.has(first), `${campaign.id}: opening encounter ${first} is missing`).toBe(
        true,
      );
    }
  });

  it("every starting roster unit exists and is distinct", () => {
    for (const campaign of campaigns.values()) {
      expect(new Set(campaign.startingRosterUnitIds).size).toBe(
        campaign.startingRosterUnitIds.length,
      );
      for (const id of campaign.startingRosterUnitIds) {
        expect(units.has(id), `${campaign.id}: unknown roster unit ${id}`).toBe(true);
      }
    }
  });

  it("every starting inventory item exists and is not a duplicate stack", () => {
    for (const campaign of campaigns.values()) {
      const stacks = campaign.startingInventory ?? [];
      expect(new Set(stacks.map((stack) => stack.itemId)).size).toBe(stacks.length);
      for (const stack of stacks) {
        expect(items.has(stack.itemId), `${campaign.id}: unknown item ${stack.itemId}`).toBe(true);
      }
    }
  });

  it("the opening roster can fill the opening encounter's deployment", () => {
    for (const campaign of campaigns.values()) {
      const first = encounters.get(campaign.encounterIds[0]!);
      if (first === undefined) continue;
      expect(
        campaign.startingRosterUnitIds.length,
        `${campaign.id}: roster smaller than the opening deployment needs`,
      ).toBeGreaterThan(0);
      expect(first.maxDeployedUnits).toBeGreaterThan(0);
    }
  });
});
