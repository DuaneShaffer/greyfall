# Genre Survey and Gap Analysis — Greyfall

What Final Fantasy Tactics has that Greyfall does not, what the rest of the
genre has learned since, and which of it this game actually wants.

Governing docs. `docs/CREATIVE_BIBLE.md` is the source of creative truth and is
cited inline wherever it constrains a recommendation; `docs/COMBAT_RULES.md` is
the account of what is *actually implemented* and every "we already have this"
claim below is checked against it rather than against memory;
`docs/PROGRESSION.md` owns the between-battle layer; `docs/design/FLUX_GRID.md`
§2.5 is the legibility contract this document treats as binding on every new
mechanic.

**Status: advisory.** Nothing here is canon. Nothing here amends a schema, a
rule, or the bible. Recommendations are *proposals with a cost estimate and a
reason*, in the register the other design docs use, so that a later pass can
pick one up and build it without re-deriving the argument. Where this document
disagrees with a shipped rule it says so and does not act on it.

---

## 0. How to read this

### 0.1 Cost classes

| Class | Means | Example of the size |
|---|---|---|
| **C0** | Content only — JSON in `data/`, no code, no schema | a new ability on existing effects |
| **C1** | Additive schema + engine rule + tests | `moveSelf`, `severLine` — one effect, one code path |
| **C2** | C1 plus a readout: HUD, forecast, register, or a between-battle screen | the flux grid's POWER register work |
| **C3** | A new layer — a screen stack, a persistent sub-state, a loop the campaign runs outside battles | shops; an overworld; propositions |

Costs are for a *v1 that ships*, not for the full idea. Every recommendation
below carries a v1 that is deliberately smaller than the source game's version.

### 0.2 The four filters every idea is put through

1. **Does a pillar want it?** Creative bible §2's four tone pillars and the
   mechanical thesis — the battlefield is a system — are the test. An idea that
   is merely *good* is not enough; the genre is full of good ideas that would
   make this a different game.
2. **Does it survive the legibility doctrine?** `FLUX_GRID.md` §2.5 is binding
   and general: every state the player must reason about is on screen without
   hovering, and every change names its cause. An idea that requires hidden
   state, or that measures well in the sim and plays badly, is rejected on that
   ground alone — that is the e2 press-window lesson (`FLUX_GRID.md` §0) and it
   has already cost this project once.
3. **Does it survive determinism?** `ARCHITECTURE.md`'s rules and
   `COMBAT_RULES.md` §1/§17: one seeded stream, fixed iteration order, integer
   arithmetic, a battle is initial state plus a command log. Anything needing
   wall-clock time, floating point, hidden simultaneity, or unordered iteration
   is out, not negotiable.
4. **Does it duplicate the flux grid?** The grid already occupies the design
   space of "the board carries a network of state that both sides play against".
   A second system in that space does not add depth, it splits the player's
   attention budget in half. This filter kills more genre-famous ideas than any
   other one below.

### 0.3 The fifth filter: can we tell whether it worked?

Added after reading `docs/BALANCE_REPORT.md`, because that document has already
paid for this lesson twice and states it plainly.

The headless sim drives **both sides with the shipped AI** and reports a win
rate; §1 of that report is titled "Method, and what it cannot tell you". Its
central epistemic finding (§7.8.3, "the honest note") is that **the driving
evidence for the two largest content changes in the project was a human
disagreeing with the sweep, and neither change would have been made from the
sweep alone** — an acceptance playthrough lost Foundry Floor Nine six times out
of six against a sim reading of 45.8%, and the Marshaling Yard "read 100% and
would have gone on reading 100% forever with a unit on the field that never took
a turn." §7.8.5 draws the line this document depends on: e2's press windows were
not sim-invisible, they were **sim-visible and player-invisible**, and that made
the gap "a presentation problem rather than a balance one."

The instrument's answer to this was not a better win rate, it was
`objectiveFindings` — flags that ask *did the premise ever happen*
(`machinery-never-operated`, `trigger-never-fired`, `unit-never-acts`,
`grid-never-contested`, `grid-never-restored`, `grid-dark-by-turn-N`).

**So every recommendation in this document that touches battle carries a
measurement obligation:** name the counter and the findings flag it ships with,
the way the flux grid shipped six counters and three flags. Two known blind
spots to design around:

- **Reactions are effectively unmeasured.** `UnitRecord.reactionsTriggered`
  exists and is incremented; nothing in the 2,094-line report reports it. Any
  proposal that hangs on the reaction slot (§1.1, §2.8) ships blind unless it
  brings its own counter.
- **The AI is the sim.** `BALANCE_REPORT` §6.7 G4 is the cautionary case: an
  object with nobody standing on it is worth a flat 15 points, so "the whole 'the
  map is the target' pillar is invisible to the search unless somebody is
  standing on the thing." A new board-state mechanic the AI cannot value will
  measure as unused, and the sweep will report that as content failure. Budget
  the AI valuation term as part of the mechanic, not as a follow-up — that is
  what `FLUX_GRID` §4.5 did, and it is why the grid landed measurable.

### 0.4 What "we already have this" means

A surprising amount of FFT's structural apparatus is shipped. Before the
inventory, the parts that are done, so no agent proposes them again:

| FFT feature | Greyfall status |
|---|---|
| CT turn order, Haste/Slow as a CT multiplier | Shipped, `COMBAT_RULES` §6 |
| Height, Move/Jump, jump-limited edges | Shipped, §10, §11 |
| Facing-based evasion (front/side/back) | Shipped, §5 |
| Charged casts on their own CT timeline, cancelled on caster down | Shipped, §7 |
| **Turn-order forecast showing where a charge lands** | Shipped, and better than FFT's: `turnOrderPreview` emits `kind: "charge"` entries and `turnOrderView` renders them as a `cast` row **naming the ability**, with ticks-until |
| Reaction / support / movement passive slots | Shipped, `ability.ts`'s four-way `slot` union; slotted passives feed `deriveStats` (§2) and are validated against purchase history, not current job (`PROGRESSION` §2) |
| Reaction trigger rate driven by the Brave analog | Shipped — Resolve *is* the trigger percentage, §9 |
| Primary/secondary skillsets, and losing a skillset on job change | Shipped as the `learnedAbilityIds` projection, `PROGRESSION` §2 |
| JP banked per job; job level from total earned | Shipped as Standing, `PROGRESSION` §2 |
| Job tree with prerequisites | Shipped in `data/jobs`, `CONTENT_NOTES` §1 |
| Equipment by class-tag, shared party stock | Shipped as `equipTag`, `PROGRESSION` §4 |
| Items as an action, with mastery passives | Shipped as the satchel, §19 / `ITEMS.md` |
| Permadeath | Shipped, and given a *better* rule than FFT's (§3 below) |
| Move+N / Jump+N movement passives | Shipped as movement-slot `statMods` (`earth-strap` is Move +1) |
| Terrain that costs extra (rough, water) | Shipped, §10 |
| Guests / non-combatants on the field | Shipped as the `neutral` team, §18 |

The gaps are therefore narrower and more interesting than "we need a job
system".

---

## 1. FFT feature inventory vs Greyfall

One subsection per feature the brief names, plus a few FFT carries that the
brief did not and that turn out to matter. Each ends in
**recommend / adapt / reject**.

### 1.1 Reaction / support / movement passive tiers — **shipped; the gap is depth**

*What it does for FFT.* The RSM tier is where FFT's build depth actually lives.
The action skillset is what a job *does*; the three passive slots are what a
*player* built. Two units in the same job with different RSM slots play
differently, and cross-job passive borrowing (a Knight wearing Monk's Martial
Arts) is the single largest source of the game's combinatorial character.

*Greyfall today.* All three slots exist and are enforced. `SupportAbility.passive`
carries `statMods`, `ignoreHeightPenalty`, two consumable-mastery keys and
`gridLoadReduction`; `MovementAbility.passive` carries `statMods`,
`railMoveMultiplier`, `ignoresHazardTiles`, `moveThroughEnemies`. Passives
survive job changes (`PROGRESSION` §2) exactly as FFT's do.

*The gap is not structural, it is a vocabulary shortage.* Every passive that is
not `statMods` is a flat boolean, so a passive can only ever say "this rule is
off for me". FFT's best passives are *conditional and situational*: Counter
Flood, Distribute, Move-HP-Up, Gilgame Heart. Ours cannot express "when X, do
Y" at all, because the passive block is a bag of flags read at `deriveStats`
time and nothing hangs off an event.

*Verdict: **adapt**, at C1, and deliberately small.* Do not build a general
passive-effect system. Add the two conditional hooks the shipped content has
already reached for and been refused:

- A support passive that fires an effect on a named event — the same four
  triggers the reaction slot already has. That is the difference between
  "Move-HP-Up" and nothing, and it costs one dispatch site.
- `CONTENT_NOTES` §7.8's ally-protection reaction trigger (an ally in range was
  targeted). The Enforcer's bible fantasy is "holds lines"; the reaction
  vocabulary cannot express an interpose, so the job's signature passive does
  not exist.

