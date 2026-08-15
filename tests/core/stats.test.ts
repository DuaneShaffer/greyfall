import { describe, expect, it } from "vitest";
import { deriveStats, equippedItems, STAT_BASE } from "../../src/core/index.js";
import type { Item, StatMods } from "../../src/data/index.js";
import { VALE, loadContent, rowen } from "./fixtures.js";

const content = loadContent();

function armor(statMods: StatMods): Item {
  return {
    schemaVersion: 1,
    id: "test-plating",
    name: "Test Plating",
    description: "Bench-test rig, not issued.",
    equipTags: ["heavy-armor"],
    price: 0,
    slot: "body",
    statMods,
  };
}

function job(id: string) {
  const found = content.jobs[id];
  if (found === undefined) throw new Error(`missing job ${id}`);
  return found;
}

describe("deriveStats", () => {
  it("derives Rowen's level-1 Enforcer line exactly", () => {
    const unit = rowen();
    const stats = deriveStats(unit, job("enforcer"), equippedItems(unit, content.items));
    // (40 + 11) * 120% = 61, (8 + 2) * 70% = 7, (2 + 4) * 100% = 6,
    // (0 + 8) * 115% = 9, (0 + 2) * 75% = 1; move/jump/evade are job flats.
    expect(stats).toEqual({ hp: 61, charge: 7, speed: 6, phys: 9, mag: 1, move: 3, jump: 2, evade: 8 });
  });

  it("derives a level-1 Conduit line exactly", () => {
    const stats = deriveStats(VALE, job("conduit"), equippedItems(VALE, content.items));
    expect(stats).toEqual({ hp: 39, charge: 22, speed: 6, phys: 2, mag: 10, move: 3, jump: 1, evade: 5 });
  });

  it("scales with level through the job growth curve", () => {
    const unit = { ...rowen(), level: 5 };
    const stats = deriveStats(unit, job("enforcer"), []);
    expect(stats.hp).toBe(Math.floor(((STAT_BASE.hp + 11 * 5) * 120) / 100));
    expect(stats.phys).toBe(Math.floor((8 * 5 * 115) / 100));
  });

  it("applies equipment stat mods after the job curve", () => {
    const unit = rowen();
    const bare = deriveStats(unit, job("enforcer"), []);
    const plated = deriveStats(unit, job("enforcer"), [armor({ hp: 10, evade: -3 })]);
    expect(plated.hp).toBe(bare.hp + 10);
    expect(plated.evade).toBe(bare.evade - 3);
  });

  it("clamps stats to their minimums", () => {
    const unit = rowen();
    const stats = deriveStats(unit, job("enforcer"), [armor({ move: -99, evade: -99, hp: -9999 })]);
    expect(stats.move).toBe(1);
    expect(stats.evade).toBe(0);
    expect(stats.hp).toBe(1);
  });
});
