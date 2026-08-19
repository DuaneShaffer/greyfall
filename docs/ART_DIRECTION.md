# Art Direction — Greyfall

The binding art spec. `docs/CREATIVE_BIBLE.md` governs what the world *is*;
this governs what it *looks like* and what numbers the code may assume. Set
once so nothing diverges: every sprite, tile, portrait, effect, and UI surface
in the project answers to this document.

**Binding:** every hex value and color name; sprite canvas size, anchor, and
texture densities; the facing derivation; animation state names, frame counts,
and tick tables; sheet layout; portrait dimensions and crop; tile texture
dimensions, face-shading multipliers, and the strata-line rule; the
powered/unpowered/overloading/destroyed language; the damage-type color
assignment; outline and palette-index discipline.

**Suggestive:** specific poses, per-job silhouette details beyond the listed
read, speckle and texture patterns, portrait rendering technique, individual
status-icon drawings, VFX shape design.

The palette, sprite constants, and placeholder generator are code, not prose:
`src/art/palette.ts`, `src/art/sprites.ts`, `src/art/placeholders.ts`. Those
modules are the canonical source — renderer and UI import them and never
hardcode a hex or a pixel count. This document explains and constrains them.

---

## 1. The look in one paragraph

Ash-grey industrial city, lit by fire and meters. The ground plane is soot and
coal umber; metal is bronze going green; the only warm light in the world is
refined flux, and there is never much of it in frame. Amber is the most
expensive color on screen — it marks *what is powered*, and therefore *what is
tactically live*. When something overloads, that amber goes white-violet, and
the player should feel it as a wrongness before reading any UI. Underground,
the only light that isn't flux is the pale green of raw vein-glass in the rock.
Sprites are chunky, hard-outlined, and read at a glance from a rotating
orthographic camera; the terrain is flat-shaded blocks with countable strata
so height is legible without the cursor.

### Light quality by stratum (binding on map palettes)

| Stratum | Ambient tint | Key light | Notes |
|---|---|---|---|
| The Charter Rise | `soot-100` cool wash | high, hard, colorless | clean and cold; amber is *metered*, appearing only in fixtures — one seam per object, never a spread |
| The Works | `umber-500` warm wash | low, from furnace mouths and pour-ladles | the slice's home register; amber is common but always sourced from a visible machine |
| The Underveins | `soot-900` near-black | none — objects self-light | the only stratum where `veinglass` appears; unmetered taps read as *ragged* amber (broken seam shapes, no fixture) |

Vein-glass pale green appears **underground only**. A vein-glass color on a
Rise or Works map is a bug, not a choice.

## 2. Palette

34 colors. Constrained on purpose: a small palette is what makes pixel art
cohere across many hands, and it makes the amber scarcity rule enforceable —
if amber is one of only five warm steps available, spending it is a decision.

All values are lowercase hex, defined in `src/art/palette.ts` as `PALETTE`
(the flat record of all 34) and `RAMPS` (grouped, ordered dark → light).

### Ramps

**Soot greys** — the world's default surface. Concrete, ash, armor plate, sky.

| Name | Hex | Use |
|---|---|---|
| `soot-900` | `#0b0d10` | universal sprite outline; impassable masses; deepest shadow |
| `soot-800` | `#171c22` | UI panel ground; night sky; interior shadow |
| `soot-700` | `#2b333d` | unpowered machine seams; rubble; panel edges |
| `soot-500` | `#4a545f` | default terrain top; armor midtone |
| `soot-300` | `#78828e` | strata cut lines; armor highlight; dim UI text |
| `soot-100` | `#b3bcc5` | ash light; UI body text; kinetic impact |

**Coal umber** — everything organic-industrial: brick, leather, wood, ballast,
rust, dried blood on a floor.

| Name | Hex | Use |
|---|---|---|
| `umber-900` | `#150e09` | dead seams; sprite interior separation on leather/wood |
| `umber-700` | `#2c1d12` | terrain sides (brick courses); ballast |
| `umber-500` | `#4e3320` | leather, coats, crates |
| `umber-300` | `#7a5230` | worn wood, exposed rust highlight |

**Copper (metal)** — worked, unpatinated metal. Reserved: see §6, the
operable-affordance rule.

| Name | Hex | Use |
|---|---|---|
| `copper-700` | `#6b3a1e` | machine bodies, cell canisters |
| `copper-500` | `#a5622f` | **operable handles/levers only** on object exteriors |
| `copper-300` | `#c98a4b` | rail head specular; polished trim |

**Verdigris (oxidized copper)** — age, damp, and chemistry.

| Name | Hex | Use |
|---|---|---|
| `verdigris-700` | `#1e4640` | sump water; patina in shadow |
| `verdigris-500` | `#2f7a6c` | chemical VFX; buff status category; water shimmer |
| `verdigris-300` | `#63b49e` | heal numbers; bright patina |

**Flux amber** — the scarce, precious accent. See the scarcity rule below.

| Name | Hex | Use |
|---|---|---|
| `amber-900` | `#4a2a06` | seam shadow; scald-mark rim |
| `amber-700` | `#8c5411` | seam body in shadow |
| `amber-500` | `#d98a1b` | **the seam color** — powered machinery, live cells |
| `amber-300` | `#f3b94a` | seam core; crit damage numbers |
| `amber-glow` | `#ffe7a8` | **emissive / bloom variant** — the only color the post chain is allowed to bloom on |

**Overload white-violet** — flux past its rating. Never used decoratively.

| Name | Hex | Use |
|---|---|---|
| `overload-700` | `#4e2e86` | arc VFX spread; overloading seam shadow |
| `overload-500` | `#9b7be3` | arc branches; flux-borne status category |
| `overload-100` | `#efe4ff` | arc core; overload seam core; arc damage numbers |

**Vein-glass pale green** — raw mineral. Underveins only.

| Name | Hex | Use |
|---|---|---|
| `veinglass-700` | `#17362a` | unlit seam in rock |
| `veinglass-500` | `#5fbe95` | glowing seam body |
| `veinglass-100` | `#c4f0da` | seam core |

**Blood / hazard** — harm, both dealt and threatened.

| Name | Hex | Use |
|---|---|---|
| `blood-900` | `#3e0d12` | scalded/hazard tile marker fill |
| `blood-500` | `#8e2029` | wounds; debuff status category |
| `blood-300` | `#c64a47` | enemy team tint; hazard hatching |

**Steel** — the player's color, and nothing else's. Deliberately the one hue
the world does not otherwise contain, so the player's own units are always the
most legible objects on screen.

| Name | Hex | Use |
|---|---|---|
| `steel-600` | `#2e7a94` | player tint shadow |
| `steel-400` | `#6fc3d9` | player team tint / selection rim |

### Singletons

| Name | Hex | Use |
|---|---|---|
| `hazard` | `#e8622a` | thermal VFX midtone; danger hatching; environmental status category |
| `brightblood` | `#ff9db1` | luminous scarring on Augmented and brightblood-afflicted sprites; nothing else |

### Usage rules (binding)

1. **Amber is scarce.** No more than 4% of any frame's pixels may be from the
   amber ramp (an area share, re-derived by measurement — Appendix A.5), and
   every amber pixel must have an in-fiction source in the
   same frame — a seam, a cell window, a fixture, a discharge. Amber never
   appears as ambient light, never tints terrain, never decorates UI chrome
   except where the UI is reporting a powered/charge state.
2. **Amber-glow is the only bloom color.** The post-processing chain (when it
   lands) keys bloom on `amber-glow`, `overload-100`, and `veinglass-100` and
   nothing else. Do not paint with `amber-glow` on non-emissive surfaces.
3. **Overload is a state, not a style.** The overload ramp appears only on
   things that are overloading, arcing, or flux-statused.
4. **Vein-glass is subterranean.** See §1.
5. **Copper-500 is an affordance.** See §6.
6. **Brightblood marks people, not things.**
7. **Team tints do not repaint units.** See below.

### Team tints

Team identity is carried by a **rim and a base accent**, never by recoloring
the whole unit — a green Enforcer and a blue Enforcer must still read as the
same soldier in the same armor. Sprites designate a small **tint mask** (belt,
pauldron trim, banding, lamp housing — 5–12% of body pixels), and the
renderer draws a 1px rim in the tint base outside the silhouette outline when
a unit is selectable or targeted.

| Team | Base | Shadow | Rim |
|---|---|---|---|
| player | `steel-400` | `steel-600` | `steel-400` |
| enemy | `blood-300` | `blood-900` | `blood-300` |
| neutral | `soot-100` | `soot-700` | `soot-300` |

Enemy and neutral tints are drawn from the world palette; the player's is not.
That asymmetry is intentional and binding.

### UI chrome

UI is palette-native, not a separate design system. Aliases only:

| Token | Color |
|---|---|
| `ui.ink` | `soot-900` |
| `ui.panel` | `soot-800` |
| `ui.panelRaised` | `soot-700` |
| `ui.edge` | `soot-300` |
| `ui.text` | `soot-100` |
| `ui.textDim` | `soot-300` |
| `ui.accent` | `amber-300` (selection, confirm, charged) |
| `ui.warning` | `hazard` |
| `ui.danger` | `blood-500` |
| `ui.good` | `verdigris-300` |

**Amended 2026-08-16 — the flat rule is retired; the constraints under it are
not.** Panels were flat fills with a 1px `ui.edge` border and a 1px `ui.ink`
drop line. That built a dashboard. `docs/UI_DESIGN.md` §12 replaces it with a
layered construction — bezels, engraved rules, grain, bronze fittings, grey pulp
record cards — and that section is now the binding account of UI chrome
construction. What survives verbatim from the old rule, because it was never
about flatness:

- **No rounded corners.** Nothing in this interface has a radius.
- **Blur is capped at 3px.** The UI shares a frame with pixel art at a fixed
  orthographic scale; a soft shadow beside a 1px sprite outline reads as a
  rendering error. Depth is value steps at hard edges, the way the sprites do it.
- **Palette-native.** Every colour in `styles.css` is still a `PALETTE` value or
  a documented alpha of one. Gradients interpolate *between palette steps*; they
  do not introduce hues.
