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
- **Neutrals score zero** in either direction (`COMBAT_RULES` §18): the search
  neither hunts a bystander nor steers around one.

Then the costs: flux per point, HP per point, a chip-damage penalty when flux
is being spent on a small result, and — for a charged ability — the turn it
forfeits plus a decay for every turn the aimed-at unit gets before the cast
lands (read from `turnOrderPreview`). A charge aimed at an object or a tile does
not decay: it lands where it was aimed.

The chip penalty **ramps** rather than cliffs: it is `chipPenalty` scaled by how
far the gross falls short of `chipThreshold`, reaching zero at the threshold. A
flat penalty below the bar deleted every cheap utility ability at low level,
where almost nothing clears 200 points of gross.

Abilities whose `requires` the battlefield does not satisfy
(`COMBAT_RULES` §13a) never enter the candidate list at all.

### What the battlefield is worth

Objects are scored by what breaking them does, not by their integrity bar:

- Destroying an object is worth its `onDestroyed` payload evaluated against
  whoever is standing on the target tiles right now — the same signed harm and
  aid arithmetic as an ability — plus a small flat credit for removing a
  blocker. This is what makes a Conduit overload a flux cell two hostiles are
  flanking instead of swinging at one of them.
- Integrity damage that does *not* destroy is credited a fraction of that
  payload, in proportion to the bite it takes out, so a cell worth blowing up
  is worth softening and a cell worth nothing is worth nothing.
- Repairing an object is credited when the object belongs to the actor's team
  **or to nobody** — map-authored machinery carries `owner: null`, and crediting
  only owned objects meant a repair kit could never mend anything on a map it
  had not built itself.
- Flipping power is scored through the deck it carries: a lift or catwalk that
  loses power drops the tile to terrain height, which drags a hostile parked
  out of reach back into everyone's range, and strands an ally if the AI is not
  careful. Operable machines are scored by their payload the same way an
  ability is.
- Deploying an object (`COMBAT_RULES` §14) is worth a flat obstacle credit plus
  its payload measured against the hostile the actor means to fight: an
  `onContact` charge at `contactPayloadPercent`, because it pays out once, and
  an `attack` at `autoAttackPercent`, because it keeps firing while it stands.

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
came out. The archetype is a row of percentages in `weights.ts` scaling
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
- **Terrain and LoS the AI could create.** Destroying a wall is credited a flat
  structural point, not the paths and sight lines it opens.
- **Charge as a resource across turns.** Flux is priced per point spent now;
  saving it for a better target next turn is not planned for.
- **Ability-to-ability sequencing** (debuff then payoff), **spawned object
  placement quality** — the payload is priced, the tile it goes on is not — and
  **`setPower` consequences other than decks** (`requiresPower` controls,
  powered cells).
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

A decision costs about 0.25–0.30 ms on the Marshaling Yard with three to six
units — roughly 3,500 decisions a second, or a full AI-versus-AI battle in
about 50 ms. The per-decision work is bounded by the reachable tile count times
the abilities times the candidate targets, with range checked before line of
sight and line of sight before any forecast.
