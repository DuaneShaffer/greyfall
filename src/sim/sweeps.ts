/**
 * The sweeps the balance report is built from. Each one returns a flat list of
 * tagged battle records; `analysis.ts` turns those into win rates, usage shares,
 * and degenerate-strategy flags.
 *
 * The engine and the AI are both deterministic, so the *only* source of variance
 * inside a sweep is the seed list. Sample sizes here are seeds, not trials, and
 * every headline number in `docs/BALANCE_REPORT.md` names the sweep it came from.
 */

import type { ContentLibrary, Deployment } from "../core/index.js";
import { WEIGHTS, type AiWeights } from "../core/ai/index.js";
import type { GameMap, Unit } from "../data/index.js";
import { runBattle, type BattleRecord, type RunOptions } from "./harness.js";
import { simContent, type SimContent } from "./content.js";
import { arenaMatchup, jobUnit, mapMatchup, orderedDeployTiles, respec, type Matchup } from "./matchup.js";
import { applyVariant, type Variant } from "./variants.js";

export const JOB_IDS = [
  "augmented",
  "chemist",
  "conduit",
  "enforcer",
  "machinist",
  "railrunner",
  "saboteur",
] as const;

export interface SweepTags {
  sweep: string;
  variant: string;
  /** Which AI weight table drove both sides. */
  weights: string;
  map: string;
  level: number;
  /** Comp label for the player side, e.g. a job id or `mono-enforcer`. */
  player: string;
  enemy: string;
}

export interface SweepBattle {
  tags: SweepTags;
  record: BattleRecord;
}

export interface SweepConfig {
  /** Seeds replace the encounter's authored `rngSeed`; this list is the sample size. */
  seeds: readonly number[];
  levels: readonly number[];
  jobs: readonly string[];
  /** Authored map used alongside the synthetic arena for the duel sweep. */
  realMapId: string;
  duelCommandCap: number;
  teamCommandCap: number;
  compSeeds: readonly number[];
  compLevels: readonly number[];
  variantSeeds: readonly number[];
  encounterSeeds: readonly number[];
  /** Cap on how many discovered encounters to play. `data/encounters` grows under this sweep. */
  encounterLimit: number;
  ttkSeeds: readonly number[];
  /** Scripted-duel levels. Cheap, so this can be finer than the AI sweep's levels. */
  ttkLevels: readonly number[];
}

/** A handful of battles: what `npx vitest run tests/sim` runs by default. */
export const CI_CONFIG: SweepConfig = {
  seeds: [101],
  levels: [1, 3],
  jobs: ["enforcer", "conduit", "chemist"],
  realMapId: "marshaling-yard",
  duelCommandCap: 300,
  teamCommandCap: 600,
  compSeeds: [101],
  compLevels: [1],
  variantSeeds: [101],
  encounterSeeds: [101],
  encounterLimit: 1,
  ttkSeeds: [101],
  ttkLevels: [1, 2, 3],
};

/** The measurement run behind the report. Minutes, not hours. */
export const FULL_CONFIG: SweepConfig = {
  seeds: [101, 202, 303],
  levels: [1, 3, 5],
  jobs: [...JOB_IDS],
  realMapId: "marshaling-yard",
  duelCommandCap: 300,
  teamCommandCap: 800,
  compSeeds: [101, 202],
  compLevels: [1, 2, 3],
  variantSeeds: [101],
  encounterSeeds: [101, 202, 303, 404, 505],
  encounterLimit: 32,
  ttkSeeds: [101, 202, 303],
  ttkLevels: [1, 2, 3, 4, 5],
};

function duelOptions(cfg: SweepConfig, weights?: AiWeights): RunOptions {
  return weights === undefined ? { commandCap: cfg.duelCommandCap } : { commandCap: cfg.duelCommandCap, weights };
}

function teamOptions(cfg: SweepConfig): RunOptions {
  return { commandCap: cfg.teamCommandCap };
}

function run(matchup: Matchup, seed: number, tags: SweepTags, opts: RunOptions): SweepBattle {
  return { tags, record: runBattle(matchup.library, { kind: "matchup", matchup }, seed, opts) };
}

// ---------------------------------------------------------------------------
// (a) job round robin
// ---------------------------------------------------------------------------

/**
 * Every ordered job pair, mirrors included, at each level and on both maps.
 * Running both orientations of each pair is what makes the win rates
 * mirror-adjusted: whatever advantage the player side carries (deployment band,
 * unit-id CT tiebreak) is handed to each job equally.
 */
