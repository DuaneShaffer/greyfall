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

A deployable's `autoAttack` (§14) draws one accuracy roll of its own, at the
moment it fires on the clock.

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
| `weapon` | `floor(phys * weaponPower * power / D(L))` | percent of a full weapon swing |
| `phys` | `floor(phys * power * 200 / D(L))` | a multiplier on Phys |
| `mag` | `floor(mag * power * 200 / D(L))` | a multiplier on Mag |
| `fixed` | `power` | the number itself |
| `maxHpPercent` | `floor(targetMaxHp * power / 100)` | percent of the target's max HP |

**The divisor scales with the acting unit's level.**

```
D(L) = WEAPON_DAMAGE_DIVISOR + DAMAGE_DIVISOR_PER_LEVEL * (L - 1)
     = 400 + 250 * (L - 1)
```

Constants: `WEAPON_DAMAGE_DIVISOR = 400`, `DAMAGE_DIVISOR_PER_LEVEL = 250`,
`STAT_AMOUNT_NUMERATOR = 200`.

Why: HP grows sub-linearly (`STAT_BASE.hp` is 40) while Phys and Mag grow
linearly off a base of 0, so a constant divisor makes time-to-kill collapse —
measured at 7.45 swings to down at level 1 and 2.63 at level 5, with 16 of 49
job pairings one-shotting (`docs/BALANCE_REPORT.md` F1). Scaling the divisor
with the caster's level holds it at roughly 7 swings across levels 1–5 and
removes every one-shot. `D(1) = 400`, so **every level-1 number in this
document is unchanged**; `fixed` and `maxHpPercent` are deliberately left flat,
so an `onDestroyed` blast falls behind as units grow.

An amount with no acting unit (an `onDestroyed` payload, a deployable whose
owner is gone) uses `D(1)`, and its `weapon`/`phys`/`mag` bases resolve to 0
because there is no stat behind them.

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
- Vale (Mag 10, Attunement 70) casting Overload Cell (`mag`, power 20) on the
  yard cell: `floor(10 * 20 / 2)` = 100, `floor(100 * 70 / 100)` = **70**.
- The same caster's Arc (`mag`, power 8) onto a unit with Attunement 45:
  `floor(10 * 8 / 2)` = 40, `floor(40 * 70 / 100)` = 28,
  `floor(28 * 45 / 100)` = **12**.

Healing uses the same amount pipeline and is capped at the target's max HP.
**Downed units cannot be healed** — in this world the dead stay dead
(creative bible §5.4).

## 5. Accuracy, facing, and evasion

Accuracy is rolled once per *hostile* unit in an ability's area. Allies,
neutrals (§18), the caster, objects, and tiles are never missed. A miss cancels
every unit-scoped effect on that unit and emits `AbilityMissed`.

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
3. Every undestroyed object with an `autoAttack` banks CT equal to its
   `autoAttack.speed` (§14).

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
- Then **every ready deployable shoots**, highest CT first, object id breaking
  ties, each spending 100 CT.
- Then **one unit takes a turn**, highest CT first, unit id breaking ties.

Deployables do not appear in `turnOrderPreview`: they consume no unit turn and
the preview answers "who acts next", not "what happens next".

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
  this). Allies and neutrals (§18) may be walked through but not stopped on.
  Downed units do not occupy anything.

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

**Self movement** (`moveSelf`) slides the *acting* unit under exactly the same
rules and limits, once per effect rather than once per target. Direction:
`toward-target` and `away-from-target` are measured against the first tile of
the ability's area, `forward` follows the actor's own facing — which is what a
self-targeted ability needs, since its aimed tile is the tile it is standing on.
`moveSelf` does not change facing; the actor has already turned to face what it
aimed at.

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
| `setPower`, `damageObject`, `repairObject`, `addLoad`, `severLine` | objects named by the payload, plus objects covering the area |
| `spawnObject` | tiles of the area that are standable and unoccupied |
| `moveSelf` | the acting unit, once, regardless of area size |

Notes:

- `modifyCharge` clamps to `[0, maxCharge]`; with `siphonToActor`, the amount
  actually removed is what the caster gains, itself capped at the caster's own
  maximum.
- `modifyDisposition` clamps to `[0, 100]`.
- `modifyStats` with a `duration` expires by the affected unit's own turns, the
  same clock statuses use.
