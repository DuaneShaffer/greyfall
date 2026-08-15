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

**Composition (6 enemies, L1–2; 4 deployed).**

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `provocateur-foreman` | provocateur | 2 | (9,1) | Tap deck. The merciful-win target; shock maul, no armor — the tell. |
| `torch-hand-gantry` | provocateur-torch | 2 | (6,4) | On `ladle-gantry` at height 4, per MAP_NOTES: teaches what the gantry is in one glance. Carries `bring-it-down` so the bay bridge is a live threat. |
| `provocateur-press` | provocateur | 1 | (2,8) | West press lane, beside `press-line-mid`. |
| `hand-perren` | combine-hand | 1 | (8,9) | Mid-aisle. Named — see the trigger map. |
| `hand-runner-east` | combine-runner | 1 | (14,9) | Ingot rail; `rail-dash` on the one rail lane. |
| `hand-machinist-gantry` | shop-machinist | 2 | (13,6) | Gantry walk east, covering `floor-nine-mains` at (13,10). |

Two provocateurs plus a torch-hand carry the fight; the three strikers are
chemist / railrunner / machinist — the three lowest basic-attack jobs in the
game (6, 13, 9 damage at L1). That asymmetry is deliberate: the people who
hurt you are the plants, and the people you hurt cannot fight back well.

**Win: `defeatUnit: provocateur-foreman`, then `rout`.** The merciful
alternative asked for. It is expressible because `winConditions` is an OR
list — break the man giving orders on the tap deck and the floor stands
down; you do not have to put down six foundry hands. It is not a cheap out:
the foreman is at (9,1), the far end of the map, behind the pour aisle and
the tap-deck lip. The thing the schema *cannot* say is "defeat all the
provocateurs" (see gap 4), so one ringleader stands in for the cell.

**Trigger map.**

| trigger | condition | beat |
|---|---|---|
| `south-doors` | `battleStart` | The Watch's order, Jory's warning that nobody shut the tap off, and the foreman giving a soldier's order in a foundry hand's voice ("let them come up under the ladle"). |
| `aisle-mouth` | player on (6,11)…(9,11) | MAP_NOTES' aisle-mouth tiles. A striker shouts a warning *at the Watch* before the ladle tips; Rowen tells the record to note it. First seeding of the Inquiry frame. |
| `bridge-in-the-bay` | `objectDestroyed: bay-bridge` | The east flank severed. Jory: "That wasn't us. We work here." |
| `mains-come-back` | `turnStart: 24` | MAP_NOTES' suggestion that the shutdown be a delay, not a solve: re-powers the three presses and the ladle. Phrased to read correctly whether or not the player ever cut them. |
| `perren-goes-down` | `unitDowned: hand-perren` | The one that should hurt. Jory names him; Rowen tells the sergeant to log the name; the sergeant answers "We log numbers, ma'am." |

**Difficulty.** Party L1–2, four deployed, six enemies. Playable straight,
but the intended solution is machinery: the press niches at x 1, the sluice
covering a withdrawal, and the mains as the strategic option. A party that
treats the floor as scenery should lose units.

---

## 3. Tallow Row — `e3-tallow-row`

**Dramatic function.** The turn of the chapter. The pursuit is procedural
until the player walks into a ground-floor room and finds House Corvane
requisition seals, unbroken, on the charges. Everything after this battle is
a different story than everything before it.

**Composition (6 + 2 reinforcements, L2 with an L3 leader; 5 deployed).**

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `wick` | **new** `wick` | 3 | (8,2) | Head of the Row, beside `gas-main-north` under the gallery stair — MAP_NOTES' pivot. |
| `torch-hand-east-room` | provocateur-torch | 2 | (11,8) | *Inside* the east-mid tenement, per MAP_NOTES: "they're in the house" must read immediately. |
| `torch-hand-south-room` | provocateur-torch | 2 | (3,13) | Inside the west-south tenement, above the player's deployment. |
| `cell-machinist` | shop-machinist | 2 | (8,10) | Behind `refuse-barricade`, holding the mid chokepoint. |
| `provocateur-barricade` | provocateur | 2 | (6,10) | The other side of the squeeze. |
| `provocateur-tram` | provocateur | 2 | (14,8) | Tram lane, near `gas-main-alley` — the Railrunner's dilemma has a defender. |
| `provocateur-gutter` / `torch-hand-gutter` | provocateur / provocateur-torch | 2 | spawn (1,11) / (1,8) | Reinforcements down the west gutter when the player commits to the barricade. |

