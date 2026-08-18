# Generator briefs — the grid objects

The four visuals Phase B flagged as owner work: a **flux main**, a **cable
trough**, a **charge hoist**, and the **severed** state of the trough. They are
the pieces the flux grid put on the board and the tileset never had, and one of
them — the main — is a legibility bug today rather than a missing polish pass.

Read `docs/ART_DIRECTION.md` §6 (map objects: the powered / unpowered /
overloading / **severed** / destroyed language and the `copper-500` affordance
rule) and §2 (palette) first. Every number below comes from there and from
`docs/design/FLUX_GRID.md`; where a brief and §6 disagree, §6 wins.
`art-src/TERRAIN_BRIEFS.md` names this file in its Wave 2 as "object
materials", and this is it.

## The legibility bug this set exists to fix

`data/maps/*.json` authors object identity in `spriteId`. **Nothing in
`src/render` reads it.** `ObjectVisual.build` (`src/render/objects.ts`)
switches on `MapObject.kind` and assembles boxes and cylinders; `spriteId` is
consumed only by units (`src/render/units.ts`). So the map author's word for
what a thing *is* is currently thrown away, and two of the grid's four roles
land on the same primitive:

| authored `spriteId` | uses | kinds | what it actually is |
|---|---|---|---|
| `switch-board` | 6 | `machine`, `switch` | **both** the mains (`source`) and the switchboards (`breaker`) |
| `gantry-grate` | 10 | `machine`, `catwalk` | **both** the grid's cable runs (`line`) and walkable catwalk grating |
| `hydraulic-press` | 5 | `machine` | presses, and the Meter House's charge hoists |

A player looking at the Meter House cannot tell the object whose **capacity
feeds the floor** from the object that merely **opens a branch of it**, because
the author wrote the same word for both and the renderer drew neither. That is
the FLUX_GRID §2.5 legibility contract failing at the one place it is not a UI
problem. The register says LIVE / TIE OPEN correctly; the board does not.

**Two content follow-ups this set implies**, recorded here and not done in this
pass: the two mains want `spriteId: "flux-main"` rather than `switch-board`,
and the four line runs want `"cable-trough"` rather than `"gantry-grate"`. The
briefs are written for those names.

## Delivery format: flat-lit face masters at 4×, on the terrain's ruler

**All four are 3D primitives with painted faces. None of them is a billboard,
and nothing in this set should become one.** Only units billboard
(`src/render/units.ts`), and only units should: mains and hoists block movement
and block line of sight, units walk around them and stand beside them, and a
card that turns to face the camera would break both the occlusion the tactical
read depends on and the height the player is counting off the strata lines. The
art dresses the boxes; it does not replace the geometry.

That makes these tile textures with a different subject, so they take the
terrain contract, not the sprite contract:

- `TILE_TEXTURE_SIZE` is **32** and `HEIGHT_STEP_PX` is **16**, against
  `TILE_SIZE = 1` and `HEIGHT_STEP = 0.5` in world units. One ruler falls out
  of that and it is the only one this file uses: **32 px per world unit**, at
  game size.
- Deliver at **4×**, exactly as terrain and sprites do — **128 px per world
  unit in the master**. The intake box-filters 4:1. Not 8×: at 8× a generator
  fills the canvas with grain that has no representation after the reduction,
  which is sparkle rather than detail (`ART_DIRECTION` C.8.6).
- The engine applies all shading: face shade **top 100%, north/south 78%,
  east/west 62%**, and it does not know which way an object is turned on the
  map. A side painting will be shown at 78% on one map and 62% on another, so
  keep the value range mid — a face already at full black will band.

Each object is **one sheet with a marked cell grid**, the convention
`GENERATOR_BRIEFS.md` uses for the two-view sprite sheets. Cells per object are
listed in its brief.

## Intake (sketch — the pipeline is not built yet)

Same fork as the terrain set. `decodePNG` (`src/art/png.ts`), then
`resampleRGBA` to game size — **not** `fitMasterToCanvas`, which measures a
figure and stands it on an anchor row that an object face does not have — then
`quantizeToPalette` with `allowed` set to the object's own ramp. It reports, it
never repairs.

The audit is an **object audit**, not the terrain one and not `auditGrid`. What
it checks is what §6 makes binding and a human cannot count by eye:

1. **Amber share** ≤ 4% of the cell's opaque pixels, and zero amber on any cell
   whose object is authored `powered: null`.
2. **`copper-500` presence is exactly the `operable` flag.** Every operable
   object's sheet must contain it; every non-operable object's sheet must
   contain none. This is the one rule in the tileset that a player reads on
   every map, and it is trivially checkable.
