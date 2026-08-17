# Map Notes — Slice Battles 2–5

Design record for `data/maps/foundry-floor-nine.json`, `tallow-row.json`,
`refinery-three.json`, and `charterhouse-steps.json`. Battle 1
(`marshaling-yard.json`) is the format exemplar and is not covered here.

Each map is a thesis on the battlefield system its battle showcases
(creative bible §8) and a real functioning workplace whose function is its
danger (bible pillar 4).

## Reading the sketches

Two grids per map, same coordinates. `x` runs east across the top, `y` runs
south down the side.

**HEIGHTS** — stand height per tile. A digit is the height a unit occupies
there, *including* any catwalk or lift deck over it. `#` is impassable
terrain, `:` is an open void tile with nothing decked over it.

**PLAN** — terrain and objects. `.` plain, `,` rough, `=` rail, `~` water,
`:` void, `#` impassable, `*` a deployment tile, and a letter for every tile
an object covers (keyed under the grid).

## Shared conventions

- **Height gates.** A face of 1 is free, 2 costs Jump 2 (excludes the
  Conduit, Jump 1), 3+ is Railrunner/Augmented only. Where a route must be
  closed to everyone regardless of Jump, the intervening tile is impassable
  terrain — height alone never gates hard.
- **Catwalks span void.** Decks sit over `void` tiles so that dropping one
  removes the crossing outright rather than merely lowering it. That is the
  Saboteur's `bring-it-down` fantasy expressed in terrain.
- **`onDestroyed` scale.** Calibrated off the marshaling yard cell (24
  thermal, orthogonal neighbours). Small risers and cells 20–24 over 3–6
  tiles; a catwalk collapse 24 kinetic (plus a thermal rider where the drop
  is into something hot); operable hazards 16–18, because they recur.
- **Operables cost an action and are usable by both sides.** Every one of
  them is sited so that its control position is reachable from both
  approaches — a hazard that only the defender can fire is a trap, not a
  system.
- **Only seven abilities in the game carry `damageObject`.** No destructible
  object is ever the *sole* route to anywhere; demolition is always a
  shortcut over a longer legal path. Verified by reachability search at
  Jump 1 on all four maps.
- **No status references except `stunned`.** Hazards express themselves as
  damage.

---

# 2. Foundry Floor Nine — 16 × 16

*Battle 2. Systems: presses and pour-ladles as operable hazards;
destructible catwalks; the first fight where **not** operating the machinery
is the mistake.*

```
HEIGHTS                    PLAN
   0123456789012345           0123456789012345
 0 #22222222222222#         0 #.....ddd......#
 1 #11222333222112#         1 #..............#
 2 0000114000010101         2 ......f,,,....=.
 3 0000114000010101         3 ......f,,,..o.=.
 4 #000114000121201         4 #.....f,,,....=.
 5 #000114000:3:201         5 #a....f,,,:g:.=.
 6 #000114000:3:201         6 #a.k..f,,,:g:.=.
 7 #000124000:3:201         7 #.....f,,,:g:.=.
 8 #000134000:3:201         8 #b...hf,,,:g:.=.
 9 #000110000121201         9 #b.l..,,,,....=.
10 #000110000010101        10 #...i.,,,,...j=.
11 #000110000000001        11 #c....,,,,p...=.
12 #000110000000001        12 #c....~~,,.nn.=.
13 0000000000000001        13 ..*mm**ee**.*.=.
14 0000000000000000        14 .==*====*===*==.
15 0000000000000000        15 ......*..*......

a press-line-north   b press-line-mid    c press-line-south
d pour-ladle-tap     e slag-sluice-south f ladle-gantry
g bay-bridge         h charge-lift       i lift-switch
j floor-nine-mains   k slag-cart-north   l slag-cart-south
m ingot-stack        n scrap-hopper-east o feeder-cell-north
p feeder-cell-south
```

Height range 0–4. 16 objects. 26 rail tiles, 12 void, 42 rough.

## The place

North is the tap end: a working deck at height 2 with the crucible platform
at 3 and the pour ladle above it. Molten metal runs south down the **pour
aisle** (x 6–9, slag-caked rough), over the **ladle gantry** at height 4,
and out through the slag sluice at the foot. West is the **press line** —
three blanking presses against the wall, their beds forming the charging
lane. East is the **melt bay**, an open pit with a single bridge across it,
the gantry walk beside it at height 2, and the ingot rail running north out
of the south scrap spur. The Watch comes in through the south doors.

## Tactical thesis

The floor is running and nobody turned it off. Every fast route across this
map is a route through a machine's working envelope: the west lane *is* the
press beds, the centre aisle *is* the pour channel, and the east bridge is
one Saboteur charge from being a hole. A squad that treats the machinery as
scenery walks its own units into hazards a squad that takes the operator
niches fires on schedule.

## Intended flow

**Opening.** Deployment sits along y 13–15 with three distinct mouths — the
west lane at x 2–3, the aisle at x 6–9, and the east floor past the scrap
hopper. First contact is 4–6 tiles out. The decision at deployment is which
lane, and specifically whether to spend an early unit going east for the
**mains** at (13,10), which shuts down all three presses and the ladle at
the cost of a unit's tempo and everyone's access to them.

**Midfield.** The press gauntlet is the west story: slag carts at (3,6) and
(3,9) narrow the lane so that the quick line north runs across the beds at
x 2. Activation is Manhattan 1, so the press controls are the four niches at
(1,4), (1,7), (1,10), (1,13), deep in the alley between the machines — or
the bed itself, if you want to fire a press you are standing in. The aisle is the open AoE-risk zone: three tiles
wide once the gantry takes x 6, swept from the north by the ladle (y 2–4)
and from the south by the sluice (y 9–12), leaving y 5–8 as the only aisle
stretch nothing points at. The east is the vertical story: floor 0 → gantry
walk 2 → bridge 3, with the bay pit under it.

