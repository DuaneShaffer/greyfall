import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  Ability,
  Encounter,
  GameMap,
  Item,
  Job,
  Status,
  Unit,
  contentRegistry,
  type ContentKind,
} from "../src/data/index.js";

const DATA_DIR = join(import.meta.dirname, "..", "data");

function loadAll<T>(kind: ContentKind): Map<string, T> {
  const schema = contentRegistry[kind];
  const out = new Map<string, T>();
  for (const file of readdirSync(join(DATA_DIR, kind)).sort()) {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, kind, file), "utf8"));
    const parsed = schema.parse(raw) as unknown as T & { id: string };
    expect(file, `${kind}/${file} filename must match its id`).toBe(`${parsed.id}.json`);
    expect(out.has(parsed.id), `duplicate id ${parsed.id} in ${kind}`).toBe(false);
    out.set(parsed.id, parsed);
  }
  return out;
}

const jobs = loadAll<Job>("jobs");
const abilities = loadAll<Ability>("abilities");
const items = loadAll<Item>("items");
const statuses = loadAll<Status>("statuses");
const units = loadAll<Unit>("units");
const maps = loadAll<GameMap>("maps");
const encounters = loadAll<Encounter>("encounters");

function collectStatusRefs(value: unknown, found: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectStatusRefs(v, found);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj["kind"] === "applyStatus" || obj["kind"] === "removeStatus") {
      found.push(obj["statusId"] as string);
    }
    for (const v of Object.values(obj)) collectStatusRefs(v, found);
  }
}

function expectUnitRefs(unit: Unit, context: string): void {
  expect(jobs.has(unit.jobId), `${context}: unknown job ${unit.jobId}`).toBe(true);
  if (unit.secondaryJobId) expect(jobs.has(unit.secondaryJobId), context).toBe(true);
  const abilityRefs = [
    ...unit.learnedAbilityIds,
    unit.reactionAbilityId,
    unit.supportAbilityId,
    unit.movementAbilityId,
  ].filter((id): id is string => id !== undefined);
  for (const id of abilityRefs) {
    expect(abilities.has(id), `${context}: unknown ability ${id}`).toBe(true);
  }
  for (const id of Object.values(unit.equipment)) {
    if (id !== undefined) expect(items.has(id), `${context}: unknown item ${id}`).toBe(true);
  }
}

