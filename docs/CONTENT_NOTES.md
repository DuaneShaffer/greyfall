# Content Notes — the Foundry Chapter slice

What is in `data/jobs`, `data/abilities`, `data/items`, `data/statuses`, and
`data/units`, why the numbers are what they are, and where the effect
vocabulary could not say what the creative bible asked for.

Governing docs: `docs/CREATIVE_BIBLE.md` (§5 rules of magic, §6 job fantasies,
§9 naming) and `docs/COMBAT_RULES.md` (every formula quoted below).

Counts: **7 jobs · 56 abilities · 11 statuses · 35 items · 15 units**.

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
| Chemist | 8 ×100 | 6 ×100 | 4 ×100 | 5 ×90 | 6 ×105 | 3/2/6 |
| Machinist | 8 ×95 | 7 ×115 | 4 ×95 | 5 ×90 | 5 ×95 | 3/2/6 |
| Saboteur | 8 ×90 | 4 ×90 | 4 ×105 | 7 ×105 | 3 ×80 | 4/2/10 |
| Railrunner | 8 ×95 | 4 ×85 | 5 ×115 | 6 ×100 | 3 ×80 | 5/3/14 |
| Augmented | 10 ×110 | 6 ×105 | 3 ×100 | 10 ×115 | 4 ×85 | 3/4/4 |

**Enforcer and Conduit were not touched.** Their curves and flats are asserted
verbatim by `tests/core/stats.test.ts` and quoted as worked examples in
COMBAT_RULES §2 and §4. Only their ability lists and equip tags changed. The
other five were fitted around those two fixed points.

Resulting level-1 lines (no equipment):

| Job | hp | charge | speed | phys | mag |
|---|---|---|---|---|---|
| Enforcer | 61 | 7 | 6 | 9 | 1 |
| Conduit | 39 | 22 | 6 | 2 | 10 |
| Chemist | 48 | 14 | 6 | 4 | 6 |
| Machinist | 45 | 17 | 5 | 4 | 4 |
| Saboteur | 43 | 10 | 6 | 7 | 2 |
| Railrunner | 45 | 10 | **8** | 6 | 2 |
| Augmented | 55 | 14 | 5 | **11** | 3 |

Personality read: the Enforcer is the HP wall, the Augmented the damage
outlier that pays in HP and Evade, the Railrunner buys a third more turns than
anyone else (Speed 8 vs 6) with the thinnest damage, the Conduit and Machinist
hold the two big charge pools, and the Chemist is deliberately the flat
average against which the others read as extreme.

## 3. Charge economies

`chargeCost` was set against each job's own pool, not a global scale, so
"expensive" means the same thing in every kit:

| Job | L1 pool | Signature | Uses per battle at L1 |
|---|---|---|---|
| Enforcer | 7 | Kettle 4 | one Kettle, then it is a maul job again — correct, the Watch does not run on flux |
| Conduit | 22 (+8 with Licensed Draw) | Flare 12 | one Flare, or two Grounds, or five Arcs |
| Chemist | 14 | Field Transfusion 8 | one big heal or three small ones |
| Machinist | 17 (+4 with Bench Eye) | Sentry Frame 8 | two deploys, or one deploy and a Crossfeed |
| Saboteur | 10 | Bring the House 9 | exactly one; Rig Machinery costs 0 on purpose |
| Railrunner | 10 | Running Coupling 6 | the rest of the kit is 0–2, so mobility never runs dry |
| Augmented | 14 (+4 with Graft Tolerance) | Press Frame 8 | Siphon *refills* — the intended loop is steal, then spend |

Standing costs follow an FFT-shaped curve: bread-and-butter 100–250,
mid-tier 300–550, signature 700–950, capstone 1000–1100.

## 4. Per-job kits

### Enforcer — hold the line
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Pin | action | 100 / 0 | weapon 80, Stunned 60% *(pre-existing)* |
| Shield Advance | action | 150 / 0 | line 2, weapon 60 + shove 1 along facing |
| Breach Posture | action | 300 / 2 | self, Braced (evade +18, move −1) |
| Kettle | action | 450 / 4, cast 40 | radius 2, Kettled 70% — a zone root, not a stun |
| Baton Answer | reaction (damaged) | 500 | weapon 50 counter |
| Hold the Line | reaction (allyDowned) | 600 | self Braced + Resolve +4 |
| Riot Drill | support | 400 | hp +10, evade +4 |
| Press Through | movement | 500 | moveThroughEnemies, move +1 |