export function jobRoundRobin(
  content: SimContent,
  cfg: SweepConfig,
  variant?: Variant,
  weights?: WeightTable,
): SweepBattle[] {
  const out: SweepBattle[] = [];
  const realMap = content.library.maps[cfg.realMapId];
  for (const level of cfg.levels) {
    const library = variant === undefined ? content.library : applyVariant(content.library, variant, level);
    const variantId = variant?.id ?? "baseline";
    for (const playerJob of cfg.jobs) {
      for (const enemyJob of cfg.jobs) {
        const player = [jobUnit(library, playerJob, level, `sim-a-${playerJob}-0`)];
        const enemy = [jobUnit(library, enemyJob, level, `sim-b-${enemyJob}-0`)];
        const id = `rr-${playerJob}-${enemyJob}-l${level}`;
        const arena = arenaMatchup(library, `${id}-arena`, player, enemy);
        const targets: Array<[string, Matchup]> = [["sim-arena", arena]];
        if (realMap !== undefined) {
          targets.push([realMap.id, mapMatchup(library, `${id}-map`, realMap, player, enemy)]);
        }
        for (const [mapId, matchup] of targets) {
          for (const seed of cfg.seeds) {
            out.push(
              run(
                matchup,
                seed,
                {
                  sweep: "duel",
                  variant: variantId,
                  weights: weights?.id ?? "shipped",
                  map: mapId,
                  level,
                  player: playerJob,
                  enemy: enemyJob,
                },
                duelOptions(cfg, weights?.weights),
              ),
            );
          }
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (b) mixed comps
// ---------------------------------------------------------------------------

export const BALANCED_COMP = ["enforcer", "conduit", "chemist", "railrunner"] as const;

function comp(library: ContentLibrary, jobs: readonly string[], level: number, side: "a" | "b"): Unit[] {
  return jobs.map((job, i) => jobUnit(library, job, level, `sim-${side}-${job}-${i}`));
}

/** A balanced four against each mono-job four, both orientations, on the arena. */
export function compSweep(content: SimContent, cfg: SweepConfig): SweepBattle[] {
  const out: SweepBattle[] = [];
  const library = content.library;
  for (const level of cfg.compLevels) {
    for (const job of cfg.jobs) {
      const mono = [job, job, job, job];
      const pairs: Array<[string, readonly string[], string, readonly string[]]> = [
        ["balanced", BALANCED_COMP, `mono-${job}`, mono],
        [`mono-${job}`, mono, "balanced", BALANCED_COMP],
      ];
      for (const [playerLabel, playerJobs, enemyLabel, enemyJobs] of pairs) {
        const matchup = arenaMatchup(
          library,
          `comp-${playerLabel}-${enemyLabel}-l${level}`.replace(/[^a-z0-9-]/g, ""),
          comp(library, playerJobs, level, "a"),
          comp(library, enemyJobs, level, "b"),
        );
        for (const seed of cfg.compSeeds) {
          out.push(
            run(
              matchup,
              seed,
              {
                sweep: "comp",
                variant: "baseline",
                weights: "shipped",
                map: "sim-arena",
                level,
                player: playerLabel,
                enemy: enemyLabel,
              },
              teamOptions(cfg),
            ),
          );
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (c) shipped encounters
// ---------------------------------------------------------------------------

/** `count` seeds walking `start` by `step`. */
export function seedSet(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + step * i);
}

/**
 * The two seed sets every encounter landing in `docs/BALANCE_REPORT.md` is
 * confirmed on. They are disjoint by construction (`37` and `41` are coprime
 * to each other and the offsets differ), and the discipline is that nothing is
 * tuned and validated on the same one: a single 24-seed read of an encounter is
 * not a landing (§7.8.2).
 */
export const PRIMARY_ENCOUNTER_SEEDS = seedSet(101, 37, 24);
export const ALT_ENCOUNTER_SEEDS = seedSet(103, 41, 24);

/** The party an encounter deploys: campaign roster in join order, authored levels. */
export function authoredDeployment(
  content: SimContent,
  encounterId: string,
): { party: Unit[]; deployment: Deployment[] } | null {
  const encounter = content.library.encounters[encounterId];
  const map = encounter === undefined ? undefined : content.library.maps[encounter.mapId];
  if (encounter === undefined || map === undefined) return null;
  const roster = rosterIds(content);
  const tiles = orderedDeployTiles(map);
  const size = Math.min(encounter.maxDeployedUnits, tiles.length, roster.length);
  const party = partyFor(content, roster.slice(0, size), null);
  if (party.length === 0) return null;
  return {
    party,
    deployment: party.map((unit, i) => ({ unitId: unit.id, position: { ...tiles[i]! } })),
  };
}

/**
 * Named encounters over an explicit seed set — the shape every §7.8.x addendum
 * is measured with, so a re-check is a call rather than a rebuild.
 */
export function encounterRuns(
  content: SimContent,
  encounterIds: readonly string[],
  seeds: readonly number[],
  opts: RunOptions = {},
): SweepBattle[] {
  const out: SweepBattle[] = [];
  for (const encounterId of encounterIds) {
    const deployed = authoredDeployment(content, encounterId);
    if (deployed === null) continue;
    const encounter = content.library.encounters[encounterId]!;
    for (const seed of seeds) {
      out.push({
        tags: {
          sweep: "encounter-authored",
          variant: "baseline",
          weights: "shipped",
          map: encounter.mapId,
          level: Math.max(...deployed.party.map((u) => u.level)),
          player: "party-authored",
          enemy: encounterId,
        },
        record: runBattle(
          content.library,
          { kind: "encounter", encounterId, party: deployed.party, deployment: deployed.deployment },
          seed,
          opts,
        ),
      });
    }
  }
  return out;
}

function rosterIds(content: SimContent): string[] {
  const campaign = Object.keys(content.campaigns).sort().map((id) => content.campaigns[id])[0];
  if (campaign !== undefined) return [...campaign.startingRosterUnitIds];
  return Object.keys(content.units).sort();
}

function partyFor(content: SimContent, ids: readonly string[], level: number | null): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) {
    const unit = content.units[id];
    if (unit === undefined) continue;
    out.push(level === null ? structuredClone(unit) : respec(unit, { level }));
  }
  return out;
}

/**
 * Every encounter in `data/encounters`, glob-discovered, played by the campaign's
 * own roster. `authored` runs the roster at the levels `data/units` gives it;
 * `chapter` assumes one level per chapter step, which is the progression
 * workstream's stated intent rather than authored data.
 */
export function encounterSweep(content: SimContent, cfg: SweepConfig): SweepBattle[] {
  const out: SweepBattle[] = [];
  const campaign = Object.keys(content.campaigns).sort().map((id) => content.campaigns[id])[0];
  const order = campaign?.encounterIds ?? [];

  const discovered = Object.keys(content.library.encounters).sort().slice(0, cfg.encounterLimit);
  for (const encounterId of discovered) {
    const encounter = content.library.encounters[encounterId]!;
    const map: GameMap | undefined = content.library.maps[encounter.mapId];
    if (map === undefined) continue;
    const chapterIndex = order.indexOf(encounterId);
    const deployed = authoredDeployment(content, encounterId);
    if (deployed === null) continue;
    const partyIds = deployed.party.map((unit) => unit.id);

    const modes: Array<{ mode: "authored" | "chapter"; level: number | null }> = [
      { mode: "authored", level: null },
      { mode: "chapter", level: Math.min(5, Math.max(1, chapterIndex + 1)) },
    ];
    for (const { mode, level } of modes) {
      const party = level === null ? deployed.party : partyFor(content, partyIds, level);
      if (party.length === 0) continue;
      for (const seed of cfg.encounterSeeds) {
        out.push({
          tags: {
            sweep: `encounter-${mode}`,
            variant: "baseline",
            weights: "shipped",
            map: map.id,
            level: level ?? Math.max(...party.map((u) => u.level)),
            player: `party-${mode}`,
            enemy: encounterId,
          },
          record: runBattle(
            content.library,
            { kind: "encounter", encounterId, party, deployment: deployed.deployment },
            seed,
            teamOptions(cfg),
          ),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (d) formula variants
// ---------------------------------------------------------------------------

/** The duel round robin re-run under a candidate core-formula change, arena only. */
export function variantSweep(content: SimContent, cfg: SweepConfig, variants: readonly Variant[]): SweepBattle[] {
  const arenaOnly: SweepConfig = { ...cfg, seeds: cfg.variantSeeds, realMapId: "" };
  const out: SweepBattle[] = [];
  for (const variant of variants) {
    for (const battle of jobRoundRobin(content, arenaOnly, variant)) {
      out.push({ ...battle, tags: { ...battle.tags, sweep: "variant" } });
    }
  }
  return out;
}

/**
 * Same job on both sides, run twice: once with the deploying side holding the
 * lower unit ids and once with the higher. Unit id breaks CT ties
 * (`COMBAT_RULES` §17), so this separates "the deployment band is better" from
 * "acting first is better" in a mirror match.
 */
export function mirrorTempo(content: SimContent, cfg: SweepConfig): SweepBattle[] {
  const out: SweepBattle[] = [];
  const realMap = content.library.maps[cfg.realMapId];
  for (const level of cfg.levels) {
    for (const job of cfg.jobs) {
      for (const [order, playerPrefix, enemyPrefix] of [
        ["player-first", "sim-a", "sim-b"],
        ["enemy-first", "sim-b", "sim-a"],
      ] as const) {
        const player = [jobUnit(content.library, job, level, `${playerPrefix}-${job}-0`)];
        const enemy = [jobUnit(content.library, job, level, `${enemyPrefix}-${job}-0`)];
        const id = `tempo-${job}-${order}-l${level}`;
        const targets: Array<[string, Matchup]> = [
          ["sim-arena", arenaMatchup(content.library, `${id}-arena`, player, enemy)],
        ];
        if (realMap !== undefined) {
          targets.push([realMap.id, mapMatchup(content.library, `${id}-map`, realMap, player, enemy)]);
        }
        for (const [mapId, matchup] of targets) {
          for (const seed of cfg.seeds) {
            out.push(
              run(
                matchup,
                seed,
                { sweep: "tempo", variant: order, weights: "shipped", map: mapId, level, player: job, enemy: job },
                duelOptions(cfg),
              ),
            );
          }
        }
      }
    }
  }
  return out;
}

/** A named AI weight table, so a sweep can ask what the search itself is costing. */
export interface WeightTable {
  id: string;
  label: string;
  weights: AiWeights;
}

/**
 * The duel round robin re-run with a different AI weight table on both sides.
 * The content is untouched, so any movement is the search's opinion changing.
 */
export function weightSweep(
  content: SimContent,
  cfg: SweepConfig,
  tables: readonly WeightTable[],
): SweepBattle[] {
  const arenaOnly: SweepConfig = { ...cfg, seeds: cfg.variantSeeds, realMapId: "" };
  const out: SweepBattle[] = [];
  for (const table of tables) {
    for (const battle of jobRoundRobin(content, arenaOnly, undefined, table)) {
      out.push({ ...battle, tags: { ...battle.tags, sweep: "weights" } });
    }
  }
  return out;
}

/** Shipped weights run through the same reduced sweep, for a like-for-like baseline. */
export function weightBaseline(content: SimContent, cfg: SweepConfig): SweepBattle[] {
  const arenaOnly: SweepConfig = { ...cfg, seeds: cfg.variantSeeds, realMapId: "" };
  return jobRoundRobin(content, arenaOnly, undefined, { id: "shipped", label: "shipped", weights: WEIGHTS }).map(
    (battle) => ({ ...battle, tags: { ...battle.tags, sweep: "weights" } }),
  );
}

export interface SweepBundle {
  duels: SweepBattle[];
  comps: SweepBattle[];
  encounters: SweepBattle[];
  variants: SweepBattle[];
  weights: SweepBattle[];
  tempo: SweepBattle[];
  config: SweepConfig;
  content: SimContent;
  elapsedMs: number;
}

export function runAllSweeps(
  cfg: SweepConfig,
  variants: readonly Variant[] = [],
  content: SimContent = simContent(),
  weightTables: readonly WeightTable[] = [],
): SweepBundle {
  const started = performance.now();
  const duels = jobRoundRobin(content, cfg);
  const comps = compSweep(content, cfg);
  const encounters = encounterSweep(content, cfg);
  const variantBattles = variants.length === 0 ? [] : variantSweep(content, cfg, variants);
  const weightBattles =
    weightTables.length === 0 ? [] : [...weightBaseline(content, cfg), ...weightSweep(content, cfg, weightTables)];
  return {
    duels,
    comps,
    encounters,
    variants: variantBattles,
    weights: weightBattles,
    tempo: mirrorTempo(content, cfg),
    config: cfg,
    content,
    elapsedMs: performance.now() - started,
  };
}
