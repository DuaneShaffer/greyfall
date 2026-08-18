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
  WEIGHTS,
  activeTurnState,
  allUnits,
  applyCommand,
  battleClock,
  battleResult,
  chooseCommand,
  createBattle,
  objectEnergized,
  solveGrid,
  turnNumber,
  unitMaxCharge,
  unitMaxHp,
  type AiWeights,
  type BattleEvent,
  type Command,
  type ContentLibrary,
  type Deployment,
  type GameState,
} from "../core/index.js";
import type { Encounter, GameMap, Grid, Team, Unit } from "../data/index.js";
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
  /**
   * Drives the run in place of the search. Returning null hands the turn back to
   * `chooseCommand`, so a script can cover the verbs the value function cannot
   * yet price and let the AI play the rest.
   */
  chooser?: (state: GameState) => Command | null;
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
  /** `useItem` commands chosen. An item spends the turn's action the way an ability does. */
  itemsUsed: number;
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

/** A tally split by the side that caused it. */
export interface SideTally {
  player: number;
  enemy: number;
  neutral: number;
  /** Nobody's action: an encounter trigger, or the battle's own opening batch. */
  scripted: number;
}

function blankTally(): SideTally {
  return { player: 0, enemy: 0, neutral: 0, scripted: 0 };
}

/**
 * What the battlefield did, as against who won it. A win rate cannot see whether
 * an encounter's premise ever occurred: e2 read 45.8% for a build that never
 * once fired a press (`docs/BALANCE_REPORT.md` §7.8.3), so every run carries
 * these beside its outcome.
 */
export interface BattleCounters {
  /** `ObjectActivated` — a side spending an action working machinery. */
  machineryOperated: SideTally;
  /** The same, by object id, so one machine's share of the traffic is readable. */
  operatedByObject: Record<string, SideTally>;
  powerOn: SideTally;
  powerOff: SideTally;
  /** `ObjectDestroyed`, attributed to whoever last damaged it. */
  objectsBroken: SideTally;
  /** `TriggerFired` by trigger id: the encounter's scripted beats, and which never fired. */
  triggersFired: Record<string, number>;
  unitsSpawned: number;
  unitsRemoved: number;
  /** Unit turns that began with at least one operable machine still on the board. */
  turnsWithMachine: number;
  /** Of those, the ones where at least one was workable — powered if its controls need it. */
  turnsWithLiveMachine: number;
  /**
   * Of those, the ones where a *power-gated* machine was standing and lit. This
   * is the number a level built around denying power lives or dies by: Floor
   * Nine's press line is three of them and its mains switch is not.
   */
  turnsWithPoweredMachine: number;
  /**
   * Beside it, the networked reading: a machine that is a node of a declared
   * grid was standing and being fed. A map that declares no grid scores zero
   * here however many machines it lights, which is the point of carrying both.
   */
  turnsWithEnergizedMachine: number;
  /** `GridTripped` — a component drawing past its rating latching its sources open. */
  gridTrips: SideTally;
  /** `GridReset` — a latch cleared, credited to the unit the event names. */
  gridResets: SideTally;
  /** `LineSevered` / `LineSpliced`: the reversible cut and its undo. */
  linesCut: SideTally;
  linesSpliced: SideTally;
  /** A breaker node's isolator changing state — the tie thrown, open or closed. */
  tiesThrown: SideTally;
  /** `PowerChanged` on a node of a declared grid: energization the graph moved. */
  gridPowerChanges: SideTally;
  /** Grid ids the map declares, ascending. Empty on an ungridded map. */
  gridIds: string[];
  /** One integer-percent headroom sample per declared grid per unit turn. */
  headroomByGrid: Record<string, { samples: number; totalPercent: number }>;
  /** The turn on which every node of some declared grid was first feeding nothing. */
  firstDarkTurn: number | null;
  /** Unit turns that began with a declared grid feeding nothing. */
  turnsDark: number;
}