### Conduit — the map is the spellbook
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Arc | action | 150 / 4 | line 3, mag 8 arc (Attunement-scaled both ends) |
| Tap Line | action | 200 / 0 | ally/self charge +10 — the answer to "where does the power come from" |
| Throw the Breaker | action | 250 / 3 | object setPower toggle |
| Overload Cell | action | 250 / 8, cast 25 | object mag 16 *(pre-existing)* |
| Ground | action | 550 / 6, cast 60 | Grounded 80% + charge −10 siphoned to the caster + setPower off |
| Flare | action | 950 / 12, cast 20 | radius 2, mag 14 arc + Flux Burn 60% + object mag 8 |
| Licensed Draw | support | 450 | charge +8 |
| Earth Strap | movement | 350 | ignoresHazardTiles, move +1 |

Ground is the one ability that hits a machine, an Augmented, and a Conduit's
own reserve with the same verb — bible §6's "Conduits can *Ground* them",
mechanized as `applyStatus` + `modifyCharge{siphonToActor}` + `setPower`.

### Chemist — the portable lab
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Coagulant Jet | action | 200 / 3 | heal mag 6, **not** Attunement-scaled |
| Cinder Oil | action | 350 / 4, cast 40 | radius 1, thermal mag 5 unscaled + Scalded 75% |
| Triage | action | 450 / 4 | clears Scalded/Fouled/Smoked/Seized + heal mag 3 |
| Bracer Shot | action | 450 / 3 | modifyStats phys/mag/evade +4 for 3 turns |
| Numbing Fog | action | 550 / 5, cast 30 | radius 2, Fouled 80% (CT ×60%) |
| Field Transfusion | action | 900 / 8, cast 25 | heal mag 12 + clears Flux Burn and Grounded |
| Bench Grade | support | 500 | consumableEffectBonusPercent 50 — the job identity |
| Reflex Dose | reaction (hpCritical) | 600 | self heal mag 6 + clears Scalded |

**Every Chemist heal and compound is `attunementScaled: false`.** Bible §5.4:
chemistry does the work, flux only drives it. Mechanically this makes the
Chemist the reliable healer (a coagulant works on a low-Attunement Enforcer
exactly as well as on a Conduit) and keeps the Attunement double-scaling as a
Conduit-only signature.

### Machinist — the only job that adds to the map
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Tripwire Charge | action | 250 / 4 | spawnObject mine, hp 8 |
| Field Repair | action | 200 / 3 | repairObject fixed 20 — machines only, per bible |
| Skitter Drone | action | 400 / 6 | spawnObject drone, hp 12 (blocks movement) |
| Sentry Frame | action | 500 / 8 | spawnObject turret, hp 24 (blocks movement) |
| Crossfeed | action | 700 / 7 | ally/self Overclocked |
| Feedback Shunt | reaction (damaged) | 550 | arc fixed 12 + Seized 25% |
| Bench Eye | support | 400 | mag +3, charge +4 |
| Gantry Step | movement | 450 | ignoresHazardTiles, jump +2 |

See §7.1 — deployables are currently inert obstacles, which is the single
biggest gap between this kit and its bible fantasy.

### Saboteur — the map is the target
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Smoke Canister | action | 300 / 2 | radius 2, Smoked 85% |
| Rig Machinery | action | 350 / **0** | adjacent object: setPower off + phys 4 |
| Shaped Charge | action | 400 / 3, cast 35 | radius 1, phys 5 to units + phys 8 to objects |
| Gas Line Tap | action | 500 / 4, cast 30 | line 3, thermal phys 4 + Scalded 70% + object phys 5 |
| Bring It Down | action | 750 / 6, cast 25 | object phys 18 — a structure killer |
| Bring the House | action | 1100 / 9, cast 15 | radius 3, phys 8 + shove 2 + object phys 14 |
| Light Hands | support | 500 | evade +6, speed +1 |
| Catwalk Sense | movement | 400 | ignoresHazardTiles, jump +1, move +1 |

**Saboteur damage is all `base: "phys"`, never `mag`.** Explosives are not
attunement — a charge does the same thing to a licensed Conduit and to a
brick wall. This also keeps the job useful on maps with no flux at all, where
the Conduit is (correctly) weak.