**Pivot.** The tap deck. Its lip is height 2 the whole way along, so Jump 2
scrambles up almost anywhere while a Conduit needs the height-1 stairs at
x 1–2 or x 12–13 — the endgame separates the party by Jump. The crucible
platform at x 6–8 is height 3 above a height-0 aisle and is a Railrunner or
Augmented step only; the ordinary way onto it is along the deck or off the
gantry. The ladder to the gantry — floor 0 → operator platform 1 →
(5,7) at 2 → charge lift at 3 → gantry at 4 — is a five-step stair tower
that the **lift isolator** at (4,10) can cut in one action, stranding
whoever is up there and denying the height-4 firing line.

## Objects

| id | purpose |
|---|---|
| `press-line-north/mid/south` | The gauntlet. Operable (needs power): 30 kinetic + 50% stun onto the two bed tiles each. Blocks movement and LoS, so they are also the west lane's cover. hp 60 — a Saboteur can decommission one. |
| `pour-ladle-tap` | The enemy-side lane denial: 16 thermal down six aisle tiles (y 2–4). Operated from the tap deck, which both sides can reach via the flank stairs. Destroying it (hp 80) dumps 24 thermal over the crucible platform. |
| `slag-sluice-south` | The player-side mirror: 16 thermal over the lower channel (y 9–12). Ungated by power (gravity-fed), so it still works after the mains go off. Covers a withdrawal or punishes a push down the aisle. |
| `ladle-gantry` | Height-4 firing platform down the aisle's length. Standing on it takes x 6 out of the aisle floor; dropping it (hp 40) hands the lane back and drops anyone on it for 24 kinetic. |
| `bay-bridge` | The only crossing of the melt bay. Ends land on the height-2 pads at (11,4) and (11,9). Dropping it (hp 45) severs the east flank and puts whoever was on it into the pit for 20 kinetic + 20 thermal. |
| `charge-lift` | Rung four of the gantry stair tower. Powered, so cutting its power drops the deck and breaks the chain. |
| `lift-switch` | Cuts the charge lift. Sited on the operator platform, mid-map, contested. |
| `floor-nine-mains` | Kills or restores power to all three presses and the ladle at once. The map's one strategic switch: safe play or armed floor, and whoever holds the east can flip it. |
| `slag-cart-north/south` | Narrow the west lane so the fast line runs through press beds. hp 25 — cheap to clear, which is the point. |
| `ingot-stack`, `scrap-hopper-east` | Cover on the south approach so the opening is not a bare charge. |
| `feeder-cell-north/south` | Conduit fodder and cascade bait on the east floor; 24 thermal to orthogonal neighbours. |

## Encounter hooks

- **Deployment intent.** Player from the south doors. Enemies (foundry hands
  and provocateurs) belong *on the machinery*: the tap deck at y 0–1, the
  operator platform x 4–5, the gantry walk x 13. Placing one on the ladle
  gantry at height 4 immediately teaches what the gantry is for.
- **Trigger tiles.** `unitEntersTiles` on the aisle mouth `(6,11)…(9,11)` for
  "the floor is still running" — good place to have a hand fire the ladle in
  dialogue. `unitEntersTiles` on the bridge `(11,5)…(11,8)` for a scripted
  drop. `unitEntersTiles` on the tap stairs `(1,2),(2,2),(12,2),(13,2)` for
  the tap-end reinforcement beat.
- **Suggested objective.** Rout, but consider a `turnStart` trigger that
  powers the floor back on after the player kills the mains, so the shutdown
  is a delay rather than a solve.

---

# 3. Tallow Row — 16 × 18

*Battle 3. Systems: destructible walls opening new routes, gas lines that
flare.*

```
HEIGHTS                    PLAN
   0123456789012345           0123456789012345
 0 0011122222211100         0 ..............=.
 1 0001111111110000         1 ..............=.
 2 00####0000####00         2 ..####.m..####=.
 3 0000000000000000         3 ..b..a....c...=.
 4 0000000000000000         4 .....a....cp.d=.
 5 00####0000####00         5 ..####....####=.
 6 0000000000000000         6 ..,,,,....,,,,o.
 7 00####0000####00         7 ..####....####=.
 8 0000000000000000         8 ~....e....g..h=.
 9 0000000000000000         9 ~uf.qe....g...=.
10 00####0000####00        10 ~.####....####=.
11 0000000000000000        11 ..,,,,.ss.,,,,t.
12 00####0000####00        12 ..####....####=.
13 0000000000000000        13 ..j..i....k...=.
14 0000000000000000        14 .....i....kr.l=.
15 00####0000####00        15 ..####.n..####=.
16 0000110000110000        16 ..........vv..=.
17 0000000000000000        17 .********....**.

a/b frontage/back-wall-west-north    c/d  …-east-north
e/f …-west-mid                       g/h  …-east-mid
i/j …-west-south                     k/l  …-east-south
m gas-main-north   n gas-main-south   o gas-main-alley
p gas-riser-east-north  q gas-riser-west-mid  r gas-riser-east-south
s refuse-barricade  t tram-cart  u tap-splice  v rendering-vat
```

Height range 0–2. 22 objects. Verticality is deliberately near-flat: the
only relief is the gallery stair at the head of the Row (heights 1→2) and
the two loading stoops at the foot.

## The place

A street in the Underveins with six tenements on it, three to a side, backing
onto service alleys. The blocks are masonry mass (impassable, height 2) at
their ends, ground-floor rooms between; each room is boarded to the street
and open at the back through a single doorway. The disused gallery tram runs
down the east alley on rail. The west gutter sumps at y 8–10. Cross-alleys at
y 6 and y 11 are the only east–west links, and they are choked with refuse
(rough — double move cost). At the head of the Row, the stair up to the
gallery is the saboteurs' way out. Vein-glass dimness is the renderer's job;
nothing here encodes it.

## Tactical thesis