Both torch-hands carry `gas-line-tap`, which turns the risers and mains into
their weapon as much as the player's — the mutual-threat reading MAP_NOTES
asks for. Wick carries the full demolition kit including `bring-it-down`, so
he can open his own routes through frontages.

**Win: `defeatUnit: wick`, then `rout`.** MAP_NOTES wanted "if a named
saboteur stands on the gallery stair landing, they got away" — that is not
expressible (gap 2), so the pursuit is expressed as taking the man rather
than as failing to. His escape intent is carried by trigger, not by rules.

**Trigger map.**

| trigger | condition | beat |
|---|---|---|
| `foot-of-the-row` | `battleStart` | The writ; Rowen's rules of engagement; Wick's warning that the gas is live under the whole street. |
| `barricade-stand` | player anywhere on the mid cross-alley (y 11, both alleys and both street columns) | The chokepoint stand + `spawnUnits` of two from the west gutter. Widened from MAP_NOTES' four street tiles because (7,11)–(8,11) *are* the barricade and because the west alley and the tram are legal bypasses. |
| `requisition-seals` | player on (3,3),(4,3),(3,4),(4,4) | **The chapter's turn.** MAP_NOTES' "cleanest" room. Corvane Freight stencils, unbroken seals, Wick's "we've been carrying your name up this street for a month", and the sergeant's "that is a paperwork matter." |
| `main-at-the-stair` | `objectDestroyed: gas-main-north` | The head of the Row alight. Gallows wit — "somebody's supper, that." |
| `wick-breaks-for-the-stair` | `unitHpBelowPercent: wick 40` | He announces the stair. No move action exists, so the withdrawal is intent plus Rowen's counter-order. |
| `wick-down` | `unitDowned: wick` | No name to give — a docket, a yard, and a man who never comes down to the yard. Rowen takes the evidence out of procedure and into her coat. |

**Difficulty.** Party L2, five deployed, eight enemies across the battle. The
count is high because the map is a maze of walls and half of it is a
one-tile doorway at a time; the enemy is never all in contact. Expect the
player to blow a frontage rather than walk 8 rough tiles — that trade *is*
the battle.

---

## 4. Corvane Refinery Three — `e4-refinery-three`

**Dramatic function.** The engineered catastrophe, and the discovery that
the Assay will watch it happen and file it correctly. The bible is explicit
that Rowen fails to fully stop it, so the design problem was making the
scripted disaster *not* a loss.

**Composition (7 enemies, L2–3; 5 deployed).** Conduit-heavy, per the map's
showcase, plus the Watch units who are the frame-up's executors.

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `nessa-kiln` | **new** `nessa-kiln` | 3 | (7,2) | Control gallery, one tile from `switchboard-main`. MAP_NOTES: put the overload character where the plot is. |
| `watch-enforcer-gallery` | watch-enforcer | 2 | (6,2) | The gallery is a win condition; it needs a door. |
| `watch-conduit-ring` | watch-conduit | 2 | (9,6) | On `tower-walk-north` at height 4, with `overload-cell`. |
| `watch-conduit-terrace` | watch-conduit | 2 | (8,12) | South terrace, in the cascade band — see below. |
| `watch-enforcer-west-ramp` | watch-enforcer | 2 | (5,8) | Terrace lip covering the west ramp. |
| `watch-enforcer-east-ramp` | watch-enforcer | 2 | (13,8) | East ramp. |
| `watch-sergeant-floor` | watch-sergeant | 3 | (10,12) | South terrace with `kettle` — punishes the obvious approach. |

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

