# Generator briefs — the tile texture set

The ground the whole game stands on, and the last major surface still drawn by
arithmetic. Terrain today is flat vertex colour per face (`src/render/terrain.ts`
multiplies an authored top/side colour by `FACE_SHADE` and a per-tile brightness
wobble); these briefs replace that with painted texture, and nothing else.

Read `docs/ART_DIRECTION.md` §5 (terrain and tileset) and §2 (palette) first.
Every number below comes from there and is binding; where a brief and §5
disagree, §5 wins.

## What the five maps actually need

`data/maps/*.json` between them use six terrain types, and the schema has no
seventh. Only five are drawn (`void` is a hole):

| Terrain | Where | Tiles across the five maps |
|---|---|---|
| `plain` | every map | 828 |
| `impassable` | four maps | 153 |
| `rail` | every map | 88 |
| `rough` | every map | 78 |
| `water` | every map | 13 |
| `void` | two maps | 32 — **not drawn** |

That is **nine textures**, not thirty: five tops, four sides (§5 gives `rail` the
same sides as `plain`, so there is no separate rail side to draw).

**One set serves all three strata, deliberately.** The Charterhouse Steps is the
Rise, Tallow Row is the Underveins, and the other three are the Works — but §1
assigns the difference between strata to *light quality*, not to material, and
`docs/MAP_NOTES.md` says it outright for Tallow Row: "vein-glass dimness is the
renderer's job; nothing here encodes it." A Rise stone-set and a Works stone-set
would be the same painting under two lights. The lights are the renderer's, and
they landed with the environment-finish pass. Do not draw per-stratum variants.

## Delivery resolution: 4×, matching the sprite pipeline

`TILE_TEXTURE_SIZE` is **32** and stays 32. Deliver masters at **4×** and let
the intake box-filter them down, exactly as `fitMasterToCanvas` does for the
256×384 → 64×96 sprite flow:

| Face | In game | **Deliver** |
|---|---|---|
| tile top | 32 × 32 | **128 × 128** |
| tile side (one height step) | 32 × 16 | **128 × 64** |

**Why 4× and not 8×.** Painting at 4× keeps edges that hand-placing at 32×32
would lose — the same argument C.8 makes for sprites — and 4:1 is the ratio the
reducer, the review habit and the acceptance numbers already use. At 8× a
generator fills 256×256 with grain that has no representation whatsoever after
the reduction: it does not become detail, it becomes noise, and noise on a
32px tile is precisely the sparkle C.8.6 lists as a cost. One ratio, one
reducer, one mental model.

## Intake (sketch — the pipeline is not built yet)

When masters land, intake reuses the sprite path down to the audit and forks
there. `src/art/ingest.ts` already carries everything up to the fork:

1. `decodePNG` (`src/art/png.ts`) on the delivered file.
2. `resampleRGBA` to 32×32 or 32×16 — the same alpha-weighted box filter that
   reduces sprite masters. **Not** `fitMasterToCanvas`: that measures a figure
   and stands it on an anchor row, which a tile has neither of.
3. `quantizeToPalette` with `allowed` set to the material's own ramp. Passing
   `allowed` is not optional here — it is the documented defence against the
   `soot-900` / `umber-900` near-collision of C.8.2, and terrain is the surface
   with the most near-black in it. As always: **it reports, it never repairs.**
4. A **terrain audit**, new, not `auditGrid`. `auditGrid` checks a figure box, a
   feet anchor, a closed silhouette outline and a sub-floor band; a tile has
   none of those. The terrain audit checks instead: the four-way seam wrap, the
   strata band, the colour count, zero amber, and `copper-300` on rail only.

Before any of that can ship the renderer needs work it does not have: the
terrain mesh emits no `uv` attribute and there is no tile atlas. That is
engine work for the intake pass and is deliberately not built ahead of the art.

---

## SHARED SPEC (paste with every brief)

