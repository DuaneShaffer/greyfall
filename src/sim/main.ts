/**
 * The sweep entry point. Runs the configured sweeps and renders every number
 * `docs/BALANCE_REPORT.md` quotes as markdown on stdout.
 *
 * Node cannot execute this file directly: `src/core` imports itself with `.js`
 * specifiers that resolve to `.ts` sources, which `node --experimental-strip-types`
 * does not rewrite. It therefore runs under vitest, which does:
 *
 *   npx vitest run tests/sim                      # CI-sized sweep, seconds
 *   GREYFALL_SIM=full npx vitest run tests/sim    # the full measurement run
 *
 * `GREYFALL_SIM_OUT=<path>` also writes the dump to a file.
 */

import type { ContentLibrary } from "../core/index.js";
import {
  abilityUsage,
  decisiveness,
  deploymentSideBias,
  findings,
  fluxEconomy,
  jobWinRates,
  pairTable,
  stalemateMatchups,
} from "./analysis.js";
import { simContent, type SimContent } from "./content.js";
import type { BattleRecord } from "./harness.js";
import {
  CI_CONFIG,
  FULL_CONFIG,
  JOB_IDS,
  runAllSweeps,
  type SweepBattle,
  type SweepBundle,
  type SweepConfig,
  type WeightTable,
} from "./sweeps.js";
import { WEIGHTS } from "../core/ai/index.js";
import { ttkMatrix, type TtkCell } from "./ttk.js";
import {
  BASELINE,
  LIVE_PER_LEVEL,
  applyVariant,
  divisorVariant,
  hpBaseVariant,
  statBaseVariant,
  type Variant,
} from "./variants.js";

/**
 * Deltas against the shipped engine, not against a hypothetical unscaled one:
 * `divisorVariant(LIVE_PER_LEVEL)` is the live slope and is included as a
 * control row that must reproduce baseline exactly. The other three are the
 * alternatives §4(b) rejected, kept so the decision stays reproducible.
 */
export const CANDIDATE_VARIANTS: Variant[] = [
  divisorVariant(LIVE_PER_LEVEL),
  divisorVariant(150),
  hpBaseVariant(160),
  statBaseVariant(15),
];

/**
 * Weight tables that isolate the three places the search's own opinion could be
 * distorting a content read: the flat chip-damage cliff, the fact that
 * `selfHarmPercent` scales self-*benefit* as well as self-harm, and the price
 * put on a CT swing, which is what makes Overclocked the best action in the game.
 */
export const CANDIDATE_WEIGHTS: WeightTable[] = [
  { id: "chip-threshold-60", label: "chipThreshold 60", weights: { ...WEIGHTS, chipThreshold: 60 } },
  { id: "self-neutral", label: "selfHarmPercent 100", weights: { ...WEIGHTS, selfHarmPercent: 100 } },
  { id: "status-ct-2", label: "statusCtPerPercent 2", weights: { ...WEIGHTS, statusCtPerPercent: 2 } },
  {
    id: "combined",
    label: "chipThreshold 60, chipPenalty 120, selfHarmPercent 100, statusCtPerPercent 2",
    weights: {
      ...WEIGHTS,
      chipThreshold: 60,
      chipPenalty: 120,
      selfHarmPercent: 100,
      statusCtPerPercent: 2,
    },
  },
];

const pct = (n: number) => `${(100 * n).toFixed(0)}%`;
const num = (n: number, digits = 1) => n.toFixed(digits);