The map is a grid of walls, and the walls are negotiable. Every tenement has
a long way in — down to a cross-alley, along it at double cost, up the back
alley to the doorway — and a short way in, which is one charge through the
frontage. The gas mains make the short way a double-edged one: an opening
blown next to a riser is a room that can be emptied from the street, and it
works in both directions.

## Intended flow

**Opening.** The player deploys across the foot of the Row, y 17, split west
(x 1–8) and east on the tram (x 13–14). First masonry is 2 tiles out and the
first frontage 3–4, so the opening move is a lane commitment, not a brawl:
the street (fast, 4 wide, overlooked from every frontage), the west
alley/gutter (1–2 wide, slow, safe from the street), or the tram (fastest
lane on the map for a Railrunner, and blocked twice).

**Midfield.** The pursuit runs north up the Row. The refuse barricade at
(7,11)–(8,11) squeezes the street to x 6 and x 9 exactly where the mid
cross-alley crosses it — the intended first real chokepoint and the intended
place for the enemy to hold. Flanking around a block costs roughly 8 tiles
across rough; blowing a frontage and cutting through a room costs one action
and 4 tiles. That trade is the whole battle.

**Pivot.** The head of the Row. `gas-main-north` at (7,2) sits in the street
mouth under the gallery stair, so the final push is into an area that
detonates. The stair itself (heights 1 at y 1, 2 at y 0) is the map's only
high ground and the escape route — hold it or lose the cell.

## Objects

| id | purpose |
|---|---|
| `frontage-*` (6) | The street-facing boards, 2 tiles each, hp 30. Blowing one converts a 6–8 tile detour into a direct opening and puts the room's interior into LoS from the street. |
| `back-wall-*` (6) | 1 tile each, hp 30. The other half of the back wall is the doorway — a 1-tile chokepoint into the back court, which is why the rooms are never a hard gate. |
| `gas-main-north` | (7,2), head of the Row under the gallery stair. 20 thermal over six street tiles. hp 16 — anything that can hurt objects pops it. |
| `gas-main-south` | (7,15), foot of the Row. Same payload. Sited so the player's own opening cluster is inside the blast if they bunch up. |
| `gas-main-alley` | (14,6), standing on the tram line. Blocks the rail lane; clearing it flares six tiles of the east alley. The Railrunner's dilemma in one object. |
| `gas-riser-*` (3) | One per room in three of the six tenements, in the corner furthest from the doorway. 24 thermal over the other three room tiles — a room-clearer, reachable through a blown frontage. |
| `refuse-barricade` | (7,11)–(8,11). The street chokepoint at the mid cross-alley. hp 25. |
| `tram-cart` | (14,11). Second rail blocker, so the tram is a lane you have to work for. |
| `tap-splice` | Unmetered flux tap in the west alley at (1,9), by the sump. 22 arc to three tiles. The one piece of flux infrastructure on the map, and it is stolen — which is the district. |
| `rendering-vat` | (10,16)–(11,16). Operable, no power needed: 18 chemical over the east half of the Row's foot. Tallow Row renders tallow. Sited off the player's deployment tiles so it punishes an enemy counter-push down the east alley rather than the opening. |

## Encounter hooks

- **Deployment intent.** Player at the foot; the saboteur cell distributed
  north, with at least two *inside* rooms (legal placement — rooms have
  doorways) so that "they're in the house" reads immediately.
- **Trigger tiles.** `unitEntersTiles` on the mid cross-alley
  `(6,11)…(9,11)` for the barricade stand. `unitEntersTiles` on a room
  interior — `(3,3),(4,3),(3,4),(4,4)` is the cleanest — for the
  requisition-seal discovery, which is the battle's story beat. The gallery
  stair landing `(5,0)…(10,0)` is the natural escape/rout condition: if a
  named saboteur stands there, they got away.
- **Note.** The gas mains are the obvious scripted-flare material, but they
  are cheap enough (hp 14–16) that the player will find them first. Let
  them.

---

# 4. Corvane Refinery Three — 18 × 18

*Battle 4. Systems: powered machinery, overloadable cells; Conduit showcase;
partial map destruction scripted at the midpoint.*

```
HEIGHTS                      PLAN
   012345678901234567           012345678901234567
 0 001111111111111100         0 ..................
 1 0011#111##111#1100         1 ....#..h##...#....
 2 001111111111111100         2 ..................
 3 000000000000000000         3 ...............=..
 4 000000001100000000         4 ...........ttr.=..
 5 0#0002222222200000         5 .#...........j.=..
 6 0#0002444444200000         6 .#....bbbbbb...=~.
 7 0#00034####4200000         7 .#k..fdaaaae..l=~.
 8 0#00124####4210000         8 .#k...daaaae..l=~.
 9 0#00124####4210000         9 .#k...daaaae..l=~.
10 0#00024####4300000        10 .#....daaaaeg..=~.
11 0#0002444444200000        11 .#..i.cccccc...=~.
12 0#0002222222200000        12 .#.s...........=..
13 000001100000000000        13 ........nopq...=..
14 000000000000000000        14 ....uu.........=..
15 000000000002000000        15 ...,,......m,..=..
16 000000000000000000        16 .======*======*==.
17 000000000000000000        17 ....***.***.**....

a reduction-tower       b tower-walk-north   c tower-walk-south
d tower-walk-west       e tower-walk-east    f charge-hoist-west
g charge-hoist-east     h switchboard-main   i feed-switch-west
j feed-switch-east      k pump-line-west     l condenser-bank-east
m dock-crane            n–q bank-cell-one…four
r stillage-cell-north   s stillage-cell-west
t drum-stack-north      u drum-stack-south
```

Height range 0–5 (tower mass 5, walk decks 4, terrace 2). 21 objects, of
which 12 are electrical and carry `network: "refinery-three-grid"`.

## The place

