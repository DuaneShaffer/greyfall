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

1. **Amber is scarce.** No more than ~5% of any frame's pixels may be from the
   amber ramp, and every amber pixel must have an in-fiction source in the
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

Panels are flat fills with a 1px `ui.edge` border and a 1px `ui.ink` drop
line — no gradients, no rounded corners, no shadows with blur. The UI is a
printed form from a standards bureau, not a glass surface.

## 3. Sprite spec

### Canvas and density

| Constant | Value |
|---|---|
| Sprite canvas | **32 × 48 px** |
| Anchor (feet center) | **(16, 44)** |
| Figure box | rows 0–43 |
| Sub-floor band | rows 44–47 (ground contact, dust, slope tilt) |
| Tile top texture | **32 × 32 px** |
| Pixels per world tile edge | **32** |
| Pixels per height step | **16** (one height step = half a tile) |
| Billboard quad in world units | 1.0 wide × 1.5 tall |

**Why 32×48.** The bible fixes FFT-register chunky proportions at ≈3 heads
tall. A 13px head in a ~40px standing figure is exactly 3 heads with the
top-heavy read FFT gets; the remaining 4 rows of the figure box are headroom
for helmets, hats, and the 1–2px vertical bob of idle and jump poses without
ever clipping the canvas. 32 wide (rather than 24) buys the shoulder span an
Enforcer's shield and an Augmented's graft arm need, and keeps a Conduit's
staff and a Railrunner's hook inside the quad. Both dimensions are powers-of-two
multiples that tile cleanly into atlases (32 = tile size, 48 = 1.5 tiles), so a
unit is exactly 1 tile wide and 3 height steps tall in world space — the sprite
and the terrain share one ruler.

The anchor sits at (16, 44), not (16, 47): x=16 is the seam at the exact
horizontal center of an even-width canvas, and figures are drawn symmetric
about that seam. The 4 rows below the anchor are the sub-floor band, reserved
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

Derivation (implemented as `resolveFacing` in `src/art/sprites.ts`), with
facing index north=0, east=1, south=2, west=3 and camera yaw index c:

```
m = (facingIndex - cameraYaw + 4) % 4
m = 0 → back-left    m = 1 → front-left
m = 2 → front-right  m = 3 → back-right
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

Sheet = 8 × 32 = **256 px wide**, 12 × 48 = **576 px tall**. 28 drawn frames
per view, 56 per job.

### Portraits

**Register decision: painted, not pixel.** Committed. Portraits are the one
place the game speaks in the Arcane-adjacent register the bible cites — visible
ink edges, hard-shaped shadows, gouache flatness, no rendering polish and no
soft airbrush. The contrast is deliberate: the *record* of a person is painted;
the person on the battlefield is 32 pixels wide. It also decouples the biggest
character-art cost from the sprite pipeline.

| Constant | Value |
|---|---|
| Portrait master | **128 × 160** (4:5) |
| Crop | shoulders-up; eyeline at 38% from top; head occupies the upper ~60% |
| Facing | three-quarter toward **viewer-right** (toward the text) |
| Chip crop | source rect (32, 16, 64, 64), downscaled 2:1 → **32 × 32** |

The chip is the head-only derivative used in the turn-order bar and unit lists;
32×32 matches the tile texture size and the sprite width, so chips atlas with
everything else.

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
| **destroyed** | silhouette collapses to a `soot-900`/`soot-700` rubble form of roughly half the original height; seams go `umber-900` dead; persistent 3-frame soot plume at 20 ticks |

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
"MISS" in `soot-300`, no outline — misses should be quiet.

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

Placeholders honor the real spec exactly — same 32×48 canvas, same anchor, same
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
line at `SPRITE_ANCHOR.y`. Landmarks, in `up`:

| Landmark | up | Rows (canvas) |
|---|---|---|
| feet / boot | 1–3 | 41–43 |
| knees | ~8 | ~36 |
| hips | 15 | 29 |
| shoulders | 27 | 17 |
| head box | 28–40 (13 rows) | 4–16 |

40 rows of figure with a 13px head is §3's "3 heads tall, top-heavy". Rows 0–3
stay free for helmets, hoods, and the idle bob.

### A.2 The 1px outline ring

The outer 1px ring of the canvas (column 0, column 31, row 0) is reserved for
the silhouette outline: the rig clears any body pixel that lands there. Held
props clamp to `PROP_REACH` (|dx| ≤ 11, up ∈ [1, 41]), head centers to |dx| ≤ 8,
and shoulder joints to |dx| ≤ 11 — so the closed outline of §3 is structurally
guaranteed rather than checked by eye.

### A.3 Sub-floor band contents

Rows 44–45 carry a 2-row `soot-900` contact shadow sized to the foot spread;
rows 46–47 are unused for now (reserved for slope offset and kicked dust). No
outline is drawn below the ground line — a standing figure meets the tile, and
an outline under the feet would read as a float.

### A.4 Hurt frame 0 is a silhouette flash

`hurt` frame 0 replaces every interior color — team tint included — with
`soot-100`, keeping only the outline and any emissive element. One frame, 4
ticks. It is the only frame in the pipeline without visible team tint.

### A.5 Cast hold loop pulses

§4 fixes frames 2–3 of `cast` as the hold loop. The two frames differ by a 1px
torso bob and one step of emissive growth, so a charged action waiting on the
CT timeline reads as a pulse, not a freeze. Emissive growth is capped at +2px
of radius; with that cap the worst frame in the roster spends 50 of 1536 pixels
on the amber ramp (3.3%), inside the ~5% budget of §2.

### A.6 Team tint mask, in two parts

The 5–12% tint mask is split so job gear can never bury allegiance:

- a **chest band** (`shoulderW - 4` wide, 2 rows of base + 1 of shadow) drawn
  with the torso, under whatever the job wears;
- **pauldron trim** (3×2 base + 3×1 shadow at each shoulder) drawn last, over
  all gear.

Measured across the roster this lands at 6–8% of body pixels.

### A.7 Facing indicator

The wedge stays. Two of the four apparent views differ from the other two only
by mirroring, and at 32px that difference is real but not fast enough to base a
targeting decision on. The wedge is the tactical readout; the art carries the
character. Revisit when facing gains a mechanical cost.

### A.8 Preview

`src/art/preview.html` (vite input `spritePreview`, dev URL
`/src/art/preview.html`) renders every job × state × view × frame, the assembled
sheets, and live playback with the real tick tables. Dev-only; the game does not
import it.

### A.9 Still outstanding

Portraits remain the open character-art workstream: §4 commits them to painted,
which this pipeline cannot express. The placeholder blocks stand.
