# Balance Report — the Foundry Chapter slice

What 2,591 headless AI-versus-AI battles say about the shipped numbers, and the
changeset the next wave should make. Measurement only: this wave touched no
content, no core rules, and no AI weights.

Governing docs: `docs/COMBAT_RULES.md` (the formulas), `docs/CONTENT_NOTES.md`
(why the numbers are what they are), `docs/AI_DESIGN.md` (what the AI can and
cannot see). Workstream 20 in `docs/PROJECT_BREAKDOWN.md`; this report answers
findings-queue item 6.

> **Status (rebalance pass, 2026-08-15).** Everything below §4 is the
> *pre-rebalance* record and is kept as written, because it is the evidence the
> changeset was argued from. **§6 is the post-rebalance measurement** — job
> spread, never-chosen count, encounter win rates, TTK matrix, and the
> remaining imbalances with reasons. Read §6 first if you want the shipped
> numbers; read F1–F7 if you want to know why they are what they are.
>
> Trail: **§4(b) applied** by the engine pass (level-scaled divisor
> `D(L) = 400 + 250(L-1)`, level 1 byte-identical). **§4(c) C1 and C3–C5
> applied** in `src/core/ai/`. **§4(a) superseded** — the data changes were
> re-derived from scratch after the engine pass, because three of the seven
> read differently once the AI could see the whole kit; §6 records what
> actually shipped.
>
> **§7 is the AI pass (2026-08-15).** G1–G7 and G9 fixed or discharged in
> `src/core/ai/`; no content, no core rules, no engine. Read §7 for what the
> search can see now and what it cost; read §6.7 for why each change was made.
>
> **§7.8.4–§7.8.6 are the instrumentation pass (2026-08-16).** §7.8.3's
> throwaway counters are folded into `src/sim/analysis.ts` and the
> two-disjoint-seed-set discipline into `src/sim/sweeps.ts`. e4 is re-read
> under the objective-aware AI (§7.8.4), e2 and e5 re-validated under the
> current trigger engine (§7.8.5), and the ability-usage denominator corrected
> (§7.8.6, which supersedes one number in §7.8.1). Instrument and measurement
> only: no content, no core rules, no AI weights, and nothing retuned.
>
> **§7.8.7 applies §7.8.4's proposal (2026-08-16)** and is the one content
> change in the §7.8.x run: e4's `reachTiles` win is gated on `marek-sump`,
> which lands the encounter at **81.3% pooled**. One line of
> `data/encounters/e4-refinery-three.json`; no schema, no core rules, no AI
> weights, nothing else on any encounter.
>
> **`src/sim/variants.ts` was rebased onto the live engine (cleanup pass,
> 2026-08-15).** `divisorVariant()` used to emulate a fix that is now *in* the
> engine, so running it double-applied the divisor. It now expresses the
> per-level divisor slope as a delta against `damageDivisor`, with the live 250
> as the identity: `divisorVariant(LIVE_PER_LEVEL)` returns the library
> untouched at every level, asserted in `tests/sim/variants.test.ts`, and it is
> the control row in `CANDIDATE_VARIANTS`. `hpBaseVariant` and `statBaseVariant`
> are unchanged and are labelled as the rejected alternatives they always were.
> §4(b)'s variant table is still historical evidence for a decision already
> taken; §6's numbers still come from a variant-free sweep.

---

## 0. How to reproduce

The instrument is `src/sim/`, driven through vitest. Node cannot run it
directly: `src/core` imports itself with `.js` specifiers that resolve to `.ts`
sources, and `node --experimental-strip-types` does not rewrite them.

```sh
# the CI-sized smoke sweep plus every harness test — about 12 seconds
npx vitest run tests/sim

# the full measurement run behind F1-F7 — about 5 minutes
GREYFALL_SIM=full GREYFALL_SIM_OUT=/tmp/greyfall-sweep.md \
  npx vitest run tests/sim/sweeps.test.ts
```

**For §6's numbers, drop the variant and weight sweeps.** `GREYFALL_SIM=full`
still passes `CANDIDATE_VARIANTS`, which now costs a control row that
reproduces baseline exactly plus three alternatives already rejected — correct,
but not what §6 measures. The post-rebalance sweep is the same `FULL_CONFIG`
with the synthetic engines switched off — 1,268 battles, about four minutes:

```ts
// tests/sim/<anything>.test.ts
const { report } = runSweepReport({ full: true, variants: [], weightTables: [] });
```

**§6.4's encounter numbers are a separate pass**, because `encounterSweep`
plays five seeds and reports no Standing. The recipe, for whoever adopts it
into `src/sim`: walk `campaign.encounterIds` in order; for each, deploy
`campaign.startingRosterUnitIds.slice(0, min(maxDeployedUnits, deployTiles,
roster))` on `orderedDeployTiles(map)` at the units' authored levels; run
`runBattle(library, { kind: "encounter", ... }, seed, { commandCap: 900 })` over
ten seeds; and accumulate `unit.standingEarned` per unit so `jobLevelFor` can be
read at each step. Ten seeds matters: at five, a single configuration of e5 read
anywhere from 0% to 100%.

**The §7.8.x encounter runs are one call now** (instrumentation pass,
2026-08-16). `encounterRuns(content, ids, seeds, { commandCap: 4000 })` in
`src/sim/sweeps.ts` builds exactly that party — campaign roster in join order,
authored levels, the map's own deployment tiles — and `PRIMARY_ENCOUNTER_SEEDS`
(`101 + 37n`) and `ALT_ENCOUNTER_SEEDS` (`103 + 41n`) are the two disjoint
24-seed sets every landing in §7.8.x is confirmed on. `encounterReports` turns
the result into win rates with the battlefield counters beside them (§7.8.6).

The second command writes the complete measurement dump — every table quoted
below, plus the full 7x7 pair matrix, the full ability-usage table, and the
whole TTK matrix at five levels — to `GREYFALL_SIM_OUT` and to stdout. Section
numbers in the dump are referenced as **[dump §N]** throughout.

Sweep sizes are set in `FULL_CONFIG` (`src/sim/sweeps.ts`).

---

## 1. Method, and what it cannot tell you

**The harness.** `runBattle(content, target, seed, opts)` drives both teams with
`chooseCommand`, records per-unit damage / healing / ability choices / standing
/ objects / flux floors from the event stream, and stops at a command cap that
reports `stalemate` rather than hanging (`docs/AI_DESIGN.md` bounds hesitation,
not battle length). Targets are either a shipped encounter or a matchup built in
code — on a bare 12x12 arena with no objects and no height, or on an authored
map.

**Sample size is seeds.** The engine and the AI are both deterministic, so two
runs of the same matchup differ only through `rngSeed`, which drives accuracy
rolls, status chances, and reaction triggers. Every duel cell is 3 seeds
(101 / 202 / 303). That is enough to see *whether* the dice matter and not much
more: a great many cells come out 0% or 100% across all three seeds, which means
those matchups are decided by kit and geometry rather than by rolls. Read
per-cell numbers as "decided/contested", and per-job numbers (216 battles each)
as the real quantity.

**Job rows are not independent samples.** A job's 216 duels are 6 opponents x 3
levels x 3 seeds x 2 maps against the same six opponents everyone else faced.
Treat the ordering as solid and the exact percentage as ±5 points.

**Both sides are the AI.** Encounter win rates are a floor for a competent
human, not a prediction. Where the AI provably cannot see an ability (F3), the
content read is suspended rather than reported.

**Nothing was censored.** 0 of 882 duels hit the command cap, so no result is a
truncation artifact.

**Kits are maximal.** A sweep unit carries every action ability its job can
learn plus its first reaction, support, and movement ability — deliberately,
because an ability can only be called dead if the AI was actually holding it.
Real units at these levels know fewer.

---

## 2. Findings, ranked

### F1 — Time-to-kill collapses; by L3 ten of 49 pairings are one-shots (severity 1)

Measured, not projected: scripted duels with no abilities, no armour, and no
passives, one unit swinging its weapon at another until it falls **[dump §7]**.

| Level | mean swings to down (49 pairings) | one-shot pairings |
|---|---|---|
| 1 | 7.45 | 0 / 49 |
| 2 | 4.00 | 5 / 49 |
| 3 | 3.33 | 10 / 49 |
| 4 | 2.78 | 13 / 49 |
| 5 | 2.63 | 16 / 49 |

The L1 row reproduces `docs/CONTENT_NOTES.md` §6 exactly — Augmented 27,
Enforcer 20, Saboteur 14, Railrunner 13, Machinist 9, Chemist 6, Conduit 2, and
4 swings for an Enforcer mirror — which is the harness validating itself against
the authored table (`tests/sim/telemetry.test.ts` asserts all seven).

The consequence shows up in the AI sweep too: first-round downs go 0% (L1) to
5% (L3) to 14% (L5) **[dump §8]**, and mean duel length falls from 12.7 unit
turns at L1 to 8.3 at L5 while the units get bigger.

The content agent's diagnosis is confirmed and the fix is core-side; see §4(b).

### F2 — The job spread is 16% to 89%, and it is not level-dependent noise (severity 1)

Mirror-adjusted duel win rates, 216 battles per job, mirrors excluded, both
orientations of every pair played so side advantage cancels **[dump §1]**:

| job | win% | L1 | L3 | L5 | mean turns | mean survivor hp% |
|---|---|---|---|---|---|---|
| enforcer | **89%** | 82% | 89% | 97% | 10.2 | 73.6 |
| railrunner | **81%** | 96% | 75% | 72% | 5.6 | 89.4 |
| augmented | 64% | 53% | 69% | 69% | 11.5 | 53.7 |
| saboteur | 52% | 58% | 53% | 46% | 6.6 | 83.1 |
| chemist | **30%** | 29% | 22% | 39% | 13.0 | 80.8 |
| conduit | **18%** | 3% | 38% | 13% | 7.2 | 71.0 |
| machinist | **16%** | 29% | 4% | 14% | 9.2 | 74.5 |

Five of seven jobs are outside the 35–65% band. The Enforcer wins on both maps
(88% yard, 91% arena) at every level. The Railrunner's 96% at L1 is the single
most extreme cell in the sweep: Speed 8 against everyone else's 5–6 is a third
more turns, and Undercut (38% of its actions) applies Fouled, CT x60%, which
compounds the lead.

The Chemist's and Conduit's numbers are partly structural — a 1v1 round robin
has nothing for a support kit to support — so the comp sweep is the fairer read
for them, and it is kinder: a balanced four (Enforcer / Conduit / Chemist /
Railrunner) beats five of the seven mono-fours **[dump §5]**. It loses to
mono-Railrunner (25% / 0% / 0% at L1 / L2 / L3) and splits with mono-Enforcer,
which is the same two jobs again.

The Machinist has no such excuse: 16% overall and 4% at L3, and its entire board
kit is unreachable (F3).

### F3 — 16 of the 37 job action abilities were never chosen in 882 duels (severity 2)

**[dump §3]**, each offered in 252 unit-battles. (The 44 rows in the dump's
usage table include each job's synthesized weapon attack, which every job uses.)

| job | never chosen |
|---|---|
| augmented | rejection |
| chemist | bracer-shot, field-transfusion |
| conduit | overload-cell, tap-line, throw-the-breaker |
| enforcer | kettle |
| machinist | field-repair, sentry-frame, skitter-drone, tripwire-charge |
| railrunner | coupling-hook, signal-jump |
| saboteur | bring-it-down, gas-line-tap, smoke-canister |

These have three different causes and must not be tuned as if they had one.

**Invisible to the search (an AI defect, not a content one).**
- `tap-line` gives an ally +10 flux. `extraEffectValue` in `src/core/ai/score.ts`
  prices `modifyCharge` as `max(0, -amount)` — a *gift* of flux is worth
  literally zero, so the ability can never score above the act threshold. This
  is not tunable from `weights.ts`.
- `field-repair` heals an object, and `objectHitValue` credits repair only when
  `obj.owner === ctx.actor.team`. Authored map objects have `owner: null`, so
  repairing anything on a map is worth 0; only the Machinist's own spawned
  objects would count, and it never spawns any (below). Circular.
- `throw-the-breaker` is scored solely through `powerSwingValue`, which returns 0
  unless the object carries a `surfaceHeight` deck with somebody standing on it.

**Priced out by the chip cliff.** `abilityValue` subtracts a flat
`chipPenalty` (250) from anything with `chargeCost > 0` whose gross value is
under `chipThreshold` (200 = about 20 HP). At levels 1–3 most of a kit's
utility clears neither bar. Raising the threshold to 60 in the weights sweep
brought `bracer-shot`, `tripwire-charge`, and `smoke-canister` back into use at
no measurable cost **[dump §9]**.

**Genuinely mispriced content.** `kettle` survives every AI variant tried: a
70% root, 2 turns, for 4 flux *and* a forfeited turn (castSpeed 40) is worth
less to the Enforcer than one free Pin (weapon 80 + 60% Stun, 0 flux). The
Machinist's three deployables are inert by construction
(`docs/CONTENT_NOTES.md` §7.1) — a turret that does not shoot is 8 flux for an
obstacle — and no pricing makes that a good action.

### F4 — Three kits spend most of their turns buffing themselves (severity 2)

Share of each kit's chosen actions **[dump §3]**:

| job | ability | share | of N actions |
|---|---|---|---|
| augmented | overdrive | **75%** | 1134 |
| machinist | crossfeed | **74%** | 1067 |
| enforcer | breach-posture | **59%** | 1113 |
| saboteur | basic-attack | 51% | 615 |
| chemist | basic-attack | 48% | 1243 |
| saboteur | bring-the-house | 42% | 615 |

The top three are the same mechanism. A buff on a friendly unit reaches the
score as *negative harm*, and `sideValue` then multiplies harm by
`selfHarmPercent` (200) or `friendlyHarmPercent` (150) — percentages written to
make the AI avoid hurting its own side, which also **double the value of helping
it**. Overclocked (`ctMultiplierPercent: 160`, 3 turns) prices at
`(100-160) x statusCtPerPercent 4 = -240`, doubled for duration to -480, then
doubled again on self: **+960, more than twice the kill bonus of 400**. The
Augmented pays 6 flux and 8 HP for that, three times a battle, and still wins
64% of its duels.

Both halves are real. Neutralising the multiplier alone (`selfHarmPercent` 200 →
100) only moves Overdrive from 75% to 70% of the Augmented's actions **[dump
§9]**, because Overclocked's base valuation is large on its own. So this is the
AI distorting a content read *and* a content number that wants looking at — and
it is why the Enforcer and Augmented rows in F2 should be re-measured after the
AI change, before their data is touched.

### F5 — Acting first loses the mirror; no map is actually lopsided (severity 2)

Same job on both sides, 63 battles per cell **[dump §2]**:

| map | deploying side holds… | deploying side win% |
|---|---|---|
| sim-arena | the lower unit ids (acts first on a CT tie) | 35% |
| sim-arena | the higher unit ids | 52% |
| marshaling-yard | the lower unit ids | 41% |
| marshaling-yard | the higher unit ids | 68% |

