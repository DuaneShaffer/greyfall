# Items — the satchel

How consumables work in Greyfall, and why they work that way. The rules live in
`docs/COMBAT_RULES.md` §19 and the inventory flow in `docs/PROGRESSION.md` §4;
this document is the design record.

The seven consumables and the Chemist's `consumableEffectBonusPercent` support
were authored in Phase 2 and inert until now — no targeting, no carry model, no
command (`CONTENT_NOTES` §7 gap 4, `PROJECT_BREAKDOWN` findings queue item 4).
Three calls closed it.

---

## 1. The three calls

### Call one — targeting is authored on the item, with an engine default

`Consumable` gains an optional `targeting` block of exactly the shape an
ability's takes: range, area, `requiresLos`, `validTargets`. Additive, so every
shipped file still validated the moment the schema changed.

An item that omits it falls back to `DEFAULT_CONSUMABLE_TARGETING` — range 0–1,
vertical 1, single tile, no line of sight required, `self` or `ally`. That is
FFT's Item rule and it is the right default: most consumables are pressed into
somebody's hand at arm's length, and the interesting ones are interesting
*because* they say otherwise.

All seven shipped items author it explicitly anyway. The default is for content
that has not been thought about yet, not a shortcut for content that has.

**Why not one global rule with per-item exceptions?** Because the fiction
already draws the line. "Thrown, not poured" is the second sentence of the
Cinder Flask's description; "crushed under the nose of anyone gone slack" is
the Numbing Salts'. Reach was in the flavour text before it was in the schema.

### Call two — one shared satchel per team, spent permanently

`GameState.satchels` holds one pool per team, sorted by team, each pool's
stacks sorted by item id. The player's pool is the chapter's *whole* consumable
stock, handed to `createBattle` as `carried`; the hostile force's comes from
the encounter's optional `enemySatchel`.

Consumption is permanent: `useItem` decrements the pool, emits `ItemUsed`, and
`applyBattleResults` strikes the shortfall from the chapter's stock on a win.

**The decrement belongs to the battle, not to the campaign.** `GameState` is
the thing a command log replays into and a determinism test compares; if the
satchel lived only in `CampaignState` and were reconciled from an event count,
a replay could not reproduce it. Putting the pool in `GameState` means the
sequence *is* the satchel, and the campaign layer only reads what came home.
`applyBattleResults` folds it by difference against the stock that went out,
which is exact because the chapter cannot change while a battle runs.

**Why shared, not per-unit carry slots.** The deferral sketch proposed
`carriedItemIds` on `Unit`, mirrored onto `BattleUnit` — more FFT-authentic for
who-can-reach-what, and rejected on three grounds:

1. **It contradicts the layer that already exists.** `PROGRESSION` §4 says "one
   shared party stock, counted by item id," and the equipment screen has said
   so since Phase 2. Per-unit slots would make consumables the only kind of
   item with two homes.
2. **It buys a decision nobody makes.** With a five-unit formation and a
   stock of one or two of anything, "who carries the coagulant" is not a
   tactical choice, it is a chore before every battle — and the formation
   screen is already flagged as deliberately minimal.
3. **It costs a screen.** Slots need a hand-off UI, a validation pass, and a
   recovery rule when a carrier dies mid-battle. None of that is where the
   Chemist's identity lives.

What we lose: a unit cannot be cut off from the party's supplies by position,
and the "the medic is dead and she had all the coagulant" beat is off the
table. Both are real. Neither is worth a screen at slice scale. If per-unit
slots ever land, they are a filter over the same pool rather than a second
model — `usableItems` is already the seam.

**A loss refunds the satchel**, because `applyBattleResults` already refunds
everything on a loss (`PROGRESSION` §3). Consistency wins: a retry costs the
player time, not stock.

### Call three — the `equipTag` rule decides who may use an item

FFT gates items behind the Item skillset: anyone who equips it may use one, and
the Chemist has it innately. Our structure has a better-fitting answer already
in it — **a job may reach for an item when it shares an `equipTag` with it**,
which is the same sentence that governs equipping.

Every job in the slice carries `field-issue`, and all seven consumables are
tagged `field-issue`, so **items are universal today**. That is deliberate:
`CONTENT_NOTES` §5 authored the consumables as "the Chemist's kit one rung
down… so a party without a Chemist is inconvenienced rather than crippled," and
locking healing behind one job would make a Chemist death a run-ender in a
permadeath game.

The gate is still real, not decorative. A compound tagged `chemist-kit` is
Chemist-only with no code change, and a job authored without `field-issue`
cannot reach the satchel at all. The refusal has its own code
(`item-not-issued`) and the Item submenu greys the entry with the reason.

**So where is the Chemist's identity?** In mastery, not exclusivity — which is
the FFT Chemist's actual shape too, once you look past the skillset gate.
Bench Grade now reads both halves:

- `consumableEffectBonusPercent: 50` — every damage and heal power in the item
  scales by `floor(power * 150 / 100)`.
