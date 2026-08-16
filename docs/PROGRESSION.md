# Progression — the between-battle layer

How a chapter carries state from one encounter to the next: Standing, job
levels, ability learning, equipment, job changes, permadeath, and save/load.
Binding on the progression workstream; `docs/COMBAT_RULES.md` owns everything
inside a battle and stops at `unit.standingEarned`.

Code: `src/core/progression/` (state + pure ops), `src/app/campaign*.ts` and
`src/app/betweenBattles.ts` (session, view models, loop, screens),
`src/app/save.ts`, `src/data/schemas/campaign.ts`, `data/campaigns/`.

---

## 1. The state model

`CampaignState` (`src/core/progression/campaign.ts`) is the whole between-battle
world. It is plain JSON — no classes, no closures — so a save is the state plus
an envelope and nothing else.

```
CampaignState
  version, campaignId
  roster:    Unit[]            join order; THE mutable party
  progress:  UnitProgress[]    sorted by unit id
      unitId
      jobs:    JobProgress[]   sorted by job id: { jobId, earned, balance }
      learned: string[]        every ability ever paid for, sorted
  inventory: InventoryStack[]  sorted by item id; unequipped stock only
  fallen:    FallenRecord[]    permadeath ledger
  encounterIndex, completedEncounterIds
```

`data/units/*.json` seeds the roster once, at `createCampaign`. After that the
JSON is history and `state.roster` is the truth — every op deep-copies before
mutating, so a content reload never resurrects a dead unit or un-spends
Standing.

**Ordering.** `progress`, each unit's `jobs`, and `inventory` are kept in id
order; `roster` is in join order (the campaign's declared roster first, later
recruits appended). Both are explicit and stable, which is what the determinism
rule in `docs/ARCHITECTURE.md` asks for — nothing here depends on object key
order, and a save round-trips byte-identically. Rules that *iterate units to
decide outcomes* still go by unit id: `applyBattleResults` walks the battle's
`allUnits`, which the engine keeps sorted.

## 2. Standing and job levels

Standing is earned in battle at a flat `STANDING_PER_ACTION = 10` per resolved
action (`docs/COMBAT_RULES.md` §16) and accumulates on `unit.standingEarned`.

**Standing is banked per job.** On a win, each deployed unit's earned Standing
goes into the job it fought in. A Conduit's Standing cannot buy Enforcer
abilities, and switching jobs opens a fresh account at zero. This is FFT's rule
and it is what makes a job change a real commitment.

Each job account carries two numbers:

| Field | Meaning |
|---|---|
| `earned` | total ever banked into this job — **never spent down** |
| `balance` | unspent Standing, what learning draws on |

**Job level is derived from `earned`, not from spending.** Buying an ability
costs `balance` and leaves `earned` alone, so a player is never punished for
using the currency the game gave them, and job level does not depend on the
*order* purchases happen in. This is FFT's own rule (job level tracks total JP
earned in a job) and the one place this document deliberately reads the brief's
"standing spent gates levels" as "standing committed to the job gates levels".
Both numbers are stored, so flipping the gate to `earned - balance` later is a
one-line change with a test to update.

### The curve

| Job level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Cumulative `earned` | 0 | 100 | 250 | 450 | 700 | 1000 | 1350 | 1750 |
| Step | — | 100 | 150 | 200 | 250 | 300 | 350 | 400 |

`JOB_LEVEL_THRESHOLDS` in `campaign.ts`. Why these numbers:

- **The steps are an arithmetic run** (100, +50 each). FFT's own curve has the
  same shape; a flat run is trivial to reason about in a balance pass and has
  no cliff a player can fall off.
- **They are the shallowest curve the measured earn rate supports, and the
  earn rate is now measured rather than guessed.** Standing is only awarded for
  *resolved actions* — moving and waiting earn nothing. Playing all five
  encounters end to end with the shipped roster, ten seeds each
  (`docs/BALANCE_REPORT.md` §6), banks a mean of:

  | battle | mean Standing per deployed unit |
  |---|---|
  | e1 Marshaling Yard | 18 |
  | e2 Foundry Floor Nine | 56 |
  | e3 Tallow Row | 46 |
  | e4 Refinery Three | 47 |
  | e5 Charterhouse Steps | 32 |
  | **chapter total** | **~199** |

  The old estimate of "200–400 total" was right at the bottom of its range, and
  the tutorial's 10–30 was right: it is the four longer battles that pay. On
  this curve ~200 earned is job level 2 from a standing start, or job level 3
  on top of the chapter's opening bonus. That is one job-tree gate cleared per
  chapter, which is the pace the prerequisites were written for.
  **Still the flag, not a settled number:** if playtesting wants job levels to
  move faster, raise `STANDING_PER_ACTION` in `core/rules/abilities.ts` rather
  than flattening this curve further — the curve is already about as shallow as
  it can be without job levels becoming meaningless.
