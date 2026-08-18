# Systems Copy — the canonical help text

The words the game uses to explain itself. One entry per system a blind
playtester asked about and the interface could not answer: what LIVE means, what
Standing is for, what a cast speed buys, whether Thermal beats Kinetic.

**This file is the source.** The battle menu's **Systems** entry renders these
entries; `docs/` quotes them; a wave that ships provisional inline constants
reconciles to the strings here rather than the other way round. Every entry
carries a `key` so the copy can be lifted verbatim and matched up later.

**Register** (CREATIVE_BIBLE §5.5, UI_DESIGN §1): the interface is a form issued
by a standards bureau, so these entries use the official word — *flux*,
*charge*, *attunement*, *energized* — and leave the slang to barks. Prose, not
stamped ledger: full sentences, no exclamation, no second-person cheer. Say what
the rule is, say what it costs, stop.

**Accuracy is binding.** Each entry names the rule it is quoting. If the rule
moves, this file is wrong until it is amended. An entry must never describe a
system the game does not have, and where the honest answer is *there is no such
rule* it says so in those words — the damage-type entry below exists mostly to
say that, because a help page that hedged would send a player hunting an
elemental resistance table for the rest of the chapter.

---

## How to read an entry

| Field | Use |
|---|---|
| `key` | stable identifier; what the menu and any inline constant key off |
| **Title** | the plate title on the Systems page |
| *One line* | the collapsed row, and the chip if one is needed |
| Body | the page itself; two to five sentences, no lists unless the rule is a list |
| Source | the rule this is quoting; amend the entry when the source moves |

---

## `power` — Power

*Every machine on the map is either being fed or it is not, and the register
says which.*

A map's machinery hangs on a **grid**: mains that supply it, cable runs that
carry it, and sinks — presses, hoists, lifts, lamps — that draw from it. The
POWER register under the turn queue is the whole grid as a ledger, one row per
node, and it flips the instant anybody changes the topology.

**LIVE** means the node is being fed and will do its job. **DEAD** means nothing
is reaching it: a main is out, a span is gone, or the switch above it is open. A
dead machine is not a broken machine — feed it again and it works. Two rows say
*how* it went dead, because the answer decides which order fixes it: **CUT** is a
severed span and wants a splice, **TRIPPED** is a main that blew under load and
wants a reclose, **DESTROYED** is permanent, and **TIE OPEN** / **TIE CLOSED** is a
breaker sitting where somebody left it. **Inert** is a machine with no
electrical part at all.

A component's **LOAD** is what its sinks and any hung loads draw against its
mains' capacity. Push load past capacity and the mains trip — the whole
component at once, and it stays dark until someone walks to the board and
recloses it. There is no shedding and no partial brown-out: the floor goes.

Source: `docs/COMBAT_RULES.md` §14a, `docs/design/FLUX_GRID.md` §1.3–1.6, §2.5.

### `power-breaker` — Throwing a breaker

*One action at a switch decides what a whole branch is today.*

Anybody standing at a switch can throw it; a Conduit can throw one from across
the floor. It is worth an action when the thing downstream is working against
you — a turret drawing off the bus, a press cycling on the aisle you need, an
Augmented or a Conduit whose kit is being fed by the map. It is worth it in the
other direction too: reclosing a main is how you get a lift, a hoist or a
gallery light back, and a floor nobody thinks to relight is a floor that stays
dark.

Throwing a breaker is a topology edit, not a flag flip. Open the mains switch
and every sink below it drops in the same action; open a tie and one bus stops
carrying for the other, which is how a component that was comfortable becomes a
component that trips.

Source: `docs/design/FLUX_GRID.md` §2.1; the tie is spelled out in the Meter
House opening (`data/encounters/s1-meter-house.json`, `on-the-landing`).

### `power-freight-lift` — The Freight Lift, Marshaling Yard

*The lift's deck exists while the lift is fed. Kill its power and the deck is
not there any more.*

The Freight Lift decks the tiles it covers at its own height while it is being
fed, and the Signal Switch beside it toggles that feed. Stand on the deck and
you are standing two heights up, with the reach and the sight line that buys.
Throw the switch and the deck reverts to the ground under it — height, pathing
and line of sight all change in the same instant, for whoever is up there and
whoever was shooting at them. The switch needs no power itself, so nobody can
lock you out of it, and it works from either side.

Source: `docs/COMBAT_RULES.md` §11; `data/maps/marshaling-yard.json`
(`yard-switch`, `freight-lift`).

---

## `standing` — Standing

*Ten Standing for every order a unit resolves, banked into the job it fought in
when the battle is won.*

Standing is what a unit earns for doing the work: a flat **ten** each time it
resolves an action. Moving earns nothing and waiting earns nothing — a unit that
walks the whole battle without acting finishes it no better off than it started.

