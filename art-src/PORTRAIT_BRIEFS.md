# Generator briefs — the painted portraits

Thirteen faces: the seven of Rowen's company, and the six named people the
Foundry Chapter puts on screen. This is the last character-art workstream
`docs/ART_DIRECTION.md` A.9 lists as open, and the only one that is not pixel
art.

Read `docs/ART_DIRECTION.md` §4 (portraits — the register decision, the crop,
the chip) and §2 (palette) first, then `docs/CREATIVE_BIBLE.md` §12 and
`docs/STORY_BIBLE.md` for who these people are. Every number below comes from
§4 and §2 and is binding; where a brief and §4 disagree, §4 wins. Where a brief
and the story bible disagree, the story bible wins.

## Why this set is not the sprite set

The field sprites and the portraits are two registers of the same cast, and the
split is deliberate. A Greyfall unit is 64 px wide with a 26 px head; the face
standard for it (Appendix C.3) is two eye dots and a hair mass, and four of the
seven jobs cover the face outright — the Enforcer has a closed visor, the
Saboteur has a hood with one glint in it, the Chemist has a respirator, the
Railrunner has goggles. **The field sprite deliberately cannot carry a face.**
Identity there lives in the silhouette and in one identifying feature above the
shoulders.

The portrait is where the person is. It is painted, not pixel; it is the only
image of this character that has eyes, an age, and an expression; and it is the
one place the game speaks in the Arcane-adjacent register the bible cites. §4
puts the reason plainly: *the record of a person is painted; the person on the
battlefield is 64 pixels wide.*

Two consequences the briefs below act on:

1. **The sprite's identifying feature is usually gone.** Ivo's whip antenna and
   Della's coat tail are behind or below a bust crop. Each brief names the
   portrait's own anchor — the thing that says who this is at 32 px in the
   turn-order chip.
2. **What the sprite hides, the portrait may open.** Rowen's helm comes off.
   Marek's hood goes back. Jory's respirator hangs at her throat. That is the
   register earning its cost, and it is stated per character because it is not
   a free choice: Dray's visor stays up but his helm stays on, and the
   difference between him and Rowen in Chapter 1 is exactly that.

`art-src/vale/vale_character_sheet.png` remains the family reference for
costume, materials and worn-ness. It is not the reference for rendering: the
sheet is painted with anime-adjacent polish and the portrait register is
flatter and harder-edged than that. Translate it, do not copy its finish.

## The set

| # | `portraitId` | Name | Job / role | Wave |
|---|---|---|---|---|
| 1 | `rowen` | Rowen Corvane | Enforcer — the protagonist | 1 |
| 2 | `vale` | Vale Tarn | Conduit | 1 |
| 3 | `ivo-brace` | Ivo Brace | Machinist | 1 |
| 4 | `marek-sump` | Marek Sump | Saboteur | 1 |
| 5 | `jory-slate` | Jory Slate | Chemist | 1 |
| 6 | `orin-vane` | Orin Vane | Augmented | 1 |
| 7 | `della-tine` | Della Tine | Railrunner | 1 |
| 8 | `aldric` | Aldric Corvane | Master of the Watch | 2 |
| 9 | `dray` | Sergeant Dray | The Watch Sergeant of e1–e5 | 2 |
| 10 | `maren-voss` | Maren Voss | Combine steward | 2 |
| 11 | `quill` | Prelate-Assayer Quill | The Assay's observer | 2 |
| 12 | `nessa-kiln` | Nessa Kiln | Conduit — the overload's engineer | 2 |
| 13 | `wick` | Wick | Saboteur — the cell's demolition man | 2 |

Wave 1 is the roster the player commands for five battles and reads in every
menu; wave 2 is the cast that speaks. Wave 3 (second expressions) is listed at
the end and is deliberately not commissioned yet.

**Content follow-ups this set implies**, recorded here and not done in this
pass:

1. `data/units/maren-voss.json`, `data/units/quill.json` and
   `data/units/watch-sergeant.json` carry no `portraitId` — they need
   `maren-voss`, `quill` and `dray` respectively, and these briefs are written
   for those names. The sergeant's unit id stays `watch-sergeant` (it is a
   roster slot); the portrait is Dray's, because canon ruling 3 says he is one
   man.
2. **Vale's pronoun is unsettled and this file does not settle it.**
   `docs/CONTENT_NOTES.md` §8 refers to Vale as *her* in a balance aside; the
   owner's canon character sheet, which the creative brief names as binding for
   face and costume, plainly reads as a young man. The portrait follows the
   sheet, because the sheet is the design. Someone with story authority should
   reconcile the two — it is a one-word fix in whichever direction they choose,
   and it is not an art decision.