- `spawnObject` creates a destructible object owned by the acting unit's team
  and unit. `turret` and `drone` block movement; `mine` does not. Its optional
  `onContact` and `attack` payloads are copied onto the object and are what
  make it more than an obstacle (§14).
- An ability's `hpCost` is taken as self-inflicted chemical damage when the
  ability is used, and a command that would down its own caster is rejected.

## 13a. Ability requirements

An action ability may carry a `requires` list. Every entry must hold or the
command is rejected with `requirement-unmet`. This is what makes the
infrastructure pillar binding rather than thematic — the bible's "a Conduit on
a dead map with no cells is nearly powerless" is a rule here, not flavour.

| Requirement | Holds when |
|---|---|
| `railUnderfoot` | the actor's own tile has `rail` terrain |
| `adjacentPoweredObject` | an undestroyed, **energized** object covers a tile within 1 of the actor (its own tile counts) |
| `targetPowered` | the aimed-at object — or an object covering the aimed tile — is undestroyed and **energized** |
| `targetEnergized` | the same test, under its grid-native name (§14a) |
| `targetLine` / `targetSource` / `targetBreaker` | the aimed-at object is a node of a declared grid holding that role |

The first two read only the actor, so `availableAbilities` filters on them and
a menu can grey the ability out before anything is aimed. `targetPowered`
cannot be judged until a target exists, so it is enforced by `targetableTiles`
(which prunes the tiles that fail it), by `forecast` (which returns an empty
list), and by command validation. The AI applies all three when generating
candidates.

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

**Contact payloads (`onContact`).** An object carrying one goes off when a unit
enters a tile of its footprint. It fires for movement, for `forceMove`, for
`moveSelf`, and for a scripted `moveUnit` — but **never for the team that
deployed it** (a map-authored object has no owner and goes off for everyone).
The object destroys itself first unless `destroysSelf: false`, so it cannot
re-trigger inside its own payload; a chain of shoves across several charges is
bounded at `MAX_CONTACT_DEPTH` (4).

Contact is checked on the tile a unit **ends its movement on**, not on every
tile of the path. A mine is therefore area denial rather than a tripwire across
a corridor — a deliberate slice-scope simplification, because interrupting a
move mid-path would make the `UnitMoved` event's own path a lie.

**Attack payloads (`autoAttack`).** An object carrying one rides its own CT
timeline at `autoAttack.speed`, exactly as a slow unit does (§6), and at 100 CT
it shoots the nearest hostile of its **owner's** team inside `range` and (unless
`requiresLos: false`) line of sight, distance breaking to unit id. It rolls
accuracy from its own tile under §5. Amounts resolve against the unit that
deployed it while that unit is still standing — so a turret inherits its
Machinist's Phys, Mag, and level — and fall back to the caster-less rules (§4)
once the owner is gone. A destroyed object banks no CT and never fires.

A spawned deployable starts at 0 CT, so it is always slower to its first shot
than the unit that placed it: setup time is the cost of board presence.

## 14a. The flux grid

A map may declare **grids** beside its object list. A grid is a named graph
whose nodes each name exactly one map object and whose edges are authored, never
derived from footprint adjacency — so destroying an unrelated wall cannot
silently rewire the floor. Design record: `docs/design/FLUX_GRID.md`.

**Roles.** Each node holds exactly one, and an object belongs to at most one
grid.

| role | is | extra data |
|---|---|---|
| `source` | a main, a plant feed, a racked cell bank | `capacity` |
| `line` | the geometry that carries: cable runs, bus bars, trays | — |
| `sink` | what consumes: presses, lifts, hoists, lamps, emitters | `draw` |
| `breaker` | an isolator, a mains switch, a tie switch | — |

**The one input, and the one derived value.** `MapObject.powered` keeps its
field, its type and its mutability and is read as the node's own **isolator** —
"this node's switch is closed". Everything that wrote power before still writes
exactly that. What is derived is **energization**: whether the node is being
fed. A normally-open tie is authored `powered: false`, which is the existing
flag already saying the right thing; there is no `closed` field.

Every rule that used to read `powered` reads energization instead:
`operable.requiresPower`, `surfaceHeight` provision (§11), `adjacentPoweredObject`
and `targetPowered` (§13a), the `object-unpowered` refusal, the POWER register,
and the AI's operable scan. **No requirement is renamed** — those two already
name the derived value.