3. **`copper-300` appears on no object cell at all** while it is the rail head
   specular — it is the only shine on the ground plane and it may not acquire a
   second meaning.
4. Colour count, alpha binary, and seam colours drawn from the §6 state table.

Before any of it ships the renderer needs work it does not have: the object
primitives emit no `uv` attribute and there is no object atlas, exactly as the
terrain mesh does not. That is engine work for the intake pass and is
deliberately not built ahead of the art.

---

## SHARED SPEC (paste with every brief)

```
MAP OBJECT BRIEF — one machine face set for "Greyfall"

THE GAME: A tactics RPG in the style of Final Fantasy Tactics with an HD-2D
look — 3D terrain blocks and 3D machine blocks, 2D pixel-art sprites
billboarded on top, orthographic camera at ~33° from a corner. Industrial
fantasy: magic is an industrial resource ("flux"), refined and piped like
electricity, glowing warm amber. Soot-stained factory city, ash-grey skies.
Tone: grounded, dry, worn — a working plant, not a ruin and not a wizard's
laboratory.

WHAT THIS IS: the painted faces of ONE piece of machinery standing on a
battlefield. It is a 3D box in the engine and you are painting its skin, one
flat image per face. It is BACKGROUND that has to be READ: a player scanning
the board must know at a glance what this machine is and whether it is
running. Characters stand next to it and must still win the eye.

TECHNICAL (hard constraints):
- ONE image containing the cells listed in the brief, side by side on a
  marked grid, each cell at the stated size. No border, no label, no drop
  shadow, no perspective, no lighting gradient, no ambient occlusion. Flat
  orthographic straight-on for a side face, flat top-down for a top face.
  The engine applies ALL shading.
- SCALE: 128 master pixels = one game tile = one world unit. A face two
  tiles wide and one and a half tall is 256 x 192. Everything reduces 4:1
  in game — draw for 32 px per tile, not for the canvas.
- TRANSPARENT background where the face is not solid (PNG alpha, 0 or 255,
  never partial). No soft edges, no anti-aliasing.
- MAX 8 COLOURS per cell, flat, no gradients. Every colour exactly one of
  the listed hex values.
- The engine applies a face shade of 100% (top), 78% (north/south) or 62%
  (east/west) and does NOT know which way this object is turned on the map.
  Keep the value range mid; a face already at full black will band.
- NO PAINTED GLOW OR HALO. The post chain blooms, and it keys on
  #ffe7a8 alone. Paint crisp-edged seams; the bloom is the engine's.
- AMBER IS SCARCE AND IT MEANS ONE THING: "this machine is powered and
  tactically live". No more than 4% of a cell may be amber, every amber
  pixel needs a source in the same image (a seam, a window, a discharge),
  and the per-object brief says whether this object may carry any at all.
- #a5622f IS RESERVED for the handle, lever, wheel or grip of a machine a
  player can operate. If the brief does not ask for it, it may not appear
  anywhere in the image. Machine bodies use #6b3a1e.
- #c98a4b is the rail head specular and appears nowhere in this set.
- ALSO deliver: a flat palette strip as a separate row of solid N x N
  swatches (no gradients) of exactly the colours used.

THE PALETTE (use only the values listed in the per-object brief below):
soot   #0b0d10 #171c22 #2b333d #4a545f #78828e #b3bcc5
umber  #150e09 #2c1d12 #4e3320 #7a5230
metal  #6b3a1e #a5622f
amber  #4a2a06 #8c5411 #d98a1b #f3b94a #ffe7a8
```

---

## Wave 1 — the four the grid needs

### 1. FLUX MAIN (`flux-main`) — 3 cells
**The legibility-critical one.** A `source` node: the thing whose rated
capacity feeds a whole half of the floor, and the thing an Overdraw blows.
Footprint 1 × 2 tiles, standing **1.5 world units** — deliberately the tallest
and heaviest object in its bay.

| cell | face | game | **deliver** |
|---|---|---|---|
| A | long side (along the 2-tile run) | 64 × 48 | **256 × 192** |
| B | short end | 32 × 48 | **128 × 192** |
| C | top | 32 × 64 | **128 × 256** |

A braced cast frame in `#6b3a1e` over a `#2b333d` plinth, with a stack of
insulator bells and bus risers climbing the long face. Body shadows in
`#171c22`, worked edges in `#4a545f`.

