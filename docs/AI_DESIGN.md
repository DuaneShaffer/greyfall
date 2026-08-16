# Enemy AI

How `src/core/ai` decides. The engine cannot tell the AI from a player: it
emits ordinary `Command`s through the same front door
(`docs/ARCHITECTURE.md` §2), and every number it reasons about comes from the
rules in `docs/COMBAT_RULES.md`.

## Contract

```ts
chooseCommand(state: GameState, weights?: AiWeights): Command
enemyCommand(state: GameState, weights?: AiWeights): Command | null
```

- **Pure.** Nothing in `state` is mutated and nothing is remembered between
  calls. Hypothetical positions are evaluated on a shallow copy that shares
  everything but the acting unit.
- **Deterministic.** No `Math.random`, no clock, no map iteration order.
  Candidates are generated in a fixed order — tiles row-major, abilities by id,
  targets by unit id then object id then tile index — and ties are settled by
  keeping the first candidate generated. All scoring is integer arithmetic, so
  ties are exact rather than float-adjacent.
- **Legal.** Every returned command is validated against range, line of sight,
  `validTargets`, flux and HP costs, adjacency, and Move before it is proposed.
- **Terminating.** A turn resolves as at most a move, an action, and a `wait`;
  the caller applies each command and calls again.

`chooseCommand` speaks for whoever is taking a turn, which is what the balance
simulator wants for AI-versus-AI runs. `enemyCommand` is the browser's door: it
returns null on a player turn, between turns, and after the battle ends.

## The search

One scored-candidate search, no lookahead:

1. **Generate.** For every tile the unit can stop on (its current tile
   included), pair the tile with every legal action from it — each usable
   ability against each candidate target, plus `activateObject` on any operable
   machine within one tile.
2. **Score.** `score = positionValue(tile) + actionValue(ability, target)`,
   minus a flat premium for tiles that require moving (moving and acting costs
   100 CT against 80 for acting alone).
3. **Argmax.** The winner becomes a `move` if it stands somewhere else, the
   action itself if it does not, and `wait` with a chosen facing when nothing
   scores above zero.

Because the plan is re-derived after the move lands, the second call reproduces
the same action from the tile it just walked to. Acting first and then
repositioning falls out of the same loop: the action is scored from the current
tile, and the following call — action spent — searches tiles alone, which is
what makes an artillery kit fire and then back off.

### What an action is worth