Reduction Tower Number Three stands in the middle of its own quench sump, a
ring of open pit crossed only by the tower walk at height 4. One step out
from the sump is the pumping terrace at height 2; beyond that the plant
floor. The control gallery runs along the north wall at height 1. The
loading line runs east–west along y 16 and north up x 15, with the charging
rack on the floor at y 13 and the dock crane over the line. West is the
feedstock pump; east the condenser bank and its quench troughs.

## Tactical thesis

Everything on this map is on a circuit, and the circuit is the terrain. The
tower blocks line of sight absolutely, so the walk around it is a corridor
where you fight a blind corner at height 4 — and the two hoists that are the
only Jump-1 way up there are powered, which means one switch (or one
Conduit) decides who is stranded. The cells are racked four in a row on
purpose: their `onDestroyed` payloads carry `damageObject`, so the rack
chains end to end, and both sides can see it.

## Intended flow

**Opening.** Deployment across the loading line at y 16–17. The charging
rack at y 13 is 4 tiles out and the terrace 5 — far enough that the first
turn is a route choice and near enough that the rack is an immediate
temptation. Four ramps (height 1 steps) are the only Jump-1 ways onto the
terrace: north (8–9, 4), west (4, 8–9), east (13, 8–9), south (5–6, 13).
Each is covered: the pump line sweeps the west ramp, the condenser sweeps
the east, and the rack sits square in front of the south one.

**Midfield.** The terrace is the contested ring. Getting onto it is easy for
Jump 2 anywhere along its lip and hard for a Conduit anywhere but the four
ramps — which is a pointed thing to do to the job whose showcase this is,
and the reason the switches matter more to them than the ladders.

**Pivot.** The tower walk. From height 4 you see over the terrace and the
whole plant floor, and you see nothing at all through the tower. Both
hoists answer to `switchboard-main` in the control gallery, so a single
action from the north wall can strand every Jump-1 unit on the ring or lock
them off it. Cutting an arc (hp 40) turns the ring into a C and drops
whoever was standing on it into the sump for 24 kinetic + 16 thermal.

## Objects

| id | purpose |
|---|---|
| `reduction-tower` | 4 × 4, indestructible, blocks movement and LoS, sitting on impassable mass at height 5. The map's pivot and its sight-line wall. |
| `tower-walk-north/south/west/east` | The ring at height 4, over void. Four separately destructible arcs so the Saboteur can cut a specific route instead of all of them. |
| `charge-hoist-west/east` | Height-3 decks at (5,7) and (12,10) that bridge terrace (2) to walk (4) in two Jump-1 steps. Powered — the whole point. |
| `switchboard-main` | (7,1), control gallery. Toggles both hoists at once. The single most valuable tile on the map for a non-Conduit party. |
| `feed-switch-west/east` | (4,11) and (13,5). Toggle the pump line and condenser bank respectively; either side can kill the hazard covering its own approach. |
| `pump-line-west` | Operable (needs power): 18 chemical over the west aisle and ramp. Blocks LoS, so it is also the west lane's wall. hp 50; rupturing it vents 20 chemical. |
| `condenser-bank-east` | Mirror on the east: 18 thermal over the east ramp. Vents 20 thermal on destruction. |
| `dock-crane` | Height-2 perch over the loading line. Jump 2 to mount (or a Railrunner's hook) — a deliberate small reward for the mobility jobs. |
| `bank-cell-one…four` | (8,13)–(11,13), adjacent, hp 20 each. Each carries 24 thermal **and** `damageObject` 24 to its neighbours, so any one of them takes the whole rack with it. |
| `stillage-cell-north/west` | Loose cells at (13,4) and (3,12) for Conduit work away from the rack; 24 thermal, orthogonal. |
| `drum-stack-north/south` | Cover on the open floor north and south of the terrace. |

## Midpoint destruction — material for the encounter workstream

The engineered overload is yours to script; here is what has been left
lying around for it.

1. **The cascade is authored, not scripted.** `destroyObject` on any single
   `bank-cell-*` propagates through all four on its own — the chain runs in
   `onDestroyed` and needs no trigger of its own. It lands 24 thermal on
   roughly a twelve-tile band across y 12–14, which is survivable for a
   unit at full HP and lethal for one that has been fighting. Destroy
   `bank-cell-one` and let the data do the rest.
2. **Pair it with `destroyObject` on `tower-walk-south`.** That is the piece
   that changes the map rather than just hurting people: the ring becomes a
   C, the south approach to height 4 is gone, and anyone standing on the arc
   falls into the sump. This is the intended shape of "fail to fully stop
   it."
3. **Then `setPower: off` on `charge-hoist-west` and `charge-hoist-east`.**
   The grid browns out, both decks drop, and every Jump-1 unit on the ring
   is stuck on it. Restoring them means reaching `switchboard-main` at
   (7,1) — which gives the second half of the battle a destination.
4. **Suggested trigger.** `unitEntersTiles` on the terrace lip
   `(5,12)…(12,12)` for a player unit, or a `turnStart` around turn 8,
   whichever the pacing wants. Fire all of the above in one trigger's
   `actions` so it reads as one event.
5. Do **not** script destruction of `reduction-tower` — it is indestructible
   by design and the map's geometry depends on it standing.

## Encounter hooks

- **Deployment intent.** Player off the loading line, south. The refinery
  crew and the provocateurs' Conduit belong on the terrace and the ring; put
  the engineered-overload character in the control gallery at y 0–2 so the
  switchboard is also where the plot is.
- **Trigger tiles.** Terrace lip `(5,12)…(12,12)` (midpoint, above). Gallery
  floor `(6,2)…(9,2)` for the confrontation at the switchboard. Ring tiles
  for anything that should react to the player taking the height.

---

# 5. The Charterhouse Steps — 16 × 18

*Battle 5. Systems: everything, height as the primary terrain weapon.*

```
HEIGHTS                    PLAN
   0123456789012345           0123456789012345
 0 ################         0 ################
 1 #999#999999#999#         1 #...#......#...#
 2 8888888888888888         2 .....p....q.....
 3 8888888888888888         3 .......~~.......
 4 8888888888888888         4 .aaa........bbb.
 5 ####7##77##7####         5 ####.##..##.####
 6 6666666666666666         6 .......ii.......
 7 6666666666666666         7 ..cccc....dddd..
 8 #5#####55#####5#         8 #.#####..#####.#
 9 4444444444444444         9 o.....jjkk......
10 4444444444444444        10 .eee,,....,,fff.
11 3###3#3333#3####        11 n###.#....#.####
12 2222222222222222        12 ................
13 2222222222222222        13 ..gggg....hhhh..
14 #1####1111####1#        14 #.####....####.#
15 0000000000000000        15 ...ll......mm...
16 0000000000000000        16 =...............
17 0000000000000000        17 *=***=****.*.*..

a balustrade-court-west   b balustrade-court-east
c balustrade-upper-west   d balustrade-upper-east
e balustrade-mid-west     f balustrade-mid-east
g balustrade-lower-west   h balustrade-lower-east
i founders-plinth         j hedge-planter-west  k hedge-planter-east
l carriage-block-west     m carriage-block-east
n service-lift            o lift-cutout
p lamp-standard-west      q lamp-standard-east
```

Height range 0–11 (house frontage 11, portico 9, terraces 8/6/4/2, carriage
court 0). 17 objects.

## The place

The Corvane estate's terraced approach, seen from the carriage court at the
bottom. Four terraces climb to the upper court, the portico, and the house
wall. Each terrace face is a retaining wall — impassable, not merely tall —
pierced by three openings: the grand stair up the middle and one flank stair
on each side. The flank openings alternate, so a flanking unit walks the
width of every terrace it gains. Balustrades line the terrace lips. A
fountain basin sits on the upper court. There is a tradesmen's tram at the
very bottom of the court, on rail, and a goods lift on the west margin —
and that, apart from two lamp standards, is all the machinery on the map.

## Tactical thesis

The estate is a staircase built to be defended and dressed as a garden. Every
terrace face is impassable, so Jump never buys a shortcut — only the six
openings do, and each is a killing funnel with a balustrade line above it
and clear ground below. The grand stair is direct and rises into fire; the
switchbacks are safe and cost a turn per terrace to walk sideways. Height
does the rest: with most abilities capped at vertical 1–2, a unit two
terraces below is not merely disadvantaged, it is out of the fight.

## The Rise pretends to be above all that

This is the one map where the industrial systems are scarce, and that is the
point. The Works and the Underveins are made of machinery because they are
made of labour; the Charter Rise is made of stone stairs and box hedges
because it has arranged not to see the machinery its money comes from. What
flux infrastructure exists here is either decorative (the two lamp standards
on the upper court, which are flux cells with garden ironwork on them) or
hidden at the tradesmen's end (the service lift and its cutout, on the west
margin at the bottom, where deliveries come in). There is one short run of
rail, the tradesmen's tram along y 16–17, and it does not go up.

