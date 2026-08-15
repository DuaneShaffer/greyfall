# Combat Rules

Every formula, constant, and ordering rule the battle core implements. Content
and balance agents may treat this as spec: if the numbers here and the numbers
in `src/core` disagree, that is a bug in one of them, and
`tests/core/` is where it gets caught.

Governing docs: `docs/CREATIVE_BIBLE.md` (what) and `docs/ARCHITECTURE.md`
(how). This document is the third leg: exactly how much.

**All arithmetic is integer arithmetic.** Every division is `Math.floor`, in
the order written. There is no floating-point accumulation anywhere in the
rules, so results are identical on every platform.

---

## 1. Randomness

One `mulberry32` stream lives at `state.rng`, seeded from the encounter's
`rngSeed`. Every roll in the battle draws from it, in a fixed order. There is
no `Math.random` and no wall clock in `src/core`.

- `chanceRoll(percent)` draws one value and succeeds when `1 + (raw % 100) <= percent`.
- A percentage of `0` never succeeds; `100` always does.
- **Rolls always consume a draw**, hit or miss, so the stream stays aligned.

Draw order inside one ability use:

1. One accuracy roll per hostile unit in the area, in unit-id order.
2. Effects in content order; within an effect, targets in id order.
   Only `applyStatus` rolls.
3. Reaction trigger rolls, in unit-id order.

## 2. Stats

`deriveStats` (`src/core/progression/stats.ts`) is standalone and pure — it is
also what the progression screens will use.

```
raw(stat)   = STAT_BASE[stat] + growth(stat) * level
value(stat) = floor(raw(stat) * multiplierPercent(stat) / 100)
```

| Stat | `STAT_BASE` |
|---|---|
| hp | 40 |
| charge | 8 |
| speed | 2 |
| phys | 0 |
| mag | 0 |

`move`, `jump`, and `evade` do not grow: they are the job's `baseMove`,
`baseJump`, `baseEvade`.

Then, in this exact order:

1. Equipment `statMods`, applied in slot order
   `weapon, shield, head, body, accessory`.
2. Passive `statMods` from the slotted support ability, then the movement one.
3. Clamp: `hp >= 1`, `charge >= 0`, `speed >= 1`, `phys >= 0`, `mag >= 0`,
   `move >= 1`, `jump >= 1`, `0 <= evade <= 95`.

During battle, status `statMods` (in status-id order) and timed `modifyStats`
mods (in mod-id order) layer on top of that base and are re-clamped the same
way. HP and flux are capped to the resulting maxima.

Worked example — Rowen, level 1 Enforcer, Shock Maul:

| Stat | Curve | Result |
|---|---|---|
| hp | (40 + 11) x 120% | 61 |
| charge | (8 + 2) x 70% | 7 |
| speed | (2 + 4) x 100% | 6 |
| phys | (0 + 8) x 115% | 9 |
| mag | (0 + 2) x 75% | 1 |
| move / jump / evade | job flats | 3 / 2 / 8 |

## 3. Resolve and Attunement

Both are 0-100 and live on the unit's `disposition`.

- **Resolve** is the reaction-ability trigger rate, as a straight percentage.
- **Attunement** scales `mag`-based amounts *twice*: once by the caster's, once
  by the target's. High Attunement is power and vulnerability in the same
  number (creative bible §7).

Objects and tiles have no Attunement; they are treated as 100 (unscaled).

## 4. Damage and healing amounts

An `Amount` has a `base` and a `power`. `power` means different things per
base, matching how the content is authored:

| `base` | Formula | `power` reads as |
|---|---|---|
| `weapon` | `floor(phys * weaponPower * power / 400)` | percent of a full weapon swing |
| `phys` | `floor(phys * power / 2)` | a multiplier on Phys |
| `mag` | `floor(mag * power / 2)` | a multiplier on Mag |
| `fixed` | `power` | the number itself |
| `maxHpPercent` | `floor(targetMaxHp * power / 100)` | percent of the target's max HP |

Constants: `WEAPON_DAMAGE_DIVISOR = 400`, `STAT_AMOUNT_DIVISOR = 2`.

A unit with no weapon equipped swings unarmed: power 3, kinetic, range 1/1/1.

Then Attunement scaling, if it applies (`amount.attunementScaled`, defaulting
to true for `base: "mag"` and false for everything else):

```
value = floor(value * casterAttunement / 100)
value = floor(value * targetAttunement / 100)
```

Finally `value = max(0, value)`. A map- or object-sourced effect (an
`onDestroyed` payload, for instance) has no caster, so the caster half of the
scaling is skipped.