`forecast` (the same selector the player's attack panel reads) supplies damage,
healing, hit chance, and status odds for everything in the area. Per unit in
the forecast:

- Damage counts only up to the target's remaining HP, so overkill is free of
  charge but worth nothing, and is then scaled by hit chance.
- A blow that reaches zero adds a flat kill bonus, itself scaled by hit chance.
- Status odds are valued from the status's own hooks — an action lock is worth
  more than a move lock, `ctMultiplierPercent` is priced per point, `tickDamage`
  at its damage — and are dropped entirely when the same blow kills.
- **A status the target already holds is discounted toward zero.** Re-applying
  refreshes the clock rather than stacking, so a second cast only buys the turns
  the first one has burned: at full duration it is worth nothing, one turn from
  lapsing it is worth most of its value, and an `untilRemoved` hold is worth
  nothing at all. Without this the search re-bought its own buffs every idle
  turn — Signal Jump nine times in one battle (`BALANCE_REPORT` G2).
- Healing counts only up to the target's missing HP. Downed units are never
  targets: the rules forbid healing them.
- Harm landing on an ally is weighted *up* before it is subtracted, and harm
  landing on the actor more so, which is what keeps AoE off friendly heads.
  **Only actual harm is weighted this way.** A buff arrives at the score as
  negative harm, and running that through the same percentages doubled the
  value of helping yourself — Overclocked priced at +960 against a kill bonus
  of 400, which is why three kits spent most of their turns buffing themselves
  (`docs/BALANCE_REPORT.md` F4). Negative harm on a friendly is now credited as
  positive utility, capped at `buffValueCap`.
- A gift of flux (`modifyCharge` with a positive amount) is aid, worth
  `chargePoint` per point the target has room to receive. Priced at zero, the
  Conduit's Tap Line could never be chosen at all.
- A target an in-flight charge already kills is discounted to a token value, so
  the team spreads its pressure instead of piling onto a corpse. A target
  several allies can already reach is discounted more gently for the same
  reason.
- **A `moveSelf` effect is priced as the tile it lands on.** The destination is
  computed the way the engine computes it — the same slide along the same
  facing, stopping at the same bounds, blockers, occupants and height limit —
  and the effect is credited `positionValue(destination)` minus
  `positionValue(here)`, clamped to `repositionCap` in either direction so a
  lunge can never outbid a body. Priced at zero, an ability whose whole point is
  the movement could never be chosen *for* the movement
  (`BALANCE_REPORT` G1). Nothing else about the move is modelled: it does not
  re-aim the attack that follows it in the same effect list.
- **Neutrals score zero** in either direction (`COMBAT_RULES` §18): the search
  neither hunts a bystander nor steers around one.

Then the costs: flux, HP per point, and — for a charged ability — the turn it
forfeits plus a decay for every turn the aimed-at unit gets before the cast
lands (read from `turnOrderPreview`). A charge aimed at an object or a tile does
not decay: it lands where it was aimed.

**Flux is priced as opportunity cost, not as a flat rate.** It does not
regenerate: a battle is one pool, so a point spent now is a point the rest of
the battle does without, and the price per point rises with the share of the
pool *still in hand* that the cast eats (`fluxScarcityPercent`). A Conduit's
five-point Arc out of fifty-three is nearly free; a Machinist's twelve-point
frame out of eighteen costs nearly double rate. What is left of the old
chip-damage gate is a nudge — `chipPenalty` scaled by how far the gross falls
short of `chipThreshold`, both now small — so that buying trivia with flux is
still worse than doing nothing. The gate used to be the whole story at
`chipThreshold` 200 and `chipPenalty` 250, which deleted every cheap utility
ability whatever its merits (`BALANCE_REPORT` G3).

Abilities whose `requires` the battlefield does not satisfy
(`COMBAT_RULES` §13a) never enter the candidate list at all.

**Items are abilities with a different price.** Anything in the acting unit's
team satchel (`COMBAT_RULES` §19) enters the candidate list as the ability the
engine synthesizes from it, and is scored by the same `abilityValue` — a heal
item is a heal, a thrown flask is a ranged attack with a status rider. The only
new term is a flat `itemUsePoint` subtracted for spending it, because a
consumable is the one resource that does not come back at the end of the
battle: the pool is the whole chapter's, not the turn's. At 120 (about twelve
hit points of value) a hand doses an ally who is genuinely hurt and leaves the
vial in the satchel for a scratch. A team with an empty satchel pays nothing
for the check.

### What the battlefield is worth

Objects are scored by what breaking them does, not by their integrity bar:

- Destroying an object is worth its `onDestroyed` payload evaluated against
  whoever is standing on the target tiles right now — the same signed harm and
  aid arithmetic as an ability — plus a small flat credit for removing a
  blocker. This is what makes a Conduit overload a flux cell two hostiles are
  flanking instead of swinging at one of them.
- **Plus the detour the blocker imposes.** Against the Dijkstra field already
  run to the quarry, walking *through* the object costs
  `distance(actor, tile) + best neighbour distance + 1`; anything the actor's
  real path costs above that is the detour breaking it would save, capped at
  `objectPathCap` steps. A blocker the actor is already on the near side of
  saves it nothing; one that walls the quarry off entirely is worth the whole
  cap. Measured from the actor's *own* tile once per decision, not from each
  candidate tile.
- **Plus what the machine would do in enemy hands.** An `operable` payload is
  priced against a unit like the actor and tapered twice: by how near our own
  people stand to the tiles the machine covers, and by how far a hostile has to
  walk to reach a tile it can be worked from. Destroying the machine collects
  that; so does cutting its power when the controls are `requiresPower`. Before
  this, `floor-nine-mains` — an object whose entire purpose is turning a press
  line off — priced at zero (`BALANCE_REPORT` G5).
- **Plus what its payload takes with it.** A `damageObject` term in an
  `onDestroyed` payload that would finish a second object credits
  `objectChainPercent` of that object's own worth, one level deep.
- Integrity damage that does *not* destroy is credited a fraction of all of
  that, in proportion to the bite it takes out, so a cell worth blowing up
  is worth softening and a cell worth nothing is worth nothing.
- Repairing an object is credited when the object belongs to the actor's team
  **or to nobody** — map-authored machinery carries `owner: null`, and crediting
  only owned objects meant a repair kit could never mend anything on a map it
  had not built itself.
- Flipping power is scored through the deck it carries — a lift or catwalk that
  loses power drops the tile to terrain height, which drags a hostile parked
  out of reach back into everyone's range, and strands an ally if the AI is not
  careful — and through the machine denial above.
- **On a declared grid (`COMBAT_RULES` §14a), all of that runs over the
  component rather than the object.** A cut, a thrown isolator, a hung load or a
  destroyed source is priced by asking the *real* recompute what it would do:
  the same `solveGrid` the rules run, on a hypothetical that clones only the
  node states and the object flags it reads. There is no second model of the
  graph, so the search and the rules cannot disagree about what a move does, and
  a load that would not actually trip the bus is worth what it is worth — which
  is usually nothing. The swing is computed once per (verb, target node) per
  decision, alongside the four things already hoisted out of the candidate loop.
  Every de-energized sink pays its machine denial, every `surfaceHeight` sink
  its deck value in both directions, and consequences that land on the actor's
  own side are weighted up rather than capped: a cut with six machines behind it
  is allowed to be enormous, it is just not allowed to be free.
- **Restoring is priced symmetrically.** A reclose, a splice and a tie-close
  credit what the machine is worth in *our* hands — machine denial with both
  tapers swapped — plus a flat tempo credit for clearing a latch that sits
  deliberately above the credit for throwing one. Without this term the search
  can cut and can never put anything back, and the tug-of-war a power switch has
  to be (`BALANCE_REPORT` §7.8.3) only ever runs one way.
- Line cuts and source kills carry **no flat value of their own**; they are
  priced entirely through the two terms above, so cutting a span that an
  authored tie already covers correctly scores zero.

On a map with no declared grid every one of those terms is exactly zero and the
arithmetic is the pre-grid arithmetic, byte for byte — which is what the golden
replays check.
- Deploying an object (`COMBAT_RULES` §14) is worth an obstacle credit, and only
  for a shape that actually blocks movement, plus its payload measured against
  the nearest hostile *by path from the tile it would stand on*. **A deployable
  cannot walk**, so the payload is discounted three ways: an `onContact` charge
  by how near a hostile is to the tile it would have to step on, an `attack` by
  how far the nearest hostile is outside the range the turret will never leave,
  by whether anyone on the other side can break machinery at all against its HP,
  and by one shot lost to the CT clock it starts at zero on. Undiscounted, a
  Sentry Frame scored ~700 against a basic attack's ~200 and the Machinist built
  until its flux was gone (`BALANCE_REPORT` G6).

Standing danger is a per-tile field built once per decision: every destructible
object with an `onDestroyed` payload prices its blast footprint against the
acting unit, weighted up sharply once the object has already taken damage and
down when it is intact, plus a small penalty for wet terrain. Mines join the
same field at full weight — a contact charge is a certainty, not a risk — and
only for the side it can actually go off under.

### What a tile is worth

- **Approach** — true path cost to the quarry, from a Dijkstra field run over
  the live map with the unit's own jump and terrain rules, so the crate stack
  and the height wall are visible where Manhattan distance is not. Artillery
  and support kits subtract a standoff first.
- **Exposure** — for each hostile, the damage its best ability would do to this
  unit, counted in full when the tile is inside its move-and-strike reach and
  at a fraction when it is a turn away.
- **Cover** — a bonus per ranged hostile whose line of sight the tile breaks.
- **Height**, **clumping** (a penalty per adjacent ally, so the squad does not
  hand anyone a free area effect), **guarding** (a support kit's bonus for
  keeping hurt allies inside heal range), and the hazard field above.

### Facing

`wait` is the only command that sets facing, so it is chosen last: the facing
that shows the fewest backs and sides to the hostiles who can reach the unit,
weighted by how hard each of them hits and how close they are. Back is free
evasion for the attacker (`COMBAT_RULES` §5), so this is worth a real number of
points rather than flavour.

## Job expression

The unit's kit is read, never authored. Abilities that heal or clear statuses
on allies make a **support**; otherwise a best offensive range of three or more
makes **artillery**, and anything else is **melee**. Abilities that damage,
power, or build objects add an object affinity on top of whichever archetype
came out; a kit carrying a grid verb — a cut, a splice, an overdraw, or a
`setPower` gated on a breaker or a source — adds a **grid affinity** the same
way, scaling every grid term. A bare `setPower` is not enough: every shipped
switch ability carries one and none of them is reasoning about a network. The archetype is a row of percentages in `weights.ts` scaling
approach, standoff, exposure, cover, height, ally aid, and object value — the
same search with a different temperament, which is how a Conduit keeps its
distance while an Enforcer walks into the maul.

## Stalemate

`urgency` steps up with `state.turn` and does three things: it multiplies the
pull toward the enemy, it zeroes the standoff so cautious kits stop holding
their range, and past a threshold it forces a unit that would otherwise hold
still onto the reachable tile genuinely closer to its quarry. It is derived
from the state, not remembered, so the determinism contract survives it.

This bounds *hesitation*, not the battle: two sides that cannot out-damage each
other's healing will trade turns forever, and that is an encounter design
problem, answered with a `turnLimit` loss condition. The simulation harness
should still cap commands per battle.

## Deliberately not modelled

- **No lookahead.** One turn, the unit's own. No opponent modelling beyond the
  static threat estimate, no minimax, no plan across turns.
- **Reactions** — neither the actor's nor the target's. `Riposte` punishing an
  attacker is invisible to the score.
- **Forced movement geometry.** `forceMove` is a flat disruption value; shoving
  a unit off a ledge, into a hazard, or out of a heal chain is not computed.
- **Sight lines the AI could open.** Paths are modelled (above); line of sight
  is not. It was built — every `blocksLos` object was credited for the hostiles
  it screened from the actor — and then cut, because it made a map with a lot of
  railing read as more worth demolishing than fighting on: on Charterhouse Steps
  it cost 30–45 points of party win rate and bought no measurable change in
  which abilities were chosen (`BALANCE_REPORT` §7.6).
- **Charge as a resource across turns.** Flux is priced against the pool it
  comes out of, but only for this cast: saving it for a better target next turn
  is not planned for.
- **Ability-to-ability sequencing** (debuff then payoff). A deployable's tile is
  now priced by what it can reach from there, but only that: a chokepoint is
  worth no more than open ground the same distance from the enemy.
- **`setPower` consequences other than decks and `requiresPower` controls** —
  a powered cell that a gated ability needs as its target is not modelled.
- **A deployable's own threat.** A hostile turret on the board is scored as an
  object to break, not as a source of damage in the exposure field.
- **Requirements as a reason to move.** A gated ability is dropped where it
  cannot be used; the AI does not walk onto a rail tile in order to use it.
- **Deployment and between-battle decisions**, which belong to progression.

## Tuning and cost

Every number lives in `src/core/ai/weights.ts`: `WEIGHTS` for the scoring
table, `PROFILES` for the archetype temperaments. `chooseCommand` takes a
weights argument, so a balance sweep can run variants against each other
without touching the search.

A decision costs about 0.20 ms on the Marshaling Yard with three to six units.
On Foundry Floor Nine, eleven units on a 16x16 board, one unit's decision costs
3.2 ms at Move 3 and 5.1 ms at Move 4. The per-decision work is bounded by the
reachable tile count times the abilities times the candidate targets, with range
checked before line of sight and line of sight before any forecast.

**Four things are computed once per decision rather than once per candidate**,
which is what keeps that number roughly linear in the reachable tile count
rather than growing with it twice over (`BALANCE_REPORT` G9):

- a **terrain grid** — standability, stand height and step cost per tile — so
  the Dijkstra field run for each hostile reads three arrays instead of walking
  the object list three times per edge. This was half of all AI time.
- **`positionValue` by tile index.** Every term in it reads the map, the
  hostiles, the allies and the distance fields; none reads where the *actor* is
  standing, so a tile has one value for the whole turn whichever candidate view
  asks. This is also what makes pricing a `moveSelf` destination nearly free.
- **the resolved area by ability and target**, for every footprint that does not
  read the actor's tile. A `radius` walks the whole map to find itself, and a
  `line` — the one shape that does read the actor's tile — is never cached.
- **what removing each object would do to the map**, and what each machine would
  do in enemy hands.

None of these change what is chosen: each is a value the old search recomputed
identically for every candidate. Candidate-tile *pruning* was considered and
not done — the numbers above are already inside budget, and any pruning that
changes which tiles are fully evaluated puts the exact choices the scenario
suite asserts at risk.