- **Ornament spends no amber.** The chrome's precious metal is the **umber
  ramp** (tarnished bronze), chosen precisely so that rule 1's 4% amber budget
  and rule 5's copper-500 affordance both survive an ornate build untouched.
  Bronze never bloom-glows; `amber-glow` appears on exactly two elements in the
  whole interface (UI_DESIGN §12.6).

## 3. Sprite spec

### Canvas and density

| Constant | Value |
|---|---|
| Sprite canvas | **64 × 96 px** |
| Anchor (feet center) | **(32, 88)** |
| Figure box | rows 0–87 |
| Sub-floor band | rows 88–95 (ground contact, dust, slope tilt) |
| Rig unit | **2 px** (the armature is authored in units) |
| Sprite pixels per world tile edge | **64** |
| Tile top texture | **32 × 32 px** |
| Pixels per height step | **16** (one height step = half a tile) |
| Shipped sprite texture | **128 × 192 per cell** (2× the master, mipmapped) |
| Billboard quad in world units | 1.0 wide × 1.5 tall |

**Why 64×96.** Measured in situ, not argued: at the default camera zoom a
sprite covers roughly 75 screen pixels per tile. At 32 px per tile the art was
being magnified 2.3×, which is what made units read as blocks against terrain
that was not. 64 px per tile puts the master within a hair of pixel-exact at the
default zoom and still crisp when the camera pulls in.

**The billboard did not change.** It is 1.0 × 1.5 tiles as it always was; only
the sprite's own ruler got denser. That is why the sprite ruler is now *split*
from the tile ruler: `TILE_TEXTURE_SIZE` stays 32 and terrain textures are
untouched, while `SPRITE_PIXELS_PER_TILE` is 64. A unit is still exactly 1 tile
wide and 3 height steps tall in world space.

The bible's FFT-register proportions are unchanged: ≈3 heads tall, a 26px head
in an ~80px standing figure, with the top 8 rows of the figure box left as
headroom for helmets, hats and the vertical bob of idle and jump poses. 64 wide
buys the shoulder span an Enforcer's shield and an Augmented's graft arm need
and keeps a Conduit's staff and a Railrunner's hook inside the quad.

**Rig units.** The armature and every pose table are authored in **rig units**,
two canvas pixels each, so the figure's proportions live in one place and a
future density change is one constant. Shading rims stay one canvas pixel wide:
64×96 is a finer drawing, not a doubled one.

The anchor sits at (32, 88), not (32, 95): x=32 is the seam at the exact
horizontal center of an even-width canvas, and figures are drawn symmetric
about that seam. The 8 rows below the anchor are the sub-floor band, reserved
so contact shadow, kicked dust, and standing-on-a-slope offsets have somewhere
to live inside the sprite instead of leaking into the tile below.

### Outline rule (binding)

- Every sprite carries a **hard 1px silhouette outline in `soot-900`**, closed,
  no gaps, no anti-aliasing.
- **Interior** separation lines use the darkest step of the *local* ramp
  (leather → `umber-900`, patina → `verdigris-700`), never `soot-900`. This is
  what keeps a chunky silhouette from turning into a coloring book.
- **Emissive elements are not outlined.** Amber seams, cell windows, and
  vein-glass bleed *outward*: the pixel ring around an emissive element is
  `amber-glow` / `overload-100` / `veinglass-100` where it would otherwise be
  outline. Light does not have a black edge.

### Palette-index discipline (binding)

- Every non-transparent pixel is exactly one of the 34 palette colors. No
  intermediate values, no anti-aliasing, no partial alpha — alpha is 0 or 255.
- **Max 12 distinct colors per sprite**, plus the 2 team-tint indices. If a
  design needs a 13th, it is over-detailed for this register.
- The team tint occupies exactly 2 indices (base, shadow) applied only to the
  designated tint-mask pixels.
- Sprites are authored indexed; the exporter fails on any off-palette pixel.

## 4. Facing and animation

### Facings: 4 from 2 drawn views

The camera is orthographic and orbits in 90° steps, sitting over a **map corner**
(yaw index 0 = SE, incrementing clockwise: SE → SW → NW → NE). Unit facings are
axis-aligned (north/east/south/west), so every facing is 45° off the camera —
all four apparent views are true three-quarter views. That is the FFT geometry
and it is why two drawn views suffice.

**Drawn:** `se` (three-quarter toward camera) and `ne` (three-quarter away).
**Mirrored:** front-left = mirror(`se`), back-left = mirror(`ne`).

| Apparent view | Source | Mirrored |
|---|---|---|
| front-right | `se` | no |
| front-left | `se` | **yes** |
| back-right | `ne` | no |
| back-left | `ne` | **yes** |

Derivation (implemented as `drawnViewFor` in `src/art/sprites.ts`), with
facing index north=0, east=1, south=2, west=3 and camera yaw index c:

```
m = (facingIndex - cameraYaw + 4) % 4
m = 0 → back-right   m = 1 → front-right
m = 2 → front-left   m = 3 → back-left
```

**Handedness.** All units are drawn right-handed in the `se`/`ne` source
views; mirrored views therefore show the weapon in the left hand. This is
accepted (FFT does the same) and costs nothing at this register. What is *not*
accepted: a silhouette marker so lateral that mirroring reads as a different
unit. Job-identifying gear — the Enforcer's shield, the Railrunner's hook, the
Augmented's graft arm — must be placed adjacent to the body centerline so
mirroring reads as the unit *turning*.

### Animation states

Timing is in **presentation ticks at 60 ticks/second**. Per-frame durations are
listed because pixel animation is not uniformly timed — the snap matters.

| State | Frames | Ticks per frame | Total | Loop | Notes |
|---|---|---|---|---|---|
| `idle` | 4 | 14, 14, 12, 14 | 54 (0.90s) | yes | 1px breath bob; the only state that plays at rest |
| `walk` | 6 | 6 each | 36 (0.60s) | yes | one full cycle = 2 steps = 2 tiles; 0.30s per tile |
| `attack` | 5 | 5, 5, 3, 6, 8 | 27 (0.45s) | no | anticipate ×2, strike (short, hard), follow ×2 |
| `cast` | 6 | 6, 6, 10, 10, 4, 8 | 44 (0.73s) | no | frames 2–3 are the **hold loop** while a charged action waits on the CT timeline |
| `hurt` | 3 | 4, 6, 8 | 18 (0.30s) | no | recoil, hold, recover |
| `downed` | 4 | 5, 5, 7, 20 | 37 (0.62s) | no | **holds last frame** — the downed pose persists until removal |

`cast` doubles as the operate animation (a Conduit tapping a line and a
Machinist cranking a switch are the same body language at this register).
`downed` is the only state with `holdLast`; the presentation queue keeps
frame 3 on screen for the duration of the crystallization-analog timer.

**Sheet layout.** One sheet per job. Columns = frame index (8, the widest
state padded), rows = (state, view) pairs in fixed order:

```
row 0: idle/se     row 1: idle/ne
row 2: walk/se     row 3: walk/ne
row 4: attack/se   row 5: attack/ne
row 6: cast/se     row 7: cast/ne
row 8: hurt/se     row 9: hurt/ne
row 10: downed/se  row 11: downed/ne
```

Sheet = 8 × 64 = **512 px wide**, 12 × 96 = **1152 px tall**. 28 drawn frames
per view, 56 per job. The sheet ships as a data texture at 2× that, with a
supplied mip chain: nearest magnification keeps the zoomed-in read hard,
trilinear minification stops far zooms crawling, and mip level 1 is exactly the
master.

### Portraits

**Register decision: painted, not pixel.** Committed. Portraits are the one
place the game speaks in the Arcane-adjacent register the bible cites — visible
ink edges, hard-shaped shadows, gouache flatness, no rendering polish and no
soft airbrush. The contrast is deliberate: the *record* of a person is painted;
the person on the battlefield is 64 pixels wide. It also decouples the biggest
character-art cost from the sprite pipeline.

| Constant | Value |
|---|---|
| Portrait master | **128 × 160** (4:5) |
| Crop | shoulders-up; eyeline at 38% from top; head occupies the upper ~60% |
| Facing | three-quarter toward **viewer-right** (toward the text) |
| Chip crop | source rect (32, 16, 64, 64), downscaled 2:1 → **32 × 32** |

The chip is the head-only derivative used in the turn-order bar and unit lists;
32×32 matches the tile texture size, so chips atlas with the terrain art.

The chip's rect **ends at y = 80** of the 128 × 160 — 16 rows above the chin the
crop row puts at ~60% — so it sees the head from the brow to about the base of
the nose and nothing below. Whatever identifies a character at chip size has to
live in that band: headwear, hairline, brow, eyes, marks above the nose. A
collar badge, a gorget, a mask at the collarbone or anything else at the throat
is a plate detail and cannot be a chip anchor.
`art-src/PORTRAIT_BRIEFS.md` names one per character, in that band.

Portraits are **never mirrored** — asymmetric painted detail does not survive
it. The UI therefore always places the portrait to the *left* of the dialogue
box regardless of speaker; speaker identity is carried by name plate and
palette, not by screen side.

Portrait color is **hue-anchored, not index-locked**: portraits may interpolate
between ramp steps but may not introduce hues outside the ramp families in §2.
A portrait containing a hue with no ancestor in the palette is off-model.

## 5. Terrain and tileset

### Geometry and shading

- Tile top: **32 × 32**. Tile side: **32 × 16** per height step; a column of
  height N stacks N side tiles.
- **Flat shading, fixed multipliers, no dynamic lights in the slice.** The
  renderer multiplies base colors by: top **100%**, north/south faces **78%**,
  east/west faces **62%**. Sprites are lit to match the top-face value so a
  standing unit and the tile under it agree.
- **Strata line (binding).** The top 2 rows of every side tile are a lighter
  cut line in `soot-300`. This is what makes height *countable at a glance* —
  the player must be able to read a 4-step drop without moving the cursor.
  This rule outranks any texture design that would obscure it.

### Per terrain