- **They fit the authored prerequisites.** Every job in `data/jobs` gates on
  level 2 or 3 of another job (Saboteur is the deepest, at Chemist 3 +
  Machinist 2). Levels 2 and 3 cost 100 and 250 — one to two battles of work
  each, so unlocking a second job is a chapter-scale goal rather than a
  post-game one.
- **They fit ability prices.** Authored `standingCost` runs 100–1100, median
  450. A unit that stays in one job through the slice affords one or two of its
  own abilities on top of the starting bonus, which is the intended pressure:
  you cannot buy the whole skillset, so you choose.

`STANDING_PER_ACTION`, the thresholds, and `startingStandingBonus` are the
three knobs a balance pass turns. Nothing else in this layer has a magic number.

### Skillsets: what a job change actually takes away

The roster `Unit.learnedAbilityIds` field is the engine's input — anything in it
is usable in battle. So it is treated as a **projection**, not a record:

- `UnitProgress.learned` is the authoritative purchase history and is never
  reduced.
- `Unit.learnedAbilityIds` is recomputed after every learn / job change /
  secondary change as *the action abilities in `learned` whose `jobId` is the
  unit's current primary or secondary job*.

That reproduces FFT's primary/secondary skillset rule without touching the
frozen engine: change job and the old skillset leaves the action menu; change
back (or borrow it as a secondary) and it returns, unbought.

Reaction / support / movement slots do **not** work that way — once bought, a
passive can be slotted regardless of current job, exactly as in FFT. They are
validated against `learned`, not against the projection.

Job changes also return kit the new job has no `equipTag` for to inventory,
and clear the secondary if it collided with the new primary.

## 3. Permadeath — the dead stay dead

`CREATIVE_BIBLE.md` §5.4 is binding: nothing recalls the dead. The battle engine
already makes downing terminal *within* a battle (`docs/COMBAT_RULES.md` §16).
This layer decides what it means afterward:

> **A loss changes nothing. A win banks and buries.**

| Battle result | Standing | Downed units | Encounter index |
|---|---|---|---|
| `loss` (or unresolved) | not banked | none lost | unchanged |
| `win` | banked to each unit's current job | **struck from the roster into `fallen`** | advanced, on a first win |

Rationale:

- **Losses are free.** A wipe is a retry, not a death spiral. If a loss also
  killed the party, permadeath would compound into unwinnable runs and the
  player's only answer would be save-scumming — which is the mechanic
  admitting it does not work.
- **Wins are where it bites.** Taking the yard and losing Vale doing it is the
  tone the Bible asks for: you won, and it cost someone. A downed unit at the
  end of a won battle is gone for the rest of the chapter, with a
  `FallenRecord` (name, job, level, encounter) kept for the record.
- **Kit is recovered, the person is not.** A fallen unit's equipment returns to
  inventory. Salvage is not resurrection.
- **Story-critical units are the encounter author's job**, not a special case
  here. Give the encounter a `unitDowned` loss condition (Rowen already can
  have one) and downing that unit ends the battle in a loss — which, by the
  rule above, changes nothing and prompts a retry. No protagonist-shaped
  exception exists in the progression code.

A replay of an already-won encounter banks and buries as usual but does not
advance the index; that is how the slice loops battle 1 while battles 2–5 are
unauthored.

## 4. Equipment and inventory

- One shared party stock (`inventory`), counted by item id. Equipping consumes
  one; unequipping, swapping, job-changing out of a tag, and permadeath all
  return one.
- A job may equip an item when they share at least one `equipTag` — the rule
  the item schema already documents.
- Consumables are never equipment; they sit in inventory only.
- Stat previews on the equipment screen come from `deriveStats` with the
  candidate swapped in, so the deltas are the real numbers, not an estimate.

**Deferred to Phase 3: shops and acquisition.** There is no way to *gain* items
in the slice beyond `Campaign.startingInventory` and salvage from the fallen.
`Item.price` exists in the schema and is unused. When shops land they add a
screen and one op (`buyItem`/`sellItem`) over the same `inventory` array;
nothing in this document changes.

## 5. The campaign definition

`src/data/schemas/campaign.ts`, one file per chapter in `data/campaigns/`.