That leaves the Railrunner with almost nothing to key off — which is the
correct outcome and is the bible's own statement of the job (§6: "on a rail
map a demon, in a bare courtyard merely quick"). The finale is where terrain
specialists get to find out that terrain is not always for them.

## Intended flow

**Opening.** Deployment across the carriage court, y 17, with the two
carriage blocks at y 15 as the only cover on flat ground. The first
retaining wall is 3 tiles out; first contact 3–4. The lane commitment is
immediate and near-irreversible, because switching flanks below a terrace
means crossing the full width of the court under fire from above.

**Lower and middle terraces.** The grand stair (x 6–9 at y 14, x 6–9 at
y 11) opens into the balustrade gap each time — an intentional funnel. On
terrace two the box planters at (6,9)–(9,9) sit directly behind the stair
head, so a unit that climbs the middle arrives in a pocket and has to break
out laterally to x 4–5 or x 10–11. The west switchbacks at x 1 (y 14) then
x 4 (y 11) and the east at x 14 then x 11 cost roughly three tiles of
sideways walking per terrace — one turn each, four turns to the top.

**Upper terrace.** The grand stair narrows to two tiles (x 7–8) at y 8 and
y 5. Terrace three is the defender's firing step: height 6, balustraded, with
the Founder's Plinth at (7,6)–(8,6) squarely behind the stair head so that
the last broad approach is blind and blocked. This is where the fight should
be decided.

**Upper court.** Height 8, the boss ground. The fountain at (7,3)–(8,3) is
water — double move cost — right where a charge across the court would
cross. The two lamp standards are the only detonables on the map and both
are within reach of a defender's back line, which is the finale's one
reversal: the Rise's decorations are still flux, and flux still goes up.

## Objects

| id | purpose |
|---|---|
| `balustrade-lower/mid/upper/court-west,east` (8) | Destructible cover, hp 30, on each terrace lip, with the stair heads left open. They block LoS, which is what makes a terrace defensible rather than merely high; blowing a section opens a firing lane onto the terrace behind it. |
| `founders-plinth` | (7,6)–(8,6), hp 40. Blocks the grand stair's exit onto terrace three, forcing the final broad approach to split. A statue of the founder, in the way. |
| `hedge-planter-west/east` | (6,9)–(9,9), hp 20. Channel the grand stair's exit on terrace two into a pocket. Cheap, so the player can clear them — at the cost of an action spent on shrubbery. |
| `carriage-block-west/east` | The court's only cover, hp 25. Sited so the opening advance has one thing to break line of sight with. |
| `service-lift` | (0,11), height-3 deck over the terrace-two retaining wall on the west margin. Bypasses the y 11 transition in one step instead of the switchback's lateral walk. Powered. |
| `lift-cutout` | (0,9), on terrace two — defender ground at the start, attacker ground once terrace two falls. Whoever holds terrace two owns the west bypass. |
| `lamp-standard-west/east` | (5,2) and (10,2), upper court. Flux cells, hp 24, 24 arc to orthogonal neighbours. The only detonables on the map and the only flux on it. |

