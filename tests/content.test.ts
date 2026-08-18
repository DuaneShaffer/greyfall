import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { objectArtFor } from "../src/art/objects.js";
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

  // FLUX_GRID §8's v1 line: five Conduit abilities, the fifth of them the
  // passive that prices the other four's draws (CONTENT_NOTES §7).
  it("the Conduit's v1 grid kit is learnable, Rated Draw included", () => {
    const conduit = jobs.get("conduit")!;
    for (const id of ["overdraw", "cross-tie", "reclose", "backfeed", "rated-draw"]) {
      expect(conduit.learnableAbilityIds, `conduit: ${id} not learnable`).toContain(id);
    }
    const rated = abilities.get("rated-draw")!;
    expect(rated.slot).toBe("support");
    expect(rated.slot === "support" ? rated.passive.gridLoadReduction : null).toBe(2);
    // In the support band the other six passives already price in.
    expect(rated.standingCost).toBeGreaterThanOrEqual(400);
    expect(rated.standingCost).toBeLessThanOrEqual(600);
  });

  /**
   * The movement tech (COMBAT_RULES §10a) is purchasable vocabulary, not a
   * default: it belongs to the two jobs whose fantasy is traversal, and no
   * shipped roster starts with either, so every authored encounter plays exactly
   * as it did before the rule existed.
   */
  it("puts the vault and the run-through on the two traversal jobs and on nobody's sheet", () => {
    const tech = { "leg-up": "saboteur", "right-of-way": "railrunner" } as const;
    for (const [abilityId, jobId] of Object.entries(tech)) {
      const ability = abilities.get(abilityId);
      expect(ability, `missing ${abilityId}`).toBeDefined();
      expect(ability!.slot).toBe("movement");
      expect(ability!.jobId).toBe(jobId);
      expect(jobs.get(jobId)!.learnableAbilityIds).toContain(abilityId);
      for (const unit of units.values()) {
        expect(unit.movementAbilityId, `${unit.id} starts with ${abilityId}`).not.toBe(abilityId);
        expect(unit.learnedAbilityIds, `${unit.id} starts with ${abilityId}`).not.toContain(abilityId);
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

  /**
   * The transition rule (`docs/design/FLUX_GRID.md` §1.6). `refinery-three`
   * already tags twelve objects against a grid nobody declares; under the
   * degeneracy rule those stay inert and correct, and are a ready-made
   * authoring hint for whoever migrates e4. So an unresolved tag warns here and
   * fails nothing — the map schema itself turns it into a hard failure the
   * moment that map declares a grid.
   */
  it("warns on a network tag no grid answers, and fails on one a gridded map leaves dangling", () => {
    const orphans: string[] = [];
    for (const map of maps.values()) {
      const declared = new Set(map.grids.map((g) => g.id));
      for (const obj of map.objects) {
        if (obj.network === undefined) continue;
        // A gridded map cannot get here: `GameMap` refuses to parse one whose
        // tags and nodes disagree, so loadAll would already have thrown.
        expect(declared.has(obj.network) || declared.size === 0).toBe(true);
        if (!declared.has(obj.network)) orphans.push(`${map.id}/${obj.id} -> ${obj.network}`);
      }
    }
    if (orphans.length > 0) {
      console.warn(`network tags against an undeclared grid (inert, not an error):\n  ${orphans.join("\n  ")}`);
    }
  });

  it("grid nodes and edges name objects on their own map", () => {
    for (const map of maps.values()) {
      const objectIds = new Set(map.objects.map((o) => o.id));
      const claimed = new Set<string>();
      for (const grid of map.grids) {
        for (const node of grid.nodes) {
          expect(objectIds.has(node.objectId), `${map.id}/${grid.id}: unknown node ${node.objectId}`).toBe(true);
          expect(claimed.has(node.objectId), `${map.id}: ${node.objectId} is a node of two grids`).toBe(false);
          claimed.add(node.objectId);
          const object = map.objects.find((o) => o.id === node.objectId)!;
          expect(object.powered, `${map.id}/${node.objectId}: a node must be electrical`).not.toBeNull();
          expect(object.network, `${map.id}/${node.objectId}: node does not name its grid`).toBe(grid.id);
        }
        const declared = new Set(grid.nodes.map((n) => n.objectId));
        for (const edge of grid.edges) {
          expect(declared.has(edge.a) && declared.has(edge.b), `${map.id}/${grid.id}: dangling edge`).toBe(true);
        }
        expect(grid.nodes.some((n) => n.role === "source"), `${map.id}/${grid.id}: no source`).toBe(true);
      }
    }
  });

  /**
   * The legibility bug `art-src/OBJECT_BRIEFS.md` opens with: `switch-board` was
   * the authored word for **both** the mains that feed a floor and the boards
   * that merely open a branch of it, and the renderer drew neither. The mains now
   * say what they are, and because `src/render` reads `spriteId` the word has to
   * keep meaning it — a board wearing `flux-main` would be drawn as a main, and a
   * board wearing a trough's art would be drawn as a wire in the floor. Every
   * delivered sheet was drawn for one job on the bus and `ObjectArtSpec.role` is
   * where that job is written down.
   */
  it("gives a delivered spriteId only to the role its art was drawn for", () => {
    const painted: string[] = [];
    for (const map of maps.values()) {
      const roleOf = new Map(map.grids.flatMap((g) => g.nodes.map((n) => [n.objectId, n.role] as const)));
      for (const obj of map.objects) {
        const art = objectArtFor(obj.spriteId);
        if (art === null) continue;
        painted.push(`${map.id}/${obj.id}`);
        expect(roleOf.get(obj.id), `${map.id}/${obj.id}: ${obj.spriteId} is a ${art.role}'s art`).toBe(art.role);
        // A `copper-500` handle on the art and nothing to touch on the map would
        // break §6's binding rule from the other end.
        if (art.operable) {
          expect(obj.operable, `${map.id}/${obj.id}: ${art.id} paints a copper-500 handle`).not.toBeNull();
        } else {
          expect(obj.operable, `${map.id}/${obj.id}: ${art.id} paints no handle`).toBeFalsy();
        }
        // The face art *is* the massing: 64 shipped columns over two tiles is the
        // ground plane's own 32 texels per world unit, and a footprint the art was
        // not drawn for would stretch the painting. A run is the exception and says
        // so — its cells tile head to tail, so the map decides how long it is.
        const xs = new Set(obj.tiles.map((t) => t.x));
        const ys = new Set(obj.tiles.map((t) => t.y));
        const along = Math.max(xs.size, ys.size);
        const across = Math.min(xs.size, ys.size);
        expect(across, `${map.id}/${obj.id} width`).toBe(art.across);
        if (art.tilesAlongRun) expect(along, `${map.id}/${obj.id} run`).toBeGreaterThanOrEqual(art.along);
        else expect(along, `${map.id}/${obj.id} footprint`).toBe(art.along);
      }
    }
    expect(painted).toEqual([
      "meter-house/west-main",
      "meter-house/west-feeder",
      "meter-house/gallery-run",
      "meter-house/sump-run",
      "meter-house/east-feeder",
      "meter-house/east-main",
    ]);
    // And nothing that is a source is still hiding behind a switchboard's word.
    for (const map of maps.values()) {
      for (const grid of map.grids) {
        for (const node of grid.nodes) {
          if (node.role !== "source") continue;
          const obj = map.objects.find((o) => o.id === node.objectId)!;
          expect(obj.spriteId, `${map.id}/${obj.id}`).not.toBe("switch-board");
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
        // A typo'd id in either of these reads as "not destroyed" / "not
        // energized" and the trigger simply never fires, which is the quietest
        // possible way for a scripted beat to go missing.
        if (trigger.when.kind === "objectDestroyed" || trigger.when.kind === "objectPowered") {
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
