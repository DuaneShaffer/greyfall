# Encounter Notes — Battles 2–5

Design record for `data/encounters/e2-foundry-floor-nine.json`,
`e3-tallow-row.json`, `e4-refinery-three.json`, `e5-charterhouse-steps.json`,
and the three named story units they added (`data/units/aldric.json`,
`wick.json`, `nessa-kiln.json`).

Governing docs: `docs/CREATIVE_BIBLE.md` §8 (the five-battle arc), §2 (tone),
§5.5 (two registers), §9 (naming); `docs/MAP_NOTES.md` (per-map tactical
intent, which these follow rather than reinterpret); `docs/CONTENT_NOTES.md`
(the templates every placed unit is instantiated from).

Encounter triggers are the slice's cutscene system, so this workstream owns
both the tactical setup and the in-battle script. Every trigger below is
`once: true`; nothing in these four battles wants repetition.

Seeds are `1002`–`1005`, continuing `e1`'s `1001`.

---

## Shared authoring rules

- **Every placed unit is a template instance.** The `Unit` object is copied
  inline from `data/units/` with a per-encounter id (`torch-hand-gantry`,
  `watch-enforcer-mid-west`), and level / `learnedAbilityIds` / equipment
  tuned for that battle. Ids are unique across an encounter including
  `spawnUnits`, because `runActions` silently skips a spawn whose id already
  exists on the field.
- **Enemies use the new kits.** Each map's thesis is expressed through what
  the enemy has *learned*, not through stat inflation: saboteurs carry
  `gas-line-tap` on the gas map, Conduits carry `throw-the-breaker` and
  `overload-cell` on the powered map, the Watch carries `kettle` and
  `shield-advance` on the staircase.
- **Register by speaker.** Combine and Underveins voices use worker slang
  (*flare*, *render*, *the pour*, *hands*); the Watch uses charter-official
  phrasing (*in breach of*, *the writ*, *that is the procedure*);
  Prelate-Assayer Quill speaks Assay liturgical — measurement, tolerance,
  filing, never a side.
- **Loss is `partyRout` everywhere.** Only e5 adds a stake
  (`unitDowned: rowen`), because the finale is the one battle the fiction
  cannot survive without her.
- **Placement is validated against terrain, not just bounds.** Every enemy
  and every trigger tile sits on a passable, non-void, non-object-blocked
  tile; catwalk placements sit on decks that supply a `surfaceHeight`.
- No trigger tile overlaps a deployment tile: `unitEntersTiles` tests
  *presence*, not entry, so a unit deployed onto one would fire it at
  `battleStart`.

---

## 2. Foundry Floor Nine — `e2-foundry-floor-nine`

**Dramatic function.** The tragedy of fighting the people you are from. The
strike is not a riot and the map says so: the floor is still running because
someone wants it running. Jory Slate is present and on the wrong side of the
kettle line, and the battle's job is to make the player feel the cost of
winning it cleanly.

**Composition (6 enemies, L1–2; 6 deployed).**

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `provocateur-foreman` | provocateur | 2 | (9,1) | Tap deck. Ringleader; shock maul, no armor — the tell. The only L2 on the floor. |
| `torch-hand-gantry` | provocateur-torch | 1 | (6,4) | On `ladle-gantry` at height 4, per MAP_NOTES: teaches what the gantry is in one glance. `smoke-canister`, `shaped-charge`, `rig-machinery` — demolition without the press-killer; see the tug-of-war below. |
| `provocateur-press` | provocateur | 1 | (2,8) | West press lane, beside `press-line-mid`. |
| `hand-perren` | combine-hand | 1 | (8,9) | Mid-aisle. Named — see the trigger map. |
| `hand-runner-east` | combine-runner | 1 | (14,9) | Ingot rail; `rail-dash` on the one rail lane. |
| `hand-machinist-gantry` | shop-machinist | 1 | (13,6) | Gantry walk east, covering `floor-nine-mains` at (13,10). |

The whole floor except the foreman dropped to level 1 in the rebalance pass,
and the party went from four deployed to five: at the authored roster levels the
old composition was a **0% win across five seeds with all four units lost**
(`docs/BALANCE_REPORT.md` F6). It is **70%** now, at 2.8 of 5 lost — **45.8%**
at 3.7 of 5 on the later 24-seed instrument, which reads every encounter lower
than the ten-seed pass did.

**Then a human played it six times and lost six times**, and the fifth deploy
went to a sixth — see the tug-of-war below and `BALANCE_REPORT` §7.8.3. Six
against six is also what e3 and e4 field; e2 was the odd one out.

Two provocateurs plus a torch-hand carry the fight; the three strikers are
chemist / railrunner / machinist — the three lowest basic-attack jobs in the
game (6, 13, 9 damage at L1). That asymmetry is deliberate: the people who
hurt you are the plants, and the people you hurt cannot fight back well.

**Enemy satchel: two Coagulant Vials, and nothing thrown.** Perren Ash keeps
Bench Grade, so the floor's own coagulants heal for 45 and the fight's one
Chemist spends a turn or two a battle dosing a hurt striker instead of swinging
a dosing gun at the Watch. That is the whole point of giving this encounter a
satchel — the hands are trying to keep each other standing, not to win — and it
measures as a *net gift to the player*: the healing costs the enemy more tempo
than it buys back (`BALANCE_REPORT` §7.8.2).

The Caustic Flask that shipped beside the vials came back out. One thrown flask
a battle put the encounter at 12.5% against a 40–80% band — not for its 20
points of chemical but for Fouled, which takes a deployed unit's CT to 60% for
three turns in a fight that runs ninety. Every measured arm carrying the flask
read 16.7–25.0%; every arm without it read 39.6–45.8%. **The strikers' satchel
is a medical kit, which is also the right reading of the floor**: Perren Ash has
thirty years on the pour and a son in the yard, and he is dosing people, not
throwing scrub concentrate at a Watch sergeant.

### The machinery tug-of-war

**The premise of this level is a live press line, and for six shipped months
it was switched off before the player reached it.** A human acceptance
playthrough lost six straight attempts here; instrumenting the sim found the
reason, and it was not difficulty. Across 24 runs of the shipped build there
were **zero press activations by either side** and a press was live on **12%
of unit-turns**, because two enemy behaviours both fire on turn one or two and
neither is a mistake:

- the Yard Runner is a step from `floor-nine-mains` at (13,10) and throws it,
  which cuts all three presses and the ladle at once. The AI is right to
  (`BALANCE_REPORT` G5 gave the search `machineDenial` precisely so it would
  see the reason); the encounter is wrong to have made the re-cut free and
  the restore a one-shot.
- the Torch-Hand carried `bring-it-down` — 28 object damage at range 4 — and
  demolished the presses outright. **2.8 of 3 presses were destroyed per run.**
  A `once: true` restore cannot bring back a machine that is rubble.

The design intent, stated so the next pass does not undo it: **the mains are a
tug-of-war, not a switch.** Either side may cut them and the tap deck keeps
putting them back, so cutting the line costs the cutter a turn every time and
buys a dozen unit-turns, not the battle. The three fixes are the three halves
of that sentence.