| Terrain | Top | Sides | Read |
|---|---|---|---|
| `plain` | `soot-500` with sparse `umber-700` grit | `umber-700` brick courses over `umber-900` | poured concrete over brick; the default |
| `rail` | `umber-700` ballast; two 4px `copper-700` rails at x=10 and x=22 with a 1px `copper-300` head specular; `umber-900` sleeper ticks every 8px | as `plain` | the rail head specular is the **only shine on the ground plane** — rails must be findable across a whole map at a glance (Railrunner depends on it) |
| `rough` | `soot-700` rubble with `soot-500` and `umber-500` chunks, irregular | broken courses, **strata cut line interrupted** | unfinished ground; the interrupted cut line is the tell that movement costs more here |
| `water` | `verdigris-700` with two 1px `verdigris-500` shimmer bands (2-frame, 30-tick) | `umber-900`, wet | sump water, not a lake; conductive, and the shimmer is what sells that when arc damage lands |
| `impassable` | `soot-900` solid mass, **no cut line** | `soot-900` | uncountable height reads as unclimbable — correct, because it is |
| `void` | not drawn | — | — |

Hazard state overlays the tile top rather than replacing it: scalded tiles get
a `blood-900` fill with an `amber-900` rim; gas gets the dithered `verdigris-500`
cloud from §6. Overlays never obscure the strata line on the sides.

## 6. Map objects

The battlefield is a workplace and its objects have to announce what they do.

| State | Language |
|---|---|
| **powered** | continuous **amber seams** tracing the object's working parts — `amber-500` body, `amber-300` core, 1px `amber-glow` halo; 2-frame pulse at 30 ticks |
| **unpowered** | the same seam geometry in `soot-700`, no halo, no pulse. Identical shapes, dead — so the player learns the seam *is* the power indicator |
| **overloading** | seams shift to `overload-500` with `overload-100` cores, pulse rate drops to 8 ticks, halo grows 1px per pulse |
| **severed** | a cut `line` node (COMBAT_RULES §14a). The run **parts**: a gap opens along its long axis and the two ends kink out of line with each other. Seams go the `soot-700` dead grey, the body is pulled halfway toward it, no halo, no pulse, and **no amber anywhere** — a cut span carries nothing. It does **not** squash and does **not** drop |
| **destroyed** | silhouette collapses to a `soot-900`/`soot-700` rubble form of roughly half the original height; seams go `umber-900` dead; persistent 3-frame soot plume at 20 ticks |

**Severed and destroyed must never be confused.** The cut is the cheap
reversible verb and destruction is permanent, so the two states are separated by
*geometry*, not by colour: a wreck squashes and tilts, a cut span stays standing
and comes apart. Destruction outranks it — a span that is cut and then blown up
reads as rubble. Both states carry the object's state from `GameState`, so a
scene rebuilt from a snapshot shows them.

**The operable affordance (binding).** Every operable object carries a visible
`copper-500` handle, lever, wheel, or grip. **No non-operable object may show
`copper-500` on its exterior.** This is the single most load-bearing rule in
the tileset: the player must be able to scan a map and know what they can touch
without hovering anything. Machine bodies use `copper-700`; polished trim uses
`copper-300`; the affordance color is reserved.

**Cells** are `copper-700` canisters with a vertical amber window whose *fill
height* shows remaining charge — the only quantitative readout in the world art.

**Machinist deployables** (sentry frame, tripwire charge, skitter drone) are
built from the same vocabulary at reduced scale, tinted to their owner's team:
they are player-made map objects and must read as belonging to both categories.

## 7. VFX language

One damage type, one color logic, no overlap. A player who has learned the four
should never need the log to know what hit them.

| Type | Palette | Form | Timing |
|---|---|---|---|
| `kinetic` | **the world's own colors** — `soot-100` impact wedge over `soot-300`, debris in the *terrain's* palette | hard directional wedge at the contact point + 1px displacement of the target sprite | 3 frames, 4 ticks each |
| `arc` | overload ramp — `overload-100` core, `overload-700` spread | branching 1px polylines; chains snap tile-to-tile in **straight segments, never curves**; wet or metal tiles add a `verdigris-500` ground flash | 4 frames, 3 ticks each (the fastest VFX in the game) |
| `thermal` | `amber-500` → `hazard` → `blood-500` | bottom-anchored rising shapes; leaves a scald marker on the tile | 5 frames, 5 ticks each |
| `chemical` | `verdigris-500` / `verdigris-700` | aerosol cloud rendered as a **50% checker dither** (no alpha); the only VFX that persists in tile space | 6 frames, 10 ticks each, slow loop while the hazard lasts |

Kinetic borrowing the world's palette is the point: kinetic damage is the
world hitting you, not a spell. Chemical using dither instead of alpha is the
point too — it is the one effect the player looks *through*, and dither is how
this register does translucency.

Healing (chemistry driven by flux, per bible §5.4) is sparse rising
`amber-glow` motes over a `verdigris-300` flash — warm source, chemical result.

**Damage numbers:** `soot-100` fill, 1px `soot-900` outline. Crits `amber-300`.
Heals `verdigris-300`. Arc/overload damage `overload-100`. Miss is the word
"MISS" in `soot-300`, no outline — misses should be quiet. A status that rolls
and does not stick is the word "RESIST", the same soot-300 and the same silence:
nothing landed either time. The 3x5 atlas carries only the letters these words
and the cursor's elevation readout need, and a word added to the popups without
its letters throws on the frame it lands — so the atlas grows with the words.

## 8. Status iconography

16 × 16, 1px `soot-900` outline, flat 2-tone fill, drawn silhouette-first so
they survive at size in a 3-icon row.

| Category | Fill |
|---|---|
| buff | `verdigris-500` |
| debuff | `blood-500` |
| flux-borne | `overload-500` |
| environmental / hazard | `hazard` |

**Direction: icons are tools and marks, never abstract symbols.** This world
does not have arcane sigils; it has equipment and injuries. Stunned is a bent
prong, Pinned is a driven spike, Numbed is a fogged lens, Scalded is a burn
brand, Grounded is a severed lead. If an icon could appear in a generic fantasy
game, redraw it.

## 9. Placeholder art

Until real sprites exist, `src/art/placeholders.ts` generates per-frame
silhouettes from layered rectangles — job-distinct configurations (Enforcer
bulky with a shield, Conduit slight with a coil staff, Railrunner lean and
pitched forward, and so on), colored from the palette and team-tinted. They are
pure data (`Shape[]` per frame) plus a `drawToCanvas` helper, so the renderer
can draw them to a browser canvas and tests can assert on them headlessly.

Placeholders honor the real spec exactly — same 64×96 canvas, same anchor, same
frame counts and tick tables. Real art drops in without a code change. That is
the whole point of freezing this document now.

## 10. Consumers

`src/art` is the single color and sprite-metric source. `render/`, `ui/`, and
`sim/` import it; nothing downstream declares its own hex, its own pixel count,
or its own frame table. Three.js callers use `hexToNumber()`.

Concretely, the renderer's stopgap `src/render/palette.ts` maps onto the
canonical names as follows, and should be replaced rather than reconciled:

| Stopgap | Canonical |
|---|---|
| `fluxAmber` | `AMBER_500` (seams) / `AMBER_GLOW` (emissive) |
| `overloadViolet` | `OVERLOAD_500`, core `OVERLOAD_100` |
| `veinGlass` | `VEINGLASS_500` |
| `soot`, `skyGrey` | `SOOT_800`, `SOOT_500` |
| `coalUmber` | `UMBER_500` |
| `oxidizedCopper` | `VERDIGRIS_500` |
| `teamPlayer` / `teamEnemy` / `teamNeutral` | `TEAM_TINT[team].base` |
| terrain top / side tables | `TERRAIN_COLOR[t].top` / `.side` + `FACE_SHADE` |
| `highlight*` | `HIGHLIGHT.move` / `.target` / `.cursor` / `.deployment` |

Side-face colors are **derived**, not authored: `shade(TERRAIN_COLOR[t].side,
FACE_SHADE.sideNorthSouth | .sideEastWest)`. A hand-picked second table for
side faces will drift from the top faces and is not permitted.

---

## Appendix A — pipeline addenda (unit sprites)

Added by the unit-sprite pipeline (workstream 14). Nothing above is amended;
these record decisions the spec deliberately left to implementation, so the
generator in `src/art/{pixel,rig,jobs,sheet,player}.ts` and this document stay
in agreement. Everything here is **binding on the generator**, suggestive
elsewhere.

### A.1 Rig proportions

Authoring is in rig space: `dx` from the centerline seam, `up` from the ground
line at `SPRITE_ANCHOR.y`, both in **rig units** of 2 canvas pixels. Landmarks,
in `up`:

| Landmark | up (units) | Rows (canvas) |
|---|---|---|
| feet / boot | 1–3 | 82–87 |
| knees | ~8 | ~72 |
| hips | 15 | 58 |
| shoulders | 27 | 34 |
| head box | 28–40 (13 units) | 8–33 (26 rows) |

40 units of figure with a 13-unit head is §3's "3 heads tall, top-heavy". Rows
0–7 stay free for helmets, hoods, and the idle bob.

Widths passed to the rig's drawing helpers are units too; the 1px light and
shadow rims those helpers add are canvas pixels and do not scale.

### A.2 The 1px outline ring

The outer 1px ring of the canvas (column 0, column 63, row 0) is reserved for
the silhouette outline: the rig clears any body pixel that lands there. Held
props clamp to `PROP_REACH` (|dx| ≤ 11 units, up ∈ [1, 41] units), head centers
to |dx| ≤ 8 units, and shoulder joints to |dx| ≤ 11 units — so the closed
outline of §3 is structurally guaranteed rather than checked by eye. Those
clamps are the same *fraction* of the canvas they were at 32×48, which is why
they did not have to be re-decided at the new density.

### A.3 Sub-floor band contents

Rows 88–91 carry a 4-row `soot-900` contact shadow sized to the foot spread;
rows 92–95 are unused for now (reserved for slope offset and kicked dust). No
outline is drawn below the ground line — a standing figure meets the tile, and
an outline under the feet would read as a float.

### A.4 Hurt frame 0 is a silhouette flash

`hurt` frame 0 replaces every interior color — team tint included — with
`soot-100`, keeping only the outline and any emissive element. One frame, 4
ticks. It is the only frame in the pipeline without visible team tint.