The raw 35% on a perfectly symmetric arena trips the >65% side-bias flag, but
swapping only the unit ids moves it 17 points on the arena and 27 on the yard.
The bias tracks **who acts first**, not which band it deploys on: the first
mover walks into contact and eats the first blow. Averaging the two orderings
leaves the arena at 43% and the yard at 55% — the yard's deployment corner is
mildly favourable, well inside tolerance, and no map is broken.

Worth recording as a design fact rather than a bug: in this engine, tempo in a
duel is a liability, which is the opposite of the usual expectation and matters
for how the first turn of an encounter is authored.

### F6 — Encounters e2–e5 are unwinnable by the roster at its authored levels (severity 2)

Campaign roster (`foundry-chapter`), first `maxDeployedUnits` units in roster
order, on the map's own deployment tiles, 5 seeds each **[dump §6]**:

| encounter | party levels | party win% | mean party losses | mean surviving hp% |
|---|---|---|---|---|
| e1-marshaling-yard | authored (1–2) | 100% | 0.00 | 94.2 |
| e2-foundry-floor-nine | authored (1–2) | **0%** | 4.00 (of 4) | 0.0 |
| e3-tallow-row | authored (1–2) | **0%** | 5.00 (of 5) | 0.0 |
| e4-refinery-three | authored (1–2) | **0%** | 5.00 (of 5) | 0.0 |
| e5-charterhouse-steps | authored (1–2) | **0%** | 3.80 (of 5) | 18.9 |
| e1-marshaling-yard | chapter-scaled (L1) | 100% | 0.00 | 94.0 |
| e2-foundry-floor-nine | chapter-scaled (L2) | 40% | 2.80 | 26.5 |
| e3-tallow-row | chapter-scaled (L3) | 60% | 2.40 | 30.9 |
| e4-refinery-three | chapter-scaled (L4) | 100% | 1.40 | 58.9 |
| e5-charterhouse-steps | chapter-scaled (L5) | 80% | 2.00 | 54.5 |

"Chapter-scaled" is the sim's assumption that the party gains one level per
chapter step; it is not authored anywhere, and the gap between the two blocks is
the finding. The encounters are built for a party several levels above the one
`data/units` ships, and e1 is a walkover at either.

Caveat: the player side is AI-driven with authored (not optimised) loadouts, so
these are lower bounds. But a 0% / total-wipe result across 5 seeds and four
encounters is not a play-skill gap. Either the roster levels rise, or e2–e4
soften; that call belongs to the progression and encounter workstreams — the
number they need is that **e2 at party level 2 is a 40% win costing 2.8 of 4
units**, which is a chapter-two difficulty spike.

### F7 — The flux economy does not bind for the two big pools (severity 3)

**[dump §4]**, 252 unit-battles per job:

| job | pool | mean end flux | never spent any | never fell below 75% of pool |
|---|---|---|---|---|
| conduit | 53.0 | 33.4 | 1% | **42%** |
| chemist | 26.0 | 15.3 | 1% | **39%** |
| enforcer | 9.3 | 4.0 | **24%** | 30% |
| machinist | 37.0 | 14.4 | 10% | 19% |
| augmented | 30.7 | 10.8 | 11% | 19% |
| saboteur | 17.7 | 7.8 | 1% | 14% |
| railrunner | 16.7 | 8.2 | 0% | 13% |

The Conduit ends the average battle sitting on 63% of a 53-point pool while
losing 82% of its duels — it is not losing because it ran out of flux, it is
losing because what the flux buys is not worth buying (Arc does 10 damage at a
50/50 disposition; a free maul swing does 20). `docs/CONTENT_NOTES.md` §3 sizes
charge costs "against each job's own pool", and that sizing holds — the pool is
simply larger than the kit's appetite. The Enforcer's near-decorative 9-point
pool, unspent in 24% of battles, is intended and reads correctly.

---

## 3. What was not found

- **No stalemates.** 0 of 882 duels and 0 of 50 encounter battles hit the
  command cap. The `urgency` valve does its job.
- **No first-turn-decided battles at level 1.** The 6% overall figure (53 of
  882) is entirely levels 3 and 5, and is a symptom of F1 rather than a separate
  problem.
- **No broken map.** See F5.

---

## 4. Proposed changeset for the next wave

Ordered by confidence. Every item names the number it moves and the measurement
that would confirm it.

### (a) Data-only

Do **(c)** first. Three of these read differently once the AI can see the whole
kit, and they are marked.

| # | file | change | expected effect |
|---|---|---|---|
| A1 | `data/jobs/railrunner.json` | `speed.multiplierPercent` 115 → 105 (L1 Speed 8 → 7, L3 19 → 17) | the biggest single outlier in the sweep: L1 win rate 96% → target 70–75%, overall 81% → mid-60s. Speed is the Railrunner's whole engine, so this is the one number that moves it without touching its kit. |
| A2 | `data/abilities/undercut.json` | Fouled `chance` 55 → 35 | Undercut is 38% of Railrunner actions; Fouled (CT x60%) compounds a lead it already has. Pairs with A1; apply one, re-measure, then decide on the other. |
| A3 | `data/abilities/arc.json` | `power` 8 → 14, `chargeCost` 4 → 3 | Arc at a 50/50 disposition deals `floor(10*8/2)=40 → x50% → x50% = 10` for 4 flux against a free 20-damage maul swing. At 14/3 it deals 17 for 3. Target: Conduit L1 3% → 25%+. The double Attunement scaling (`COMBAT_RULES` §3) is the amplifier and is a rule, not data — this is the data-side half. |
| A4 | `data/statuses/overclocked.json` | `ctMultiplierPercent` 160 → 130, `duration.turns` 3 → 2 | drives *both* the Augmented's Overdrive loop and the Machinist's Crossfeed loop. **Re-measure after (c)** — the 75%/74% usage shares are partly the AI's self-buff amplification. |
| A5 | `data/statuses/braced.json` | `statMods.evade` 18 → 12 | Breach Posture is 59% of Enforcer actions and is a large part of an 89% win rate. **Re-measure after (c).** |
| A6 | `data/abilities/kettle.json` | `chargeCost` 4 → 2, `castSpeed` 40 → 60 | the only Enforcer ability no AI variant would ever choose. A 2-turn root that costs a turn, 4 flux, and a cast loses to a free Pin. Cheaper and faster makes it a real second option. |
| A7 | `data/encounters/e2-foundry-floor-nine.json` (encounter workstream) | soften, or raise the roster's authored levels | 0% win at authored levels, 40% at L2 with 2.8 of 4 units lost. This is a call for the encounter and progression workstreams; the sim gives them the number. |

**Not proposed:** any Machinist tuning. Its four never-used abilities are
`spawnObject` deployables that do nothing once placed (findings-queue item 1).
Any number set now will be re-set when spawned objects act, and its 16% win rate
is not a pricing problem.

### (b) Core formula — the TTK fix

Three candidates were simulated, not projected. Each was expressed exactly as a
synthetic job clone (`src/sim/variants.ts`; the identities are asserted against
`deriveStats` in `tests/sim/variants.test.ts`) and run through the same scripted
TTK matrix and a 49-pair arena duel sweep **[dump §8]**.

| candidate | L1 | L2 | L3 | L4 | L5 | one-shot pairings, L1→L5 |
|---|---|---|---|---|---|---|
| **shipped** | 7.45 | 4.00 | 3.33 | 2.78 | 2.63 | 0 → 5 → 10 → 13 → **16** |
| `STAT_BASE.hp` 40 → 160 | 24.63 | 11.57 | 8.49 | 6.57 | 5.57 | 0 → 0 → 0 → 0 → 0 |
| `STAT_BASE.phys` 0 → 15 | 1.82 | — | 1.67 | — | 1.61 | **22** → 28 → 31 (L1/L3/L5) |
| **divisor 400 + 250(L-1)** | 7.45 | 7.59 | 6.84 | 7.69 | 8.35 | 0 → 0 → 0 → 0 → 0 |
| divisor 400 + 150(L-1) | 7.45 | 5.76 | 6.29 | 5.31 | 5.61 | 0 → 0 → 0 → 0 → 0 |

(mean swings to down over all 49 pairings; `—` = the variant is not exactly
expressible at that level, so it was not run rather than approximated)

**Raising `STAT_BASE.hp` cannot work, and the reason is structural.** With
`hp = (B + g_hp·L)·m/100` and damage proportional to `g_phys·L`, TTK tends to
`g_hp·m_hp / (g_phys·m_phys·w)` as L grows — a constant that `B` does not
appear in. Raising `B` only lifts the low-level end. At 160 it makes a level-1
battle 24.6 swings long (3.3x the shipped pace, 34.8 mean unit turns, and the
only stalemates in the whole sweep) and *still* decays to 5.57 by level 5.

**A non-zero `STAT_BASE.phys` is worse than the disease.** It flattens *damage*
growth rather than HP growth, so it raises low-level damage enormously: at 15 it
produces **22 one-shot pairings at level 1**, 37% first-round downs, and 6.2-turn
duels. It still collapses (1.82 → 1.61).

**Recommendation: level-scale the damage divisor. — Applied.**

```ts
// src/core/rules/damage.ts
export const WEAPON_DAMAGE_DIVISOR = 400;         // unchanged; D(1) === 400
export const DAMAGE_DIVISOR_PER_LEVEL = 250;
export function damageDivisor(level: number): number {
  return WEAPON_DAMAGE_DIVISOR + DAMAGE_DIVISOR_PER_LEVEL * (level - 1);
}
```

applied to the **caster's** level, in all three stat-derived amount bases so the
weapon kits and the caster kits move together (`COMBAT_RULES` §4):

| base | now | proposed |
|---|---|---|
| `weapon` | `floor(phys * weaponPower * power / 400)` | `floor(phys * weaponPower * power / D(L))` |
| `phys` | `floor(phys * power / 2)` | `floor(phys * power * 200 / D(L))` |
| `mag` | `floor(mag * power / 2)` | `floor(mag * power * 200 / D(L))` |
| `fixed`, `maxHpPercent` | unchanged | unchanged |

At L1, `D(1) = 400` and `200/400 = 1/2`, so **every level-1 number in
`COMBAT_RULES` §4, `CONTENT_NOTES` §6, and `tests/core/damage.test.ts` is
byte-identical**. Nothing in the shipped slice's opening battle changes.

Fixing weapon damage alone was rejected: the Saboteur's kit is all `base: phys`
and the Conduit's all `base: mag`, so a weapon-only divisor would hand those two
jobs the level-5 crown instead of the Enforcer. Leaving `fixed` alone is
deliberate — an `onDestroyed` blast should fall behind as units grow.

**L1–3 slice impact, the levels the shipped chapter actually plays:**

| mirror | L1 | L2 | L3 |
|---|---|---|---|
| Enforcer, shipped | 20 dmg vs 61 hp = **4 swings** | 40 vs 74 = **2** | 60 vs 87 = **2** |
| Enforcer, proposed | 20 vs 61 = **4** | 24 vs 74 = **4** | 27 vs 87 = **4** |
| Railrunner, shipped | 13 vs 45 = **4** | 27 vs 53 = **2** | 40 vs 60 = **2** |
| Railrunner, proposed | 13 vs 45 = **4** | 16 vs 53 = **4** | 18 vs 60 = **4** |
| Augmented, shipped | 27 vs 55 = **3** | 57 vs 66 = **2** | 85 vs 77 = **1** |
| Augmented, proposed | 27 vs 55 = **3** | 35 vs 66 = **2** | 37 vs 77 = **3** |

Across all 49 pairings the mean goes 7.45 / 4.00 / 3.33 → 7.45 / 7.59 / 6.84,
one-shot pairings 0 / 5 / 10 → 0 / 0 / 0, and in the AI duel sweep first-round
downs at L3 go 5% → 0% with mean duel length 8.9 → 14.7 unit turns and still no
stalemates **[dump §8]**.

**Cost of the fix.** Battles get longer as levels rise: 12.9 unit turns at L1,
14.7 at L3, 18.8 at L5, with no stalemates at any level. That is the price of a
constant TTK against a rising stat curve. `400 + 150(L-1)` is in the dump as the
shorter alternative and also removes every one-shot, at the cost of a 15–25% TTK
dip in the middle levels. 250 was picked from a constant sweep over
`{100, 125, 150, 175, 200, 225, 250, 275, 300}` on the unrounded HP/damage ratio
of the 25 fighter-versus-fighter pairings, where it was the flattest across
L1–L3 (3.45 / 3.19 / 3.36, ±8%) and stayed within 20% out to L5. Reproduce with
`divisorVariant(k)` from `src/sim/variants.ts` and `ttkMatrix` from
`src/sim/ttk.ts` — noting that `divisorVariant` now reads *relative to the
shipped 250*, so `k = 250` is the shipped engine and the table above is
recovered by comparing each `k` against that control rather than against a
divisor that no longer exists.

**Also worth revisiting while the file is open:** the second-order collapse is
that `STAT_BASE.phys` and `STAT_BASE.mag` are both 0, so a level-1 Conduit's Mag
of 10 doubles at level 2. The divisor change absorbs this; a non-zero base does
not (see above).

### (c) AI weight table

The AI is currently deciding some of the balance read, so these come before the
data changes marked "re-measure". Each table was run through the same arena duel
sweep — 147 battles, content untouched, both sides on the table under test
**[dump §9]**. That sweep is arena-only at one seed, so its "never chosen" count
starts at 17 rather than F3's 16; `rig-machinery` is chosen exactly once in the
full 882-duel sweep and never in this reduced one.

| weights | abilities never chosen | abilities over 40% | overdrive share | mean turns | job win% spread |
|---|---|---|---|---|---|
| shipped | 17 | 6 | 75% | 10.1 | 8–97% |
| `chipThreshold` 60 | **14** | 5 | 74% | 9.6 | 14–97% |
| `selfHarmPercent` 100 | 17 | 6 | **70%** | 9.3 | 8–**94%** |
| `statusCtPerPercent` 2 | **18** | 5 | 71% | 9.3 | 8–97% |
| all four together | 15 | 5 | 67% | 8.4 | 14–94% |

| # | file | change | why |
|---|---|---|---|
| C1 | `src/core/ai/weights.ts` | `chipThreshold` 200 → 60, `chipPenalty` 250 → 120 | the flat cliff deletes every cheap ability at low level. Measured: never-chosen abilities 17 → 14 (`bracer-shot`, `tripwire-charge`, and `smoke-canister` come back), one fewer dominating ability, duels 10.1 → 9.6 turns, and the worst job's floor rises 8% → 14%. |
| C2 | `src/core/ai/weights.ts` | `selfHarmPercent` 200 → 100 as a stopgap until C3 lands | measured on its own: Overdrive's share 75% → 70%, the top job's ceiling 97% → 94%. Small, because the underlying valuation of Overclocked is genuinely large — which is what A4 addresses. |
| C3 | `src/core/ai/score.ts` (**not a weight**) | in `sideValue`, apply `selfHarmPercent` / `friendlyHarmPercent` to harm only, never to negative harm | a buff arrives as negative harm and is currently *amplified* by the percentages meant to make the AI protective. This is the mechanism behind all three of F4's runaway shares, and it cannot be tuned away from `weights.ts`. |
| C4 | `src/core/ai/score.ts` (**not a weight**) | in `extraEffectValue`, price a positive `modifyCharge` as aid | `tap-line` — the Conduit's answer to "where does the power come from" — can never be chosen today. |
| C5 | `src/core/ai/score.ts` (**not a weight**) | in `objectHitValue`, credit repair on map-authored objects, not only `owner === team` ones | `field-repair` is unreachable for the same reason. |