| lever | change | why |
|---|---|---|
| the press-killer | `bring-it-down` off `torch-hand-gantry`'s learned list | An enemy that can delete the presses deletes the thesis, and nothing scripted refers to the ability. The Torch-Hand keeps `shaped-charge`, `rig-machinery` and `smoke-canister`, so the bay bridge is still a live threat and he is still the demolition character — he just cannot take a 60-hp press off the board in two casts. |
| the one-shot restore | `mains-hold-36/48/60/72/84`, five silent `setPower` triggers beside `mains-come-back` | `once: false` is not usable here: conditions read state, not the event batch, so a repeating `turnStart` trigger refires once per *command* and the switch would simply stop working. A twelve-unit-turn ladder — roughly a round on a twelve-body field — is the repeatable restore expressed in the trigger vocabulary that exists. `mains-come-back` keeps the dialogue; the five that follow are silent, because the foreman does not get to say the same two lines six times. |
| the attrition | `maxDeployedUnits` 5 → 6 | Six enemies against five deploys was the arithmetic behind the human's six losses, and e3 and e4 both field six. Nothing about the floor changes: no enemy is removed, no level trimmed, no position moved, no satchel touched. |

**Discoverability, added without touching a balance number.** The tug-of-war was
tuned and then remained invisible: the mains being cut showed up only as the
Operate entry greying out on a unit that happened to be beside a press, and
`mains-come-back` at turn 24 was a window no player could see opening. Two UI
changes carry it, both derived from state and neither specific to this map:

- the **power register** in the battle HUD (UI_DESIGN §6) — one row per machine
  something on the map can switch, LIVE or DEAD, permanently on screen. On this
  floor that is the three presses, the ladle tap and the charging lift.
- an **annunciator line for power the player did not throw** — when the Yard
  Runner cuts the mains, the HUD says so and names the switch that carries them:
  *"3 machines lost power. Floor Nine Mains carries them, and it works both
  ways."* The clause is the cue: the cut is a position, not a fact of the map.

No encounter JSON changed and no number moved; the balance above still stands.

Measured: powered-press turns **11–12% → 35–39%**, press activations by the
player **0 → 19 and 15** across two disjoint 24-seed sets, and a live press
with a hostile standing in its box now occurs in **24 of 24 runs on both sets**
where before it also occurred and could never be used. Win rate 45.8% → 75.0%
on both sets. The full ladder, including the four rejected alternatives, is in
`BALANCE_REPORT` §7.8.3.

**Win: `all` of the three provocateurs, or `rout`.** The merciful alternative
asked for, and now the objective the fiction actually wants: put down the
foreman on the tap deck, the provocateur in the press lane, and the torch-hand
on the gantry, and the floor stands down — you do not have to put down three
foundry hands who cannot fight back. The `all` group is the engine pass's
win-condition combinator; before it existed one ringleader had to stand in for
the cell. It is not a cheap out: the three are at (9,1), (2,8) and (6,4), one
in each corner of the floor, so taking them means crossing the pour aisle, the
west press lane, and the gantry.

**Trigger map.**

| trigger | condition | beat |
|---|---|---|
| `south-doors` | `battleStart` | The Watch's order, Jory's warning that nobody shut the tap off, and the foreman giving a soldier's order in a foundry hand's voice ("let them come up under the ladle"). |
| `aisle-mouth` | player on (6,11)…(9,11) | MAP_NOTES' aisle-mouth tiles. A striker shouts a warning *at the Watch* before the ladle tips; Rowen tells the record to note it. First seeding of the Inquiry frame. |
| `bridge-in-the-bay` | `objectDestroyed: bay-bridge` | The east flank severed. Jory: "That wasn't us. We work here." |
| `mains-come-back` | `turnStart: 24` | MAP_NOTES' suggestion that the shutdown be a delay, not a solve: re-powers the three presses and the ladle. Phrased to read correctly whether or not the player ever cut them. |
| `mains-hold-36` … `-84` | `turnStart: 36/48/60/72/84` | The same four `setPower` actions, silent, every twelve unit-turns. The tap deck does not give up after one attempt; the mains are a tug-of-war, not a switch. |
| `perren-goes-down` | `unitDowned: hand-perren` | The one that should hurt. Jory names him; Rowen tells the sergeant to log the name; the sergeant answers "We log numbers, ma'am." |

**Difficulty.** Party L1–2, six deployed, six enemies: **75.0%** on both the
primary and the alt 24-seed set, mean 84 and 81 turns, 3.2 and 3.4 of 6 lost.
That is the top of the 55–75% band on purpose. The sim reads this map easier
than a human plays it — it said 45.8% for a build a person lost six times out
of six — so on e2 the instrument's number is an upper bound and the top of the
band is the safe side of it. The intended solution is still machinery: the
press niches at x 1, the sluice covering a withdrawal, and the mains as the
strategic option — the difference is that the machinery is now on when the
player gets there. A party that treats the floor as scenery should still lose
units.

---

## 3. Tallow Row — `e3-tallow-row`

**Dramatic function.** The turn of the chapter. The pursuit is procedural
until the player walks into a ground-floor room and finds House Corvane
requisition seals, unbroken, on the charges. Everything after this battle is
a different story than everything before it.

**Composition (5 + 1 reinforcement, L1 with an L2 leader; 6 deployed).**

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `wick` | **new** `wick` | 2 | (8,2) | Head of the Row, beside `gas-main-north` under the gallery stair — MAP_NOTES' pivot. |
| `torch-hand-east-room` | provocateur-torch | 1 | (11,8) | *Inside* the east-mid tenement, per MAP_NOTES: "they're in the house" must read immediately. Also covers the tram lane two tiles east. |
| `torch-hand-south-room` | provocateur-torch | 1 | (3,13) | Inside the west-south tenement, above the player's deployment. |
| `cell-machinist` | shop-machinist | 1 | (8,10) | Behind `refuse-barricade`, holding the mid chokepoint. |
| `provocateur-barricade` | provocateur | 1 | (6,10) | The other side of the squeeze. |
| `provocateur-gutter` | provocateur | 1 | spawn (1,11) | One reinforcement down the west gutter when the player commits to the barricade. The second was cut in the rebalance pass; two put the fight out of reach at the roster's real levels. |

A sixth body, `provocateur-tram` at (14,8), stood in the tram lane until the
content follow-up (`BALANCE_REPORT` §7.8). It came out because seven against
six wiped the party in seventeen of twenty-four runs and it was the one
placement the map could carry without it: the tram lane's dilemma is the
`tram-cart`, the `gas-main-alley` and the drop, and the east-room torch-hand
is two tiles from it. Nothing scripted referred to him.

Both torch-hands carry `gas-line-tap`, which turns the risers and mains into
their weapon as much as the player's — the mutual-threat reading MAP_NOTES
asks for. Wick carries the full demolition kit including `bring-it-down`, so
he can open his own routes through frontages, and he is now the **only**
`smoke-canister` in the cell: three saboteurs all laying the same blanket over
a map that is already mostly wall was weather, not tactics. The smoke is
Wick's, and it reads as a man covering his own withdrawal.

**Win: `defeatUnit: wick`, then `rout`. Loss: `partyRout`, or Wick standing on
the gallery landing `(5,0)…(10,0)`.** MAP_NOTES §3 wanted "if a named saboteur
stands on the gallery stair landing, they got away", and `unitReachesTiles`
now says exactly that. Paired with `wick-breaks-for-the-stair`, which puts him
on (8,1) — one step below the landing — at 40% HP, the pursuit ends the way a
pursuit should: with a man you can still lose.

**Trigger map.**