Rig Machinery costs 0 charge on purpose: it is a wrench, not a license, and
it gives the Saboteur an answer to a powered map that does not compete with
the Conduit's.

### Railrunner — terrain-conditional excellence
| Ability | Slot | Standing / Charge | Effect |
|---|---|---|---|
| Switch Kick | action | 200 / 0 | weapon 70 + push 2 |
| Signal Jump | action | 300 / 2 | self Sprung (move +2, jump +1) |
| Undercut | action | 350 / 2 | weapon 90 + Fouled 55% |
| Coupling Hook | action | 400 / 2 | range 2–5, weapon 60 + **pull 3** |
| Running Coupling | action | 900 / 6, cast 50 | line 4, weapon 130 + pull 2 + Stunned 35% |
| Shoulder Off | reaction (targetedByAction) | 550 | push 1 + Fouled 30% |
| Yard Legs | support | 600 | speed +1, evade +6 |
| Rail Dash | movement | 500 | railMoveMultiplier 3 |

The Railrunner has the lowest damage per hit of any melee job by design. Its
output is positional: Coupling Hook drags a target off a ledge or onto a
hazard, Running Coupling drags a whole line of them, and Rail Dash turns a
rail map's Move 5 into an effective 15 along the track (COMBAT_RULES §10).

### Augmented — every strength on credit
| Ability | Slot | Standing / Charge / HP | Effect |
|---|---|---|---|
| Piston Lunge | action | 350 / 2 / **4 hp** | range 1–3, **vertical 3**, weapon 110 |
| Siphon | action | 400 / 0 | adjacent: charge −8 siphoned to the caster + arc phys 3 |
| Overdrive | action | 800 / 6 / **8 hp** | Overclocked + **Attunement +6, Resolve −6, permanently** |
| Rejection | action | 700 / 0 / **10 hp** | radius 1 on self: chemical 12% max-HP to everything including the caster + Scalded 50% |
| Press Frame | action | 1000 / 8 / **6 hp** | radius 1, weapon 140 + push 2 + Stunned 40% |
| Pain Gate | reaction (hpCritical) | 650 | self Overclocked + Resolve −4 |
| Graft Tolerance | support | 500 | hp +14, charge +4 |
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

## 6. Balance assumptions

**Weapon damage** is `floor(phys × weaponPower × power / 400)` with basic
attack at power 100 (COMBAT_RULES §4). Level-1 basic attacks and the hits
needed to down a peer:

| Attacker (L1, tier-1 weapon) | Basic hit | vs Enforcer 61 hp | vs Conduit 39 hp |
|---|---|---|---|
| Augmented (Graft Fist) | 27 | 3 | 2 |
| Enforcer (Shock Maul) | 20 | 4 | 2 |
| Saboteur (Pry Bar) | 14 | 5 | 3 |
| Railrunner (Hook Bar) | 13 | 5 | 3 |
| Machinist (Bench Spanner) | 9 | 7 | 5 |
| Chemist (Dosing Gun) | 6 | 11 | 7 |
| Conduit (Tap Rod) | 2 | 31 | 20 |

That is the target band at level 1: 3–5 hits between the fighting jobs, and
support jobs that genuinely cannot fight with a weapon (their damage is
abilities, and the Conduit's Arc against a high-Attunement target does more
than four maul swings would).

**Known scaling problem, flagged rather than papered over.** Because
`STAT_BASE.hp` is 40 and `STAT_BASE.phys` is 0, HP grows sub-linearly with
level while Phys grows linearly, so time-to-kill collapses:

| Level | Enforcer basic hit | Enforcer HP | Hits to down |
|---|---|---|---|
| 1 | 20 | 61 | 4 |
| 3 | 60 | 87 | 2 |
| 5 | 138 | 114 | 1 |

At level 5 every melee job one-shots every other job. **No content-side lever
fixes this**: armor HP mods large enough to matter at level 5 would double a
level-1 unit's health, and the two curves that set the pace (Enforcer's
phys 8 ×115) are frozen by `tests/core/stats.test.ts`. The fix belongs in
`src/core`: either scale `WEAPON_DAMAGE_DIVISOR` with level, raise
`STAT_BASE.hp` substantially, or give `phys` a non-zero base so its growth is
proportionally slower. Recorded here for the balance pass.

