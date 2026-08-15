/**
 * Sweep telemetry to findings. Everything here is counting: no simulation, no
 * randomness, no thresholds hidden inside a formula — the flag thresholds are
 * named constants so the report can quote them.
 */

import type { ContentLibrary } from "../core/index.js";
import { BASIC_ATTACK_ID } from "../core/index.js";
import type { BattleRecord, UnitRecord } from "./harness.js";
import type { SweepBattle } from "./sweeps.js";

export const THRESHOLDS = {
  /** Mirror-adjusted duel win rate outside this band is a balance flag. */
  winRateHigh: 0.65,
  winRateLow: 0.35,
  /** Share of a kit's chosen actions above which one ability is dominating it. */
  abilityDominance: 0.4,
  /** Deployment-side win rate on same-versus-same battles above which a map is lopsided. */
  sideBias: 0.65,
  /** A unit that never drops below this share of its flux pool never felt the cost. */
  fluxUnbound: 0.75,
} as const;

function playerWon(record: BattleRecord): boolean | null {
  if (record.outcome === "stalemate") return null;
  return record.outcome === "win";
}

// ---------------------------------------------------------------------------
// Win rates
// ---------------------------------------------------------------------------

export interface JobWinRate {
  jobId: string;
  battles: number;
  wins: number;
  losses: number;
  stalemates: number;
  winRate: number;
  /** Battles where this job stood on the player side, and its rate there. */
  asPlayer: number;
  asPlayerWinRate: number;
  meanTurns: number;
  meanSurvivorHpPercent: number;
}

/**
 * Duel win rates, mirrors excluded. Every unordered pair is played in both
 * orientations, so side advantage cancels across a job's row.
 */
export function jobWinRates(battles: readonly SweepBattle[]): JobWinRate[] {
  interface Acc {
    battles: number;
    wins: number;
    losses: number;
    stalemates: number;
    asPlayer: number;
    playerWins: number;
    turns: number;
    hpPercent: number;
    hpSamples: number;
  }
  const acc = new Map<string, Acc>();
  const get = (job: string): Acc => {
    let a = acc.get(job);
    if (a === undefined) {
      a = { battles: 0, wins: 0, losses: 0, stalemates: 0, asPlayer: 0, playerWins: 0, turns: 0, hpPercent: 0, hpSamples: 0 };
      acc.set(job, a);
    }
    return a;
  };

  for (const battle of battles) {
    if (battle.tags.player === battle.tags.enemy) continue;
    const won = playerWon(battle.record);
    for (const [job, isPlayer] of [
      [battle.tags.player, true],
      [battle.tags.enemy, false],
    ] as const) {
      const a = get(job);
      a.battles += 1;
      a.turns += battle.record.turns;
      if (isPlayer) a.asPlayer += 1;
      if (won === null) {
        a.stalemates += 1;
        continue;
      }
      const sideWon = won === isPlayer;
      if (sideWon) {
        a.wins += 1;
        if (isPlayer) a.playerWins += 1;
        const side = battle.record.units.filter((u) => (u.team === "player") === isPlayer);
        const hp = side.reduce((n, u) => n + u.hp, 0);
        const max = side.reduce((n, u) => n + u.maxHp, 0);
        if (max > 0) {
          a.hpPercent += (100 * hp) / max;
          a.hpSamples += 1;
        }
      } else {
        a.losses += 1;
      }
    }
  }

  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([jobId, a]) => ({
      jobId,
      battles: a.battles,
      wins: a.wins,
      losses: a.losses,
      stalemates: a.stalemates,
      winRate: a.battles === 0 ? 0 : a.wins / a.battles,
      asPlayer: a.asPlayer,
      asPlayerWinRate: a.asPlayer === 0 ? 0 : a.playerWins / a.asPlayer,
      meanTurns: a.battles === 0 ? 0 : a.turns / a.battles,
      meanSurvivorHpPercent: a.hpSamples === 0 ? 0 : a.hpPercent / a.hpSamples,
    }));
}

export interface PairResult {
  player: string;
  enemy: string;
  battles: number;
  playerWins: number;
  stalemates: number;
}