```
TILE TEXTURE BRIEF — one ground material for "Greyfall"

THE GAME: A tactics RPG in the style of Final Fantasy Tactics with an HD-2D
look — 3D terrain blocks, 2D pixel-art sprites billboarded on top,
orthographic camera at ~33° from a corner. Industrial fantasy: magic is an
industrial resource ("flux"), refined and piped like electricity, glowing
warm amber. Soot-stained factory city, ash-grey skies. Tone: grounded, dry,
worn — a working place, not a ruin and not a fantasy village.

WHAT THIS IS: the top (or side) face of one 3D cube of ground, tiled edge to
edge across a battlefield of up to 18x18 of them. It is walked on, fought
over, and looked at for an entire battle. It is BACKGROUND. Characters stand
on it and must win every contest for the eye.

TECHNICAL (hard constraints):
- ONE image, no border, no label, no drop shadow, no perspective, no
  lighting gradient. Flat orthographic top-down (for a top face) or flat
  straight-on (for a side face). The engine applies all shading.
- SIZE: 128 x 128 for a tile top; 128 x 64 for a tile side. This reduces 4:1
  to 32 x 32 / 32 x 16 in game — draw for that, not for the canvas.
- SEAMLESS. A top face must wrap on ALL FOUR edges: the tile to the north,
  south, east and west is this same image, and a visible seam becomes a grid
  of seams across the whole battlefield. A side face must wrap horizontally,
  and vertically against a copy of itself (columns stack).
- NO REPEATING LANDMARK. A crack, a stain or a bolt that the eye can find
  will appear once per tile in a grid of 300 and read as wallpaper. Texture
  by grain and value, not by incident.
- MAX 6 COLOURS, flat, no gradients, no anti-aliasing, no partial alpha
  (alpha is 0 or 255). Every colour exactly one of the listed hex values.
- NO AMBER, NO ORANGE, NO YELLOW, ANYWHERE. In this world warm light means
  "this machine is powered and tactically live", and the ground is never
  powered. A single warm pixel in a floor texture is a bug.
- The engine multiplies this image by a per-tile brightness of 0.93 to 1.07
  and by a face shade (top 100%, north/south 78%, east/west 62%). Keep the
  value range mid — a texture already at full black or full white will band.
- ALSO deliver: a flat palette strip as a separate row of solid N x N
  swatches (no gradients) of exactly the colours used.

THE PALETTE (use only the values listed in the per-material brief below):
cool  #0b0d10 #171c22 #2b333d #4a545f #78828e #b3bcc5
warm  #150e09 #2c1d12 #4e3320 #7a5230
metal #6b3a1e #a5622f #c98a4b
damp  #1e4640 #2f7a6c #63b49e
```

---

## Wave 1 — the nine tile faces

Deliver these first; they are what the five maps are made of.

### 1. PLAIN — TOP (`plain-top`, 128 × 128)
Poured concrete over brick: the default ground of the whole game, and 828 of
the ~1160 drawn tiles. Base `#4a545f`, worked with sparse `#2c1d12` grit and
a little `#78828e` where the float left the surface proud. Read: a factory
floor or a paved yard that has been swept ten thousand times and is worn
smooth in no particular pattern. **This is the one that must be quietest.**
If a reviewer's eye goes to the floor before it goes to the units, it is
wrong however good the painting is. Max 4 colours is better than 6 here.

### 2. PLAIN — SIDE (`plain-side`, 128 × 64)
The cut face under the floor: brick courses in `#2c1d12` over `#150e09`
mortar shadow. Courses run horizontally, roughly 4 game pixels tall (16 in
the master), staggered. **Leave the top 8 rows of the master flat `#78828e`**
— see "the strata line" below. This texture also serves rail sides.

### 3. RAIL — TOP (`rail-top`, 128 × 128)
Ballast with track on it. Ballast `#2c1d12` with `#150e09` sleeper ticks
every 32 master pixels running across the rails. **Two rails in `#6b3a1e`,
16 master pixels wide, centred at x = 40 and x = 88**, running the full
height of the tile, each carrying a **4-pixel `#c98a4b` head specular** along
its upper edge. Those specular lines are **the only shine on the entire
ground plane** — a Railrunner has to be able to find rail across a whole map
at a glance, so they are geometry, not decoration: do not soften, break,
weather or stylise them, and do not put `#c98a4b` anywhere else in the set.
Rails run north–south in the source image; the engine rotates for east–west
runs, so the ballast between them must read the same either way.