**Explicitly not recommended: `statusCtPerPercent` 4 → 2.** It looks like the
direct lever on Overclocked, and it is the only table tested that made things
*worse*: 18 never-chosen abilities, because it also prices the Chemist's Numbing
Fog (CT x60%) out of the kit, and it moved Overdrive's share only 75% → 71%.
Overclocked is strong because `ctMultiplierPercent: 160` for three turns is
strong; that is a content number (A4), not a weight.

C3–C5 are behaviour gaps in the search rather than tuning, and each is a handful
of lines. They belong to the AI workstream; this report is the evidence, not the
patch.

**Applied, with one substitution.** C1 landed as a *proportional* penalty
(`chipPenalty` scaled by the shortfall against `chipThreshold`, zero at the
threshold) rather than as new constants — the cliff was the defect, not the
prices. C3 landed with a cap: negative harm on a friendly is credited as
positive utility bounded by the new `buffValueCap` (250), which is below the
kill bonus by construction. C2 was therefore dropped: `selfHarmPercent` at 200
is correct once it only ever multiplies real harm. C4 and C5 landed as written.

Measured on a 294-duel arena-plus-yard sweep (7x7 pairs, levels 1/3/5, seed 101,
both maps), before and after the whole amendment pass — the divisor change and
the AI changes together, since both are in the same wave:

| | before | after |
|---|---|---|
| never-chosen abilities | 17 | **12** |
| abilities over 40% of their job's actions | 6 | 8 |
| Overdrive share of Augmented actions | 75% | **53%** |
| Crossfeed share of Machinist actions | 74% | **51%** |
| total actions chosen | 2,371 | 3,830 |

Newly reachable: `chemist|bracer-shot`, `conduit|tap-line`,
`machinist|field-repair`, `machinist|tripwire-charge`, `saboteur|gas-line-tap`.
The action count rises because the divisor change makes battles longer.

Still never chosen: `rejection`, `field-transfusion`, `overload-cell`,
`throw-the-breaker`, `kettle`, `sentry-frame`, `skitter-drone`,
`coupling-hook`, `signal-jump`, `bring-it-down`, `rig-machinery`,
`smoke-canister`. Two of those are now *content* work rather than AI work:
`sentry-frame` and `skitter-drone` spawn deployables that the engine can now
make shoot, but the shipped JSON carries no `attack` payload yet.

---

## 5. Suggested order for the next wave *(historical — all done)*

The order this report proposed, and the order it happened in.

1. **(c) C1–C5** — make the AI able to see the content. Cheap, and everything
   downstream is measured through it.
2. **(b)** — the divisor change. Level 1 is byte-identical, so the risk is
   confined to L2+, and `tests/core/` should pass untouched.
3. Re-run `GREYFALL_SIM=full npx vitest run tests/sim/sweeps.test.ts` and
   re-read F2 and F4 before touching any data.
4. **(a) A1–A3, A6** — the changes that do not depend on the re-read.
5. **(a) A4–A5** — after the re-read.
6. **A7 / the Machinist** — with the encounter and engine workstreams.

---

## 6. Post-rebalance measurement

The content pass. 1,268 battles on the live engine — no formula variants, no
alternate weight tables, `FULL_CONFIG` seeds `[101, 202, 303]`, levels 1/3/5,
arena and Marshaling Yard. "Before" is the same sweep run against the content
as it stood after the engine pass and before any data change.

### 6.1 Job spread

| job | before | **after** | L1 | L3 | L5 | mean turns |
|---|---|---|---|---|---|---|
| enforcer | 99% | **68%** | 46% | 68% | 89% | 12.4 |
| chemist | 32% | **56%** | 57% | 57% | 53% | 15.9 |
| conduit | **3%** | **51%** | 42% | 51% | 61% | 7.1 |
| railrunner | 77% | **50%** | 31% | 57% | 63% | 11.4 |
| augmented | 67% | **47%** | 51% | 51% | 39% | 9.9 |
| saboteur | 42% | **44%** | 68% | 36% | 29% | 7.7 |
| machinist | 30% | **34%** | 56% | 29% | 17% | 9.1 |

Spread **3–99% → 34–68%**. Five of seven inside the 35–65% band; the Enforcer
is 3 points over and the Machinist 1 point under. The mirror-adjusted rate is
±5 points at this sample size (216 duels per job), so both are inside the
noise of the band edge.

What moved each row, in order of size:

| job | change | why |
|---|---|---|
| conduit | `arc` power 8 → 21, cost 4 → 5; `flare` 12 → 9; `ground` 6 → 5 | the Conduit did **2 damage** with a weapon and its only damaging ability dealt 12 after double Attunement scaling. Arc is now a real line weapon and the job's whole 3% → 51% is that one number. The kit is otherwise untouched. |
| enforcer | `braced` evade 18 → 14; `riot-drill` hp +10/evade +4 → +2/+1; `riot-plate` 12 → 5 hp, −2 → −4 evade, **−1 speed**; `riot-helm` 6 → 2 hp; `baton-answer` weapon 50 → 30 | its curve is frozen by `tests/core/stats.test.ts` and `pin` is frozen by `src/ui/mock.ts`, so every lever was armour and passives. Heavy armour is Enforcer-and-Augmented-only, which is why it was the right place to take it from. |
| railrunner | speed ×115 → ×105; `baseEvade` 14 → 12; `yard-legs` evade +6 → +3; `undercut` 90 → 68 power, Fouled 55% → 30%; `running-coupling` gains `requires: railUnderfoot` | Speed 8 against everyone else's 6 was the single most extreme cell in the pre-engine sweep (96% at L1). It is Speed 7 now, and its signature is a rail-map signature. |
| machinist | hp 8 ×95 → 9 ×112, phys ×90 → ×105, speed ×95 → ×100, charge ×115 → ×125; three working deployables (§6.2) | it had no reachable board kit at all. It is the one job still outside the band and the reason is level 5 (§6.5). |
| chemist | hp ×100 → ×110, mag ×105 → ×115; `cinder-oil` power 5 → 7; `dosing-gun` 6 → 8; `bracer-shot` +4 → +5 | a support kit in a 1v1 round robin has nothing to support, so this is the row least worth reading; the comp sweep was always kinder to it. |
| augmented | `overclocked` 160% → 135% for 2 turns instead of 3; `overdrive` 6 flux/8 hp → 7/5; hp ×110 → ×105; `graft-tolerance` hp +14 → +10; `piston-lunge` gains `moveSelf` and range 4 | Overclocked was the best action in the game (§F4) and the Augmented was spending three turns a battle and 24 HP buying it. |
| saboteur | hp ×90 → ×105, phys ×105 → ×110, charge ×90 → ×100; `shaped-charge` power 5 → 7; `gas-line-tap` instant at range 2; `smoked` −5/−5/−8 → −8/−8/−4 | the smallest net move in the table, and the widest level spread left (§6.5). |

### 6.2 Never-chosen abilities

**16 → 12 (engine pass) → 8.** Offered in 252 unit-battles each and chosen zero
times in 882 duels:

| still never chosen | diagnosis |
|---|---|
| `rejection` | needs two or more hostiles inside radius 2 to out-value the blast it takes on the caster. Repriced (hpCost 10 → 0 — the blast *is* the cost; radius 1 → 2; 12% → 15% max HP; Scalded 50% → 70%) and it still does not clear, because the melee profile does not walk into being surrounded. Situational by design; a player who is surrounded will find it. |
| `crossfeed` | redesigned to `ally`-only with `+10 charge` alongside Overclocked, so it cannot be a self-buff loop. There are no allies in a duel. It is chosen in the 4v4 comp sweep. |
| `kettle` | a radius-2 root is a *multi-target* ability and a duel has one target, where it is a strictly worse Pin. Repriced anyway (4 flux/cast 40/70% → 3 flux/instant/80%) and it is chosen in the comp sweep. |
| `field-repair` | reachable since the engine pass; loses to Sentry Frame while the Machinist has flux, and it has none left after two deploys. Chosen in the comp sweep. |
| `tap-line`, `throw-the-breaker`, `overload-cell`, `bring-it-down` | object- and infrastructure-keyed. **A 12x12 arena has no objects and the Marshaling Yard has four**, so the duel sweep structurally cannot show them. Re-run on Foundry Floor Nine (16 objects) `tap-line` is 4–6% of Conduit actions and `rig-machinery` 18% of Saboteur actions. `throw-the-breaker`, `overload-cell` and `bring-it-down` are chosen nowhere, for a reason that is not content — see §6.6. |

Newly reachable this pass: `sentry-frame`, `skitter-drone`, `tripwire-charge`,
`coupling-hook`, `signal-jump`, `smoke-canister`, `rig-machinery`. The three
Machinist deployables and the two Railrunner abilities are the vocabulary
wiring; the rest is pricing.

### 6.3 Over-users

| job \| ability | before | after |
|---|---|---|
| augmented \| overdrive | 55% | **42%** |
| machinist \| crossfeed | 50% | **0%** |
| conduit \| ground | 54% | 2% |
| railrunner \| undercut | 56% | 41% |
| enforcer \| pin | 49% | 58% |
| machinist \| sentry-frame | — | 59% |
| conduit \| arc | 0% | 89% |
| saboteur \| bring-the-house | 38% | 42% |

Six abilities over 40% instead of eight, and the two the brief named are dealt
with: Overdrive under the flag, Crossfeed off it entirely. Three of the six are
honest reports of a small kit rather than a balance problem — the Conduit has
exactly one damaging ability it can afford in a duel, the Machinist's board
kit *is* its kit, and Pin is the Enforcer's only free attack. `arc` at 89% is
the one worth watching: it is the price of taking the Conduit from 3% to 51%
with a single number, and the honest fix is a second damaging Conduit ability
rather than a smaller Arc.

### 6.4 Encounters

The campaign roster at the levels the campaign actually produces. **Nothing in
`src/core/progression` raises `Unit.level`**, so "the levels the campaign
produces" are the authored ones — 1 and 2 — for the whole chapter; the sim's
`chapter` mode, which assumes a level per battle, is a fiction and is reported
only for contrast. Ten seeds per encounter, roster in join order, deployed on
the map's own tiles, authored kits with nothing bought:

| encounter | before | **after** | mean losses | mean surviving hp% | mean unit turns | Standing banked per unit |
|---|---|---|---|---|---|---|
| e1 Marshaling Yard | 100% | **100%** | 0.0 of 4 | 95% | 11 | 18 |
| e2 Foundry Floor Nine | **0%** | **70%** | 2.8 of 5 | 28% | 70 | 56 |
| e3 Tallow Row | **0%** | **40%** | 5.0 of 6 | 10% | 78 | 46 |
| e4 Refinery Three | **0%** | **70%** | 4.4 of 6 | 20% | 106 | 47 |
| e5 Charterhouse Steps | **0%** | **80%** | 3.6 of 7 | 37% | 72 | 32 |

e1 is a comfortable tutorial and e2–e5 are all inside the 40–80% target. Tallow
Row is the wall of the chapter — 40% and five of six units down for a win —
which is the right shape for the battle the story turns on. Both sides are
AI-driven with authored loadouts and nothing bought with Standing, so these are
floors, not predictions.

The numbers are also *jumpy*: one level on the e5 boss is worth 20–30 points,
and at five seeds a single configuration of e5 read anywhere from 0% to 100%.
Everything above is ten seeds. Treat ±10 points as noise.

Three levers did the work, in order of size: **party size** (e2 4 → 5, e3/e4
5 → 6, e5 5 → **7** — the finale deploys the whole company), **enemy levels**
(most of e2–e5 dropped one, and the boss's level is worth 20–30 points on its
own), and **enemy counts** (one reinforcement instead of two in e3 and e5, one
fewer body on the Charterhouse terraces). The six non-frozen roster units each
gained one signature ability and one passive slot, because the enemy templates
already carried passives and the party did not.

**Standing flow, measured.** ~199 per unit across the chapter (18 / 56 / 46 /
47 / 32 by battle). `startingStandingBonus` went **250 → 150**: 250 was worth
more than the whole chapter, and zero leaves the learning screen empty until
battle 3 because the roster's cheapest unlearned ability is 150. At 150 every
unit opens at job level 2 with one affordable purchase and finishes the chapter
at job level 3. `docs/PROGRESSION.md` §2 and §5 carry the numbers; the flag is
discharged.

### 6.5 TTK

The divisor fix holds under the new curves. Scripted weapon duels, no
abilities, no armour, no passives, all 49 pairings:

| level | before the engine pass | after the engine pass | **after this pass** | one-shot pairings |
|---|---|---|---|---|
| 1 | 7.45 | 7.45 | **7.22** | 0 |
| 2 | 4.00 | 6.45 | **6.37** | 0 |
| 3 | 3.33 | 7.02 | **6.98** | 0 |
| 4 | 2.78 | 7.67 | **7.69** | 0 |
| 5 | 2.63 | 8.37 | **8.45** | 0 |

Zero one-shot pairings at every level, against 16 of 49 at level 5 before.
Mean unit turns per duel is 10.9 with **zero stalemates in 882 duels** and zero
first-round downs.

### 6.6 What was left, and why

- **Enforcer 68% / Machinist 34%.** Both are one band-edge away and both were
  blocked, not unattended. The Enforcer's residual is `pin`: a measured A/B
  over 392 duels puts Stunned `chance` 60 → 35 at **68% → 53%**, the largest
  single lever in the game. `data/abilities/pin.json` is mirrored verbatim in
  `src/ui/mock.ts` and asserted by `tests/ui/mock.test.ts`, so it could not be
  edited without breaking a test outside this pass's remit. Same for
  `overload-cell` (wanted: 8 → 5 flux, power 16 → 20, `requires: targetPowered`).
  **Both applied by the cleanup pass, 2026-08-15** — `CONTENT_NOTES` §9 records
  what re-measured and what did not. The headline caveat: a bounded 112-duel
  re-check reproduces the *direction* but not the magnitude (49.1% → 46.4%
  across L1 and L3, with the whole movement at L1: 37.5% → 29.2% against other
  jobs). At L3 and L5 the Enforcer barely moves, which is consistent with the
  next bullet — above level 1 its lead is the frozen `hp` curve, not `pin`.
  The full 392-duel figure has not been re-run.
- **Level 5 is out of band for three jobs** (Enforcer 89%, Machinist 17%,
  Saboteur 29%) while levels 1 and 3 are 46/68 and 56/29 and 68/36. The
  Enforcer's `hp` growth of 11 ×120 against everyone else's 8–10 compounds with
  level, and it is frozen by `tests/core/stats.test.ts`. The five non-frozen
  jobs were raised towards it as far as their personalities allow; closing the
  rest means unfreezing the Enforcer's curve. **The shipped chapter runs levels
  1–3**, where the spread is 31–68%, so this was left.
- **`conduit | arc` at 89%.** Deliberate: see §6.3.
- **Deployment-side bias, 35%.** Unchanged and unchanged in cause: F5 showed it
  tracks *who acts first*, not which band deploys, and swapping unit ids moves
  it to 54–62%. Averaged over both orderings the arena is 45% and the yard 48%.
  Tempo is a liability in this engine; that is a design fact, not a bug.