function blankCounters(): BattleCounters {
  return {
    machineryOperated: blankTally(),
    operatedByObject: {},
    powerOn: blankTally(),
    powerOff: blankTally(),
    objectsBroken: blankTally(),
    triggersFired: {},
    unitsSpawned: 0,
    unitsRemoved: 0,
    turnsWithMachine: 0,
    turnsWithLiveMachine: 0,
    turnsWithPoweredMachine: 0,
    turnsWithEnergizedMachine: 0,
    gridTrips: blankTally(),
    gridResets: blankTally(),
    linesCut: blankTally(),
    linesSpliced: blankTally(),
    tiesThrown: blankTally(),
    gridPowerChanges: blankTally(),
    gridIds: [],
    headroomByGrid: {},
    firstDarkTurn: null,
    turnsDark: 0,
  };
}

/** Grids the map declares, by ascending grid id — the canonical order. */
function declaredGrids(state: GameState): Grid[] {
  return [...state.content.map.grids].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** A node's own isolator flag, which is what `MapObject.powered` means on a grid. */
function isolatorClosed(state: GameState, objectId: string): boolean {
  return state.map.objects.find((o) => o.def.id === objectId)?.powered === true;
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
  counters: BattleCounters;
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
    itemsUsed: 0,
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
  readonly counters = blankCounters();
  firstDownTurn: number | null = null;
  private readonly lastAttacker = new Map<string, string>();
  private readonly lastObjectDamager = new Map<string, string>();
  private readonly gridNodeIds = new Set<string>();
  /** Breaker nodes by object id, holding the isolator state last seen. */
  private readonly breakerIsolators = new Map<string, boolean>();

  private tally(into: SideTally, team: Team | null): void {
    if (team === null) into.scripted += 1;
    else into[team] += 1;
  }

  private teamOf(unitId: string | null | undefined): Team | null {
    return unitId === null || unitId === undefined ? null : (this.units.get(unitId)?.team ?? null);
  }

  /** The event's own actor where it names one, falling back to the chosen command's. */
  private tallyActor(into: SideTally, unitId: string | null, fallback: Team | null): void {
    this.tally(into, unitId === null ? fallback : this.teamOf(unitId));
  }

  /** Operable machines still standing when this turn began, and how many are workable. */
  private censusMachines(state: GameState, turn: number): void {
    let standing = 0;
    let live = 0;
    let lit = 0;
    let fed = 0;
    for (const obj of state.map.objects) {
      const controls = obj.def.operable;
      if (controls === null || obj.destroyed) continue;
      standing += 1;
      const networked = this.gridNodeIds.has(obj.def.id);
      const energized = networked || controls.requiresPower ? objectEnergized(state, obj.def.id) : false;
      if (!controls.requiresPower) live += 1;
      else if (energized) {
        live += 1;
        lit += 1;
      }
      if (networked && energized) fed += 1;
    }
    if (standing > 0) this.counters.turnsWithMachine += 1;
    if (live > 0) this.counters.turnsWithLiveMachine += 1;
    if (lit > 0) this.counters.turnsWithPoweredMachine += 1;
    if (fed > 0) this.counters.turnsWithEnergizedMachine += 1;
    this.censusGrids(state, turn);
  }

  /** Headroom against the rating, and whether any declared network is feeding nothing. */
  private censusGrids(state: GameState, turn: number): void {
    let dark = false;
    for (const grid of declaredGrids(state)) {
      const solution = solveGrid(state, grid);
      // A tripped or capacity-less network contributes 0: it is not running
      // under its rating, it is not running.
      const percent =
        solution.tripped.length > 0 || solution.capacity === 0
          ? 0
          : Math.max(0, Math.floor((100 * (solution.capacity - solution.load)) / solution.capacity));
      const acc = (this.counters.headroomByGrid[grid.id] ??= { samples: 0, totalPercent: 0 });
      acc.samples += 1;
      acc.totalPercent += percent;
      if (solution.live.length === 0) dark = true;
    }
    if (!dark) return;
    this.counters.turnsDark += 1;
    if (this.counters.firstDarkTurn === null) this.counters.firstDarkTurn = turn;
  }

  /**
   * A tie throw is a breaker node's isolator changing state, censused rather
   * than read off `PowerChanged`: a throw with no downstream consequence emits
   * no `PowerChanged` at all and is still a throw.
   */
  private censusTies(state: GameState, team: Team | null): void {
    if (this.breakerIsolators.size === 0) return;
    for (const objectId of [...this.breakerIsolators.keys()].sort()) {
      const now = isolatorClosed(state, objectId);
      if (now === this.breakerIsolators.get(objectId)) continue;
      this.breakerIsolators.set(objectId, now);
      this.tally(this.counters.tiesThrown, team);
    }
  }

  constructor(state: GameState) {
    for (const unit of allUnits(state)) this.units.set(unit.id, blankUnit(state, unit.id));
    for (const grid of declaredGrids(state)) {
      this.counters.gridIds.push(grid.id);
      const nodes = [...grid.nodes].sort((a, b) => (a.objectId < b.objectId ? -1 : 1));
      for (const node of nodes) {
        this.gridNodeIds.add(node.objectId);
        if (node.role === "breaker") this.breakerIsolators.set(node.objectId, isolatorClosed(state, node.objectId));
      }
    }
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
        if (chosen.kind === "useItem") actor.itemsUsed += 1;
        if (chosen.kind === "activateObject") actor.objectsOperated += 1;
      }
    }
    const actorTeam = chosen === null ? null : this.teamOf(chosen.unitId);
    // Triggers settle after the action inside the same batch, so everything past
    // the first `TriggerFired` is the encounter's doing rather than the actor's.
    let scripted = chosen === null;
    for (const event of events) {
      switch (event.type) {
        case "TurnStarted": {
          const rec = this.ensure(state, event.unitId);
          if (rec !== undefined) rec.turnsTaken += 1;
          this.censusMachines(state, event.turn);
          break;
        }
        case "TriggerFired":
          bump(this.counters.triggersFired, event.triggerId);
          scripted = true;
          break;
        case "ObjectActivated": {
          const team = this.teamOf(event.unitId);
          this.tally(this.counters.machineryOperated, team);
          const perObject = (this.counters.operatedByObject[event.objectId] ??= blankTally());
          this.tally(perObject, team);
          break;
        }
        case "PowerChanged": {
          const team = scripted ? null : actorTeam;
          this.tally(event.powered ? this.counters.powerOn : this.counters.powerOff, team);
          // `cause` is set only where the object is a node of a declared grid.
          if (event.cause !== undefined) this.tally(this.counters.gridPowerChanges, team);
          break;
        }
        case "GridTripped":
          this.tally(this.counters.gridTrips, scripted ? null : actorTeam);
          break;
        case "GridReset":
          this.tallyActor(this.counters.gridResets, event.unitId, scripted ? null : actorTeam);
          break;
        case "LineSevered":
          this.tallyActor(this.counters.linesCut, event.unitId, scripted ? null : actorTeam);
          break;
        case "LineSpliced":
          this.tallyActor(this.counters.linesSpliced, event.unitId, scripted ? null : actorTeam);
          break;
        case "UnitSpawned":
          this.counters.unitsSpawned += 1;
          this.ensure(state, event.unitId);
          break;
        case "UnitRemoved":
          this.counters.unitsRemoved += 1;
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
          this.tally(this.counters.objectsBroken, this.teamOf(breaker));
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
    this.censusTies(state, scripted ? null : actorTeam);
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
    const command = opts.chooser?.(state) ?? chooseCommand(state, weights);
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
    counters: telemetry.counters,
    units,
    events: opts.keepEvents === true ? events : null,
  };
}