| trigger | condition | beat |
|---|---|---|
| `foot-of-the-row` | `battleStart` | The writ; Rowen's rules of engagement; Wick's warning that the gas is live under the whole street. |
| `barricade-stand` | player anywhere on the mid cross-alley (y 11, both alleys and both street columns) | The chokepoint stand + `spawnUnits` of one from the west gutter. Widened from MAP_NOTES' four street tiles because (7,11)–(8,11) *are* the barricade and because the west alley and the tram are legal bypasses. Wick's line said "two down the gutter" and one arrived; it now says one. |
| `requisition-seals` | player on (3,3),(4,3),(3,4),(4,4) | **The chapter's turn.** MAP_NOTES' "cleanest" room. Corvane Freight stencils, unbroken seals, Wick's "we've been carrying your name up this street for a month", and the sergeant's "that is a paperwork matter." |
| `main-at-the-stair` | `objectDestroyed: gas-main-north` | The head of the Row alight. Gallows wit — "somebody's supper, that." |
| `wick-breaks-for-the-stair` | `unitHpBelowPercent: wick 40` | He announces the stair and `moveUnit` puts him on it, at (8,1). Rowen's counter-order is now a real order: the landing above him is a loss condition. |
| `wick-down` | `unitDowned: wick` | No name to give — a docket, a yard, and a man who never comes down to the yard. Rowen takes the evidence out of procedure and into her coat. |

**Difficulty.** Party at its authored levels, six deployed, six enemies across
the battle: **45.8%** win at 24 seeds, 3.8 of 6 lost, 74 turns — the wall of
the chapter, and the right shape for the battle the story turns on. The count
of the lost is high because the map is a maze of walls and half of it is a
one-tile doorway at a time; the enemy is never all in contact. Expect the
player to blow a frontage rather than walk 8 rough tiles — that trade *is*
the battle.

**How it got there.** The ten-seed read behind the rebalance pass said 40%;
the 24-seed instrument built for the AI pass said **29.2%**, before and after
that pass alike, and named it a content number (`BALANCE_REPORT` §7.5). It
was: every one of the seventeen losses was a `partyRout`, in ninety-odd turns,
with the enemy having lost three of seven and Wick untouched at the head of
the Row. The party was not losing the pursuit, it was being ground down in the
mid-Row and never reaching him. Dropping the tram provocateur and taking Smoke
Canister off the two torch-hands lands it at **45.8%** on the primary
seed set and **58.3%** on a second, mean turns 94 → 74. Every beat is intact:
the house, the squeeze, the gutter reinforcement, the seals, and the stair.
**Wick's escape loss never fired in either arm at forty-eight seeds** — a
party that gets him to 40% HP is a party that finishes him. That is a hole in
the drama worth an encounter-workstream look, not a balance one.

---

## 4. Corvane Refinery Three — `e4-refinery-three`

**Dramatic function.** The engineered catastrophe, and the discovery that
the Assay will watch it happen and file it correctly. The bible is explicit
that Rowen fails to fully stop it, so the design problem was making the
scripted disaster *not* a loss.

**Composition (7 enemies + one neutral, L1–3; 6 deployed).** Conduit-heavy, per the map's
showcase, plus the Watch units who are the frame-up's executors.

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `nessa-kiln` | **new** `nessa-kiln` | 3 | (7,2) | Control gallery, one tile from `switchboard-main`. MAP_NOTES: put the overload character where the plot is. |
| `watch-enforcer-gallery` | watch-enforcer | 1 | (6,2) | The gallery is a win condition; it needs a door. |
| `watch-conduit-ring` | watch-conduit | 1 | (9,6) | On `tower-walk-north` at height 4, with `overload-cell`. |
| `watch-conduit-terrace` | watch-conduit | 1 | (8,12) | South terrace, in the cascade band — see below. |
| `watch-enforcer-west-ramp` | watch-enforcer | 1 | (5,8) | Terrace lip covering the west ramp. |
| `watch-enforcer-east-ramp` | watch-enforcer | 1 | (13,8) | East ramp. |
| `watch-sergeant-floor` | watch-sergeant | 2 | (10,12) | South terrace with `kettle` — punishes the obvious approach. |
| `quill` | **new** `quill` | 2 | (10,2) | **Neutral.** Prelate-Assayer Quill, on the control gallery with a clear line to the switchboard, because the whole scene is that he watches and files. Non-combatant to both sides (`COMBAT_RULES` §18): he is walked through, never rolled against, and invisible to both AIs. He is sited off the `at-the-switchboard` trigger tiles so he cannot block the beat.

Two of them stand in the y 12–14 band the cascade lands on. That is
intentional: the overload kills refinery crew and Watch alike, which is the
whole argument that nobody planned for the people on the floor.

**The midpoint, implemented as MAP_NOTES §4 authored it.** One trigger,
`midpoint-overload`, fires the whole event so it reads as one thing:

1. dialogue — Nessa takes the interlock off the rack; Quill starts recording;
2. `destroyObject: bank-cell-one` — the four-cell chain runs itself out of
   the map's own `onDestroyed`, no scripting;
3. `destroyObject: tower-walk-south` — the ring becomes a C, the south
   approach to height 4 is gone, anyone on the arc falls into the sump;
4. `setPower: charge-hoist-west/east → off` — both decks drop, every Jump-1
   unit on the ring is stranded, and reaching `switchboard-main` becomes the
   second half of the battle;
5. dialogue — Quill's measurement, which is the scene: *"Four cells in
   series, and the grid browns out on cue. Accidents are not this tidy."* and
   *"The Inquiry will record this as a Combine act. I am recording what I
   saw. The two documents are not required to agree."*

**Condition choice.** MAP_NOTES offered the terrace lip `(5,12)…(12,12)` *or*
`turnStart` around turn 8. Neither works as written: the far-west margin
(x 0) is a legal route north that never touches x 5–12, and `state.turn`
counts global unit-turns rather than rounds (gap 3). So the trigger is the
**full y 12 line**, every passable tile — a phase line the player cannot
reach the gallery without crossing, roughly five tiles out from deployment,
which lands it at the pacing MAP_NOTES wanted.

**Win: `reachTiles` on the switchboard *by Marek Sump*, or `defeatUnit:
nessa-kiln`.** This is "stop what can be stopped": get the man who can do it
onto the control gallery and cut the grid, or take the engineer. Neither
prevents the midpoint — it has already fired by the time either is achievable
— so the scripted catastrophe is scenery for the win, not a failure state.
Loss is `partyRout` only; a `turnLimit` loss would have contradicted the bible
by making the failure the player's.

**Why the reach win is one character's errand** *(balance pass, 2026-08-16;
`BALANCE_REPORT` §7.8.7)*. Ungated, "any body on the tile" was worth nine extra
wins in 48 and put e4 at 85.4% pooled, over the ceiling — the kill route was a
flat 66.7% on both seed sets, so the objective was the only thing out of band.
`reachTiles` takes a `unitId` and it now carries `marek-sump`. Marek is the
Saboteur with the party's lowest Resolve and `CONTENT_NOTES`' reason for it —
*nerve for wiring, not for standing* — and a switchboard is wiring; his
`catwalk-sense` is *"you have crawled over enough condemned grating to know
which of it holds"*, and after the midpoint takes `tower-walk-south` and both
hoists, condemned grating at height 4 is the only road to the gallery left.
Rowen's `on-the-ring` line, *"It is not for seeing. It is the way to the
board,"* is the order and not the errand: she names the route, he crosses it.
**The consequence is deliberate and is a deployment choice** — the roster is
seven and `maxDeployedUnits` is six, so a party that leaves Marek at home
fights Refinery Three on the kill route alone. The kill route is always open,
so this narrows the fight rather than gating it.

`at-the-switchboard` is still written for the party's arrival rather than for
Marek's specifically, and its tiles still share only `(7,2)` with the win tiles
— it fires 0–2 times in 24 runs. That misalignment is logged in
`BALANCE_REPORT` §7.8.4 and is an encounter-workstream fix, not a balance one.