### 4. ROUGH — TOP (`rough-top`, 128 × 128)
Unfinished ground — broken slab, rubble, refuse, slag-caked aisle. Base
`#2b333d` with irregular chunks of `#4a545f` and `#4e3320`. Read: this costs
more to cross. It should be visibly *coarser* than plain at a glance without
being brighter or busier in colour — the contrast is grain size, not value.
No single chunk large enough to become a landmark.

### 5. ROUGH — SIDE (`rough-side`, 128 × 64)
Broken courses: the brick of `plain-side` collapsed, in `#150e09` with
`#2b333d` spall. **The strata band is deliberately interrupted here** — see
below. That interruption is the player's tell that this ground costs more, so
it must be legible from the cut face alone.

### 6. WATER — TOP (`water-top`, 128 × 128) — 2 frames
Sump water, not a lake: standing, still, conductive, faintly chemical.
`#1e4640` body with **two 4-pixel-tall `#2f7a6c` shimmer bands** running
across it. Deliver **two frames** with the bands at different heights; the
engine alternates them every 30 ticks. The shimmer is what sells that this
water conducts when arc damage lands in it, so the bands must be crisp
horizontal lines, not painterly ripple. No reflections, no sky, no foam.

### 7. WATER — SIDE (`water-side`, 128 × 64)
Wet cut: `#150e09` masonry, darker and slicker than `plain-side`, with a thin
`#1e4640` tide line near the top. Same strata band rule as `plain-side`.

### 8. IMPASSABLE — TOP (`impassable-top`, 128 × 128)
Solid mass — retaining wall, masonry block, rock. `#0b0d10` almost flat, with
the barest `#171c22` grain so it does not read as a hole in the render. It
must read as *uncountable*: no courses, no strata, no repeating incident,
nothing whose height a player could try to measure. This is the one material
allowed to be nearly featureless, and it should be.

### 9. IMPASSABLE — SIDE (`impassable-side`, 128 × 64)
As above, in the same near-black. **No strata band, no cut line at all** —
uncountable height reads as unclimbable, which is correct, because it is.

### The strata line (binding, §5)

The top 2 game pixels (**top 8 master rows**) of every side texture are a
lighter cut line in `#78828e`. That band is what lets a player count a
four-step drop without moving the cursor, and it outranks any texture design
that would obscure it. Deliver those rows **flat** — no grain, no courses, no
weathering crossing into them.

Two exceptions, both meaningful:

- `rough-side` **interrupts** the band: draw it broken into irregular
  segments covering roughly half the width. That is the tell for the extra
  move cost.
- `impassable-side` has **no band at all**.

---

## Wave 2 — named, not yet commissioned

Do not draw these until Wave 1 is in and the intake pipeline exists. They are
recorded here so the set is understood as a whole.

- **Hazard overlays.** §5 overlays hazard state on the tile top rather than
  replacing it: a scald marker (`#3e0d12` fill, `#4a2a06` rim) and the gas
  cloud (a 50% checker dither in `#2f7a6c`, already generated in code by
  `src/render/vfxLayer.ts`). The scald marker is the only one worth painting;
  the dither is code and should stay code.
- **Object materials.** Walls, machine bodies, catwalk grating, lift decks
  and switch housings are `src/render/objects.ts` primitives today. They want
  their own brief file, not this one, because they answer to a different rule
  set (§6: the powered/unpowered/overloading/destroyed seam language, and the
  `#a5622f` operable affordance that no non-operable surface may show).
  Catwalk grating in particular is a *see-through* material and needs the
  dither treatment, not a texture.

---

## Acceptance

A tile master is accepted when:

1. It reduces 4:1 to its game size and every pixel lands on a §2 colour with
   an empty `ambiguous` list (C.8.2 — a non-empty list means clean the source
   blacks or narrow `allowed`, and do not proceed past it).
2. It is **seamless** on every edge that tiles.
3. It is within **6 colours**.
4. It contains **zero** pixels from the amber, overload, vein-glass, blood or
   steel ramps.
5. The strata band is intact, interrupted, or absent exactly as specified.
6. A human lays it out as a 6 × 6 field with placeholder sprites standing on
   it and confirms the sprites still win. That is the only test that matters
   and no audit can run it.