### A.5 Cast hold loop pulses

§4 fixes frames 2–3 of `cast` as the hold loop. The two frames differ by a 1px
torso bob and one step of emissive growth, so a charged action waiting on the
CT timeline reads as a pulse, not a freeze. Emissive growth is capped at +2 units
of radius; with that cap the worst frame in the roster spends 174 of 6144
pixels on the amber ramp (2.8%), inside the 4% budget of §2.

The budget is an **area share**, not a pixel count, and was re-derived at 64×96
rather than carried over: the billboard's world size did not change with the
density, so what a player sees is the fraction of the figure that glows. 4% is
the tightest round share that still clears the cast peak.

### A.6 Team tint mask, in two parts

The 5–12% tint mask is split so job gear can never bury allegiance:

- a **chest band** (`shoulderW - 4` wide, 2 rows of base + 1 of shadow) drawn
  with the torso, under whatever the job wears;
- **pauldron trim** (3×2 base + 3×1 shadow at each shoulder) drawn last, over
  all gear.

Measured across the roster this lands at 6–8% of body pixels.

### A.7 Facing indicator

The wedge stays. Two of the four apparent views differ from the other two only
by mirroring, and at this size that difference is real but not fast enough to
base a targeting decision on. The wedge is the tactical readout; the art carries the
character. Revisit when facing gains a mechanical cost.

### A.8 Preview

`src/art/preview.html` (vite input `spritePreview`, dev URL
`/src/art/preview.html`) renders every job × state × view × frame, the assembled
sheets, and live playback with the real tick tables. Dev-only; the game does not
import it.

### A.9 Still outstanding (sprites)

All seven jobs now ship a delivered master (C.8, C.8.7); the compositor's figures
are the placeholder they always were and stay reachable via
`compositeJobSheet`. What the delivered art still owes is recorded per job in
`art-src/INTAKE_LOG.md` — the team-tint mask is absent across the whole roster,
which is the one violation with an in-game cost.

Portraits remain the open character-art workstream: §4 commits them to painted,
which this pipeline cannot express. The placeholder blocks stand.

---

## Appendix B — battle VFX addenda

Added by the battle-VFX pass (workstream 16). Nothing above is amended; these
record the decisions §7 left to implementation. Binding on `src/render/{glyphs,
popups,effects,vfxLayer}.ts`; suggestive elsewhere.

### B.1 Damage numbers are pixels, not type

Numbers are drawn from a **3 × 5 glyph atlas** (`src/render/glyphs.ts`) — the ten
digits, `-`, `+`, and the letters M, I, S — one blank column between glyphs, one
pixel of padding, then the closed 1px outline ring §3 already defines, reused
verbatim from `outlineGrid`. The grid is painted to a canvas at integer scale
and sampled `NearestFilter`, so a number never resamples.

The **number palette is closed**: §7 names soot-100, amber-300 (crit),
verdigris-300 (heal), overload-100 (arc), soot-300 (miss, unoutlined), and that
is the whole set. Kinetic, thermal and chemical damage therefore print in
soot-100 — a type's identity is carried by its *impact effect*, which is where
§7 puts it, and adding hazard-orange numerals would spend the type language
twice. `crit` is implemented but unreachable: core does not report crits yet.

### B.2 Popup life, and how several at once behave

40 ticks (0.67 s). The number climbs 0.55 world units on an ease-out and holds
full opacity for the first 55% of its life, then fades — in **four quantized
steps**, not a smooth ramp, so a popup dissolves the way a sprite would.

Popups landing within 0.75 world units of each other take successive **lanes**
0.3 world units apart, lowest free lane first, so an area attack prints a
readable column instead of one illegible overprint. A lane frees the moment its
popup expires.

### B.3 Transients have no terminal state

The presentation contract says every event carries its end state. Popups and
impact effects carry none — their end state is *gone*. `skipPresentation()`
therefore finishes the queue **and clears the VFX layer**. Skipping a battle log
is silent by design.

### B.4 The four impacts, as built

| Type | Form | Timing (from §7) |
|---|---|---|
| `kinetic` | soot-100 wedge at the contact point + 9 debris points colored from the *tile underneath* (its top and accent), thrown along the blow when the source is known; the 1px sprite displacement is the `hurt` recoil of A.4 | 3 × 4 = 12 ticks |
| `arc` | straight-segment polyline from source to target, overload-100 core over an overload-700 spread, strobing on the frame table; wet or metal tiles add a verdigris-500 ground disc | 4 × 3 = 12 ticks, the fastest per-frame |
| `thermal` | three bottom-anchored columns rising and narrowing, stepping amber-500 → hazard → blood-500, under a brief amber-glow bloom-eligible core | 5 × 5 = 25 ticks |
| `chemical` | a 50% checker-dither quad on the tile — `alphaTest`, never alpha blending — phase-swapping every 10 ticks | 6 × 10 = 60 ticks, then lingering to 2.4 s |

Chemical is the only one that stays in tile space. Healing is its own form:
five amber-glow motes rising over a verdigris-300 flash.

**No post chain.** The three bloom-eligible colors (amber-glow, overload-100,
veinglass-100) are drawn bright and untonemapped; when bloom lands it keys on
them and nothing else. Nothing in this pass paints with them on a non-emissive
surface.

### B.5 The actor swings before the target flinches

`AbilityUsed` maps to a `unitActed` render event carrying the actor, emitted
ahead of the `DamageDealt` it caused, so the queue plays swing → hit in order.
The swing's step is the **anticipate frames plus the strike** (13 ticks of the
27-tick `attack` clip); the follow-through plays out under the target's recoil
rather than delaying it. The clip returns itself to `idle`, so skipping cannot
strand an actor mid-pose.

Charged actions use the `cast` hold loop of A.5 directly: `AbilityCharging`
parks the caster in it, the `AbilityUsed` that fires when the charge resolves
releases it, and `AbilityChargeCancelled` releases it without a payoff.
Distinguishing wind-up from release needs no extra state — an `AbilityUsed`
naming an ability with a `castSpeed` is always the release.

### B.6 Leaving the field

A unit removed by script (not downed) **walks up to 3 tiles toward the nearest
map edge and shrinks to nothing at its feet**. It is not a fade: §3 fixes sprite
alpha at 0 or 255, so a half-transparent unit would be off-model. The walk
ignores pathing and terrain cost — it is an exit, not a move, and the unit is
gone before anything could block it.

### B.7 Volatile machinery stages its own death

An object carrying an `onDestroyed` payload runs its **seams up to overload-100
for 0.3 s before the silhouette collapses** — the warning arrives through the
seam ramp §6 already taught the player, not through a new color. The collapse
then lands on the destroyed language properly: bodies go to soot rubble
(`soot-700`), seams go `umber-900` dead. A single flat darkening would throw
away the seam/body distinction the powered states spent the whole battle
teaching.

A deployable set off by contact (`ObjectTriggered`) bursts thermal and is simply
not there afterward.

### B.8 Still outstanding (VFX)

- The **bloom chain** itself. The colors are correct and untonemapped; nothing
  keys on them yet.
- **`ObjectDamaged` carries no damage type** in the core event stream, so
  machinery takes the kinetic impact whatever hit it.
- The **soot plume** §6 gives destroyed objects (persistent, 3 frames at 20
  ticks) is not drawn; the rubble tint is.

---

## Appendix C — pixel craft (unit sprites)

Added by the sprite-craft pass. §3 fixed the *container* — canvas, anchor,
outline, index discipline — and Appendix A fixed the *armature*. Neither said
anything about what happens inside the silhouette, and the first pipeline
therefore filled it with flat rectangles: spec-conformant and lifeless. This
appendix is the missing law. It is **binding on `src/art/**`** and suggestive
elsewhere.

### C.0 The acceptance bar

**The FFT floor.** *Final Fantasy Tactics* (1997) is the explicit minimum, not
the aspiration. A Greyfall unit is not finished until, held next to an FFT
generic at 1× on a dark ground, it loses nothing on:

1. **Form.** Every mass — head, torso, each limb, each piece of gear — carries
   a visible light side and a shadow side. Nothing is one flat color.
2. **Face.** The head reads as a face at 26px: you can find the eyes without
   zooming.
3. **Material.** Cloth, plate, leather and metal are told apart by ramp and
   edge treatment alone, with no outline help.
4. **Silhouette.** The job is identifiable from the black shape.
5. **Cluster.** No stray single pixels, no ladder banding, no 45° stairs
   longer than three steps.

A frame that fails any one of these is sent back. "It passes the tests" is not
an answer: the tests below are a floor under the floor.

### C.1 Shading model

**One key light: upper-left, slightly front, hard, colorless.** It never moves
— not per job, not per view, not per frame. In the `ne` (away) view the *unit*
turned around; the light did not. This matches the terrain: `FACE_SHADE` lights
the tile top at 100% and drops each side face, and a sprite lit from above-left
sits on that top face without arguing with it.

**Three steps per form, from an existing ramp. No new colors, ever.**

| Step | Where it goes |
|---|---|
| **light** | the top row and the left column of a mass; the upper-left facet of a curved one |
| **base** | the body of the mass — always the largest of the three |
| **shadow** | the bottom row and the right column; the underside of every overhang |