**Energization.** Per grid, on every mutation:

```
conducts(n) = !destroyed(n) && n.powered && !n.severed
           && !(n.role === "source" && n.tripped)

components = connected components of { n : conducts(n) } over the edge list
for each component C, in ascending order of its lowest node id:
    capacity(C) = Σ capacity of its sources
    load(C)     = Σ draw of its sinks + Σ timed loads on its nodes
    capacity(C) === 0     -> every node in C is dead
    load(C) > capacity(C) -> trip every source in C (latching); recompute
    otherwise             -> every node in C is live
```

The loop repeats while any source tripped, bounded at `sources.length + 1`
passes and asserted so in tests: after a trip that component's capacity is zero,
so it cannot trip twice.

**The trip is total and it latches.** An overloaded component does not shed by
priority — the main blows, the whole component goes dark, and it stays dark
until someone recloses it. Load shedding is more faithful and unreadable; a
total trip reads off the board in one glance. Latching makes overdraw a tempo
attack (the reset costs an action) and removes any possibility of a recompute
oscillating. **A timed load expiring does not un-trip anything.**

**Sinks draw whenever they are energized, not when they are operated**, so the
readout only moves when somebody acts on the grid. **Load and capacity are flat
authored integers and never touch the `Amount` pipeline** (§4), so nothing in
the grid can drift with Attunement.

**The degeneracy rule.** An object with no `network`, or with one naming no
declared grid, behaves exactly as it did before grids existed: formally a
one-node grid that is both a source of capacity 0 and a sink of draw 0, joined
to nothing, for which `conducts` reduces to `powered && !destroyed` and
`energized === powered`. There is no special case in the code or the schema.

**Cut, destroy, reroute.**

| event | node state | reversed by | permanence |
|---|---|---|---|
| isolator thrown | `powered` false | throwing it back | any time, either side |
| line cut (`severLine sever`) | `severed` true | a splice | any time |
| breaker or tie opened | `powered` false | closing it | any time |
| source tripped | `tripped` true | a reclose | any time |
| object destroyed | out of the graph | nothing | permanent |

The cut is the cheap reversible verb and belongs to `line` nodes only;
destruction stays `damageObject` and stays permanent (§14). **The reclose is a
`setPower on` written to a tripped source**: closing a latched source's isolator
is the only thing that clears the latch, and it clears it even though `powered`
was already true, since the latch lives on the node rather than on the isolator.

**Recompute timing.** Called once per graph-mutating primitive — `setPower`,
`severLine`, `addLoad`, object destruction, a timed load expiring — in the
effect order §13 already fixes, never batched to end of command: an ability that
cuts a source and then operates a machine must see a consistent world between
its own effects. It is a pure function of (graph, node states, object states)
and emits only where energization actually flipped, so calling it redundantly
has no observable consequence. **Nothing about the grid is cached.**

**New effects** (§13's table, routed to objects beside `setPower` /
`damageObject` / `repairObject`):

| effect | does |
|---|---|
| `addLoad { amount, durationTurns }` | hangs a flat timed draw on the aimed node's component; expires on **the caster's own turns** (§8) and is dropped immediately if the caster is downed, the same rule that cancels a charge in flight (§7) |
| `severLine { mode }` | `sever` cuts a `line` node, `splice` puts it back; a no-op on any other role |

**A licensed draw hangs less.** A support passive may carry
`gridLoadReduction`, which is subtracted from the amount of every `addLoad` the
unit hangs, floored at zero and never credited back to the bus. It is resolved
once, on the way into the load, so the rules, the aim-time component highlight
and the AI's hypothetical all read the same number. It follows whoever hangs the
load, including through an `operable` payload they pulled the lever on; a load
with no caster at all (an `onContact` payload) takes none. It is a flat integer like
the rest of the grid and does not touch the `Amount` pipeline (§4). Rated Draw
is the only ability that carries it.

**New requirements** (§13a): `targetLine`, `targetSource`, `targetBreaker` read
the aimed-at node's role; `targetEnergized` is the grid-native spelling of
`targetPowered` and both mean the same derived value.

**Ordering** (extending §17): grids by grid id ascending; nodes by object id
ascending; edges stored with `a < b` and visited in stored order; components
discovered by scanning nodes in id order; timed loads by load id ascending.

## 15. Encounter triggers