describe("content cross-references", () => {
  it("no ability claims the engine-reserved basic-attack id", () => {
    expect(abilities.has("basic-attack")).toBe(false);
  });

  // `getAbility` resolves `item:<id>` to a synthesized consumable ability, so
  // the colon has to stay out of authored ids. The `Id` regex already forbids
  // it; this guards the reason.
  it("no ability or item id reaches into the item: namespace", () => {
    for (const id of [...abilities.keys(), ...items.keys()]) {
      expect(id.includes(":"), `${id} collides with the synthesized item namespace`).toBe(false);
    }
  });

  it("every consumable says how it is applied and who is issued it", () => {
    for (const item of items.values()) {
      if (item.slot !== "consumable") continue;
      expect(item.targeting, `${item.id}: no targeting authored`).toBeDefined();
      const validTargets = item.targeting?.validTargets ?? [];
      expect(validTargets.length, `${item.id}: no valid targets`).toBeGreaterThan(0);
      expect(item.equipTags.length, `${item.id}: nobody is issued it`).toBeGreaterThan(0);
      const issued = [...jobs.values()].some((job) =>
        item.equipTags.some((tag) => job.equipTags.includes(tag)),
      );
      expect(issued, `${item.id}: no job carries any of ${item.equipTags.join(", ")}`).toBe(true);
    }
  });

  it("encounter satchels name consumables that exist", () => {
    for (const enc of encounters.values()) {
      for (const stack of enc.enemySatchel ?? []) {
        const item = items.get(stack.itemId);
        expect(item, `${enc.id}: unknown satchel item ${stack.itemId}`).toBeDefined();
        expect(item!.slot, `${enc.id}: ${stack.itemId} is not a consumable`).toBe("consumable");
      }
    }
  });

  it("abilities reference existing jobs and statuses", () => {
    for (const ability of abilities.values()) {
      expect(jobs.has(ability.jobId), `${ability.id}: unknown job ${ability.jobId}`).toBe(true);
      const refs: string[] = [];
      collectStatusRefs(ability, refs);
      for (const id of refs) {
        expect(statuses.has(id), `${ability.id}: unknown status ${id}`).toBe(true);
      }
    }
  });

  it("jobs reference existing abilities", () => {
    for (const job of jobs.values()) {
      for (const id of [...job.innateAbilityIds, ...job.learnableAbilityIds]) {
        expect(abilities.has(id), `${job.id}: unknown ability ${id}`).toBe(true);
        expect(abilities.get(id)!.jobId, `${job.id}: ${id} belongs to another job`).toBe(job.id);
      }
    }
  });

  it("units reference existing jobs, abilities, and items", () => {
    for (const unit of units.values()) expectUnitRefs(unit, unit.id);
  });

  it("map object references and tile bounds are valid", () => {
    for (const map of maps.values()) {
      const objectIds = new Set(map.objects.map((o) => o.id));
      expect(objectIds.size, `${map.id}: duplicate object ids`).toBe(map.objects.length);
      const inBounds = ({ x, y }: { x: number; y: number }) => x < map.width && y < map.depth;
      for (const coord of map.deploymentTiles) {
        expect(inBounds(coord), `${map.id}: deployment tile out of bounds`).toBe(true);
      }
      for (const obj of map.objects) {
        for (const coord of obj.tiles) {
          expect(inBounds(coord), `${map.id}/${obj.id}: tile out of bounds`).toBe(true);
        }
        for (const id of obj.operable?.targetObjectIds ?? []) {
          expect(objectIds.has(id), `${map.id}/${obj.id}: unknown target object ${id}`).toBe(true);
        }
        const refs: string[] = [];
        collectStatusRefs(obj, refs);
        for (const id of refs) {
          expect(statuses.has(id), `${map.id}/${obj.id}: unknown status ${id}`).toBe(true);
        }
      }
    }
  });

  // `checkContact` applies the payload with no acting unit, so a `phys`/`mag`/
  // `weapon` amount resolves to 0 and the mine is silently inert. `autoAttack`
  // is the opposite: it resolves against the deploying unit, so it may scale.
  it("contact payloads use caster-free amounts", () => {
    for (const ability of abilities.values()) {
      if (ability.slot !== "action") continue;
      for (const effect of ability.effects) {
        if (effect.kind !== "spawnObject" || effect.onContact === undefined) continue;
        for (const payload of effect.onContact.effects) {
          if (payload.kind !== "damage" && payload.kind !== "heal") continue;
          expect(
            ["fixed", "maxHpPercent"],
            `${ability.id}: onContact ${payload.kind} base "${payload.amount.base}" resolves to 0 without a caster`,
          ).toContain(payload.amount.base);
        }
      }
    }
  });

  it("triggers that move or remove a unit name one the encounter places", () => {
    for (const enc of encounters.values()) {
      const placed = new Set(enc.enemies.map((p) => p.unit.id));
      for (const trigger of enc.triggers) {
        for (const action of trigger.actions) {
          if (action.kind === "spawnUnits") {
            for (const p of action.units) placed.add(p.unit.id);
          }
        }
      }
      for (const trigger of enc.triggers) {
        for (const action of trigger.actions) {
          if (action.kind !== "moveUnit" && action.kind !== "removeUnit") continue;
          expect(
            placed.has(action.unitId),
            `${enc.id}/${trigger.id}: ${action.kind} names ${action.unitId}, which the encounter never places`,
          ).toBe(true);
        }
      }
    }
  });

  it("an afterTriggerId names a trigger in the same encounter", () => {
    for (const enc of encounters.values()) {
      const ids = new Set(enc.triggers.map((trigger) => trigger.id));
      for (const trigger of enc.triggers) {
        if (trigger.afterTriggerId === undefined) continue;
        expect(
          ids.has(trigger.afterTriggerId),
          `${enc.id}/${trigger.id}: waits on ${trigger.afterTriggerId}, which the encounter has no trigger for`,
        ).toBe(true);
        expect(
          trigger.afterTriggerId !== trigger.id,
          `${enc.id}/${trigger.id}: waits on itself`,
        ).toBe(true);
      }
    }
  });

  it("encounters reference existing maps, units, and objects", () => {
    for (const enc of encounters.values()) {
      const map = maps.get(enc.mapId);
      expect(map, `${enc.id}: unknown map ${enc.mapId}`).toBeDefined();
      const objectIds = new Set(map!.objects.map((o) => o.id));
      const inBounds = ({ x, y }: { x: number; y: number }) => x < map!.width && y < map!.depth;

      for (const placed of enc.enemies) {
        expectUnitRefs(placed.unit, `${enc.id}/${placed.unit.id}`);
        expect(inBounds(placed.position), `${enc.id}/${placed.unit.id}: position out of bounds`).toBe(true);
      }
      for (const trigger of enc.triggers) {
        if (trigger.when.kind === "objectDestroyed") {
          expect(objectIds.has(trigger.when.objectId), `${enc.id}/${trigger.id}`).toBe(true);
        }
        for (const action of trigger.actions) {
          if (action.kind === "setPower" || action.kind === "destroyObject") {
            expect(objectIds.has(action.objectId), `${enc.id}/${trigger.id}`).toBe(true);
          }
          if (action.kind === "spawnUnits") {
            for (const placed of action.units) {
              expectUnitRefs(placed.unit, `${enc.id}/${trigger.id}/${placed.unit.id}`);
              expect(inBounds(placed.position), `${enc.id}/${trigger.id}: spawn out of bounds`).toBe(true);
            }
          }
        }
      }
    }
  });
});