- **Conduit flux never binds** — 47% of Conduits never spend below 75% of a
  53-point pool. Arc costs 5 and there is nothing else worth buying in a duel.
  The pool is sized for a Conduit with a live map under it, which the arena is
  not.

### 6.7 Engine and AI friction found

Content could not reach these; each is reported with the number it costs.

| # | where | what | cost |
|---|---|---|---|
| G1 | `src/core/ai/score.ts`, `extraEffectValue` | **`moveSelf` is unpriced** — it falls to the `default` branch and scores 0. An ability whose point is repositioning can never be chosen *for* the repositioning. | Piston Lunge is 5% of Augmented actions and Signal Jump 0% in the arena, both entirely on their damage/status halves. It is also half of why Overdrive holds 42%: on an approach turn the Augmented has no priced alternative. |
| G2 | `src/core/ai/score.ts`, `statusValue` | **A status the target already holds is priced as if it were new.** Combined with G1 there is no setting at which a cheap self-buff is both chosen and non-spammy: at 0 flux the AI re-applies it every idle turn (Signal Jump, 9 casts in one battle), and at any non-zero cost the chip penalty deletes it. | Signal Jump had to take `requires: railUnderfoot` partly to bound the loop. |
| G3 | `src/core/ai/score.ts`, `abilityValue` | **The chip penalty is a cliff for cheap utility.** It is proportional now, but it is still `chipPenalty × (chipThreshold − gross) / chipThreshold`, so an ability with gross 32 and cost 1 flux scores −190. Everything under ~200 gross that costs any flux is unchoosable. | Breach Posture only re-entered the kit at Braced evade ≥ 14; Kettle needed 80% chance *and* instant *and* 3 flux to clear zero. |
| G4 | `src/core/ai/score.ts`, `destroyValue` / `objectHitValue` | **An object with no unit standing in its payload is worth `objectStructurePoint` (15).** With G3 that means every object-only ability with a flux cost is dead: `bring-it-down` (3 flux, phys 28) scores ~20 gross against a 225 chip penalty. `rig-machinery` is chosen only because it costs 0. | `bring-it-down`, `overload-cell`, `throw-the-breaker` never chosen; the whole "the map is the target" pillar is invisible to the search unless somebody is standing on the thing. |
| G5 | `src/core/ai/score.ts`, `powerSwingValue` | **A power swing is worth 0 unless the object carries a `surfaceHeight` deck with a unit on it.** Cutting power to a press line or a pour ladle — the entire point of `floor-nine-mains` — prices at zero. | `throw-the-breaker` is never chosen on any map, at any price. It is repriced to 1 flux and range 5 on the assumption a human will use it. |
| G6 | `src/core/ai/score.ts`, `spawnValue` | **`autoAttackPercent` (250) credits a deployable with 2.5 shots and no discount** for the deployable being destroyed, the target walking out of range, or the turns of setup. A Sentry Frame scores ~700 against a basic attack's ~200, so the Machinist builds until its flux is gone and dies doing it. The content answer was to price the frame at 12 flux of an 18-point pool so it can only afford two. | Sentry Frame is 59% of Machinist actions; the job's level-5 rate is 17%. |
| G7 | `src/core/rules/effects.ts`, `checkContact` | **An `onContact` payload resolves with `actorId: null`**, so `phys`/`mag`/`weapon` amounts land as 0 damage while `damageBite` prices them the same way. A mine authored with `phys 8` is silently inert. `autoAttack` does not have this problem — it resolves against the deployer. Worth either documenting on the schema or resolving contact against `ownerUnitId` the way `autoAttack` does. | Cost one debugging pass; `tripwire-charge` ships as `fixed 20`. |
| G8 | `src/ui/mock.ts` + `tests/ui/mock.test.ts` | ~~**Seven content files are frozen by a UI fidelity mirror**~~ — `jobs/enforcer`, `jobs/conduit`, `abilities/pin`, `abilities/overload-cell`, `items/shock-maul`, `statuses/stunned`, `units/rowen`. **Discharged (cleanup pass, 2026-08-15):** the mirror is not a freeze, it is a re-sync cost. Both §6.6 diffs were applied to `data/` and mirrored back into `mock.ts` in the same change. | Was the two biggest un-taken levers in the game; both are now taken. The mirror still costs a re-sync on every edit to those seven files. |
| G9 | `src/core/ai/index.ts` | **Search cost is superlinear in Move.** `actionOptions` is evaluated from every reachable tile, so one point of Move on one unit multiplies that unit's per-turn search by the growth of its reachable set. Measured: slotting `earth-strap` (move +1) on Vale took `tests/app/campaignLoop.test.ts`'s two-battle run from **1.42 s to 2.36 s** — a 65% increase in the whole test from one stat point on one unit. | Vale ships without a movement passive. Any future Move-boosting content wants a pruning pass in the search first. |

None of G1–G6 is tunable from `weights.ts`; they are all valuation gaps in
`score.ts`, in the same family as the C3–C5 that landed last pass.

> **Status (AI pass, 2026-08-15). G1–G7 and G9 are discharged**; §7 is the
> measurement. G7 needed no change — the AI already priced contact payloads
> caster-less, the way the engine resolves them — and is now asserted rather
> than assumed. Three findings came out of the pass in their place: G10–G12
> in §7.8, all three content rather than AI.

---

## 7. Post-AI-pass measurement

The AI pass. G1–G6 and G9 are all fixed in `src/core/ai/`; G7 was checked and
needed nothing; G8 was already discharged. No content, no core rules, no engine.

**The instrument.** Three sweeps, all built from `src/sim` and all driven
through `chooseCommand` on both sides:

| sweep | shape | battles |
|---|---|---|
| **duels** | `jobRoundRobin`-shaped: 7x7 job pairs, levels 1/3/5, seed 101, `sim-arena` plus Marshaling Yard, `commandCap` 300 | 294 |
| **map duels** | the same 7x7 pairs at levels 1/3, seed 101, on Foundry Floor Nine and on Refinery Three | 98 each |
| **encounters** | the campaign roster in join order on the five shipped encounters, 24 seeds (`101 + 37n`), `commandCap` 4000 | 120 |

"Before" in the duel sweeps, the map sweeps, the encounter usage counts and the
timings is **the pre-pass build**, run from `git stash`. "Before" in the
encounter win rates (§7.5) is **this build with the new weights neutralised** —
`repositionCap` 0, `heldStatusFloorPercent` 100, `fluxScarcityPercent` 0,
`chipThreshold` 200, `chipPenalty` 250, `objectPathPoint` 0,
`objectChainPercent` 0, `machineDenialPercent` 0, `deployableSetupPercent` 0,
`deployableReachStep` 0, `deployableReachFloor` 100, `contactPayloadPercent`
120 — which reproduces the pre-pass search to within the one structural change
that has no weight: a mine no longer collects an obstacle credit it never
earned. Doing it that way is what let the 24-seed comparison run both arms of
each encounter in one process.

The duel sweep is one seed and 294 battles, so a single job's rate carries
roughly ±6 points; the encounter sweep is 24 seeds, so a single encounter's rate
carries roughly ±10. Nothing below turns on a difference smaller than that.

### 7.1 What each finding got

| # | fix | before | after |
|---|---|---|---|
| **G1** | `moveSelf` is priced as `positionValue(destination) − positionValue(here)`, clamped to `repositionCap` (250) either way. The destination is computed with the engine's own slide rule — same facing, bounds, blockers, occupants, height limit. | Piston Lunge 5% of Augmented actions, Signal Jump 1% of Railrunner actions | Piston Lunge **8%** in duels, **11%** on Floor Nine and **17%** on Refinery Three. Overdrive 40% → **33%** in duels, 63% → **47%** and 59% → **50%** on the two maps |
| **G2** | `statusValue` is scaled by the turns a re-cast would actually add: full duration buys nothing, one turn from lapsing buys most of it, `untilRemoved` buys nothing. | Signal Jump 9 casts in one battle; no setting where a cheap self-buff was both chosen and non-spammy | the idle loop is gone (§7.3). Signal Jump is 11% of Railrunner actions on Floor Nine, where the rails are |
| **G3** | flux priced as opportunity cost against the pool still in hand (`fluxScarcityPercent` 120) instead of a flat rate behind a gross-value gate; `chipThreshold` 200 → 60 and `chipPenalty` 250 → 40, which leaves the gate as a nudge against buying trivia | Kettle, Smoke Canister, Coupling Hook effectively unchoosable | **Kettle 4%**, **Smoke Canister 16%**, Coupling Hook 30% → **49%** of their jobs' actions. No chip-spam: `bring-the-house` (9 flux of a 20-point pool) correctly falls 42% → 10%, and Shaped Charge (3 flux) takes the work |
| **G4** | objects priced by consequence: the detour a blocker imposes on the path to the quarry, and a second object the payload would finish (`objectChainPercent`) | `bring-it-down` never chosen anywhere | **6% of Saboteur actions on Floor Nine**, 23 casts across ten runs of e2 |
| **G5** | a powered `operable` is priced by what it would do in enemy hands, tapered by how near our people stand to what it covers and how far a hostile is from a tile it can be worked from. Collected by destroying it *and* by cutting its power | `throw-the-breaker` never chosen on any map at any price; `rig-machinery` chosen only because it costs nothing | **32% of Conduit actions on Floor Nine, 7% on Refinery Three**; `rig-machinery` 20% → **25%** |
| **G6** | a deployable is credited its payload only against a hostile it can reach from the tile it would stand on, discounted again for the shot it forfeits to its own CT clock and for whoever on the other side can break machinery | Sentry Frame 55% of Machinist actions, ~700 points against a basic attack's ~200 | **36%** in duels; **0 of 30** turret builds across ten runs of e2, where nothing is in range on the turn it would be built. The Machinist's board presence survives as mines (§7.3) |
| **G7** | checked, no change needed | — | `damageBite` already resolves contact payloads caster-less, exactly as `checkContact` does, so a `phys` amount prices at 0 on both sides. Now asserted (`tests/core/ai/scoring.test.ts`) |
| **G9** | four per-decision memos, no pruning (§7.7) | two-battle campaign run 1.31 s, 1.54 s with `earth-strap` | **0.72 s and 0.74 s** |

### 7.2 Job spread

294 duels, mirrors excluded, 72 battles per job.

| job | before | **after** |
|---|---|---|
| chemist | 54.2% | **56.9%** |
| enforcer | 55.6% | **56.9%** |
| conduit | 56.9% | **55.6%** |
| railrunner | 51.4% | **51.4%** |
| augmented | 50.0% | **47.2%** |
| saboteur | 45.8% | **41.7%** |
| machinist | 36.1% | **40.3%** |

Spread **36.1–56.9% → 40.3–56.9%**, comfortably inside the 34–68% band and
narrower than it was. The three jobs the brief expected to move did:
**machinist +4.2** (its deployables are priced honestly and it stopped building
turrets nothing could reach), **enforcer +1.3** (Kettle re-entered the kit),
**conduit −1.3** (its flux is no longer free). Saboteur −4.1 is the one drop
worth naming: Bring the House at 9 flux out of a 20-point pool is now correctly
expensive, and the kit has not yet been re-tuned around that. Mean turns per
duel 10.7 → 11.6; zero stalemates before and after.

### 7.3 Never-chosen and over-used

**Never chosen, 294 duels: 9 → 8.** That is the weakest headline here and it is
an artefact of where the sweep runs: **four of the eight are object-keyed and
the arena has no objects while the yard has four.** On the maps built for them
the same measurement reads **8 → 4** (Foundry Floor Nine) and **10 → 5**
(Refinery Three), and the residue there is `rejection`, `field-transfusion`,
`numbing-fog` and `field-repair` — all four diagnosed as content in §6.2.

The one entry that moved the *wrong* way is `signal-jump`, from one cast in 294
duels to none: G2 took away the idle re-cast that was its only use on a map with
one rail lane, and G1 does not give it back there because a three-tile hop along
the Marshaling Yard's single rail column lands nowhere better. On Foundry Floor
Nine, which is laid out for it, it is 11% of Railrunner actions.

| over 40% of its job's actions | before | after |
|---|---|---|
| conduit \| arc | 89% | 87% |
| enforcer \| pin | 59% | 53% |
| railrunner \| coupling-hook | 30% | **49%** |
| saboteur \| shaped-charge | 16% | **46%** |
| augmented \| overdrive | 40% | 33% |
| machinist \| sentry-frame | 55% | 36% |
| railrunner \| undercut | 43% | 29% |
| saboteur \| bring-the-house | 42% | 10% |

**Six over-users to four.** Both new entries are the same story from G3: the
cheap ability in a kit takes the work the expensive one used to. Coupling Hook
costs 1 flux against Undercut's 2 and does more; Shaped Charge costs 3 against
Bring the House's 9. Both are content reads, not search defects — and both jobs
kept or improved their win rate.

Two shares moved a long way and are worth writing down:

- **`machinist | crossfeed` 0% → 21%** in duels, **41%** on both authored maps.
  This is a **new content finding**, see §7.8.
- **`machinist | tripwire-charge` 10% → 20%** in duels and **12 → 92 casts**
  across ten runs of e2, while Sentry Frame goes **30 → 0** there. The Machinist
  did not stop putting things on the board; it stopped buying the 12-flux
  deployable that cannot reach anything from where it would stand and started
  buying the 4-flux one that can.

### 7.4 The two map-usage acceptance runs

98 duels per map, and ten runs of the encounter the map belongs to.

| | map duels, before | map duels, **after** | in the encounter, before → **after** |
|---|---|---|---|
| **Foundry Floor Nine** | | | e2, 10 seeds |
| saboteur \| `rig-machinery` | 27 (20%) | **45 (25%)** | 4 → **21** |
| saboteur \| `bring-it-down` | 0 | **9 (5%)** | 0 → **23** |
| conduit \| `throw-the-breaker` | 0 | **36 (32%)** | 0 → **9** |
| **Refinery Three** | | | e4, 10 seeds |
| conduit \| `throw-the-breaker` | 0 | **6 (7%)** | 6 → **15** |
| conduit \| `overload-cell` | 1 | **0** | 0 → **1** |
| conduit \| `tap-line` | 0 | **2** | 8 → **21** |
| saboteur \| `bring-it-down` | 0 | **1** | — |

**A Saboteur kit meaningfully uses `bring-it-down` and `rig-machinery` on
Foundry Floor Nine: accepted.** Together they are 30% of Saboteur actions there
and 44 casts across ten runs of e2.

**`throw-the-breaker` is chosen on Refinery Three: accepted** — 7% of Conduit
actions in the duel sweep and 15 casts across ten runs of e4, against zero and
six before.

**`overload-cell` is the miss.** It is chosen once in ten runs of e4 and not at
all in the Refinery duel sweep. The reason is not the object valuation: it is
5 flux **and** a 25-speed cast, so `castTurnCost` plus the flux price puts about
190 points of gross between it and zero, and a bank cell only clears that when a
body is standing in its blast. The search will overload a cell two hostiles are
flanking — that is the case `tests/core/ai/decisions.test.ts` already asserts on
the yard — but it does not manoeuvre to *create* that case, and Refinery Three's
charging rack sits where units do not stand. **This is a content note, not an AI
one:** either the rack moves onto a tile the fight crosses, or `overload-cell`
loses its cast time. It lost its cast time — §7.8.1.