```jsonc
{
  "schemaVersion": 1,
  "id": "foundry-chapter",
  "name": "The Foundry Chapter",
  "description": "...",
  "encounterIds": ["e1-marshaling-yard", "..."],   // played in order
  "startingRosterUnitIds": ["rowen", "vale", "..."], // -> data/units
  "startingStandingBonus": 250,                     // per unit, primary job
  "startingInventory": [{ "itemId": "riot-shield", "count": 1 }]
}
```

Registered in `contentRegistry` as `campaigns`. Cross-reference checks live in
`tests/progression/campaign-refs.test.ts` rather than `tests/content.test.ts`,
so the shared content test and the campaign schema do not collide.

**Deliberate looseness, to be removed.** `encounterIds` names all five slice
battles, but only the authored ones exist. The refs test hard-checks id
*format* for all of them, hard-checks that the opening encounter exists, and
allows the rest only if they are named in `PENDING_ENCOUNTER_IDS`. That list
shrinks and never grows; delete it and the soft branch when
`data/encounters/` is complete.

`startingStandingBonus` **is 150, reduced from 250 by the rebalance pass once
the chapter was played end to end.** The flag is discharged; the reasoning is:

- **Zero does not work.** Nothing in this layer raises `Unit.level`, so a unit's
  only growth through the chapter is Standing, and the roster's cheapest
  unlearned ability is 150 (Rowen's Shield Advance). At zero the learning screen
  is empty until after battle 2, and the knob's stated purpose — give the
  job-change and learning screens something to do before battle 1 — is unmet.
- **250 does not work either.** It banks job level 3 on day one, and the
  chapter's own ~200 Standing then moves a unit exactly one level, to 4. The
  bonus was worth more than the whole chapter.
- **150 is the smallest number that clears both bars.** Every unit opens at job
  level 2 — the gate every job in `data/jobs` except Saboteur asks for — with
  one affordable purchase in the starting kit, and the chapter's own ~200 is
  then the *majority* of what a unit ever spends, carrying them to job level 3
  by the Charterhouse Steps. Growth belongs to the battles.

The three knobs remain `STANDING_PER_ACTION`, the thresholds, and this.

## 6. Save format

`src/app/save.ts`. A versioned envelope and nothing more:

```json
{ "saveVersion": 1, "campaign": { /* CampaignState */ } }
```

- `localStorage` key `greyfall.campaign`, written on every committed op
  (`CampaignSession.onChange`).
- `exportSave` / `importSave` produce and consume the same envelope
  pretty-printed, for the export-to-file path.
- `decodeSave` validates the envelope version and the payload's shape and
  returns `{ ok: false, reason }` rather than throwing — a corrupt save is a
  message, not a crash.
- No timestamps, no derived fields: `encodeSave` of a state is deterministic, so
  a round trip is byte-identical and testable as such.
- There is no migration machinery, on purpose. It arrives with the first
  `saveVersion: 2`.

## 7. The chapter loop

```
roster --beginDeployment--> formation --confirmDeployment--> battle
  ^                             |                              |
  +--------- closeScreen -------+                              |
  +----------------------- finishBattle ------------------------+
```

`CampaignRunner` (`src/app/campaignRunner.ts`) drives it through two ports — a
`BattlePort` and a `CampaignScreenPort` — so the whole loop is constructible in
a test with fakes on both sides, the same way `BattleController` works.
`CampaignSession` (`src/app/campaign.ts`) owns the one authoritative
`CampaignState` and routes `ProgressionIntents` into the pure ops.

**Formation.** Deliberately minimal: the deployment tiles are pre-filled from
the top of the roster, confirming a roster entry drops it on the next free tile
and confirming it again pulls it back off. Picking *which* tile, and facing at
deploy time, are a later pass.

**Replay fallback.** When the chapter's next encounter has no file yet,
`playableEncounterId()` falls back to the last encounter won, the screen says
so, and the loop closes on battle 1 instead of dead-ending. `applyBattleResults`
does not advance the index for an encounter already in
`completedEncounterIds`, so replaying costs nothing but earns Standing and can
still kill people.

## 8. Deferred

| Deferred | Note |
|---|---|
| Shops, item acquisition, selling | Phase 3; `Item.price` is already in the schema |
| Recruiting / roster growth | Slice has a fixed party (`CREATIVE_BIBLE` §8) |
| Tile-by-tile formation, deploy facing | Formation screen picks order only |
| Unit level-ups | `Unit.level` is authored; nothing raises it yet |
| Story-driven Resolve/Attunement shifts | Bible §7 names them; no op exists |
| Save migrations | Arrives with `saveVersion: 2` |
