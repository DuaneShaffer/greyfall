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
> **`src/sim/variants.ts` is stale.** `divisorVariant()` emulates a fix that is
> now *in* the engine, so running it double-applies the divisor. §4(b)'s
> variant table is historical evidence for a decision already taken; do not read
> it as a live comparison. §6's numbers come from a variant-free sweep.

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
still passes `CANDIDATE_VARIANTS`, and `divisorVariant` now double-applies a
divisor the engine already scales, so half of that run measures an engine that
does not exist. The post-rebalance sweep is the same `FULL_CONFIG` with the
synthetic engines switched off — 1,268 battles, about four minutes:

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
`src/sim/ttk.ts`.

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

- **Enforcer 68% / Machinist 34%.** Both are one band-edge away and both are
  blocked, not unattended. The Enforcer's residual is `pin`: a measured A/B
  over 392 duels puts Stunned `chance` 60 → 35 at **68% → 53%**, the largest
  single lever in the game. `data/abilities/pin.json` is mirrored verbatim in
  `src/ui/mock.ts` and asserted by `tests/ui/mock.test.ts`, so it could not be
  edited without breaking a test outside this pass's remit. Same for
  `overload-cell` (wanted: 8 → 5 flux, power 16 → 20, `requires: targetPowered`).
  `CONTENT_NOTES` §9 carries both diffs for the UI workstream.
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
| G8 | `src/ui/mock.ts` + `tests/ui/mock.test.ts` | **Seven content files are frozen by a UI fidelity mirror** — `jobs/enforcer`, `jobs/conduit`, `abilities/pin`, `abilities/overload-cell`, `items/shock-maul`, `statuses/stunned`, `units/rowen`. | The two biggest un-taken levers in the game, quantified in §6.6. |
| G9 | `src/core/ai/index.ts` | **Search cost is superlinear in Move.** `actionOptions` is evaluated from every reachable tile, so one point of Move on one unit multiplies that unit's per-turn search by the growth of its reachable set. Measured: slotting `earth-strap` (move +1) on Vale took `tests/app/campaignLoop.test.ts`'s two-battle run from **1.42 s to 2.36 s** — a 65% increase in the whole test from one stat point on one unit. | Vale ships without a movement passive. Any future Move-boosting content wants a pruning pass in the search first. |

None of G1–G6 is tunable from `weights.ts`; they are all valuation gaps in
`score.ts`, in the same family as the C3–C5 that landed last pass.

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
