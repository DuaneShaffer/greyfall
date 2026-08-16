import { describe, expect, it } from "vitest";
import { STANDING_PER_ACTION } from "../../src/core/index.js";
import { simContent } from "../../src/sim/content.js";
import { runBattle } from "../../src/sim/harness.js";
import { arenaMatchup, jobUnit } from "../../src/sim/matchup.js";
import { scriptedDuel, ttkCell } from "../../src/sim/ttk.js";

const { library } = simContent();

describe("sim telemetry", () => {
  it("every counter agrees with the event stream it was built from", () => {
    const matchup = arenaMatchup(
      library,
      "telemetry-augmented-chemist",
      [jobUnit(library, "augmented", 2, "sim-a-augmented-0"), jobUnit(library, "chemist", 2, "sim-a-chemist-1")],
      [jobUnit(library, "enforcer", 2, "sim-b-enforcer-0"), jobUnit(library, "conduit", 2, "sim-b-conduit-1")],
    );
    const record = runBattle(library, { kind: "matchup", matchup }, 31, { keepEvents: true, commandCap: 400 });
    const events = record.events!;
    expect(events.length).toBeGreaterThan(20);

    for (const unit of record.units) {
      const damageTaken = events
        .filter((e) => e.type === "DamageDealt" && e.unitId === unit.unitId)
        .reduce((n, e) => n + (e.type === "DamageDealt" ? e.amount : 0), 0);
      expect(unit.damageTaken, `${unit.unitId} damage taken`).toBe(damageTaken);

      const damageDealt = events
        .filter((e) => e.type === "DamageDealt" && e.sourceUnitId === unit.unitId && e.unitId !== unit.unitId)
        .reduce((n, e) => n + (e.type === "DamageDealt" ? e.amount : 0), 0);
      expect(unit.damageDealt, `${unit.unitId} damage dealt`).toBe(damageDealt);

      const healed = events
        .filter((e) => e.type === "Healed" && e.sourceUnitId === unit.unitId)
        .reduce((n, e) => n + (e.type === "Healed" ? e.amount : 0), 0);
      expect(unit.healingDone, `${unit.unitId} healing`).toBe(healed);

      const turns = events.filter((e) => e.type === "TurnStarted" && e.unitId === unit.unitId).length;
      expect(unit.turnsTaken, `${unit.unitId} turns`).toBe(turns);

      const misses = events.filter((e) => e.type === "AbilityMissed" && e.unitId === unit.unitId).length;
      expect(unit.attacksMissed, `${unit.unitId} misses`).toBe(misses);

      const standing = events
        .filter((e) => e.type === "StandingAwarded" && e.unitId === unit.unitId)
        .reduce((n, e) => n + (e.type === "StandingAwarded" ? e.amount : 0), 0);
      expect(unit.standingEarned, `${unit.unitId} standing`).toBe(standing);

      const resolved = events.filter((e) => e.type === "AbilityUsed" && e.unitId === unit.unitId).length;
      const counted = Object.values(unit.abilityResolutions).reduce((n, v) => n + v, 0);
      expect(counted, `${unit.unitId} ability resolutions`).toBe(resolved);

      const reactions = events.filter((e) => e.type === "ReactionTriggered" && e.unitId === unit.unitId).length;
      expect(unit.reactionsTriggered, `${unit.unitId} reactions`).toBe(reactions);

      const downed = events.some((e) => e.type === "UnitDowned" && e.unitId === unit.unitId);
      expect(unit.downed, `${unit.unitId} downed`).toBe(downed);
    }

    const totalStanding = record.units.reduce((n, u) => n + u.standingEarned, 0);
    expect(totalStanding % STANDING_PER_ACTION).toBe(0);
    expect(record.objectsDestroyed).toEqual(
      events.filter((e) => e.type === "ObjectDestroyed").map((e) => (e.type === "ObjectDestroyed" ? e.objectId : "")),
    );
  });

  it("chosen actions are counted once per command, charges included", () => {
    const matchup = arenaMatchup(
      library,
      "telemetry-conduit-enforcer",
      [jobUnit(library, "conduit", 3, "sim-a-conduit-0")],
      [jobUnit(library, "enforcer", 3, "sim-b-enforcer-0")],
    );
    const record = runBattle(library, { kind: "matchup", matchup }, 12, { keepEvents: true, commandCap: 300 });
    const events = record.events!;
    const isCharged = (abilityId: string): boolean => {
      const ability = library.abilities[abilityId];
      return ability !== undefined && ability.slot === "action" && ability.castSpeed !== null;
    };
    for (const unit of record.units) {
      const started =
        events.filter((e) => e.type === "AbilityCharging" && e.unitId === unit.unitId).length +
        events.filter((e) => e.type === "AbilityUsed" && e.unitId === unit.unitId && !isCharged(e.abilityId)).length;
      const chosen = Object.values(unit.abilityUses).reduce((n, v) => n + v, 0);
      expect(chosen, `${unit.unitId} chosen actions`).toBe(started);
    }
  });

  it("reproduces the level-1 basic attack table in docs/CONTENT_NOTES.md §6", () => {
    const expected: Record<string, number> = {
      augmented: 27,
      enforcer: 20,
      saboteur: 14,
      railrunner: 13,
      machinist: 11,
      chemist: 8,
      conduit: 2,
    };
    for (const [job, damage] of Object.entries(expected)) {
      const duel = scriptedDuel(library, job, "enforcer", 1, 5);
      expect(duel.damagePerHit, `${job} basic attack`).toBe(damage);
    }
    expect(scriptedDuel(library, "enforcer", "enforcer", 1, 5).defenderMaxHp).toBe(61);
    expect(scriptedDuel(library, "enforcer", "conduit", 1, 5).defenderMaxHp).toBe(39);
    expect(ttkCell(library, "enforcer", "enforcer", 1, [1, 2, 3]).hitsToDown).toBe(4);
    expect(ttkCell(library, "enforcer", "conduit", 1, [1, 2, 3]).hitsToDown).toBe(2);
  });

  it("counts a scripted duel's swings exactly", () => {
    const duel = scriptedDuel(library, "enforcer", "enforcer", 1, 5);
    expect(duel.hits + duel.misses).toBe(duel.attacks);
    expect(duel.totalDamage).toBe(duel.hits * duel.damagePerHit);
    expect(duel.downed).toBe(true);
    expect(duel.hits).toBe(4);
  });
});