3. Not in this set, and named so nobody has to rediscover them: **Perren Ash**
   (whose death is the chapter's hinge and whose son narrates the campaign),
   and the Meter House skirmish's three — **Nella Fen**, **Bram Coil**, **Orla
   Pike**. All four speak and none has a `portraitId`. If the dialogue system
   ever wants a face on those lines, they are a wave 4.

## Delivery resolution: 4×, on the same ruler as everything else

The in-game portrait is **128 × 160** (§4) and stays 128 × 160. Deliver masters
at **4×** — **512 × 640** — exactly as sprites (256×384 → 64×96) and tiles
(128×128 → 32×32) do.

| Asset | In game | **Deliver** |
|---|---|---|
| Portrait | 128 × 160 | **512 × 640** |
| Head chip | 32 × 32 (cut from the portrait) | — derived, never drawn separately |

**Why 4× and not 8×, and not 1:1.** The same argument C.8 makes for sprites,
with one addition. Painting at 1:1 means hand-placing a face in a 128 px box
and losing every edge that a brush actually made; painting at 8× fills the
canvas with grain that has no representation after the reduction — it does not
become detail, it becomes sparkle. 4:1 is the ratio the reducer, the review
habit and the acceptance numbers already use across the whole project. One
ratio, one reducer, one mental model.

**The shipped texture is 2×** (256 × 320), matching the sprite sheet's habit of
shipping at 2× the master spec with mips, so a portrait stays crisp if the
dialogue box ever renders larger than 128 px. That is a downstream derivation,
not a delivery: nobody paints it.

**The chip is a crop, not an asset.** §4 cuts (32, 16, 64, 64) out of the
128×160 and halves it to 32×32 for the turn-order bar and unit lists. In master
terms that is **(128, 64, 256, 256)**. Everything that identifies the character
must fall inside that square. A portrait whose read lives in a collar badge at
the bottom of the frame is a portrait with no chip.

## Framing, locked across the cast

The dialogue box shows one portrait at a time but the player sees all thirteen
in a session, and a set whose eye-lines wander reads as thirteen different
games. These numbers are not per-character judgement calls.

| Landmark | In the 512 × 640 master | Why |
|---|---|---|
| Eye-line | **y = 243 ± 6** (38% of height, §4) | the fixed row the reader's eye finds |
| Crown of the skull | y = 90–110 | leaves headroom above for helms, hoods, antennae |
| Chin | y = 384–400 | head occupies the upper ~60% (§4) |
| Head mass, horizontal | centred on **x = 256 ± 24** | so the chip crop contains the whole face |
| Shoulder line enters | y ≈ 490–520, running off both edges | shoulders-up crop; the frame cuts them |
| Turn | three-quarter toward **viewer-right** | toward the text (§4); portraits are never mirrored |

Height above the crown is for hardware, not for hair: a helm, a hood, a raised
goggle strap or an antenna base may occupy it, and the skull may not float up
into it. Two people of different heights get the same eye-line — this is a
record plate, not a group photo. Build is carried by the shoulder span and the
neck, which is exactly where it shows anyway.

**The clipped corner.** The UI clips a filing-card corner off the top-right of
the portrait slot (`.gf-portrait`, a 6 px diagonal at 128 px — roughly a 24 px
triangle in the master). Nothing identifying goes in the top-right corner.

**Facing, once more, because it is the easy mistake.** The field sprites are
drawn facing screen-*left*. The portraits face screen-*right*. Both are correct:
the sprite faces into the map, the portrait faces into the text. They are never
seen in the same frame.

## Background: painted, opaque, and flat

**Decision: an opaque painted ground, full bleed, plus a separate figure
matte.** Not alpha.

The dialogue slot (`src/ui/battle/dialogue.ts` → `portrait()` in
`src/ui/dom.ts`, styled in `src/ui/styles.css`) composites the portrait into a
filled card: `--gf-plate` ground, a 1 px team-tint rim, an inset `ink` line and
a clipped corner. A transparent bust dropped into that reads as a sticker on a
form — the alpha edge lands on flat UI panel colour with nothing behind it, and
the head chip, which is cut out of the middle of the head, would carry alpha
holes into an atlas that has none. A painted ground also gives the register its
whole premise: this is a plate in a file, and a plate has paper behind it.

What the ground is: **two values, flat, no scene.** No room, no props, no
machinery, no smoke, no depth cue beyond a single soft-hard division where the
figure's shadow side meets the ground. The character is the subject; the
backdrop is the value the head has to separate from, and nothing else.

Three ground registers, by where the character stands in the vertical city
(§1's light-quality table). **This is the only per-character variation, and it
is in the ground, never in the key:**

| Register | Ground values | Who |
|---|---|---|
| The Works | `#2b333d` over `#171c22` | the company, Maren, Dray, Nessa |
| The Charter Rise | `#4a545f` over `#2b333d`, cleaner and one step lighter | Aldric, Quill |
| The Underveins | `#0b0d10` over `#171c22`, with at most one cold `#1e4640` breath at the edge | Marek, Wick |

The Underveins ground is the only place a cool green cast is permitted, and it
stays in the ground: vein-glass is subterranean (§2 rule 4) and it never
touches skin.

**Also deliver a matte** — the same 512 × 640 with the figure solid white on
solid black, hard-edged, no anti-aliasing. It costs one export and it means the
UI can re-tint or replace the ground later (team state, chapter state, a
"deceased" treatment for the Inquiry screens) without re-commissioning art.

## Lighting: one key, and it is the sprites' key

**One key light, from the upper viewer-right, about 35° above the eye-line,
hard, colourless.** It does not move between characters, it does not move
between waves, and no character gets a hero light.

That is the same light Appendix C.1 fixes on the sprites — upper-left,
slightly front, hard, colourless — mirrored because the framing is mirrored.
The sprite faces screen-left and is lit from screen-left; the portrait faces
screen-right and is lit from screen-right. In both registers the key lands on
the planes the face is turned toward, and the shadow falls on the near cheek
and the jaw. One world, one sun, two crops.

The look of it, concretely:

- **The shadow is one shape.** Near cheek, jaw underside and the near side of
  the neck are a single connected hard-edged mass, not a gradient and not three
  separate patches. Gouache flatness (§4) means the terminator is drawn, not
  blended.
- **Fill from viewer-left**, dim and cool, one step up from the darkest value.
  It exists so the shadow side is not a hole. It is not a second key and it
  never crosses the terminator.
- **No rim light.** No backlight, no hair halo, no atmospheric separation. The
  figure separates from the ground by value, the way a printed plate does.
- **Colour temperature: ash.** The key is the Works' daylight through soot —
  colourless, slightly cold. It never carries warmth. Warmth in this world is
  flux, and flux has a source or it is a bug.

## Amber, per character

§2's scarcity rule is binding here and it bites harder than it does on a map: a
bust contains no machinery, so there is almost never anything in frame that
could licence a warm pixel. The ceiling is §2's 4%; portraits spend **at most
3%**, and only where the character's own kit puts a live flux source inside the
crop.

| Character | Flux light in frame | Source |
|---|---|---|
| Rowen | **none** | her one amber element is the maul head, out of frame — and that is right |
| Vale | yes, small | the cell-lantern on his chest harness: a low warm under the jaw and the scarf |
| Ivo | yes, tiny | the spare cell's window on his pack strap (`accessory: spare-cell`) |
| Orin | yes, the most in the set | the graft seam at his neck — a **line**, not a lamp, lighting the jaw from below |
| Nessa | yes, small | a live amber reflection in the assay visor's lens, and a low warm on the jaw |
| Quill | yes, one spark | one metered catchlight in the visor lens — the Rise's "one seam per object" |
| Marek | **none — the strictest zero in the set** | a saboteur carries nothing that glows; his kit is chemical fuse |
| Jory, Della, Aldric, Dray, Maren, Wick | **none** | — |

Rules that hold for all five who have it: amber is a source and its immediate
throw, never an ambient wash, never a tint on skin away from the source, never
a rim. It is `#8c5411` / `#d98a1b` / `#f3b94a` with `#ffe7a8` only in the
emissive core, and it has no shadow step — a light source with a shadow on it
is a contradiction (C.1).

**Brightblood** (`#ff9db1`) belongs to exactly two people in this set — **Orin
and Maren, and nobody else, including the conduits.** It is scarring that
happens to be luminous, not a glow: crisp edges, no halo, no bloom. It marks
people, not things (§2 rule 6). Orin's has spread and is part of his silhouette;
Maren's is three fine lines at the collarbone and is a plant. Giving it to a
third face would spend both.

## Expression: one neutral-in-character master each

**Commission one expression per character, and it is not "neutral."** A blank
face is not a baseline, it is an absence, and it makes every line the character
says read slightly wrong. The baseline is *this person at rest, in the situation
the chapter puts them in* — Maren tired, Dray incurious, Wick calculating —
held level enough that it can sit under any line they speak in Chapter 1.

The test, per character: put the character's hardest shipped line under the
master and read it. If the face makes the line into a boast, an apology or a
joke, the master is wrong. Every brief below ends with that line, quoted from
the shipped encounters — **Line test**. Five of the seven company members
(Vale, Ivo, Della, Marek, Orin) have no shipped dialogue at all; their entry
gives the authored clause that stands in for one, and for them the portrait is
not illustrating a characterisation, it is *setting* one, which is a heavier
job and worth knowing about going in.

Second expressions are wave 3 and are listed at the end. They are deferred on
purpose: a set of thirteen consistent baselines is worth more than a set of six
characters with two moods each, and the dialogue system does not yet select an
expression (`DialogueLine` carries `portraitId`, not a mood).

---

## SHARED SPEC (paste with every brief)

Two substitutions when you send it: replace `<GROUND>` with the character's two
hex values from the ground-register table above, and `<AMBER>` with their row
from the amber table — the words *NO AMBER ANYWHERE* if they have none.

```
PAINTED PORTRAIT BRIEF — one character portrait for "Greyfall"

THE GAME: A tactics RPG in the style of Final Fantasy Tactics with an HD-2D
look — 3D terrain, 2D pixel-art sprites billboarded on top. Industrial
fantasy: magic is an industrial resource ("flux"), refined and piped like
electricity, glowing warm amber. A soot-stained factory city under ash-grey
skies, in the first century of its magical industrial revolution. Tone:
grounded, dry, unsentimental. Working people, not heroes.

WHAT THIS IS: the painted portrait that appears beside the dialogue box when
this character speaks, and is cropped to a 32x32 head chip in the turn-order
bar. It is the ONLY place this character has a face — on the battlefield they
are a 64-pixel-wide pixel sprite whose head is 26 pixels and whose eyes are
two dots. Everything about who this person is lives in this image.

STYLE: PAINTED, NOT PIXEL ART. Visible brush and ink edges, hard-shaped
shadows, gouache flatness, a limited palette held flat. NO airbrush, NO soft
gradients, NO bloom or glow, NO photo-real rendering, NO cel-shine, NO lens
flare, NO rim-light halo, NO speedpaint smear. The reference feeling: a plate
in an official record — someone painted this person once, from life, in a
hurry, and it went in a file.

TECHNICAL (hard constraints):
- ONE image, 512 x 640 (4:5). This reduces 4:1 to the in-game 128 x 160 —
  draw for that, not for the canvas.
- OPAQUE, full bleed. Painted ground to all four edges. No transparency, no
  drop shadow, no border, no vignette, no scene: the ground is TWO FLAT
  VALUES — <GROUND> — and nothing else. No room, no machinery, no smoke, no
  props behind the figure.
- NO FRAME, NO NAME PLATE, NO JOB ICON, NO ORNAMENT, NO SIGNATURE, NO TEXT
  OF ANY KIND. The game draws the card, the rim, the name and the team
  colour around this image; anything painted here fights it. Keep the
  top-right corner clear — the UI clips a diagonal off it.
- FRAMING, identical for every character in the cast:
  * Shoulders-up bust. The bottom edge cuts the shoulders.
  * Three-quarter turn toward the VIEWER'S RIGHT (the character looks toward
    the text). Never frontal, never profile, never turned left.
  * EYE-LINE at y = 243 (+/- 6). Crown of the skull at y = 90-110. Chin at
    y = 384-400. Head mass centred on x = 256 (+/- 24). Shoulders enter the
    frame around y = 500 and run off both sides.
  * The head chip is cut from the square (128, 64, 256, 256). Everything
    that identifies this person must sit inside it.
- LIGHTING, identical for every character in the cast: ONE key light from
  the UPPER VIEWER-RIGHT, ~35 degrees above the eye-line, hard, colourless
  ash-grey daylight through soot. It lights the planes the face is turned
  toward. The shadow is ONE connected hard-edged shape across the near
  cheek, jaw and neck — drawn, not blended. Dim cool fill from viewer-left,
  one step up from the darkest value, never crossing the terminator. NO rim
  light, NO backlight, NO second key unless the brief grants a flux source.
- VALUES: three flat steps per form plus a darkest line step for separation.
  Blend within a step if you must; never blend across one.
- COLOUR: every hue must have an ancestor in the palette below. You may
  interpolate BETWEEN listed steps; you may not introduce a hue outside
  these families. SKIN USES THE SKIN RAMP — not the metal ramp (rusted) and
  not the grey ramp (dead).
- AMBER (warm flux light) in this portrait: <AMBER>. At most 3% of the
  image, only from that source, and only as that source plus its immediate
  throw. Amber is never ambient, never a wash on skin away from its source,
  never a rim light. Where the answer is NO AMBER ANYWHERE, one warm pixel
  is a bug.
- ALSO deliver: (a) a flat palette strip as a separate row of solid N x N
  swatches, no gradients, of the colours actually used; (b) a MATTE — the
  same 512 x 640 with the figure solid white on solid black, hard-edged,
  no anti-aliasing.

THE PALETTE (hue anchors; interpolation between steps is allowed):
skin    #8b7156 #b99b7a #ddc6a8
cool    #0b0d10 #171c22 #2b333d #4a545f #78828e #b3bcc5
warm    #150e09 #2c1d12 #4e3320 #7a5230
metal   #6b3a1e #a5622f #c98a4b
patina  #1e4640 #2f7a6c #63b49e
flux    #4a2a06 #8c5411 #d98a1b #f3b94a #ffe7a8   (only if granted below)
scarring #ff9db1                                  (only if granted below)
```

---

## Wave 1 — the company

### 1. ROWEN CORVANE — Enforcer (`rowen`)

**Who.** Youngest of House Corvane, newly commissioned ensign in her brother's
House Watch, and the story's heart. Over five battles she learns the violence
she was sent to suppress was bought and paid for through her own family's
channels, and at the end of the chapter she deserts and the record kills her
off. This portrait is her at the *start* of that.

**Face and build.** Nineteen or twenty, and she must look it — the youngest
face in the cast by a clear margin. House-born: fed, straight-nosed, teeth
that were seen to. Not delicate: a soldier's neck and shoulders that a shoulder span the
drill built. Dark hair cut short enough to live under a helmet, and
**flattened at the temples where the liner sits** — she has just taken the helm
off, and the portrait should know it. Same jaw and brow as Aldric (see #8);
the family resemblance is load-bearing, because on the Charterhouse Steps the
player has to see the brother in the sister.

**Costume.** Watch issue, and **deliberately incomplete**: `data/units/rowen.json`
gives her a shock maul and no armour at all, which `docs/CONTENT_NOTES.md` §8
calls out as reading like a new commission on a picket line. Paint that. The
Watch coat, buttoned, with a light plain gorget at the throat and the heavy
riot cuirass conspicuously *absent* — where Aldric (#8) is turned out complete
and correct, she is a young officer wearing most of a uniform. Sooted steel, no
heraldry beyond a small stamped house mark. **The helm is off** and not in
frame. Her chip-size anchor is that collar line plus the helmet-flattened hair.

**The read.** *The person who stands at the front and takes it* — and, in the
face, the person who is still listening. Chin level, mouth closed and level,
brow unfurrowed, eyes direct and steady. She believes the institution she is
wearing. She is not angry yet, not hard yet, not sad. She is a young officer
being told something she is going to have to answer for, and she is not looking
away from it.

**Amber.** None. The protagonist's portrait is the greyest in the set, and that
is the point: she carries no light of her own until she takes one.

**Avoid.** Generic fantasy knight — no gold filigree, no crest, no cloak, no
sword, no chin-up heroic angle, no wind. The Watch is a freight company's riot
police, not chivalry. Avoid a veteran's face (she is a cadet), avoid a scar,
avoid a beauty pass — no glossy lips, no lash rendering, no soft focus. Avoid
the visor down; that is the sprite's job and doing it here wastes the only face
she gets.

**Line test.** *"Sergeant. Log the name."*

### 2. VALE TARN — Conduit (`vale`)

**Who.** A licensed attuned — the Assay examined him, measured him and issued a
paper saying he is permitted to be what he is. In Chapter 2 the same office
voids it in a routine schedule. He is the company's only member whose
profession is a licence. (On the pronoun, see follow-up 2 above: the portrait
follows the canon sheet.)

**Face and build.** **`art-src/vale/vale_character_sheet.png` is canon.** Match
the inset head at the sheet's top right: early twenties, dark brown hair in a
heavy unruly mass, fine-boned face, grey-green eyes, no facial hair. Match the
costume exactly — brass-rimmed goggles worn UP on the forehead with the green
lens, the teal scarf wound at the throat, the slate-blue coat with the pale
turned collar and lining, the leather harness straps across the chest with the
small amber cell-lantern on them.

**What to change.** Only the register and the angle. The sheet is rendered with
anime-adjacent polish — glossy highlights, soft blending, lit from the figure's
own side. Repaint it flat: hard shadow shapes, visible edges, three steps of
skin, no shine on the hair. And re-pose it to the cast's framing — three-quarter
toward viewer-right, the shared key from upper viewer-right. Do not redesign
anything. Do not "improve" the coat.

**The read.** Competence on a permit. He is good at this, he knows he is, and
every bit of what he does is legal because a bureau says so — which is a thing
he has never had cause to examine and is about to. Slightly wry, faintly
impatient, entirely unbothered: the only member of the company who thinks this
is going to be fine. One supporting note from the data, worth a beat in the
face: unlike Nessa and the Watch's own conduits he wears **no assay visor** —
his licence is a paper he carries, not a badge he wears, which is exactly why
losing it costs him everything and warns him about nothing.

**Amber.** The chest lantern, and only it. Its throw is a low warm edge under
the jaw and along the underside of the scarf — from *below*, because the source
is below. The staff head is out of frame.

**Avoid.** Redesigning a canon character. Drifting the teal toward blue or the
coat toward black. Wizard signals of any kind — no runes, no sigils, no
arcane glow in the eyes; he is a technician. And do not copy the sheet's
rendering: a smooth airbrushed Vale next to twelve flat portraits breaks the
set, and the set is what this file exists to protect.

**Line test.** No shipped dialogue. Stand-in: *the licensed body outlawed by
paperwork* — Chapter 2 voids his licence in the same routine schedule that
strips Nessa Kiln, and neither of them is in the room when it happens.

### 3. IVO BRACE — Machinist (`ivo-brace`)

**Who.** The company's engineer: sentry frames, tripwire charges, skitter
drones, and everyone else's tools. He keeps the gang's kit. In Chapter 5 he
holds the Meter Floors so the rest go up, and does not come back — the campaign's
one scripted named death, and it lands because of how ordinary this face is.

**Face and build.** Late thirties to forties. Thick through the neck and
shoulders, a bench worker's build gone slightly soft. Cropped greying hair, a
few days of stubble, and the permanent narrow squint of a man who does close
work in bad light. Burn pocks on the backs of the hands (if a hand enters the
frame) and one on the jaw. A face that has never been photographed and would
not know what to do about it.

**Costume.** Per his field-sprite brief: canvas coat over a chest harness with
tool loops, heavy gloves. The pack is behind him and its whip antenna is out of
a bust crop, so the portrait substitutes its own anchor: **the pack's shoulder
strap crossing the chest, carrying the spare flux cell his unit sheet gives
him** (`accessory: spare-cell`), plus a watchmaker's loupe pushed up on the
brow. One hand may enter the bottom edge holding a single small part — a
coupling, a fuse carrier — provided it does not cross the chin.

**The read.** The man who keeps other people's things working. Attentive,
unhurried, mildly amused; he is listening to the argument and thinking about
the bracket. Plain declaratives is how he talks and the face should match:
nothing withheld, nothing performed.

**Amber.** The spare cell's window on the strap. Tiny, crisp-edged, no halo, and
its throw reaches nothing.

**Avoid.** The jolly tinker — no grin, no goggles-and-grease comedy, no gadget
clutter. One part in the hand, not a costume of tools. Avoid the wise old
mentor with a white beard: he is not old, he is *worn*, and he is going to die
on a stair for people he likes.

**Line test.** No shipped dialogue. Stand-in: *Ivo keeps the gang's tools* —
and, four chapters on, asks Della for her spare charges, says the stair will
hold, and makes no speech about it.

### 4. MAREK SUMP — Saboteur (`marek-sump`)

**Who.** Demolition. He knows the Row — which streets, which neighbours, which
gas main runs under which floor — and that knowledge is the entire reason he
is worth having. He never abstracts; he cites prices and names.

**Face and build.** Thirties or forties, wiry, Underveins-born. Dark hair cut
by someone in a kitchen. Powder-burn stipple across one cheekbone, one eyebrow
half missing and grown back wrong, lashes singed short on that side. Soot in
the creases at the eyes and knuckles that no washing has ever fully taken out.
The face under it is unremarkable and, at rest, mild — which is worse, because
of what he does for a living.

**Costume.** Per his field-sprite brief, with the one change the register buys:
**the work-hood is BACK**, pushed off onto the shoulders, and its cowl gathered
at the neck is his chip-size anchor. Canvas coat, a fuse-cord spool strap over
one shoulder, no shine anywhere. Everything he wears is chemical and mechanical.

**The read.** The sprite makes him a void with a glint in it; the portrait's job
is to give the void a neighbour's face. He is the one who counts who lives on
the street before he counts the charge. Steady, tired, entirely unromantic
about the work — and, per his sheet, the **lowest Resolve in the party**: nerve
for wiring, not for standing. Put that in the face. He is not brave and he does
not pretend to be; he is the man who will cross condemned grating at height
four because he has crawled over enough of it to know which of it holds, and
who would rather not be shot at while he does.

**Amber.** **None, and this is the strictest zero in the set.** No lamp, no
cell, no reflection, no warm bounce, nothing. A saboteur carries nothing that
glows. If a reviewer can find one warm pixel on Marek, reject the master.

**Avoid.** The hooded assassin — no shadowed void where the face should be, no
menace, no blade. Avoid the grinning pyromaniac; avoid a "dangerous" squint.
His ground is the Underveins register, which is dark enough already; do not let
the darkness do his characterisation for him.

**Line test.** No shipped dialogue. Stand-in, and it is the whole man: *Marek
never abstracts — Row nouns, named neighbours, prices.* Whatever he would say
under this portrait has a street name in it.

### 5. JORY SLATE — Chemist (`jory-slate`)

**Who.** Foundry hand, Rowen's childhood friend, and — twenty years and three
chapters on — the Compact's celebrated reformer, First Steward of a reformed
Council, whose rise is built partly on Rowen's erasure. **She is she/her**
(creative bible §12, canon ruling 4). This portrait is her before any of that:
a hand on the pour, on the wrong side of the kettle lines.

**Face and build.** Mid-twenties. **Foundry-hand build — this is the single
most important physical note in the file.** Broad through the shoulders and
neck, strong jaw, thick forearms, the mass of somebody who moves heavy things
for a living. Hair pulled back hard and tied short, off the face, because a mask
strap goes over it. Spark-burn freckling on the neck and the backs of the hands;
a shine of old scald at one wrist. Dark brows, direct eyes, a mouth that is
holding still on purpose.

**Costume.** Per her field-sprite brief: heavy work coat (never a dress), flask
bandolier across the chest, verdigris-green apron in `#1e4640`/`#2f7a6c` — the
one patch of colour on her. **The respirator hangs at her throat**, unstrapped,
with the strap's pressure line still visible across one cheek. That mask at the
collarbone is her chip anchor.

**The read.** The one who is already thinking about the sentence after this one.
She is measuring the person she is talking to — not coldly, not yet; she is
simply the most articulate person in any room she has been in and has recently
noticed it. The reformer must be *possible* in this face and not yet present:
put the future in the appraisal in her eyes, not in the set of her mouth.

**Amber.** None. Chemistry is verdigris in this palette, not flux.

**Avoid.** The frail medic. No slightness, no white coat, no nurse register, no
clinical cleanliness — her apron is stained and her hands are scarred. Avoid
making her look calculating or ambitious in Chapter 1; the arc is ruined if the
first portrait spoils it. Avoid glamour: no makeup pass, no loose romantic hair.

**Line test.** *"There's no behind on a press line. There's in front of it and
there's in it."* And the harder one, over Perren Ash's body: *"That's Perren
Ash. Thirty years on the pour. He has a wife on Tallow Row and a son in the
yard."* She runs long when she is selling and short when she is honest; in
Chapter 1 she is short, and the portrait is a Chapter 1 portrait.

### 6. ORIN VANE — Augmented (`orin-vane`)

**Who.** A grafted man. One arm and shoulder are flux-driven copper and iron,
fitted to him by somebody who was paid to make it work rather than to make it
last. His grafts ache in the cold, and in Chapter 4 his body starts refusing
them.

**Face and build.** Mid-thirties, and hollowing — the graft draws on him and it
shows first in the face: temples fallen in, jaw muscles standing out because he
holds his head very still. Short hair or shaved on the graft side where the
mount fouls it. Skin values one step cooler than the rest of the cast, but still
on the skin ramp, never on the grey ramp.

**Costume.** Per his field-sprite brief, and with the helm off exactly as
Rowen's is — his unit sheet issues him a riot helm and this is the one image in
the game where it is not on his head. **Asymmetry is the composition.** The
copper-and-iron shoulder rises into the frame on the near side, massive, plated
in `#6b3a1e` with `#c98a4b` on the worked edges, riveted, hand-fitted, with rag
and leather padding where it meets him. The human shoulder sits low and
narrow on the far side, in a plain shirt. **The graft seam runs up under the
jaw** and `#ff9db1` brightblood scarring spreads from where the metal meets the
neck, in crisp veins, no halo. That seam and that asymmetric shoulder are his
chip anchor and they are unmistakable at 32 px.

**The read.** Strength that cost too much — and specifically, a man for whom
this is a normal Tuesday. The horror is not on his face; the horror is that it
isn't. Calm, level, patient. The pain is in the stillness of the head and the
tendon in the neck, not in an expression.

**Amber.** The graft seam: **a line, not a lamp.** `#8c5411` into `#d98a1b`
with an `#f3b94a` core along the seam only. It is the one light in the set that
strikes a face from *below*, catching the jaw underside and the near cheek. Keep
it under 3% and keep it crisp — no bloom, no soft falloff; the engine owns glow
and this image has none.

**Avoid.** Sci-fi chrome. No polished cybernetics, no seams that fit, no glowing
eye, no exposed circuitry. This is worked metal made by a shop, bolted to a
person. Avoid the rage face and the tortured grimace; avoid making the graft
look comfortable, and avoid making it look like a costume — it is attached to
him and the attachment is the ugly part.

**Line test.** No shipped dialogue. Stand-in: *Orin's grafts ache in the cold*
— the first line of his arc, and the whole brief in five words. Every strength
he has is on credit, his own abilities cost him HP to use, and he has the
highest Attunement in the game, which is power and vulnerability in one number.

### 7. DELLA TINE — Railrunner (`della-tine`)

**Who.** A yard runner: rails, freight hooks, lifts, and a top speed nobody
else in the company has. She ends the campaign carrying the lodge book — the
Combine's ledger of its own dead, the counter-record the unions have always
kept. She is the one who keeps names.

**Face and build.** Early twenties, lean, small-framed, all tendon. Hair cropped
or braided tight to the skull. **The yard-worker's mask:** clean skin around
the eyes where the goggles sit and soot everywhere else — the inverse of a
sunburn, and the most specific thing about her face. Chapped lips, wind-reddened
nose bridge, a nick or two on the chin.

**Costume.** Per her field-sprite brief: **brass-rimmed goggles worn UP on the
forehead** — her chip anchor, one pair, scratched, `#a5622f` rim with a
`#1e4640` lens — over the collar of the long split riding coat, with a rag
scarf at the throat pulled down. The coupling hook is out of frame.

**The read.** Someone mid-stride even when standing still. In a bust that
becomes the one composition in the set that is not settled: caught turning back
toward the viewer, chin slightly ahead of the shoulders, as if she stopped for
exactly this long and is about to go. Alert, dry, unimpressed.

**Amber.** None.

**Avoid.** The plucky scrappy mascot — no wink, no smirk, no cocked eyebrow, no
tongue-out energy. Dry, not cute. Avoid steampunk goggle clutter: one pair of
working goggles, not four brass instruments on a strap. Avoid making her look
younger than she is; she is small, not a child.

**Line test.** No shipped dialogue. Stand-in: *Della runs the rails* — and at
the end of the campaign she takes up the lodge book and Ivo's name goes in it.
Plain declaratives, no ornament, and the last person in the company still
keeping a list of the dead.

---

## Wave 2 — the named cast

### 8. ALDRIC CORVANE — Master of the Watch (`aldric`)

**Who.** Rowen's elder brother, the Watch's commanding officer, and the man
waiting one terrace down from the top of his own Charterhouse Steps who —
shown the requisition seals, the paid provocateurs, the engineered overload —
says **"Yes."** He does not deny it, he
explains it, and then he closes the record on his sister: she will not be in the
record; she will be in the refinery.

**Face and build.** Mid-to-late thirties. Rowen's jaw, Rowen's brow, Rowen's
straight nose, with fifteen more years and a Rise upbringing on top: barbered
hair with the first grey at the temple, close-shaved, a permanent shallow line
between the brows. Bigger than her through the chest. **The family resemblance
is a requirement, not a flourish** — the two portraits will be seen inside a
minute of each other and the player must see it without being told.

**Costume.** Watch officer's kit, and he is the only person in the entire set
whose clothes are not worn: the cuirass collar clean, the gorget polished, the
collar of the coat under it done up exactly right. A Master's plain rank mark,
no ornament beyond it — House Corvane's money does not need announcing. Helm not
in frame, ever.

**The read.** A man who has already decided, is not enjoying it, and will not be
moved. Attentive, level, immovable — the expression of somebody being told
something he already knows and has already priced. Not cold, not cruel: he
loves her, which is why he explains it, and the explanation is the cruelty. He
is standing on terrace two rather than at the top of his own steps because *a
man who is not ashamed does not wait to be cornered*, and his order to his own
line is **"I want her heard before she is stopped."** Both of those are in the
face or the face is wrong.

**The confession test (binding on this master).** Put the word **"Yes."** under
the finished portrait and read it. If the face turns it into a boast, it is
wrong. If it turns it into an apology, it is wrong. If it turns it into a
villain's reveal, it is very wrong. It has to read as a fact he is confirming
because lying to her would be beneath the transaction. Then test it again under
the two that follow, and it must not have to change for either:
*"You expected me to lie about paperwork. It is a seam claim, Rowen."* and
*"You will not be in the record, Rowen. You will be in the refinery. It is
already written and filed."*

**Amber.** None. Rise ground register — the cleanest, coolest plate in the set.

**Avoid.** The sneering aristocrat. No smirk, no raised eyebrow, no shadow
across the eyes, no black-and-gold villain palette, no scar. He is a competent
administrator of force who is on the wrong side of one decision and knows it.
The portrait that makes him obviously guilty destroys the scene it exists for.

**Line test.** *"I had it done. Where a thing is signed is not where it happens.
That is the whole use of signing."*

### 9. SERGEANT DRAY — the Watch Sergeant (`dray`)

**Who.** The Watch sergeant of all five battles — one man, canon ruling 3. The
voice that says *"we log numbers, ma'am"* over Perren Ash's body, and *"that is
the procedure,"* and *"that is a paperwork matter."* Later he gets a warrant to
hunt a woman the record says is dead, in wording he wrote himself, and later
still he takes the graft that makes him the House's least human instrument.

**Face and build.** Forties. Thick, square, colourless. Twenty years of service
weather: broken nose set badly, a jaw with a healed crack in it, deep creases
that are not from smiling. Cropped grey-brown hair under the liner. **The most
ordinary face in the set, deliberately** — the man who fills in the forms that
erase people looks like a competent NCO with a pension coming, because he is
one.

**Costume.** Watch kit, complete: watch cuirass, breach shield strap across the
chest, the compliance maul out of frame — everything Rowen's sheet does not
give her. **The visor is UP; the helm stays ON, chin strap fastened.** Nothing
in the docs constrains whether this face is visible at all, so this file
decides: it is, and only just. That is the whole difference between him and
Rowen in Chapter 1 and it is the composition — her helm is off in her portrait
and his is not, and neither of them chose otherwise. The raised visor shelf
above the brow is his chip anchor.

**The read.** Procedure with a face. Incurious. He is looking at you and
recording what he sees and it is not going to change what he writes. Absolutely
no cruelty in it — the whole indictment is that none is needed.

**Amber.** None.

**Avoid.** The brutal thug. No sneer, no bared teeth, no menacing scars, no
enjoyment. Avoid making him stupid — he is precise, and the precision is the
problem. Avoid any hint that he doubts himself; that arrives in Chapter 3 and
this portrait is Chapter 1.

**Line test.** *"We log numbers, ma'am."* Said over a dead foundry hand, in
answer to an order to log his name. If the face carries any regret, the line
stops being an indictment of a system and becomes an indictment of a man, and
the campaign needs the first one.

### 10. MAREN VOSS — Combine steward (`maren-voss`)

**Who.** The steward of the struck lodges, the strike's weary centre of gravity,
and the neutral witness at the Marshaling Yard. She holds a thousand people's
patience together with her own. In Chapter 3 she is diagnosed; in Chapter 4 she
dies of brightblood and becomes the Act's first posthumous award, and the lodge
reads her name into its book.

**Face and build.** Fifties. Heavy, settled, a working body that has been
standing at meetings for fifteen years. Grey hair pinned up off the collar with
the pins visible. Broad hands (out of frame), a broad face, pouches under the
eyes that are ordinary exhaustion and not illness.

**Costume.** A good coat that has been re-lined more than once, buttoned to the
throat. The lodge steward's pin at the collar — plain brass, the single piece
of metal on her, and her chip anchor. Nothing else: the Combine's authority is
that people listen to her, and it has no uniform.

**The plant.** At the very edge of the crop, where the collar opens at the
collarbone, a **faint `#ff9db1` brightblood tracery** — two or three fine
luminous lines, no halo, easily missed. She dies of this two chapters from now
and the portrait already knows. It is a detail at the frame's edge, not a
symptom on display; if a first-time viewer notices it, it is too strong.

**The read.** Attention without hope. She has heard this speech before and she
is going to hear it out anyway, because hearing it out is the job. Steady,
unhurried, immovable in a way that has nothing to do with force.

**Amber.** None.

**Avoid.** The union-poster matriarch — no raised chin, no noble suffering, no
banner. Avoid grandmotherly warmth; she is not kind, she is *responsible*, and
those look different. Avoid making the illness the subject.

**Line test.** *"Nobody on this line raised a hand until your people showed up,
officer. Ask yourself who fired first."* She is a non-combatant standing
physically between the Watch and the men who started it, and she says that to
an armed officer without moving.

### 11. PRELATE-ASSAYER QUILL — the Assay's observer (`quill`)

**Who.** The Assay Sodality's observer at Refinery Three, always taking
measurements and never taking sides — visibly. He records what he saw and
notes that *the two documents are not required to agree*; in Chapter 2 he files
his duplicate and is exiled to the deep archive for it, and decades later he
attests the deposition that is the whole campaign's ending.

**Face and build.** Fifties or sixties. Spare, dry, long-boned; a face with no
spare flesh on it. Thin grey hair, close cut. Clean-shaven, immaculate in a way
that is bureaucratic rather than vain — the Assay does not decorate, it
verifies.

**Costume.** The Assay's oiled jacket, dark and plain, with the Sodality's
standard-mark at the collar — a stamped measure, not an emblem, no religious
iconography anywhere. **The assay visor is the composition:** worn on the brow
with one lens swung down over the far eye and the near eye clear. Half the man
is instrument and half is a person, and the asymmetry *is* the characterisation.
The visor is his chip anchor.

**The read.** The one face in the set that is deliberately unreadable, and that
unreadability is the point. Neither warm nor cold; attentive the way a meter is
attentive. He is going to write down exactly what happened and it is going to
take twenty years to matter.

**Amber.** One spark: a single metered catchlight in the swung-down lens, per
the Rise's *one seam per object* rule. Nothing else, nowhere else.

**Avoid.** The sinister priest. No robes, no censer, no hood, no candle, no
knowing smile, no shadowed eyes. This is a standards bureau in a coat. Avoid
making him look complicit — he is the one man in the chapter who tells the
truth into a file, and the portrait should let the player be wrong about him
for a whole chapter without cheating.

**Line test.** *"The Inquiry will record this as a Combine act. I am recording
what I saw. The two documents are not required to agree."* Delivered from a
control gallery, to nobody in particular, while a refinery burns.

### 12. NESSA KILN — Conduit (`nessa-kiln`)

**Who.** A licensed conduit and the engineer of the Refinery Three overload —
which she runs **signed and metered**, on paperwork that is in order. In
Chapter 2 she is stripped of the licence and scapegoated for the thing she was
hired to do; in Chapter 4 the Assay takes her and her fate goes unrecorded — a
gap the annotator marks and cannot fill.

**Face and build.** Thirties to forties. Sharp-featured, competent, no
theatrics; a professional in good standing doing a job on a schedule. Hair
strapped back under the visor band. She has the highest Attunement of anyone in
her battle and it does not show yet — **no brightblood on her**, and that is a
deliberate withholding: she is the one who has so far been paid for the risk
rather than charged for it.

**Costume.** Oiled jacket, grounding strap at the wrist (out of frame), and
**the assay visor DOWN over the eyes** — her lenses covering where Quill's are
open. That inversion is intentional: his instrument is beside his eye and hers
is over it, and hers is the licence she is using. The visor is her chip anchor.

**The read.** *This woman signed for it.* She is not hiding and she is not
sorry — not yet. The mouth carries the entire expression, because the eyes are
behind glass: set, unhurried, mid-task. Leave one eye faintly visible through
the tinted lens so she does not read as a machine; that ghost of an eye is the
whole reason the composition works, and it rhymes with what happens to her.

**Amber.** A live reflection in the lens — she is standing in a refinery that
is minutes from overloading — plus its low warm on the near cheekbone. Under
3%, crisp, no bloom. Do not let it become a glow behind the glass.

**Avoid.** The mad scientist. No wild hair, no manic grin, no crackling energy.
Avoid guilt, avoid defiance, avoid the hireling read — she is a licensed
professional executing a contract, and the horror is the paperwork.

**Line test.** *"The bank is reading what it was told to read, officer.
Licensed, metered, and signed for."* Same voice she would use for a shift
change. Her last card, an hour later, is *"I am licensed. Whatever happens on
this floor, the Assay carries me"* — and it does not.

### 13. WICK — Saboteur, the cell's demolition man (`wick`)

**Who.** Underveins-born, the saboteur cell's demolition man at Tallow Row, and
the man the player meets while he is being hunted through live-gas tenements.
On the canonical win path he **breaks for the stair and is taken**. The Ledger
buys him out; he becomes Rowen's door into the Underveins, then a fixer, then —
by the end — respectable, running the Row's gas co-op.

**Face and build.** Late twenties to thirties. Quick-eyed, undernourished in
the way the Row grows people, all sinew. Dark hair, longer than Marek's and
pushed back off the face. A cutting-torch burn along one brow that took the
eyebrow with it, gas-hood strap marks pressed into the cheeks, and a nose
broken at least once.

**Costume.** Per his unit sheet: oiled jacket over a dust hood pushed back, the
grounding strap looped at the throat, a fuse-cord spool on the shoulder strap.
Nothing military; nothing from a shop. The pushed-back hood and the throat
strap are his chip anchor, and they must not read as Marek's cowl — Marek's
gathers, his hangs.

**The read.** Caught, not beaten. He is already pricing his own release: half a
step ahead of you and unbothered about being on the wrong end of it, because
being on the wrong end of things is a condition of the Row and there is always
a door. Alert, appraising, faintly amused at the wrong moment. He is also the
only man in the chapter who says the quiet thing out loud while standing on a
live gas main under somebody's kitchen, and he is not bluffing.

**Amber.** None. Underveins ground register — the darkest plate in the set.

**Avoid.** The comic-relief scoundrel. No grin, no rakish wink, no missing-tooth
gag. Avoid the villain read entirely: the campaign turns this man into a
neighbour who runs a co-op, and the portrait should already contain that. Avoid
making him look like Marek — same trade, same stratum, and the two must not be
confusable at chip size.

**Line test.** *"You want a name off me. There isn't one. There's a docket, and
a yard, and a man who never comes down to the yard."* Said downed, at the foot
of a gallery stair he had every intention of reaching.

---

## Wave 3 — second expressions (deferred, not commissioned)

When the dialogue system can select a mood (`DialogueLine` carries `portraitId`
only, today), these five are the ones that earn a second master. Nothing else
in the set does.

| Character | Second expression | Where it pays |
|---|---|---|
| Rowen | the moment of understanding — not anger; the face of somebody who has stopped being able to un-know a thing | e3's seals, e4's overload, e5 throughout |
| Aldric | closed — the record closing on his sister, after "Yes." | e5's `the-record-closes` |
| Jory | selling — the reformer's public face, wide-open and warm and untrue | Chapter 3 onward, and it should be a shock |
| Orin | rejection — the graft winning, brightblood spread, sweat | Chapter 4's crisis |
| Dray | the graft — a fifth-chapter head, barely a face, refusing his own name | Chapter 4's boss beat |

Commission wave 3 only after all thirteen baselines are accepted, and commission
it against the accepted masters so the second expression is unmistakably the
same person.

## Acceptance

Machine checks (when the intake path exists — see below): dimensions
512 × 640, opaque alpha throughout, no hue outside the §2 families, amber area
≤ 3%, brightblood present only on Orin and Maren, eye-line and head-box
landmarks inside tolerance, the chip square non-empty.

Human gate, in this order:

1. **Framing.** Lay all thirteen out in a row at 128 × 160. The eye-lines
   should form one straight line across the sheet. If any head sits high or
   small, it comes back — this is the failure that makes a cast read as
   stock art.
2. **One light.** Cover the faces and look only at the shadow shapes. They
   should all fall the same way. A portrait keyed from the other side is a
   reject even if it is the best painting in the set.
3. **Chip test.** Crop (32, 16, 64, 64) and halve it. If you cannot tell who it
   is at 32 × 32, the identifying anchor failed and the fix is in the anchor,
   not in the chip.
4. **Amber audit.** Look for warmth. Every warm pixel must trace to a source in
   this file's table. Marek gets checked twice.
5. **The line test.** Each brief ends with one. Put it under the portrait and
   read it aloud. Aldric's is a gate, not a preference.
6. **The register test.** Put the portrait next to `vale_sprite.png`. They must
   read as the same world — same materials, same soot, same restraint — and as
   deliberately different registers. If the portrait looks like key art for a
   different, glossier game, it is off-model no matter how good it is.

## Intake (sketch — the pipeline is not built)

Portraits do not take the sprite path. `fitMasterToCanvas` measures a figure and
stands it on a feet anchor, and `auditGrid` checks a figure box, a closed
outline and a sub-floor band; a bust has none of those. `quantizeToPalette` is
also wrong here by design — §4 makes portrait colour **hue-anchored, not
index-locked**, so snapping a painted face to 34 indices would destroy the one
register that is allowed to interpolate.

What a portrait intake needs instead: `decodePNG`, `resampleRGBA` to 128 × 160
(and 256 × 320 for the shipped texture), a **hue-family check** rather than a
quantizer — every pixel's nearest palette family, reported, never repaired — an
amber-area measurement, and the chip cut at (32, 16, 64, 64) → 32 × 32.

Two UI follow-ups this set implies, recorded and not done here: the dialogue
portrait slot is currently a 64 × 64 square (`.gf-dialogue-portrait
.gf-portrait`) and portraits are 4:5, so `is-large` becomes a 4:5 box showing
the whole plate while the small sizes show the chip; and the stand-in's hatch
overlay and monogram (`src/ui/dom.ts`, `src/ui/styles.css`) come out when real
art lands.