**Other triggers.** `under-measurement` (`battleStart`) establishes Quill's
neutrality and Nessa's licence; `on-the-ring` fires when a player unit takes
the tower walk; `at-the-switchboard` puts the filing question to Nessa on the
gallery floor (6,2)…(9,2); `the-licence-does-not-carry-her`
(`unitHpBelowPercent: nessa-kiln 40`) is Quill dropping her — *"The Sodality
licenses attunement. It has never licensed conduct."*

**Difficulty.** Party at its authored levels, six deployed, seven enemies plus
Quill — **70%** win at 4.4 losses. The escort dropped to level 1 and Nessa
stayed at 3; she is the fight. The real
opponent is the circuit. Expect the second half to be fought without the
hoists. A party with no Conduit and no Jump-2 answer will be locked off the
ring entirely, which is the correct punishment on this map. **Shipped landing:
83.3% primary / 79.2% alt, 81.3% pooled over 48 seeds** (`BALANCE_REPORT`
§7.8.7).

---

## 5. The Charterhouse Steps — `e5-charterhouse-steps`

**Dramatic function.** The confrontation. Rowen wins the field and loses
everything else. Aldric does not deny it — that is the beat, and it lands on
terrace two rather than at the top, because a man who is not ashamed does not
wait to be cornered.

**Composition (5 + 1 reinforcement + one neutral, L1–2; 7 deployed).** The
finale is the one battle that deploys the whole company. Defender-favoring by
placement, but a terrace lower than MAP_NOTES drew it — see the note below the
table.

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `aldric` | **new** `aldric` | 2 | (8,10) | Terrace two, in the pocket the hedge planters make of the grand stair's exit. He is standing where the proof lands. |
| `watch-sergeant-steps` | watch-sergeant | 2 | (7,7) | Terrace three behind the plinth. `kettle` on a funnel map; the one thing above Aldric. |
| `watch-conduit-upper` | watch-conduit | 2 | (10,10) | Carries `flare` — the only long reach on a map with almost no flux. |
| `watch-enforcer-mid-west` | watch-enforcer | 1 | (5,10) | Terrace two behind the planters. |
| `watch-enforcer-screen` | watch-enforcer | 1 | (7,13) | The terrace-one screen. Expected to die; its job is one turn. |
| `watch-enforcer-court-west` | watch-enforcer | 2 | spawn (6,2) | The reserve, on the upper court beside the west lamp standard. |
| `quill` | **new** `quill` | 2 | (11,2) | **Neutral**, upper court. He is on the estate because the finding is already drafted; the closing beat lands on a body. |

**Aldric moved down a terrace, and that is a measured change.** MAP_NOTES §5
put him at (8,7) on terrace three. Measured there, at the roster's real levels,
the party never reached him at all: over five seeds the whole company died on
terraces one and two while **Aldric took 18 damage in 106 unit turns**. The
climb plus the defenders' height meant the boss was scenery. At (8,10) the
proof and the man are in the same place, `terrace-two-the-proof` fires with him
standing in it, and `aldric-to-the-court` gives the withdrawal the two-act
structure MAP_NOTES wanted — one act on terrace two, one on the upper court at
height 8. He is also L2 rather than L3: one level on the boss is worth 20–30
points of win rate on this map, and at L3 with the same escort the finale
measured **20–30%** over ten seeds against **80%** as it ships.

**Win: `defeatUnit: aldric`. Loss: `partyRout` *or* `unitDowned: rowen`.**
Losing Rowen is losing, and the bible's permadeath rule makes that literal.
e1 now carries the same stake, so the rule is taught in battle one rather than
sprung in battle five.

**Trigger map.** MAP_NOTES' terrace lips as phase lines, one `once: true`
dialogue each, which paces the climb without any extra map machinery.

| trigger | condition | beat |
|---|---|---|
| `the-steps-are-closed` | `battleStart` | `setPower: service-lift → off` — the Watch shutting the tradesmen's entrance, exactly as MAP_NOTES suggested, so the west bypass has to be taken rather than given. Aldric lets her climb on purpose. |
| `terrace-one` | player on y 13 | The screen falls back; Aldric orders her heard before she is stopped. |
| `terrace-two-the-proof` | `unitHpBelowPercent: aldric 90` | **The bible beat.** Rowen names the seals and the docket. Aldric: *"Yes."* Then the reason — a seam claim, the Combine had to be made a danger — and *"Where a thing is signed is not where it happens. That is the whole use of signing."* HP-gated (not position-gated) so no path — including a ranged fast kill — can skip the chapter's core; every route that downs him crosses 90%. |
| `terrace-two-reached` | player on y 10 | The arrival exchange that used to share the proof's trigger — split out so position and proof are independent. |
| `aldric-to-the-court` | `unitHpBelowPercent: aldric 55`, `afterTriggerId: terrace-two-the-proof` | The withdrawal MAP_NOTES designed, now real and ORDERED after the proof: `moveUnit` takes him (8,10) → (8,4), height 8, between the two lamp standards, and `spawnUnits` brings one elite onto the upper court behind him. The second act happens on the upper terrace because Aldric is there. |
| `the-top-step` | player on y 4, `afterTriggerId: aldric-to-the-court` | Nothing further up; Rowen refuses to make a speech and keeps the docket instead. Ordered after the withdrawal so it cannot fire while he still holds terrace two. |
| `the-record-closes` | `unitDowned: aldric` | The erasure. Aldric: *"You will not be in the record, Rowen. You will be in the refinery."* Quill files the Inquiry's finding that she died at Refinery Three. Rowen: *"Then I go down by the tradesmen's lift."* — the desertion, and a callback to the lift the Watch cut in the opening line. |

The closing dialogue depends on `settle()` running `evaluateTriggers` before
`evaluateOutcome`. That ordering is load-bearing for every "closing dialogue on
win" in the slice; it is documented in `COMBAT_RULES` §15 and asserted by
`tests/core/conditions.test.ts` since the engine pass.

**Overkill ruling (binding).** A blow that downs a unit outright used to skip
every `unitHpBelowPercent` beat it leapt past — one-shotting Aldric played only
`the-record-closes`, and the chapter's whole argument went unheard. The rule now
is:

- **A downed unit reads 0%**, so it is below every authorable threshold (the
  schema constrains `percent` to 1..99). `unitHpBelowPercent` no longer excludes
  downed units. A unit *removed* from the field has no HP to read and is below
  nothing.
- **Author order is the play order.** Threshold beats are listed above the
  `unitDowned` beat in every encounter that has both (e3 `wick`, e5 `aldric`),
  so a single pass of `evaluateTriggers` fires them in the order they were
  written and the death beat lands last. Authors must keep that order.
- **The words land; the body does not move.** `moveUnit` no-ops on a downed
  unit, so `aldric-to-the-court` speaks the withdrawal over a corpse without
  walking it up the steps. Every other payload runs as authored: the reserve
  `spawnUnits` brings up still arrive, and the win condition resolves in the
  same `settle()` regardless.

Asserted by `tests/core/triggerOrder.test.ts`.

**Difficulty.** Party at its authored levels, seven deployed, six enemies —
**80%** win at 3.6 of 7 lost — the whole company on the field is what makes it
winnable, and it is still the only fight in the slice where a single unit's
death ends it.

> **The warning this section used to carry is discharged.** It read: Aldric at
> L3 with `riot-drill`, `watch-cuirass`, `visored-helm` and `breach-shield` is
> ~131 HP and ~26 evade, hitting for ~93 — a one-shot on a level-3 Conduit —
> and "the finale is not fairly tunable from the content side". The engine's
> level-scaled divisor took that number from 93 to 40, and this pass took the
> rest from the content side: `breach-shield` → `riot-shield`, `riot-drill` cut
> to hp +2 / evade +1, `watch-cuirass` 20 → 14 hp, and Aldric down to L2. He
> reads 97 HP, 17 evade, 38 damage — a boss the party can lose to rather than a
> boss the party cannot reach.