*Measurement obligation (§0.3).* Both pieces land in the reaction/passive layer,
which the sim currently does not report on at all, and the AI does not model
reactions when scoring (`AI_DESIGN`, deliberately not modelled: "no reactions —
Riposte is invisible"). Neither should ship without a per-trigger counter and an
`ability-never-triggers` flag, or we will be tuning them by feel.

### 1.2 The turn-order forecast — **shipped; extend it by one number**

*What it does for FFT.* The AT (Active Turn) list is the single most important
readout in the game: it converts CT from a hidden simulation into a planning
surface. WotL's list also shows charging actions in place.

*Greyfall today.* `turnOrderPreview` walks a throwaway clone, banks CT, fires
charges first (matching §6's resolution order) and emits `charge` entries; the
view model turns those into `cast` rows carrying the ability name and
`ticksUntil`. This is already ahead of the PS1 original.

*The one thing missing is the consequence of the player's own choice.* §6 prices
a turn at 100 / 80 / 60 CT depending on whether the unit moved, acted, both or
neither — a genuinely load-bearing decision that the interface never shows. The
player cannot see that waiting without acting buys them their next turn two
ticks sooner.

*Verdict: **recommend**, C2 and small.* When an order is staged, the queue
previews *the queue as it would be after committing it* — the acting unit's own
row moving to where the 100/80/60 cost puts it. It is one extra
`turnOrderPreview` call on a hypothetical state, which is exactly the pattern
the grid's aim-time component highlight already established (`FLUX_GRID` §2.5c):
the preview asks the rules, it does not model them again.

*One deliberate non-change.* Deployables stay out of the queue (§6: "the preview
answers who acts next, not what happens next"). But their fire is *completely
untelegraphed*, which is a real problem — see §2.3, where it is the cheapest
half of the highest-ranked recommendation in this document.

### 1.3 Job change and cross-job skillsets — **shipped; one FFT half is missing**

*What it does for FFT.* Two things, and Greyfall has one of them.

1. **Skillset swapping** — primary + secondary, and JP banked per job so a job
   change is a real commitment. **Shipped** (`PROGRESSION` §2).
2. **Stat growth per job** — FFT levels a unit *inside* a job, and which job you
   levelled in permanently shapes the stat block. This is the deep, slow,
   partly-invisible layer that makes a max-level FFT unit a record of its
   history. **Not shipped, and nothing raises `Unit.level` at all**
   (`PROGRESSION` §8).

*Does a pillar want it?* Partly. "Magic is labor" and the Standing-as-craft
framing both like the idea that a body carries the record of what it did. But
FFT's version is famously opaque — the optimal play is to level as a Squire and
job-change late, which is a *hidden* optimization the player either reads a FAQ
about or never learns. That is exactly what filter 2 forbids.

*Verdict: **adapt**, C2, and only when levelling exists at all.* If unit levels
land, growth should be per-job and **printed on the record card as it accrues**
("Enforcer service: 4 levels — +11 HP, +2 Phys") rather than hidden behind
growth constants. The Assay-form voice of the interface (`UI_DESIGN` §1) makes
this trivially natural: a service record is a document. Reject FFT's hidden
version outright.

### 1.4 Recruitment and roster growth — **adapt; the campaign needs it**

*What it does for FFT.* Two separate systems wearing one name: generic-unit
recruitment at the shop (an infinite roster of disposable bodies, which is what
makes FFT's permadeath survivable) and named story joins (Agrias, Mustadio,
Beowulf), some of them missable.

*Does a pillar want it?* The named half, yes and urgently. The generic half,
**no**, and it is worth being explicit about why: `PROGRESSION` §3's permadeath
doctrine ("a loss changes nothing, a win banks and buries") is only tolerable
because the roster is small, named, and the loss is meant to hurt. An infinite
supply of interchangeable hires converts every death into a logistics event,
which is the exact opposite of tone pillar 3 ("personal tragedy at industrial
scale"). FFT needs generic recruits because FFT will happily crystallize your
whole party; we do not, because we will not.

*Greyfall today.* `CampaignState.roster` is a mutable array in join order and
`PROGRESSION` §1 already says "later recruits appended" — the state model is
built for this and there is simply no op. `STORY_BIBLE` Layer 1 names the people:
Wick, Nessa Kiln, and the company itself changes shape across five chapters.

*Verdict: **recommend** the named half, at C2.* One op (`recruitUnit`) plus a
campaign-definition hook that names which encounter or flag brings whom, plus
the between-battle screen acknowledging it. **Reject** the generic half,
permanently, and record the reason here so it is not re-proposed: an infinite
roster and this permadeath rule cannot both be right.

*The corollary nobody has costed.* If the roster can grow and shrink, and the
slice's fixed party stops being fixed, encounter authoring has to stop assuming
seven named units. That is the real cost of this item and it lands on the
encounter workstream, not the progression one.

### 1.5 Monsters and poaching — **reject**

*What it does for FFT.* Monsters are a second unit taxonomy with their own
movement, their own abilities, and a breeding/invitation loop; poaching (Secret
Hunt) converts a monster kill into an item at a dedicated shop, which is FFT's
main source of rare equipment.

*Does a pillar want it?* No. The world has no monsters and adding them would
require inventing a bestiary the creative bible has deliberately not got: the
antagonists are the House Watch, provocateurs, the Ledger's people, and Assay
wardens — *institutions with employees*. Bible §2's register ("grounded,
unsentimental, dry"; "personal tragedy at industrial scale") is doing real work
here; the fights are political because the enemies are people.

*The one thing worth stealing is the loop, not the content.* Poaching exists
because FFT needs a way to get items that shops do not sell. Greyfall has the
same hole (`PROGRESSION` §4: "there is no way to *gain* items in the slice") and
should fill it from salvage and the bench (§2.7), not from carcasses.

*Verdict: **reject**.* Recorded so it is not re-litigated. If a later chapter
wants inhuman opponents, the fiction has one legitimate door — brightblood, graft
rejection, and what the Assay does with the interred (bible §12) — and that door
should be opened by the story bible, not by a mechanics agent wanting a
bestiary.

### 1.6 The 3-turn crystal timer — **reject, and the shipped rule is better**

*What it does for FFT.* A downed unit counts down three of its own turns; at
zero it becomes a crystal (which another unit may absorb for HP/MP or for *all*
of that unit's learned abilities) or a treasure chest. Until then a Phoenix Down
or Raise brings it back. It is FFT's tension pump: the fight continues while a
clock runs on a body.

*Does a pillar want it?* **No, on two independent grounds, and they are both
canon.**

1. Bible §5.4 — the dead stay dead, nothing recalls them — is binding on ability
   design, and §4 of `COMBAT_RULES` already implements it ("downed units cannot
   be healed"). A three-turn window in which a body can be recovered is a
   resurrection window wearing a stopwatch. FFT's timer only makes sense in a
   world with Raise.
2. Bible §12 canon ruling 2 — downed ≠ dead for named characters — has already
   resolved the tension the timer exists to create, at the *campaign* layer
   rather than the battle layer, and `PROGRESSION` §3 makes it a rule with a
   sentence you can hold in your head: **a loss changes nothing, a win banks and
   buries**. That is a better mechanic than FFT's: it removes the death spiral,
   removes the save-scum incentive, and puts the cost precisely where the tone
   wants it (you won, and it cost someone).

*The crystal's reward half deserves its own rejection.* Absorbing a fallen ally
for their entire skillset is a reward for a casualty, and in a game whose thesis
is that institutions render people into resources (bible §12, the Assay's
secret), shipping "harvest your dead comrade for their abilities" as a *good
outcome* would be tonally catastrophic. Salvaging their kit — which
`PROGRESSION` §3 already does, with the line "kit is recovered, the person is
not" — is exactly as far as this goes.

*Verdict: **reject**, both halves.*

### 1.7 Propositions and errands — **recommend; the highest structural fit in FFT**

*What it does for FFT.* War of the Lions' propositions: send idle party members
off the map for a number of days, they come back with gil, items, rumors, and
occasionally an unlock. They exist to (a) give a bench of unused units something
to do, (b) meter money outside battle, and (c) deliver worldbuilding in small
pieces the player opts into.

*Does a pillar want it?* This is the strongest yes in Part 1, and the reason is
that the fiction already wrote it. The Velden Compact runs on **work orders**;
Standing is literally "standing with your trade" (bible §11); the Combine, the
Ledger and the Assay are three institutions that hand out jobs, and
`STORY_BIBLE` Layer 1 describes Chapters 2–3 as the company doing exactly this
for a living — "recovery work: documents, witnesses, people moved". `STORY_BIBLE`
Appendix B lists "errand/proposition analogs" as deliberately left open for a
future agent. The mechanic is not being imported; it is being *named*.

Three pillars are served at once: magic is labor (§2.2) gets an economy that is
not combat; history is written by the winners (§2.1) gets a delivery vehicle for
the counter-record, because a work order returns a *document*; and the campaign
gets a Standing sink that is not "buy the next ability".

*Cost.* C3, but the cheapest C3 in this document, because it needs no map, no
renderer, no AI and no battle code — one screen, one persistent sub-state
(dispatched units, a clock in encounters-elapsed rather than days), one content
schema, and text.

*v1 sketch.* See §3.2.

*Verdict: **recommend**, ranked #3.*

### 1.8 Shops and equipment progression — **adapt: requisition and the bench, not a shop**

*What it does for FFT.* The shop is the meter on power growth: gil in, statlines
out, and the shop's stock unlocking by chapter is how FFT paces gear.

*Greyfall today.* Deferred to Phase 3 (`PROGRESSION` §4). `Item.price` exists and
is unread. The hole this leaves is sharper than "no shopping": **nothing refills
the satchel**, so consumables are a strictly depleting resource across a
chapter, and the Chemist's whole job identity is a countdown.

*Does a pillar want a shop?* A literal shop counter, weakly. The fiction has
better answers, and two of them are cheaper to build:

- **Requisition.** A Watch ensign does not shop, she draws stores against her
  commission; a deserter company does not shop either, it gets kit through the
  Combine lodges and the Ledger's fences. Requisition is a *list with a Standing
  price and a faction gate*, which is a strictly smaller build than a shop
  economy with a currency, sell values, and stock tables.
- **The bench** (§2.7) — the Chemist converting salvage into compounds. This is
  the one that actually answers the satchel problem, and it is on-fantasy for the
  job whose bible line is "reads like a portable lab".

*One idea worth stealing from Banner Saga while we are here.* Banner Saga runs
promotion and supplies off a **single** currency (renown), so every level-up is
food the caravan does not eat. Standing could carry the same tension: spend it on
abilities or spend it on kit. It is a one-line design decision with real teeth
and it costs nothing extra to make, because there is only one currency in this
game already.

*Verdict: **adapt** — requisition + bench at C2, in place of shops at C3.*
Recorded as a deliberate deviation from `PROGRESSION` §4's deferral, which
assumed a shop; the deferral should be re-scoped rather than discharged as
written.

### 1.9 Random battles — **adapt; the seed is already shipped**

*What it does for FFT.* Random encounters on the world map are the grind valve:
under-levelled, go fight some bandits.

*Does a pillar want it?* Not the *random* part. A random encounter is a battle
nobody designed, on a map with no thesis, and this project's entire encounter
practice is the opposite of that (`MAP_NOTES`' "tactical thesis" per map;
`ENCOUNTER_NOTES`' showcase framing). Adding fights nobody authored would also
break the one thing the sim is good at, which is measuring authored encounters.

*But the repeatable-battle need is real*, and the answer is already in the
repository: the `works-skirmishes` campaign, shipped to carry `s1-meter-house`
so the five-battle arc stayed five (`PROJECT_BREAKDOWN`, flux grid status), and
described in `ENCOUNTER_NOTES` §6 as **"deliberately not a beat of the arc"**.
That is precisely the shape — a **works-skirmishes ladder**: a short list of
authored, replayable, thesis-carrying maps outside the chapter spine, each with a
dramatic function that is *no* dramatic function. The vehicle exists; it holds
one battle.

*Two rules it needs, or it becomes a grind exploit.* `PROGRESSION` §7 already
lets the player replay a won encounter for Standing with no cap, which is a
grind vector today. See §2.2's union-level analog: a rated ceiling per chapter is
the cheapest fix and it has an in-fiction name.

*Verdict: **adapt** — authored repeatable skirmishes, never generated ones.*

### 1.10 Guests — **shipped in the useful direction; one variant missing**

*What it does for FFT.* A guest is a unit the player does not control and cannot
lose permanently, who fights alongside and whose downing sometimes fails the
battle. It buys story presence without roster commitment.

*Greyfall today.* `neutral` (§18) is a genuinely well-specified non-combatant:
hostile to nobody, walked through, never rolled against, invisible to the AI,
uncounted by rout. Quill, Maren and Jory already stand on maps as bodies. The
brief's read is right that e4's Quill behaves like a guest.

*What is missing is the **fighting** guest* — an ally-team unit the player does
not command. There is no "AI-controlled player-team unit" concept: teams are
`player`, `enemy`, `neutral`, and the AI drives `enemy`. A guest who actually
shoots would need either a fourth team or a per-unit "AI drives this one" flag.

*Does a pillar want it?* Moderately. It is the natural shape for Dray as an ally
before he isn't, for a Combine picket fighting on your flank, and for
`STORY_BIBLE`'s Chapter 4 Marle survey crew. It is also the shape that most
easily annoys players, because an uncontrolled unit that can lose the battle for
you is the genre's most reliable source of frustration.

*Verdict: **adapt**, C1, with one hard constraint.* A per-unit `controller:
"ai"` flag on a `player`-team unit is the small version and needs no fourth team
or AI change (the AI already takes a team). The constraint: **a guest may never
be a loss condition unless the encounter says so in the objective text**, and
`ENCOUNTER_NOTES`' vocabulary should treat "protect the guest" as a stated
objective rather than an ambush.

### 1.11 Optional recruits and side-quest chains — **adapt; folds into §1.7**

*What it does for FFT.* Missable characters gated behind errands, timed events,
or the Deep Dungeon, plus multi-battle side chains (Beowulf/Reis) that carry
their own small stories.

*Does a pillar want it?* Yes, but not as a separate system. Every one of FFT's
side chains is *reached through* a proposition or a world-map node. Build §1.7
and this becomes content authoring rather than engineering: a work order whose
outcome is "a person, and a battle to get them out".

*One caution from the bible.* Missable content and tone pillar 1 ("history is
written by the winners") interact well — an optional testimony you never
collected is a gap in the record, which is thematically perfect — and interact
badly with a five-chapter tragedy whose ending is canon (`STORY_BIBLE` Layer 0).
Optional content must not be *load-bearing* for the thesis. Keep side chains at
the register of "another name in the counter-record".

*Verdict: **adapt** — a content shape on top of §1.7, no separate system.*

### 1.12 Brave / Faith modulation vs Resolve / Attunement — **recommend; the biggest bible-to-engine gap in the game**

*What FFT does with its pair.* Brave and Faith are not two stat multipliers. They
are a *system*:

- Brave drives reaction trigger rate, and is permanently modified by actions in
  battle (Yell raises it; the Squire's Cheer Up, and hitting an ally, move it).
  Below ~10 a unit becomes a chicken: it flees, cannot act, and slowly recovers.
- Faith scales magic dealt *and* received, is likewise permanently modifiable
  (Faith/Doubt spells), and below ~10 a unit becomes an "innocent" — immune to
  magic and unable to cast, which is a build, not a punishment.
- Both are **hidden** in the base game, and both matter at recruitment.

*Greyfall today, precisely.* `COMBAT_RULES` §3 is two sentences long. Resolve is
the reaction trigger percentage and nothing else. Attunement scales `mag` amounts
twice (caster and target) and nothing else. `modifyDisposition` exists as an
effect and clamps to 0–100. `PROGRESSION` §8 lists "story-driven
Resolve/Attunement shifts" as deferred with **no op**.

So of FFT's pair-system Greyfall has the two multipliers and none of the
system — and the bible has *already promised* the rest. §7, binding: "Low-Resolve
units flinch; very low-Resolve units may bolt." That sentence describes a
mechanic that does not exist. Same section: "Story events may move them
permanently" — no campaign op. Same section: "the Augmented job trades Resolve
for Attunement as grafts accumulate" — expressible only as a one-shot
`modifyDisposition` inside a battle, not as a progression arc.
`STORY_BIBLE` §3b then leans on all three: Dray's boss sheet is meant to *be*
his tragedy (Resolve collapsed, Attunement towering), and Vale's licence
revocation is meant to be a deliberate non-event on a sheet the player can read.

*The hidden/visible question, which needs deciding once.* Bible §7 calls it "the
hidden stat pair" in its first line and then says, four lines later, "in-fiction
these are legible facts about a person, not abstractions: the Assay measures
Attunement to issue licenses; sergeants judge Resolve in the yard." Those pull
opposite ways, and the legibility doctrine settles it: **show them.** FFT hid
Brave/Faith and the result was a generation of players who never knew why their
Summoner was bad. The Assay-form interface (`UI_DESIGN` §1) makes the visible
version *better* fiction, not worse — a measured value on a licence, with a date.
This is a one-word bible amendment ("hidden" → "quiet", or a clause) and it
should be proposed rather than assumed; see §4.

*Verdict: **recommend**, split into three independently shippable pieces:*

1. **Resolve does something under fire** — C1. Suppression/flinch as a status
   whose application chance reads Resolve, and a bolt state at the bottom of the
   range. This also closes `COMBAT_RULES` §8's deliberate simplification (status
   chance ignores the disposition pair), which was recorded as revisitable "on
   purpose". Ranked #5.
2. **A campaign-layer disposition op** — C0/C1, genuinely trivial: one pure
   function beside the other progression ops, one campaign hook, one line on the
   record card. `STORY_BIBLE` §3b asks for it by name.
3. **Print the pair** — C1, the record card and the inspect card. See §5.

### 1.13 Weather and terrain depth — **adapt; the industrial version is surfaces, and it is §2.4**

*What it does for FFT.* Water has depth (deep water restricts non-swimmers and
some abilities); weather and terrain feed Geomancy, which draws its effect from
the tile the caster stands on; rain and other conditions modulate a few elements.
*(My memory of FFT's exact weather modifiers is imprecise — treat the specifics
as illustrative, not as a spec.)*

*Greyfall today.* `TerrainType` is `plain | rail | rough | water | impassable |
void`. Water costs double to enter unless the unit has `ignoresHazardTiles`, and
does nothing else. There is no depth, no weather, no per-tile status.

*Does a pillar want depth-and-weather specifically?* Not much. Weather is
outdoor-fantasy furniture; this game is set inside foundries, refineries and mine
galleries, and its equivalent of weather is **what the building is doing** — ash,
steam, spill, slick. That is not weather, it is *surfaces*, it belongs to the
"battlefield is a workplace" pillar rather than to a sky, and it is the subject
of §2.4, which is where this recommendation actually lives.

*One small thing worth taking from FFT directly.* Water tiles being merely
expensive is a missed opportunity in a game with an `arc` damage type: a wet
tile ought to conduct. That single interaction is the cheapest possible entry
point to §2.4 and could ship alone.

*Verdict: **adapt** into §2.4. Reject weather as such.*

### 1.14 Move+2 / Jump+2-style movement passives — **shipped; add two flags, no more**

*What it does for FFT.* The movement slot is where FFT's most transformative
passives live — not Move+2, which is just a number, but Ignore Height, Teleport,
Walk on Water, Move-Find-Item. They change what the map *is* for that unit.

*Greyfall today.* The numeric half is shipped (movement `statMods`;
`earth-strap` is Move +1). The transformative half is three booleans, and two of
them are the interesting ones: `railMoveMultiplier` is the Railrunner's entire
terrain-conditional identity, and `moveThroughEnemies` is real tactical
vocabulary. `ignoresHazardTiles` is currently doing very little work because
water is the only hazard terrain.

*What is missing that this game would want.* Not Teleport (it deletes the
pathfinding decision, which is most of the game). Two candidates, both C1 and
both one flag:

- **Ignore height on movement** (a jump bonus that applies only to descending, or
  a `jumpDown` allowance). Industrial maps are vertical; a job that can drop off
  a gantry it cannot climb is a real tactical identity and it is one comparison in
  the edge test.
- **Move-and-recover** — FFT's Move-HP-Up/Move-MP-Up. In this fiction the
  charge version writes itself: *stepping on rail or on an energized node tops up
  a little flux*. It hangs off the grid rather than duplicating it, and it gives
  the movement slot a reason to exist for the Conduit, who currently ships with
  no movement passive at all and for a measured reason (`CONTENT_NOTES` §8: Move
  +1 on Vale raised AI search cost 65%).

*Verdict: **adapt**, C1, capped at two new flags.* The slot's problem is not that
it lacks a framework; it is that only four flags have ever been written.

### 1.15 The Deep Dungeon — **adapt into §1.9; reject as a dungeon**

*What it does for FFT.* Ten unlit floors, a hidden exit found by digging with
Move-Find-Item, the game's best gear, and Elidibs at the bottom. It is postgame
content that rewards mastery of systems the main game never forced you to use.

*Does a pillar want it?* The *shape* yes, the *content* no. A gauntlet of hard
authored fights that demand the systems the campaign only introduced is exactly
what this project should want, because the flux grid and the machinery pillar are
under-exercised by a five-battle chapter and the balance report can measure a
ladder. What it should not be is a dark maze with hidden exits — that is
information-hiding as content, and filter 2 kills it.

*The in-fiction version is sitting there.* `STORY_BIBLE` puts the deep archive in
**Gallery Nine-Deep**, an exhausted mine gallery under the Underveins, and puts a
walled-up gallery that miners will not enter in Chapter 2. A descending ladder of
skirmishes down the galleries — each floor a harder grid, each floor a page of
the record — is the Deep Dungeon with the lights on.

*Verdict: **adapt** — the works-skirmishes ladder (§1.9) is the vehicle; the
Deep Dungeon is what it grows into. **Reject** unlit floors and hidden exits.*

### 1.16 FFT carries the brief did not name

Short judgments, so they are on the record.

| FFT feature | Verdict | Why |
|---|---|---|
| **Math Skill / Calculator** | **Reject** | The genre's most famous broken class: free, unlimited, unavoidable damage selected by arithmetic on hidden numbers. It fails filter 2 (the player is doing modular arithmetic on stats the UI does not print) and it fails the balance doctrine. Recorded because someone always proposes it. |
| **Move-Find-Item** | **Reject as-is, adapt as salvage** | Hidden treasure on specific tiles is state the player cannot see. Salvage from a *visible* wreck (a destroyed object leaves a lootable tile) is the same reward loop, legible, and feeds the bench (§2.7). |
| **Two-handing / dual-wield / equip-change as a support passive** | **Adapt, C1, cheap** | Equipment slot rules as a support passive is a proven, legible build lever, and `equipTag` already makes it expressible. |
| **Weapon-specific effects and elemental weapons** | **Open** | `damageType` is authored on weapons already but resolves to nothing (§2.4). This becomes free the day surfaces or resistances exist. |
| **Multi-hit and variable-hit-count attacks** | **Adapt, C0** | Expressible today as repeated effects; the forecast panel would need to sum them. Low priority, listed so nobody thinks it needs engine work. |
| **The Brave Story / in-game encyclopedia** | **Recommend, C2, cheap** | Workstream 12 names it; `STORY_BIBLE` §3c is already written as a registry with one line per entry; tone pillar 1 makes an *annotated* encyclopedia (the record, and the archivist's corrections) the single most on-theme UI in the game. See §5. |
| **Mid-battle save** | **Recommend, C1** | A battle is initial state plus a command log (`ARCHITECTURE`). A mid-battle save is the log, truncated. It is nearly free and it is the difference between a 40-minute battle being a commitment and being a wall. |
| **Unit naming / portraits for generics** | **Reject** | Falls out of §1.4's rejection of generic recruits. |

---

## 2. The wider genre, mined for fit

Each entry: the source, the mechanic, **the Greyfall translation** (what it is
*here*, in fiction), the pillar it serves, the cost class, and how it interacts
with the grid, with CT, and with the legibility doctrine.

*(Honesty note, per the brief: these are recalled from play and from reading, not
from a reference open beside me. Where a specific rule is quoted below and it
matters, it is marked as fuzzy. The design arguments do not depend on the
disputed details.)*

### 2.1 Tactics Ogre / Reborn

**(a) Branching routes.** Law/Neutral/Chaos forks that reorder chapters, gate
recruits, and produce genuinely different middles.

*Verdict: **reject** at campaign scale.* `STORY_BIBLE` Layer 0 is binding and its
ending is the argument the whole game makes; a route system either produces
cosmetic branches (dishonest) or unwrites the thesis (not on offer). What is
already sanctioned and should be built instead: the **flagged forks inside a
chapter** that `STORY_BIBLE` Appendix B and §3b name — Orin's Chapter 4 fork, the
4.9 triage fork, which archive the dry floor kept.

*Those need flags, and flags do not exist at either layer.* `ENCOUNTER_NOTES`'
open gap 7 is that triggers cannot read or write state — "no 'only if the mains
were cut', no 'only if this unit still stands'" — so `once: true` plus condition
ordering is the entire control flow inside a battle, and both e2 and s1 fake a
repeating trigger with a hand-written twelve-unit-turn ladder of six discrete
`setPower` triggers. `STORY_BIBLE` §3b separately asks for campaign flags for
both forks. One small flag facility, readable and writable by triggers and
persisted on `CampaignState`, discharges an encounter-workstream gap and a story
ask at the same time. **C1, and the highest-leverage small item in this
document** — it is not on the top-8 because it is infrastructure rather than a
feature, but it unblocks §3.6, both story forks, and the ladder workaround.

**(b) The Chariot — rewind up to ~50 turns.**

*This is architecturally almost free here*, and that is worth saying plainly: a
battle is initial state plus a seeded command log, so replaying to turn N is a
supported operation the golden-replay tests already do fifteen times a run. The
question is entirely a design one.

*Verdict: **adapt down to one step.*** A 50-turn rewind and `PROGRESSION` §3's
permadeath doctrine are in direct conflict: "a win banks and buries" is only
meaningful if the win cannot be re-rolled until nobody died. But most of what
players want from a chariot is not tragedy insurance, it is **undo-a-misclick**,
and that subset is safe here precisely because there is no hidden information to
leak by undoing (see §5). Ship the one-step undo; do not ship the chariot.
*Cost of the undo: C1, controller-level.* Recorded so the full rewind is not
re-proposed as "we already have the log".

**(c) Union level** — a story-driven cap on unit level, which kills grinding by
removing its reward.

*Greyfall translation.* We do not level, but we do have an unbounded Standing
grind: `PROGRESSION` §7 lets a won encounter be replayed for Standing forever. The
in-fiction cap writes itself — the Assay meters everything, and a trade's
Standing is **rated hours**: a chapter credits a bounded amount, and work past it
counts for the record but not for the account.

*Verdict: **recommend**, C1 and tiny.* Serves the balance doctrine directly; the
measured earn rate (`PROGRESSION` §2: ~199 per chapter) already tells us where to
put the ceiling. Listed in §5 as a QoL/hygiene item rather than in the top 8,
because its player-facing impact is a number nobody notices when it is right.

**(d) Buff cards dropped on the field** (Reborn).

*Verdict: **reject as cards; adapt as dropped cells.*** Free-floating stat buffs
on tiles are exactly the "the board has state" space the flux grid already owns
(filter 4). But *one* pickup is not merely allowed, it is demanded by bible §5.1:
a downed Conduit or a wrecked cell bank should leave **a cell on the tile**, and
picking it up should restore flux. "Where does the power come from" gets a
literal answer lying on the floor. C1, one object kind with an `onContact`
payload — a mechanism that already exists (§14).

### 2.2 Triangle Strategy

**(a) Elemental terrain interactions.** Fire spreads across flammable tiles and
burns units standing in it; ice makes tiles slick; water tiles amplify or chain
lightning. *(The precise chain rules are fuzzy in my memory; the shape is not.)*

**(b) Conviction** — three hidden axes (Utility/Morality/Liberty) accrued from
choices, gating recruits and story votes.

*Verdict on (a): **recommend**, and see §2.4 where it merges with the Divinity
entry into one proposal — this is the single highest-fit borrowed idea in the
document after Into the Breach's telegraphs, and the reason is mechanical rather
than thematic: `DamageType` (`kinetic | arc | thermal | chemical`) is authored on
every weapon and every damage effect in the game and **resolves to nothing**. It
is a four-member enum that only the renderer and the event log read. A whole axis
of authored content is inert.*

*Verdict on (b): **adapt, later**, C2.* Conviction maps onto standing with the
three institutions — Combine, Ledger, Assay — which is a natural fit for the
work-order economy (§1.7) and a natural gate for which faction offers which
order. But it should be **visible**, not hidden (filter 2, and the Assay-form
interface makes a three-column standing sheet the most natural document in the
game). Do not build it before §1.7 exists; it is that system's second act.

### 2.3 Into the Breach — perfect information and telegraphed intent

**The mechanic.** Every enemy shows exactly what it will do next turn — which
tile, how much, which direction the push goes — before the player moves. There is
no dodge roll and almost no randomness. The game is a puzzle with a visible
solution space, and its difficulty comes from the constraint set, not from
uncertainty.

**Measured against the legibility doctrine: this is the closest philosophical
match in the genre.** `FLUX_GRID` §2.5 already says every state change is visible
without hovering and every change names its cause; §2.5(c) already forecasts what
an order would flip; `UI_DESIGN` §8 already says an order with no preview is an
order the player learns by spending a turn on it. Into the Breach is that doctrine
applied to the *enemy's* half of the board, which is the half Greyfall currently
does not cover at all.

**What Greyfall is missing, concretely.** Three holes, in order of severity:

1. **Deployables fire with zero warning.** `COMBAT_RULES` §6 rides a turret on
   its own CT timeline at `autoAttack.speed`, resolving before any unit turn at
   100 CT, and §6 explicitly keeps deployables out of `turnOrderPreview` on the
   grounds that the preview answers "who acts next". That reasoning is sound for
   the queue and wrong for the player: a Machinist's sentry frame is a scheduled,
   fully deterministic, *forecastable* event that the interface never mentions.
   The information is already computed — the object's CT, its speed, its range,
   its target selection rule (nearest hostile, distance then unit id).
2. **No threat range.** Nothing shows which tiles a given enemy can reach and
   strike on its next turn. This is derivable purely from existing selectors
   (`reachableTiles` ∘ `targetableTiles`) and is the standard readout of every
   tactics game made in the last fifteen years.
3. **Charges in flight are in the queue but not on the board.** §7 snaps a
   unit-targeted charge to the tile at cast time — "the charge lands where it was
   aimed, not where the target ran to" — which is a *great* rule and completely
   invisible: the tile it will land on is not marked.

**The CT wrinkle, and why it does not sink the idea.** Into the Breach is
round-based and telegraphs a *decision already taken*. Greyfall is CT, one unit
at a time, and — this is an architectural fact, not a gap — the enemy's choice
genuinely does not exist until its turn: `AI_DESIGN`'s contract is a pure,
stateless `chooseCommand(state)` with **no lookahead, no multi-turn plan and no
persisted intent**, re-derived from scratch after every command. There is no plan
object an engine could surface even if we wanted one, and building one to feed a
telegraph would mean building the planner Greyfall deliberately does not have.

So Greyfall cannot promise "this is what they will do". It can promise something
almost as valuable and entirely honest: **"this is what they could do, and this
is what is already committed."** The first is a capability overlay, derived from
the same selectors the AI reads; the second is a *promise*, because charges,
deployable fire, and timed grid loads are already scheduled and already
deterministic. Distinguishing the two on screen — a threat wash for the possible,
a hard mark for the committed — is the whole design.

**The evidence that this is the top item and not a nice-to-have.** Everything
`BALANCE_REPORT` §7.8.3–§7.8.5 found the hard way is this problem wearing
different clothes. A first-time player "cannot get off the board" what the search
reads instantly from an `operable` payload; the sim wins fights a human loses six
times out of six; and the fix, in every case, was a *readout* — the power
register, the annunciator's cause clause, the load line, the Operate cursor
forecast. Each of those was built after a specific mechanic embarrassed itself.
The threat layer is the same fix applied to the one part of the board that has
never had it, and applied before rather than after.

*Pillars served:* the mechanical thesis directly — a battlefield that is a system
is only a system if you can read it — plus filter 2 as doctrine.

*Interaction with the grid:* complementary, not duplicative. The grid tells you
what the *board* is doing; this tells you what the *bodies* are doing. They share
the same overlay layer and the same "ask the rules, don't model them twice"
discipline.

*Cost:* C2, and the three holes above are independently shippable.

*Measurement (§0.3):* this one is genuinely hard to measure with a sweep, because
both sides are the AI and the AI already has perfect information — a threat
overlay cannot move a win rate by construction. That is not an argument against
it; it is `FLUX_GRID` §6.7's acceptance test again: **a human plays a battle and,
without being told, can answer "what is about to hit me, and from where"** —
precisely the class of change `BALANCE_REPORT` §7.8.5 says the sweep cannot
arbitrate, and precisely the class it has twice been wrong about.

*Verdict: **recommend**, ranked #1.*

### 2.4 Divinity: Original Sin / Baldur's Gate 3 — surfaces

**The mechanic.** Water conducts electricity and freezes; oil is flammable and
slows; fire on water makes steam which conducts; blood is a surface; grease
burns. Surfaces are created by abilities, persist, spread, and combine, and the
combinations are the game's most-loved emergent system.

**Merged with §2.2(a): one proposal, two sources.** Triangle Strategy is the
grid-native, small, authored version of this and Divinity is the maximal
simulationist version. Greyfall wants Triangle Strategy's scope with Divinity's
industrial vocabulary.

**The Greyfall translation, in fiction.** Not "elements" — the bible's naming
rules (§9) forbid generic fantasy vocabulary, and this game already has the right
words. **Surfaces are what the workplace spills.**

| Surface | Made by | Does |
|---|---|---|
| **Wet** | ruptured line, sprinkler, a water tile, a coolant bleed | `arc` damage chains to adjacent wet tiles; boosts arc, dampens thermal |
| **Slick** (oil, tallow, lubricant) | Cinder Oil, a ruptured sump, a wrecked press | `thermal` ignites it into **Burning**; movement cost or a forced-move overshoot |
| **Burning** | thermal into slick, a flared gas line | tick damage on entry; consumes the slick over time |
| **Steam** | thermal into wet, a vented line | blocks line of sight; conducts `arc` |
| **Ash / dust** | Foundry ambience, a demolition | blocks line of sight; `chemical` interaction |

**Why this is high-fit and not just fashionable.**

- It makes `DamageType` load-bearing for the first time, retroactively giving
  every already-authored weapon and ability a second dimension **at zero content
  cost**. That is the same argument `FLUX_GRID` §3 made about the Conduit's four
  existing abilities gaining depth for free, and it is the strongest available
  evidence that a mechanic is the right shape for this game.
- The Saboteur, the Chemist and the Conduit each get their pillar sharpened:
  Cinder Oil is currently a damage-over-time status, and it *should be* a tile
  that catches. Bible §6 says the Saboteur "makes destructible terrain a plan
  rather than an accident"; surfaces are the same sentence for fluids.
- It is the industrial-fantasy setting's most obvious untapped resource. A
  refinery that cannot spill is not a refinery.

**Where it must be constrained, and these are hard.**

- **It must not duplicate the grid** (filter 4). The distinction is clean and
  should be written into whatever design doc takes this on: *the grid is
  authored, static topology of powered machinery, and it is a graph; surfaces
  are emergent, transient, unauthored tile state, and they are a set of tiles.*
  They meet in exactly one place — a wet tile touching an energized node — and
  that intersection should be a deliberate, authored, spectacular interaction,
  not a general rule.
- **Spreading is the trap.** Divinity's surfaces spread and combine
  combinatorially, which is delightful and is a determinism-and-legibility
  nightmare at our ordering discipline (`COMBAT_RULES` §17). v1 should have
  **no spread**: a surface is created on exactly the tiles an effect names, it
  expires on a turn count like a status, and interactions are a fixed table
  consulted at damage time. Spread is a v2 question with a mandatory findings
  flag.
- **The forecast has to report it** (`UI_DESIGN` §8: the forecast reports the
  whole order). "Arc, 12 → 18 on wet" is a forecast line, and if it is not, the
  mechanic is invisible and we have rebuilt e2's press windows in a new
  material.

- **The AI has to be able to value it, in the same pass.** `BALANCE_REPORT` §6.7
  G4 is the precedent and it is unambiguous: an object with nobody standing on it
  scores a flat 15, so "the whole 'the map is the target' pillar is invisible to
  the search unless somebody is standing on the thing", and sixteen abilities read
  as never-chosen partly for that reason. Surfaces would land in exactly the same
  hole — a slick nobody is standing in is worth nothing to a search that cannot
  see that the Saboteur is about to light it. `FLUX_GRID` §4.5's answer is the
  model to copy: a small number of named terms plus a **surface affinity read
  from the kit**, never authored, exactly as object and grid affinity already are.

*Cost:* C2 — a tile-state array in `GameState`, one effect (`applySurface`), a
damage-time lookup table, expiry on the existing turn clock, renderer tinting,
forecast rows, AI terms. Notably it needs **no new command kinds** and no AI
candidate generator change, exactly as the grid needed none.

*Measurement (§0.3):* counters for surfaces created and destroyed by side, units
damaged by an interaction rather than by a direct hit, and a
`surfaces-never-interact` findings flag — the direct analogue of
`grid-never-contested`. Without it the mechanic can ship, measure fine on win
rate, and never once actually happen.

*Verdict: **recommend**, ranked #2.*

### 2.5 Fire Emblem

**(a) Rewind (Mila's Turnwheel / Divine Pulse).** *Adapt to one-step undo; see
§2.1(b) and §5.*

**(b) Support relationships.** Adjacency in battle accrues points between two
units; ranks unlock conversations and combat bonuses.

*Greyfall translation.* The company is six people who desert together and lose
each other one at a time across five chapters. `STORY_BIBLE` §3b already asks for
the **lodge book** — a campaign-persistent record of the fallen, by name, given
to the player as UI — and describes the crew's relationships as the campaign's
emotional spine.

*Verdict: **adapt with caution**, C2.* The risk is genericness: support-conversation
systems are the most copied thing in the genre and this game's register
("grounded, unsentimental, dry"; humor "from working people's gallows wit, never
from quips") is the register they are worst at. The version that fits is *not*
paired conversations with hearts; it is the lodge book plus a small,
legible, in-fiction adjacency effect — **working a job together**: two units who
have fought a battle side by side get a named, printed bonus when adjacent, and
the book records who worked with whom. Make the record the reward and the number
small.

**(c) Weapon triangle.** *Verdict: **reject**.* Sword>axe>lance is a
rock-paper-scissors layer whose whole function is to make weapon choice matter,
and Greyfall already has `equipTag`, `damageType`, and (if §2.4 lands) surfaces
doing that job with more fiction behind them. `COMBAT_RULES` §5's stated
discipline — "keeping it means one number moves per concept" — is the argument
against adding a second multiplier to the same decision.

### 2.6 Disgaea — geo panels

**The mechanic.** Coloured panels tile regions of the map; geo symbols placed on
panels apply effects (No Entry, +50% ATK, Damage 20%) to every panel of their
colour; destroying a symbol changes or clears colours and chains explosively
across the board.

**Compared honestly against the flux grid, as the brief asks.** They are the same
idea at different temperatures. Both are: authored board-state, forming
components, with a cascading recompute, that both sides can edit, requiring a
readout. The grid is the sober industrial version — capacity, load, a latching
trip, four roles, an authored topology; geo panels are the maximalist version —
colour-space, chain multipliers, a bonus-gauge payoff.

**What geo panels have that the grid does not, and whether we want it:**

| Geo panel property | Have it? | Want it? |
|---|---|---|
| Tile-scoped *stat* effects (this region gives +ATK) | No | **No.** Invisible-to-forecast stat math over regions; a legibility problem and a balance one. |
| A player-placeable network piece | Barely — Machinist deployables are not grid nodes | **Yes**, and it is already the flux grid's v2 (mobile sources / the flux cart, `FLUX_GRID` §4.3, §8) |
| Chain destruction as spectacle | No | **No.** Deliberately: `FLUX_GRID` §1.5 chose a total latching trip over shedding *precisely* to keep cascades one-glance readable. |
| Colour as a second, orthogonal topology | No | **No** — filter 4, squarely. |

*Verdict: **reject** as a system.* Recorded with reasons because "geo panels for
the industrial setting" is an idea that will be proposed again and it is
attractive right up until you notice we shipped it, sober, and called it the flux
grid. Take exactly one thing: player-placed nodes, which is already on the v2
line.

### 2.7 Fell Seal: Arbiter's Mark — crafting, through the Chemist lens

**The mechanic.** Battles drop materials; a crafting menu turns materials into
equipment and consumables, which is Fell Seal's answer to FFT's shop-only
progression. *(My memory of the exact recipe/menu structure is moderate; the
design point does not depend on it.)*

**The Greyfall translation.** **The bench.** Bible §6: the Chemist's kit "reads
like a portable lab", and "item mastery is the job identity". `ITEMS.md` and
`PROGRESSION` §4 leave a hole exactly the size of this: the satchel only ever
depletes, so the Chemist's identity is a countdown and by battle 5 the job is a
worse Enforcer.

*What it fixes, in one sentence:* it turns "nothing refills the satchel" from a
deferral into a *system with a job attached*, and it does so without inventing a
currency, a vendor, prices, or stock tables.

*v1 sketch.* Between battles, a bench screen: a recipe list gated by the party
having a Chemist and by that Chemist's job level; inputs are **salvage** (from
destroyed objects and the fallen's kit, per §1.16's Move-Find-Item adaptation)
and Standing; outputs are the seven shipped consumables plus a small number of
bench-only compounds that no requisition list carries. `Item.price` finally gets
read, as a salvage value rather than a shop price.

*Pillars:* magic is labor (§2.2 — "every spell has a supply chain") made literal
for the one job whose supply chain is its own hands.

*Interaction:* none with the grid or CT; entirely between-battle. That is part of
why it is cheap.

*One measured argument in its favour, and one caution.* `BALANCE_REPORT` §7.8.2
is the only deep study of consumables in the project and it found them
*decisive*: every arm of the e2 sweep carrying the enemy Caustic Flask landed
16.7–25.0%, every arm without it 39.6–45.8%. One flask is worth roughly twenty
points of win rate. So the resource the bench refills is not a comfort item, it
is one of the largest levers measured anywhere in the balance report, and a
system that produces more of them needs pricing with that number in hand. The
caution is the same section's counter-intuitive result — Bench Grade's range
bonus was worth **+4 to +8 to the opposing party**, because it made the enemy
throw earlier and from further out. Item value here is not monotone and the bench
should not be balanced by intuition.

*Cost:* C2.

*Verdict: **recommend**, ranked #4.*

### 2.8 XCOM

**(a) Overwatch / reaction fire.** Spend your action to arm a shot that fires
when an enemy moves through your cone.

*Greyfall translation.* "**Set**" — the Enforcer's shield line, the Machinist
covering a doorway. Mechanically it is a self-applied status that grants a
temporary reaction, which is a hook that does not exist: statuses cannot grant
reactions, and `COMBAT_RULES` §9 fixes reaction triggers at four.

*Two engine facts that shape it, both of which make it more honest than XCOM's.*
First, §14's deliberate rule that contact payloads check the tile a unit *ends*
on, not every tile of the path, because "interrupting a move mid-path would make
the `UnitMoved` event's own path a lie". Overwatch inherits that: **Set fires at
the end of the mover's move, not mid-path.** That is less cinematic and much more
forecastable. Second, reactions never chain (§9), so a Set line cannot cascade.

*Does a pillar want it?* Yes for the Enforcer, whose bible fantasy is "holds
lines, pins targets, punishes adjacency" and who currently has no way to threaten
a tile she is not standing on. It is also a *deterministic telegraph*: a Set unit
is visibly covering ground, which serves §2.3's doctrine rather than fighting it.

*Cost:* C1 (a status→reaction grant, plus one movement-end trigger) plus C2 if
the covered tiles are drawn, which they must be.

*Verdict: **adapt**.* Just below the top 8; it is the strongest of the
near-misses and it should be built the moment §2.3's overlay layer exists,
because it shares that layer.

**(b) Pod activation.** Enemy groups are inert until spotted, then get a free
reposition.

*Verdict: **reject**.* It is a pacing device for a fog-of-war game and Greyfall
has full information by doctrine. The pacing job it does — staged reinforcement,
a fight arriving in acts — is already done, better and legibly, by authored
triggers (`COMBAT_RULES` §15's `spawnUnits`, `unitEntersTiles`,
`unitHpBelowPercent`), which `ENCOUNTER_NOTES` uses as its ordinary vocabulary.

### 2.9 Banner Saga

**(a) Willpower** — a per-battle pool spent to boost any action (extra damage,
extra movement, better odds), refilled by resting and by kills.

*Greyfall translation.* We already have the industrial version of this and it is
called **charge** — carried flux, spent on abilities, topped up by Tap Line and
Backfeed. Willpower's distinguishing idea, though, is that it boosts *ordinary*
actions rather than buying special ones, which flux does not do.

*Verdict: **adapt, small, later**, C1.* One ability-independent verb — "push it"
— that spends flux to add to a basic attack or to a step. Attractive, low
priority, and it needs a balance pass more than a design one because it
interacts with every number in `COMBAT_RULES` §4.

**(b) Morale.** *Folded into §1.12's Resolve recommendation, which is where the
bible already put it.*

**(c) One currency for advancement and supplies.** *Folded into §1.8.*

### 2.10 Symphony of War / Unicorn Overlord — squad composition

**The mechanic.** Units are grouped into squads of 4–6 occupying one map token,
with formation rows (front absorbs, back attacks); clashes between squads resolve
largely automatically. Unicorn Overlord adds player-authored tactics scripts
(if-this-then-that ordering within a squad).

*Verdict: **reject**, both halves, and the reason is the same for both.* The
squad layer exists to let a game field forty units on a strategic map; it buys
scale by *deleting the tile-by-tile tactical decision*, which is the thing this
game sells. Tactics scripting deletes the decision from the other end, by
automating it. Neither is a fit for a game whose entire pitch is "the battlefield
is a system you personally operate".

*One thing worth taking, and it is not the squad.* Both games make **pre-battle
composition a real decision**, and `PROGRESSION` §7 admits ours is deliberately
minimal ("the deployment tiles are pre-filled from the top of the roster... Picking
*which* tile, and facing at deploy time, are a later pass"). On maps whose thesis
is approach and height (`MAP_NOTES` passim), where you start is a tactical
decision the game currently makes for you. **Recommend** finishing the formation
screen: C2, small, and listed in §5.

### 2.11 Mario + Rabbids: Kingdom Battle — movement tech

**The mechanic.** Movement is the star: a unit can dash *through* an enemy for
free damage, team-jump off an ally to extend its move enormously, and chain the
two in one turn, so a turn is a route rather than a step. Warp pipes extend the
route further.

*Greyfall translation.* This is the most obviously on-fantasy borrowing in the
document and two jobs are already reaching for it. Bible §6: the Railrunner
"moves along rail tiles at multiplied speed, rides freight hooks and lifts"; the
Augmented has "hydraulic leaps". `moveSelf` (three directions) and `forceMove`
already exist, and `piston-lunge` already opens with a `moveSelf toward-target 2`.

Two concrete abilities, both nearly free:

- **Vault** — the team jump. Starting adjacent to an ally, launch past them:
  reach beyond Move, over a height delta the unit could not otherwise clear,
  landing on the far side. In fiction it is a boost off a workmate's shoulders on
  a gantry, which is precisely the register of the game. Needs `moveSelf` to be
  able to *use* an ally's tile as an origin rather than stopping at it — one
  rule, C1.
- **Run-through** — dash damage along the path. The Railrunner's Rail Dash
  should hurt what it passes. Blocked today by exactly the rule §14 states: the
  engine checks contact at the destination only. A `line`-shaped area resolved
  from the *path* rather than from the facing axis is the honest way to express
  it and it does not require mid-move interruption.

*Pillars:* the battlefield is a workplace — vertical, cluttered, and traversed by
people who work in it. *Cost:* C1 for both. *Interaction:* none with the grid;
CT-neutral; both fully forecastable.

*Verdict: **recommend**, ranked #8 — the cheapest real delight in the document.*

*Landed* as pathing vocabulary rather than as two action abilities: three
`movement` passive flags (`allyVaultHeight`, `deckVaultHeight`,
`moveThroughEnemiesOnRail`) and two purchasable passives, Leg Up (Saboteur) and
Right of Way (Railrunner). Rules: `COMBAT_RULES` §10a; content reasoning:
`CONTENT_NOTES` §4. The vault became "launch off an ally's tile" — the sketch's
own fiction — because allies were already passable and the height ceiling was
the only thing actually stopping it. Run-through-as-damage (a `line` area
resolved from the path) is *not* built and is still open.

### 2.12 Final Fantasy Tactics Advance — laws (a reframe, not an import)

Named here because it is FFT-family and because the reframed version is
unusually well suited.

**The mechanic.** A judge enforces a randomly-drawn law per battle ("no fire
damage", "no items"); breaking it draws a card and, in the first game, jails your
unit. Widely disliked, for good reasons: arbitrary, punitive, and it forbids the
thing you built for.

**What it is *here*, and why the reframe works.** The interface is a form issued
by a standards bureau (`UI_DESIGN` §1); the Assay licenses, meters and files; and
the encounter workstream has exactly two polarities in its vocabulary — the
**stake** (a second loss condition, currently only `unitDowned: rowen` on e1 and
e5) and the **merciful objective** (the `all`-group win that spares
non-combatants, e2 and s1). Between "you lose" and "you win differently" there is
nothing. Recast FFTA's laws as **standing orders**: authored, stated-up-front,
never-random secondary objectives with a *recorded* consequence rather than a
punitive one — the third polarity, and the one that costs the player nothing but
the record.

> ORDERS: Corvane property is not to be damaged. Combine members are not to be
> put down.

Break one and you still win the battle; the Standing award changes, the Inquiry's
record of the battle changes, and — the part that makes this worth building —
tone pillar 1 gets a mechanic: **the official record of what you did is
generated from what you actually did, and it is wrong in ways you can now
compare.**

*Cost:* C1 for the condition vocabulary (it reuses the existing win/loss
condition shapes almost exactly), C2 with the post-battle record screen.
*Interaction:* none with the grid; it is an encounter-authoring layer.

*Verdict: **recommend**, ranked #6.*

---

## 3. The ranked shortlist

Ordered by pillar fit × player impact ÷ cost. Each entry states the v1 that
should be built, which is in every case smaller than the idea.

### 3.1 #1 — Telegraphed intent: the threat layer (Into the Breach)

**v1 scope.** Three independently shippable pieces on one overlay layer, in
order. **(a)** Put committed, already-scheduled events on the board: a charge in
flight marks the tile it will land on (§7 snaps it at cast time, so the tile is
known and currently unshown); a deployable with an `autoAttack` shows its range
ring and its ticks-to-fire; a timed grid load shows the component it is hanging
on and when it expires. **(b)** A threat overlay for one hostile at a time —
hovering an enemy paints the tiles it could reach and strike on its next turn,
composed from the existing `reachableTiles` and `targetableTiles` selectors with
no new model of anything. **(c)** A union overlay on a key-hold: everything every
hostile threatens, in one wash, for the "can I stand here" question. Costs: (a)
is the cheapest and closes the worst hole; (b) is the standard genre readout; (c)
is the one that needs care not to become soup. **This asks the rules and does not
re-model them**, exactly as `FLUX_GRID` §2.5(c) established, so it cannot drift
from the engine. **Ranked first because it is the only item in this document that
the legibility doctrine already obliges us to build** — `UI_DESIGN` §8 says an
order with no preview is an order the player learns by spending a turn on it, and
a turret firing out of a clear sky is precisely that, on the enemy's side of the
board.

### 3.2 #2 — Surfaces: wet, slick, burning, steam, ash (Triangle Strategy / Divinity)

**v1 scope.** A `surfaces` array on `GameState` — tile index, kind, expiry in the
caster's own turns, using the clock statuses and timed loads already use. One new
effect, `applySurface`, routed to *tiles* in `COMBAT_RULES` §13's table beside
`spawnObject`. **No spread and no chaining in v1**: a surface covers exactly the
tiles the effect named. A fixed interaction table consulted at damage time and
printed in the forecast: `arc` on **wet** steps up and reaches adjacent wet tiles;
`thermal` on **slick** converts it to **burning**; `thermal` on **wet** converts
it to **steam**, which blocks line of sight; **burning** ticks on entry and
consumes its slick. Three or four existing abilities are re-authored onto it
(Cinder Oil makes slick rather than applying a status; a ruptured line makes wet;
Smoke Canister becomes the ash case) so the mechanic ships with content rather
than waiting for it. Renderer: a tile tint per surface, and the forecast panel
gains one line — a damage number that changes because of the tile it lands on
must say so, or this is e2's press windows in a new material. **The one hard
boundary, written into the design doc that takes this on: the grid is authored
static topology and is a graph; surfaces are emergent transient tile state and are
a set. They intersect in exactly one authored place — a wet tile against an
energized node — and nowhere else.** Ranked second because it makes an entire
authored dimension (`DamageType`, on every weapon in `data/items`) load-bearing
for the first time, at zero content re-authoring cost.

### 3.3 #3 — Work orders (FFT propositions)

**v1 scope.** A between-battle screen listing three to five available orders,
each from a faction (Combine, Ledger, Assay, a House), each costing *N encounters
elapsed* rather than days, each requiring one to three roster units who are then
unavailable for that many battles. Outcomes are authored, not rolled: Standing,
salvage for the bench, items, a document (a lore entry, which is the thing the
counter-record is made of), and occasionally a unit or a side battle. State is a
small array on `CampaignState`; the clock ticks in `applyBattleResults`, which
already runs at exactly the right moment. Content schema: one file per order,
validated like everything else. **The design constraint that makes this good
rather than busywork: an order must cost something real.** Sending three units on
a two-battle order means fighting the next two battles shorthanded, and against
`PROGRESSION` §3's permadeath rule that is a genuine decision. Ranked third
because the fiction wrote it already — the Compact runs on work orders, Standing
is standing with your trade, and `STORY_BIBLE` describes Chapters 2–3 as the
company doing this for a living — and because it is the only item here that
creates *campaign structure* rather than battle depth.

### 3.4 #4 — The bench (Fell Seal, through the Chemist)

**v1 scope.** A between-battle screen with a recipe list. Inputs: salvage
(awarded from destroyed map objects and from the fallen's returned kit) and
Standing; a gate on having a Chemist in the roster and on that Chemist's job
level, so the recipes are *hers* and job identity has a between-battle
expression for the first time. Outputs: the seven shipped consumables, plus two
or three bench-only compounds. One op (`craftItem`) over the existing `inventory`
array — the same shape `PROGRESSION` §4 already sketched for `buyItem`. `Item.price`
is finally read, as salvage value. Ranked fourth because it closes a hole the
docs already name ("nothing refills it"), because it is the *cheaper and better-
fitting* replacement for the deferred shop rather than an addition to it, and
because it rescues a job: a Chemist whose satchel only depletes is a worse
Enforcer by battle 5.

### 3.5 #5 — Resolve under fire: suppression, flinch, and bolt

**v1 scope.** Discharge bible §7's promise that "low-Resolve units flinch; very
low-Resolve units may bolt" and `COMBAT_RULES` §8's deliberately-recorded
simplification that status chance ignores the disposition pair. Two pieces.
**(a)** A `resolveScaled` flag on `applyStatus` (mirroring `attunementScaled` on
`Amount`, so the shape is one the codebase already has) making suppression,
fear and morale effects land on the shaken and slide off the steady — the
Enforcer's Kettle, riot doctrine, and the whole suppression half of that job's
bible fantasy become mechanically real. **(b)** A **Bolt** status: at very low
Resolve, after a triggering event, the unit spends its turn moving away from the
nearest hostile and cannot act — FFT's chicken, without the comedy, in a game
about people being asked to do something they signed up for and did not expect.
Recovery on its own turn clock like every other status. Ranked fifth because the
bible has *already committed to this in binding text* and the engine does not do
it; because it gives Resolve — currently a single number that gates one roll —
the second dimension the bible describes; and because `STORY_BIBLE` §3b hangs
Dray's entire boss-fight tragedy on the pair meaning something.

### 3.6 #6 — Standing orders: secondary objectives with a recorded outcome (FFTA laws, reframed)

**v1 scope.** An optional `orders` array on the encounter: authored conditions
stated on screen before the battle, checked at the end, each with a Standing
delta and a line of record. They reuse the win/loss condition vocabulary
(`unitDowned`, `objectDestroyed`, `unitEntersTiles`, a turn count) almost
unchanged, which is why this is C1 and not C3. Breaking one never ends the
battle — that is the entire difference from FFTA and the reason the reframe
works. The payoff screen prints two columns: **what you did** and **what the
record says**, and on some battles they deliberately differ, which is tone pillar
1 as a mechanic rather than as a frame device. Ranked sixth because encounter
design currently has only the **stake** and the **merciful objective** — no
vocabulary at all for "and try to do it without wrecking the floor" — and because
it is the cheapest item in this document that serves the *narrative* thesis
rather than the tactical one. Its one dependency is the flag facility in §2.1(a);
orders checked purely against end-state need nothing, orders about *how* you got
there need somewhere to write it down.

### 3.7 #7 — Roster growth: joins, fighting guests, and the lodge book

**v1 scope.** Three small pieces that the campaign spine needs before Chapter 2
can exist. **(a)** `recruitUnit` — one pure op appending to `CampaignState.roster`
with a fresh `UnitProgress`, driven from a campaign-definition hook naming which
encounter or flag brings whom. **(b)** A `controller: "ai"` flag on a
`player`-team unit, so a guest can fight without a fourth team and without an AI
change, with the hard rule that a guest is never a silent loss condition. **(c)**
The lodge book — `STORY_BIBLE` §3b's ask, and the cheapest emotional payload
available: `FallenRecord` already stores name, job, level and encounter, and
nothing reads it. Give it a screen in the Combine's own register. Ranked seventh
because it is *necessary rather than clever* — the party is fixed today, the
campaign's party is not, and someone has to build this before Chapter 2 is
authorable — and because (c) alone is an afternoon's work for a real return.

### 3.8 #8 — Movement tech: vault and run-through (Mario + Rabbids)

**v1 scope.** Two abilities and one rule change. **Vault**: an ability whose
`moveSelf` may originate *over* an adjacent ally's tile, reaching further and
across a height delta the unit could not clear alone — the Augmented's hydraulic
leap and the Railrunner's gantry work, both named in bible §6 and neither
currently expressible. **Run-through**: a `line` area resolved along the actor's
*travelled path* rather than along the facing axis, so Rail Dash hurts what it
passes without violating §14's rule against interrupting a move mid-path (the
damage resolves once, at the end, against the path the `UnitMoved` event already
reports). Ranked eighth because it is the cheapest item in the top eight, because
it is pure job-identity payoff for the two jobs whose bible fantasies are most
under-served by the current effect vocabulary, and because movement is the one
verb in a tactics game that every player uses every turn.

### 3.9 Just below the line

Not rejected — sequenced. Each is a real recommendation that lost a slot to
something cheaper or more load-bearing.

- **The flag facility** (§2.1a) — C1, and arguably it should displace something
  above. It is off the list only because it is plumbing: it ships no player-facing
  feature by itself, and it unblocks three that are on the list.
- **Set / overwatch** (§2.8a) — the Enforcer's missing verb, and a *deterministic*
  telegraph rather than a competitor to one. Build it the moment §3.1's overlay
  layer exists, because it shares that layer and is half price after it.
- **Conviction as faction standing** (§2.2b) — the second act of §3.3, not a
  system of its own. Do not start it first.
- **Per-job stat growth** (§1.3) — blocked behind unit levelling, which nothing
  implements. Worth doing *visibly* when levelling lands, and worth refusing in
  FFT's hidden form.
- **"Push it": spending flux to boost an ordinary action** (§2.9a) — attractive,
  cheap, and it touches every number in `COMBAT_RULES` §4, so it wants a balance
  pass more than a design one.

---

## 4. Rejected, and why

Recorded so they are not re-litigated. The first three are the ones most likely
to be proposed again.

**1. Disgaea's geo panels — because we shipped them, sober, and called it the
flux grid.** Colour-space topology, chain destruction and tile-scoped stat
regions occupy the exact design space `docs/design/FLUX_GRID.md` already owns:
authored board state, connected components, a cascading recompute, both sides
editing it, a mandatory readout. A second network on the board does not double the
depth, it halves the attention each one gets, and `FLUX_GRID` §1.5 explicitly
*chose* a total latching trip over cascading load-shedding because cascades are
unreadable. Take one thing only — player-placed nodes — which is already on the
grid's own v2 line (§8, mobile sources).

**2. FFT's 3-turn crystal / permadeath timer — because it is a resurrection
window and this world has none.** Creative bible §5.4 is binding ("nothing
recalls the dead") and `COMBAT_RULES` §4 already implements it ("downed units
cannot be healed"); FFT's timer only makes sense in a game with Raise. The
campaign has already resolved the tension the timer exists to create, at the right
layer and with a better sentence: bible §12 ruling 2 (downed ≠ dead for named
characters) plus `PROGRESSION` §3's *a loss changes nothing, a win banks and
buries*. And the crystal's reward half — absorb a fallen ally for their entire
skillset — is unshippable in a game whose thesis (bible §12) is that institutions
render people into resources: we cannot make that the *good* outcome.

**3. Branching campaign routes (Tactics Ogre) — because the ending is the
argument.** `STORY_BIBLE` Layer 0 is binding: the truth is filed, not published;
Rowen is erased but alive; the world does not change and the record does. A route
system either produces branches that do not touch that (dishonest, and expensive
for nothing) or unwrites it. What is sanctioned and should be built instead is
the flagged fork *inside* a chapter — Orin's Chapter 4 fork, the 4.9 triage fork —
which `STORY_BIBLE` Appendix B already reserves and which needs only campaign
flags.

**Also rejected, briefly:**

- **Generic-unit recruitment** — an infinite roster and `PROGRESSION` §3's
  permadeath cannot both be right (§1.4).
- **Monsters and poaching** — the world has no bestiary and bible §2's register
  is the reason; the item-acquisition job poaching does is done better by salvage
  and the bench (§1.5).
- **Random battles** — a battle nobody designed on a map with no thesis, against
  a practice (`MAP_NOTES`, `ENCOUNTER_NOTES`) built entirely on authored theses.
  The authored repeatable ladder is the version that survives (§1.9).
- **Squad composition and tactics scripting (Symphony of War / Unicorn
  Overlord)** — both buy scale by deleting the tile-by-tile decision this game
  sells (§2.10).
- **The weapon triangle (Fire Emblem)** — a second multiplier on a decision
  `equipTag` and `damageType` already carry; against §5's "one number moves per
  concept" (§2.5c).
- **Pod activation (XCOM)** — a fog-of-war pacing device in a full-information
  game; authored triggers already do the job legibly (§2.8b).
- **Math Skill / Calculator (FFT)** — arithmetic on numbers the UI does not
  print, for unavoidable free damage. Fails the legibility filter and the balance
  doctrine at once (§1.16).
- **Move-Find-Item (FFT)** — hidden treasure on tiles the player cannot see;
  adapt as visible salvage instead (§1.16).
- **The full chariot rewind (Tactics Ogre)** — architecturally nearly free here,
  which is exactly why it needs an explicit refusal: a 50-turn rewind makes "a
  win banks and buries" re-rollable, and that sentence is the whole permadeath
  design (§2.1b). The one-step undo is in §5.
- **Weather** — outdoor-fantasy furniture for a game set inside buildings; the
  fitting version is surfaces (§1.13).
- **Hidden Resolve/Attunement** — FFT hid Brave/Faith and a generation of players
  never learned why their Summoner was bad. Bible §7 pulls both ways in four
  lines; the legibility doctrine settles it. See the amendment proposal in §6.

---

## 5. The cheap QoL tier

Each is one agent, one pass, and none needs a design doc. Ordered roughly by
value per hour.

1. **Undo the move before acting.** The single most-requested comfort in the
   genre, and uniquely safe here: Greyfall has no fog of war and no hidden
   information, so stepping and stepping back reveals nothing and cannot be
   abused. The turn is not committed until `wait`/`endTurn` (§6), so this is a
   controller-level snapshot-and-restore, not an engine change. *C1.*
   *Landed* as an engine command instead — `{ kind: "undoMove" }` — because the
   walk can detonate a mine or fire a trigger, and the owner's ruling is that
   undo takes those back too. A controller-level restore could not have; the
   engine holds the pre-move state. `COMBAT_RULES` §10b, including why the free
   scout is intended and why a resolved battle is final.
2. **Preview the turn cost.** §6 prices a turn at 100 / 80 / 60 CT for
   moved-and-acted / one / neither, which is a real decision the interface never
   shows. Stage an order and the queue previews itself as it would be after
   committing — one extra `turnOrderPreview` call on a hypothetical state, the
   same pattern the grid's aim-time highlight already uses. *C2, small.*
3. **Put deployables on the clock.** A turret's next shot is fully deterministic
   and completely unannounced. This is §3.1(a)'s cheapest third and it can ship
   alone: a row in the register or a ring on the board, with ticks-to-fire. *C2,
   small.*
4. **Print Resolve and Attunement.** On the record card and the inspect card, in
   the Assay's own voice (a measured value, with the licence's date). Resolves the
   §1.12 tension in one screen and costs nothing. *C1.* (Wants the bible clause
   in §6 first.)
5. **The lodge book.** `FallenRecord` already stores name, job, level and
   encounter; nothing reads it. One screen, the Combine's own register, the
   player's dead by name. `STORY_BIBLE` §3b asks for it explicitly and calls it
   "suggestive, cheap, and exactly on-theme". *C2, small.*
6. **Mid-battle save.** A battle is initial state plus a command log
   (`ARCHITECTURE`), so a mid-battle save is a truncated log in the existing
   envelope. It is the difference between a long battle being a commitment and
   being a wall. *C1.*
7. **Finish the formation screen.** `PROGRESSION` §7 flags it: tiles are
   pre-filled from the top of the roster, and picking *which* tile and facing at
   deploy is "a later pass". On maps whose thesis is approach and height, the game
   is currently making the opening tactical decision for the player. *C2, small.*
8. **Rated hours: cap replay Standing per chapter.** `PROGRESSION` §7 lets a won
   encounter be replayed for Standing without limit, which is an open grind
   vector. Tactics Ogre's union level, in this world's vocabulary: the Assay
   credits a rated number of hours per chapter; work past it counts for the
   record and not for the account. One constant and one check. *C1, tiny.*
9. **The battle record.** The annunciator already keeps a short scrollback
   (`UI_DESIGN` §8); persist it and offer it as a post-battle document. Almost
   free, and it is the first draft of §3.6's what-you-did / what-the-record-says
   pair. *C1.*
10. **Speed control on the AI turn.** Not a design question, but it is the item
    that most changes how a 40-minute battle feels, and it is the one nobody
    schedules. *C1.*
11. **Trigger flags.** `ENCOUNTER_NOTES`' open gap 7: triggers cannot read or
    write state, so `once: true` plus condition ordering is the whole control
    flow, `once: false` is unusable (a repeating condition refires once per
    *command*), and both e2 and s1 hand-write a six-trigger ladder to fake one
    repeating rule. A named boolean set, readable as a condition and writable as
    an action, retires the ladder and unblocks §3.6 and both story forks. *C1,
    and it is the one item on this list that other people are already working
    around.*

---

## 6. Proposed amendments, flagged not taken

Per the creative bible's own rule that nothing drifts silently. Nothing above
depends on these being accepted; if all are declined, every recommendation still
stands as written.

**Proposal 1 — bible §7, the visibility of the pair.** §7 opens by calling
Resolve/Attunement "the hidden stat pair" and four lines later says they are
"legible facts about a person, not abstractions: the Assay measures Attunement to
issue licenses; sergeants judge Resolve in the yard." The legibility doctrine
(`FLUX_GRID` §2.5, binding and general) settles the contradiction in favour of the
second reading. Proposed: replace "hidden" with a word that means *quiet* — the
pair is not on the battle HUD, but it is printed on the record card and the
inspect card, in the Assay's register. FFT hid Brave/Faith; the result was a
generation of players who never knew why their Summoner was bad, and this
project's whole interface thesis is that the player is reading the bureau's
paperwork.

**Proposal 2 — `PROGRESSION` §4's shop deferral, re-scoped.** The deferral is
written as "shops, item acquisition, selling — Phase 3", which presumes a shop.
§1.8 and §2.7 argue the fitting build is requisition (a Standing-priced,
faction-gated list) plus the bench (Chemist crafting from salvage), which is
strictly smaller and strictly more on-fiction. Proposed: re-scope the deferral to
name those two, so a later agent does not build a shop counter because the
document said shop.

**Proposal 3 — a glossary line for surfaces, if §3.2 is built.** Bible §5.5's
two-register rule applies: the official Assay word and the worker's. *Spill*,
*slick*, *the wet*, *steam off*, *ash-fall* are the slang side; the official side
is whatever the Meter calls a containment event. Flagged now so the vocabulary
does not drift into generic elemental fantasy the first time an ability is
authored, which bible §9 forbids.