Triggers are evaluated after every command's effects have settled, and again
after the clock advances. Conditions read **current state**, not the event
batch, so a trigger fires whenever its condition holds.

| Condition | Holds when |
|---|---|
| `battleStart` | `state.turn === 0` (only during setup) |
| `turnStart` | `state.turn` has **reached or passed** the named turn |
| `unitDowned` | that unit is down |
| `objectDestroyed` | that object is destroyed |
| `unitEntersTiles` | any standing unit (of the named team, if given) is on one of the tiles |
| `unitHpBelowPercent` | that unit is standing and below the percentage |

**`turnStart` is reaches-or-passes, not equals.** `state.turn` counts
individual unit turns, and a turn consumed entirely inside `advanceClock` — a
Stunned unit whose turn the engine opens and closes with no command in
between — is never seen by trigger evaluation at its own index. Testing for
equality therefore skipped turns silently. Combined with `once: true`, which is
how these are authored, the trigger now fires exactly once: at the first
evaluation at or after that turn index.

A trigger fires at most once per command batch. `once: true` triggers are
recorded in `state.firedTriggerIds` and never fire again. Evaluation repeats
until nothing new fires, up to 8 passes, so one trigger may set up another.

Trigger actions go through the same functions commands do — `setPower`,
`destroyObject`, and unit creation are the identical code paths. `dialogue`
emits a `DialogueRequested` event and changes nothing; the presentation layer
owns it. `endBattle` resolves the battle immediately.

| Action | Does |
|---|---|
| `dialogue` | emits `DialogueRequested`; changes nothing |
| `spawnUnits` | creates units through `createBattleUnit`, skipping ids already on the field |
| `setPower` / `destroyObject` | the same functions commands use |
| `moveUnit` | teleports a standing unit to `to`. Move, Jump, and path length are ignored — this is authoring — but the tile must be standable and unoccupied, so a script can never stack two units. Emits `UnitForcedMove` and checks contact payloads. |
| `removeUnit` | takes a unit off the field without downing it: its turn is closed first if it is taking one, its charges are cancelled, and it leaves `state.units` entirely. Emits `UnitRemoved`. |
| `endBattle` | resolves the battle immediately |

**Triggers run before win and loss.** `settle()` calls `evaluateTriggers` and
then `evaluateOutcome`, which is what lets a `unitDowned` trigger put a boss's
last words on screen before the `BattleEnded` that same command causes. Every
closing beat in the slice depends on it and `tests/core/conditions.test.ts`
asserts the ordering.

## 16. Win, loss, and Standing

Conditions are checked after every command batch. **Loss is checked first**, so
a turn that both routs the enemy and downs a must-survive unit is a loss.

| Loss | Met when |
|---|---|
| `partyRout` | every player unit is down |
| `unitDowned` | the named unit is down |
| `turnLimit` | `state.turn` exceeds the limit |
| `unitReachesTiles` | a standing unit matching `unitId` and/or `team` is on one of the tiles |

| Win | Met when |
|---|---|
| `rout` | every enemy unit is down |
| `defeatUnit` | the named unit is down |
| `surviveTurns` | `state.turn` reached the number |
| `reachTiles` | the named unit (or any standing player unit) is on one of the tiles |
| `all` | every condition in its list is met at the same moment |

`unitReachesTiles` is the pursuit objective: `reachTiles` exists only as a win,
so "they got away" needed its own polarity. With neither `unitId` nor `team`
given it watches every standing unit.

`all` is a one-level AND inside the OR that the win list already is — "put down
every provocateur". Groups do not nest.

**Rout counts units still on the field.** A team with no units at all is not
routed, so a `removeUnit` trigger that clears the last enemy does *not* win the
battle; script the `endBattle` alongside it if that is the intent.

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
- Objects: object id, ascending (`state.map.objects` is kept sorted), including
  the CT tiebreak between two deployables ready on the same tick.
- Tiles: row-major index.
- Neighbours in pathfinding: north, east, south, west.
- Statuses and timed mods: id, ascending.
- Grids: grid id, ascending. Grid nodes: object id, ascending. Grid edges:
  stored with `a < b` and visited in stored order. Timed loads: load id,
  ascending.
- Equipment: `weapon, shield, head, body, accessory`.
- CT ties: higher CT first, then id ascending.

Object key order is never relied on anywhere.

