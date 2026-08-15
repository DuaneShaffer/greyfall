# Balance Report — the Foundry Chapter slice

What 2,591 headless AI-versus-AI battles say about the shipped numbers, and the
changeset the next wave should make. Measurement only: this wave touched no
content, no core rules, and no AI weights.

Governing docs: `docs/COMBAT_RULES.md` (the formulas), `docs/CONTENT_NOTES.md`
(why the numbers are what they are), `docs/AI_DESIGN.md` (what the AI can and
cannot see). Workstream 20 in `docs/PROJECT_BREAKDOWN.md`; this report answers
findings-queue item 6.

---

## 0. How to reproduce

The instrument is `src/sim/`, driven through vitest. Node cannot run it
directly: `src/core` imports itself with `.js` specifiers that resolve to `.ts`
sources, and `node --experimental-strip-types` does not rewrite them.

```sh
# the CI-sized smoke sweep plus every harness test — about 12 seconds
npx vitest run tests/sim

# the full measurement run behind every number in this report — about 5 minutes
GREYFALL_SIM=full GREYFALL_SIM_OUT=/tmp/greyfall-sweep.md \
  npx vitest run tests/sim/sweeps.test.ts
```

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

**Recommendation: level-scale the damage divisor.**

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

---

## 5. Suggested order for the next wave

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

Totals for this run: **2,591 battles**, 288 s of simulation — 882 duels, 84
four-versus-four comp battles, 50 encounter battles, 588 formula-variant duels,
735 weight-table duels, 252 tempo-control duels, plus about 4,400 scripted
weapon duels for the TTK matrices.