Worked examples:

- Rowen's weapon attack: `floor(9 * 9 * 100 / 400)` = **20**.
- Rowen's Pin (`weapon`, power 80): `floor(9 * 9 * 80 / 400)` = **16**.
- Vale (Mag 10, Attunement 70) casting Overload Cell (`mag`, power 16) on the
  yard cell: `floor(10 * 16 / 2)` = 80, `floor(80 * 70 / 100)` = **56**.
- The same caster's Arc (`mag`, power 8) onto a unit with Attunement 45:
  `floor(10 * 8 / 2)` = 40, `floor(40 * 70 / 100)` = 28,
  `floor(28 * 45 / 100)` = **12**.

Healing uses the same amount pipeline and is capped at the target's max HP.
**Downed units cannot be healed** — in this world the dead stay dead
(creative bible §5.4).

## 5. Accuracy, facing, and evasion

Accuracy is rolled once per *hostile* unit in an ability's area. Allies, the
caster, objects, and tiles are never missed. A miss cancels every unit-scoped
effect on that unit and emits `AbilityMissed`.

```
angle          = where the attacker stands relative to the target's facing
effectiveEvade = evade         (front)
               = floor(evade/2) (side)
               = 0             (back)
hit%           = clamp(100 - effectiveEvade, 5, 100)
```

The angle is decided by the dominant axis of the attacker-to-target offset. A
perfect diagonal counts as a **side** attack; an attacker somehow on the
target's own tile counts as **front**.

Height does not modify accuracy. Facing does not modify damage. (FFT's own
split; keeping it means one number moves per concept.)

Every unit faces its target automatically when it acts, and faces its last step
when it moves. `wait` sets facing explicitly.

## 6. The CT clock

Constants: `CT_TURN_THRESHOLD = 100`.

Each tick of `state.clock`:

1. Every standing unit banks CT equal to its **effective Speed**.
2. Every in-flight charge banks CT equal to its `castSpeed`.

Effective Speed is the unit's Speed after equipment, passives, statuses, and
timed mods, then folded through each `ctMultiplierPercent` status one at a time
in status-id order, flooring after each, never below 1:

```
speed = floor(speed * percent / 100)   for each such status
speed = max(1, speed)
```

That is the Haste/Slow hook: `ctMultiplierPercent: 150` on a Speed-6 unit gives
`floor(6 * 150 / 100)` = 9 CT per tick.

Anything sitting at 100 CT or more resolves before the clock moves again:

- **Charges fire first**, highest CT first, charge id breaking ties.
- Then **one unit takes a turn**, highest CT first, unit id breaking ties.

Turn costs, spent when the turn ends:

| The unit... | CT cost |
|---|---|
| moved and acted | 100 (`CT_COST_MOVE_AND_ACT`) |
| moved or acted, not both | 80 (`CT_COST_SINGLE`) |
| did neither | 60 (`CT_COST_NEITHER`) |

CT never goes below 0.

`state.turn` counts **individual unit turns**, not rounds. Encounter conditions
that name a number of turns (`surviveTurns`, `turnLimit`, the `turnStart`
trigger) read that counter.

A turn ends only on `wait` or `endTurn`, with two exceptions:

- Starting a **charged** ability ends the turn immediately (FFT convention).
- A unit that can neither move nor act — Stunned, say — has its turn opened and
  closed by the engine with no command in between, for the 60 CT cost. The
  `TurnStarted`/`TurnEnded` pair still goes out so the renderer can show it.

## 7. Charged abilities

An ability with a non-null `castSpeed` goes onto its own CT timeline:

- Flux (`chargeCost`) and any `hpCost` are **spent when the cast starts**, not
  when it lands.
- The caster's turn ends immediately.
- The charge banks `castSpeed` CT per tick and fires at 100. `castSpeed: 25`
  therefore lands on the fourth tick after the cast.
- A **unit** target is snapped to that unit's tile at cast time: the charge
  lands where it was aimed, not where the target ran to. Object and tile
  targets are kept as they are.
- If the caster is downed before the charge lands, it is cancelled
  (`AbilityChargeCancelled`).

## 8. Statuses

- `duration.kind: "turns"` counts the **afflicted unit's own turns**. The
  counter drops at the end of that unit's turn, and the status is removed when
  it hits 0. A 1-turn Stun therefore costs exactly one turn.
- `duration.kind: "untilRemoved"` persists until a `removeStatus` effect clears
  it.
- `tickDamage` is applied at the **start** of the afflicted unit's turn, before
  it may act.