---

## Trigger-vocabulary gaps

Reported, not worked around. Nothing below was faked with a wrong mechanic.

> **Closed, and now wired in (rebalance pass, 2026-08-15).** Gaps **1**
> (`moveUnit` / `removeUnit`), **2** (`unitReachesTiles`), **3** (`turnStart`
> is reaches-or-passes), **4** (`all` win groups), **5** (`neutral` is
> non-combatant), and **9** (trigger-before-outcome) were closed by the engine
> pass. What this pass did with them:
>
> | vocabulary | where | what it does now |
> |---|---|---|
> | `moveUnit` | e5 `aldric-to-the-court` | Aldric withdraws (8,10) → (8,4), MAP_NOTES' second position, at 55% HP. The finale has two acts on two heights for real, not by implication. |
> | `moveUnit` | e3 `wick-breaks-for-the-stair` | Wick bolts (8,2) → (8,1), one step off the gallery landing. |
> | `unitReachesTiles` | e3 loss | Wick on `(5,0)…(10,0)` is a loss. MAP_NOTES §3's "if a named saboteur stands there, they got away", with the pursuit's own polarity. Paired with the bolt above, the last two turns of the battle are a chase. |
> | `all` | e2 win | "Defeat the provocateurs" is now literally that: the foreman, the press-lane provocateur, *and* the torch-hand. The merciful objective no longer collapses to one ringleader. |
> | `removeUnit` | e1 `over-the-wall` | The second provocateur leaves the field rather than dying. See the e1 section. |
> | `neutral` | e1 Maren, e4/e5 Quill | Story bodies on the map. |
> | `turnStart` | e1 `the-first-maul`, `over-the-wall` | The premise staged on the clock. |
>
> **Jory Slate is deliberately not placed as a neutral in e2.** She is a
> *roster* unit (`data/campaigns/foundry-chapter.json` deploys her third), so a
> neutral `jory-slate` on Floor Nine would be a duplicate unit id on the field
> whenever the player brings her — and she is exactly the unit a player brings
> to a foundry. Her presence in the scene is satisfied by her being deployable,
> and her dialogue already reads as a party member's. The gap-5 note that asked
> for her predates her joining the roster.
>
> **e4's midpoint keeps its tile trigger.** `turnStart` is reliable now, but a
> phase line off the player's own advance paces better than a clock: the
> overload fires when the party commits to the terrace, not on turn *n*
> regardless of where anyone is standing. Recorded as a choice, not an
> oversight.
>
> Gaps 6, 7, 8, and 10 are open.

1. **No unit-move trigger action.** `TriggerAction` has `dialogue`,
   `spawnUnits`, `setPower`, `destroyObject`, `endBattle` — nothing that
   repositions an existing unit. MAP_NOTES §5 asks for Aldric to withdraw
   from (8,7) to (8,4) at 50–60% HP, giving the finale two acts on two
   heights; that is currently inexpressible, and e5 substitutes dialogue plus
   upper-court reinforcements. A `moveUnit { unitId, to }` action would fix
   it and would also serve "the saboteur bolts for the stair" in e3. A
   `removeUnit` would let a character leave the field without dying.
   **This is the largest gap for this workstream.**
2. **No "an enemy escaped" objective.** `LossCondition` is
   `partyRout | unitDowned | turnLimit`; `reachTiles` exists only as a *win*
   and, with a `unitId`, would award the player a win when the named unit
   reaches the tiles — the wrong polarity for a pursuit. MAP_NOTES §3 wants
   the gallery-stair landing to mean "they got away." Needs
   `LossCondition: unitReachesTiles { unitId, tiles }`.
3. **`turnStart` is unreliable and misnamed.** `state.turn` increments once
   per *unit* turn (`src/core/rules/turn.ts:42`), not per round, so
   MAP_NOTES' "around turn 8" is roughly the first round in a ten-unit
   battle. Worse, `isConditionMet` tests `state.turn === when.turn` and
   triggers are only evaluated in `settle()` after a command, so a turn that
   is consumed entirely inside `advanceClock` — a stunned or otherwise
   incapable unit auto-ending inside `startTurn` — never has triggers
   evaluated at that index and the trigger is silently skipped. Suggest `>=`
   semantics, or a separate round counter, or both. e4's midpoint is a tile
   trigger because of this; only e2's cosmetic re-power risks it.
4. **Win conditions are OR-only.** No AND, and no "all units matching a
   predicate." "Put down the provocateurs and the strikers stand down" — the
   merciful objective e2 actually wants — has to collapse to one ringleader's
   `defeatUnit`.
5. **No non-combatant placement.** The bible puts Jory Slate on Floor Nine
   and Quill in Refinery Three, physically present. `PlacedUnit` accepts
   `team: "neutral"`, but `isHostile` is `a.team !== b.team`
   (`src/core/rules/grid.ts:123`) and the AI treats every unit not on its own
   team as a hostile (`src/core/ai/context.ts:252`), so a neutral is hostile
   to *both* sides and will attack the player. Both characters are therefore
   voices only. Wanted: a `nonCombatant` flag on `PlacedUnit`, or a
   `hostileTo` list, so story bodies can stand on the map.
6. **`DialogueLine.speaker` is an unvalidated free string.** "Prelate-Assayer
   Quill" is typed literally in two files and "Watch Sergeant" in four; a
   typo cannot be caught. A `speakerId` resolving against units or a cast
   table would let `tests/content.test.ts` cross-check it, and would also
   solve portrait binding — `portraitId` on a dialogue line is currently
   hand-entered per line with no registry behind it.
7. **Triggers cannot read or write state flags.** There is no way to express
   "only if the mains were cut", "only after trigger X fired", or "only if
   this unit is still standing." `once: true` plus condition ordering is the
   entire control flow, which is why e2's `mains-come-back` line has to be
   phrased so it reads correctly in both worlds.
8. **No trigger action that touches a unit directly.** No `damageUnit`,
   `healUnit`, `applyStatus`, `modifyDisposition`. The refinery midpoint
   routes all its harm through `destroyObject` and the map's authored
   `onDestroyed` payloads, which is how MAP_NOTES designed it — but a
   scripted event that must hurt one *named* unit (the striker who catches
   the ladle, the lieutenant who is made an example of) cannot be written.
9. **Trigger/outcome ordering is an undocumented contract.** Closing dialogue
   on a `unitDowned` boss works only because `settle()` calls
   `evaluateTriggers` before `evaluateOutcome`. Every "last words" beat in
   the slice depends on it and no test asserts it.
10. **`unitEntersTiles` is presence, not entry.** A unit standing on a
    trigger tile fires it, so a trigger tile that overlaps a deployment tile
    fires at `battleStart`. None of these four do, but the name invites the
    mistake.

## 1. The Marshaling Yard — `e1-marshaling-yard` (polish pass)

Battle 1 was the format exemplar and was left alone by the battles-2–5 pass
because `tests/core/` replays it. The rebalance pass took the polish queue,
and did it in a shape that keeps the opening state of the battle
byte-identical — every addition arrives on the clock or on a tile, never in
`enemies` — so the whole 449-test suite stayed green without one expectation
being edited.