On a win, each deployed unit's earned Standing is **banked into the job it
fought the battle in**, and that account is where its abilities are bought from.
Standing does not cross between jobs: a Conduit's Standing will never buy an
Enforcer order, and changing job opens a fresh account at zero. **A loss banks
nothing** — the roster goes back to exactly the state it deployed in, and the
engagement can be fought again.

Each job account keeps two numbers. What the job has *ever* earned sets its
level, and is never spent down; what is *unspent* is what learning draws on. So
buying an ability costs you the price and never costs you a level.

Source: `src/core/rules/abilities.ts` `STANDING_PER_ACTION`;
`src/core/progression/ops.ts` `applyBattleResults`; `docs/PROGRESSION.md` §2.

---

## `charge` — Charge

*Carried flux. Every order that spends it says how much, and nothing refills it
out of nowhere.*

Charge is the flux a unit is carrying — in cells on its belt, in the housings of
its grafts. Its ceiling is the unit's Charge stat, off the job's curve and
whatever kit it is wearing, and most orders that do anything but swing a weapon
spend some.

Nobody makes charge (CREATIVE_BIBLE §5.1). It is refilled by taking it off
something that has it: tapping a live main, breaking a cell tab, siphoning it
out of somebody else's rig. That is why a Conduit on a dead floor with nothing
racked is nearly powerless, and why finding the map's power is the first half of
playing one.

Source: `docs/COMBAT_RULES.md` §2 and §7; CREATIVE_BIBLE §5.1–5.2.

---

## `cast-speed` — Cast speed

*An order with a cast speed leaves your hands and lands later. The higher the
number, the sooner it gets there.*

Most orders resolve the moment they are given. An order with a **cast speed**
does not: it goes onto its own clock, banks that many points each tick, and
fires when it reaches a hundred. A cast speed of 50 lands in half the time one
of 25 does.

Three things follow, and all three are the price of the reach and the size that
bought the cast in the first place. The flux and any blood it costs are spent
**when the cast begins**, not when it lands. Beginning it **ends the unit's
turn** immediately. And an order aimed at a unit is pinned to the tile that unit
was standing on — it lands where it was aimed, so a target who walks out is a
target you missed. Down the caster before it fires and it never fires.

Source: `docs/COMBAT_RULES.md` §6–7.

---

## `resolve` — Resolve

*Grit under fire, nought to a hundred. It is the rate at which a unit's reaction
answers.*

Resolve is how steady a unit is when it is being hit. It is read straight as the
trigger rate of whatever reaction the unit has slotted: at Resolve 60 the
reaction answers six times in ten, and there is no hidden second roll behind
that.

It is a measured fact about a person, not a mood. Sergeants grade Resolve in the
yard and it goes on the record, which is why the player reads the number instead
of guessing at it. Some orders and some events move it, up and down, and those
changes stick.

Source: `docs/COMBAT_RULES.md` §3 and §9; CREATIVE_BIBLE §7.

---

## `attunement` — Attunement

*How hard a body couples to flux, nought to a hundred. It is power and
vulnerability in the same number.*

Attunement scales every flux-based amount **twice** — once by the Attunement of
whoever cast it, once by the Attunement of whoever it lands on. A
high-Attunement Conduit therefore hits harder than a low one, and is hit harder
by the next Conduit she meets. There is no way to buy the first half without
buying the second; the Augmented job trades Resolve for Attunement on purpose
and pays for it exactly this way.

Machinery and bare ground have no Attunement and are treated as unscaled, so a
Conduit's numbers against a machine do not move with anybody's disposition. Kit
and chemistry that are deliberately not flux-driven — a coagulant, a thrown
flask — say so and scale with nothing.

The Assay measures Attunement to issue a licence, so like Resolve it is a filed
fact rather than a secret.

Source: `docs/COMBAT_RULES.md` §3–4; CREATIVE_BIBLE §7.

---

## `damage-types` — Damage types and resistance

*Four types: Kinetic, Arc, Thermal, Chemical. Nothing on the field resists a
type, and there is no elemental weakness to find.*

A type says what the damage **is** — a maul, a discharge, a flame, a compound —
so the log, the popup and the fiction all agree about what happened. It is also
how the world stays honest: an Arc order has to have drawn its charge from
somewhere, and a Chemical one from a bench.

Type does not change a number. There is no resistance table, no armour class per
type, no target that takes half from Thermal and double from Arc. What actually
moves a number is the acting unit's stats, the target's Attunement where the
amount is flux-based, height, facing and evasion. If a type seems to be doing
more work, it is the status that usually rides with it — a Thermal order that
sets Scalded, an Arc one that sets Flux Burn — and those are printed beside the
order with their own odds.

One quiet consequence worth knowing: the blood an order costs its own user is
filed as Chemical damage to that user.

Source: `docs/COMBAT_RULES.md` §4, §13a; `src/data/schemas/common.ts`
`DamageType`.

---

## `borrow-a-skillset` — Borrowing a skillset

*A unit fights out of one job and may borrow a second job's orders. Borrowed
means already paid for, in that job, by that unit.*