**Amber: yes, and this object owns the strongest amber in the game.** A flux
main is a legitimate carrier — it is where the floor's power comes from. Run a
**continuous vertical amber column up the full height of the long face**:
`#8c5411` in the recess, `#d98a1b` body, a 1-game-pixel `#f3b94a` core, and
`#ffe7a8` on the core pixels only. Still inside the 4% budget — a column one
game pixel wide over 48 rows is about 3% of a 64 × 48 face.

**Operable: yes.** It carries a `#a5622f` reclose handle low on the long face,
where a standing figure could reach it.

**Identity at distance (the whole point).** The main must be separable from a
switchboard *without hovering*, and the separation is carried by three things,
in this order: it is **taller** (1.5 against the boards' ~1.0); it is the
**only object in the set with a full-height amber column** — a breaker's only
warm mark is its copper handle and it has no seam at all; and it is **massive
at the base** where a panel is thin. Draw the mass. A player pointing at a main
across a 16 × 16 board is the acceptance test, and nothing else in the set may
be given a vertical amber column.

### 2. CABLE TROUGH (`cable-trough`) — 3 cells
A `line` node: the ground run that carries between a main and the boards. It is
**laid in the floor**, not standing on it — the engine gives it
`blocksMovement: false` and `blocksLos: false`, and the player walks over it.
Runs are 2 or 3 tiles long. Standing height **0.25 world units** — a lip, not a
pipe.

| cell | face | game | **deliver** |
|---|---|---|---|
| A | run top — **tiles head to tail** | 32 × 32 | **128 × 128** |
| B | end-cap top | 32 × 32 | **128 × 128** |
| C | run side (the lip) | 32 × 8 | **128 × 32** |

A recessed channel: `#2b333d` tray floor, `#171c22` in the shadow of the lip,
`#4a545f` on the lip's worn upper edge, `#2c1d12` grime where the floor meets
the tray. Cell A must **tile head to tail** — a run is up to three of it in a
line, and a seam or a findable landmark becomes wallpaper. Draw the run along
the image's **vertical axis**; the engine rotates it for east–west runs, so
what is either side of the channel must read the same both ways.

**Amber: yes, sparingly — a live trough is a legitimate carrier.** One
**continuous `#d98a1b` filament, one game pixel wide** — four master columns,
all pure `#d98a1b`, aligned to the 4px game grid — **dead centre**, with no
core highlight. The recess either side stays in the tray's own dark umber,
`#2c1d12` grime and `#171c22` in the shadow of the lip, never amber: the
flanks carry no warmth at all, so nothing there can average into the filament
under the 4:1 reduction. It is one pixel wide because this thing is nine
game-tiles long on the Meter House and a bright run would out-shout the units
standing on it — about 3.1% of cell A, a full-height game column of a
32 × 32 cell, inside the 4% budget.
The filament must be **continuous across the tile boundary**, because the
engine's unpowered state is this same image with the seam colour swapped and
the player is being taught that the line either runs the whole way or does not
run at all.

**Operable: no. `#a5622f` may not appear anywhere on this sheet.**

**Identity at distance.** A trough is a **line in the floor**, and it must not
be confused with two things it sits near. Not rail: rail owns `#c98a4b` on the
ground plane and this set uses none. Not catwalk grating: grating is a
see-through walking surface drawn as a dither, a trough is a solid closed
channel. The read is *the floor has a wire in it*, and it should be legible as
a **path** — the eye should be able to follow it from the main to the board,
because following it is what tells the player where a cut would land.

### 3. CHARGE HOIST (`charge-hoist`) — 3 cells
A `sink`: the machine that draws. Footprint 1 × 2 tiles, standing **1.75 world
units**, the tallest thing in this file. It lifts — an overhead gantry with a
hook hanging in the gap over an empty bed.

| cell | face | game | **deliver** |
|---|---|---|---|
| A | long side | 64 × 56 | **256 × 224** |
| B | short end | 32 × 56 | **128 × 224** |
| C | top | 32 × 64 | **128 × 256** |

An A-frame or portal gantry in `#4a545f` with `#2b333d` bracing, a `#6b3a1e`
winch drum at the head, `#7a5230` on worn cable and timber packing, `#150e09`
under the frame. The **space under the beam is empty** — that gap is the
silhouette.

**Amber: minimal.** A sink consumes; it does not supply. One small `#d98a1b`
indicator at the winch head with an `#f3b94a` core pixel, and **no seam
network, no column**. Under 1% of the cell. The rule the whole set turns on is
that a player can tell where power *comes from*, and giving a consumer a
generous amber dress would undo the flux main's brief in one image.

**Operable: yes.** A `#a5622f` control lever or wheel on the frame at standing
height.

**Identity at distance.** The hoist must not read as the hydraulic press it
currently shares a primitive with. A press is **solid and closes downward** — a
mass over a bed. A hoist is **open and lifts** — a frame with daylight through
it and something hanging. If a reviewer at 1× cannot say which of the two a
silhouette is, redraw the gap, not the detail.

### 4. SEVERED SPAN (`cable-trough`, cut state) — 2 cells
**This is a STATE of brief 2, not a fourth object**, and it must be drawn by
the same hand at the same time, on the same sheet or an immediately adjacent
one. Same 32 px per tile, same channel geometry, same tray colours. Only the
state changes.

| cell | face | game | **deliver** |
|---|---|---|---|
| A | break top — the tile the cut lands on | 32 × 32 | **128 × 128** |
| B | dead run top — the rest of the run, gone dark | 32 × 32 | **128 × 128** |

Cell B is cell A of brief 2 with the filament **removed** — the same channel,
unlit, its centre line in `#2b333d` where the amber was. Nothing else moves; a
splice has to be able to put it back and the player has to see it is the same
run.

Cell A is the parting: the channel **broken across its width**, the tray lip
torn back on both sides in `#78828e` bright metal, conductor ends bared and
`#4a545f` bright where they were cut, `#0b0d10` in the gap, and a little
`#150e09` scorch at the break. No spark, no arc: the arc is the engine's VFX
and it fires once, at the moment of the cut.

**Amber: none. Zero.** A cut span carries nothing, and amber means *live*. A
single warm pixel on this cell is a bug and the audit will fail it.
`#a5622f`: none, for the same reason as brief 2.

**How the engine already renders this, and what the art adds.** The cut is
programmatic today (`ObjectVisual.setSevered`): the run's geometry parts along
its long axis, the two halves kink out of line with each other, and every
colour is pulled to the dead grey — no squash and no drop, because a wreck
squashes and a cut must never read as a wreck (`ART_DIRECTION` §6). The
**geometry half of that stays**; these two cells replace the colour half, which
is the half a lerp cannot do — a desaturated tray is not a *torn* tray, and the
torn ends are what tell the player that this is the reversible verb with a
splice as its answer.

**Identity at distance.** Three states of the same run have to be separable
across a room: **live** (channel with a warm filament), **dark** (same channel,
grey line — an isolator upstream is open, and a splice would not help),
**severed** (the run visibly *does not reach* — a gap, bright torn metal, ends
out of line). Dark and severed are the pair most easily confused and they take
different verbs to answer, so the break must be readable as *absence of
material*, not as absence of light.

---

## Wave 2 — named, not yet commissioned

Do not draw these until Wave 1 is in and the object intake exists. Recorded so
the set is understood as a whole:

- **Switchboard and tie panel** (`switch-board`, `switch-lever`, 12 uses). The
  other half of the main's read. Thin, flat, one `#a5622f` handle, **no amber
  seam at all** — its whole identity is being the thing that is not a main.
- **Lamp standard** (`lamp-standard`) and **flux cell** (`flux-cell`, 10 uses).
  §6 makes the cell's amber window a *quantitative* readout — fill height is
  remaining charge — which is the only number in the world art and wants its
  own brief.
- **Freight lift deck** (`freight-lift`, 7 uses). A `surfaceHeight` provider:
  it is walked on, so its top face is a floor and answers to the terrain set's
  rules as much as to these.
- **Catwalk grating** (`gantry-grate` in its `catwalk` kind). A **see-through**
  material; it wants the 50% checker dither treatment, not a texture, and it
  should not be folded into the trough.
- **The prop walls** (`crate-stack`, `drum-stack`, `scrap-hopper`,
  `balustrade`, the tenement faces). Numerous, unpowered, and the cheapest way
  to make a map stop looking like primitives.

## Acceptance

An object master is accepted when:

1. It reduces 4:1 to its game size and every pixel lands on a §2 colour with an
   empty `ambiguous` list (C.8.2 — a non-empty list means clean the source
   blacks or narrow `allowed`, and do not proceed past it).
2. It is within **8 colours** per cell, alpha binary.
3. Amber is within 4% of the cell, is absent entirely where the brief says
   none, and every amber pixel has a source in the same image.
4. `#a5622f` appears if and only if the object is authored `operable`, and
   `#c98a4b` appears nowhere.
5. A cell marked "tiles head to tail" does.
6. A human puts the object on a map at 1× with placeholder sprites standing
   beside it and can answer, without hovering: **what is this machine, and is
   it running?** For the trough set, the harder version: **is that run dark or
   is it cut?** That is the only test that matters and no audit can run it.