| queue item | what shipped |
|---|---|
| 1. Provocateurs singular, and the premise only asserted | `the-first-maul` (`turnStart: 2`) spawns `provocateur-b` at (1,0) — *behind* the Combine line — the moment the first provocateur's own turn ends. Provocateur-a acts first by the CT tiebreak (`COMBAT_RULES` §17: equal CT, lower unit id), so the sequence a player watches is: a maul goes in, and then a second man in a foundry coat comes out from behind the picket. Maren names it; Rowen names the tell — Watch issue, foundry coat, neither on the roll. |
| 2. `rout` with one enemy is a one-kill win | Two enemies now, and `over-the-wall` (`turnStart: 8`) takes the second one off the field with `removeUnit` rather than downing him. He was never there to win the fight. That is the premise stated as a rule: the provocateur leaves, and "an unidentified party leaving the scene" is the only wording the sergeant has for it. |
| 3. No script on the rail or the lift | `down-the-rail` on the rail column (2,1)–(2,2) and `on-the-lift-deck` on the freight-lift deck (5,4). Maren teaches both, in yard slang; Rowen answers the lift one with the line the finale calls back to — height is a thing you can be given and a thing you can be taken off. |
| 4. Maren speaks but is not present | She is placed, `neutral`, at (2,3) on the running rail between the deployment band and the provocateurs — physically between the Watch and the men who started it. Non-combatant to both sides (`COMBAT_RULES` §18), so she is walked through, never rolled against, and uncounted by `rout`. |
| 5. `unitDowned: rowen` as a second loss | **Applied.** The permadeath rule is taught in battle one instead of sprung in battle five, and it matches e5. |
| 6. Seed 1001 and the armour-less provocateur | Left alone, as instructed. |

**Why `turnStart` and not placement.** `battleStart` triggers fire inside
`createBattle`, so anything staged there is present in the opening state and
five tests across `tests/core` and `tests/app` assert that state's unit list.
Staging on turn 2 costs nothing dramatically — the beat *wants* to land after
the first blow, not before it — and it means the tutorial's opening frame is
still Rowen, one provocateur, and a line about who fired first.

**`provocateur-b` is level 2, and that is the only thing keeping him from
being scenery.** The acceptance playthrough reported that the second
provocateur never did anything, and the sim agreed exactly: across 24 seeds on
each of two sets he took **0 turns, moved 0 tiles and dealt 0 damage in 48 of
48 runs**. Not a placement problem — moving the spawn to (3,1), (3,2), (2,2)
or (1,2) changed nothing, because he never reached 100 CT at all. A spawned
unit enters at `ct: 0` (`createBattleUnit`) while everyone else is mid-clock;
on a seven-body field a unit turn costs about two ticks, so `the-first-maul`
at turn 2 and `over-the-wall` at turn 8 gave him roughly eleven ticks, and at
the Enforcer's level-1 Speed of 6 he peaked at **66 CT** and was removed
holding it. At level 2 his Speed is 10, he reaches 100, and he takes his one
turn in **24 of 24 runs on both seed sets** — walks in and puts a shock maul
into someone for 37–38 points. Position was left at (1,0): the L2 arm reads
identically from there and from (2,1), and the tiles further forward are
strictly worse (he is engaged and killed instead of swinging).

**Two turns is arithmetically unavailable and that is a `turnStart` problem,
not a tuning one.** A second turn needs another 100 CT — about ten more ticks,
which lands past turn 12 — so it cannot coexist with removal at turn 8.
Pushing `over-the-wall` to 14 buys a second turn in only 8–12 of 24 runs and
costs the beat: the party kills him before the wall in 20 of 24. The removal
stayed at turn 8. This is gap 3 in the list above — `state.turn` counts unit
turns, so "he gets six turns" was never true of any unit on this map.

**Difficulty.** Still a walkover by design: **100% on both 24-seed sets, no
losses**, mean 11.7 unit turns. It is the tutorial; it now takes two kills, a
withdrawal, and one real blow from the man who leaves.

---

## 6. The Meter House — `s1-meter-house`

Design record for `data/encounters/s1-meter-house.json`,
`data/maps/meter-house.json` (MAP_NOTES §6) and
`data/campaigns/works-skirmishes.json`. Seed `1006`, continuing `1001`–`1005`.
The first encounter authored on a declared flux grid
(`docs/design/FLUX_GRID.md` §4.1); everything in it is v1 vocabulary.

**Dramatic function.** A Works engagement during the strike, and deliberately
not a beat of the arc. Bible §8 says five battles and means five: this is a
skirmish, and its job is to carry the chapter's ambivalence without moving any
of it. A Combine crew has taken the Corvane meter house and is running four
struck galleries off the house's own bus. Rowen's squad is sent to put the
galleries back in the dark, which is a lawful order, an unarguable
inconvenience, and a thing that happens to people down a hole. Nobody in the
dialogue is lying and nobody wins the argument. The one detail that points at
the chapter — a Watch-issue shock maul in a picket line — is noticed by Rowen,
dismissed by the sergeant, and never mentioned again.

**Composition (6 enemies, L1–2; 6 deployed).** The thesis is expressed through
what the crew has *learned*: four of the six carry a grid verb, and none of
them carries stat inflation.

| id | template | Lv | tile | learned | why there |
|---|---|---|---|---|---|
| `crew-sparker-nella` | watch-conduit | 2 | (8,7) | `arc`, `reclose`, `cross-tie` | Nella Fen, an unlicensed Conduit, standing on the gallery landing one tile from the tie. She is the restore and she is the tie. The Assay's visor came off the template with the licence. |
| `crew-machinist-bram` | shop-machinist | 2 | (11,7) | `field-splice`, `reroute`, `field-repair` | Bram Coil, at the east board. The other half of the restore: he answers cuts, and `reroute` means he can close the tie from three tiles out when Nella cannot reach it. |
| `torch-hand-trough` | provocateur-torch | 1 | (5,7) | `cut-the-feed`, `smoke-canister`, `rig-machinery` | Standing *in* the gallery run he is about to cut, which teaches what a trough is in one glance. The cut half of the tug-of-war. |
| `hand-runner-sill` | combine-runner | 1 | (12,5) | `switch-kick` | On the trolley rail, four steps from the east main and the east board. He has no grid ability and does not need one: `activateObject` on a board is free to anybody, and this is the body that will use it. |
| `hand-dosser-orla` | combine-hand | 1 | (8,4) | `coagulant-jet` | Orla Pike, mid-floor behind the line. The crew keeping each other standing. |
| `crew-picket-vaughn` | provocateur | 1 | (7,10) | `pin` | The picket under the landing's south face, holding the centre door's exit. Shock maul, no armour — e2's tell, unremarked. |

The map's own asymmetry does the rest: the two grid characters are the only
L2s, and the three lanes that matter are held by one body each.

### The machinery tug-of-war, on a graph

Everything §2 learned about Floor Nine applies here with a bigger surface to
get it wrong on, and `BALANCE_REPORT` §7.8.3 is the binding precedent: **an
enemy that could delete the presses deleted the thesis.** Three rules were
applied at authoring time rather than found in a sweep.

| lever | what shipped | why |
|---|---|---|
| the grid-killer | **No enemy carries `bring-it-down`, `shaped-charge` or `overload-cell`.** The torch-hand keeps `cut-the-feed`, `smoke-canister` and `rig-machinery` — the last of which is a `setPower: off` with 12 points of object damage riding it, a quarter of a trough, which cannot take anything off this map inside a battle. | The routine verb has to be the reversible one (§1.8). A cut buys turns and a splice answers it; a demolition changes the map and nothing answers it. Give a level-1 saboteur a way to demolish a trough in two casts and the second half of the fight has no grid in it. |
| the one-shot restore | **`the-house-comes-back` at `turnStart: 24`, then `the-house-holds-36/48/60/72/84`** — six triggers, each putting *both* mains back in, five of them silent. | `once: false` is still unusable: conditions read state rather than the event batch, so a repeating `turnStart` refires once per command and the switch stops working. A twelve-unit-turn ladder is the repeatable restore expressed in the vocabulary that exists. The mains are a tug-of-war, not a switch, and the house has a spare key to either cutout. |
| the tie | **Nothing scripted ever touches `gallery-tie`.** | The ladder is allowed to fight the player over the mains because the mains are a resource. The tie is the player's entire decision space on this map (MAP_NOTES §6), and a trigger that opens or closes it would be the encounter answering the question the map exists to ask. |