## 18. Teams and neutrality

Three teams exist: `player`, `enemy`, and `neutral`.

**`neutral` is non-combatant.** It is hostile to nobody and nobody is hostile
to it — `areEnemies` is false in both directions — which is what lets a
character stand on the map as a body rather than a voice. Consequences, all of
them falling out of that one rule:

- **Movement.** Both sides walk *through* a neutral the way they walk through
  an ally, and neither may stop on its tile.
- **Accuracy.** A neutral caught in an area is never rolled against and never
  missed, exactly like an ally (§5).
- **The AI.** Neutrals are absent from the hostile list, from threat
  estimation, and from crowding. They score zero in `sideValue`, so the search
  neither hunts them nor protects them; it simply cannot see them.
- **Outcomes.** `rout` and `partyRout` count `enemy` and `player` units
  respectively, so a neutral neither prevents a rout nor stands in for a
  wiped party.

A neutral is still a legal target for a deliberately aimed `enemy`-scoped
ability — shooting a bystander is a thing a *player* can choose to do, and what
it costs is a content question, not a rules one.

## 19. Items

Consumables are the Chemist's half of the game and everyone else's insurance.
The design rationale lives in `docs/ITEMS.md`; this section is the rules.

**The satchel.** Each team carries one shared pool, `state.satchels`, keyed by
team and sorted by team name; each pool's stacks are sorted by item id and a
stack that reaches zero is removed. The player's pool is the chapter's whole
consumable stock, handed to `createBattle` as `carried`; the hostile force's
comes from the encounter's `enemySatchel`. There are no per-unit carry slots:
whoever can reach the target spends from the same pile.

**Who may use one.** The `equipTag` rule that governs equipping governs
reaching too — the acting unit's *primary* job must share at least one tag with
the item. Every job in the slice carries `field-issue`, so the seven shipped
consumables are universal; a compound tagged `chemist-kit` would not be.
Refusals are `item-not-issued`.

**The command.** `useItem` spends the unit's action and nothing else: no flux,
no HP, no cast time, and the turn is not ended, so the unit may still move.
It awards `STANDING_PER_ACTION` like any other action. Validation, in order:

| Code | Cause |
|---|---|
| `already-acted` / `action-prevented` | the action is spent, or a status suppresses it |
| `unknown-item` | no such item, or it is not a consumable |
| `item-not-issued` | the unit's job shares no `equipTag` with the item |
| `item-not-carried` | the team satchel has none left |
| `invalid-target`, `object-destroyed`, `out-of-range`, `no-line-of-sight` | the shared aiming rules (§12) |

**Targeting.** A consumable may author a `targeting` block with exactly the
shape an ability's takes. Omitting it falls back to the engine default —
range 0–1, vertical 1, single tile, no line of sight, `self` or `ally` — which
is FFT's Item rule: pressed into a hand at arm's length. A thrown item says so
in its own block.

**Item mastery.** A slotted support ability may carry two passives that only
consumables read:

- `consumableEffectBonusPercent` scales the `power` of every `damage` and
  `heal` amount in the item: `power' = floor(power * (100 + bonus) / 100)`.
  Status chances, charge top-ups, and cures are untouched — a compound either
  works or it does not.
- `consumableRangeBonus` adds tiles to the item's maximum range. It never
  changes the minimum, the vertical, or the area.

Both are read from the acting unit, so the same flask reaches further and bites
harder in a Chemist's hand than in an Enforcer's. `data/abilities/bench-grade.json`
carries +50% and +2.

**Resolution.** The engine synthesizes an action ability from the item —
`item:<itemId>`, scaled and widened as above — and runs it through the ordinary
ability path, so area resolution, accuracy, reactions, `forecast`, and
`targetableTiles` all behave exactly as they do for an ability. The colon keeps
the id out of the authored namespace (`Id` forbids it), and `useItem` is the
only way to issue one: `act` rejects it as not learned.

**Events.** `ItemUsed { unitId, itemId, team, remaining }` is emitted before the
item resolves, followed by the ordinary `AbilityUsed` naming the synthesized
ability. The renderer poses an item use as a cast.

**Coming home.** `applyBattleResults` folds the satchel back: on a win the
shortfall against the chapter's stock is struck from it, on a loss nothing
changes, exactly as with Standing and the fallen (`docs/PROGRESSION.md` §4).