Every unit has a primary job — the sheet it wears, the stats it grows on, the
kit it may carry. It may also name a **secondary** job, and the orders it has
already bought in that job appear on its menu beside its own. Nothing is granted
by borrowing: the secondary only surfaces what that unit paid for out of that
job's Standing, back when it was working in it.

Only **action** orders come and go this way. A reaction, a support or a movement
ability, once bought, can be slotted whatever job the unit is currently in — the
purchase is permanent even when the skillset is not.

Change primary job and the old action list leaves the menu; borrow it back as a
secondary and it returns unbought. A secondary that collides with the new
primary is cleared, and kit the new job has no ticket for goes back to stores.

Source: `docs/PROGRESSION.md` §2 "Skillsets"; `src/core/progression/ops.ts`
`setSecondaryJob`, `projectSkillsets`.

---

## `doctrine` — Doctrine

*A faction's written procedure: the drill it trains, and the finding it files
afterwards. It is a fact about the world, not a stat.*

Half the orders in the game are named out of somebody's doctrine, so the word
needs defining rather than assuming. **Doctrine** is a standing written
procedure — what an organisation trains its people to do, and what it will
record as having happened. The House Watch's doctrine is a wall of shields and
patience: hold ground, pin, take alive where taking alive is possible, and file
the result as compliance. The Assay Sodality's doctrine is purity and licence:
what may be refined, who may be attuned, and which of the two documents goes
into the Archive.

The Combine does not use the word. What the Watch calls a doctrine, a yard hand
calls **the line** — and a line is a place people are standing, not a procedure.

Nothing in the engine reads doctrine. When an order's text says *Watch doctrine
for* something, it is telling you who taught it and what they meant it for, and
the numbers beside it are the whole of what it does.

Source: CREATIVE_BIBLE §4 and §5.5; the word as used in
`data/abilities/{pin,shield-advance}.json` and `data/items/riot-shield.json`.

---

## Named deployables (canonical display names)

A Machinist's deployables are objects on the board, and the board names them.
These are the names — the ids are untouched.

| Spawn | Display name | Notes |
|---|---|---|
| `turret` | **Sentry Frame** | the frame the order of the same name seats |
| `mine` | **Tripwire Charge** | the pressure charge seated in the deck plate |
| `drone` | **Skitter Drone** | six legs, one cell |

**Outstanding:** the deployed object's own name is currently the raw spawn kind,
so a laid tripwire reads as *mine* on the board and in the log
(`src/core/rules/effects.ts`, `spawnObject`: `name: effect.object`). There is no
data-side hook for it — `spawnObject` in `src/data/schemas/effect.ts` carries no
name field — so the fix belongs to whichever wave owns `src/`. The label table
in `src/app/viewmodels.ts` (`SPAWN_LABELS`) should reconcile to the middle
column above; it currently reads `Charge` for `mine`.

---

## Outstanding copy, prepared but not landed

### Two flavour fixes frozen by the harness mirror

`src/ui/mock.ts` copies a handful of content records verbatim out of `data/` and
`tests/ui/mock.test.ts` fails the moment the two drift. The mirrored records are
jobs `enforcer` and `conduit`, abilities `pin` and `overload-cell`, item
`shock-maul`, status `stunned`, and unit `rowen` — a description on any of those
cannot move from `data/` alone. Two audit fixes are therefore prepared and not
landed; each needs the same string updated in the mirror in the same commit.

**`data/abilities/overload-cell.json`** — the order requires its target to be
energized and the mechanics panel does not print requirements, so the prose has
to carry it:

> Force charge into a **live** machine past its rated draw until something gives.
> Voids the Assay warranty and usually the machine.

**`data/statuses/stunned.json`** — the current line only restates the two hooks
the panel already prints:

> Rattled hard enough that the body has stopped taking orders. It passes; it does
> not pass now.

### Maren Voss states her allegiance on joining (e1, `the-first-maul`)

The blind playtest could not tell whose side the woman who walks on at turn two
is on. She is the Combine's steward and she is neutral — she neither fights the
Watch nor fights for it — and the scene never says so. The line, to go into the
`the-first-maul` dialogue immediately after her first:

> **Maren Voss** — "Maren Voss, steward, Combine of Trades. I am not fighting
> your Watch and I am not fighting for it — my line stays where it is."

**Why it is not in the data yet.** `DialogueRequested` events carry their lines
verbatim, so the golden replays embed every word of authored dialogue
(`tests/golden/fixtures/e1-marshaling-yard-*.json`). Adding the line moves all
three e1 fixtures. Recorded and diffed, the movement is *only* the four lines of
the added dialogue object inside the existing `DialogueRequested` event — same
outcome, same turn count, same clock, same command count, same event order — so
it is provably not balance-affecting, but it is not byte-identical either, and
the fixtures are re-recorded deliberately and committed by hand:

```
GREYFALL_RECORD_GOLDENS=1 npx vitest run tests/golden
```

Land the line and the re-record together, or not at all.