**A `setPower` trigger action does clear a trip latch, and the ladder depends
on it.** A tripped source keeps `powered: true` — the trip is a latch on the
node, not a thrown isolator — so a naive `setPower: on` could have been a
no-op against exactly the state the ladder exists to undo. It is not:
`setObjectPower` (`src/core/rules/effects.ts`) treats "on" against a latched
source as a **reclose**, clears `tripped`, and emits `GridReset`. Asserted
end-to-end in `tests/data/meterHouse.test.ts` by driving `evaluateTriggers`
at turn 24 against a house the player has just overdrawn.

**Trigger map.**

| trigger | condition | beat |
|---|---|---|
| `the-meter-house` | `battleStart` | The sergeant's demand for tickets, Nella's count of the galleries, Rowen's offer of the south doors, and Bram's answer — *"you put a gallery in the dark with hands still down it and somebody gets carried anyway."* Closes on Rowen naming the maul and the sergeant filing it as nothing. |
| `on-the-landing` | player on `(7,7),(8,7),(7,8),(8,8)` | **The legibility beat.** The sergeant explains the tie in one line — closed, both mains carry one bus and there is room on it; open, each carries its half and neither has anything spare — and Rowen names the verb that answers it. §2.5(b) says the player must be told the state *and* the counterplay; e2 proved that inferring it is the same as not having it. |
| `the-west-feeder-goes` | `objectDestroyed: west-feeder` | The cut/destroy split, said out loud: *"Not cut — gone. A cut I splice. A hole stays a hole."* Phrased so it reads correctly whether or not the tie is closed, because with it closed the west board is still fed from the far main. |
| `the-east-feeder-goes` | `objectDestroyed: east-feeder` | The mirror, naming the pump and the apron lamp. |
| `the-west-main-goes-out` | `objectPowered: west-main, powered: false` | The latch under the restore. One line from the sergeant, flat and procedural: the west main is out and the Meter keeps a boy on the cutouts who does not have far to walk. It marks the moment the house first goes dark and it sets up the payoff twelve unit turns later. |
| `the-house-comes-back` | `turnStart: 24`, `afterTriggerId: the-west-main-goes-out` | Both mains back in, with the only dialogue on the ladder: the Meter keeps a spare key and a boy who has to walk four steps. Rowen's answer is the design note — *"pulling a main is a delay. Standing on the boards is the job."* The gate is the fix for acceptance finding 14: the rung used to fire unconditionally, so on a house nobody had touched Nella announced a restore of a state the house had never left. |
| `the-house-holds-36` … `-84` | `turnStart: 36/48/60/72/84` | The same two `setPower` actions, silent. The house does not give up after one cut, and Nella does not get to say the same two lines six times. |
| `nella-goes-down` | `unitDowned: crew-sparker-nella` | The one that should cost something. Rowen logs a name; the sergeant points out that the Assay will file her as a sparker whatever the Watch writes; Rowen tells him to write both and let the Archive hold two documents that disagree. Authored last, per §5's overkill ruling. |

No trigger tile overlaps a deployment tile — the landing is at y 7–8 and the
receiving bay is at y 14–15.

**The one grid-aware condition, and why it is no longer v2.** `objectPowered`
is FLUX_GRID §7.5's own spelling, `{ kind, objectId, powered }`, added to
`src/data/schemas/encounter.ts` verbatim and implemented in `isConditionMet`
against **energization** rather than the isolator flag (§1.3 is binding: every
rule that read `powered` reads energized). That distinction is the whole value
of it here — a tripped source keeps `powered: true` and is feeding nothing, so
a player who overdraws the west half has put the house in the dark by the only
definition that matters, and the flag would have missed it. `gridTripped` and
the grid-aware win and loss conditions stay v2; nothing here needs them.

**Two honest limits of the latch, recorded so nobody rediscovers them as
bugs.** They are tested in `tests/data/meterHouse.test.ts` rather than left as
prose.

- It watches the **west** main. With the tie open the two halves are separate
  circuits, so a player who only ever pulls the *east* main never opens the
  gate: he misses the turn-24 rung entirely and gets his restore from the first
  silent one at 36. The five silent rungs are ungated for exactly this reason —
  the mechanical ladder holds whatever the dialogue does.
- With the tie closed there is no east-only pull to worry about. One main
  carrying the whole house is 20 against 14, so pulling either cutout trips the
  survivor and de-energizes the west main anyway; the gate catches that case
  through the same condition.

A third case is a deliberate acceptance rather than a limit: with the west main
still in at turn 24 the rung stays armed, so the *first* time the house goes
dark after turn 24 it comes straight back in the same batch. That is the ladder
being overdue rather than punctual, the dialogue is true when it lands, and it
happens at most once — `afterTriggerId` ANDs with `when` and gates the whole
trigger, so there is no vocabulary for holding the actions and the lines apart.

**Win: `all` of Nella Fen, Bram Coil and the picket, or `rout`. Loss:
`partyRout`.** The same shape e2's win takes and for the same reason: the two
people who are actually holding the house are the two working the circuit, and
the third is the man in the way. Put those three down and the hands go home;
you do not have to put down a chemist and a yard runner who took the shift
because the gallery is theirs. It is not a cheap out — they stand at (8,7),
(11,7) and (7,10), which is the landing, the east board and the centre door,
so taking them means crossing the whole hall.

### Campaign integration: a second campaign, and its one cost

`Campaign` has a flat ordered `encounterIds` and nothing else — no optional
flag, no side list — and the schema is frozen. Appending `s1-meter-house` to
`foundry-chapter` would make it a mandatory sixth battle and break bible §8's
five-battle arc outright, so it ships as its own campaign:
**`data/campaigns/works-skirmishes.json`**, id `works-skirmishes`, name "The
Works - Skirmishes", one encounter, and the chapter's seven roster ids and
starting inventory copied verbatim. Its Standing bonus started as the
chapter's too and no longer is; see "Standing: 250" below.

Nothing in the codebase enumerates campaigns in a way this disturbs, and that
was checked rather than assumed:

- `src/app/content.ts` globs every campaign file into `CAMPAIGNS`, but
  `openingCampaign()` names `foundry-chapter` by constant. The shell still
  opens on the chapter.
- `src/sim/sweeps.ts` picks a campaign in two places (`rosterIds`,
  `encounterSweep`) as **the first by sorted id**. `foundry-chapter` sorts
  before `works-skirmishes`, so the sim's party selection and its chapter
  ordering are unchanged.
- `encounterSweep` glob-discovers `data/encounters/` regardless of any
  campaign, so `s1-meter-house` now appears in the sweep at
  `chapterIndex: -1` — which floors to level 1 in the "chapter" arm. That is
  the intended behaviour for a skirmish and is the reason it is measurable at
  all.
- `tests/app/*` load `foundry-chapter.json` by path; `tests/progression/
  campaign-refs.test.ts` iterates every campaign and is satisfied by the new
  one (opening encounter exists, roster ids resolve, no duplicate stacks).