## Encounter hooks

- **Deployment intent.** Player in the carriage court, y 17. The Watch
  defends downward: a screening line on terrace one, the body of the force
  on terrace two behind the planters, marksmen on terrace three behind the
  balustrades.
- **Boss placement.** The sketch put Aldric on terrace three at **(8,7)**,
  beside the Founder's Plinth at height 6 — the tile that commands both flank
  stair heads and the grand stair's exit, with the statue at his back — and had
  him withdraw to **(8,4)**, height 8, between the two lamp standards, on a
  `unitHpBelowPercent` trigger at 50–60%.

  **Shipped: the withdrawal as designed, from a terrace lower.** `moveUnit`
  exists now, so (8,4) is a real second position rather than an implied one.
  (8,7) did not survive measurement: with the roster at the levels the campaign
  actually produces, the party died on terraces one and two while Aldric took
  18 damage in 106 unit turns — the boss was scenery. He stands at **(8,10)**,
  in the pocket the hedge planters make of the grand stair's exit, which is
  also where `terrace-two-the-proof` fires, so the bible's beat lands with the
  man standing in it. `watch-sergeant-steps` holds (7,7) behind the plinth
  instead, so terrace three is still defended ground. See
  `docs/ENCOUNTER_NOTES.md` §5.
- **Trigger tiles.** Each terrace lip is a natural phase line:
  `(0,13)…(15,13)` (terrace one taken), `(0,10)…(15,10)` (terrace two),
  `(0,7)…(15,7)` (terrace three), `(0,4)…(15,4)` (upper court, where the
  proof is put to him). One `once: true` dialogue trigger per line paces the
  climb without any additional map machinery.
- **Note for the writer.** `lift-cutout` is a small, characterful beat: the
  Watch shutting the tradesmen's entrance is exactly what the Watch would
  do. Consider a `battleStart` action setting `service-lift` power off, so
  the player has to take terrace two to open it.

---

# 6. The Meter House — 16 × 16