- Re-applying an active status refreshes its duration; it never stacks twice.
- `preventsAction` / `preventsMove` reject the matching commands with
  `action-prevented` / `move-prevented`. `preventsReaction` suppresses the
  unit's reaction ability.
- Status application chance is the effect's flat `chance`. Resolve and
  Attunement do **not** modify it in the slice; this is a deliberate
  simplification, recorded here so a balance pass can revisit it on purpose.

## 9. Reactions

- Trigger rate is the reacting unit's **Resolve**, as a straight percentage.
- Triggers: `damaged` (the unit took damage from the action), `targetedByAction`
  (the unit was in the area, hit or not), `hpCritical` (HP below 25% of max
  after the action), `allyDowned` (a same-team unit went down).
- `damaged` and `targetedByAction` reactions resolve against the acting unit;
  `hpCritical` and `allyDowned` resolve on the reacting unit itself.
- **Reactions never trigger reactions.** One layer, no chains.
- A downed unit does not react, and neither does one under `preventsReaction`.

## 10. Movement

Pathfinding is uniform-cost search over the live map, recomputed per query.
Nothing is cached — a destroyed wall changes pathing on the next call.

An edge from tile A to orthogonally adjacent tile B is usable when:

- B is in bounds and its terrain is not `impassable` or `void`.
- No undestroyed object with `blocksMovement` covers B, unless that object
  provides an active walkable surface (see §11).
- `|standHeight(B) - standHeight(A)| <= Jump`.
- B is not occupied by a hostile standing unit (`moveThroughEnemies` waives
  this). Allies may be walked through but not stopped on. Downed units do not
  occupy anything.

Tile entry cost, in the scaled units the Railrunner multiplier defines
(`railMultiplier` defaults to 1, and the move budget is `Move * railMultiplier`):

```
cost = 1 if terrain is rail, else railMultiplier
cost = cost * 2 if terrain is rough
cost = cost * 2 if terrain is water and the unit lacks ignoresHazardTiles
```

With no movement ability that reads: plain and rail 1, rough and water 2, with
a budget equal to Move. With `railMoveMultiplier: 3` it reads: rail 1,
everything else 3, budget `3 * Move` — three rail tiles for every ordinary one.

The destination must additionally be unoccupied by any standing unit.

**Forced movement** (`forceMove`) ignores Move, Jump, and terrain cost. It
travels up to `distance` tiles and stops early at the map edge, an unstandable
tile, an occupied tile, or a height delta greater than
`FORCED_MOVE_HEIGHT_LIMIT` (2). Direction: `push` is away from the caster,
`pull` is toward the caster, `toward-actor-facing` follows the caster's facing.

## 11. Height and standable surfaces

A tile's **stand height** is the terrain height, unless an active catwalk or
lift covers it, in which case it is the highest such `surfaceHeight`.

An object provides a surface when it is not destroyed, declares
`surfaceHeight`, and is either non-electrical (`powered: null`) or currently
powered. Cutting a lift's power drops its deck: the tile reverts to terrain
height, which changes both pathing and line of sight in the same instant.

## 12. Targeting and line of sight

**Range.** Manhattan distance in `[min, max]`, and
`|standHeight(target) - standHeight(origin)| <= vertical`.

**Line of sight.** The sight line runs from one unit of eye height above the
origin's stand height to one unit above the destination's. The grid is sampled
at `max(|dx|, |dy|)` steps; an intermediate tile blocks when

```
standHeight(sample) * steps > eyeOrigin * steps + (eyeTarget - eyeOrigin) * step
```

or when an undestroyed `blocksLos` object stands on it. Endpoints never block
themselves, and adjacent tiles always see each other.

**Area shapes.**

- `single` — the aimed tile only.
- `radius` — every tile within `size` Manhattan of the aimed tile whose stand
  height is within `vertical` of the aimed tile's.
- `line` — `length` tiles running from the caster toward the aimed tile, along
  the dominant axis, stopping at the map edge.

Everything standing in the area is affected, allies and the caster included —
`validTargets` gates what may be *aimed at*, not what gets caught. Objects
covering the area take the object-scoped effects.

## 13. Effect routing

An effect list runs in content order; each effect visits its targets in id
order.

| Effect | Runs on |
|---|---|
| `damage`, `heal`, `applyStatus`, `removeStatus`, `forceMove`, `modifyCharge`, `modifyDisposition`, `modifyStats` | units in the area that were not missed |
| `setPower`, `damageObject`, `repairObject` | objects named by the payload, plus objects covering the area |
| `spawnObject` | tiles of the area that are standable and unoccupied |

Notes:

- `modifyCharge` clamps to `[0, maxCharge]`; with `siphonToActor`, the amount
  actually removed is what the caster gains, itself capped at the caster's own
  maximum.
- `modifyDisposition` clamps to `[0, 100]`.
- `modifyStats` with a `duration` expires by the affected unit's own turns, the
  same clock statuses use.
- `spawnObject` creates a destructible object owned by the acting unit's team.
  `turret` becomes a `turret` that blocks movement; `mine` and `drone` have no
  `MapObjectKind` of their own and both become `machine` — mines do not block
  movement, drones do.
- An ability's `hpCost` is taken as self-inflicted chemical damage when the
  ability is used, and a command that would down its own caster is rejected.

## 14. Machinery

**Operating an object.** `activateObject` requires the acting unit to be within
one tile of any tile the object covers (standing on it counts), the object to
be undestroyed and to have an `operable` block, and — when
`operable.requiresPower` is set — to be powered. Operating costs the unit's
action. Its effects run on `operable.targetObjectIds` and on whatever stands in
`operable.targetTiles`.

**Integrity.** `damageObject` reduces `hp`; at 0 the object is destroyed.
Indestructible objects (`integrity.destructible: false`) ignore both damage and
repair. `repairObject` heals up to the object's authored `hp` and does **not**
resurrect a destroyed object.

**Destruction.** A destroyed object stops blocking movement, stops blocking
line of sight, stops providing a walkable surface, and loses power (emitting
`PowerChanged`). Its `onDestroyed` payload then runs against
`onDestroyed.targetTiles`, with no caster — so `fixed` amounts land at face
value and Attunement scaling is skipped on the caster's half.

**Power.** `setPower` with `on`, `off`, or `toggle` only affects objects that
are electrical at all (`powered` is not null) and not destroyed. A no-op change
emits nothing.

## 15. Encounter triggers

Triggers are evaluated after every command's effects have settled, and again
after the clock advances. Conditions read **current state**, not the event
batch, so a trigger fires whenever its condition holds.

| Condition | Holds when |
|---|---|
| `battleStart` | `state.turn === 0` (only during setup) |
| `turnStart` | `state.turn` equals the named turn |
| `unitDowned` | that unit is down |
| `objectDestroyed` | that object is destroyed |
| `unitEntersTiles` | any standing unit (of the named team, if given) is on one of the tiles |
| `unitHpBelowPercent` | that unit is standing and below the percentage |

A trigger fires at most once per command batch. `once: true` triggers are
recorded in `state.firedTriggerIds` and never fire again. Evaluation repeats
until nothing new fires, up to 8 passes, so one trigger may set up another.

Trigger actions go through the same functions commands do — `setPower`,
`destroyObject`, and unit creation are the identical code paths. `dialogue`
emits a `DialogueRequested` event and changes nothing; the presentation layer
owns it. `endBattle` resolves the battle immediately.

## 16. Win, loss, and Standing

Conditions are checked after every command batch. **Loss is checked first**, so
a turn that both routs the enemy and downs a must-survive unit is a loss.

| Loss | Met when |
|---|---|
| `partyRout` | every player unit is down |
| `unitDowned` | the named unit is down |
| `turnLimit` | `state.turn` exceeds the limit |

| Win | Met when |
|---|---|
| `rout` | every enemy unit is down |
| `defeatUnit` | the named unit is down |
| `surviveTurns` | `state.turn` reached the number |
| `reachTiles` | the named unit (or any standing player unit) is on one of the tiles |

**Downing is terminal for the battle.** A unit at 0 HP is out: it stops
occupying its tile, stops taking turns, loses any charge it had in flight, and
cannot be healed. The permadeath bookkeeping between battles is a progression
concern and lives outside this slice.

**Standing** (the JP analog) is awarded flat: `STANDING_PER_ACTION = 10` to the
acting unit for each action it resolves — an ability use, a charged ability
landing, or operating a machine. Moving and waiting earn nothing, and there is
no kill bonus. It accumulates on `unit.standingEarned` for the between-battle
screen to spend. Kept deliberately dumb: one number for a balance pass to turn.

## 17. Iteration order

Anything that can change an outcome iterates in an explicit order:

- Units: unit id, ascending (`state.units` is kept sorted).
- Objects: object id, ascending (`state.map.objects` is kept sorted).
- Tiles: row-major index.
- Neighbours in pathfinding: north, east, south, west.
- Statuses and timed mods: id, ascending.
- Equipment: `weapon, shield, head, body, accessory`.
- CT ties: higher CT first, then id ascending.

Object key order is never relied on anywhere.
