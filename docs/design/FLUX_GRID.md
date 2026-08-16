# Networked Flux Infrastructure — the Flux Grid

Design record for the first post-slice mechanic: power as a graph rather than a
per-object flag, and the Conduit's deferred kit built on it.

Governing docs. `docs/CREATIVE_BIBLE.md` §5 (rules of magic) is binding on every
ability here and is cited inline; §6 defines the Conduit fantasy this mechanic
completes. `docs/ARCHITECTURE.md` (commands in / events out, determinism, data
is content) governs how it may be built. `docs/COMBAT_RULES.md` §13a, §14 and
§17 own the semantics this amends. `docs/PROJECT_BREAKDOWN.md` records the
deferral ("networked infrastructure — power grids as graphs — the first
post-slice mechanic, and Conduit's full kit").

**Binding:** the grid model (§1), the degeneracy rule (§1.6), the legibility
contract (§2.5), the schema deltas (§7), the v1 cut line (§8), and the
determinism rules in §6.
**Suggestive:** ability names and every number in §3, the four encounter
sketches in §4, the authoring conventions in §1.7. Those are starting points for
the content and balance passes, not law.

---

## 0. The problem this solves, and the one it must not create

The slice ships power as a boolean per object. It works, and §7.8.5 of
`docs/BALANCE_REPORT.md` measured what it is worth: on Foundry Floor Nine the
mains carry 81–86% of every machine operation in the level, because one flag on
one switch is the only strategic move the map affords. The tug-of-war that
section documents — cut, restore, cut again — is a *simulation* of a network
built out of five scripted triggers, because the vocabulary to express a network
does not exist.

The failure mode this mechanic must not reproduce is the other half of the same
addendum. e2's press windows are **sim-visible and player-invisible**: the search
reads an `operable` payload against whoever is standing in the bed the instant
they stand there, and a first-time player cannot get that off the board. A grid
multiplies the state a player has to hold — sources, spans, ties, headroom — and
if that state is not on screen it is not a mechanic, it is a puzzle the AI
solves and the player loses to.

So the legibility work in §2.5 is not polish appended to the design. It is a
binding half of it, and §8 puts it inside v1.

---

## 1. The grid model

### 1.1 Nodes are objects; edges are authored

A **grid** is a named graph declared on the map beside the object list. Its
nodes each name exactly one existing map object; its edges name pairs of nodes.

Two decisions, both deliberate:

**Edges are authored, never derived from footprint adjacency.** A derived
topology would mean a Saboteur deleting an unrelated wall silently rewires the
floor, and authoring a bus would become an exercise in nudging tiles until the
adjacency came out right. Explicit edges are diffable, testable, and readable in
the map file. This is `ARCHITECTURE.md` §4's "data is content" applied to
topology.

**Everything physically attackable is a node, so an edge carries no state of its
own.** The alternative — edges with hit points — needs a second destruction
rule, a second repair rule, and a second thing for the renderer to draw. Instead
a cable run that can be cut is authored as a `line` node with a footprint and
hit points like any other object, and cutting it removes a *node*. One
destruction rule, one connectivity pass. Authoring granularity is the designer's
lever: a bus that should be severable in three places is three line nodes.

### 1.2 The four roles

| role | is | extra data |
|---|---|---|
| `source` | a flux main, a plant feed, a racked cell bank, a flux cart | `capacity` |
| `line` | the map geometry that carries: cable runs, bus bars, conduit trays, live rail, feed pipe | — |
| `sink` | what consumes: presses, lifts, hoists, turrets, lamps, hazard emitters | `draw` |
| `breaker` | an isolator, a mains switch, a tie switch | — |

Roles are about *conduction*, not about what the object looks like. A lift is a
sink because it draws; a switchboard is a breaker because closing it joins two
spans. An object may hold only one role, and only one grid.

### 1.3 The one input flag, and the one derived one

The single most important simplification in this design: **`MapObject.powered`
keeps its field, its type, and its mutability, and is re-read as the node's own
isolator — "this node's switch is closed".** Everything that writes power today
(`setPower` from an effect, `setPower` from a trigger, `Ground`, `Rig
Machinery`, `Throw the Breaker`, an `operable` payload) keeps writing exactly
that, unchanged.

What becomes derived is **energization**: whether the node is actually being
fed. Nothing authored writes it; it falls out of the graph. A normally-open tie
is authored as `powered: false` on the tie switch, which is the existing flag
already saying the right thing.

Every rule that today reads `powered` reads **energized** instead:

- `operable.requiresPower` (COMBAT_RULES §14)
- `surfaceHeight` provision — a lift deck stands only while energized (§11)
- `adjacentPoweredObject` and `targetPowered` (§13a)
- the `object-unpowered` command refusal
- the POWER register, the renderer's lit state, the sim's `turnsWithPoweredMachine`

**No requirement is renamed.** `adjacentPoweredObject` and `targetPowered` are
already the right words for the derived value; renaming them would churn shipped
JSON to say the same thing.

### 1.4 Energization

Per grid, on every mutation:

```
conducts(n) = !destroyed(n.object)
           && n.object.powered            // isolator closed
           && !n.severed
           && !(n.role === "source" && n.tripped)

components = connected components of { n : conducts(n) } over the edge list

for each component C, in ascending order of its lowest node id:
    capacity(C) = Σ capacity of sources in C
    load(C)     = Σ draw of sinks in C  +  Σ timed loads attached to nodes in C
    capacity(C) === 0        -> every node in C is dead
    load(C) > capacity(C)    -> trip every source in C (latching); recompute
    otherwise                -> every node in C is live
```

The loop repeats while any source tripped, bounded at `sources.length + 1`
passes — after a trip that component's capacity is zero, so it cannot trip
twice. The bound is asserted in tests, not assumed.

`energized(object) = live(node(object))` for a networked object.

### 1.5 Three decisions inside that

**The trip is total, and it latches.** An overloaded component does not shed load
by priority; the main blows and the whole component goes dark, and it stays dark
until someone recloses it. Load-shedding is more faithful and is a legibility
disaster — the player would have to know the shed order to predict which lamp
went out. A total trip reads off the board in one glance and matches the fiction
exactly. Latching matters twice over: it makes overdraw a real tempo attack
(the reset costs the defender an action) and it removes any possibility of a
recompute oscillating, since an auto-reset would re-trip on the same pass.

**Sinks draw whenever they are energized, not when they are operated.** A load
that moves every time a press fires makes the readout unpredictable turn to
turn, and the whole point of the readout is that the player can see the trip
coming before spending a turn on it. So the load bar moves only when somebody
acts on the grid. Deliberate simplification, recorded here so a later pass
changes it on purpose.

**Load is a flat authored integer and is never Attunement-scaled.** Every other
magnitude in the game runs through the `Amount` pipeline (COMBAT_RULES §4); load
does not. A player reading `LOAD 11/12` must be able to conclude "Overdraw is +8,
that trips it" without computing the caster's Mag first. Legibility beats
fidelity here, and the fiction survives: the Conduit is opening a shunt on
someone else's main, and the main's rating is the main's.

### 1.6 The degeneracy rule (binding)

**An object with no `network`, or with a `network` naming no declared grid,
behaves exactly as it does today.** Formally it is a one-node grid whose node is
simultaneously a source of capacity 0 and a sink of draw 0, joined to nothing:
`conducts` reduces to `powered && !destroyed`, `load (0) <= capacity (0)` never
trips, and `energized === powered`. There is no special case in the code and no
special case in the schema — the general rule produces today's semantics on a
single node.

Consequences, all of which are the acceptance criteria for the engine change:

- The five slice maps declare no grids, so **every golden replay for e1–e5 must
  reproduce byte for byte.** A grid change that moves a slice number is a bug in
  the change, not a rebalance.
- `refinery-three.json` already tags 12 objects `network: "refinery-three-grid"`
  (MAP_NOTES §4) against a grid nobody declares. Under this rule those tags stay
  **inert** and correct, and become a ready-made authoring hint for whoever
  migrates e4 later. The content test therefore warns on an unresolved `network`
  and does not fail on one; it tightens to a hard failure only once a shipped map
  declares a grid. (e4 is under concurrent edit and is not touched by this
  document.)
- The v1 engine ships with **no slice map migrated**. See §8.

### 1.7 Authoring conventions (suggestive)

Numbers for the first grid-native map to start from, not law:

- A grid is 8–24 nodes. The schema caps it at 32 nodes / 64 edges, which is well
  above anything an FFT-scale map wants and keeps §6's perf claim trivially true.
- Sinks draw **2–6**; a press or a hoist is 4, a lamp standard is 2, a
  hazard emitter is 3.
- Sources supply **10–16**. A contested bus should run at **70–85% of
  capacity** — enough headroom that shedding one machine saves it, not enough
  that a second machine is free.
- With Overdraw at +8 (§3), that convention means: an overdraw trips a bus
  nobody has prepared, and does not trip one where the defender has already shed
  a load or closed a tie to a second main. That is the intended decision, and it
  is the reason those two numbers are quoted together.
- Every grid has at least one **tie** (a normally-open breaker joining two
  components) and at least one **reclose point** reachable from both approaches.
  This is MAP_NOTES' existing rule for operables — "a hazard only the defender
  can fire is a trap, not a system" — restated for topology.

### 1.8 Cut, destroy, reroute — the state table

| event | node state | reversible by | permanence |
|---|---|---|---|
| isolator thrown | `powered` false | throwing it back | any time, either side |
| line cut | `severed` true | a splice | any time |
| breaker/tie opened | `powered` false | closing it | any time |
| source tripped | `tripped` true | a reclose | any time |
| object destroyed | out of the graph | nothing | permanent |

The **cut/destroy split is the design's answer to permanence**. A cut is cheap,
fast and reversible: it buys turns. A demolition is expensive and forever: it
changes the map. `repairObject` does not resurrect a destroyed object
(COMBAT_RULES §14) and this design does not ask it to — that rule stays intact,
and the reversible verb gets its own state instead. e2's lesson is the direct
precedent: an enemy who could delete the presses deleted the thesis
(BALANCE_REPORT §7.8.3), so the *routine* grid verb must be the reversible one
and the permanent one must stay expensive.

---

## 2. Play verbs

No new **command kinds**. Every grid verb is an existing `act` or
`activateObject`, which means player/AI parity, the replay format, and the save
envelope's command log are all untouched, and the AI's candidate *generator*
needs no change at all (§5).

### 2.1 Throw — anyone, at the switch

Unchanged from the slice. `activateObject` on a breaker, or `setPower` from an
ability at range. Under a grid it stops being a flag flip and becomes a topology
edit: opening the mains switch drops every sink downstream of it in one action.

*Counterplay:* it is the same toggle from the other side, and MAP_NOTES' siting
rule guarantees both approaches can reach it.
*Legibility:* the POWER register rows flip together, and the annunciator names
the cause (§2.5).

### 2.2 Cut — the Saboteur

`act` with an ability carrying the new `severLine` effect, aimed at a `line`
node. Sets `severed`; everything the span was the only path to goes dark.

The Saboteur already owns permanence (`bring-it-down`, 28 object damage). Cut is
the surgical version and is the job's grid verb precisely because it is *not*
the Conduit's: the Saboteur has no license and no attunement, he has cutters.
Consistent with CONTENT_NOTES' rule that Saboteur damage is never `mag`.

*Counterplay:* a splice, a tie to a second source, or reaching the Saboteur.
Authored redundancy is what keeps a cut from being a win button — the same
constraint MAP_NOTES already puts on demolition ("no destructible object is ever
the sole route to anywhere"), restated for power.
*Legibility:* the span draws severed and sparking; the register row reads **CUT**
rather than DEAD, so the player can tell a cut from a thrown switch and knows
which verb answers it.

### 2.3 Splice and reroute — the Machinist

Two abilities, one effect each:

- **Splice** — `severLine` in `splice` mode on a cut span. The direct undo, and
  the Machinist's grid analogue of Field Repair (which by bible §6 heals
  machines, not people).
- **Reroute** — `setPower` on a breaker at range: close an authored tie, or open
  one to split the bus.

**Reroute closes an authored tie; it does not draw new cable.** Free-hand
player-created edges were considered and cut. They would make topology dynamic
(so nothing about connectivity could be reasoned about from the map file), they
would need a targeting model for "connect these two things" that no other
ability in the game has, and they would make the AI's hypothetical recompute
(§5) unbounded. Authored ties are what a real operator does anyway: the
redundancy is designed in and the job is finding it. The map tells you where the
ties are, and the register shows them.

*Counterplay:* a tie is a breaker like any other and can be opened back, or cut,
or destroyed.
*Legibility:* the register lists ties as their own rows (**TIE OPEN** / **TIE
CLOSED**) rather than folding them into machines, because a tie is the piece of
grid state a player is most likely to need and least likely to guess.

### 2.4 Overdraw and overload — the Conduit

This is where the Conduit becomes the grid job (bible §6). The new `addLoad`
effect attaches a timed draw to a node; the recompute that follows either
absorbs it or trips the component.

The bible's first rule of magic (§5.1, binding — "no caster creates energy;
every magical effect draws from a source") is not merely satisfied here, it is
the mechanic. Overdraw makes nothing. She opens somebody else's main past its
rating and the main's own protection does the rest. §5.2 comes out the same way:
attunement is a valve, and a valve on a dead line is a valve.

*Counterplay*, four of them, which is what makes this a play verb rather than a
button: reclose the trip (an action, and the enemy Conduit's Reclose is as cheap
as yours); shed a load with an isolator so the bus fits under capacity again;
close a tie to bring a second source's capacity onto the bus; or reach the
Conduit before the timed load lands.
*Legibility:* §2.5, and it is the whole reason §2.5 is binding.

### 2.5 The legibility contract (binding)

**Every grid state change is visible without hovering anything, and every
energization change names its cause.**

Three parts.

**(a) The POWER register grows a load line and a cause column.** UI_DESIGN §6
already puts the register under the turn queue as a quiet ledger, one row per
machine something on the map can switch. It gains a section header per network:

```
POWER
 REFINERY THREE GRID              LOAD 14/12   TRIPPED
   west main                      OPEN
   east main                      LIVE
   north bus                      CUT
   tie, gallery                   TIE OPEN
   charge hoist west              DEAD
   charge hoist east              LIVE
 SERVICE LIFT                     LIVE
```

Rules: one section per grid, sections in grid-id order then ungridded objects;
within a section, sources, then breakers and ties, then lines, then sinks, each
in object-id order (COMBAT_RULES §17's ordering discipline applies to the
readout too, so the register never reshuffles under the player's eye). Right
column is exactly one of LIVE / DEAD / OPEN / CUT / TRIPPED / TIE OPEN / TIE
CLOSED. Maps with no switchable power still draw no register.

**The load line is the single most important addition in this document.** It is
what makes the trip a decision the player can plan instead of a surprise they
absorb. `LOAD load/capacity` per network, in copper at rest, `overload-500` at
90% or above, `blood-300` above 100%. That respects UI_DESIGN §5's scarcity
rule literally: amber still appears in exactly three places, copper is still
reserved for machinery, and `overload-500` is already the colour of "flux-borne"
state, which is precisely what a bus at its rating is.

**(b) The annunciator names the cause.** UI_DESIGN §8 already requires that
"power that changes without the player throwing anything is announced the same
way, naming the switch that carries it". Extend it: every energization change
carries a cause node and a reason, and the line names both.

> *"North Bus cut. 4 machines dark. Splice it or take the gallery tie."*
> *"Refinery main tripped — 14 against a rating of 12. Someone has to reclose it."*

That second clause is the e2 lesson operationalized. The register tells the
player the state; the annunciator tells them the *verb that answers it*. A
mechanic whose counterplay has to be inferred is a mechanic that measures well
and plays badly.

**(c) Aiming a grid ability highlights the component it would change.** When a
grid ability is staged, the tiles of every node whose energization the order
would flip are marked, in the same overlay the area highlight already uses. This
is the piece that makes "cut the north bus" a legible choice rather than a
guess, and it is a pure function of the same recompute the rules run — no second
model of the graph anywhere.

---

## 3. The Conduit's full kit

The eight abilities the Conduit ships with (CONTENT_NOTES §"Conduit — the map is
the spellbook") **all stay, and none of their JSON changes.** Four of them gain
depth for free the day a grid exists, which is the strongest available argument
that the grid is the right shape for this game:

| existing ability | what it becomes on a grid |
|---|---|
| `throw-the-breaker` | `setPower toggle` at range 5 on any node's isolator — the *ranged isolate*, the shed-a-load answer to an overload, and the ranged tie-throw. It needed no change to become three abilities. |
| `ground` | its `setPower off` opens the target's isolator; on a source it drops the branch. Still the one verb that hits a machine, an Augmented and a reserve alike (bible §6). |
| `overload-cell` | `damageObject` on a **source** kills a main permanently. The permanent half of the cut/destroy split, priced at 5 flux and gated `targetPowered` — she can only shove a machine somebody is still running. |
| `tap-line` | `adjacentPoweredObject` now means *adjacent to something the grid is still feeding*, so blacking out the floor disarms the enemy Conduit as surely as the player's. Bible §5.2 becomes a tactical objective for both sides. |

Eight new abilities complete the kit. **Every number below is suggestive** — the
balance pass owns them; the shapes and the requirement gating are the design.

| # | ability | slot | flux / cast | effect | why it exists |
|---|---|---|---|---|---|
| 1 | **Overdraw** | action | 6 / instant | `addLoad +8` for 3 of her turns on the aimed node's component; requires `targetEnergized` | The signature. Trips a bus with no headroom; wasted on one with plenty. Instant because a cast on a grid move buys nothing — a bus does not walk out of the blast (the same argument that took the cast off `overload-cell`, BALANCE_REPORT G11). |
| 2 | **Cross-Tie** | action | 4 / instant | `setPower toggle`, range 4, requires `targetBreaker` | Bring a second main onto a dead branch, or split the bus and strand their half. The multi-source verb; the reason redundancy is playable rather than decorative. |
| 3 | **Reclose** | action | 2 / instant | clears `tripped` on the aimed source and closes its isolator; requires `targetSource` | The restore, and deliberately the cheapest thing in the kit. e2's finding is that a power switch has to be a **tug-of-war, not a switch** (ENCOUNTER_NOTES §2): if the restore costs more than the cut, the first cut ends the argument. |
| 4 | **Backfeed** | action | 0 / instant | self `modifyCharge +20`, plus `addLoad +6` for 2 turns on the node she is drawing from; requires `adjacentPoweredObject` | The greedy Tap Line. Answers "where does the power come from" (§5.1) with a number the player can see moving on the load bar, and can black out the floor she is standing on. §5.3: power costs something. |
| 5 | **Live Line** | action | 5 / instant | grants a temporary `onContact` arc payload to the aimed `line` node for 3 turns; requires `targetLine` + `targetEnergized` | Her area denial is shaped by the map's cable runs instead of by a radius — "the map is the spellbook" made literal. Counterplay is to cut the line she electrified, which is a satisfying inversion. **v2** (§8). |
| 6 | **Dead Short** | action | 8 / cast 30 | forces the aimed component's load past capacity immediately and deals arc damage to every unit standing on a node of it | The sacrificial overload: it blacks out *your* lifts too. The charged one, because this is the ability that should be interruptible. **v2** (§8). |
| 7 | **Rated Draw** | support | — | her `addLoad` amounts are 2 lower and her `modifyCharge` gifts add no load at all | The licensed Conduit draws cleanly (bible §4, the Assay licenses every Conduit). Turns overdraw pricing into a build decision instead of a constant. **Shipped as `gridLoadReduction: 2`** — the lighter draw only; the gift clause is expressed by Backfeed's +4 falling under the Meter House's rating rather than by a second field. |
| 8 | **Live Rig** | reaction (`damaged`) | — | arc damage to the attacker, only while she stands adjacent to an energized node | A reaction that is conditional on the map rather than on a roll is the reaction this job should have, and it gives the enemy a reason to cut her power before closing. **v2** (§8). |

A rejected ability, recorded so it is not re-proposed: a support passive that
revealed load and capacity in the register only for parties carrying a Conduit.
It is a lovely job identity and it fails §2.5 — a party without a Conduit would
be playing the mechanic blind, which is exactly the e2 failure with a different
cause. **The load readout is unconditional.**

---

## 4. Encounter design space

Four sketches, all **suggestive**. They are shape studies for what a graph
affords that a switch cannot; siting them in the campaign is the story and
encounter workstreams' call, and none of them names a canon location.

### 4.1 Two mains, one bus — redundancy

Two sources at opposite ends of a plant, a bus between them, and a normally-open
tie in the middle. Either main alone carries the bus at 90% of rating; both
together carry it comfortably.

The play: killing one main does nothing while the tie is closed. Killing one
main *and holding the tie open* blacks out half the floor. So the fight has two
objectives that only matter together, and the second one is a tile rather than a
body. A single-switch map cannot express "this is only worth doing if you also
do that", and that conjunction is the whole reason to build a graph.

### 4.2 The reserve blows the main — sacrificial overload

The party must black out a gallery to disable a Watch gun line that runs off the
grid, and the same grid runs the lift they came up on. Overdraw or Dead Short
trips it; the lift deck drops (COMBAT_RULES §11) and the way back closes.

The play: a cost the player pays with terrain instead of hit points, chosen
deliberately and legible in advance on the load bar. Pairs naturally with a
`surviveTurns` win rather than a rout.

### 4.3 Their kit runs on it — powering the enemy off

A Watch column escorting a **flux cart**: a source node on a destructible object
that the encounter's `moveUnit` triggers walk up the map. Their Augmented and
their sentry frames are sinks tethered to it.

The play: bible §6 states outright that "the Augmented runs on the same flux the
map does — Conduits can *Ground* them", and this is that sentence as a map. Cut
the tether, or take the cart, and their damage halves without a single point of
damage dealt to a unit. It also gives the enemy a reason to protect an object,
which is a defensive posture the AI has never had to hold.

### 4.4 Escort a live line

A pump keeping a flooded gallery drained, or a hoist bringing wounded out. The
party's win condition is that a named sink is energized at turn N; the enemy's
entire plan is severing the span that feeds it. Every cut is answerable, and
answering costs a turn.

The play: it inverts the mechanic's polarity. Every other sketch is about taking
power away; this one is about keeping it, which is the only shape that makes
splice and reclose the *primary* verbs rather than the undo. Needs the grid-state
trigger and win conditions in §7 — **v2**.

### 4.5 AI implications

**The candidate generator does not change.** The search already pairs every
reachable tile with every usable ability and with `activateObject` on every
operable machine within one tile (AI_DESIGN §"The search"), so grid abilities
enter the candidate list the day they exist. What is missing is only the value
function, which is the right place for it to be missing: rules and AI stay one
model.

Five valuation additions:

1. **`gridDenial`** — generalize the existing `machineDenial` term (added by
   BALANCE_REPORT G5 so `floor-nine-mains` would stop pricing at zero) from *one
   object* to *the component a move de-energizes*. Sum what every de-energized
   sink is worth in enemy hands, tapered as G5 already tapers: by how near our
   own people are to the tiles those machines cover, and by how far a hostile
   has to walk to work one.
2. **`deckLoss` over a component.** The existing lift/catwalk term — a deck that
   loses power drops the tile to terrain height, dragging a parked hostile back
   into range and stranding an ally — already exists per object. It now runs over
   every `surfaceHeight` sink in the component, in both directions, so blacking
   out a floor that strands your own squad prices negative.
3. **`gridRestore`** — the symmetric credit for reclose, splice and tie-close
   when *our* sinks or decks are dark. Without it the AI can cut and can never
   put anything back, and §3's tug-of-war never happens on the enemy side.
4. **`tripBonus` / headroom arithmetic.** The search must answer "does this
   `addLoad` actually trip it", and the answer is exact: run the same recompute
   on a hypothetical node-state vector. **No separate heuristic model of the
   grid.** V ≤ 32 makes this cheaper than one `forecast` call, and it is the only
   way to guarantee the AI and the rules never disagree about what a move does.
5. **`lineCut` / `sourceKill`** priced through (1) and (2) rather than as flat
   values, so cutting a redundant span correctly scores near zero.

Weights live in `src/core/ai/weights.ts` beside the rest; archetype selection
gains a **grid affinity** derived the way object affinity already is (a kit
carrying any grid effect gets it), scaling all five terms.

Two AI notes that are not weights:

- **AI_DESIGN's "requirements as a reason to move" deferral becomes
  load-bearing.** Today a gated ability is simply dropped where it cannot be
  used; the AI never walks onto a rail tile in order to use one. On a grid map an
  enemy Conduit whose `adjacentPoweredObject` just failed should walk to the
  nearest energized node. Recommend lifting the deferral **scoped to grid nodes
  only** — a single extra tile-value term for "stands beside something live if
  this unit's kit needs one" — rather than in general, which is a much larger
  change.
- **The e2 risk, inverted, is the thing to measure first.** A grid hands the
  search a cheap move with enormous denial value: one cut, six machines dark. The
  search will find it on turn one, every time, and delete the thesis exactly as
  `bring-it-down` deleted Floor Nine's presses (BALANCE_REPORT §7.8.3). The
  mitigation is authored (§1.7's mandatory tie and reclose point, both reachable
  from both approaches) and it is **measured, not assumed** — see §6.4.

---

## 5. Determinism and performance

### 5.1 Recompute

Called once per graph-mutating primitive — `setPower`, `severLine`, `addLoad`,
object destruction, a timed load expiring — in the effect order COMBAT_RULES §13
already fixes. Not batched to end-of-command: an ability that cuts a source and
then operates a machine must see a consistent world between its own effects.

It is a pure function of (graph, node states, object states) and it emits only
where energization actually flipped, so calling it redundantly is free of
observable consequence. That, plus idempotence, is what makes the "call it
everywhere" policy safe.

### 5.2 Cost

Grids are capped at 32 nodes and 64 edges. A recompute is one BFS, O(V+E), on
integers. Against `ARCHITECTURE.md` §3's "no precomputed static navgrids"
principle: **nothing about the grid is cached**, for the same reason nothing
about pathfinding is — the invalidation bugs cost more than the recompute ever
will. A decision on Foundry Floor Nine currently costs 3.2–5.1 ms (AI_DESIGN);
a grid recompute is sub-microsecond and does not appear in that budget.

For the AI, hypothetical recomputes follow AI_DESIGN's existing discipline:
computed **once per (ability, target node) pair per decision**, not once per
candidate tile, alongside the four things already hoisted out of the candidate
loop.

### 5.3 Ordering (binding)

Extending COMBAT_RULES §17:

- Grids iterate by grid id, ascending.
- Nodes by object id, ascending.
- Edges by `(a, b)` with each pair stored in ascending id order, then
  lexicographic on the pair.
- BFS visits neighbours in edge order as stored.
- Components are discovered by scanning nodes in id order.
- Timed loads by load id, ascending; a load expires by **the caster's own
  turns**, the clock `modifyStats` and statuses already use (§8, §13), and is
  removed immediately if its caster is downed — the same rule that cancels a
  charge in flight (§7).
- Capacity and load are integers. Nothing in the grid touches the `Amount`
  pipeline, so nothing in it can drift.

### 5.4 Events

`PowerChanged { objectId, powered }` **is retained and now reports the derived
value**, one per object whose energization flipped, in object-id order. Every
existing consumer — renderer, HUD, `BattleCounters.powerOn/powerOff`
(BALANCE_REPORT §7.8.6) — keeps working with no change. It gains an optional
`cause: { gridId, nodeId, reason }` where `reason` is one of `isolated`,
`cut`, `destroyed`, `tripped`, `restored`, so §2.5(b)'s annunciator has
something to name.

Granularity: **one network-level event plus the per-object batch.** The
network-level event answers "what happened" for the annunciator and the
counters; the per-object events answer "what do I animate" for the renderer.
Emitting only one or the other makes one of those two jobs guesswork.

| new event | when |
|---|---|
| `GridChanged { gridId, capacity, load, liveNodes, tripped }` | any recompute that changed anything; emitted **before** its `PowerChanged` batch |
| `GridTripped { gridId, capacity, load }` | a component's sources latch open |
| `GridReset { gridId, nodeId, unitId }` | a trip latch cleared |
| `LineSevered { objectId, unitId }` / `LineSpliced { objectId, unitId }` | the reversible cut and its undo |
| `LoadAttached { gridId, nodeId, amount, turns, unitId }` / `LoadExpired { loadId }` | overdraw on and off |

### 5.5 Save and replay

`GameState` gains `grids: GridRuntime[]`, sorted by grid id: per node
`{ objectId, severed, tripped }` and a sorted list of timed loads. Isolator
state is *not* duplicated there — it lives on `object.powered` where it already
does. The addition is a few dozen bytes and one envelope version bump.

A battle remains initial state plus a command log (ARCHITECTURE §"The core
loop"), because §2 adds no command kinds.

---

## 6. Testing plan

1. **`energize` unit tests**, fixture-driven, no engine: the single-node
   degeneracy; a two-source bus with the tie open and closed; a cut that isolates
   a branch and one that does not; an overload trip and its latch; the
   fixed-point loop terminating within `sources.length + 1` passes; a cut that
   drops capacity to zero without tripping anything.
2. **The degeneracy proof.** Golden replays for e1–e5 reproduce byte for byte.
   This is the release gate for the engine change, and it is checkable *before*
   any content is written because no slice map declares a grid.
3. **Content validation.** Every `network` resolves to a declared grid, or warns
   (§1.6); every node's `objectId` exists and is a real object; every node appears
   in exactly one grid; every edge endpoint is a declared node; no self-edges, no
   duplicate unordered pairs; every grid has at least one source; every networked
   object has `powered !== null`.
4. **Formula tests** in the COMBAT_RULES register: "Overdraw on a bus at 11 of
   12 trips it; on a bus at 4 of 12 it does not; with Rated Draw it does not trip
   the first one either." **Corrected in the build:** the third clause is
   unachievable at +8 with a −2 licence — 11 + 6 is still past 12 — and only
   holds for a reduction that leaves Overdraw not worth casting. It is tested at
   the §1.7 band the rest of this design uses instead: the bench bus carries 6 of
   12, +8 trips it, +6 sits exactly on the rating.
5. **Sim counters**, in the shape §7.8.6 established for `BattleCounters` — so a
   sweep and a one-off recheck read the same numbers:
   `gridTrips` and `gridResets` split by side; `linesCut` / `linesSpliced` split
   by side; `tiesThrown`; `turnsWithEnergizedMachine` beside the existing
   `turnsWithPoweredMachine`; and `meanHeadroomPercent` per network per battle.
6. **Three new `objectiveFindings` flags**, alongside `machinery-never-operated`
   and friends: **`grid-never-contested`** (no side ever changed grid state —
   the map has a graph and nobody plays it), **`grid-dark-by-turn-N`** (the grid
   went down early and stayed down — §4.5's inverted e2 risk, firing), and
   **`grid-never-restored`** (cuts happened, restores never did — the tug-of-war
   is one-way and the restore verb is mispriced).
7. **Acceptance:** a human plays the first grid map and, without being told, can
   answer three questions from the screen — what is dark, what made it dark, and
   what would put it back. That is the e2 acceptance failure written as a pass
   condition, and it is not substitutable by a win rate.

---

## 7. Schema deltas

Every delta is **additive**; every shipped `data/` file still validates
unchanged. Sketches, not implementations.

### 7.1 `src/data/schemas/map.ts` — the grid

```ts
export const GridNode = z.discriminatedUnion("role", [
  z.object({ role: z.literal("source"),  objectId: Id, capacity: z.int().positive() }),
  z.object({ role: z.literal("sink"),    objectId: Id, draw: z.int().nonnegative() }),
  z.object({ role: z.literal("line"),    objectId: Id }),
  z.object({ role: z.literal("breaker"), objectId: Id }),
]);

export const GridEdge = z.object({ a: Id, b: Id });   // undirected; a < b by convention

export const Grid = z.object({
  id: Id,
  name: z.string(),
  // Reserved so a steam/pressure network can join the union later without a
  // second graph implementation. Nothing reads it in v1.
  kind: z.literal("flux"),
  nodes: z.array(GridNode).min(1).max(32),
  edges: z.array(GridEdge).max(64),
});
// refinements: unique objectIds; every edge endpoint is a declared node;
// no self-edges; no duplicate unordered pairs; at least one source.

// GameMap gains:
grids: z.array(Grid).default([]),
```

Note there is **no `closed` field on a breaker**. A normally-open tie is
authored `powered: false` on the tie object, which is the existing flag already
saying exactly that. One input, one meaning.

### 7.2 `MapObject` — semantics only, no shape change

| field | change |
|---|---|
| `powered` | unchanged type and mutability; documented as the node's **isolator** state. Energization becomes derived. |
| `network` | already optional and already present; becomes meaningful. Must name a declared grid on the same map, and the object must appear as exactly one node of it. |

### 7.3 `src/data/schemas/effect.ts` — two new primitives (three with v2)

```ts
const AddLoadEffect = z.object({
  kind: z.literal("addLoad"),
  amount: z.int().positive(),       // flat; never Attunement-scaled (§1.5)
  durationTurns: z.int().positive(),// the caster's own turns (COMBAT_RULES §8)
});

const SeverLineEffect = z.object({
  kind: z.literal("severLine"),
  mode: z.enum(["sever", "splice"]),
});

// v2, for Live Line: grants a temporary onContact payload to an object.
const SetContactPayloadEffect = z.object({
  kind: z.literal("setContactPayload"),
  payload: ContactPayload,
  durationTurns: z.int().positive(),
});
```

All three route to **objects** in COMBAT_RULES §13's effect table, beside
`setPower` / `damageObject` / `repairObject`. `addLoad` and `severLine` join
`PAYLOAD_EFFECTS` (a map object may carry them); `setContactPayload` does not,
so a granted payload cannot grant another.

**No `setBreaker` effect.** `setPower` already writes the isolator, and a
breaker's isolator is the only state it has. Adding a synonym would mean two
effects the content author has to choose between for one outcome.

### 7.4 `src/data/schemas/ability.ts` — requirements

`AbilityRequirement` gains four flat members:

```
targetLine | targetSource | targetBreaker | targetEnergized
```

Considered and rejected: promoting `AbilityRequirement` from an enum to a
discriminated union so a parameterized `{ kind: "targetGridRole", role }` were
expressible. It is tidier and it forces a migration of every shipped ability
that carries `requires`, in exchange for expressing exactly what four enum
members express. Additive wins.

`adjacentPoweredObject` and `targetPowered` are **not renamed** (§1.3).

`SupportAbility.passive` gains one optional key for Rated Draw, added in the
content pass rather than here because it is the only thing in v1 that reaches
into an effect's magnitude:

```ts
gridLoadReduction: z.int().nonnegative(),   // subtracted from every addLoad, floored at 0
```

Optional like the rest of `passive`, so no shipped ability changed. It is a flat
integer for §1.5's reason — load must stay readable off the register without
computing anybody's Mag first.

### 7.5 `src/data/schemas/encounter.ts` — v2 only

| addition | kind |
|---|---|
| `{ kind: "gridTripped", gridId }` | trigger condition |
| `{ kind: "objectPowered", objectId, powered }` | trigger condition |
| `{ kind: "keepPowered", objectId, turns }` | win condition — §4.4's escort |
| `{ kind: "gridTripped", gridId }` | loss condition |

Deferred to v2 with the escort scenario that needs them; nothing in v1's cut
line depends on a grid-aware trigger.

### 7.6 Code-side (not schema, listed for completeness)

- `GameState.grids: GridRuntime[]` and one envelope version bump (§5.5).
- Six new `BattleEvent` variants and an optional `cause` on `PowerChanged` (§5.4).
- **No new `Command` kinds and no new `CommandErrorCode`** — `object-unpowered`
  already covers a refusal against a de-energized target, and now means what it
  should.
- `src/core/ai/weights.ts`: five new terms plus a grid affinity (§4.5).
- `src/sim/analysis.ts`: six counters and three findings flags (§6).

---

## 8. The v1 cut line

**v1 — static topology, energization, cut and restore.**

- The grid schema (§7.1–7.4 minus `setContactPayload`), the derived-energization
  rule, and the degeneracy rule.
- `addLoad`, `severLine`, capacity/load, the latching trip, the reclose.
- Events (§5.4), save format (§5.5), ordering (§5.3).
- The POWER register's load line, cause column and network sections; the
  annunciator cause clause; the aim-time component highlight (§2.5). **Inside
  v1, not after it** — the mechanic is not shippable without them.
- Conduit abilities **1 Overdraw, 2 Cross-Tie, 3 Reclose, 4 Backfeed, 7 Rated
  Draw**; Saboteur cut; Machinist splice and reroute. **All five shipped.**
  Rated Draw landed last, on the one-field schema amendment
  `SupportAbility.passive.gridLoadReduction` that `docs/CONTENT_NOTES.md` §7.11
  had recorded and deferred; at 2 it makes Overdraw +6 and Backfeed +4 in her
  hands. §6.4's third formula case is corrected there — at +8/−2 it cannot hold
  on a bus at 11 of 12, and is tested at the §1.7 band instead.
- AI terms 1–5 and the grid affinity; the six sim counters and three findings
  flags.
- **One new grid-native map** to carry it. The five slice maps are **not
  migrated** — that keeps the golden-replay proof of §6.2 available, keeps this
  workstream off files other agents own, and means a v1 regression can only be a
  v1 regression.

**v2 — the verbs that need new payload concepts.**

- `setContactPayload`; **Live Line**, **Dead Short**, **Live Rig**.
- Grid-aware trigger and win/loss conditions (§7.5) and the escort scenario.
- Mobile sources (§4.3's flux cart).
- Lifting AI_DESIGN's "requirements as a reason to move" deferral, scoped to
  grid nodes.
- Migrating a slice map — e4 Refinery Three first, whose 12 `network` tags and
  whose map notes ("everything on this map is on a circuit, and the circuit is
  the terrain") were written for this and which currently expresses the grid
  through five scripted triggers.

**Later, or never — recorded so it is not re-litigated.**

- Player-authored edges / free-hand splicing (§2.3).
- Load shedding by priority instead of a total trip (§1.5).
- Directional flow, phases, voltage, power quality. None of them buy a decision
  a player can make.
- Steam or pressure as a second network kind. The `Grid.kind` literal is
  reserved so the union can grow, and **nothing implements it**; a second network
  type should have to justify itself against a shipped first one.

---

## 9. Creative bible amendments — proposals

Flagged as proposals, per the bible's own rule that nothing drifts silently.
None is assumed by anything above; if all three are declined the design stands
as written.

> **Status (v1 content pass).** Proposal 1 is **accepted and applied** — the
> clause and the three seeds are in `docs/CREATIVE_BIBLE.md` §6. Proposals 2 and
> 3 stand as proposals, unapplied.

**Proposal 1 — §6, the Conduit.** The Conduit's fantasy paragraph names three
things she does to infrastructure: powers and kills machines, overloads cells,
arcs charge between conductive targets. A fourth belongs beside them now — *she
reads and rewires the network itself: the load, the ties, the trip.* Proposed
amendment: one clause added to that paragraph, and three seeds added to her seed
list (Overdraw, Cross-Tie, Reclose). The seeds are already marked suggestive in
§6, so only the clause is a real change.

**Proposal 2 — §5.2, attunement is a valve.** The rule already says a Conduit on
a dead map with no cells is nearly powerless, "and that is a feature, not a
bug". A grid makes that sharply true and, more importantly, **symmetric**:
killing the grid is now a legitimate way to fight a Conduit, and the enemy's
Conduit can do it to yours. Proposed amendment: one sentence recording the
corollary, so encounter authors read the rule as an objective rather than only
as a caster's weakness. Optional — the rule as written is not contradicted.

**Proposal 3 — §5.5 and §11, the two registers.** Grid vocabulary needs its
slang pair, or the fiction will drift toward engineering-manual English in
exactly the place the player reads most often. Proposed glossary additions:

| official (Assay / UI) | worker slang (barks) |
|---|---|
| network, feeder | *the bus* |
| interconnection breaker | *the tie* |
| overdraw event | *pulling the main* |
| protective trip | *blowing it*, *she went* |
| isolator | *the cutout* |

Also proposed for §11's table: **bus**, **tie**, **trip**, **the main** as
first-class glossary entries, since the POWER register puts three of those four
words permanently on screen.

**Not proposed, and not needed.** Nothing here touches §5.1 (flux is conserved —
the grid is that rule with a topology), §5.3 (flux corrupts flesh), or §5.4 (the
dead stay dead). Flux carts are already licensed by §4's "celled, piped and
discharged on demand" and need no amendment.
