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

### A.9 Still outstanding (sprites)

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
2. **Face.** The head reads as a face at 13px: you can find the eyes without
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

### C.3 The face standard at 13px

The head box is 13 rows (Appendix A.1). It is spent like this, and this is the
single most load-bearing paragraph in the appendix — a Greyfall unit without a
readable head is not shipping:

| Head rows | Contents |
|---|---|
| 0–1 | crown taper (6px, then 8px wide) — hair or helmet mass only |
| 2–5 | hair mass / helmet dome. Carries the hair light streak on the **left** |
| 6 | brow shelf: a 1px line of the skin shadow step across the forehead |
| 7 | **the eye row** |
| 8–10 | cheeks, nose shade, mouth line |
| 11 | chin (8px wide) |
| 12 | jaw shadow / neck (6px wide), meeting the shoulders |

**Eyes.** Two 1px dots in the skin's **line** step (`umber-900`), on head row 7,
separated by **2–3 px of base skin**, never adjacent to the silhouette outline
and never stacked 2 rows tall. That is the whole treatment: FFT's eyes are dots
and they work because the *hair mass* and the *skin triangle* around them carry
the read. A second row of eye pixels turns a face into a skull.

**The skin/hair split.** Hair is a solid mass occupying head rows 0–5 plus the
two outer columns down to row 10 (sideburns / hair fall). Skin is the triangle
left over: widest at rows 7–8, tapering into the chin. In a three-quarter view
the split is **asymmetric** — the far side (right, the shadow side) carries one
extra column of hair, which is what makes the head read as turned rather than
frontal. Total skin should be roughly 40–55% of the head box; a face that is
mostly skin reads as a bald bust, and one that is mostly hair reads as a hood.

**Helmeted jobs substitute a visor read.** The Enforcer has no face; a closed
riot helm that showed one would be wrong. In its place:

- a **visor slit**: a horizontal band 1–2 rows tall on head rows 6–7, in the
  plate line step (`soot-800`), spanning at least 5px — this is the *anchor of
  the read*, and it sits where the eyes would have been so the head still
  reads as a head;
- a **gleam**: a 2px `soot-100` cluster at the slit's left (lit) end — this is
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

**Deliver, per job:** two PNGs — `<job>-se.png` and `<job>-ne.png` — each a
**32 × 48** master of the **idle, frame 0** pose. That is all. The other 27
frames per view are derived (C.8.4).

#### C.8.1 What a master must satisfy

| # | Requirement | Where it comes from |
|---|---|---|
| 1 | **32 × 48 canvas**, alpha strictly 0 or 255 — no partial alpha, no anti-aliasing | §3 |
| 2 | **Feet on the anchor**: the lowest occupied row of the figure box is **row 43**, and the figure is drawn symmetric about the x = 16 seam | §3, A.1 |
| 3 | **Rows 44–47 empty** except a `soot-900` contact shadow; nothing else in the sub-floor band | A.3 |
| 4 | **Column 0, column 31 and row 0 empty** — the outer ring is the outline's | A.2 |
| 5 | **3-heads proportions**: 13px head, shoulders at row 17, hips at row 29, feet at rows 41–43 | A.1 |
| 6 | **Palette**: every color a §2 value, or close enough that quantization is unambiguous (C.8.2) | §2, §3 |
| 7 | **≤ 12 colors + 2 tint indices** after quantization | §3 |
| 8 | **Closed 1px `soot-900` silhouette outline**; interior separation uses the local ramp's darkest step, never `soot-900` | §3 |
| 9 | **Emissive elements unoutlined** — amber/overload/vein-glass bleed into a halo instead | §3 |
| 10 | **Amber ≤ 5%** of the canvas (≤ 76 px), every amber pixel sourced in-frame | §2 |
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
at the waist, a maul head above the shoulder line — must be declared as a
`prop` region, which is cut **first** and therefore never torn in half. A prop
region is a rectangle in master coordinates plus the joint it rides; measure it
off the master, not off the rig.

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
read at 13px is not proportion, it is a handful of *hand-placed* pixels whose
positions no formula produces.

**The rule that prevents it.** C.3 is not advisory. The head is a **stamp** — a
literal, hand-authored index grid — and it must contain, at minimum: two
line-step eye dots on head row 7 with 2–3px of base skin between them, a hair
mass with a light streak on the key-light side, a brow shelf, and an asymmetric
hair/skin split. A head that cannot name those five features is not finished. If
the job is helmeted, the visor substitute of C.3 applies and carries the same
burden — including the gleam, which is the difference between a visor and a
hole. **Test:** the eye row of every `se` master must contain at least two
line-step pixels inside the skin region.

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
