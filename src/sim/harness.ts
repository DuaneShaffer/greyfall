/**
 * AI-versus-AI battle runner. `chooseCommand` speaks for whoever is taking a
 * turn, so both teams are driven by the same search and the only thing that
 * varies between runs is the encounter's `rngSeed`.
 *
 * The AI bounds hesitation, not battle length (`docs/AI_DESIGN.md` §Stalemate),
 * so every run carries a hard command cap; hitting it is reported as a
 * `stalemate` outcome rather than a crash.
 */

import {
  applyCommand,
  createBattle,
  activeTurnState,
  allUnits,
  battleClock,
  battleResult,
  turnNumber,
  unitMaxCharge,
  unitMaxHp,
  type BattleEvent,
  type Command,
  type ContentLibrary,
  type Deployment,
  type GameState,
} from "../core/index.js";
import { chooseCommand, WEIGHTS, type AiWeights } from "../core/ai/index.js";
import type { Encounter, GameMap, Team, Unit } from "../data/index.js";
import { withContent } from "./content.js";
import type { Matchup } from "./matchup.js";

export const DEFAULT_COMMAND_CAP = 1200;

export type BattleTarget =
  | { kind: "encounter"; encounterId: string; party: readonly Unit[]; deployment: readonly Deployment[] }
  | { kind: "matchup"; matchup: Matchup };

export interface RunOptions {
  /** Commands applied before the run is abandoned as a stalemate. */
  commandCap?: number;
  weights?: AiWeights;
  /** Keep the full event stream on the record. Off by default: sweeps run thousands of battles. */
  keepEvents?: boolean;
}

export interface UnitRecord {
  unitId: string;
  team: Team;
  jobId: string;
  level: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  healingReceived: number;
  objectDamage: number;
  objectsDestroyed: number;
  objectsOperated: number;
  /** Actions the AI *chose*, keyed by ability id; a charged cast counts once, at cast time. */
  abilityUses: Record<string, number>;
  /** Actions that actually resolved on the field (a charge lands here, not above). */
  abilityResolutions: Record<string, number>;
  reactionsTriggered: number;
  attacksLanded: number;
  attacksMissed: number;
  kills: number;
  standingEarned: number;
  turnsTaken: number;
  commands: number;
  maxHp: number;
  hp: number;
  maxCharge: number;
  charge: number;
  /** Lowest flux the unit ever held. Equal to `maxCharge` when it never spent any. */
  minCharge: number;
  fluxSpent: number;
  downed: boolean;
  downedAtTurn: number | null;
}

export interface BattleRecord {
  id: string;
  encounterId: string;
  mapId: string;
  seed: number;
  outcome: "win" | "loss" | "stalemate";
  /** Which team was left standing; `none` on a stalemate or a turn-limit loss. */
  winner: Team | "none";
  turns: number;
  clock: number;
  commands: number;
  capped: boolean;
  /** `state.turn` when the first unit went down, or null if none did. */
  firstDownTurn: number | null;
  objectsDestroyed: string[];
  rejectedCommands: number;
  elapsedMs: number;
  units: UnitRecord[];
  events: BattleEvent[] | null;
}

function blankUnit(state: GameState, unitId: string): UnitRecord {
  const unit = allUnits(state).find((u) => u.id === unitId)!;
  return {
    unitId,
    team: unit.team,
    jobId: unit.unit.jobId,
    level: unit.unit.level,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    healingReceived: 0,
    objectDamage: 0,
    objectsDestroyed: 0,
    objectsOperated: 0,
    abilityUses: {},
    abilityResolutions: {},
    reactionsTriggered: 0,
    attacksLanded: 0,
    attacksMissed: 0,
    kills: 0,
    standingEarned: 0,
    turnsTaken: 0,
    commands: 0,
    maxHp: unitMaxHp(state, unitId) ?? unit.hp,
    hp: unit.hp,
    maxCharge: unitMaxCharge(state, unitId) ?? unit.charge,
    charge: unit.charge,
    minCharge: unit.charge,
    fluxSpent: 0,
    downed: false,
    downedAtTurn: null,
  };
}

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

class Telemetry {
  readonly units = new Map<string, UnitRecord>();
  readonly objectsDestroyed: string[] = [];
  firstDownTurn: number | null = null;
  private readonly lastAttacker = new Map<string, string>();
  private readonly lastObjectDamager = new Map<string, string>();