- `consumableRangeBonus: 2` — the throw. New sibling key, same passive block.

Folding reach into the same support rather than giving it its own is the call
that makes Bench Grade *the* item-mastery support instead of one of two. FFT
splits Throw Item and Item Boost; at slice scale, with one support slot and a
seven-item list, splitting them would mean a Chemist who can either reach or
hit hard, which is a worse decision than a Chemist who is simply the best
person to hand the satchel to. It also gives the 500-Standing purchase a shape
a player can feel in one battle.

Support abilities are not job-gated once bought (`PROGRESSION` §2), so putting
Bench Grade on an Enforcer is available and correct — that is the build game.

---

## 2. The seven

Effect numbers are unchanged from the Phase 2 content pass; targeting is new.
Level-1 reference points: Enforcer 61 HP, Conduit 39 HP, a tier-1 basic attack
lands 8–27 (`CONTENT_NOTES` §6).

| Item | Reach | Targets | Effect | With Bench Grade |
|---|---|---|---|---|
| Coagulant Vial | 0–1 | self, ally | heal 30 | heal 45 |
| Heavy Coagulant | 0–1 | self, ally | heal 60 | heal 90 |
| Numbing Salts | 0–1 | self, ally | clears Fouled, Smoked, Seized | — |
| Stimulant Shot | 0–1 | self, ally | Overclocked, 100% | — |
| Cell Tab | 0–1 | self, ally | charge +12 | — |
| Caustic Flask | 1–3, LoS | enemy | chemical 20 + Fouled 70% | chemical 30 |
| Cinder Flask | 1–3, LoS | enemy | thermal 25 + Scalded 60% | thermal 37 |

Notes on the shape:

- **The flasks are the only thrown items** and the only ones that take an
  enemy. Vertical 2 and line of sight, so a gantry is a real advantage and a
  wall is a real problem. Single-tile: the radius versions are the Chemist's
  own abilities a rung up (Cinder Oil, Numbing Fog), and a consumable should
  not outrun the kit it is a shadow of.
- **Mastery scales magnitude only.** A 70% Fouled is 70% in anyone's hand, a
  Cell Tab is 12 charge in anyone's hand, and the Salts cure what they cure.
  The alternative — potency touching status chance — would make Bench Grade a
  status-fishing support as well, which is Numbing Fog's job.
- **Prices are untouched** (120–600). `Item.price` is still unread; it arrives
  with shops (`PROGRESSION` §8).
- **Numbing Salts stop one status short of Triage**, which clears Scalded too.
  Deliberate: the consumables mirror the Chemist kit *one rung down*.

Chapter kit: `foundry-chapter` opens with three Coagulant Vials and one each of
Numbing Salts, Cell Tab, and Caustic Flask — enough that the Item menu is not a
one-note list on battle one, small enough that spending is a decision.

## 3. The enemy satchel

`Encounter.enemySatchel` gives the hostile force the same shared pool. Foundry
Floor Nine carries two Coagulant Vials, and Perren Ash — the hand who was
already a Chemist — has Bench Grade slotted, so the enemy's own coagulants
heal for 45. (A Caustic Flask shipped originally and was removed for
winnability; BALANCE_REPORT §7.8.2 has the measurement.)

The AI prices an item exactly as it prices an ability, through
`abilityValue` on the same synthesized ability, minus a flat `itemUsePoint`
(120, about 12 HP of value) for the fact that the satchel does not refill. The
effect is what you want and nothing more: a hand doses a badly hurt ally rather
than closing on a distant enemy, and will not crack a vial open for a scratch.

## 4. Implementation shape

The load-bearing trick is that **an item use is an ability**. `getAbility`
resolves the id `item:<itemId>` into an `ActionAbility` synthesized from the
item — targeting widened by the carrier's reach bonus, damage and heal powers
scaled by the carrier's potency bonus — exactly as it already synthesizes
`basic-attack` from the equipped weapon.

Everything downstream then works untouched: `resolveArea`, `forecast`,
`targetableTiles`, `affectedTiles`, `getAbility`, the renderer's pose lookup,
and the AI's `abilityValue`. The UI aims an item through the same
pick-then-confirm flow it aims an ability through; only the command that
finally goes out is different.

`Id` forbids a colon, so the namespace cannot collide with authored content, and
`knownActionAbilityIds` never lists an item id, so `act` cannot be used to
bypass possession. `tests/content.test.ts` guards both.

## 5. Deferred

| Deferred | Note |
|---|---|
| Per-unit carry slots | Above; `usableItems` is the seam if they land |
| Buying and selling consumables | Arrives with shops; `Item.price` already exists |
| Area consumables, item-thrown deployables | The Chemist's and Machinist's kits own those verbs |
| Potency on charge and status effects | Deliberately magnitude-only; see §2 |
| An item skillset separate from `equipTag` | Only worth it if a job should carry an item it cannot use |
| Reaction-triggered item use (Auto-Potion) | Wants a reaction trigger that can spend from the pool |
