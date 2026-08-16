# Generator briefs — the six remaining field sprites

Vale (Conduit) is done and sets the family style: reuse his exact ramps for
shared materials (coat greys, leather browns, copper, the teal accent) so the
roster reads as one game. Send each brief below with the SHARED SPEC block.

## SHARED SPEC (paste with every brief)

```
PIXEL ART BRIEF — one character field sprite for "Greyfall"

THE GAME: A tactics RPG in the style of Final Fantasy Tactics with an HD-2D
look — 3D terrain, 2D pixel-art sprites billboarded on top, orthographic
camera at ~33° from a corner. Industrial fantasy: magic is an industrial
resource ("flux"), refined and piped like electricity, glowing warm amber.
Soot-stained factory city, ash-grey skies. Tone: grounded, dry, worn.

STYLE FAMILY: matches an existing character (a licensed flux-technician with
a copper-wound staff) — painterly pixel art, worn materials, muted cool
greys/browns with a single warm amber light source where the fiction
provides one, teal-verdigris as the accent family.

TECHNICAL (hard constraints):
- ONE image, TWO figures side by side on a marked 2-cell grid, each cell
  256×384 px: LEFT cell = front-three-quarter view facing screen-left;
  RIGHT cell = back-three-quarter view over the SAME shoulder. Same pose,
  same scale, same figure height in both cells, feet on a drawn ground line.
- TRANSPARENT background (PNG alpha). No baked glow, no bloom halos, no
  cast shadow — the game engine adds light and shadow.
- Proportions: 5 to 5.5 heads tall. This is a field sprite, not a hero
  illustration — do not drift to 7-head proportions.
- The final in-game size is 64×96 (a clean 4:1 downscale of your 256×384
  cell): the FACE will not survive that scale, so identity must live in an
  IDENTIFYING FEATURE ABOVE THE SHOULDERS at least 10% of figure height
  (visor, hood, mask, antenna, goggles — per the character notes below)
  and in the silhouette.
- Emissives (amber flux elements) crisp-edged, no soft halo.
- ALSO deliver: a flat palette strip as a separate row of solid N×N swatches
  (no gradients), reusing these established ramps where materials repeat:
  cool #080710 #1a1d28 #303645 #4a505f #6c7077 #cbb097 · warm #120b0f
  #2b1c1b #563325 #8e4e2c #ba6d37 #fdebaf · accents #082d3f #5db096.
```

## 1. ENFORCER — Rowen Corvane (the protagonist)
House Watch line soldier: riot armor, tower shield, shock maul (a heavy
maul with a small flux-discharge head — the ONE amber element, small).
Widest silhouette of the cast. Identifying feature: full riot helm with a
horizontal visor slit — but this is Rowen, the story's heart, so the helm
should read as openable/humanizing (visor up or helm slung works if the
head-level marker stays strong). Female, though armor makes it subtle.
Reads as: the person who stands at the front and takes it.

## 2. MACHINIST — Ivo Brace
Battlefield engineer: deploys sentry frames, tripwire charges, skitter
drones. Identifying feature: a copper equipment backpack with a whip
antenna rising above the head. Chest harness with tool loops, heavy gloves,
a long spanner. One small amber indicator lamp on the pack. Reads as:
someone who builds their side of the battlefield.

## 3. SABOTEUR — Marek Sump
Explosives and demolition: hooded, hunched, quick. Identifying feature: a
deep work-hood shadowing the face (a void with a glint). Satchel of shaped
charges at the hip, three cylindrical charges on a bandolier, wire spool.
NO amber on this one — a saboteur carries nothing that glows; his kit is
chemical fuse and blasting powder. Reads as: the one you don't see coming.

## 4. CHEMIST — Jory Slate
Field medic by way of an industrial lab: experimental compounds, not
potions. Identifying feature: a half-face breathing mask/respirator with a
small filter canister. Long work coat (NOT a dress — it should read heavy,
split for walking, over trousers and boots) with a flask bandolier across
the chest, verdigris-green apron. Female, foundry-hand build — practical,
not slight. Reads as: the person who patches the shift back together.

## 5. AUGMENTED — Orin Vane
Flux-grafted body modification, the setting's body-horror job. Identifying
feature: one entire arm is a copper-and-iron graft, oversized, with a warm
amber seam glowing along its length (this is the amber element — a line,
not a lamp) and visible brightblood scarring where metal meets neck.
Asymmetry IS the silhouette: one massive shoulder, one human one. Clothing
minimal on the graft side. Reads as: strength that cost too much.

## 6. RAILRUNNER — Della Tine
Mobility specialist keyed to rails and machinery: lean, pitched forward,
built for motion. Identifying feature: brass-rimmed goggles worn UP on the
forehead plus a long split riding coat with a pronounced tail that kicks
backward. A coupling hook (copper, arm-length, hooked head) carried in one
hand. No amber. Reads as: someone mid-stride even when standing still.