**Win: `reachTiles` on the switchboard, or `defeatUnit: nessa-kiln`.** This
is "stop what can be stopped": get a unit onto the control gallery and cut
the grid, or take the engineer. Neither prevents the midpoint — it has
already fired by the time either is achievable — so the scripted catastrophe
is scenery for the win, not a failure state. Loss is `partyRout` only; a
`turnLimit` loss would have contradicted the bible by making the failure the
player's.

**Other triggers.** `under-measurement` (`battleStart`) establishes Quill's
neutrality and Nessa's licence; `on-the-ring` fires when a player unit takes
the tower walk; `at-the-switchboard` puts the filing question to Nessa on the
gallery floor (6,2)…(9,2); `the-licence-does-not-carry-her`
(`unitHpBelowPercent: nessa-kiln 40`) is Quill dropping her — *"The Sodality
licenses attunement. It has never licensed conduct."*

**Difficulty.** Party L2–3, five deployed, seven enemies, but the real
opponent is the circuit. Expect the second half to be fought without the
hoists. A party with no Conduit and no Jump-2 answer will be locked off the
ring entirely, which is the correct punishment on this map.

---

## 5. The Charterhouse Steps — `e5-charterhouse-steps`

**Dramatic function.** The confrontation. Rowen wins the field and loses
everything else. Aldric does not deny it — that is the beat, and it lands on
terrace two rather than at the top, because a man who is not ashamed does not
wait to be cornered.

**Composition (6 + 2 reinforcements, all L3; 5 deployed).** Defender-favoring
by placement, per MAP_NOTES: a screen on terrace one, the body on terrace
two behind the planters, the command group on terrace three behind the
balustrades.

| id | template | Lv | tile | why there |
|---|---|---|---|---|
| `aldric` | **new** `aldric` | 3 | (8,7) | MAP_NOTES' boss tile: height 6, commands both flank stair heads and the grand stair's exit, `founders-plinth` at his back. |
| `watch-sergeant-steps` | watch-sergeant | 3 | (6,7) | Terrace three, the other side of the plinth. `kettle` on a funnel map. |
| `watch-conduit-upper` | watch-conduit | 3 | (9,7) | Carries `flare` — the only long reach on a map with almost no flux. |
| `watch-enforcer-mid-west` | watch-enforcer | 3 | (5,10) | Terrace two behind the planters. |
| `watch-enforcer-mid-east` | watch-enforcer | 3 | (10,10) | Terrace two, mirror. |
| `watch-enforcer-screen` | watch-enforcer | 3 | (7,13) | The terrace-one screen. Expected to die; its job is one turn. |
| `watch-enforcer-court-west` / `watch-conduit-court` | watch-enforcer / watch-conduit | 3 | spawn (6,2) / (9,2) | The reserve, on the upper court between the two lamp standards. |

**Win: `defeatUnit: aldric`. Loss: `partyRout` *and* `unitDowned: rowen`.**
The finale is the one battle where losing Rowen is losing, and the bible's
permadeath rule makes that literal.

**Trigger map.** MAP_NOTES' terrace lips as phase lines, one `once: true`
dialogue each, which paces the climb without any extra map machinery.

| trigger | condition | beat |
|---|---|---|
| `the-steps-are-closed` | `battleStart` | `setPower: service-lift → off` — the Watch shutting the tradesmen's entrance, exactly as MAP_NOTES suggested, so the west bypass has to be taken rather than given. Aldric lets her climb on purpose. |
| `terrace-one` | player on y 13 | The screen falls back; Aldric orders her heard before she is stopped. |
| `terrace-two-the-proof` | player on y 10 | **The bible beat.** Rowen names the seals and the docket. Aldric: *"Yes."* Then the reason — a seam claim, the Combine had to be made a danger — and *"Where a thing is signed is not where it happens. That is the whole use of signing."* |
| `aldric-to-the-court` | `unitHpBelowPercent: aldric 55` | The withdrawal MAP_NOTES designed. **There is no unit-move action** (gap 1), so his move from (8,7) to (8,4) is dialogue — "up to the court, reserve to the lamp line" — plus `spawnUnits` putting two elites on the upper court between the two lamp standards. The second act happens on the upper terrace because the reinforcements are there, not because Aldric relocated. |
| `the-top-step` | player on y 4 | Nothing further up; Rowen refuses to make a speech and keeps the docket instead. |
| `the-record-closes` | `unitDowned: aldric` | The erasure. Aldric: *"You will not be in the record, Rowen. You will be in the refinery."* Quill files the Inquiry's finding that she died at Refinery Three. Rowen: *"Then I go down by the tradesmen's lift."* — the desertion, and a callback to the lift the Watch cut in the opening line. |