function table(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const head = `| ${header.join(" | ")} |`;
  const rule = `|${header.map(() => "---").join("|")}|`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

function outcomeCounts(battles: readonly SweepBattle[]) {
  let win = 0;
  let loss = 0;
  let stale = 0;
  for (const battle of battles) {
    if (battle.record.outcome === "win") win += 1;
    else if (battle.record.outcome === "loss") loss += 1;
    else stale += 1;
  }
  return { win, loss, stale };
}

function survivorMargin(record: BattleRecord, team: "player" | "enemy"): number {
  const side = record.units.filter((u) => (u.team === "player") === (team === "player"));
  const hp = side.reduce((n, u) => n + u.hp, 0);
  const max = side.reduce((n, u) => n + u.maxHp, 0);
  return max === 0 ? 0 : (100 * hp) / max;
}

function ttkSection(cells: readonly TtkCell[], jobs: readonly string[], levels: readonly number[]): string {
  const parts: string[] = [];
  for (const level of levels) {
    const rows = jobs.map((attacker) => {
      const row: (string | number)[] = [attacker];
      for (const defender of jobs) {
        const cell = cells.find((c) => c.level === level && c.attackerJob === attacker && c.defenderJob === defender)!;
        row.push(`${cell.damagePerHit}/${cell.hitsToDown}`);
      }
      return row;
    });
    parts.push(`**Level ${level}** — cell is \`damage per swing / swings to down\`.\n`);
    parts.push(table(["attacker \\ defender", ...jobs], rows));
    parts.push("");
  }
  return parts.join("\n");
}

function ttkSummary(cells: readonly TtkCell[]): { level: number; meanHits: number; oneShots: number; cells: number }[] {
  const levels = [...new Set(cells.map((c) => c.level))].sort((a, b) => a - b);
  return levels.map((level) => {
    const slice = cells.filter((c) => c.level === level && Number.isFinite(c.hitsToDown));
    return {
      level,
      meanHits: slice.reduce((n, c) => n + c.hitsToDown, 0) / Math.max(1, slice.length),
      oneShots: slice.filter((c) => c.hitsToDown <= 1).length,
      cells: slice.length,
    };
  });
}

export function renderReport(bundle: SweepBundle, variants: readonly Variant[]): string {
  const { duels, comps, encounters, config, content } = bundle;
  const library = content.library;
  const jobs = config.jobs;
  const out: string[] = [];
  const total =
    duels.length +
    comps.length +
    encounters.length +
    bundle.variants.length +
    bundle.weights.length +
    bundle.tempo.length;

  out.push("# Greyfall balance sweep — measurement dump");
  out.push("");
  out.push(
    `Battles: ${total} (duels ${duels.length}, comps ${comps.length}, encounters ${encounters.length}, ` +
      `formula variants ${bundle.variants.length}, weight tables ${bundle.weights.length}, ` +
      `tempo ${bundle.tempo.length}). ` +
      `Sweep wall time ${(bundle.elapsedMs / 1000).toFixed(1)}s. ` +
      `Seeds ${JSON.stringify(config.seeds)}, levels ${JSON.stringify(config.levels)}, jobs ${jobs.length}.`,
  );
  if (content.skipped.length > 0) out.push(`Skipped content: ${content.skipped.join("; ")}`);
  out.push("");

  // --- duels ---
  out.push("## 1. Job duel round robin");
  out.push("");
  const rates = jobWinRates(duels);
  out.push(
    table(
      ["job", "battles", "win%", "as-player win%", "stalemates", "mean turns", "mean survivor hp%"],
      rates.map((r) => [
        r.jobId,
        r.battles,
        pct(r.winRate),
        pct(r.asPlayerWinRate),
        r.stalemates,
        num(r.meanTurns),
        num(r.meanSurvivorHpPercent),
      ]),
    ),
  );
  out.push("");
  for (const level of config.levels) {
    const slice = duels.filter((b) => b.tags.level === level);
    if (slice.length === 0) continue;
    out.push(`**Level ${level}** (${slice.length} battles)`);
    out.push("");
    out.push(
      table(
        ["job", "battles", "win%"],
        jobWinRates(slice).map((r) => [r.jobId, r.battles, pct(r.winRate)]),
      ),
    );
    out.push("");
  }
  for (const mapId of [...new Set(duels.map((b) => b.tags.map))].sort()) {
    const slice = duels.filter((b) => b.tags.map === mapId);
    out.push(`**Map ${mapId}** (${slice.length} battles)`);
    out.push("");
    out.push(
      table(
        ["job", "battles", "win%"],
        jobWinRates(slice).map((r) => [r.jobId, r.battles, pct(r.winRate)]),
      ),
    );
    out.push("");
  }

  out.push("### Pair matrix (player win% by row against column, arena only)");
  out.push("");
  const arena = duels.filter((b) => b.tags.map === "sim-arena");
  const pairs = pairTable(arena);
  out.push(
    table(
      ["player \\ enemy", ...jobs],
      jobs.map((player) => [
        player,
        ...jobs.map((enemy) => {
          const row = pairs.find((p) => p.player === player && p.enemy === enemy);
          if (row === undefined || row.battles === 0) return "-";
          return `${pct(row.playerWins / row.battles)}${row.stalemates > 0 ? `*${row.stalemates}` : ""}`;
        }),
      ]),
    ),
  );
  out.push("");
  out.push("`*n` marks n stalemates folded into the denominator.");
  out.push("");

  // --- decisiveness / side bias ---
  const decided = decisiveness(duels);
  out.push("## 2. Decisiveness and side bias");
  out.push("");
  out.push(
    table(
      ["metric", "value"],
      [
        ["battles", decided.battles],
        ["stalemates (command cap)", decided.stalemates],
        ["first unit down inside the first round", `${decided.firstRoundDowns} (${pct(decided.firstRoundDowns / Math.max(1, decided.battles))})`],
        ["battles with no unit downed", decided.noDowns],
        ["mean unit turns", num(decided.meanTurns)],
        ["mean commands", num(decided.meanCommands)],
      ],
    ),
  );
  out.push("");
  out.push(
    table(
      ["map", "same-vs-same battles", "deploying side win%", "stalemates"],
      deploymentSideBias(duels).map((r) => [r.mapId, r.battles, pct(r.playerWinRate), r.stalemates]),
    ),
  );
  out.push("");
  if (bundle.tempo.length > 0) {
    out.push("Same job on both sides, with the deploying side holding first the lower and then the higher unit ids");
    out.push("(unit id breaks CT ties, so the lower id acts first):");
    out.push("");
    const tempoRows: (string | number)[][] = [];
    for (const mapId of [...new Set(bundle.tempo.map((b) => b.tags.map))].sort()) {
      for (const order of ["player-first", "enemy-first"]) {
        const slice = bundle.tempo.filter((b) => b.tags.map === mapId && b.tags.variant === order);
        if (slice.length === 0) continue;
        const wins = slice.filter((b) => b.record.outcome === "win").length;
        const stale = slice.filter((b) => b.record.outcome === "stalemate").length;
        tempoRows.push([mapId, order, slice.length, pct(wins / slice.length), stale]);
      }
    }
    out.push(table(["map", "id order", "battles", "deploying side win%", "stalemates"], tempoRows));
    out.push("");
  }
  const stales = stalemateMatchups(duels);
  if (stales.length > 0) {
    out.push(
      table(
        ["player", "enemy", "map", "level", "stalemates"],
        stales.slice(0, 20).map((r) => [r.player, r.enemy, r.map, r.level, r.battles]),
      ),
    );
    out.push("");
  }

  // --- ability usage ---
  out.push("## 3. Ability usage");
  out.push("");
  const usage = abilityUsage(library, duels, jobs);
  out.push(
    table(
      ["job", "actions chosen", "distinct abilities used", "abilities offered"],
      jobs.map((job) => {
        const rows = usage.rows.filter((r) => r.jobId === job);
        return [job, usage.totalActionsByJob[job] ?? 0, rows.filter((r) => r.uses > 0).length, rows.length];
      }),
    ),
  );
  out.push("");
  out.push("### Never chosen");
  out.push("");
  out.push(
    usage.neverUsed.length === 0
      ? "None."
      : table(
          ["job", "ability", "unit-battles holding it"],
          usage.neverUsed.map((r) => [r.jobId, r.abilityId, r.offered]),
        ),
  );
  out.push("");
  out.push("### Dominating (>40% of the kit's chosen actions)");
  out.push("");
  out.push(
    usage.dominating.length === 0
      ? "None."
      : table(
          ["job", "ability", "uses", "share"],
          usage.dominating.map((r) => [r.jobId, r.abilityId, r.uses, pct(r.share)]),
        ),
  );
  out.push("");
  out.push("### Full usage table");
  out.push("");
  out.push(
    table(
      ["job", "ability", "chosen", "share", "resolved"],
      usage.rows.filter((r) => r.offered > 0).map((r) => [r.jobId, r.abilityId, r.uses, pct(r.share), r.resolutions]),
    ),
  );
  out.push("");

  // --- flux ---
  out.push("## 4. Charge economy");
  out.push("");
  out.push(
    table(
      ["job", "unit-battles", "pool", "mean end flux", "mean floor", "never spent", "never below 75%"],
      fluxEconomy(duels).map((r) => [
        r.jobId,
        r.units,
        num(r.maxCharge),
        num(r.meanEndCharge),
        num(r.meanMinCharge),
        pct(r.neverSpent),
        pct(r.neverBound),
      ]),
    ),
  );
  out.push("");

  // --- comps ---
  out.push("## 5. Mixed comps (4v4, arena)");
  out.push("");
  const compRows: (string | number)[][] = [];
  for (const level of [...new Set(comps.map((b) => b.tags.level))].sort((a, b) => a - b)) {
    for (const job of jobs) {
      const label = `mono-${job}`;
      const asPlayer = comps.filter((b) => b.tags.level === level && b.tags.player === "balanced" && b.tags.enemy === label);
      const asEnemy = comps.filter((b) => b.tags.level === level && b.tags.player === label && b.tags.enemy === "balanced");
      const balancedWins =
        asPlayer.filter((b) => b.record.outcome === "win").length +
        asEnemy.filter((b) => b.record.outcome === "loss").length;
      const n = asPlayer.length + asEnemy.length;
      if (n === 0) continue;
      const turns = [...asPlayer, ...asEnemy].reduce((s, b) => s + b.record.turns, 0) / n;
      compRows.push([level, label, n, pct(balancedWins / n), num(turns)]);
    }
  }
  out.push(table(["level", "mono comp", "battles", "balanced comp win%", "mean turns"], compRows));
  out.push("");

  // --- encounters ---
  out.push("## 6. Shipped encounters");
  out.push("");
  const encRows: (string | number)[][] = [];
  for (const sweep of ["encounter-authored", "encounter-chapter"]) {
    for (const encounterId of [...new Set(encounters.map((b) => b.tags.enemy))].sort()) {
      const slice = encounters.filter((b) => b.tags.sweep === sweep && b.tags.enemy === encounterId);
      if (slice.length === 0) continue;
      const counts = outcomeCounts(slice);
      const margin = slice.reduce((s, b) => s + survivorMargin(b.record, "player"), 0) / slice.length;
      const turns = slice.reduce((s, b) => s + b.record.turns, 0) / slice.length;
      const losses = slice.reduce(
        (s, b) => s + b.record.units.filter((u) => u.team === "player" && u.downed).length,
        0,
      ) / slice.length;
      encRows.push([
        encounterId,
        sweep.replace("encounter-", ""),
        slice[0]!.tags.level,
        slice.length,
        pct(counts.win / slice.length),
        counts.stale,
        num(margin),
        num(losses, 2),
        num(turns),
      ]);
    }
  }
  out.push(
    encRows.length === 0
      ? "No encounters found in `data/encounters`."
      : table(
          ["encounter", "levels", "level", "battles", "party win%", "stalemates", "mean surviving party hp%", "mean party losses", "mean turns"],
          encRows,
        ),
  );
  out.push("");

  // --- TTK ---
  out.push("## 7. TTK matrix (scripted weapon duels, no abilities, no armor, no passives)");
  out.push("");
  const baselineCells = ttkMatrix(library, jobs, config.ttkLevels, config.ttkSeeds);
  out.push(ttkSection(baselineCells, jobs, config.ttkLevels));
  out.push("### Summary");
  out.push("");
  out.push(
    table(
      ["level", "mean swings to down", "one-shot pairings", "pairings"],
      ttkSummary(baselineCells).map((r) => [r.level, num(r.meanHits, 2), r.oneShots, r.cells]),
    ),
  );
  out.push("");

  // --- variants ---
  if (variants.length > 0) {
    out.push("## 8. Core-formula candidates");
    out.push("");
    const variantRows: (string | number)[][] = [];
    for (const variant of [null, ...variants]) {
      for (const level of config.ttkLevels) {
        if (variant !== null && !variant.exactAt(level)) continue;
        const lib = applyVariant(library, variant ?? BASELINE, level);
        // `damagePerHit` and `hitsToDown` are deterministic, so one seed is the whole cell.
        const cells = ttkMatrix(lib, jobs, [level], config.ttkSeeds.slice(0, 1));
        const finite = cells.filter((c) => Number.isFinite(c.hitsToDown));
        variantRows.push([
          variant?.id ?? "baseline",
          level,
          "exact",
          num(finite.reduce((n, c) => n + c.hitsToDown, 0) / Math.max(1, finite.length), 2),
          finite.filter((c) => c.hitsToDown <= 1).length,
          finite.length,
        ]);
      }
    }
    out.push(
      table(
        ["variant", "level", "emulation", "mean swings to down", "one-shot pairings", "pairings"],
        variantRows,
      ),
    );
    out.push("");

    out.push("### Variant duel sweeps (arena, mirror-adjusted)");
    out.push("");
    const varRows: (string | number)[][] = [];
    for (const variant of variants) {
      const slice = bundle.variants.filter((b) => b.tags.variant === variant.id);
      if (slice.length === 0) continue;
      for (const level of config.levels) {
        const levelSlice = slice.filter((b) => b.tags.level === level);
        if (levelSlice.length === 0) continue;
        const d = decisiveness(levelSlice);
        const spread = jobWinRates(levelSlice);
        const high = Math.max(...spread.map((r) => r.winRate));
        const low = Math.min(...spread.map((r) => r.winRate));
        varRows.push([
          variant.id,
          level,
          levelSlice.length,
          num(d.meanTurns),
          `${d.firstRoundDowns} (${pct(d.firstRoundDowns / Math.max(1, d.battles))})`,
          d.stalemates,
          `${pct(low)}–${pct(high)}`,
        ]);
      }
    }
    const baselineArena = duels.filter((b) => b.tags.map === "sim-arena");
    for (const level of config.levels) {
      const levelSlice = baselineArena.filter((b) => b.tags.level === level);
      if (levelSlice.length === 0) continue;
      const d = decisiveness(levelSlice);
      const spread = jobWinRates(levelSlice);
      varRows.unshift([
        "baseline",
        level,
        levelSlice.length,
        num(d.meanTurns),
        `${d.firstRoundDowns} (${pct(d.firstRoundDowns / Math.max(1, d.battles))})`,
        d.stalemates,
        `${pct(Math.min(...spread.map((r) => r.winRate)))}–${pct(Math.max(...spread.map((r) => r.winRate)))}`,
      ]);
    }
    out.push(
      table(
        ["variant", "level", "battles", "mean turns", "first-round downs", "stalemates", "job win% spread"],
        varRows,
      ),
    );
    out.push("");
  }

  // --- ai weights ---
  if (bundle.weights.length > 0) {
    out.push("## 9. AI weight tables (arena duels, content untouched)");
    out.push("");
    const tables = [...new Set(bundle.weights.map((b) => b.tags.weights))];
    const weightRows: (string | number)[][] = [];
    for (const id of tables) {
      const slice = bundle.weights.filter((b) => b.tags.weights === id);
      const usage = abilityUsage(library, slice, jobs);
      const top = [...usage.rows].sort((a, b) => b.share - a.share)[0];
      const d = decisiveness(slice);
      const spread = jobWinRates(slice);
      weightRows.push([
        id,
        slice.length,
        usage.neverUsed.length,
        usage.dominating.length,
        top === undefined ? "-" : `${top.jobId}/${top.abilityId} ${pct(top.share)}`,
        num(d.meanTurns),
        `${pct(Math.min(...spread.map((r) => r.winRate)))}–${pct(Math.max(...spread.map((r) => r.winRate)))}`,
      ]);
    }
    out.push(
      table(
        ["weights", "battles", "abilities never chosen", "abilities >40%", "most-chosen", "mean turns", "job win% spread"],
        weightRows,
      ),
    );
    out.push("");
    for (const id of tables) {
      const slice = bundle.weights.filter((b) => b.tags.weights === id);
      const usage = abilityUsage(library, slice, jobs);
      out.push(
        `**${id}** never chose: ${usage.neverUsed.length === 0 ? "nothing" : usage.neverUsed.map((r) => `${r.jobId}/${r.abilityId}`).join(", ")}`,
      );
      out.push("");
    }
  }

  // --- flags ---
  out.push("## 10. Mechanical flags");
  out.push("");
  const flags = findings(library, duels, jobs);
  out.push(
    flags.length === 0
      ? "None."
      : table(
          ["severity", "code", "detail"],
          flags.map((f) => [f.severity, f.code, f.detail]),
        ),
  );
  out.push("");

  return out.join("\n");
}

export interface MainOptions {
  full?: boolean;
  variants?: readonly Variant[];
  weightTables?: readonly WeightTable[];
  content?: SimContent;
}

export function runSweepReport(opts: MainOptions = {}): { report: string; bundle: SweepBundle } {
  const config: SweepConfig = opts.full === true ? FULL_CONFIG : CI_CONFIG;
  const variants = opts.variants ?? (opts.full === true ? CANDIDATE_VARIANTS : []);
  const weightTables = opts.weightTables ?? (opts.full === true ? CANDIDATE_WEIGHTS : []);
  const bundle = runAllSweeps(config, variants, opts.content ?? simContent(), weightTables);
  return { report: renderReport(bundle, variants), bundle };
}

export { CI_CONFIG, FULL_CONFIG, JOB_IDS };