A fourth step exists but is not "shading": the **line step**, the darkest
member of the local ramp, used only for interior separation (§3's rule) — where
two pieces of the *same* material meet and the shadow step is not enough to
part them. It is never used as an area fill.

**Ramp assignment by form:**

| Form | Ramp | light / base / shadow / line |
|---|---|---|
| skin | umber (+copper-300) | `copper-300` / `umber-300` / `umber-500` / `umber-900` |
| hair | soot or umber, per job | job's `hair` ramp; the light step is a 2–3px streak, never a full column |
| cloth coat | job's coat ramp (soot or umber) | `coatLight` / `coat` / `coatDark` / darkest local step |
| plate armor | soot | `soot-300` (`soot-100` for a spark only) / `soot-500` / `soot-700` / `soot-800` |
| leather | umber | `umber-300` / `umber-500` / `umber-700` / `umber-900` |
| graft / worked metal | copper | `copper-300` / `copper-700` / `umber-900` / `umber-900` |
| glass, patina, chemistry | verdigris | `verdigris-300` / `verdigris-500` / `verdigris-700` / `verdigris-700` |
| emissive (seam, node, cell) | amber | `amber-300` core inside `amber-500` body; **no shadow step, no outline** — the halo of §3 replaces both |

**`copper-500` stays reserved.** §6 gives it to operable affordances. On a unit
it appears only on an actual grip, lever, or coupling the unit *works* — the
Railrunner's hook jaw, a tool handle. Graft plate and machine bodies take
`copper-700`/`copper-300` and skip the middle step entirely; that gap is what
makes the affordance color findable.

**Emissive is exempt from the three steps.** A powered element is body + core
and nothing else. Adding a shadow step to a light source is a contradiction.

### C.2 Cluster discipline

- **Minimum cluster: 2 px**, in any direction, for every color *except* the
  line step, an eye dot, and an emissive core. A single orphan pixel of a
  shading step is a compression artifact, not a highlight.
- **No banding.** A mass may not be built from full-width horizontal stripes of
  successive ramp steps. Shading runs with the form's axis: a vertical limb is
  shaded by *column*, a horizontal belt by *row*. A form shaded across its own
  axis reads as a stack of bricks.
- **No stairs longer than 3.** A 45° edge stepping 1px-at-a-time for more than
  three steps must break rhythm (2,1,2,1 or 1,2,1,2), or it reads as an
  anti-aliased diagonal and the outline turns to lace.
- **Highlight is scarce.** The light step may not exceed ~25% of a form's
  pixels, and `soot-100` (the brightest step in the world) is a *spark*: at
  most a 2px cluster per frame, and only on plate or glass.

**Dither is allowed in exactly three places**, and nowhere else:

1. **Material transitions** — where cloth meets leather, plate meets cloth, or
   a coat hem meets its own shadow, across a band **2 rows deep at most**.
2. **Large forms** — a mass of **≥ 24 px** may carry one interior dither band
   to break a flat field (a shield face, a coat back, a backpack panel).
3. **Emissive falloff** — one dithered ring outside an `amber-500` body where
   the halo would otherwise be a hard rectangle.

Approved patterns only:

| Pattern | Rule | Use |
|---|---|---|
| `checker` | `(x + y) % 2` | material transition, emissive falloff |
| `quarter` | `(x % 2) && (y % 2)` | the light end of a large-form gradient |
| `three-quarter` | complement of `quarter` | the dark end of the same gradient |

Any other pattern — noise, dot-scatter, 1px speckle — is off-model. Dither is
a *ramp step between two ramp steps*, never texture.

### C.3 The face standard at 26px

The head box is 26 rows (Appendix A.1) — 13 rig units, the same head the spec
always described, drawn at the current density. It is spent like this, and this
is the single most load-bearing paragraph in the appendix — a Greyfall unit
without a readable head is not shipping:

| Head rows | Contents |
|---|---|
| 0–3 | crown taper (12px, then 18px wide) — hair or helmet mass only |
| 4–11 | hair mass / helmet dome. Carries the hair light streak on the **left** |
| 12–13 | brow shelf: a line of the skin shadow step across the forehead |
| 14–15 | **the eye rows** |
| 16–21 | cheeks, nose shade, mouth line |
| 22–23 | chin (18px wide) |
| 24–25 | jaw shadow / neck (12px wide), meeting the shoulders |

Head masters are authored as 24 × 30 glyphs: column 2 is the left edge of a
20px head and glyph row 4 is head row 0, so glyph rows 0–3 are helmet, hood and
antenna headroom.

**Eyes.** Two dots one rig unit square in the skin's **line** step
(`umber-900`), on the eye rows, separated by **4–6 px of base skin**, never
adjacent to the silhouette outline and never taller than the eye rows. That is the whole treatment: FFT's eyes are dots
and they work because the *hair mass* and the *skin triangle* around them carry
the read. A second row of eye pixels turns a face into a skull.

**The skin/hair split.** Hair is a solid mass occupying head rows 0–11 plus the
outer columns down to row 21 (sideburns / hair fall). Skin is the triangle
left over: widest at the eye rows, tapering into the chin. In a three-quarter view
the split is **asymmetric** — the far side (right, the shadow side) carries one
extra column of hair, which is what makes the head read as turned rather than
frontal. Total skin should be roughly 40–55% of the head box; a face that is
mostly skin reads as a bald bust, and one that is mostly hair reads as a hood.

**Helmeted jobs substitute a visor read.** The Enforcer has no face; a closed
riot helm that showed one would be wrong. In its place:

- a **visor slit**: a horizontal band 2–3 rows tall across the brow and eye
  rows, in the plate line step (`soot-800`), spanning at least 10px — this is
  the *anchor of the read*, and it sits where the eyes would have been so the head still
  reads as a head;
- a **gleam**: a `soot-100` cluster at the slit's left (lit) end — this is
  the frame's one permitted spark under C.2, spent here because it obeys C.1's
  light direction and is the only thing that keeps the slit from reading as a
  hole;
- a **cheek/jaw plate** below the slit, one shadow step darker than the dome,
  so the helmet has a front and a side.

Partial masks (Chemist's respirator, Saboteur's hood, Railrunner's goggles)
keep the eye row and cover something else: the Chemist covers rows 9–12, the
Railrunner replaces row 7 with lensed goggles (a `copper-300` lens with a
`soot-800` core and a 1px `soot-100` gleam on the left lens only), and the
Saboteur's hood puts the whole face in `umber-900` with **one** 2px skin-light
glint where the cheekbone catches the key light. All three still resolve to
"there is a person under that."

### C.4 Material vocabulary

Ramp choice alone is not enough; each material also has an **edge rule** — what
happens at the boundary between the form and the outline.

| Material | Ramp | Edge treatment |
|---|---|---|
| **cloth** (coats, hems, wraps) | coat ramp, 3 steps | Soft: on any mass **5px or wider** the light step stops **1px short** of the silhouette on the lit side, so cloth never has a specular rim. (Limbs narrower than that have no room and take the rim; the rule is about coats, not sleeves.) Folds are line-step verticals, 3–6px long, never full height. Hems get a shadow-step row and may carry one checker transition row. |
| **plate** (armor, shield, helm) | soot, 3 steps | Hard: a continuous 1px light-step **rim** along the lit edge, right up to the outline, plus a 2px `soot-100` spark at the single brightest corner. Bevels are horizontal shadow-step lines that stop 1px short of both sides. |
| **leather** (harness, belt, satchel, boot) | umber, 3 steps | Broken: the light step appears only as 2–3px **scuffs** at wear points (shoulder crest, belt top, satchel lid), never as a continuous line. Stitching is line-step dots at 2px spacing along one edge only. |
| **graft-metal** (Augmented plate, machine bodies) | copper, with the middle step skipped | Segmented: `copper-300` bevel on the top-left of each *segment*, `umber-900` gap line between segments, and an amber seam running the segment joins. Graft metal is never one continuous form — it is plates with gaps, which is what distinguishes it from plate armor at 1×. |
| **glass / chemistry** | verdigris, 3 steps | Wet: `verdigris-300` confined to a 2px cluster at the upper-left of the vessel, `verdigris-700` filling the lower two thirds, and no line step at all — glass has no interior separation. |

### C.5 Per-job 1× read checklist

Two or three things per job that MUST be identifiable at **actual size, on a
dark ground, without motion**. If a reviewer cannot name them, the job fails
regardless of what the tests say.

| Job | Must read at 1× |
|---|---|
| **Enforcer** | (1) the shield mass squared across the body — the largest single flat plate in the roster; (2) the visor slit with its left gleam; (3) shoulder span wider than any other job's |
| **Machinist** | (1) the backpack hump breaking the shoulder line, with (2) one amber cell window on it — the only amber on a non-caster; (3) goggles pushed **up** onto the brow, leaving the eye row bare |
| **Conduit** | (1) the staff node glow above the head, above every other silhouette in the roster; (2) the unbroken coat line from collar to hem — the only full-length coat; (3) a bare, uncovered face |
| **Saboteur** | (1) the hood peak and its black face void with a single glint; (2) the hip satchel breaking the waistline on one side only; (3) the charge row on the belt |
| **Chemist** | (1) the A-flared hem, widest silhouette below the waist; (2) the respirator covering the lower face while the eyes stay visible; (3) the flask bandolier — verdigris, the only green on a person |
| **Augmented** | (1) asymmetry: one arm twice the other's width; (2) the amber seam down the graft's segment joins; (3) brightblood scarring at the neck — the only pink in the world |
| **Railrunner** | (1) goggles **down** over the eyes, lensed; (2) the coat tail streaming back off the silhouette; (3) the coupling hook, the only `copper-500` on a person |

### C.6 How the craft survives animation

The 14 masters (7 jobs × 2 views, `idle` frame 0) are where the pixels are
hand-placed. Everything else is derived:

- **Heads and gear are stamps** — literal index grids, positioned by the rig's
  joints. A stamp translates and never deforms, so a pose change moves the face
  rather than smearing it.
- **Torso and limbs are ramp-shaded forms** — the same tapered mass the old rig
  drew, now carrying C.1's three steps along its own axis. These deform,
  because they must.
- **Held props are shaded forms along the prop axis**, since they rotate.
- If a specific frame breaks a stamp — gear detached, cluster smeared — the fix
  is a **per-frame patch**, never a simplification of the master. The masters
  set the bar; the animation table pays for keeping it.

### C.7 What the tests can and cannot check

`tests/art` enforces the mechanical half: palette validity, amber budget,
anchor, frame counts, closed outline, cluster minimums, ramp usage per form,
face pixels present, and that the masters differ per job by more than a palette
swap. It cannot check whether a sprite is *good*. The 1× read checklist of C.5
is a human gate and stays one.

### C.8 External master intake

Greyfall accepts sprite masters produced outside this pipeline. This section is
the contract those masters answer to, and the pipeline that enforces it lives in
`src/art/{png,ingest,intake,segments}.ts`. It is written so an artist can be
handed the section and nothing else.

**Deliver, per job:** two figures — a front three-quarter and a back
three-quarter over the same shoulder — of the **idle, frame 0** pose. That is
all. The other 27 frames per view are derived (C.8.4). Where both cells arrive,
the back one drives the away-facing rows; where only one does, the front master
stands in for both and the unit never turns around (C.8.6). Deliveries that come
as finished character sheets rather than bare grids are handled by C.8.7.

Deliver them at **256 × 384 per figure**, not at the spec size: painting at 4×
and reducing keeps edges that hand-placing at 64×96 would lose, and
`fitMasterToCanvas` does the reduction — it measures the figure in the delivery,
box-filters it down to the figure box, centers it on the seam and stands it on
the anchor row. The requirements below are stated in **canvas** terms and are
checked after that reduction.

#### C.8.1 What a master must satisfy

| # | Requirement | Where it comes from |
|---|---|---|
| 1 | **64 × 96 canvas** after reduction, alpha strictly 0 or 255 — no partial alpha, no anti-aliasing, no baked glow | §3 |
| 2 | **Feet on the anchor**: the lowest occupied row of the figure box is **row 87**, and the figure is drawn symmetric about the x = 32 seam | §3, A.1 |
| 3 | **Rows 88–95 empty** except a `soot-900` contact shadow; nothing else in the sub-floor band | A.3 |
| 4 | **Column 0, column 63 and row 0 empty** — the outer ring is the outline's | A.2 |
| 5 | **3-heads proportions**: 26px head, shoulders at row 34, hips at row 58, feet at rows 82–87. A master drawn to other proportions still animates, but its own shoulder and hip rows must be declared as `Landmarks` so the region cut follows the art | A.1, C.8.3 |
| 6 | **Palette**: every color a §2 value, or close enough that quantization is unambiguous (C.8.2) | §2, §3 |
| 7 | **≤ 12 colors + 2 tint indices** after quantization | §3 |
| 8 | **Closed 1px `soot-900` silhouette outline**; interior separation uses the local ramp's darkest step, never `soot-900` | §3 |
| 9 | **Emissive elements unoutlined** — amber/overload/vein-glass bleed into a halo instead | §3 |
| 10 | **Amber ≤ 4%** of the canvas (≤ 245 px), every amber pixel sourced in-frame | §2 |
| 11 | **Team tint** occupies exactly the two `steel` (player) indices, 5–12% of body pixels, as chest band + pauldron trim | §2, A.6 |
| 12 | **Face standard** of C.3, or the documented substitute for a helmeted job | C.3 |
| 13 | **Job read** of C.5 identifiable at 1× | C.5 |
| 14 | **Centerline gear**: job-identifying mass adjacent to the body centerline, so the mirrored view reads as a turn | §4 |

1–11 are machine-checked by `auditGrid`. 12–14 are the human gate.

#### C.8.2 Quantization, and the one thing it will get wrong

`quantizeToPalette` snaps each pixel to the nearest §2 color by RGB distance and
returns a `ConformanceReport` naming every pixel that moved and how far.
**It never repairs.** An open outline, an over-budget amber, a thirteenth color:
reported, not fixed. Silently correcting incoming art is how a pipeline starts
lying about what the artist drew.

Flesh has its own ramp. `bone-500/300/100` are the low-saturation warms between
the umber ramp and `soot-100`; without them the nearest palette step to a mid
skin tone is `copper-300` (rusted) or `soot-100` (dead), and every delivered
face arrives looking like one or the other.

The palette has one dangerous near-collision: **`soot-900` (#0b0d10) and
`umber-900` (#150e09) are ~12 units apart**, where the rest of the palette steps
~40. A master whose blacks drift more than ±6 per channel will have some of its
**outline** reassigned to `umber-900`, and every downstream check then fails for
the wrong reason. The report calls this out as `ambiguous` — pixels quantized by
a margin narrower than the move itself. A non-empty `ambiguous` list means clean
the source blacks or pass `allowed` to restrict the target palette. Do not
proceed past it.

#### C.8.3 The region map

A master is animated by cutting it into named regions and moving each with a rig
joint. The **default map** is derived from the rig itself and partitions rows
0–43 with no overlap and no gaps:

| Region | Extent | Rides | Distal |
|---|---|---|---|
| `head` | everything above the shoulder row | `head` | — |
| `armFar` | shoulder→hip band, left of the torso columns | `shoulderFar` | `handFar` |
| `torso` | shoulder→hip band, the hip-width columns | `shoulder` | `hip` |
| `armNear` | shoulder→hip band, right of the torso columns | `shoulderNear` | `handNear` |
| `legFar` | below the hips, left of the centerline | `hipFar` | `footFar` |
| `legNear` | below the hips, right of the centerline | `hipNear` | `footNear` |

Any gear that **crosses** those boundaries — a shield over the hips, a satchel
at the waist, a maul head above the shoulder line, a staff running the full
height of the canvas — must be declared as a `prop` region, which is cut
**first** and therefore never torn in half. A prop region is a rectangle in
master coordinates plus the joint it rides; measure it off the master, not off
the rig.

A view may declare **several** prop regions and they ride different joints — a
tower shield strapped to the hip and a maul swinging from the hand are both
props and must not move together. Each region owns only the pixels inside its own
rectangle. (This was worth writing down: the first implementation bucketed cut
pixels by region *name*, so two prop regions each received the union and the
shield was painted a second time at the maul's offset, on every attack frame.)

The **rows** the six default regions split on come from the rig, and a master
drawn at other proportions must override them with `Landmarks`. The generator
briefs ask for 5 to 5.5 heads and the armature is 3, so a master drawn to the
brief has its shoulder and hip lines further down the canvas; without the
override the head region takes half the chest with it. The joint *deltas* that
move each region are still the rig's, and those are small enough to stay honest
across the proportion gap.

#### C.8.4 What derivation does to a master

Each region is translated by the delta between its joint's rest position and its
position in the target pose. Regions with a distal joint additionally **shear**:
a pixel's shift is interpolated between the two joint deltas by how far along the
proximal→distal axis it sits, so a leg swings from the hip instead of sliding.
The master's own outline is **discarded** on the way in — it rides along only as
a mask that keeps seam-closing out of concavities the artist drew — and the
silhouette outline, halos and contact shadow are re-derived per frame.

**Artifacts to expect, in order of how often they bite:**

1. **Props do not rotate.** A weapon translates with the hand and keeps its drawn
   angle. An `attack` strike that needs the blade to swing through 90° will read
   as a lunge with a static weapon.
2. **`downed` frames 2–3 smear.** They are the most extreme pose in the table
   (crouch 10–11, torso shortened to 3–7 rows) and a translated master cannot
   fold. Expect a legible collapse, not a good one.
3. **Seams at region boundaries** on large shears, mostly shoulder and hip. The
   seam-closer fills holes with ≥ 6 opaque neighbors, which fixes almost all of
   them without welding the gap between the legs shut.
4. **Gear declared in the wrong region drags.** A prop rectangle that clips the
   helmet makes the helmet ride the hand. Symptom: a diagonal streak that grows
   with the pose.

All four are fixed the same way: a **per-frame patch**, never a simplification
of the master. A patch names a state/view/frame, optionally clears rectangles,
and draws primitives over the derived result. That is the escape hatch C.6
promised, and it is where a rotated weapon or a hand-fixed downed pose belongs.

#### C.8.5 Acceptance

A master is accepted when `report.ok` is true for both views, `ambiguous` is
empty, the 28 derived frames per view pass the same §2/§3/§4 assertions the
generated art does, and a human confirms the C.5 read at 1×. Two of those four
are automated; the other two are not, and the FFT floor of C.0 remains the bar
for external art exactly as it is for ours.

#### C.8.6 What ships anyway, and why

`report.ok` is the acceptance gate of C.8.5, and a master that fails it can
still be wired in — deliberately, with the report recorded where the art lives
(`src/art/masters/<id>.ts` carries it as a header comment). The compositor's
output is a placeholder; delivered art that violates the color budget still
beats it on sight, and refusing the art would mean shipping the placeholder.

What ships must record *which* violations it carries, because each one has a
downstream cost the rest of the pipeline cannot see:

| Violation | What it costs downstream |
|---|---|
| over the 12+2 color budget | nothing mechanical; the discipline is a hand-drawing rule and a reduction of painted art cannot produce it |
| the master's outline is not closed | nothing in-game — derivation discards the master's outline and re-derives a closed one per frame — but the master itself cannot be trusted as a reference |
| team tint absent | **the unit no longer reads as player or enemy from its art.** The facing wedge and the UI carry allegiance until the mask is painted in the player steel |
| orphan clusters, ambiguous quantizations | dither-like noise at 1×; visible as sparkle when the camera pulls out |
| one view delivered instead of two | the unit never turns around: the back view is the front master |
| a stance wider than the figure box | the reduction is measured off the whole figure, so the figure pays for its gear spread in **height**: it stands shorter than a character of the same drawn height in a narrower stance, and its widest gear clips against the reserved ring on any pose that translates laterally |
| midtones drawn under a warm key | neutral greys quantize into the `bone` ramp rather than `soot` (`#6b6e6d` is 39.5 from `bone-500` and 40.5 from `soot-300`), so the unit reads warmer than §1's ash-grey intent. Visible as cream where the art meant grey |

The per-job record of which of these each delivered master carries lives in
`art-src/INTAKE_LOG.md`, next to the art.

### C.8.7 When the delivery is a character sheet

C.8 asks for a bare two-cell grid on transparent ground. Real deliveries are
finished **character sheets**: two figure cells plus a title block, a 64×96
preview inset, a proportion silhouette, a palette strip, caption text, guide
frames and a painted backdrop — at a different size and layout per sheet. The
roster's six-job delivery arrived that way. `src/art/delivery.ts` locates the two
figure cells in such a sheet; `tools/ingest-master.ts` declares which shape each
delivery is (`"sheet"` or a hand-measured `"crop"`).

**The method is a threshold, not a heuristic, and that is a finding about the
files rather than a choice.** The sheets look like opaque paintings, and the
tempting approach is to key on edge crispness or flood from the corners — the
figures are crisp pixel art over blurry painted ground. Don't: the alpha channel
of every one of those files is *already a clean matte* of everything the artist
drew. The painted backdrop lives in RGB at alpha 0–40 and the drawn art sits at
alpha 250+. Keying by anything other than alpha would be guessing where the file
states the answer. Measure before inventing.

What the locator then has to survive, in the order it bites:

1. **A drawn ground line under the feet.** On half the sheets it runs across both
   cells and welds the two figures into one blob. It is cut by shape: a
   horizontal run wider than a third of the sheet whose median vertical thickness
   is a dozen rows or less is a line, not a body.
2. **Guide frames in saturated cyan.** Stripped by color. The test requires
   `b >= g - 8`, which is what keeps `verdigris-500` and `verdigris-300` — the
   accent family, an apron, a rag — out of it. Guide-colored pixels within 2 px
   of a kept figure are handed back, because a goggle lens and a vial of teal
   fluid are also cyan and are inside the figure; anything still touching the
   figure after that is reported as a **collision** and counted, never absorbed.
3. **Sheet furniture.** With the line cut and the frame stripped, the two figures
   are the two largest connected blobs of the matte by an order of magnitude, and
   the leftmost is the front three-quarter on every sheet the briefs produced.
   Everything discarded is counted and sized in the report.
4. **A soft matte rim.** ~4% of each cell's pixels have neither background nor
   foreground alpha. The threshold decides them; the report says how many
   decisions it made (`ambiguousAlpha`). Where the key is ambiguous, **say how
   ambiguous** — do not resolve it quietly.

Two rules the sheet path adds:

- **One character, one reduction.** Both cells of a character are fitted at the
  scale that fits *both* (`masterFitScale`), because a front three-quarter with a
  maul out one side and a shield out the other is wider than the back view of the
  same figure — and width binds. Fitting each view alone made one delivery 70
  rows from the front and 85 from the back: a unit that grows when it turns
  around. Nothing is clipped to buy height; cropping the artist's maul off would
  be a repair.
- **`FIELD_PALETTE` is the intake target, not the whole palette.** §2's reserved
  signal colors — `overload-*`, `veinglass-*`, `hazard`, `brightblood` — are loud
  on purpose and each sits within a ramp step of some skin or cloth tone in
  painted art. A `#eba386` cheek is 47 units from `brightblood` and 51 from
  `bone-100`, so a face quantized against everything lands on the pink and then
  gets an emissive halo instead of an outline. A delivery whose fiction actually
  carries one declares it back in — the augmented job's neck scarring is what
  `brightblood` is for.

### C.9 Named failure modes

Failures the roster actually shipped, each paired with the rule that prevents
it. Both were caught in review, not by a test — which is why they are written
down rather than only fixed.

#### C.9.1 The flat face

**Symptom.** A head that is a solid block of skin under a solid block of hair,
with the eyes either absent or so low-contrast they vanish at 1×. From two feet
away the unit has no head — it has a lump the color of a head. Every other
quality of the sprite is irrelevant once this happens, because the face is where
a viewer looks first.

**Cause.** Drawing the head parametrically: a rectangle per row, a color per
region. Parametric heads always land here, because the thing that makes a face
read at head size is not proportion, it is a handful of *hand-placed* pixels
whose positions no formula produces.

**The rule that prevents it.** C.3 is not advisory. The head is a **stamp** — a
literal, hand-authored index grid — and it must contain, at minimum: two
line-step eye dots on the eye rows with 4–6px of base skin between them, a hair
mass with a light streak on the key-light side, a brow shelf, and an asymmetric
hair/skin split. A head that cannot name those five features is not finished. If
the job is helmeted, the visor substitute of C.3 applies and carries the same
burden — including the gleam, which is the difference between a visor and a
hole. **Test:** the eye rows of every `se` master must contain at least two
line-step clusters inside the skin region.

**The generated heads are markers, not portraits.** Representational art comes
from outside this pipeline (C.8); the compositor's heads exist so a unit is
identifiable while its master is unpainted. What each one has to carry is the
job's marker *above the shoulder line* — the visor slit and gleam, the goggles
up on the brim or down over the eyes, the hood void and its cheekbone glint, the
respirator, the temple graft — at roughly a tenth of the figure's height, since
that is what survives to the screen at 1×.

#### C.9.2 The cyan band

**Symptom.** The team tint reads as a bright horizontal stripe painted across
the chest — the loudest element on the sprite, louder than the face, louder than
the job's own silhouette. Every unit looks like it is wearing the same sash. On
a `steel-400` player unit against a soot-grey coat it is the first thing the eye
lands on and the last thing it leaves.

**Cause.** Two separate rules colliding. A.6 puts a tint chest band at the ribs
*and* pauldron trim at each shoulder; when those two land within a pixel or two
of the same row, they merge into one band spanning the entire shoulder width.
The mask is inside its 5–12% budget the whole time — the budget constrains
*area*, and this is a failure of *placement*.

**The rules that prevent it.**

1. **Vertical separation is mandatory.** The chest band and the pauldron trim
   must be at least **2 clear rows apart**. In practice the band sits low, on
   the ribs (shoulder line minus 6), not at the collarbone.
2. **No gaps inside the mask.** A band drawn as "2 rows of base, 1 row of
   shadow" must have those rows adjacent. A one-row hole between base and shadow
   turns one strap into two stripes and doubles the noise for free.
3. **The tint sits on a form, not on a slab.** A band across a flat unshaded
   torso reads as paint; the same band across a torso carrying C.1's three steps
   reads as a strap. Shade the torso first, then the tint mask is legible as
   equipment.
4. **The tint may never be the brightest read.** If a reviewer's eye goes to the
   team color before the face and before the job silhouette, the placement is
   wrong regardless of what the percentage says.

---

## Appendix D — environment finish

Added by the environment-finish pass (workstream 17). Nothing above is amended;
these record the decisions §1, §2 and §5 left to the renderer. Binding on
`src/render/{layers,post,highlights,units,objects,vfxLayer}.ts`.

### D.1 The ground-overlay stack (binding)

Everything drawn between the terrain top and the camera declares a band in
`DRAW_ORDER` (`src/render/layers.ts`). Nothing picks a render order locally.
Lower draws first:

| Band | What | Why here |
|---|---|---|
| 0 `terrain` | tile tops, sides, rail strips | the world |
| 1 `unitShadow` | contact shadow disc | a *darkening of the ground*, so a wash covers it |
| 2 `highlightFill` | move / target / cursor / selection / path / deployment / hazard wash | a property of the tile |
| 3 `highlightOutline` | the wash's border | its own edge, over its own fill |
| 4 `unitMarker` | team ring, facing wedge | unit furniture, not ground |
| 5 `unitRim` | team-tinted silhouette rim | the unit's own edge |
| 6 `unitSprite` | the billboard | |
| 7 `vfx` | impacts, arcs, clouds | over everything on the field |
| 8 `popup` | damage numbers | last word |

**The ruling.** A tile wash reports something about *the tile*; a team ring and
a facing wedge report something about *the unit standing on it*. The unit claim
outranks the tile claim, so unit furniture is never tinted by a wash — which is
the bug this fixed: `TileHighlights` sat above the rings, and a move or target
wash repainted every ring and wedge inside its area, turning three team colors
into one.

There is deliberately **no separate "aim" band above the unit markers**. The
cursor and selection washes were the candidates, and they do not need one: the
ring is a donut from 0.34 to 0.46 tile radius inside a wash that covers the
whole tile, so the wash still reads all the way round a ringed unit. A second
band would buy nothing and would put the stack back in the business of arguing
about precedence case by case.

Three.js sorts opaque and transparent draw lists separately, so these numbers
order objects *within* a list. The terrain and the unit billboards are opaque
(the billboard is `alphaTest`, not `transparent` — §3 fixes sprite alpha at 0 or
255) and therefore already draw under every transparent overlay whatever their
band says. The bands are still declared for all of them so the intended stack is
readable in one place.

The small `y` offsets each overlay carries (shadow 0.020, ring 0.028, wedge
0.034, wash 0.025–0.050) are **z-fight avoidance against the terrain**, not
ordering: none of these write depth, so they cannot occlude each other. Do not
reach for a y offset to change what covers what.

### D.2 The bloom chain (binding)

§2 rule 2 named three colors and left the mechanism open; §7/B.8 recorded the
chain as the last outstanding VFX item. It is `src/render/post.ts`.

**Keying is by geometry, not by luminance.** A threshold on the beauty image
would catch lit terrain — the default tile top is `soot-500` under a key light
and lands around the same brightness as a warm seam — so the chain instead
renders the scene a **second time with the camera restricted to a bloom camera
layer**. Only geometry that declared itself emissive is in that render, so
nothing else can leak into the halo whatever the exposure does. Three things
declare themselves:

| Source | How | Note |
|---|---|---|
| object seams | the seam meshes carry the layer; the bloom render has no lights, so a `MeshLambertMaterial` there resolves to exactly its emissive | unpowered and destroyed seams set emissive to black and vanish from the pass for free |
| unit sprites | a bloom-only twin quad hung off the billboard, sampling the **same sheet and the same UV window**, discarding every pixel that is not one of the three key colors (`emissiveKeyMaterial`) | costs no second sheet and no extra frame bookkeeping; the key tolerance is 0.15 in linear space, against a 0.48 nearest-neighbour gap |
| VFX | arc cores, thermal glow cores, heal motes and muzzle glow enable the layer | the amber-glow/overload-100 elements B.4 already isolated |

**Numbers.** Strength 0.45, radius 0.28, threshold 0 (everything in the pass is
emissive by construction), vignette 0.22. Tuned in situ against the Marshaling
Yard at 40 / 85 / 152 screen px per tile: a flux cell reads as a lit canister
whose body silhouette is still legible, not a white blob, and terrain gains
nothing anywhere.

**The halo is the engine's, and that is the point.** §3 forbids the source art
from painting one — emissives are crisp-edged and unoutlined — precisely so the
halo can be light rather than paint, and so a sprite keeps its hard 1px edge
when the lamp beside it does not.

The beauty pass keeps its multisampling (the composer's own render target is
built with `samples: 4`); a board of hard-edged ortho blocks aliases badly
without it. The composite adds half a code value of hash dither, because a
vignette across an almost-black sky banks into visible rings at 8 bits.

**Known limit.** Only the terrain mesh is registered as a bloom-pass occluder,
so an object body does not stop its own seam's halo and one unit does not stop
another's. On a raised ortho board with billboards standing clear of the ground
this is not visible; if a map ever puts a lit machine behind a tall mass of
*objects*, register those too rather than reaching for the strength slider.

### D.3 No depth of field

Considered and refused. Tilt-shift was the candidate — it is the usual way an
HD-2D scene sells its miniature — and it loses on three counts here:

1. **The camera is orthographic.** There is no focal plane to defocus from; any
   depth blur is a fabricated screen-space gradient, and it drifts against the
   board every time the rig orbits.
2. **It blurs the read.** At the default zoom a sprite covers ~64–85 screen
   pixels. The units at the front and back of the board are the first things a
   tilt-shift softens, and they are the objects the player is actually reading.
3. **It contradicts §3.** Sprite alpha is 0 or 255 and sprites are not
   anti-aliased; a post blur anti-aliases the whole cast wholesale.

The vignette does the framing job a tilt-shift would have been hired for, at
none of the cost. If depth is ever wanted, it belongs in the *palette* — a cool
desaturation with distance, which §1's fog already begins — not in focus.

### D.4 Terrain texture delivery

§5 fixed the tile dimensions and the per-terrain reads; it did not say at what
density an external master arrives. It arrives at **4×** — tile tops 128 × 128,
tile sides 128 × 64, box-filtered down to the 32 × 32 / 32 × 16 §5 fixes —
mirroring the 256×384 → 64×96 sprite flow of C.8. `TILE_TEXTURE_SIZE` stays 32.
8× was considered and refused: a 32px tile cannot carry the grain an 8:1
reduction would throw away, and thrown-away grain reduces to sparkle, which is
the failure C.8.6 already names.

**One set covers all three strata.** §1 assigns the difference between the Rise,
the Works and the Underveins to *light quality*, and D.2's chain plus the
existing key/hemisphere/fog rig is where that difference lives. Per-stratum
tilesets would be the same painting under two lights and are not commissioned.

The material list, per-material briefs, the seam and strata-band rules, the
six-colour ceiling and the zero-amber rule are `art-src/TERRAIN_BRIEFS.md`.
Intake is sketched there too: `decodePNG` → `resampleRGBA` → `quantizeToPalette`
with an `allowed` ramp, then a **new** terrain audit — `auditGrid` checks a
figure box, a feet anchor and a silhouette outline, none of which a tile has.
The pipeline is not built: the terrain mesh emits no `uv` attribute and there is
no tile atlas, and that engine work belongs with the art, not ahead of it.

### D.5 Terrain texturing, as built (binding)

D.4 named the density and left the engine open. Wave 1 landed, the pipeline was
built, and these are the decisions it forced. Binding on
`src/render/{terrain,terrainTextures}.ts` and `src/art/{tiles,tileIntake,tileset}.ts`.
The delivery's own report card — what diverged, and what the owner should redraw
— is `art-src/INTAKE_LOG.md` Part B.

**Nine textures, one per face of the set. No atlas.** An atlas would draw the
board in one call; nine textures draw it in as many groups as a map actually uses,
three to five in the shipped maps, on a mesh that is already merged. Two things
bought that:

1. **`RepeatWrapping`.** §5 stacks N side tiles up an N-step face. With a texture
   of its own that is one quad and `v` running 0..N. Inside an atlas the same
   thing costs either N quads or a custom shader wrapping a sub-rectangle by hand.
2. **Clean mip levels.** A 32px cell in an atlas needs padded, duplicated edges,
   and the padding has to survive every level of the chain — which is exactly the
   border a *tiling* texture must not have, because its edge pixel's true
   neighbour is the pixel on the opposite edge. Nine textures wrap correctly at
   every level for free. The chains are supplied rather than generated, because
   `gl.generateMipmap` clamps at the texture edge and this is a texture whose
   edges meet themselves three hundred times a board. Every dimension in the set
   is a power of two, so no 2×2 box ever straddles a wrap edge.

**One ruler: 32 texels per world unit, on every face.** A top is 32 × 32 across a
1 × 1 tile; a side is 32 × 16 across 1 × `HEIGHT_STEP`. There is no zoom at which
a top and the face under it show different texel sizes. Asserted, not assumed.

**A column of height N is one quad, not N quads.** Same texels, a sixth of the
vertices, and the strata cut line lands at the top of every height step — which
is the point of the band, since counting a four-step drop without moving the
cursor is what §5 hired it for. The skirt is `SKIRT_DEPTH / HEIGHT_STEP` whole
steps and lands square with the rest.

**Filtering follows the sprite sheet.** `NearestFilter` on magnification, because
the ground must show hard texel edges at the zooms the camera sits at; trilinear
on minification, because a board pulled out to ~40 screen px per tile crawls
otherwise. Textures are neutral: vertex colour carries only the per-tile
brightness wobble and the face shade, so the three strata stay a property of the
light exactly as §1 and D.4 require.

**Rail rotates, it is not redrawn.** Rails are painted running north–south; an
east–west run is the same texture turned a quarter (`(u,v) → (v, 1−u)`, a
rotation, never a mirror). The placeholder inset rail strips were removed with
this pass: leaving engine geometry on top of delivered art is how a renderer
starts lying about what the artist drew.

**The water shimmer is a translation, not a repaint.** §5 wants two `water-top`
frames alternating every 30 ticks; Wave 1 delivered one. Interim: `water-top` is
the one texture with an animated `offset`, stepping the whole surface one texel
and back on the same 30-tick beat, which puts the shimmer bands at two heights
without touching a pixel of the delivery. `WATER_SHIMMER_TICKS` is what the second
frame replaces when it lands.

### D.6 Map-object texturing, as built (binding)

§6 fixed the object state language and `art-src/OBJECT_BRIEFS.md` fixed the
delivery format; neither said how a painted face reaches a primitive. Wave 1's
first object — the flux main — landed, the pipeline was built, and these are the
decisions it forced. Binding on `src/render/{objects,objectTextures}.ts` and
`src/art/{objects,objectIntake,objectset}.ts`. The delivery's own report card is
`art-src/INTAKE_LOG.md` Part C.

**`spriteId` is the key, and it finally buys something.** `data/maps/*.json`
authors object identity in `spriteId` and until this pass nothing in `src/render`
read it, so the two grid roles a player most needs to tell apart — the main whose
capacity feeds the floor and the board that merely opens a branch of it — were
the same word in the file and the same primitive on the board. `objectArtFor`
answers a `spriteId` with a face set or with `null`, and `null` falls through to
the primitive the object already had, unchanged. An object gains art by being
named, not by being special-cased.

**Objects wear paint; they do not become billboards.** One `BoxGeometry` on the
map's footprint at the brief's height, six material slots, three paintings. Only
units billboard: a main blocks movement and line of sight, units walk around it
and stand beside it, and a card turning to face the camera would break both the
occlusion the tactical read depends on and the height the player counts off the
strata lines.

**The box is built long-axis-on-z and turned, rather than the paint being
turned.** The top cell is drawn *across* by *along* — 32 × 64 for a 1 × 2
footprint — and `BoxGeometry`'s `+y` slot is the one face whose `u` runs across
and `v` along. Building every object in one local orientation and putting
`rotation.y = π/2` on the mesh for an east–west run means that lands at every
orientation, with no second painting and no rotated copy of the first. The face
shade follows the *world* normal after that turn, which is the brief's warning
made concrete: a main whose run is north–south presents its long side east–west
and is shown at 62%, and the same painting on a main turned the other way is
shown at 78%.

**One ruler, the ground plane's: 32 texels per world unit.** A long side is
`along × 32` by `heightUnits × 32`; an end is `across × 32` by the same height; a
top is `across × 32` by `along × 32`. `OBJECT_ART` therefore states a footprint
and a height and every face size is derived from them, asserted rather than
carried twice. Filtering follows the tile faces and the sprite sheet —
`NearestFilter` magnifying, trilinear minifying, chains supplied not generated —
but object faces **clamp**: a machine face is laid once, not three hundred times,
so `RepeatWrapping` and the wrap-seam measurement of D.5 do not apply to this set.

**A state is a substitution over the amber ramp, and only the powered painting is
stored.** §6's unpowered row is the powered painting with the light taken out and
*nothing else moved*, which is the whole reason the player learns that the seam is
the power indicator. So one painting per face ships and `faceInState` maps five
palette steps — recess, seam, core, halo — into whichever state the object is in.
`OBJECT_STATE_PAINT` names the seam, the core and the halo; a painted seam
additionally has the channel it sits in, so `FACE_STATE_PAINT` adds the **recess**
and follows the state's own darkest step there. Nothing else on the face is
repainted by a state: the cast frame is the cast frame in every one of them, and
the collapse ramp still darkens the body on top.

**A painted carrier is a light, and that takes an emissive map.** This is the one
place a diffuse texture cannot say what §6 says. On the primitives the amber seam
was a mesh of its own carrying an emissive, which is why it blazed; painting the
same seam into a face the engine is also shading at 62% gives a main a dull ochre
stripe instead of a live bus. So a painted face carries a second small texture —
the carrier's own pixels, seam and core and halo, in the state's colours — as
`emissiveMap`, and `emissiveIntensity` is where §6's 2-frame 30-tick pulse lives.
The mask is `null` in exactly the states §6 gives no halo, so "no halo, no pulse"
is one branch and not a special case. The recess is excluded: a recess is a
shadow, and a shadow does not emit.

**The halo is still light, not paint.** The brief tells the artist to paint no
glow and no halo because D.2's chain keys on `amber-glow` alone. The engine's half
of that bargain is a second mesh over the same box, on `BLOOM_LAYER` only, wearing
`emissiveKeyMaterial` — the same shader the unit sheets use, which discards every
texel that is not one of §2's three bloom-eligible colours. No mask texture and no
threshold: the keying is exact, and it follows the state swap for free, so an
overloading main halos on `overload-100` without a line of extra code.

**Textures are shared, materials are not.** Three paintings per state per object
are cached for the session like a job sheet is; the materials over them are
per-object, because the collapse and severed ramps mutate their colour.