### 7.5 Encounters

Campaign roster in join order, authored levels, nothing bought, 24 seeds.

| encounter | before | **after** |
|---|---|---|
| e1 Marshaling Yard | 100% | **100%** |
| e2 Foundry Floor Nine | 41.6% | **45.8%** |
| e3 Tallow Row | 29.1% | **29.1%** |
| e4 Refinery Three | 83.3% | **62.5%** |
| e5 Charterhouse Steps | 50.0% | **66.6%** |

Mean 60.8% before, **60.8%** after: the pass is encounter-neutral in aggregate
and flatter in shape — the 83% outlier and the 50% floor both move toward the
middle. Four of five are inside the 40–100% band. **e3 Tallow Row reads 29.1%
before *and* after** — this instrument's 24-seed read of e3 is below the band
whatever the AI does, against §6.4's ten-seed read of 40%, and the AI pass moves
it by exactly zero. It is a content number and it belongs to the encounter
workstream, which took it: **45.8%** in §7.8.1.

**Every encounter number here is both sides improving at once.** A win rate
falling is not evidence the search plays worse; it is evidence that the side
with more material converts a better search into more, and e2–e5 all field more
enemies than the party. The one place that read as a real defect was
Charterhouse Steps, and it is the subject of the next section.

### 7.6 Measured and cut

**Line-of-sight opening.** Every `blocksLos` object was credited for each
hostile it screened from the actor — the "what does breaking this open" term the
brief asked for. Measured on Charterhouse Steps, which is eight balustrades and
a plinth, it made both sides prefer demolition to fighting:

24 seeds each. The companion per-tile occupancy credit is named in the first
column too, because the two were cut together.

| `objectLosPoint` / `objectTilePoint` | e2 | e3 | e4 | e5 | mean |
|---|---|---|---|---|---|
| 60 per screened hostile / 12 | 54.1% | 29.1% | 58.3% | **20.8%** | 40.6% |
| 60 capped at one line per object / 4 | 50.0% | 25.0% | 58.3% | **29.1%** | 40.6% |
| 30 capped / 4 | 45.8% | 25.0% | 62.5% | **37.5%** | 42.7% |
| **0 / 0 (shipped)** | 45.8% | 29.1% | 62.5% | **66.6%** | **51.0%** |

It bought no measurable change in which abilities were chosen at any setting, so
it is gone from the code rather than shipped as a weight priced at zero: the
per-decision sight-line walk it needed is gone with it. The same table killed a
per-tile "future occupancy" credit, which cost e5 another 12 points at 4 points
a tile and moved nothing else.

**Candidate-tile pruning.** Not done. The G9 targets are met by memoisation
alone with a wide margin (§7.7), and every pruning scheme worth having changes
which tiles get a full evaluation — which is exactly what the scenario suite in
`tests/core/ai/` asserts. Spending the risk was not worth the milliseconds.

### 7.7 Search cost

Profiled with `node:inspector` over a whole run of e2 — eleven units, 16x16,
about 200 commands. Before, **53% of all AI time was inside `distanceField`**,
which ran once per hostile per decision and asked the object list for
standability, stand height and step cost on every edge it considered. It now
reads three arrays built once per decision. Total AI time in that profile:
**2,519 ms → 1,372 ms**, and the largest remaining line is `resolveArea`, which
is memoised per ability and target for every footprint that does not read the
actor's tile.

| | before | **after** |
|---|---|---|
| e1 + e2 back to back, as `campaignLoop`'s two-battle test runs them | 1.31 s | **0.72 s** |
| the same with `earth-strap` (Move +1) on Vale | 1.54 s | **0.74 s** |
| the Move surcharge that bought | +17.1% | **+2.4%** |
| `chooseCommand` on e1, median | 0.335 ms | **0.203 ms** |
| `chooseCommand` on e1, p95 | 3.38 ms | 3.09 ms |
| one Vale decision on e2, Move 3 (16 tiles to stand on) | 9.32 ms | **3.20 ms** |
| one Vale decision on e2, Move 4 (26 tiles to stand on) | 12.08 ms | **5.13 ms** |
| marginal cost per extra tile to stand on | 0.275 ms | **0.193 ms** |

**Both acceptance targets are met with room: 0.74 s against the ~1.6 s
target, and a 0.20 ms median against 1 ms.** The G9 framing is worth one
correction for the record: the cost was never *superlinear* in Move so much as
**large and fixed**, with a linear per-tile term on top. The report's 1.42 s →
2.36 s was the whole test file; the decision itself went 9.3 ms → 12.1 ms for
that point of Move. Cutting the fixed half is what moved the number, and the
per-tile term came down 30% as well.

### 7.8 New findings

| # | where | what | cost |
|---|---|---|---|
| G10 | `data/abilities/crossfeed.json` | **`crossfeed` is still a self-buff loop.** §6.2 redesigned it to `ally`-only "so it cannot be a self-buff loop", but `isValidTargetKind` counts the caster as an ally (`allowed.includes("self") || allowed.includes("ally")`), and the ability's `range.min` is 0. It is Overclocked for 4 flux, which is strictly better than the Augmented's own Overdrive at 7 flux and 5 HP. It was invisible only because Sentry Frame outscored it; once G6 priced the frame honestly it surfaced. | 21% of Machinist actions in duels, **41% on both authored maps**. The AI is reading it correctly — the loop is real. Fix is one character of content: `range.min` 0 → 1. |
| G11 | `data/maps/refinery-three.json` or `data/abilities/overload-cell.json` | **`overload-cell` cannot pay for its own cast time.** 5 flux plus a 25-speed cast is ~190 points of gross before it clears zero, and an unmanned cell is not worth that however well the map is priced. Refinery Three's charging rack is four cells on tiles the fight does not cross. | 1 cast in ten runs of e4. See §7.4. |
| G12 | `data/abilities/bring-the-house.json` | **9 flux out of a 20-point pool is most of a Saboteur's battle.** Now that flux is priced against the pool, the kit's signature is its least affordable ability and Shaped Charge does the work instead. | `bring-the-house` 42% → 10%, `shaped-charge` 16% → 46%, Saboteur win rate 45.8% → 41.7%. |

### 7.8.1 Content follow-up applied

G10–G12 and e3 Tallow Row are all discharged in `data/`. Four files:

| file | change |
|---|---|
| `data/abilities/crossfeed.json` | `range.min` 0 → **1** |
| `data/abilities/overload-cell.json` | `castSpeed` 25 → **null**; flux and power unchanged |
| `data/abilities/bring-the-house.json` | `chargeCost` 9 → **7**; powers unchanged |
| `data/encounters/e3-tallow-row.json` | `provocateur-tram` removed; `smoke-canister` off both torch-hands; the gutter line says "one" where one spawns |

**The instrument is §7's**, re-run as two arms in one process — the pre-follow-up
content and the applied content, both against the same working tree — because
the use-item workstream was changing `src/core` underneath this pass. The
before arm reproduces §7.2, §7.3 and §7.5 to the digit **except e2**, which
reads 12.5% in both arms against §7.5's 45.8%: e2's enemies gained an
`enemySatchel` and a Bench Grade in that concurrent pass. e2's number below is
therefore not this pass's to read, and is quoted only so both arms agree.

#### Job spread — 294 duels, mirrors excluded

| job | before | **after** |
|---|---|---|
| enforcer | 56.9% | **59.7%** |
| conduit | 55.6% | **59.7%** |
| chemist | 56.9% | **54.2%** |
| railrunner | 51.4% | **47.2%** |
| augmented | 47.2% | **45.8%** |
| machinist | 40.3% | **41.7%** |
| saboteur | 41.7% | **41.7%** |

Spread **40.3–56.9% → 41.7–59.7%**, inside the 34–68% band and no wider. No
job moved further than the sweep's own ±6.

#### Over 40% of its job's actions

| | before | **after** |
|---|---|---|
| conduit \| arc | 87% | 88% |
| enforcer \| pin | 53% | 51% |
| railrunner \| coupling-hook | 49% | 49% |
| saboteur \| shaped-charge | 46% | **25%** |
| machinist \| sentry-frame | 36% | **41%** |

Four over-users to four. Shaped Charge leaves the table because Bring the
House can now be afforded beside it. Sentry Frame enters it at 41%, one point
over the line, and it is a denominator: **the frame is built the same 154
times it was built before**, out of 376 Machinist actions instead of 431. The
92 casts that were Crossfeed went mostly to the mine (`tripwire-charge` 86 →
114) and the rest to the weapon. G6 brought the frame 55% → 36% by pricing it
honestly and nothing about that pricing changed. Worth a watch, not a finding.

> **Corrected by §7.8.6 (2026-08-16): the frame is 40.0%, and there are three
> over-users, not four.** This note had hold of the right half of the reason —
> and the denominator was also *wrong*. `totalActionsByJob` counted only `act`
> commands, but a Machinist spends the same turn's action working machinery.
> 154 of **385**, not 154 of 380. Sentry Frame is exactly on the 40% line and
> does not cross it.

#### Never chosen

| sweep | before | **after** | what moved |
|---|---|---|---|
| duels, 294 | 8 | **8** | `conduit \| tap-line` out, `machinist \| crossfeed` in |
| Foundry Floor Nine, 98 | 4 | **5** | `machinist \| crossfeed` in |
| Refinery Three, 98 | 5 | **7** | `machinist \| crossfeed` and `saboteur \| bring-it-down` in |
| comps, 84 | 10 | **10** | unchanged; `crossfeed` is chosen **40** times |

**`crossfeed` reading as never-chosen in every duel sweep is the instrument,
not the ability.** A duel is one unit a side and Crossfeed is ally-only at
range 1–2, so there is no legal target on the field — the same artefact §7.3
names for the four object-keyed abilities in the objectless arena. Put an ally
next to it and it is **25% of Machinist actions** in the 84-battle comp sweep,
against 28% before. That is the whole of G10: the self-cast is gone, the ally
cast is untouched.

#### The three abilities

| | before | **after** |
|---|---|---|
| `crossfeed`, duels | 21% (92) | **0%** |
| `crossfeed`, Floor Nine / Refinery | 41% / 41% | **0% / 0%** |
| `crossfeed`, comps | 28% (43) | **25% (40)** |
| `overload-cell`, e4 casts / 24 seeds | 4 | **27** |
| `overload-cell`, e1 casts / 24 seeds | 24 | **24** |
| `bring-the-house`, duels | 10% (37) | **28% (103)** |
| `shaped-charge`, duels | 46% (179) | **25% (92)** |
| `bring-the-house`, Floor Nine / Refinery | 14% / 12% | **20% / 19%** |
| `bring-the-house`, comps | 25% (51) | **35% (69)** |

#### Encounters — campaign roster, authored levels, 24 seeds

