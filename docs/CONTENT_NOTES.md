# Content Notes — the Foundry Chapter slice

What is in `data/jobs`, `data/abilities`, `data/items`, `data/statuses`, and
`data/units`, why the numbers are what they are, and where the effect
vocabulary could not say what the creative bible asked for.

Governing docs: `docs/CREATIVE_BIBLE.md` (§5 rules of magic, §6 job fantasies,
§9 naming) and `docs/COMBAT_RULES.md` (every formula quoted below).

Counts: **7 jobs · 56 abilities · 11 statuses · 35 items · 17 units**.

---

## 1. The job tree

Three entry jobs, four earned. Job levels are the progression workstream's
currency; `prerequisites` reads `jobId -> minimum job level`.

```
  ENFORCER ──────2──────> RAILRUNNER
  (entry)   │
            └──2──┐
  CONDUIT ────2───┴────> AUGMENTED
  (entry)

  CHEMIST ───2───> MACHINIST ───2───┐
  (entry)  │                        ├──> SABOTEUR
           └────────3───────────────┘
```

| Job | Prerequisites | Why |
|---|---|---|
| Enforcer | — | The Watch trains anyone it hires. The readable baseline. |
| Conduit | — | Not a career ladder: the Assay licenses attunement you were born with, so nothing precedes it. Bible §5.2. |
| Chemist | — | Bench work is the trades' entry rung; the Combine's own path in. |
| Machinist | Chemist 2 | You handle compounds before you are trusted with frames and cells. |
| Railrunner | Enforcer 2 | Yard work under load needs the standing-up-under-pressure the Watch drills first. It is the one place a House-trained body crosses into Combine work — deliberately, for Rowen's arc. |
| Saboteur | Chemist 3, Machinist 2 | Two parents, FFT-style: the payload comes from the bench, the mechanism from the shop. |
| Augmented | Conduit 2, Enforcer 2 | You must couple to flux at all (Conduit) and have a body that survives the load (Enforcer). |

Every job carries `equipTags` of `[job tag, armor weight, (shield), accessory,
field-issue]`. `accessory` and `field-issue` were added to **all seven**
(including the two pre-existing jobs) so accessories and consumables are
equippable at all — without them no job shares a tag with either item class.

## 2. Stat curves

`raw = STAT_BASE + growth * level`, then `× multiplierPercent`
(COMBAT_RULES §2). Move/Jump/Evade are flats.