The closing dialogue depends on `settle()` running `evaluateTriggers` before
`evaluateOutcome` (`src/core/commands/apply.ts:130–131`). That ordering is
load-bearing for every "closing dialogue on win" in the slice and is not
asserted by any test.

**Difficulty.** Party L3, five deployed, eight enemies, every one of them a
level above or equal and standing uphill. This is the hardest fight in the
slice by intent — but see the warning below, because it is also where
`CONTENT_NOTES` §6's flagged scaling problem bites hardest.

> Aldric at L3 with `riot-drill`, `watch-cuirass`, `visored-helm` and
> `breach-shield` reads ~131 HP and ~26 evade, which is a proper boss. His
> basic attack with `compliance-maul` and `counterweight-belt` reads ~93
> damage, which one-shots a level-3 Conduit (~51 HP) and two-shots everything
> else. The finale is not fairly tunable from the content side; it needs the
> `src/core` fix CONTENT_NOTES §6 asks for (level-scaled
> `WEAPON_DAMAGE_DIVISOR`, a higher `STAT_BASE.hp`, or a non-zero `phys`
> base). Flagged rather than papered over with a lower boss level, because a
> level-1 Aldric would be wrong in every other way.

---

## Trigger-vocabulary gaps

Reported, not worked around. Nothing below was faked with a wrong mechanic.

> **Closed by the engine-amendment pass (2026-08-15):** gaps **1**
> (`moveUnit` / `removeUnit` trigger actions), **2**
> (`unitReachesTiles` loss condition), **3** (`turnStart` is now
> reaches-or-passes), **4** (`all` win-condition groups), **5** (`neutral` is
> genuinely non-combatant), and **9** (the trigger-before-outcome contract is
> documented in `COMBAT_RULES` §15 and asserted by a test).
>
> **Nothing was wired into an encounter.** The vocabulary exists; e1–e5 are
> untouched. The content pass owns: Aldric's withdrawal in e5, the saboteur's
> bolt for the stair in e3, the gallery-stair escape loss in e3, e4's midpoint
> (which can drop its widened-tile workaround for a real `turnStart`), e2's
> merciful "put down the provocateurs" objective as an `all` group, and placing
> Jory, Quill, and Maren as neutrals.
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

## Desired e1 polish (not applied — `e1-marshaling-yard.json` is replayed by core tests)

For the orchestrator to schedule alongside whatever test churn it implies.

1. **The provocateurs are singular and never fire first.** Bible §8.1 is
   "break up a blockade that turns violent when provocateurs fire first",
   but e1 has one enemy and no beat staging the first shot. Wanted: a second
   provocateur so the noun is plural, and a `battleStart` or early
   `unitEntersTiles` beat in which the shot is fired *from behind the
   Combine line*. That is the whole premise of the chapter and it is
   currently only asserted in Maren's opening line.
2. **`rout` with one enemy is a one-kill win.** Fine as a tutorial, but it
   means the tutorial never teaches that a win condition is a thing you read.
3. **The Railrunner showcase has no script.** `yard-switch` and
   `freight-lift` are the map's teaching objects and no trigger acknowledges
   either being used. An `objectDestroyed` / `unitEntersTiles` line on the
   lift deck would teach the systems pillar in the battle designed to teach
   it.
4. **Maren Voss speaks but is not present** — the same non-combatant gap as
   gap 5 above. Worth revisiting for all three of Maren, Jory, and Quill in
   one pass once the flag exists.
5. **Consider `unitDowned: rowen` as a second loss condition**, establishing
   the permadeath rule (bible §5.4) at battle 1 rather than battle 5. This is
   a design call, not a defect.
6. Seed `1001` and the deliberately armor-less provocateur are both correct;
   leave them.
