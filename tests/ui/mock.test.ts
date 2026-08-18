/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mechanicsView } from "../../src/app/mechanics.js";
import { DEFAULT_CONSUMABLE_TARGETING } from "../../src/core/index.js";
import { contentRegistry, type ContentKind } from "../../src/data/index.js";
import {
  mockAbilityMechanics,
  mockItemMechanics,
  mockSatchel,
  overloadCellAbility,
  pinAbility,
  realContent,
  cinderFlask,
  coagulantVial,
} from "../../src/ui/mock.js";

const DATA_DIR = join(import.meta.dirname, "..", "..", "data");

// The harness and the UI tests are only honest if the content they draw is the
// content that ships. This fails the moment data/*.json drifts from the mocks.
describe("mock content fidelity", () => {
  for (const [kind, records] of Object.entries(realContent) as [ContentKind, Record<string, unknown>][]) {
    for (const [id, mocked] of Object.entries(records)) {
      it(`${kind}/${id} matches the authored JSON`, () => {
        const raw = JSON.parse(readFileSync(join(DATA_DIR, kind, `${id}.json`), "utf8"));
        expect(contentRegistry[kind].parse(mocked)).toEqual(contentRegistry[kind].parse(raw));
      });
    }
  }
});

// The mocked mechanics are written out by hand, because `src/ui` does not reach
// into `src/app` for the derivation. That only stays honest if something
// re-derives them: a harness that prints figures the real screens would not is
// worse than one that prints nothing.
describe("mocked mechanics fidelity", () => {
  const STATUS_NAMES: Record<string, string> = { stunned: "Stunned", scalded: "Scalded" };
  const statusName = (statusId: string): string => STATUS_NAMES[statusId] ?? statusId;

  for (const ability of [pinAbility, overloadCellAbility]) {
    it(`abilities/${ability.id} matches the derivation the screens use`, () => {
      if (ability.slot !== "action") throw new Error(`${ability.id} is not an action ability`);
      expect(mockAbilityMechanics[ability.id]).toEqual(
        mechanicsView(
          {
            targeting: ability.targeting,
            effects: ability.effects,
            chargeCost: ability.chargeCost,
            castSpeed: ability.castSpeed,
          },
          { statusName },
        ),
      );
    });
  }

  for (const item of [coagulantVial, cinderFlask]) {
    it(`items/${item.id} matches the derivation, down to the stock left`, () => {
      if (item.slot !== "consumable") throw new Error(`${item.id} is not a consumable`);
      const stack = mockSatchel().find((entry) => entry.itemId === item.id);
      expect(stack).toBeDefined();
      expect(item.targeting).toBeDefined();
      expect(mockItemMechanics[item.id]).toEqual(
        mechanicsView(
          {
            targeting: item.targeting ?? DEFAULT_CONSUMABLE_TARGETING,
            effects: item.effects,
            chargeCost: 0,
            castSpeed: null,
          },
          { usesRemaining: Math.max(0, (stack?.count ?? 0) - 1), statusName },
        ),
      );
    });
  }

  it("hands every field-kit row the mechanics it was written for", () => {
    for (const entry of mockSatchel()) {
      expect(entry.mechanics, entry.name).toEqual(mockItemMechanics[entry.itemId]);
    }
  });
});