| Job | hp | charge | speed | phys | mag | M/J/E |
|---|---|---|---|---|---|---|
| Enforcer | 11 ×120 | 2 ×70 | 4 ×100 | 8 ×115 | 2 ×75 | 3/2/8 |
| Conduit | 7 ×85 | 9 ×130 | 4 ×100 | 3 ×70 | 8 ×125 | 3/1/5 |
| Chemist | 8 ×**110** | 6 ×100 | 4 ×100 | 5 ×90 | 6 ×**115** | 3/2/6 |
| Machinist | **9** ×**105** | 7 ×**125** | 4 ×**100** | 5 ×**100** | 5 ×95 | 3/2/6 |
| Saboteur | 8 ×**100** | 4 ×**100** | 4 ×105 | 7 ×105 | 3 ×80 | 4/2/10 |
| Railrunner | 8 ×**100** | 4 ×85 | 5 ×**105** | 6 ×100 | 3 ×80 | 5/3/**12** |
| Augmented | 10 ×**105** | 6 ×105 | 3 ×100 | 10 ×115 | 4 ×85 | 3/4/4 |

Bold entries are the rebalance pass's changes; see `docs/BALANCE_REPORT.md`
§6 for the before/after win rates each one bought.

**Enforcer and Conduit were not touched.** Their curves and flats are asserted
verbatim by `tests/core/stats.test.ts` and quoted as worked examples in
COMBAT_RULES §2 and §4. Only their ability lists and equip tags changed. The
other five were fitted around those two fixed points.

Resulting level-1 lines (no equipment):

| Job | hp | charge | speed | phys | mag |
|---|---|---|---|---|---|
| Enforcer | 61 | 7 | 6 | 9 | 1 |
| Conduit | 39 | 22 | 6 | 2 | 10 |
| Chemist | 52 | 14 | 6 | 4 | 6 |
| Machinist | 51 | 18 | 6 | 5 | 4 |
| Saboteur | 48 | 12 | 6 | 7 | 2 |
| Railrunner | 48 | 10 | **7** | 6 | 2 |
| Augmented | 52 | 14 | 5 | **11** | 3 |

Personality read: the Enforcer is the HP wall, the Augmented the damage
outlier that pays in HP and Evade, the Railrunner buys extra turns (Speed 7 vs
6) and Move 5 with the thinnest damage, the Conduit and Machinist hold the two
big charge pools, and the Chemist is deliberately the flat average against
which the others read as extreme.

The rebalance pass narrowed the spread rather than the personalities. Speed 8
was the single most extreme cell in the whole sweep (the Railrunner won 96% of
its level-1 duels off it), and the five non-frozen jobs' HP curves were raised
towards the Enforcer's because the Enforcer's ×120 is asserted by
`tests/core/stats.test.ts` and cannot come down.

## 3. Charge economies

`chargeCost` was set against each job's own pool, not a global scale, so
"expensive" means the same thing in every kit:

| Job | L1 pool | Signature | Uses per battle at L1 |
|---|---|---|---|
| Enforcer | 7 | Kettle 3 | two Kettles, then it is a maul job again — correct, the Watch does not run on flux |
| Conduit | 22 (+8 with Licensed Draw) | Flare 9 | one Flare, or two Grounds, or four Arcs |
| Chemist | 14 | Field Transfusion 6 | one big heal or four small ones |
| Machinist | 18 (+4 with Bench Eye) | Sentry Frame 12 | one frame and a drone, or a frame and a Crossfeed |
| Saboteur | 12 | Bring the House **7** | one, and a Shaped Charge after it; Rig Machinery costs 0 on purpose |
| Railrunner | 10 | Running Coupling 6 | the rest of the kit is 0–2, so mobility never runs dry |
| Augmented | 14 (+4 with Graft Tolerance) | Press Frame 8 | Siphon *refills* — the intended loop is steal, then spend |

Standing costs follow an FFT-shaped curve: bread-and-butter 100–250,
mid-tier 300–550, signature 700–950, capstone 1000–1100.

## 4. Per-job kits

### Enforcer — hold the line
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Pin | action | 100 / 0 | weapon 80, Stunned **35%** |
| Shield Advance | action | 150 / 0 | line 2, weapon 60 + shove 1 along facing |
| Breach Posture | action | 300 / 2 | self, Braced (evade +18, move −1) |
| Kettle | action | 450 / 3 | radius 2, Kettled 80% — a zone root, not a stun, and instant |
| Baton Answer | reaction (damaged) | 500 | weapon 30 counter |
| Hold the Line | reaction (allyDowned) | 600 | self Braced + Resolve +4 |
| Riot Drill | support | 400 | hp +2, evade +1 |
| Press Through | movement | 500 | moveThroughEnemies, move +1 |

### Conduit — the map is the spellbook
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Arc | action | 150 / 5 | line 3, mag 21 arc (Attunement-scaled both ends) |
| Tap Line | action | 200 / 0, requires `adjacentPoweredObject` | ally/self charge +10 — the answer to "where does the power come from" |
| Throw the Breaker | action | 250 / 1 | object setPower toggle, range 5 |
| Overload Cell | action | 250 / 5, **instant**, requires `targetPowered` | object mag 20 |
| Ground | action | 550 / 5, cast 60 | Grounded 80% + charge −10 siphoned to the caster + setPower off |
| Flare | action | 950 / 9, cast 20 | radius 2, mag 14 arc + Flux Burn 60% + object mag 8 |
| Licensed Draw | support | 450 | charge +8 |
| Earth Strap | movement | 350 | ignoresHazardTiles, move +1 |

Ground is the one ability that hits a machine, an Augmented, and a Conduit's
own reserve with the same verb — bible §6's "Conduits can *Ground* them",
mechanized as `applyStatus` + `modifyCharge{siphonToActor}` + `setPower`.

Overload Cell lost its 25-speed cast in the content follow-up
(`BALANCE_REPORT` §7.8, G11). A cast on an object-only ability buys nothing —
an object does not walk out of the blast the way a unit does — so the cast was
pure price, and at 5 flux on top of it the ability could not clear its own cost
against an unmanned machine. It is now what the fiction always said it was: a
shove past the rated draw, done in the time it takes to do it. The `targetPowered`
requirement is what keeps it honest — it only answers a machine somebody is
still running.

### Chemist — the portable lab
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Coagulant Jet | action | 200 / 3 | heal mag 6, **not** Attunement-scaled |
| Cinder Oil | action | 350 / 4, cast 40 | radius 1, thermal mag 7 unscaled + Scalded 75% |
| Triage | action | 450 / 4 | clears Scalded/Fouled/Smoked/Seized + heal mag 3 |
| Bracer Shot | action | 450 / 3 | modifyStats phys/mag/evade +5 for 3 turns |
| Numbing Fog | action | 550 / 5, cast 30 | radius 2, Fouled 80% (CT ×60%) |
| Field Transfusion | action | 900 / 6, cast 35 | heal mag 14 + clears Flux Burn and Grounded |
| Bench Grade | support | 500 | consumableEffectBonusPercent 50 + consumableRangeBonus 2 — the job identity |
| Reflex Dose | reaction (hpCritical) | 600 | self heal mag 6 + clears Scalded |

**Every Chemist heal and compound is `attunementScaled: false`.** Bible §5.4:
chemistry does the work, flux only drives it. Mechanically this makes the
Chemist the reliable healer (a coagulant works on a low-Attunement Enforcer
exactly as well as on a Conduit) and keeps the Attunement double-scaling as a
Conduit-only signature.

### Machinist — the only job that adds to the map
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Tripwire Charge | action | 250 / 4 | mine, hp 8, `onContact` fixed 20 kinetic + Stunned 45%, destroys itself |
| Field Repair | action | 200 / 3 | repairObject fixed 20 — machines only, per bible |
| Skitter Drone | action | 400 / 6 | drone, hp 12, `attack` mag 5 unscaled, range 1–2, speed 5, no LoS needed |
| Sentry Frame | action | 500 / 12 | turret, hp 24, `attack` mag 9 unscaled, range 1–4 vertical 2, speed 6 |
| Crossfeed | action | 700 / 4, range **1–2** | **ally only**: Overclocked + charge +10 |
| Feedback Shunt | reaction (damaged) | 550 | arc fixed 12 + Seized 25% |
| Bench Eye | support | 400 | mag +3, charge +4 |
| Gantry Step | movement | 450 | ignoresHazardTiles, jump +2 |

Crossfeed's `range.min` is 1 because "ally" includes the caster
(`BALANCE_REPORT` §7.8, G10). At min 0 it was Overclocked on yourself for 4
flux — strictly better than the Augmented's own Overdrive at 7 flux and 5 HP,
and 41% of everything a Machinist did on an authored map. A jumper needs two
rigs; it cannot be run off the cells it is drawing from.

See §7.1 — deployables are currently inert obstacles, which is the single
biggest gap between this kit and its bible fantasy.

### Saboteur — the map is the target
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Smoke Canister | action | 300 / 1 | radius 2, Smoked 85% |
| Rig Machinery | action | 350 / **0** | adjacent object: setPower off + phys 12 |
| Shaped Charge | action | 400 / 3, cast 35 | radius 1, phys 7 to units + phys 8 to objects |
| Gas Line Tap | action | 500 / 4 | line 3 at range 2, thermal phys 4 + Scalded 70% + object phys 5, instant |
| Bring It Down | action | 750 / 3 | object phys 28 — a structure killer, instant |
| Bring the House | action | 1100 / **7**, cast 15 | radius 3, phys 8 + shove 2 + object phys 14 |
| Light Hands | support | 500 | evade +6, speed +1 |
| Catwalk Sense | movement | 400 | ignoresHazardTiles, jump +1, move +1 |

**Saboteur damage is all `base: "phys"`, never `mag`.** Explosives are not
attunement — a charge does the same thing to a licensed Conduit and to a
brick wall. This also keeps the job useful on maps with no flux at all, where
the Conduit is (correctly) weak.

Rig Machinery costs 0 charge on purpose: it is a wrench, not a license, and
it gives the Saboteur an answer to a powered map that does not compete with
the Conduit's.

Bring the House came down 9 → 7 flux in the content follow-up
(`BALANCE_REPORT` §7.8, G12). At 9 of a level-3 Saboteur's 20 it was the
kit's least affordable ability and Shaped Charge did all of its work; at 6 it
becomes the default and Shaped Charge dies instead. Seven is the price at
which both are real: the sequence is still most of a battle's flux, and there
is a Shaped Charge left after it.

### Railrunner — terrain-conditional excellence
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Switch Kick | action | 200 / 0 | weapon 70 + push 2 |
| Signal Jump | action | 300 / 0, requires `railUnderfoot` | `moveSelf` forward 3 + Sprung (move +2, jump +1) |
| Undercut | action | 350 / 2 | weapon 68 + Fouled 30% |
| Coupling Hook | action | 400 / 1 | range 2–5, weapon 75 + **pull 3** + Stunned 25% |
| Running Coupling | action | 900 / 6, cast 50, requires `railUnderfoot` | line 4, weapon 130 + pull 2 + Stunned 35% |
| Shoulder Off | reaction (targetedByAction) | 550 | push 1 + Fouled 30% |
| Yard Legs | support | 600 | speed +1, evade +3 |
| Rail Dash | movement | 500 | railMoveMultiplier 3 |

The Railrunner has the lowest damage per hit of any melee job by design. Its
output is positional: Coupling Hook drags a target off a ledge or onto a
hazard, Running Coupling drags a whole line of them, and Rail Dash turns a
rail map's Move 5 into an effective 15 along the track (COMBAT_RULES §10).

### Augmented — every strength on credit
| Ability | Slot | Standing / Charge / HP | Effect |
|---|---|---|---|
| Piston Lunge | action | 350 / 2 / **3 hp** | range 1–4, **vertical 3**, `moveSelf` toward-target 2 + weapon 110 |
| Siphon | action | 400 / 0 | adjacent: charge −8 siphoned to the caster + arc phys 3 |
| Overdrive | action | 800 / 7 / **5 hp** | Overclocked + **Attunement +6, Resolve −6, permanently** |
| Rejection | action | 700 / 0 | radius **2** on self: chemical 15% max-HP to everything including the caster + Scalded 70% |
| Press Frame | action | 1000 / 8 / **6 hp** | radius 1, weapon 140 + push 2 + Stunned 40% |
| Pain Gate | reaction (hpCritical) | 650 | self Overclocked + Resolve −4 |
| Graft Tolerance | support | 500 | hp +10, charge +4 |
| Hydraulic Stride | movement | 450 | jump +3, move +1 |

Overdrive and Pain Gate are the only abilities in the slice that permanently
move a disposition. They implement bible §7 literally: the Augmented trades
Resolve for Attunement as grafts accumulate, which makes their own reactions
less reliable and every Conduit on the field more dangerous to them. That is
the intended trap.

## 5. Items

| Class | Count | Notes |
|---|---|---|
| Weapons | 14 | two tiers per job, power 5–13 |
| Body / head armor | 8 | light and heavy, two tiers each |
| Shields | 2 | `shield` tag = Enforcer only |
| Accessories | 4 | tagged `accessory`, universal |
| Consumables | 7 | tagged `field-issue`, universal, Chemist register |

Weapon power is deliberately kept in a **narrow 5–13 band**, and tier-2
weapons only gain +2 to +3 power over tier 1. See §6.

Consumables mirror the Chemist's kit one rung down (Coagulant Vial to
Coagulant Jet, Cinder Flask to Cinder Oil, Numbing Salts to Triage) so the
`consumableEffectBonusPercent` support has something to be a bonus *on*, and
so a party without a Chemist is inconvenienced rather than crippled.

All seven now carry a `targeting` block and are usable in battle: the five
compounds are hand-applied at reach 0–1 on self or an ally, the two flasks are
thrown 1–3 with line of sight at an enemy. The `field-issue` tag is what makes
them universal — see `docs/ITEMS.md` for the design record and the table.

## 6. Balance assumptions

**Weapon damage** is `floor(phys × weaponPower × power / D(L))` with basic
attack at power 100 and `D(1) = 400` (COMBAT_RULES §4). Level-1 basic attacks
and the hits needed to down a peer:

| Attacker (L1, tier-1 weapon) | Basic hit | vs Enforcer 61 hp | vs Conduit 39 hp |
|---|---|---|---|
| Augmented (Graft Fist) | 27 | 3 | 2 |
| Enforcer (Shock Maul) | 20 | 4 | 2 |
| Saboteur (Pry Bar) | 14 | 5 | 3 |
| Railrunner (Hook Bar) | 13 | 5 | 3 |
| Machinist (Bench Spanner) | 11 | 6 | 4 |
| Chemist (Dosing Gun) | 8 | 8 | 5 |
| Conduit (Tap Rod) | 2 | 31 | 20 |

That is the target band at level 1: 3–5 hits between the fighting jobs, and
support jobs that genuinely cannot fight with a weapon (their damage is
abilities, and the Conduit's Arc against a high-Attunement target does more
than four maul swings would).

**The scaling problem this section used to flag is fixed in `src/core`.**
`STAT_BASE.hp` is 40 and `STAT_BASE.phys` is 0, so HP grew sub-linearly while
Phys grew linearly and time-to-kill collapsed — 7.45 swings to down at level 1
and 2.63 at level 5, with 16 of 49 pairings one-shotting. The engine pass
level-scaled the damage divisor, `D(L) = 400 + 250(L−1)`, which holds the mean
between 6.5 and 8.4 swings across levels 1–5 with **zero one-shot pairings at
any level** (`docs/BALANCE_REPORT.md` §4(b), re-measured post-rebalance in §6).
`D(1) = 400`, so every level-1 number in this document is the number it always
was.

| Level | Enforcer basic hit | Enforcer HP | Hits to down |
|---|---|---|---|
| 1 | 20 | 61 | 4 |
| 3 | 27 | 87 | 4 |
| 5 | 29 | 114 | 4 |

Armor is a smaller share of a unit's HP than it was: the rebalance pass cut
heavy armour hard (Riot Plate 12 → 5 hp and −4 evade / −1 speed, Watch Cuirass
20 → 14) because heavy armour is Enforcer-and-Augmented-only and those two
jobs were the sweep's over-performers. Weapon power is still deliberately kept
in a narrow 5–13 band with tier-2 gaining only +2/+3.

**Status durations** are 1–3 turns of the *afflicted unit's own* turns
(COMBAT_RULES §8). Stunned stays at 1 turn — it costs exactly one turn and
nothing longer is authored, because at 60 CT for a skipped turn a 2-turn stun
is close to a kill. Kettled (root, 2 turns) exists precisely so the Enforcer
has crowd control that is not a stun.

**Cast speeds** are set so charging matters: `castSpeed 15` (Bring the House)
lands seven ticks out, `25–40` for mid-tier. Everything that deals damage in a
radius of 2 or more is charged — Smoke Canister is the one instant at that
size and it deals none. The only instants costing more than 6 charge are the
Machinist's deployables, which already cost a full turn of setup and put
nothing on the board that acts.

**An ability that can only be aimed at an object should not carry a cast.**
A charge is priced against the chance the target walks out of it, and a
machine does not walk; the delay is a cost with nothing on the other side of
it. Overload Cell is the one that was authored the wrong way and it is fixed
(`BALANCE_REPORT` §7.8, G11). Bring It Down and Rig Machinery were always
instant, and Ground and Flare keep their casts because both can be aimed at a
unit.

**Application chances** run 50–85%, with 100% only on self-buffs. Resolve and
Attunement do not modify them (COMBAT_RULES §8), so these are raw numbers,
not expected values.

## 7. What the effect vocabulary could not express

Reported, not worked around. Nothing below was faked with a wrong mechanic.

> **Closed, and now used by the content (rebalance pass, 2026-08-15).** Gaps
> **1**, **2**, and **7** were closed by the engine-amendment pass; this pass
> wired all three into the kits.
>
> - **Deployables act.** `tripwire-charge` carries an `onContact` payload
>   (fixed 20 kinetic + Stunned 45%, destroys itself). `sentry-frame` and
>   `skitter-drone` carry `attack` profiles. All three are now chosen by the
>   search; the Machinist went 30% → 45% of its duels on the strength of them.
>   Two authoring rules the schema does not enforce but the engine implies:
>   an `onContact` payload runs **with no caster**, so its amounts must be
>   `fixed` or `maxHpPercent` (a `phys` base resolves to 0); an `attack`
>   payload resolves against the deploying unit, so `mag`/`phys`/`weapon` all
>   work there. Both turret amounts are `attunementScaled: false` for the same
>   reason the Chemist's compounds are — a frame is a machine, and it shoots a
>   licensed Conduit and a brick wall the same.
> - **`moveSelf`.** `piston-lunge` opens with `moveSelf toward-target 2` and
>   reaches to range 4: the arm goes where the shoulder cannot, and the body
>   follows it. `signal-jump` is `moveSelf forward 3` plus Sprung.
> - **`requires`.** Three abilities are gated, each a separate judgment:
>   `running-coupling` takes `railUnderfoot` (it is literally coupling to
>   running freight — the Railrunner's signature is now a rail-map signature,
>   and losing it on a bare arena is most of why the job came down from 77%);
>   `signal-jump` takes `railUnderfoot` (a signal is trackside furniture, and
>   the gate is also what stops a 0-flux self-buff being recast on every tile
>   of every map — see the AI note below); `tap-line` keeps
>   `adjacentPoweredObject` from the engine pass. **Not gated, deliberately:**
>   `coupling-hook` (a hook is a hook — and gating the one Railrunner ability
>   this pass was trying to revive would have killed it), `rig-machinery` and
>   `throw-the-breaker` (`targetPowered` on either makes a *strictly worse*
>   ability, since `setPower off` on an unpowered object is already a no-op and
>   the integrity damage is still worth having). **`overload-cell` now takes
>   `targetPowered`** — the G8 mirror that blocked it was re-synced, see §9. A
>   dead cell has no charge to force past its rated draw, so the gate reads as
>   the ability's own fiction rather than a tax on it.
>
> Gap **4** (consumables) is deferred with a design sketch in
> `docs/PROJECT_BREAKDOWN.md`. Gaps 3, 5, 6, 8, 9, 10 are open.

1. ~~**Deployables are inert.**~~ **Closed and used.** `spawnObject` takes only `object` and `hp`, and
   `spawnObject()` in `src/core/rules/effects.ts` builds them with
   `operable: null`, `onDestroyed: null`, `powered: null` and no behaviour.
   A Sentry Frame does not shoot, a Tripwire Charge does not detonate when
   stepped on, a Skitter Drone does nothing. They are HP-bearing obstacles
   (turret and drone block movement, mine does not). The Machinist's entire
   bible fantasy — "weak alone, oppressive with setup time" — needs either an
   AI hook that makes `turret`/`drone` objects act on the clock, or an
   authorable `onDestroyed` / `operable` payload on the spawn effect. **This
   is the largest gap in the slice.**
2. ~~**No self-movement effect.**~~ **Closed and used.** `forceMove` moves units in the target *area*
   relative to the caster; there is no way to move the caster. Piston Lunge,
   Signal Jump and Rail Dash all want to reposition the user. Expressed
   instead through range/vertical (Piston Lunge reaches 3 heights up) and
   through move/jump statuses (Sprung), which is a weaker reading of the same
   fantasy. A `forceMove` variant targeting the actor would fix all three.
3. **No accuracy stat.** Hit chance is `100 − facing-adjusted evade` and
   nothing else (COMBAT_RULES §5), so a blind or dazzle cannot reduce an
   attacker's accuracy. `Smoked` is therefore modelled as phys/mag/evade loss
   — "swings worse and dodges worse" — which reads acceptably but makes the
   target *easier* to hit, the opposite of the intent.
4. ~~**`consumableEffectBonusPercent` is unread by the engine.**~~ **Closed and
   used.** A `useItem` command spends the acting unit's action and one entry
   from a per-team shared satchel that enters at `createBattle` and folds back
   through `applyBattleResults`; the seven consumables now author a `targeting`
   block, and Bench Grade reads as +50% to every damage and heal power plus a
   new `consumableRangeBonus: 2` for the throw. There is deliberately no
   per-unit carry slot — the chapter's stock *is* the pool. `docs/ITEMS.md`,
   `COMBAT_RULES` §19, `PROGRESSION` §4.
5. **Statuses cannot carry a delayed or on-expiry cost.** Overclocked should
   hurt when it ends — bible §6 says every Augmented strength has a
   body-horror price. Expressed instead as up-front `hpCost` on the ability
   plus a permanent `modifyDisposition`, which is a fair trade but front-loads
   a cost the fiction wants at the back.
6. **`statMods` and `modifyStats` are flat integers only.** No percentage
   form, so a buff cannot scale with level. Bracer Shot's flat +4 phys is
   significant at level 1 and irrelevant by level 5.
7. ~~**No conditional gating on abilities**~~ **Closed and used.** Nothing could
   require a shield equipped, a rail tile underfoot, or an adjacent powered
   object. Bible §5.2's "a Conduit on a dead map with no cells is nearly
   powerless" is therefore *flavour only* — Tap Line restores charge whether
   or not there is a line within a mile. This is the second-largest gap: it is
   the mechanic that would make the infrastructure pillar binding rather than
   thematic.
8. **Reaction triggers cannot express "an ally in range was targeted"** (only
   `allyDowned`), so an Enforcer bodyguard/interpose reaction is out of reach.
9. **Deployables have no lifetime.** A spawned turret or mine persists for the
   whole battle; there is no expiry field, so Machinist board presence only
   ever accumulates.
10. **`hpCost` on a charged ability is spent at cast start** (COMBAT_RULES §7)
    and is lost if the caster is downed before the charge lands. Press Frame
    is authored knowing this; it is a real risk on the ability, not a bug.

## 8. Roster

Party (seven units, one per job, so every pillar is playable):

| Unit | Job | Lv | Resolve / Attunement | Note |
|---|---|---|---|---|
| Rowen Corvane | Enforcer | 1 | 72 / 38 | Unchanged shape; equipment left weapon-only so the level-1 line in COMBAT_RULES §2 still reads true off this file. Reaction slot: Baton Answer. **Frozen — see §9.** |
| Vale Tarn | Conduit | 1 | 50 / 70 | Equipment carries no mag mods, so the Mag 10 / Attunement 70 worked example in COMBAT_RULES §4 stays literally correct. Gained Ground. **No movement passive, deliberately** — slotting Earth Strap's Move +1 on her raised the AI's search cost 65% (`docs/BALANCE_REPORT.md` §6.7 G9). |
| Jory Slate | Chemist | 1 | 64 / 44 | Foundry hand; bench work is the trades' entry job. Gained Bracer Shot and Reflex Dose. |
| Ivo Brace | Machinist | 2 | 48 / 50 | Secondary Chemist, matching the job tree. Trades Skitter Drone for Sentry Frame and gains Bench Eye and a dust hood — two deployables is what his flux affords, and the frame is the better showcase. |
| Della Tine | Railrunner | 2 | 58 / 35 | Rail Dash slotted. Gained Undercut, Yard Legs, a dust hood. |
| Marek Sump | Saboteur | 2 | 44 / 30 | Lowest Resolve in the party — nerve for wiring, not for standing. Gained Gas Line Tap and Light Hands. |
| Orin Vane | Augmented | 2 | 66 / **78** | Highest Attunement in the game: power and vulnerability in one number. Gained Press Frame and Hydraulic Stride. |
| Maren Voss | Railrunner | 1 | 78 / 24 | **Non-combatant.** Combine line steward at the yard; placed `neutral` in e1 so the opening line comes out of a body instead of the air. No learned abilities. |
| Prelate-Assayer Quill | Conduit | 2 | 60 / 66 | **Non-combatant.** Placed `neutral` in e4 and e5. The Assay does not take a side; it measures and files. No learned abilities. |

The six non-frozen party units each gained a signature ability and, where the
search could afford it, a passive slot. That is not power creep for its own sake: the enemy templates in
e2–e5 already carried support and movement passives and the party did not, and
the chapter's own Standing (measured at ~210 across five battles, see
`docs/PROGRESSION.md` §2) buys about that much. The encounter sweep is run
against these authored kits, so the numbers in `docs/BALANCE_REPORT.md` §6 are
a floor that a player who spends Standing beats.

Enemy templates for the encounter workstream to instantiate: `watch-enforcer`,
`watch-sergeant`, `watch-conduit`, `provocateur`, `provocateur-torch`,
`combine-hand`, `combine-runner`, `shop-machinist`.

**The provocateur carries a Shock Maul and no armor.** Watch-issue weapon,
foundry clothes — that is the tell the chapter turns on, and it is authored
into the data rather than only into dialogue.

## 9. Downstream work this creates

- ~~**`src/ui/mock.ts` freezes seven content files, and that blocked real
  balance work.**~~ **Both diffs applied, 2026-08-15.** `realContent` still
  mirrors `jobs/enforcer`, `jobs/conduit`, `abilities/pin`,
  `abilities/overload-cell`, `items/shock-maul`, `statuses/stunned`, and
  `units/rowen`, and `tests/ui/mock.test.ts` still asserts equality with the
  authored JSON — the mirror is a **re-sync cost on every edit**, not a freeze.
  The two parked changes and the measurements that argued for them, kept as
  history:

  | file | change (applied) | measured effect (as argued) |
  |---|---|---|
  | `data/abilities/pin.json` | Stunned `chance` 60 → 35 | Enforcer duel win rate **68% → 53%** in a 392-duel A/B; the single largest lever in the game and the reason the Enforcer still sits at the top of the band |
  | `data/abilities/overload-cell.json` | `chargeCost` 8 → 5, `damageObject` power 16 → 20, `requires: ["targetPowered"]` | the Conduit's anti-machine strike was 8 flux of a 22 pool for one object; it is chosen once in 1,764 unit-battles |

  **What re-measured, and what did not.** A bounded 112-duel re-check
  (enforcer mirror plus enforcer-versus-each-job, both orientations, arena and
  Marshaling Yard, levels 1 and 3, two seeds) moves the Enforcer **49.1% →
  46.4%** — the right direction, a much smaller step than the parked 68 → 53.
  Broken out, essentially all of it is at level 1 (37.5% → 29.2% against other
  jobs); level 3 is flat (60.4% → 62.5%) and level 5 barely moves
  (87.5% → 85.4%). That agrees with `docs/BALANCE_REPORT.md` §6.6's other
  finding: above level 1 the Enforcer's lead is its frozen `hp` curve, not
  `pin`. The 392-duel figure has not been re-run at full scale. Five seeds on
  `e2-foundry-floor-nine` still read **80% party win**, unchanged and inside
  the 40–80% band.

  Downstream numbers that moved with these two edits: the Overload Cell worked
  example in `COMBAT_RULES` §4 (56 → **70** integrity), the `mock.ts` forecast
  mock's rendered "Stunned 60%" (→ **35%**), and Vale's flux after a cast
  (22 − 8 = 14 → 22 − 5 = **17**).
- ~~`src/app/content.ts` still hand-lists content files and carries the
  `VALE_PLACEHOLDER`.~~ **Done by the progression pass.** `src/app/content.ts`
  glob-imports every directory under `data/` (`import.meta.glob`, eager, one
  `parseDir` per `ContentKind` including `units` and `campaigns`) and validates
  each file against its zod schema at startup; there is no `VALE_PLACEHOLDER`
  anywhere in the tree and `data/units/vale.json` is loaded like any other
  roster unit.