**The one limitation, stated so nobody rediscovers it as a bug.** A separate
campaign is a separate `CampaignState`: its own roster, its own Standing, its
own fallen list. A player cannot take a squad out of the chapter, fight the
Meter House, and come back with the Standing. The skirmish therefore starts
from the chapter's seed rather than from wherever the player is. Fixing that
means either an optional-encounter concept on `Campaign` or a shared roster
between campaigns, and both are schema changes this package is not allowed to
make; recorded here as the price of shipping the grid a map to live on.

**Difficulty: 70.8% on both seed sets**, 48 runs, mean 96 turns and 3.4 of 6
lost, no stalemates (`BALANCE_REPORT` §7.8.8). The two disjoint sets agree to
the decimal, which no encounter in this file has managed before.

Two things moved between the first read and that one, both tuned on the
primary set only. The crew shipped holding grid verbs and almost nothing
else — a machinist whose whole kit was splice, reroute and repair, a saboteur
who could cut a line and not hurt a person — and six enemies who cannot fight
lose to six who can, at **100.0% on both sets**. They keep the grid verbs and
get their own trade back beside them: Nella takes `ground`, Bram takes
`tripwire-charge` and `skitter-drone`, the torch-hand takes `gas-line-tap`,
the runner takes `coupling-hook`, the dosser `cinder-oil`, the picket
`shield-advance`. Then levels: the whole crew to L2 read **50.0%** and four of
six at L2 read **95.8%**, so the level step is worth forty-odd points on its
own and the landing is five at L2 with Orla, who is a healer and not a
fighter, left at L1.

**The grid is contested and neither side deletes it.** Across the two sets the
crew throws the tie 50 times and writes 271 isolators, works the machinery 41
times against the party's 7, and `grid-dark-by-turn-N`,
`grid-never-contested` and `grid-never-restored` are all silent on both sets.
No enemy can delete a span, so the worst case is a floor that is dark until
somebody spends an action, which is the whole cut/destroy split working.

**The honest note: the shipped roster cannot play the grid.** The party is
`data/units/`'s campaign roster at authored levels, and those seven units were
written before these seven abilities existed, so Vale has no Overdraw and
Marek no cutters — the 70.8% above is a fight the *enemy* plays on a graph
while the party plays it as a floor. The verbs are on the jobs' learnable
lists, so a real player buys them; the sim cannot, and arming the roster in
`data/units/` would move the golden replays. Measured as an instrument arm
with Vale, Marek and Ivo given their own kit and nothing else changed
(§7.8.8): **58.3% primary / 75.0% alt**, still in band, with the party
tripping the bus 27 times across 48 runs and reclosing 5, and the crew
reclosing and splicing back on both sets. That is the tug-of-war running in
both directions, and it is the reading to trust once the progression loop has
had a chapter to work.

**Standing: 250, raised from 150.** "A real player buys them" was not true as
shipped, and acceptance finding 15 said so: `works-skirmishes` is **one**
encounter long, `startingStandingBonus` is banked per unit into that unit's own
job at campaign creation, and at 150 not one grid verb on the roster's job
lists was inside the balance before the only battle — the cheapest are Reclose,
Field Splice and Throw the Breaker at 250 apiece, and Vale already knows the
last of them. 250 is the price of the cheapest one and no more: it buys **Vale
one Reclose, or Ivo Brace one Field Splice**, and no other grid verb on any of
the seven comes into reach — Marek's Cut the Feed is 350, Cross-Tie and Reroute
are 400, Overdraw is 700. The number is deliberately the
exact price rather than a comfortable margin — the skirmish's job is to let the
party touch the grid once, not to open a shop before a tutorial-adjacent
fight — and it leaves the chapter's own 150 untouched, since
`foundry-chapter` has five battles to earn in. `tests/data/meterHouse.test.ts`
pins both the number and what it buys, derived from the ability effects rather
than a hand-kept list.

The open flags are severity 3 and every one of them is the design working:
`the-west-feeder-goes` never fires on the primary set and `the-east-feeder-goes`
never fires on the alt, because destroying a feeder is the expensive permanent
verb and almost nobody buys it when a cut or a thrown isolator is on the table.

**Re-read after the acceptance fixes: 70.8% on both seed sets, unchanged.**
Mean 95.5 and 96.3 unit turns, 3.5 and 3.3 of 6 lost, no stalemates, and the
grid contested on both — 4 player and 22–28 crew tie throws, 28–46 player and
127–144 crew isolator writes. The economy (Standing 150 → 250) and the
targeting legality layer both moved and neither moved the number, which is the
expected result and the reason it was measured rather than assumed: the sim
plays the roster at authored levels and cannot spend Standing, and the
legality layer only removes orders that already did nothing.

The primary set now carries **three** severity-3 flags rather than one, and the
two new ones are the turn-24 gate doing its job: on that set nobody ever takes
the west main out, so `the-west-main-goes-out` never latches and
`the-house-comes-back` never fires. Before the gate the rung fired on all 24 of
those runs and announced a restore of a state the house had never left. A flag
that says "the house was never put in the dark, so the house never came back"
is the readout being honest.

### A design consideration the acceptance play turned up

**Killing load can make the trip arithmetically impossible, and nothing on the
board used to say so.** The player's own permanent verbs work on sinks as
readily as on sources: wreck the sump run and its pump and apron lamp go with
it, and the east half falls from 10 of 14 to 4 of 14. An Overdraw of +8 then
lands at 12 against 14 and does not trip, and a player who had been setting up
that exact trip has spent an action making his own plan impossible — by
*winning* a fight against the machinery.

That is a real consequence of the model and not a bug: load is what a component
draws, and destroying a draw is a legitimate way to relieve a bus (it is the
defender's own shed-a-load counterplay, done permanently and by the attacker).
What was wrong is that it was invisible. The per-component register is the
partial mitigation and it is a good one: the east half's LOAD line now reads
`4/14` the instant the pump dies, in copper rather than at its rating, so the
arithmetic that just changed is on screen at the moment it changes and the
Overdraw that will no longer trip is visibly no longer worth casting. **A dead
component's LOAD line disappearing is the same explanation in its strongest
form** — nothing feeds this, so there is nothing left to read against.

What the register still cannot say is *"this used to be trippable and is not
any more"*, because the register has no memory. If that turns out to matter in
play, the honest fix is an annunciator line on the load falling rather than a
second readout — the strip already speaks whenever the grid moves, and it now
keeps a scrollback so a line about the load is not eaten by the line about the
wreck. Recorded rather than built: one acceptance play is not evidence that a
player needs to be told twice.

**Acceptance finding 12, closed by the register rather than by content.** The
tie's arithmetic — 10 of 14 a side, 20 of 28 joined — used to exist only in
`on-the-landing`, an optional once-trigger fired by walking onto the landing. A
player who never went up there never met the numbers the whole map is about.
With the load line per component those numbers are now permanently on screen
and correct at every moment: two lines at `10/14` with the tie open, one at
`20/28` with it closed, and the sergeant's line on the landing is the
explanation of a readout the player has been looking at rather than the only
place it appears. Verified in `tests/data/meterHouse.test.ts`.

**Mid-battle save/load does not exist, by design.** The save envelope is a
`CampaignState` — roster, progress, inventory, fallen, encounter index — and it
is written between battles, never during one. A battle is initial state plus a
command log (`docs/ARCHITECTURE.md`), so a resumable battle is a replay format
question and not a save-format one, and the between-battle Save and Load
buttons file the campaign rather than the field. An engagement is entered and
finished. Recorded here because a player who reaches for Save mid-fight will
not find it, and because the Meter House is long — 95-odd unit turns is the
longest engagement in the game.