  constructor(state: GameState) {
    for (const unit of allUnits(state)) this.units.set(unit.id, blankUnit(state, unit.id));
  }

  private of(unitId: string): UnitRecord | undefined {
    return this.units.get(unitId);
  }

  /** A unit that entered play mid-battle through a `spawnUnits` trigger. */
  private ensure(state: GameState, unitId: string): UnitRecord | undefined {
    const existing = this.units.get(unitId);
    if (existing !== undefined) return existing;
    if (allUnits(state).every((u) => u.id !== unitId)) return undefined;
    const created = blankUnit(state, unitId);
    this.units.set(unitId, created);
    return created;
  }

  ingest(state: GameState, events: readonly BattleEvent[], chosen: Command | null): void {
    if (chosen !== null) {
      const actor = this.of(chosen.unitId);
      if (actor !== undefined) {
        actor.commands += 1;
        if (chosen.kind === "act") bump(actor.abilityUses, chosen.abilityId);
        if (chosen.kind === "activateObject") actor.objectsOperated += 1;
      }
    }
    for (const event of events) {
      switch (event.type) {
        case "TurnStarted": {
          const rec = this.ensure(state, event.unitId);
          if (rec !== undefined) rec.turnsTaken += 1;
          break;
        }
        case "UnitSpawned":
          this.ensure(state, event.unitId);
          break;
        case "DamageDealt": {
          const victim = this.ensure(state, event.unitId);
          if (victim !== undefined) victim.damageTaken += event.amount;
          if (event.sourceUnitId !== null) {
            this.lastAttacker.set(event.unitId, event.sourceUnitId);
            const source = this.of(event.sourceUnitId);
            if (source !== undefined && event.sourceUnitId !== event.unitId) {
              source.damageDealt += event.amount;
              source.attacksLanded += 1;
            }
          }
          break;
        }
        case "Healed": {
          const target = this.ensure(state, event.unitId);
          if (target !== undefined) target.healingReceived += event.amount;
          if (event.sourceUnitId !== null) {
            const source = this.of(event.sourceUnitId);
            if (source !== undefined) source.healingDone += event.amount;
          }
          break;
        }
        case "AbilityMissed": {
          const source = this.of(event.unitId);
          if (source !== undefined) source.attacksMissed += 1;
          break;
        }
        case "AbilityUsed": {
          const source = this.of(event.unitId);
          if (source !== undefined) bump(source.abilityResolutions, event.abilityId);
          break;
        }
        case "ReactionTriggered": {
          const source = this.of(event.unitId);
          if (source !== undefined) source.reactionsTriggered += 1;
          break;
        }
        case "ChargeChanged": {
          const rec = this.of(event.unitId);
          if (rec !== undefined) {
            rec.minCharge = Math.min(rec.minCharge, event.charge);
            if (event.delta < 0) rec.fluxSpent += -event.delta;
          }
          break;
        }
        case "ObjectDamaged": {
          if (event.sourceUnitId === null) break;
          this.lastObjectDamager.set(event.objectId, event.sourceUnitId);
          const source = this.of(event.sourceUnitId);
          if (source !== undefined) source.objectDamage += event.amount;
          break;
        }
        case "ObjectDestroyed": {
          this.objectsDestroyed.push(event.objectId);
          const breaker = this.lastObjectDamager.get(event.objectId);
          if (breaker !== undefined) {
            const rec = this.of(breaker);
            if (rec !== undefined) rec.objectsDestroyed += 1;
          }
          break;
        }
        case "UnitDowned": {
          const victim = this.ensure(state, event.unitId);
          if (victim !== undefined) {
            victim.downed = true;
            victim.downedAtTurn = turnNumber(state);
          }
          if (this.firstDownTurn === null) this.firstDownTurn = turnNumber(state);
          const killer = this.lastAttacker.get(event.unitId);
          if (killer !== undefined && killer !== event.unitId) {
            const rec = this.of(killer);
            if (rec !== undefined) rec.kills += 1;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  finish(state: GameState): UnitRecord[] {
    for (const unit of allUnits(state)) {
      const rec = this.ensure(state, unit.id);
      if (rec === undefined) continue;
      rec.hp = unit.hp;
      rec.charge = unit.charge;
      rec.standingEarned = unit.standingEarned;
      rec.downed = unit.downed;
      const max = unitMaxCharge(state, unit.id);
      if (max !== null) rec.maxCharge = Math.max(rec.maxCharge, max);
    }
    return [...this.units.values()].sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
  }
}

interface Prepared {
  library: ContentLibrary;
  encounterId: string;
  mapId: string;
  party: readonly Unit[];
  deployment: readonly Deployment[];
  id: string;
}

function reseed(encounter: Encounter, seed: number): Encounter {
  return { ...structuredClone(encounter), rngSeed: seed };
}

function prepare(content: ContentLibrary, target: BattleTarget, seed: number): Prepared {
  if (target.kind === "matchup") {
    const encounter = reseed(target.matchup.encounter, seed);
    const map: GameMap = target.matchup.map;
    return {
      library: withContent(target.matchup.library, { maps: [map], encounters: [encounter] }),
      encounterId: encounter.id,
      mapId: map.id,
      party: target.matchup.party,
      deployment: target.matchup.deployment,
      id: target.matchup.id,
    };
  }
  const authored = content.encounters[target.encounterId];
  if (authored === undefined) throw new Error(`sim: unknown encounter ${target.encounterId}`);
  const encounter = reseed(authored, seed);
  return {
    library: withContent(content, { encounters: [encounter] }),
    encounterId: encounter.id,
    mapId: encounter.mapId,
    party: target.party,
    deployment: target.deployment,
    id: `${encounter.id}#${seed}`,
  };
}

/**
 * Run one battle to a result, a stalemate, or the command cap.
 *
 * `seed` replaces the encounter's authored `rngSeed`: the engine is otherwise
 * fully deterministic, so the seed is the only source of variance between runs
 * of the same matchup.
 */
export function runBattle(
  content: ContentLibrary,
  target: BattleTarget,
  seed: number,
  opts: RunOptions = {},
): BattleRecord {
  const started = performance.now();
  const cap = opts.commandCap ?? DEFAULT_COMMAND_CAP;
  const weights = opts.weights ?? WEIGHTS;
  const prepared = prepare(content, target, seed);

  const start = createBattle(prepared.library, prepared.encounterId, prepared.party, prepared.deployment);
  let state = start.state;
  const telemetry = new Telemetry(state);
  const events: BattleEvent[] = opts.keepEvents === true ? [...start.events] : [];
  telemetry.ingest(state, start.events, null);

  let commands = 0;
  let rejected = 0;
  let capped = false;
  while (battleResult(state) === null) {
    if (commands >= cap) {
      capped = true;
      break;
    }
    const turn = activeTurnState(state);
    if (turn === null) break;
    const command = chooseCommand(state, weights);
    const result = applyCommand(state, command);
    commands += 1;
    if (result.error !== null) {
      rejected += 1;
      const forced = applyCommand(state, { kind: "endTurn", unitId: turn.unitId });
      if (forced.error !== null) break;
      state = forced.state;
      telemetry.ingest(state, forced.events, null);
      if (opts.keepEvents === true) events.push(...forced.events);
      continue;
    }
    state = result.state;
    telemetry.ingest(state, result.events, command);
    if (opts.keepEvents === true) events.push(...result.events);
  }

  const result = battleResult(state);
  const units = telemetry.finish(state);
  const outcome: BattleRecord["outcome"] = capped || result === null ? "stalemate" : result;
  const playerStanding = units.some((u) => u.team === "player" && !u.downed);
  const enemyStanding = units.some((u) => u.team !== "player" && !u.downed);
  const winner: BattleRecord["winner"] =
    outcome === "win" ? "player" : outcome === "loss" && enemyStanding && !playerStanding ? "enemy" : "none";

  return {
    id: prepared.id,
    encounterId: prepared.encounterId,
    mapId: prepared.mapId,
    seed,
    outcome,
    winner,
    turns: turnNumber(state),
    clock: battleClock(state),
    commands,
    capped,
    firstDownTurn: telemetry.firstDownTurn,
    objectsDestroyed: telemetry.objectsDestroyed,
    rejectedCommands: rejected,
    elapsedMs: performance.now() - started,
    units,
    events: opts.keepEvents === true ? events : null,
  };
}
