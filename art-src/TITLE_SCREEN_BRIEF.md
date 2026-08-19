> **Status — layer wave 1 delivered and merged.** The parallax art this brief asked for is in `art-src/title-screen/`: six layers back to front in `layers/`, with `layers/manifest.json` as **the geometry contract** — the overscan canvas, the base-frame crop, the layer order and the title plate's painted bounds live there, and anything that composites or parallaxes these layers reads those numbers rather than re-deriving them. `art-src/title-screen/reference_greyfall_title.png` is the **value reference**: it is what the layers are graded against, not a seventh layer.
>
> **Repaint pending on three layers**, per the follow-up on PR #3. `01_sky` needs the reference's streaked cloud drama — the delivered sky is too even for a weather report. `03_near_city` needs the reference's value stepping and its umber lamplight scatter; the delivered near city flattens into one plane and its windows are too regular. `05_conduit` has to become **the thin hot line** the brief describes and is currently a gold pipe: flanks and a core, well under 1% of the canvas, easy to miss on the first glance and impossible to miss on the second. The other three layers stand.

# GREYFALL — title screen mock-up brief (v2)

**One sentence:** the last thing a player sees before the Assay's filing cabinet opens — the city itself at dusk under ash-fall, one live amber line running through a dead grey world, with the game's name stamped over it like a plate riveted to an instrument.

**The name is a double exposure, and the image should be too.** Officially, *greyfall* is a weather report — the ash that comes down over the city every day. Buried under that, it is *the grey fall*: the famine-and-plague winter that filled the pits the first great flux seam later formed in. The mock-up carries both readings without a word of text: ash falling in the sky above, and the ground below the skyline dropping away into pit-black — the city literally stands on its own grave. A viewer who knows nothing sees weather; a player finishing the campaign sees the second meaning was there all along.

## Composition
Landscape, 1600×1000 working frame (16:10; keep the center 4:3 safe). Horizontal thirds:

- **Upper third — the fall.** A soot sky, #171c22 into #0b0d10 at the top corners, with ash coming down in thin drifting verticals of #4a545f/#78828e — read as weather, not snow: it falls straight, heavy, industrial. No moon, no stars, no god-rays.
- **Middle third — the city.** A layered silhouette skyline: winding towers, gantry cranes, gasometer drums, tenement stacks, the cable gallery of an elevated rail line. Three to four depth planes stepping #2b333d → #171c22 → #0b0d10, hard-edged and **brutally flat** — graphic shapes, not cinematic matte painting; no atmospheric haze beyond the plane stepping, no rim light, no fog glow. Windows are **very sparse** — a handful of #7a5230 umber pinpricks across the whole skyline, lamplight rationed like everything else in this city. Nothing warm enough to compete with the amber.
- **Lower third — the pit.** Make it big. The ground drops away into pit-black (#0b0d10 to pure black at the frame's foot) and this darkness should own more of the frame than feels comfortable — the city is the lid on something. Through it runs **the single amber element of the whole image**: one flux main — a **thin** conduit line, almost easy to miss at first glance — in #8c5411 flanks with a #d98a1b core and at most one or two #f3b94a bright pixels at a junction. No machinery dressed around it, no glow pooling off it. Well under 5% of the canvas; closer to 1% is right. Amber means *live power* everywhere in this game, and players spend the campaign learning to scan for it — a first glance that misses the line and a second glance that finds it is the title screen teaching the game's visual literacy before the first input.

## The logotype
GREYFALL, **small** — roughly 20–25% of frame width, not a poster plate — set exactly across the boundary of sky and skyline. It is an administrative object, not a fantasy logo: a stamped plate, the kind of thing riveted to an instrument so the instrument can be inventoried. Condensed industrial stamp face (the UI's plate-stamped register — never calligraphic), #b3bcc5 with a 1px light top edge and ink under-edge. Squared everything: **no rounded corners anywhere**. Below it, smaller still, same face, low weight: *A tactics RPG in a city that runs on metered magic.* (ships in the game already — keep it verbatim). Optional flourish if it earns its place: a punched diagonal clip on the plate's top-right corner — every record card in the UI carries that punch, and the title plate is the first record in the file.

## The menu — an Assay terminal, not an RPG menu
The mock-up should include the menu state. The interface's own fiction is *the Assay's field instrument*, and the title menu behaves like a departmental terminal: a short column of stamped rows under the plate, ledger-set, in the game's established vocabulary (saves are **files**, battles are **engagements**, the campaign screen is **the register** — invent no new nouns):

    OPEN A NEW FILE
    REOPEN A FILE
    REVIEW THE RECORD
    INSTRUMENT SETTINGS
    CLOSE THE TERMINAL

Rows are text with the UI's bronze left-edge cursor on the focused row — no buttons, no icons, no panels. The player is not entering a heroic adventure; they are opening a file at a counter.

## The transition (storyboard strip, four panels)
More important than the still, and the mock-up should carry it as a 4-panel strip along the bottom or as a second board: **OPEN A NEW FILE** → (1) screen drops to black · (2) a filing-cabinet drawer slides open toward the viewer, lit only by its own #7a5230 lamp · (3) a grey pulp document is pulled, punched corner visible · (4) the document fills the frame, stamped **FILE 001 — [NAME]**, and the campaign's first scene is the paper coming into focus. The title screen is the front cover of the world's bureaucratic machinery; the first game scene is physically opening it. (Implementation — animation and the game's first sound — is scoped separately; the strip captures intent.)

## Palette law (hard)
Only these families: soot #0b0d10 #171c22 #2b333d #4a545f #78828e #b3bcc5, umber #150e09 #2c1d12 #4e3320 #7a5230, amber #4a2a06 #8c5411 #d98a1b #f3b94a (+ #ffe7a8 only as a single bloom key if any). **Reserve #a5622f copper entirely** — in-game it exclusively marks operable machinery, and the title screen operates nothing. No blues, no greens, no reds.

## Mood
Administrative, sooted, patient, load-bearing. **Not:** epic fantasy, neon cyberpunk, cozy steampunk brass-and-goggles. No lens flares, no fog glow, no character figures — the city is the character.

## Optional motion notes (animated card)
Ash falls slowly enough that at first it reads as static grain — the viewer notices the motion only after settling; the amber core of the main carries a barely-perceptible slow pulse (a meter reading, not a heartbeat); the logotype and menu do not move, ever.