| encounter | before | **after** |
|---|---|---|
| e1 Marshaling Yard | 100.0% | **100.0%** |
| e2 Foundry Floor Nine | 12.5% | **12.5%** (not this pass's — see above, and §7.8.2) |
| e3 Tallow Row | 29.1% | **45.8%** |
| e4 Refinery Three | 62.5% | **83.3%** |
| e5 Charterhouse Steps | 66.6% | **66.6%** |

e3 on a second, disjoint 24-seed set (`103 + 41n`): **25.0% → 58.3%**. Pooled
over both sets, 48 runs: **27.1% → 52.1%**. e3 is in the 40–80% band on the
primary instrument and mid-band on the pooled one, and mean turns fall 94 → 74.

**e4 is the cost of G11 and it is worth naming.** Overload Cell going from
four casts to twenty-seven takes Refinery Three from 62.5% to 83.3%, which is
exactly the outlier §7.5's AI pass had flattened. It is inside the 40–100%
band, `data/encounters/e4-refinery-three.json` is outside this pass's remit,
and the honest reading is that the encounter was authored against an ability
that did not work. It should be re-priced against one that does.

#### Why each fix, and what would not tune

**G10** is the one-character fix the finding named and it needed no
compensating tweak. Nothing else in the Machinist's kit moved.

**G11's middle path does not exist.** `castSpeed`'s magnitude is invisible to
the search for an object-only ability: `castEscapePercent` decay is applied
only when `target.kind === "unit"`, and `castTurnCost` (60) is a flat charge
for any non-null `castSpeed`. A "much faster cast" therefore buys exactly
nothing, and the levers reduce to null-vs-not and flux. The ladder, e4 at 24
seeds:

| `overload-cell` | e4 win% | casts |
|---|---|---|
| cast 25, 5 flux, mag 20 *(shipped)* | 62.5% | 4 |
| **instant, 5 flux, mag 20** | **83.3%** | **27** |
| instant, 7 flux, mag 20 | 83.3% | 27 |
| instant, 8 flux, mag 20 | 66.7% | 4 |
| cast 25, 2 flux, mag 20 | 79.2% | 26 |
| cast 25, 1 flux, mag 20 | 79.2% | 27 |
| instant, 6 flux, mag 14 | 83.3% | 28 |

It is a cliff, not a slope — every setting that clears the cost bar lands on
27 casts and every setting that does not lands on 4. Instant at the shipped 5
flux is the cheapest change that clears it, is what §7.4 itself prescribed,
and is the only one that also makes sense as content: 2 flux would make a
machine-killer free, and the cast was never doing work.

**G12's ladder**, 294 duels:

| `bring-the-house` | share | `shaped-charge` | saboteur win% |
|---|---|---|---|
| 9 flux, phys 8 / obj 14 *(shipped)* | 10% | 46% | 41.7% |
| **7 flux, phys 8 / obj 14** | **28%** | **25%** | **41.7%** |
| 6 flux, phys 8 / obj 14 | 44% | 11% | 41.7% |
| 5 flux, phys 8 / obj 14 | 62% | 6% | 45.8% |
| 6 flux, phys 10 / obj 18 | 68% | 13% | 52.8% |
| 7 flux, phys 10 / obj 18 | 50% | 16% | 51.4% |
| 8 flux, phys 10 / obj 18 | 43% | 14% | 48.6% |

Seven flux is the only setting where both explosives are real and neither is
over 40%. Everything cheaper, and everything with more power behind it, just
swaps which of the two is dead — and every version that lifts the Saboteur's
win rate does it by making Bring the House a new over-user. **The Saboteur's
−4.1 in §7.2 was not the price of Bring the House.** The kit wins at 41.7%
whether it spends its flux on one big charge or three small ones, which points
the next look at the job's damage rather than at its bill.

**e3 would not tune on kit alone.** Every loss in the before arm is a
`partyRout`; Wick's escape condition never fired at forty-eight seeds. The
ladder, 24 seeds each, primary set unless a second is given:

| e3 variant | win% |
|---|---|
| shipped | 29.2% (alt 25.0%) |
| Wick L2 → L1 | 83.3% |
| no `torch-hand-east-room` | 54.2% |
| no `provocateur-barricade` | 50.0% |
| no gutter reinforcement | 50.0% |
| **no `provocateur-tram`, `smoke-canister` off both torch-hands** | **45.8% (alt 58.3%)** |
| no `provocateur-tram` | 33.3% |
| `smoke-canister` off both torch-hands | 33.3% (alt 37.5%) |
| `smoke-canister` off all three saboteurs | 25.0% (alt 54.2%) |
| `provocateur-tram` → a lighter Row runner | 37.5% (alt 41.7%) |
| `cell-machinist` loses `tripwire-charge` | 29.2% |
| gutter reinforcement loses `shield-advance` | 29.2% |

No kit-only change reached the band; body count is the lever, and the
non-monotone rows (a *weaker* tram defender scores below no defender at all)
are why the landing was confirmed on a second seed set. The tram provocateur
was the placement `ENCOUNTER_NOTES` could carry without — nothing scripted
referred to him and the east-room torch-hand covers the lane — and Smoke
Canister on all three saboteurs was never justified by the encounter's notes.
Wick's level is untouched: he is the fight's one L2 and its win condition.

### 7.8.2 Addendum — e2's enemy satchel

§7.8.1's instrument note left e2 at **12.5%** and handed the number back to the
encounter workstream. This is that follow-up. Same instrument, same party —
campaign roster in join order, authored levels, nothing bought, `commandCap`
4000 — on the primary seed set (`101 + 37n`) and the disjoint alt set
(`103 + 41n`), 24 seeds each, reported pooled over both because e2's single-set
reads are jumpy enough to invert a conclusion (below).

**One arm, one factor at a time.** The satchel and Bench Grade were varied in
memory against the shipped tree, so every row is the same build:

| e2 arm | primary | alt | **pooled 48** |
|---|---|---|---|
| no satchel, no Bench Grade (pre-use-item-pass) | 45.8% | 33.3% | **39.6%** |
| **2 vials, Bench Grade** *(shipped)* | **45.8%** | **45.8%** | **45.8%** |
| 1 vial, Bench Grade | 41.7% | 45.8% | 43.8% |
| 2 vials, no Bench Grade | 41.7% | 41.7% | 41.7% |
| flask only, Bench Grade | 16.7% | 33.3% | 25.0% |
| flask only, no Bench Grade | 8.3% | 25.0% | 16.7% |
| 2 vials + flask + Bench Grade *(the 12.5% config)* | 12.5% | 33.3% | 22.9% |

**Every arm carrying the Caustic Flask lands 16.7–25.0%; every arm without it
lands 39.6–45.8%.** The flask is the whole drop and nothing else is any of it.

**It was not the healing.** Two vials on their own take mean enemy healing
27 → 60 points a battle and the win rate **up**, 39.6% → 45.8%. Enemy damage
output falls 277 → 279 on the primary set and 322 → 287 on the alt while party
damage rises 355 → 372 and 357 → 391. The 1.5 turns a battle the hostile force
spends dosing are turns it does not spend hitting, and 60 points of healing
against ~370 of party output does not buy them back. **A healing enemy Chemist
is a net negative for the enemy at this scale**, which is the opposite of the
worry and is why the vials stayed.

**It was not Bench Grade.** With no satchel it is worth exactly zero (identical
records, as it must be — it reads only consumables). On the vials it is worth
+4.1 *to the party* (41.7% → 45.8% pooled). On the flask it is worth +8.3 to
the party as well: **flask without Bench Grade is 16.7% pooled against 25.0%
with it.** The support's `consumableRangeBonus` gets Perren throwing from five
tiles instead of three, which spends the flask earlier and from further out
than holding it would. Dropping Bench Grade would have made e2 harder, not
easier — the second rung of the candidate ladder is a rung down.

**It was not the flask's damage either, quite.** The flask is one use a battle
and lands **19–22 points** of chemical against ~330 of enemy damage output.
What it costs is the party's own output: −48 on the primary set, −41 on the
alt. That is Fouled — `ctMultiplierPercent` 60 and −6 evade for three turns —
landing at 70% on one of five deployed units in a fight that already runs 90
turns. Splitting the item's two effects on the primary set read 37.5%
damage-only and 50.0% status-only against 16.7% for both, which is a 24-seed
spread wider than either half can carry on its own; the honest statement is
that the flask costs ~20 points and the tempo half is the larger part of it.

**The change: one stack out of `enemySatchel`.**

| file | change |
|---|---|
| `data/encounters/e2-foundry-floor-nine.json` | `caustic-flask` × 1 removed from `enemySatchel`; two Coagulant Vials and Perren's Bench Grade untouched |

This is the first rung of the ladder and half of it: the brief's "1 vial, no
flask" reads 43.8% pooled and two vials reads 45.8%, so the smaller cut is also
the better number, and it leaves the use-item pass its demonstration — a hostile
Chemist with Bench Grade dosing his people for 45, twice a battle, on the floor
where the sympathetic strikers are. Nothing about the encounter's drama is
touched: the AND-group win condition, both provocateurs, the torch-hand, the
three hands, and all five triggers including `perren-goes-down` are as authored.
Perren's own `coagulant-jet` was never the issue and is untouched.

**Landing, confirmed on both sets:** 45.8% primary, 45.8% alt, 45.8% pooled
over 48 runs — mid-band and the flattest read in this document. Mean 90.3 turns
and 3.71 of 5 lost on the primary set, against 86.0 and 3.75 for the arm with no
satchel at all: the fight is the same length and costs the same, it just is not
losing a unit's tempo to a thrown flask any more.

**Non-monotone again, and worth the record.** e2's no-satchel control reads
45.8% on the primary set and 33.3% on the alt — a 12-point swing on the arm that
is supposed to be the fixed point, which is §7's own ±10 showing up exactly
where it was advertised. The shipped config is the only arm in the table that
reads the same number on both sets. **A single 24-seed read of e2 is not a
landing**, and the alt set would have said the flask cost nothing (33.3% against
a 33.3% control) if it had been the only set run.

#### Encounters after — campaign roster, authored levels, 24 seeds, primary set

| encounter | §7.8.1 | **after** |
|---|---|---|
| e1 Marshaling Yard | 100.0% | **100.0%** |
| e2 Foundry Floor Nine | 12.5% | **45.8%** |
| e3 Tallow Row | 45.8% | **45.8%** |
| e4 Refinery Three | 83.3% | **83.3%** |
| e5 Charterhouse Steps | 66.6% | **66.7%** |

e2 is the only row that moves; e1, e3 and e4 reproduce §7.8.1 to the digit and
e5's 66.7 is 66.6 rounded the other way off the same 16 of 24. All four fought
encounters are in the 40–100% band and e2–e5 are all inside 40–80%.

### 7.8.3 Addendum — e2's machinery, and e1's second provocateur

**This one was not found by the instrument. It was found by a person.** A
full-chapter acceptance playthrough, played the way a player plays, lost e2
**six times out of six** — 75 to 123 unit-turns each, best result three of six
enemies down — against a §7.8.2 reading of **45.8%**. Nothing in the sweep was
wrong; the sweep was answering a different question. Two AIs grinding each
other to a rout on a ninety-turn map converge on an attrition number, and
attrition is the one thing this encounter was not actually about. What the
human saw, and what no aggregate in §7.8.2 could have shown, is that **the
level's premise never once occurred.**

So this addendum is instrumented differently. Alongside win rate it counts
what the encounter is *for*:

| metric | what it counts |
|---|---|
| `pwr` | share of unit-turns on which at least one press was alive **and** powered |
| `pAct` / `eAct` | `ObjectActivated` on a press, by the player and by the enemy, summed over 24 runs |
| `pDest` | presses destroyed over 24 runs, attributed to whoever last damaged them |
| `box` | runs in which a player unit's turn began with a live press and a hostile standing in its two bed tiles |

Same instrument as §7.8.2 otherwise: campaign roster in join order, authored
levels, nothing bought, `commandCap` 4000, primary seed set (`101 + 37n`) and
the disjoint alt set (`103 + 41n`), 24 seeds each, both reported. The four
counters are not in `src/sim` — they were a throwaway loop over `createBattle`
/ `chooseCommand` / `applyCommand` reading `ObjectActivated`, `ObjectDamaged`,
`ObjectDestroyed` and per-turn object state. Folding them in is the standing
recommendation at the foot of this section.

#### What the shipped build measured

| e2 shipped | primary | alt |
|---|---|---|
| win | 45.8% | 45.8% |
| powered-press turns | **12%** | **11%** |
| press activations, player / enemy | **0 / 0** | **0 / 0** |
| presses destroyed (of 3) | **2.79 per run** | **2.75 per run** |
| runs with a live press and a hostile in its box | 24 / 24 | 24 / 24 |

**Zero press activations in 48 runs on the level whose thesis is the press
line.** The opportunity was there every single run — the box counter says so,
and `provocateur-press` starts the battle standing on (2,8), which *is*
`press-line-mid`'s bed — and it was never once taken, because by the time
anyone was beside a press the press was dark or gone. Two causes, both of them
the encounter's fault rather than the search's:

1. **The mains.** The Yard Runner spawns at (14,9), one step from
   `floor-nine-mains` at (13,10), and throws it early in every run — 28
   enemy flips over 24 runs on the primary set. `machineDenial` (G5) is
   working exactly as specified. The encounter's answer was `mains-come-back`,
   `once: true`, at turn 24; the enemy's re-cut costs one action and is
   repeatable. A one-shot restore against a repeatable cut is not a contest.
2. **The demolition.** Attribution says `torch-hand-gantry` is the last
   damager on essentially every destroyed press. With `bring-it-down` (28
   object damage, range 4) he takes a 60-hp press off the board in two casts,
   and no `setPower` trigger brings back rubble.

#### The ladder — 24 seeds per cell, both sets

Each row is the shipped tree with one set of encounter-side edits applied in
memory.

| e2 arm | primary | alt | `pwr` p/a | `pAct` p/a | `pDest` p/a |
|---|---|---|---|---|---|
| **shipped (before)** | 45.8% | 45.8% | 12 / 11 | 0 / 0 | 67 / 66 |
| `bring-it-down` off the Torch-Hand | 20.8% | 16.7% | 28 / 25 | 16 / 11 | 50 / 53 |
| restores at 48 and 72 only | 45.8% | 37.5% | 16 / 22 | 1 / 2 | 68 / 65 |
| Yard Runner moved to (14,3) only | 16.7% | 12.5% | 19 / 21 | 0 / 0 | 56 / 58 |
| `maxDeployedUnits` 5 → 6 only | 79.2% | 87.5% | 6 / 7 | 1 / 4 | 59 / 52 |
| no-`bid` + restores + drop the Yard Runner | 50.0% | 58.3% | 61 / 61 | 18 / 17 | 38 / 39 |
| no-`bid` + dense restores + drop the Yard Runner | 45.8% | 66.7% | 73 / 76 | 17 / 19 | 38 / 37 |
| no-`bid` + restores + drop the Shop Machinist | 37.5% | 29.2% | 75 / 71 | 19 / 20 | 40 / 47 |
| no-`bid` + drop the Yard Runner + foreman L2 → L1 | 87.5% | 83.3% | 52 / 49 | 13 / 15 | 40 / 37 |
| no-`bid` + drop the Yard Runner + Machinist to (12,3) | 50.0% | 37.5% | 73 / 67 | 25 / 19 | 36 / 47 |
| no-`bid` + drop the Yard Runner + `smoke-canister` off | 50.0% | 58.3% | 61 / 60 | 18 / 17 | 38 / 38 |
| no-`bid` + no-`rig-machinery` + restores + drop the Runner | 50.0% | 50.0% | 59 / 66 | 10 / 9 | 35 / 33 |
| no-`bid` + restores at 48/72 + deploy 6 | 75.0% | 75.0% | 25 / 27 | 9 / 11 | 36 / 31 |
| **no-`bid` + dense restores + deploy 6** *(shipped)* | **75.0%** | **75.0%** | **39 / 35** | **19 / 15** | 42 / 37 |
| that, plus the Runner at (14,3) | 79.2% | 66.7% | 47 / 48 | 15 / 17 | 39 / 41 |
| that, plus the Runner at (14,3), sparse restores | 83.3% | 79.2% | 39 / 43 | 15 / 16 | 40 / 39 |
| no-`bid` + restores + drop the Runner + deploy 6 | 100.0% | 100.0% | 26 / 26 | 3 / 5 | 35 / 33 |

**Taking `bring-it-down` off the Torch-Hand costs 25 points of win rate, and
that is the finding under the finding.** It is not that the ability is weak —
it is that every enemy turn spent demolishing a press is a turn not spent on
the party. The shipped 45.8% was propped up by the hostile force wasting
about a third of its actions deleting the encounter's own premise. Any fix
that gives the enemy its turns back has to hand the party something in
exchange, which is why no arm in this table is a single edit.

**Why not drop a body.** Dropping the Yard Runner is the best of the
composition cuts — 50.0/58.3 with `pwr` at 61% — and it was the leading
candidate until the deployment row was measured. It costs a placement
`ENCOUNTER_NOTES` §2 justifies on the map's own terms (the ingot rail is the
one rail lane and `rail-dash` is the only kit that reads it), it lands five
points under the band on the primary set, and the alt set disagrees with the
primary by eight — the same jumpiness §7.8.2 flagged. Dropping the Shop
Machinist instead is *worse* on both sets (37.5/29.2): he is a low-output body
that absorbs party attention, and removing him points the floor's real damage
at the party sooner.

**Why not trim a level.** Foreman L2 → L1 overshoots to 87.5/83.3, and it
spends the one characterisation the table has — he is the only L2 on the
floor, which is the tell that he is not a foundry hand.

**Why not reposition the Runner.** Moving him to the north rail so a re-cut
costs him a walk reads well and measures badly: **16.7/12.5** on its own. A
Railrunner who is not spending his turns at the switchboard is a Railrunner
spending them on `coupling-hook`, and the encounter cannot afford that.

**Why not take `rig-machinery` too.** It buys nothing: 59/66 `pwr` against
61/61 with the ability left in, and `pAct` actually falls. The presses die to
whatever the Torch-Hand has; `bring-it-down` is the only one that kills a
press fast enough to matter.

**Why the restores are five silent triggers and not `once: false`.**
`isConditionMet` reads current state, not the event batch, so a `turnStart`
trigger with `once: false` refires once per *command* for the rest of the
battle — the mains would simply stop being cuttable and the enemy would grind
its turns against a switch that snaps back. The engine has no interval
condition (gap 7 in `ENCOUNTER_NOTES`), so the repeatable restore is spelled
as a ladder: `mains-come-back` keeps its dialogue at turn 24 and
`mains-hold-36/48/60/72/84` repeat the four `setPower` actions silently, one
restore per twelve unit-turns, which is about one per round on a twelve-body
field. Sparse (48, 72 only) and dense (every 12) land on the same **75.0% on
both sets**; dense is chosen because the thesis metric is materially better —
`pwr` 39/35 against 25/27, `pAct` 19/15 against 9/11.

#### The change, and what it measures

| file | change |
|---|---|
| `data/encounters/e2-foundry-floor-nine.json` | `bring-it-down` removed from `torch-hand-gantry`'s `learnedAbilityIds`; five `mains-hold-*` triggers added; `maxDeployedUnits` 5 → 6 |

Nothing else moved. Six enemies, their levels, positions, dispositions,
equipment and remaining kits; the two Coagulant Vials and Perren's Bench
Grade; the AND-group win condition; and all five authored triggers with every
line of dialogue are exactly as they were.