*The first grid-native map (`docs/design/FLUX_GRID.md` §4.1, "two mains, one
bus"). Systems: a declared flux grid as the terrain — two sources, four
severable runs, three breakers and a normally-open tie; a lift deck that
drops when its component goes dark. Not a slice battle; see
`docs/ENCOUNTER_NOTES.md` §6.*

```
HEIGHTS                    PLAN
   0123456789012345           0123456789012345
 0 ################         0 ################
 1 #11111111111111#         1 #..............#
 2 #11111111111111#         2 #......pp......#
 3 #00000000000000#         3 #.,d,......,m,.#
 4 #00000000000000#         4 #.,d,......,m,.#
 5 #00000011000000#         5 #=====....=====#
 6 #00000222200000#         6 #.....f........#
 7 #00001222200000#         7 #a...e.g......o#
 8 #00001222200000#         8 #abbce.....inno#
 9 #00001222210000#         9 #...ce....hi...#
10 #00000000010000#        10 #.........hj.l.#
11 #00000000000000#        11 #..q...=~~~j.r.#
12 #00000000000000#        12 #......=~~~k...#
13 ##00###00###00##        13 ##..###=.###..##
14 0000000000000000        14 ==**===**===**==
15 0000000000000000        15 ..**.*.**.*.**..

a west-main         b west-feeder       c west-board
d charge-hoist-west e gallery-run       f west-lamps
g gallery-tie       h meter-lift        i east-board
j sump-run          k feed-pump         l east-lamps
m charge-hoist-east n east-feeder       o east-main
p ledger-rack       q drum-stack-west   r scrap-hopper-east
```

Height range 0–3 (perimeter mass 3, gallery landing 2, meter walk and the
two access steps 1, hall floor 0). 18 objects, of which 15 are nodes of
`meter-house-grid`. 29 rail tiles, 8 rough, 6 water, no void.

## The place

A Corvane metering hall in the Works, where two flux mains cross and the
Assay's Meter keeps the tallies on them. The hall is one room. Two feeds
enter through the side walls at mid-depth — the **west main** at (1,7)–(1,8)
and the **east main** at (14,7)–(14,8) — and each runs inboard along a
covered floor trough to its own **switchboard**. The **gallery landing**
stands dead centre at height 2, and the **gallery tie** — the interconnection
breaker between the two boards — sits on it, normally open, which is how a
metering hall runs when nobody is being clever. The **meter walk** along the
north at height 1 is the office: tally ledgers, the rack, the two cutout
keys. South of the landing the floor falls away to the **sump**, six tiles of
standing water that the feed pump vents. The hall's south wall has three
doors and nothing else; the receiving bay and its siding are outside them.

Both charge hoists stand in bays off the north walk, on grit. The gallery run
climbs the landing's west face in a trough you can walk in.

## Tactical thesis

**The circuit is the map, and it has two of everything except a tie.**
Foundry Floor Nine gives you one switch and asks whether to throw it; the
Meter House gives you a graph and asks *which two things to do, in which
order*. With the tie open the house runs as two halves, each at 10 of 14, and
either half can be blacked out on its own. With the tie closed it runs as one
bus at 20 of 28, which is proof against an Overdraw and fatal the moment
either main stops feeding it.

So the two objectives only matter together. Killing a main is worth an action
only if the tie's state makes it worth one, and the tie is a tile rather than
a body. That conjunction — *this is only worth doing if you also do that* — is
the thing a single-switch map cannot say, and it is the whole reason to build
a graph.

## The grid

Grid id `meter-house-grid`, name "Meter House Grid", kind `flux`. Fifteen
nodes, fourteen edges, each edge stored with `a < b`.

| node | role | data | is |
|---|---|---|---|
| `west-main` | source | capacity 14 | The west feed, and its own reclose handle. Operable (no power needed) with `setPower: on` on itself. hp 60. |
| `east-main` | source | capacity 14 | The east feed. Same shape, same handle, same hp. |
| `west-feeder` | line | hp 40 | Floor trough, main to board. Walk-through: no movement or sight blocked. |
| `east-feeder` | line | hp 40 | The mirror. |
| `gallery-run` | line | hp 40 | The run that climbs the landing's west face and carries the lift and the gallery lamp. |
| `sump-run` | line | hp 40 | Down from the east board to the pump and the apron lamp. |
| `west-board` | breaker | — | Switchboard. Operable, toggles its own isolator. Indestructible; it blocks movement and sight, so it is also the west lane's cover. |
| `east-board` | breaker | — | The mirror. |
| `gallery-tie` | breaker | — | The interconnection breaker, authored `powered: false` — a normally-open tie is the existing flag already saying so. Operable, toggles itself. **Indestructible on purpose**: the tie is the counterplay to everything else on this map, and an enemy who could delete it would delete the thesis. |
| `charge-hoist-west` | sink | draw 4 | Operable (needs power): 24 kinetic + 40% stun onto its own two bed tiles, which are the west bay's fast line. hp 45. |
| `charge-hoist-east` | sink | draw 4 | The mirror, on the east bay. |
| `meter-lift` | sink | draw 4 | Goods lift onto the landing's south-east corner, `surfaceHeight` 1. Indestructible — this one is the *reversible* half of the state table, and dropping it is a power decision, never a demolition. |
| `feed-pump` | sink | draw 4 | Operable (needs power): 14 thermal over the six sump tiles. hp 40. |
| `west-lamps` | sink | draw 2 | Lamp standard on the landing. Pure load. hp 24. |
| `east-lamps` | sink | draw 2 | Lamp standard on the sump apron. Pure load. hp 24. |

```
west-main --- west-feeder --- west-board --- charge-hoist-west
                                  |   \
                                  |    gallery-run --- meter-lift
                                  |         \-------- west-lamps
                             gallery-tie   (normally open)
                                  |
east-main --- east-feeder --- east-board --- charge-hoist-east
                                  \-------- sump-run --- feed-pump
                                                   \---- east-lamps
```

**The arithmetic, and every claim it makes.** Sinks draw 4 for a hoist, a
lift or a pump and 2 for a lamp standard, which is §1.7's convention
literally. Each half therefore carries **10 against a rating of 14 — 71%**,
inside the 70–85% contested band. Closing the tie makes one component of
**20 against 28**, headroom of exactly **8**.

Overdraw is +8, and those two numbers are quoted together for a reason:

- **18 > 14**, so an Overdraw trips either half on its own.
- **28 is not > 28**, so the same Overdraw does not trip the bus once the tie
  is closed. The defender's answer to a Conduit is one action on a breaker.
- **14 is not > 14**, so shedding a single 4-draw machine with an isolator
  saves the half without needing the tie at all. Two answers, priced
  differently, both an action.

And the conjunction:

- Tie **open**, kill `west-main`: the west half goes dark and the east half
  never notices. Half a map for one permanent, expensive verb.
- Tie **closed**, kill either main: 20 against 14, and the **whole house**
  trips. The defender's own headroom insurance is the attacker's opening.
- The answer is two actions in order — **open the tie, then reclose the
  survivor** — which restores half the floor. Reclosing first is an action
  spent on nothing: 20 against 14 is still 20 against 14, and it trips again
  the instant it comes in.

All of the above is asserted against the engine's own `solveGrid` in
`tests/data/meterHouse.test.ts`, including the brackets that pin the load
exactly (a hung load of 4 fits a half and 5 does not; 8 fits the bus and 9
does not).

**And all of it is on screen.** The POWER register groups its rows by component
and carries one LOAD line per bus, so the reading above is literally what the
player sees: `EAST MAIN 10/14` and `WEST MAIN 10/14` with the tie open, one
`EAST MAIN + WEST MAIN 20/28` with it closed, and no LOAD line at all on a half
nothing is feeding. It shipped summing the whole grid to `20/28` — a circuit
nobody was standing in — and that is corrected (`docs/design/FLUX_GRID.md`
§2.5a). The tie's arithmetic is therefore permanent rather than something the
sergeant says once if a player happens to walk onto the landing.

**The warning band is nearly unreachable here, and that is an authoring lesson
rather than a bug.** The LOAD line has three colours — copper under 90% of the
rating, `overload-500` from 90%, blood past 100% — and on this map the middle
one almost never appears. Draws of 4/4/2 against a rating of 14 give a half
10, 12 or 14 and nothing between; only exactly **14/14** lands in 90–99%, and
only ever by hanging a load on it (Backfeed at +4 under Rated Draw). The tied
bus is the same arithmetic doubled: 20, 26 or 28 of 28, and it reaches amber
only through a Conduit. In ordinary play the house goes copper straight to
blood, so the colour that means *this is about to blow* is the one the player
never learns to read.

Recorded as a guideline and **not fixed here**: the encounter lands at
70.8/70.8% on both seed sets and retuning it to buy a colour would spend a
measured balance landing on a legibility nicety. Every one-number change that
puts the resting house inside 90–99% (rating 14 → 11, or a lamp 2 → 5) makes
amber the house's *resting* colour, which destroys the warning rather than
delivering it. **The guideline for the next grid map: choose draw and capacity
so the sink set can actually sum into 90–99% of the rating.** A rating of 12
against sinks of 4/3/3/2 reaches 11 and 12 of 12 by shedding or adding one
machine, so the band is a state the map passes through rather than a state
only an ability can produce. A band nothing can land on is a colour the palette
is spending for nothing.

**Siting, per §1.7's mandatory pair.** There is one tie and there are two
reclose points, and all three are reachable from both approaches: the mains
sit at mid-depth on opposite side walls rather than behind either force's
line, and the landing has a permanent Jump-1 way up from the north and
another from the west. This is MAP_NOTES' operable rule — *a hazard only the
defender can fire is a trap, not a system* — restated for topology, and it is
verified by reachability search rather than asserted.

## Intended flow

**Opening.** Deployment is the receiving bay at y 14–15, and the south wall
has exactly three doors: the **west door** at x 2–3, the **centre door** at
x 7–8 (on the hand-truck rail), and the **east door** at x 12–13. The
deployment decision is which door, and it is close to irreversible, because
the wall between them is mass. First contact is 4–6 tiles in. West buys the
west main, the west board and the hoist bay; centre buys the rail lane and
arrives under the landing's south face, which is a height-2 wall; east buys
the sump apron, the east board and the lift.

**Midfield.** The floor is open and the fighting is about boards. Each board
blocks movement and sight, so the two lanes that pass them are corners, and
both boards are one action from taking their own half of the house down. The
hoist bays at y 3–4 are the north half's press-line analogue: the fast line
up either flank runs across a bed, and the operator niches are the grit tiles
beside them, reachable from either side. The sump is the centre's tax — six
water tiles at double cost, right where the centre door's rail lane wants to
open out — and the feed pump makes standing in it a decision rather than a
delay.

**Pivot.** The landing, and the tie on it. Three ways up: the **north step**
at (7,5)–(8,5), the **west ramp** at (5,7)–(5,9) — the trough the gallery run
lies in — and the **meter lift's deck** at (10,9)–(10,10), which is the only
one that answers to the grid. The lift is the shortest road from the south
and east doors to the tie; with its deck dark that road is four tiles longer
and runs through the middle of the hall. Everything else on the landing's
face is height 2 from height 0, so Jump 2 goes up almost anywhere and a
Conduit walks. That is a pointed thing to do to the job whose mechanic this
is, and it is the same joke Refinery Three makes with its four ramps.

**No destructible object is the sole route to anywhere**, and neither is a
powered one: with `meter-lift` de-energized, every tile of the hall and every
operable's control position is still reachable at Jump 1 from every
deployment tile. Verified by search, the way the rule was verified for the
other four maps.

## Objects

| id | purpose |
|---|---|
| `west-main` / `east-main` | The two feeds, capacity 14 each, at (1,7)–(1,8) and (14,7)–(14,8). Each is its own reclose handle — operable, no power needed, `setPower: on` on itself — so a non-Conduit party has an answer to a trip and both sides have the same answer. **hp 60**, matching Floor Nine's press line: they have to be destructible or §4.1's conjunction cannot happen at all (`overload-cell`'s `damageObject` against an indestructible source succeeds and does nothing), and they have to be expensive or the permanent verb stops being the expensive one. Blowing one lands 22 arc on four tiles. |
| `west-feeder` / `east-feeder` | Covered floor troughs, main to board, hp 40. They block neither movement nor sight — they are floor trays with grating over them, and the map is a room, not a maze. Destroying one is 12 arc over its own tiles: modest on purpose, because **the cut is the routine verb and the demolition is the one that cannot be answered**. |
| `gallery-run` | The run up the landing's west face, hp 40. It carries the lift deck and the gallery lamp, so cutting it is the cheapest way to take the vertical shortcut away — and a splice is the cheapest way to give it back. The tiles it lies in are the west ramp, at height 1: the trough is the ramp. |
| `sump-run` | The run south from the east board to the pump and the apron lamp, hp 40. Cutting it disarms the sump. |
| `west-board` / `east-board` | The switchboards, at (4,8)–(4,9) and (11,8)–(11,9). Indestructible, blocking movement and sight, operable by either side with no power needed. Each is the isolator for its own half and the cover for its own lane. |
| `gallery-tie` | (7,7), on the landing, `powered: false`. The map's one strategic tile. Indestructible: everything else here can be taken off the board permanently, and the piece that makes those decisions reversible must not be. |
| `charge-hoist-west` / `charge-hoist-east` | The bays' hazard, hp 45. Operable and power-gated: 24 kinetic + 40% stun onto the two bed tiles beside them — Floor Nine's press one notch quieter, because this is a metering hall and not a foundry floor. Wrecking one lands 16 kinetic over the bay. |
| `meter-lift` | (10,9)–(10,10), `surfaceHeight` 1. The vertical shortcut, and the only piece of terrain on the map that answers to the load bar. Indestructible, so the only way to take it away is to take its power away, and the only way to keep it is to keep the west half fed. |
| `feed-pump` | (11,12), hp 40. Operable and power-gated: 14 thermal over the whole sump. Ungated hazards belong to whoever holds the ground; this one belongs to whoever holds the grid. |
| `west-lamps` / `east-lamps` | Lamp standards, hp 24, 20 arc to their neighbours. Pure load — 2 each — which is the point: they are what a defender sheds and what an attacker never bothers with. |
| `ledger-rack` | (7,2)–(8,2) on the meter walk. Cover for whoever holds the office, and the reason the north wall is a firing step rather than a shooting gallery. |
| `drum-stack-west`, `scrap-hopper-east` | Cover inside the west and east doors, so the opening is not a bare walk into an open room. |

## Encounter hooks

- **Deployment intent.** Attacker from the receiving bay, south, through one
  of three doors. Defenders belong *on the circuit*: somebody at the tie on
  the landing, somebody at a board, somebody in a trough with cutters, and a
  body in the middle of the floor so the landing is not free.
- **Trigger tiles.** `unitEntersTiles` on the tie landing
  `(7,7),(8,7),(7,8),(8,8)` is the map's one mandatory beat — the tie is the
  piece of state a first-time player is least likely to guess, and §2.5's
  legibility contract says every state the player must reason about needs a
  cue at the moment it changes. `objectDestroyed` on either feeder is the
  other one: it is where the cut/destroy split becomes visible, because that
  is the damage a splice cannot answer.
- **Do not script the tie.** The mains are fair game for a restore ladder —
  the house has a spare key to either cutout and a boy who runs them — but
  the tie's state is the player's entire decision space on this map, and a
  trigger that closes or opens it takes the map's only real choice away.