Mitigations actually applied: weapon power kept in a narrow band, tier-2
weapons gaining only +2/+3, and armor carrying real HP (heavy tier 2 is
+20 hp). The slice's five battles are expected to run levels 1–3, where the
numbers are 2–4 hits and playable.

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

**Application chances** run 50–85%, with 100% only on self-buffs. Resolve and
Attunement do not modify them (COMBAT_RULES §8), so these are raw numbers,
not expected values.

## 7. What the effect vocabulary could not express

Reported, not worked around. Nothing below was faked with a wrong mechanic.

1. **Deployables are inert.** `spawnObject` takes only `object` and `hp`, and
   `spawnObject()` in `src/core/rules/effects.ts` builds them with
   `operable: null`, `onDestroyed: null`, `powered: null` and no behaviour.
   A Sentry Frame does not shoot, a Tripwire Charge does not detonate when
   stepped on, a Skitter Drone does nothing. They are HP-bearing obstacles
   (turret and drone block movement, mine does not). The Machinist's entire
   bible fantasy — "weak alone, oppressive with setup time" — needs either an
   AI hook that makes `turret`/`drone` objects act on the clock, or an
   authorable `onDestroyed` / `operable` payload on the spawn effect. **This
   is the largest gap in the slice.**
2. **No self-movement effect.** `forceMove` moves units in the target *area*
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
4. **`consumableEffectBonusPercent` is unread by the engine.** The key exists
   in `src/data/schemas/ability.ts` and appears nowhere in `src/core`. There
   is also no consumable slot on `Unit` and no use-item command. The seven
   consumables and the Chemist's Bench Grade support are authored to schema
   but currently inert; Chemist item mastery is not yet playable.
5. **Statuses cannot carry a delayed or on-expiry cost.** Overclocked should
   hurt when it ends — bible §6 says every Augmented strength has a
   body-horror price. Expressed instead as up-front `hpCost` on the ability
   plus a permanent `modifyDisposition`, which is a fair trade but front-loads
   a cost the fiction wants at the back.
6. **`statMods` and `modifyStats` are flat integers only.** No percentage
   form, so a buff cannot scale with level. Bracer Shot's flat +4 phys is
   significant at level 1 and irrelevant by level 5.
7. **No conditional gating on abilities** beyond charge and HP. Nothing can
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
| Rowen Corvane | Enforcer | 1 | 72 / 38 | Unchanged shape; equipment left weapon-only so the level-1 line in COMBAT_RULES §2 still reads true off this file. Gained a reaction slot (Baton Answer). |
| Vale Tarn | Conduit | 1 | 50 / 70 | Replaces the placeholder in `src/app/content.ts`. Equipment carries no mag mods, so the Mag 10 / Attunement 70 worked example in COMBAT_RULES §4 stays literally correct. |
| Jory Slate | Chemist | 1 | 64 / 44 | Foundry hand; bench work is the trades' entry job. |
| Ivo Brace | Machinist | 2 | 48 / 50 | Secondary Chemist, matching the job tree. |
| Della Tine | Railrunner | 2 | 58 / 35 | Rail Dash slotted. |
| Marek Sump | Saboteur | 2 | 44 / 30 | Lowest Resolve in the party — nerve for wiring, not for standing. |
| Orin Vane | Augmented | 2 | 66 / **78** | Highest Attunement in the game: power and vulnerability in one number. |

Enemy templates for the encounter workstream to instantiate: `watch-enforcer`,
`watch-sergeant`, `watch-conduit`, `provocateur`, `provocateur-torch`,
`combine-hand`, `combine-runner`, `shop-machinist`.

**The provocateur carries a Shock Maul and no armor.** Watch-issue weapon,
foundry clothes — that is the tell the chapter turns on, and it is authored
into the data rather than only into dialogue.

## 9. Downstream work this creates

- `src/ui/mock.ts` hardcodes copies of `jobs/enforcer`, `jobs/conduit` and
  `units/rowen`; `tests/ui/mock.test.ts` asserts they match the authored JSON
  and now fails on all three (added learnable abilities, added equip tags,
  added Rowen's reaction slot). The UI/progression workstream owns that file
  and needs to re-sync it. Everything else in the suite is green.
- `src/app/content.ts` still hand-lists content files and carries the
  `VALE_PLACEHOLDER`. `data/units/vale.json` now exists; the placeholder can
  be deleted and the directory loaded.