| e2 | before | **after (primary)** | **after (alt)** |
|---|---|---|---|
| win | 45.8% / 45.8% | **75.0%** | **75.0%** |
| mean turns | 90 / 96 | 84 | 81 |
| party lost | 3.71 of 5 | 3.21 of 6 | 3.42 of 6 |
| enemies downed | 4.83 of 6 | 4.96 | 4.96 |
| powered-press turns | 12% / 11% | **39%** | **35%** |
| press activations, player | **0** | **19** | **15** |
| press activations, enemy | 0 | 0 | 1 |
| presses destroyed per run | 2.79 / 2.75 | 1.75 | 1.54 |
| runs with a live press and a hostile in its box | 24 / 24 | 24 / 24 | 24 / 24 |

**75.0% on both disjoint sets, to the digit** — the flattest read in this
document alongside §7.8.2's own landing, and 75.0 is deliberately the top of
the 55–75% target rather than its middle. The human evidence is the reason:
the instrument said 45.8% for a build a person lost six times running, so on
this map the sweep's number is an upper bound on a human's, and the top of the
band is the side to be wrong on. **A single 24-seed read of e2 is still not a
landing** (§7.8.2), and the two sets agreeing exactly is the only reason to
believe this one.

#### e1 — the second provocateur never acted, and it was the CT clock

Same playthrough, second finding: `provocateur-b` spawns on turn 2 at (1,0),
is scripted off the field on turn 8, and in six attempts existed only as
something to stand next to. The sim agreed without qualification — **0 turns,
0 moves, 0 damage in 48 of 48 runs** — and the cause is not placement.

A spawned unit enters at `ct: 0` (`createBattleUnit`) while everybody else is
mid-clock, and `state.turn` counts unit turns, not rounds (gap 3): on a
seven-body field a unit turn costs roughly two ticks, so turn 2 to turn 8 is
about eleven ticks. At the Enforcer's level-1 Speed of 6 he peaks at **66 CT**
and is removed still holding it. Moving the spawn to (3,1), (3,2), (2,2) or
(1,2) does not change a single number, because he never gets a turn from any
of them.

| e1 arm | win p/a | b's turns, mean | runs with ≥1 turn | b's damage p/a | b's peak CT |
|---|---|---|---|---|---|
| **shipped (before)** | 100 / 100 | 0.00 | 0 / 24, 0 / 24 | 0.0 / 0.0 | 66 |
| spawn at (3,1) / (3,2) / (2,2) / (1,2) | 100 / 100 | 0.00 | 0 / 24 | 0.0 | 66 |
| removal pushed to turn 12 | 100 / 100 | 0.00 | 0 / 24 | 0.0 | 66 |
| removal pushed to turn 14 | 100 / 100 | 0.17 / 0.00 | 4 / 24, 0 / 24 | 0.0 | 100 |
| **level 1 → 2** *(shipped)* | **100 / 100** | **1.00** | **24 / 24 both sets** | **37.2 / 38.0** | 100 |
| level 2, spawn at (2,1) | 100 / 100 | 1.00 | 24 / 24 | 37.2 / 38.0 | 100 |
| level 2, spawn at (3,1) | 100 / 100 | 1.00 | 24 / 24 | **0.0** | 100 |
| level 3, spawn at (3,1) | 100 / 100 | 1.00 | 24 / 24 | 17.5 / 18.4 | 112 |
| level 2, removal at turn 14 | 100 / 100 | 1.33 / 1.50 | 24 / 24 | 37.2 / 38.0 | 100 |

**The change is one integer.** Level 2 puts his Speed at 10, he clears 100 CT
inside the window, and he spends his one turn walking into the Watch line and
putting a shock maul into somebody for 37–38 points. The spawn tile stayed at
(1,0): from there and from (2,1) the numbers are identical, and (3,1)/(2,2)
are strictly worse — he arrives engaged and gets killed instead of swinging,
and the battle stretches from 11.7 to 17 turns for no beat.

**Two turns is not available at turn 8 and should not be bought.** A second
turn needs another ~100 CT, about ten more ticks, which lands past turn 12;
removal at 14 delivers it in only 8–12 of 24 runs and costs the beat outright
(the party downs him before the wall in 20 of 24). `over-the-wall` stayed at
turn 8 with its dialogue untouched, as did `the-first-maul`, Maren's spawn,
and every other line.

| file | change |
|---|---|
| `data/encounters/e1-marshaling-yard.json` | `provocateur-b.level` 1 → 2 |

e1 remains the walkover it is designed to be: **100.0% on both 24-seed sets,
zero party losses**, mean 11.0 → 11.7 unit turns.

#### Encounters after — campaign roster, authored levels, 24 seeds

| encounter | §7.8.2 primary | **7.8.3 primary** | **7.8.3 alt** |
|---|---|---|---|
| e1 Marshaling Yard | 100.0% | **100.0%** | **100.0%** |
| e2 Foundry Floor Nine | 45.8% | **75.0%** | **75.0%** |

e3, e4 and e5 were not re-measured here: they are outside this pass's remit and
were being edited concurrently by another workstream, so any number taken for
them would have been a number for somebody else's build.

#### The honest note

**The driving evidence for both changes was a human disagreeing with the
sweep, and neither change would have been made from the sweep alone.** e2 read
45.8% — mid-band, the flattest number in §7.8.2, nothing to act on — while a
person lost it six times in a row. e1 read 100% and would have gone on reading
100% forever with a unit on the field that never took a turn, because no
aggregate in `src/sim/analysis.ts` asks whether a placed unit ever acted. The
instrument is not wrong; it is answering "does the party win" when the
questions that mattered were "does the level's premise ever happen" and "does
this character ever do anything." Both were cheap to count once someone knew
to count them, and the counters used here (`pwr`, `pAct`, `pDest`, `box`,
per-unit turns-taken) are worth folding into `analysis.ts` as standing
findings rather than being rebuilt by hand the next time a playthrough
disagrees with a sweep.

### 7.8.4 Addendum — e4 under the objective-aware AI

§7.8.1 landed e4 at **83.3%** and named it the pass's own cost: Overload Cell
going from four casts to twenty-seven "takes Refinery Three from 62.5% to
83.3%… the encounter was authored against an ability that did not work."
§7.8.3 did not re-measure it, and in between `a0cbaa6` taught the search to
score escape and reach conditions — *"AI objective awareness: escape/reach
conditions scored (Wick takes the stair); e4 probe 4/6 → 5/6 noted for the
next balance sweep."* This is that sweep, and e4 is the encounter it has to
matter to: its win list is `reachTiles` **or** `defeatUnit(nessa-kiln)`, so it
is the one shipped fight with a second way to win.

**The instrument is §7.8.2's**, now *in* `src/sim` rather than beside it:
campaign roster in join order, authored levels, nothing bought, `commandCap`
4000, on the primary seed set (`101 + 37n`) and the disjoint alt set
(`103 + 41n`), 24 seeds each. One call —
`encounterRuns(content, ["e4-refinery-three"], PRIMARY_ENCOUNTER_SEEDS, { commandCap: 4000 })`.

| e4 Refinery Three | §7.8.1 | **primary** | **alt** | **pooled 48** |
|---|---|---|---|---|
| win | 83.3% | **91.7%** | **79.2%** | **85.4%** |
| mean turns | — | 91.6 | 93.3 | |
| party lost, of 6 | — | 2.79 | 2.92 | |
| surviving party hp% | — | 39.1 | 38.9 | |
| stalemates | — | 0 | 0 | |

**The movement is the second win route, and it is measurable directly.**
Splitting the wins by how they were won: Nessa is put down in **16 of 24 runs
on both sets, to the digit**, and every remaining win is the party standing on
the switchboard tiles with her still up — **6 primary, 3 alt**. The kill route
is a fixed point across two disjoint seed sets at 66.7%; everything above it is
the reach condition now being scored. §7.8.1's 83.3% was 20 of 24 on this same
primary set, so the objective-aware search is worth roughly two runs in
twenty-four here.

| e4 counters, 24 runs each | primary | alt |
|---|---|---|
| machines worked — party / hostile / bystander | 9 / 0 / **25** | 1 / 0 / **32** |
| — `switchboard-main` | 25 | 32 |
| — `condenser-bank-east` | 8 | 1 |
| — `feed-switch-east` | 1 | 0 |
| power flips per run | 10.75 | 11.46 |
| powered-machine turns | 98% | 100% |
| objects broken per run | 7.46 | 8.13 |
| `the-licence-does-not-carry-her` (Nessa < 40%) | 18 / 24 | 18 / 24 |
| `on-the-ring` | 3 / 24 | 3 / 24 |
| `at-the-switchboard` | 2 / 24 | 0 / 24 |

Two things fall out of the counters that no win rate was going to show.

- **The bystander does the machinery.** Quill — the map's one neutral — works
  `switchboard-main` 25 times on the primary set and 32 on the alt, against
  nine party activations of everything else and **zero** from the hostile
  force. `COMBAT_RULES` §18 scores neutrals at zero in either direction, so
  nobody stops her and nobody helps her, and she is the only unit on the field
  whose turns go into the encounter's own machine. Not a defect — but it means
  any future read of "does the party use the refinery" has to subtract her
  first, which is why `machineryOperated` is split by side rather than totalled.
- **The party wins on the switchboard without ever standing where the beat is
  written.** `at-the-switchboard` covers `(6,2) (7,2) (8,2) (9,2)`; the win
  tiles are `(6,1) (7,0) (7,1) (7,2)`, and `switchboard-main` itself sits on
  `(7,1)`. They share exactly one tile, so six reach wins on the primary set
  produced two firings of the line written for arriving there. `on-the-ring`
  is 3 of 24 for the same reason: the fight is over before the ground it is
  written on gets walked.

**Where that leaves the band.** 91.7% is 8.4 points over the 83% ceiling,
79.2% is 3.8 under it, and pooled over 48 runs e4 reads **85.4% — over by
2.4**. Two disjoint sets straddling a band edge by less than the ±10 a
24-seed encounter read carries is not a landing in either direction, but the
pooled number is the one the discipline says to believe, and it is out. A
proposal is therefore owed; a change is not made here.

**Proposed, not applied.** This pass is verification and instrumentation, and
an e4 landing needs a ladder on both sets (§7.8.2) — that is a balance pass and
it belongs to the encounter workstream. The numbers point at the **win
condition's tile set**, not at any kit, level or body count: the kill route is
a stable 66.7% on both sets, so nothing about the fight is out of band. Two
candidates, cheapest first:

1. **Gate the reach win on a unit.** `reachTiles` already takes an optional
   `unitId`. The licence is one character's errand; requiring that the party
   member who owns it be the one to reach the switchboard costs the AI the
   "any body will do" shortcut without touching a single stat. Expected: most
   of the nine reach wins across the two sets, pooled toward the high 60s or
   low 70s.
2. **Align `at-the-switchboard` with the win tiles**, or move the win tiles
   onto its row. This does not move the win rate on its own; it is the fix for
   the *second* finding above, and it should be measured with (1) rather than
   against it.

What would confirm either: the same call on both seed sets, target 62–80%
pooled, with **the kill route held at 16 of 24 as the control** — a change that
moves that number is changing the fight rather than the objective and is the
wrong change.

### 7.8.5 Addendum — e2 and e5 re-validated under the current engine

Two engine commits landed after these encounters were last measured. `5c7d875`
made an HP-threshold beat fire when the downing blow overkills straight past it
(and `moveUnit` no-op on a downed unit); `05fc36f` moved ability-targeting
legality into the controller, leaving `applyCommand` untouched. Neither is a
content change, both can move a sim number, and one of them is aimed squarely
at e5.

**The legality change is inert here, and that is measured rather than
assumed.** e2, e4 and e5 run at **0.00 rejected commands per battle across all
144 runs**: the search was already proposing only legal targets, so `05fc36f`
fixed the aim overlay and nothing the sim can see.

#### e2 Foundry Floor Nine

The standing record for e2 is §7.8.3's **75.0% on both sets** — §7.8.2's 45.8%
was superseded by the machinery fix in the same section. It reproduces:

| e2 | §7.8.3 | **primary** | **alt** |
|---|---|---|---|
| win | 75.0% / 75.0% | **75.0%** | **75.0%** |
| mean turns | 84 / 81 | 83.5 | 80.9 |
| party lost, of 6 | 3.21 / 3.42 | 3.21 | 3.42 |
| press activations, party | 19 / 15 | **19** | **15** |
| press activations, hostile | 0 / 1 | **0** | **1** |
| stalemates | 0 | 0 | 0 |

Every line reproduces to the digit on both sets, including the two counters
§7.8.3 rolled by hand. The trigger engine changed underneath it and e2 did not
move, which is the answer this re-check was asked for.

**The press-fire rate, asked for directly.** §7.8.3's finding came from a
person who lost e2 six times running and never once fired a press; the question
is how often the sim's AI does.

| e2 press fire, 24 runs each | primary | alt |
|---|---|---|
| party press activations | 19 | 15 |
| **runs with at least one party press** | **18 / 24 (75%)** | **14 / 24 (58%)** |
| hostile press activations | 0 | 1 |
| runs with any press fired | 18 / 24 | 15 / 24 |
| party press activations per run | 0.79 | 0.63 |

**It is not ~0, and the design observation runs the other way.** The sim's
party fires a press in **32 of 48 runs**, and almost never twice in the same
run: 19 activations across 18 runs. So the press window is not sim-invisible.
It is **sim-visible and player-invisible** — the search reads the press's
`operable` payload against whoever is standing in its bed the instant they
stand there, which is knowledge a first-time player cannot get off the board.
That makes the gap the acceptance playthrough found a **presentation** problem
rather than a balance one, and nothing is retuned for it here: the encounter is
mid-band on both sets and its thesis metric is healthy.

**The mains is still most of the machinery in the level.**

| e2 machinery, 24 runs each | primary | alt |
|---|---|---|
| party machine operations | 106 | 106 |
| — of which `floor-nine-mains` | 86 (81%) | 91 (86%) |
| — of which the press line | 19 | 15 |
| hostile machine operations | 22 | 16 |
| — of which `floor-nine-mains` | 22 (100%) | 15 (94%) |
| power flips per run | **32.9** | **31.7** |
| powered-machine turns | 42% | 38% |
| `aisle-mouth` | 4 / 24 | 3 / 24 |

The flip count is §7.8.3's tug-of-war doing exactly what it was built to do:
one mains activation moves four objects, so 128 activations across a set is
about 430 flips, against about 340 the five `mains-hold-*` triggers put back.
The powered-machine share reads 42%/38% against §7.8.3's hand-rolled `pwr` of
39%/35% for what is demonstrably the same runs, and the three-point gap is a
definition rather than a disagreement: the folded-in counter counts every
power-gated operable, which on Floor Nine is the three presses **and**
`pour-ladle-tap`. `aisle-mouth` firing in 4 and 3 runs of 24 is recorded, not
acted on.

#### e5 Charterhouse Steps

e5 is where `5c7d875` bites. `aldric-to-the-court` is gated on Aldric below
55% and it does not only speak: it moves him and **spawns the court
reinforcement**. Before the fix, a blow that took him from above 55% to nothing
skipped a body onto the board as well as a line.