export function pairTable(battles: readonly SweepBattle[]): PairResult[] {
  const acc = new Map<string, PairResult>();
  for (const battle of battles) {
    const key = `${battle.tags.player}|${battle.tags.enemy}`;
    let row = acc.get(key);
    if (row === undefined) {
      row = { player: battle.tags.player, enemy: battle.tags.enemy, battles: 0, playerWins: 0, stalemates: 0 };
      acc.set(key, row);
    }
    row.battles += 1;
    const won = playerWon(battle.record);
    if (won === null) row.stalemates += 1;
    else if (won) row.playerWins += 1;
  }
  return [...acc.values()].sort((a, b) => (a.player + a.enemy < b.player + b.enemy ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Ability usage
// ---------------------------------------------------------------------------

export interface AbilityUsage {
  jobId: string;
  abilityId: string;
  uses: number;
  /** Share of every action this job's units chose across the sweep. */
  share: number;
  resolutions: number;
  /** Units of this job that held the ability and could have chosen it. */
  offered: number;
}

export interface UsageReport {
  rows: AbilityUsage[];
  totalActionsByJob: Record<string, number>;
  /** Action abilities a unit was holding across the whole sweep and never once chose. */
  neverUsed: AbilityUsage[];
  /** Abilities taking more than `THRESHOLDS.abilityDominance` of their job's actions. */
  dominating: AbilityUsage[];
}

/** Action abilities a job's `jobUnit` template carries, plus the weapon attack. */
export function offeredAbilities(library: ContentLibrary, jobId: string): string[] {
  const job = library.jobs[jobId];
  if (job === undefined) return [BASIC_ATTACK_ID];
  const ids = [...job.learnableAbilityIds, ...job.innateAbilityIds]
    .filter((id) => library.abilities[id]?.slot === "action")
    .sort();
  return [BASIC_ATTACK_ID, ...ids];
}

export function abilityUsage(
  library: ContentLibrary,
  battles: readonly SweepBattle[],
  jobIds: readonly string[],
): UsageReport {
  const uses = new Map<string, number>();
  const resolutions = new Map<string, number>();
  const offered = new Map<string, number>();
  const totalByJob: Record<string, number> = {};

  const key = (job: string, ability: string) => `${job}|${ability}`;

  for (const battle of battles) {
    for (const unit of battle.record.units) {
      const job = unit.jobId;
      for (const ability of offeredAbilities(library, job)) {
        offered.set(key(job, ability), (offered.get(key(job, ability)) ?? 0) + 1);
      }
      for (const [ability, count] of Object.entries(unit.abilityUses)) {
        uses.set(key(job, ability), (uses.get(key(job, ability)) ?? 0) + count);
        totalByJob[job] = (totalByJob[job] ?? 0) + count;
      }
      for (const [ability, count] of Object.entries(unit.abilityResolutions)) {
        resolutions.set(key(job, ability), (resolutions.get(key(job, ability)) ?? 0) + count);
      }
    }
  }

  const rows: AbilityUsage[] = [];
  for (const jobId of [...jobIds].sort()) {
    const total = totalByJob[jobId] ?? 0;
    for (const abilityId of offeredAbilities(library, jobId)) {
      const k = key(jobId, abilityId);
      rows.push({
        jobId,
        abilityId,
        uses: uses.get(k) ?? 0,
        share: total === 0 ? 0 : (uses.get(k) ?? 0) / total,
        resolutions: resolutions.get(k) ?? 0,
        offered: offered.get(k) ?? 0,
      });
    }
  }

  return {
    rows,
    totalActionsByJob: totalByJob,
    neverUsed: rows.filter((row) => row.uses === 0 && row.offered > 0),
    dominating: rows.filter((row) => row.share > THRESHOLDS.abilityDominance),
  };
}

// ---------------------------------------------------------------------------
// Degenerate strategy flags
// ---------------------------------------------------------------------------

export interface SideBias {
  mapId: string;
  battles: number;
  playerWins: number;
  playerWinRate: number;
  stalemates: number;
}

/** Same job on both sides: any deviation from 50% is the map plus the tiebreak, not the kit. */
export function deploymentSideBias(battles: readonly SweepBattle[]): SideBias[] {
  const acc = new Map<string, SideBias>();
  for (const battle of battles) {
    if (battle.tags.player !== battle.tags.enemy) continue;
    let row = acc.get(battle.tags.map);
    if (row === undefined) {
      row = { mapId: battle.tags.map, battles: 0, playerWins: 0, playerWinRate: 0, stalemates: 0 };
      acc.set(battle.tags.map, row);
    }
    row.battles += 1;
    const won = playerWon(battle.record);
    if (won === null) row.stalemates += 1;
    else if (won) row.playerWins += 1;
  }
  for (const row of acc.values()) row.playerWinRate = row.battles === 0 ? 0 : row.playerWins / row.battles;
  return [...acc.values()].sort((a, b) => (a.mapId < b.mapId ? -1 : 1));
}

export interface DecisivenessReport {
  battles: number;
  stalemates: number;
  /** First unit down before every unit on the field had taken a turn. */
  firstRoundDowns: number;
  noDowns: number;
  meanTurns: number;
  meanCommands: number;
}

export function decisiveness(battles: readonly SweepBattle[]): DecisivenessReport {
  let stalemates = 0;
  let firstRound = 0;
  let noDowns = 0;
  let turns = 0;
  let commands = 0;
  for (const battle of battles) {
    const record = battle.record;
    turns += record.turns;
    commands += record.commands;
    if (record.outcome === "stalemate") stalemates += 1;
    if (record.firstDownTurn === null) noDowns += 1;
    else if (record.firstDownTurn <= record.units.length) firstRound += 1;
  }
  const n = Math.max(1, battles.length);
  return {
    battles: battles.length,
    stalemates,
    firstRoundDowns: firstRound,
    noDowns,
    meanTurns: turns / n,
    meanCommands: commands / n,
  };
}

export interface FluxReport {
  jobId: string;
  units: number;
  maxCharge: number;
  meanEndCharge: number;
  meanMinCharge: number;
  /** Share of units that never spent a single point of flux. */
  neverSpent: number;
  /** Share of units whose flux never fell below `THRESHOLDS.fluxUnbound` of the pool. */
  neverBound: number;
}

export function fluxEconomy(battles: readonly SweepBattle[]): FluxReport[] {
  const acc = new Map<string, { units: UnitRecord[] }>();
  for (const battle of battles) {
    for (const unit of battle.record.units) {
      let row = acc.get(unit.jobId);
      if (row === undefined) {
        row = { units: [] };
        acc.set(unit.jobId, row);
      }
      row.units.push(unit);
    }
  }
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([jobId, row]) => {
      const n = row.units.length;
      const mean = (pick: (u: UnitRecord) => number) => row.units.reduce((s, u) => s + pick(u), 0) / Math.max(1, n);
      return {
        jobId,
        units: n,
        maxCharge: mean((u) => u.maxCharge),
        meanEndCharge: mean((u) => u.charge),
        meanMinCharge: mean((u) => u.minCharge),
        neverSpent: row.units.filter((u) => u.fluxSpent === 0).length / Math.max(1, n),
        neverBound:
          row.units.filter((u) => u.maxCharge > 0 && u.minCharge >= u.maxCharge * THRESHOLDS.fluxUnbound).length /
          Math.max(1, n),
      };
    });
}

export interface StalemateMatchup {
  player: string;
  enemy: string;
  map: string;
  level: number;
  battles: number;
}

export function stalemateMatchups(battles: readonly SweepBattle[]): StalemateMatchup[] {
  const acc = new Map<string, StalemateMatchup>();
  for (const battle of battles) {
    if (battle.record.outcome !== "stalemate") continue;
    const { player, enemy, map, level } = battle.tags;
    const key = `${player}|${enemy}|${map}|${level}`;
    const row = acc.get(key) ?? { player, enemy, map, level, battles: 0 };
    row.battles += 1;
    acc.set(key, row);
  }
  return [...acc.values()].sort((a, b) => b.battles - a.battles);
}

export interface Finding {
  severity: 1 | 2 | 3;
  code: string;
  detail: string;
}

/** The mechanical flags. Ranking and prose live in `docs/BALANCE_REPORT.md`. */
export function findings(
  library: ContentLibrary,
  duels: readonly SweepBattle[],
  jobIds: readonly string[],
): Finding[] {
  const out: Finding[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

  for (const row of jobWinRates(duels)) {
    if (row.winRate > THRESHOLDS.winRateHigh) {
      out.push({
        severity: 1,
        code: "job-overperforms",
        detail: `${row.jobId} wins ${pct(row.winRate)} of ${row.battles} mirror-adjusted duels`,
      });
    } else if (row.winRate < THRESHOLDS.winRateLow) {
      out.push({
        severity: 1,
        code: "job-underperforms",
        detail: `${row.jobId} wins ${pct(row.winRate)} of ${row.battles} mirror-adjusted duels`,
      });
    }
  }

  const usage = abilityUsage(library, duels, jobIds);
  for (const row of usage.neverUsed) {
    out.push({
      severity: 2,
      code: "ability-never-used",
      detail: `${row.jobId}/${row.abilityId} offered in ${row.offered} unit-battles, chosen 0 times`,
    });
  }
  for (const row of usage.dominating) {
    out.push({
      severity: 2,
      code: "ability-dominates",
      detail: `${row.jobId}/${row.abilityId} is ${pct(row.share)} of the kit's ${usage.totalActionsByJob[row.jobId] ?? 0} actions`,
    });
  }

  for (const row of deploymentSideBias(duels)) {
    if (Math.abs(row.playerWinRate - 0.5) > THRESHOLDS.sideBias - 0.5) {
      out.push({
        severity: 2,
        code: "deployment-side-bias",
        detail: `${row.mapId}: the deploying side wins ${pct(row.playerWinRate)} of ${row.battles} same-versus-same battles`,
      });
    }
  }

  const decided = decisiveness(duels);
  if (decided.firstRoundDowns > 0) {
    out.push({
      severity: 2,
      code: "first-round-decided",
      detail: `${decided.firstRoundDowns}/${decided.battles} battles lost a unit before every unit had taken a turn`,
    });
  }
  for (const row of stalemateMatchups(duels)) {
    out.push({
      severity: 3,
      code: "stalemate",
      detail: `${row.player} vs ${row.enemy} on ${row.map} at L${row.level}: ${row.battles} battles hit the command cap`,
    });
  }
  for (const row of fluxEconomy(duels)) {
    if (row.neverBound > 0.5 && row.maxCharge > 0) {
      out.push({
        severity: 3,
        code: "flux-never-binds",
        detail: `${row.jobId}: ${pct(row.neverBound)} of units never spent below ${pct(THRESHOLDS.fluxUnbound)} of a ${row.maxCharge.toFixed(0)}-point pool`,
      });
    }
  }

  return out.sort((a, b) => a.severity - b.severity || (a.code < b.code ? -1 : 1));
}