| e5 | §7.8.1 / §7.8.2 | **primary** | **alt** |
|---|---|---|---|
| win | 66.6% / 66.7% | **66.7%** | **58.3%** |
| mean turns | — | 74.4 | 81.3 |
| party lost, of 7 | — | 3.46 | 3.67 |
| stalemates, capped runs, errors | — | 0 | 0 |
| `terrace-two-the-proof` (Aldric < 90%) | — | 22 / 24 | 23 / 24 |
| `aldric-to-the-court` (< 55%) | — | 20 / 24 | 20 / 24 |
| `the-record-closes` (Aldric downed) | — | 16 / 24 | 14 / 24 |
| court reinforcements spawned | — | 20 | 20 |

**The sim completes e5 without errors and the win rate did not move
materially.** 66.7% on the primary set is the same 16 of 24 that §7.8.1 and
§7.8.2 recorded as 66.6/66.7. The alt set reads 58.3%, 8.4 points down, inside
the ±10 a 24-seed encounter read carries; pooled over 48 runs e5 is **62.5%**,
mid-band. `the-record-closes` fires 16 and 14 times — exactly the win counts on
each set — so no run downs Aldric without the closing beat, which is the
ordering the overkill fix was made for.

**Two things the new flags caught on their first outing.**

- **`the-top-step` never fires, in 48 of 48 runs.** It is gated
  `afterTriggerId: aldric-to-the-court`, and that gate is not the reason: the
  withdrawal fires in 20 of 24 runs on both sets. The party simply wins on the
  terraces and never walks the `y = 4` row the beat is written on. Same shape
  as e4's `at-the-switchboard`, and the same call — recorded for the encounter
  workstream, not acted on here.
- **e5's one operable machine is never worked, in 48 of 48 runs.**
  `lift-cutout` is a `requiresPower: false` switch whose job is cutting the
  service lift, and `the-steps-are-closed` already cuts the lift's power at
  battle start — the single power flip in the whole encounter (1.00 per run,
  all of it scripted). The switch's work is done before anyone can reach it.
  **A design observation, not a retune:** Charterhouse Steps is a terrain
  encounter with a vestigial machine on it, which is a defensible thing for the
  chapter's finale to be. The flag fires because the counter cannot know that,
  and it is better that it fires.

### 7.8.6 Addendum — the sentry-frame denominator, and the counters that now stand

§7.8.3 closed by recommending that its four throwaway counters be folded into
`src/sim/analysis.ts` "as standing findings rather than being rebuilt by hand
the next time a playthrough disagrees with a sweep." They are, and folding them
in turned up the denominator §7.8.1 had half-diagnosed.

#### The counter surface

`BattleCounters` rides on every `BattleRecord`, so a sweep and a one-off
re-check see the same numbers. `analysis.ts` aggregates them:

| counter | what it counts |
|---|---|
| `machineryOperated` | `ObjectActivated`, split player / enemy / neutral, plus `operatedByObject` with the same split per machine |
| `powerOn`, `powerOff` | `PowerChanged`, split by direction and by whether the actor or a trigger caused it |
| `objectsBroken` | `ObjectDestroyed`, attributed to whoever last damaged it; `scripted` for a payload with no caster |
| `triggersFired` | `TriggerFired` by trigger id — which beats happen, and how often |
| `unitsSpawned`, `unitsRemoved` | reinforcements and scripted exits |
| `turnsWithMachine` / `turnsWithLiveMachine` / `turnsWithPoweredMachine` | unit turns that began with an operable machine standing, workable, and — the number a level built on cutting power lives by — lit |
| `UnitRecord.turnsTaken` (already there) | rolled up as `idleUnits`: who stood on the field and never reached 100 CT |

Over a set of runs, `objectiveCounters(battles)` totals all of it and
`encounterReports(battles)` puts it beside the win rate, losses, turns and
surviving HP, one row per encounter — which is what "reported alongside win
rates" has to mean for the §7.8.3 failure not to recur. `objectiveFindings`
raises the three flags a win rate structurally cannot: `machinery-never-operated`,
`trigger-never-fired`, `unit-never-acts`. All three fired on their first
outing (§7.8.5), and none of them is a bug — which is the point: they are
questions the instrument was not asking at all.

The seed discipline is code now too: `seedSet`, `PRIMARY_ENCOUNTER_SEEDS`
(`101 + 37n`), `ALT_ENCOUNTER_SEEDS` (`103 + 41n`) and `encounterRuns` in
`src/sim/sweeps.ts`. Every number in §7.8.4 and §7.8.5 is one call each.

#### The denominator

**A turn's action is spent three ways.** `act`, `useItem` and `activateObject`
all set `turn.acted`, and all three come out of the same candidate list — the
search prices `activateObject` against every ability the unit could cast
instead. `abilityUsage`'s `totalActionsByJob` counted only `act`, so every
share it has ever reported is **over-stated on any map with machinery on it**,
in proportion to how much machinery the job works.

The §7 duel sweep re-run on the current build — 7×7 job pairs, levels 1/3/5,
seed 101, `sim-arena` plus the Marshaling Yard, 294 battles — reproduces
§7.8.1's usage table exactly and then corrects it:

| job | ability actions | machinery worked | items | **denominator** |
|---|---|---|---|---|
| augmented | 253 | 0 | 0 | 253 |
| chemist | 632 | 1 | 0 | 633 |
| conduit | 254 | 0 | 0 | 254 |
| enforcer | 445 | 0 | 0 | 445 |
| machinist | 380 | **5** | 0 | **385** |
| railrunner | 555 | **7** | 0 | 562 |
| saboteur | 362 | **6** | 0 | 368 |

| over 40% of its job's actions | §7.8.1 | **corrected** |
|---|---|---|
| conduit \| arc | 88% | 88.2% (224 / 254) |
| enforcer \| pin | 51% | 51.2% (228 / 445) |
| railrunner \| coupling-hook | 49% | 48.2% (271 / 562) |
| machinist \| sentry-frame | **41%** | **40.0% (154 / 385)** |

**Four over-users to three.** Sentry Frame is 154 of 385, which is 40.0% to
three places and does not clear `THRESHOLDS.abilityDominance` — the frame sits
exactly on the line rather than one point over it. §7.8.1's instinct was
right ("it is a denominator") and its arithmetic was working from a
denominator that was itself wrong. Nothing about the frame's pricing changed
and nothing about the Machinist's kit is retuned: the ability is where G6 left
it, and the number that moved was the instrument's.

The other three rows move by fractions of a point or not at all, because the
Conduit and the Enforcer never touch a machine in 84 unit-battles each. The
correction bites where the pillar is — a job that works the board is reported
as spending less of its turn on abilities than it looked like, which is exactly
the direction that matters when the question is "is this ability dominating
this kit."

### 7.8.7 Addendum — e4's reach win gated on Marek Sump

§7.8.4 measured e4 at **85.4% pooled**, 2.4 over the ceiling, and proposed the
fix without applying it: the kill route is a fixed 16 of 24 on both seed sets,
every win above it is the `reachTiles` route the objective-aware AI now scores,
and `reachTiles` already carries an optional `unitId`. This is that change,
applied. **No schema amendment was needed** — `SimpleWinCondition`'s
`reachTiles` has taken `unitId` since the contract was frozen, and both
`src/core/rules/outcome.ts` and the AI's `objectiveOf` in
`src/core/ai/context.ts` already honour it. Nothing but the one JSON line moved.

**Who the AI was actually sending.** Before choosing, the six primary and three
alt reach wins were resolved to a unit by replaying with `keepEvents` and taking
the last `UnitMoved` onto a win tile:

| reacher | primary | alt |
|---|---|---|
| `della-tine` | 3 | 1 |
| `marek-sump` | 3 | 2 |
| everyone else | 0 | 0 |

Rowen never made the run in 48 baseline runs — she is the party's only L1 with
no movement ability, and the gallery is at height 4 behind a catwalk.

**The ladder, tuned on the primary set only.** Three gates, one call each
(`encounterRuns(content, ["e4-refinery-three"], PRIMARY_ENCOUNTER_SEEDS,
{ commandCap: 4000 })`), scored against the control §7.8.4 named — the kill
route holding at 16:

| primary, 24 seeds | win | kill | reach | control |
|---|---|---|---|---|
| baseline (no gate) | 91.7% | 16 | 6 | — |
| `unitId: rowen` | 83.3% | **20** | **0** | fails both ways |
| `unitId: della-tine` | 91.7% | **19** | 3 | fails; rate does not move |
| `unitId: marek-sump` | **83.3%** | 17 | 3 | **holds — see below** |

Rowen is the reading the fiction reaches for first and it is the wrong one
twice over: the reach route dies outright at 0 of 24, which §7.8.4's own test
says means the route is no longer real, and the kill route jumps four because
the five units that lost their objective pull simply fight instead. Della moves
the kill route three and the win rate not at all.

**Validation on the disjoint alt set**, never tuned on:

| e4 Refinery Three | §7.8.4 primary | **primary** | §7.8.4 alt | **alt** | **pooled 48** |
|---|---|---|---|---|---|
| win | 91.7% | **83.3%** | 79.2% | **79.2%** | **85.4% → 81.3%** |
| kill route | 16 / 24 | 17 / 24 | 16 / 24 | 17 / 24 | |
| reach route | 6 / 24 | 3 / 24 | 3 / 24 | 2 / 24 | 9 → **5 of 48** |
| mean turns | 91.6 | 95.1 | 93.3 | 94.1 | |
| party lost, of 6 | 2.79 | 3.04 | 2.92 | 2.92 | |
| surviving party hp% | 39.1 | 35.3 | 38.9 | 38.8 | |
| stalemates | 0 | 0 | 0 | 0 | |

**The control, read at the seed rather than the total.** The kill route reads
17 of 24 on both sets, not 16, and the seed lists say why: **all sixteen
baseline kill-win seeds are kill wins after the change, on both sets**, and the
seventeenth is in each case a former reach win — `767` on the primary set, `718`
on the alt — that now runs on past the tile it used to end on and finishes Nessa
instead. The surviving reach seeds are a strict subset of the baseline's
(`{397, 471, 545}` of `{101, 397, 434, 471, 545, 767}`; `{308, 513}` of
`{308, 513, 718}`). That is the control passing in the only form it can: an
aggregate of exactly 16 was never reachable, because ending a battle later is
what removing a win route *does*. The gate that scores worst on the seed lists
is also the one that moves the aggregate most (Rowen, +4 and +3), so the two
readings agree on the ranking.

**Where it lands.** Pooled **81.3%**, inside the 40–83% band with 1.7 to spare,
and the two sets close from a 12.5-point straddle (91.7 / 79.2) to 4.1
(83.3 / 79.2) — the first time e4 has read the same fight on both seed sets.
The reach route survives at 5 of 48 rather than 9; it is narrower, which is the
point, and it is not dead. Party losses rise 0.25 on the primary set and not at
all on the alt, and turns rise three and one: the fight itself is where §7.8.4
left it.

**Why Marek.** `CONTENT_NOTES` gives him the party's lowest Resolve and the
reason for it — *"nerve for wiring, not for standing."* A switchboard is
wiring. His movement ability is `catwalk-sense`, *"you have crawled over enough
condemned grating to know which of it holds"*, and after `midpoint-overload`
takes `tower-walk-south` and both hoists, condemned grating at height 4 is the
only way left to the gallery. Rowen's `on-the-ring` line — *"It is not for
seeing. It is the way to the board."* — is the order, not the errand; she names
the route and the man who crosses grating for a living takes it. `ENCOUNTER_NOTES`
§4 is updated with the consequence: the reach route is now conditional on
deploying Marek, and a party that leaves him behind fights e4 on the kill route
alone.

**Not done here.** §7.8.4's second finding — `at-the-switchboard` covers
`(6,2)…(9,2)` and the win tiles are `(6,1) (7,0) (7,1) (7,2)`, sharing one tile
— is untouched, and the trigger still fires 0–2 times in 24. It is a beat that
does not play, not a rate that is out of band, and it belongs to the encounter
workstream. The counters are otherwise unmoved: Quill still works
`switchboard-main` 25 and 34 times against zero party and zero hostile
activations of it.

### 7.9 Regenerated test expectations

Three, all of them AI-choice replays or valuations the pass deliberately
changed:

1. **`tests/app/campaignLoop.test.ts`, "loops straight back into a playable
   battle afterwards"** — asserted `completedEncounterIds.length <= 1` behind a
   stale comment claiming battles 2–5 have no encounter files. e2 exists and the
   party now wins it often enough to bank it. Regenerated to the invariant the
   test is actually for: the campaign banks exactly one completed encounter per
   battle the party won, whichever way the battles go.
2. **`tests/core/ai/scoring.test.ts`, "caps a self-buff below the value of a
   kill"** — the bench ability is Overdrive-shaped (6 flux, 8 HP) on an
   Enforcer's seven-point pool, which G3 now correctly prices below zero. The
   cap it was written to check is now measured on a free version of the same
   buff, and the pricing it ran into is a second test of its own ("refuses a
   self-buff that would eat most of the flux the unit has left").
3. **`tests/core/ai/scoring.test.ts` gained six cases** rather than changing
   any: the step forward and the step back (G1), the held status at full and at
   one turn left (G2), the blocker priced by the detour it imposes (G4), the
   breaker on a machine the enemy could work (G5), the deployable that cannot
   reach anything (G6), and the contact payload the engine would zero (G7).

Nothing else moved. `tests/core`, `tests/app`, `tests/sim` and
`tests/content.test.ts` are green — 244 tests.

---

## Appendix — where each headline number comes from

Every number above is in the dump written by:

```sh
GREYFALL_SIM=full GREYFALL_SIM_OUT=/tmp/greyfall-sweep.md \
  npx vitest run tests/sim/sweeps.test.ts
```

| finding | dump section |
|---|---|
| F1 TTK matrix and summary | §7 |
| F1 first-round downs by level | §8, "Variant duel sweeps" |
| F2 job win rates, per level, per map, full pair matrix | §1 |
| F2 comp results | §5 |
| F3 never-chosen and dominating abilities, full usage table | §3, §10 |
| F4 usage shares | §3 |
| F5 side bias and the id-order control | §2 |
| F6 encounter win rates | §6 |
| F7 flux economy | §4 |
| (b) variant comparison | §8 |
| (c) weight-table comparison | §9 |

Totals for that run: **2,591 battles**, 288 s of simulation — 882 duels, 84
four-versus-four comp battles, 50 encounter battles, 588 formula-variant duels,
735 weight-table duels, 252 tempo-control duels, plus about 4,400 scripted
weapon duels for the TTK matrices.

**§6's numbers come from a variant-free run of the same config** — 1,268
battles, 236 s: 882 duels, 84 comps, 50 encounter battles, 252 tempo controls,
plus the TTK matrices. Its dump uses the same section numbers minus §8 and §9,
which are empty without variants and weight tables. The encounter figures in
§6.4 are a separate ten-seed pass over the five shipped encounters in campaign
order, which also reports Standing banked per unit per battle; the five-seed
figures in the sweep's own §6 agree with it to within the sample
(e1 100 / e2 80 / e3 40 / e4 80 / e5 60).
