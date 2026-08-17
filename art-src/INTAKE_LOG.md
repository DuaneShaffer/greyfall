# Art intake log

What was delivered, what the audit found, and what shipped anyway. The rule this
file lives by is `ART_DIRECTION` C.8.2: **the intake reports, it never repairs.**
Nothing below was fixed by hand; where the delivery diverges from its brief, the
divergence is written down and the art ships as drawn.

Part A is the six field sprites (§1–§5). Part B is the Wave 1 terrain texture set
(§B.1–§B.5). Part C is the Wave 1 map objects (§C.1–§C.5).

# Part A — field sprites

One entry per job.

Regenerate the numbers with:

```
npx tsx tools/ingest-master.ts --all --dry          # report only
npx tsx tools/ingest-master.ts --all                # rewrite src/art/masters/
npx tsx tools/ingest-master.ts enforcer --dry --spans   # + row spans for landmarks
```

Contact sheets for the human gate (C.8.5) come from the gallery rig:

```
SPRITE_DUMP=1 SPRITE_DUMP_DIR=.art-review/intake SPRITE_DUMP_TAG=intake \
  npx vitest run tests/art/gallery.test.ts
```

## 1. Verdicts against the brief

`art-src/GENERATOR_BRIEFS.md` is the brief; the shared spec's hard constraints
are the first four columns.

| Job / character | Head-level marker | Silhouette | Amber discipline | Both cells usable | Verdict |
|---|---|---|---|---|---|
| enforcer — Rowen Corvane | **Diverges.** Bare head: headband + ponytail, no riot helm and no visor slit. 11 rows above the shoulder line = 16% of figure height, so the *mass* clears the 10% bar, but it is hair, not a job marker — she reads as "a soldier", not "the visored one" | Correct and correct-est: widest of the cast, 62 of 62 columns, tower shield + maul | 3 px (se) / 7 px (ne) on the maul head. One element, small — as briefed, but at 1× it is almost gone | Yes | **Ship, regenerate later.** The one marker miss in the set |
| machinist — Ivo Brace | Whip antenna, 9 rows clear above the head, 11% of figure height on its own; pack silhouette behind the shoulder | Correct: copper pack, chest harness, long spanner, heavy gloves | 21 px, one indicator lamp on the pack. As briefed | Yes | **Ship.** Best brief adherence in the set |
| saboteur — Marek Sump | Deep work-hood, 12 rows / 16%, face a void with a glint | Correct: hooded, hunched, shortest standing height, satchel + three banded charges + wire spool (spool visible in the back cell) | **1 px (se), 0 px (ne)** — effectively none, as briefed. The charge bands are `blood-500`, not amber | Yes | **Ship.** Amber discipline exactly right |
| chemist — Jory Slate | Respirator + hair bun, 17 rows / 20% | Correct: heavy split work coat over trousers and boots (not a dress), flask bandolier, verdigris apron, foundry-hand build | 16 px (se) / 18 px (ne): the two injectors and the vial fluid. Brief did not specify; within budget and fiction-sourced | Yes | **Ship.** Brief asked for a *half*-face mask and the delivery is full-face — a gain, not a loss, at this scale |
| augmented — Orin Vane | **Diverges.** Nothing above the shoulders but hair. The brief made the graft arm the identifying feature and the arm is not above the shoulder line | Correct and the strongest in the set: one massive copper shoulder, one human, minimal cloth on the graft side, brightblood scarring at the neck | 29 px (se) / 16 px (ne) as a *line* down the graft, not a lamp. As briefed, and the most legible amber in the roster | Yes | **Ship.** The asymmetry carries identity on its own; the shared spec's above-shoulder rule is the thing that gave |
| railrunner — Della Tine | Brass goggles worn up on the forehead — present, but only ~3 rows / 4% of figure height on their own. The hair mass carries the rest of the 14 rows | Correct: lean, pitched forward, long split riding coat with a tail that kicks back, arm-length copper coupling hook | **1 px (se), 0 px (ne)** — one stray `amber-glow` pixel on the hook's highlight. Brief says no amber; call it none | Yes | **Ship, minor.** Goggles are the weakest marker in the set at 1× |
| conduit — Vale (prior delivery) | Unchanged | Unchanged | 85 px | **No** — front three-quarter only | Unchanged; re-ingested through the updated path |

### What the owner should regenerate, in priority order

1. **Rowen's head.** The brief asked for a riot helm with a horizontal visor
   slit, openable so it can humanize her. The delivery has neither helm nor
   visor. She is the protagonist and she is the one unit in the roster with no
   job marker above the shoulders. A helm slung at the hip with the visor pushed
   up on the brow would satisfy both the brief and the story note.
2. **Three stances are wider than the figure box.** Rowen, Della and Marek are
   drawn in stances whose gear spread exceeds the 62-column figure box, and the
   spec's reduction is measured off the whole figure, so they pay for the width
   in height: Rowen stands **70 rows** where Orin stands 87 — 20% shorter than a
   character who should be about the same height. Tucking the maul and shield in
   toward the body (Rowen), the hook and coat tail (Della) would recover most of
   it. This is the single largest visual problem in the delivery and it is a
   *pose* problem, not a drawing problem.
3. **No team tint anywhere.** Every delivery has 0–7 px in the `steel` indices,
   i.e. 0.0–0.4% of the body against A.6's 5–12%. Nothing in the art says
   player or enemy; the facing wedge and the UI carry allegiance alone, and
   `retintMaster` has almost nothing to swap. A chest band on the ribs (shoulder
   line minus 6) plus pauldron trim, at least 2 clear rows apart, would fix all
   seven at once. See C.9.2 for the way to get this wrong.
4. **The midtones run warm.** The delivered light is warm across the whole set,
   so neutral greys quantize into the `bone` ramp rather than `soot`:
   `#6b6e6d` is 39.5 from `bone-500` and 40.5 from `soot-300`. Jory's coat comes
   out cream rather than ash-grey, and `soot-100` never appears in her front cell
   at all. §1 asks for muted **cool** greys with a single warm source. A cooler
   key on the next pass would land the whole roster back in the family without
   touching the palette strip.
5. **Ivo and Della share a marker.** Both wear brass goggles pushed up on the
   forehead. The brief gave goggles to Della alone and gave Ivo the antenna. The
   antenna is strong enough that Ivo still reads, but at 1× the two heads are
   more alike than they should be.
6. **Della's goggles are too small to be the marker.** ~3 rows at 64×96. Either
   larger lenses or a second head-level element.

## 2. Cell location and keying, per sheet

All six sheets went through the same automatic path — no hand-measured crop
rectangles. The method and why it is the honest one are in `src/art/delivery.ts`
and `ART_DIRECTION` C.8.7. The short version: **the alpha channel is already a
clean matte**, so the key is a threshold, not a heuristic. The painted backdrop
that makes these sheets look opaque lives in RGB at alpha 0–40 and disappears at
the threshold; guide-frame teal is stripped by color and given back within 2 px
of a figure; a wide thin horizontal run is a drawn ground line and is cut; the
two figures then fall out as the two largest connected blobs.

| Sheet | Size | Guide px stripped | Ground-line rows cut | Front cell | Back cell | Guide reclaimed (se/ne) | Guide collisions (se/ne) | Ambiguous alpha (se/ne) |
|---|---|---|---|---|---|---|---|---|
| rowen_corvane_enforcer | 1536×1024 | 227 | 697–701, 710 | 585×664 @ (46,33) | 485×667 @ (706,30) | 0 / 0 | 0 / 0 | 7030 / 6301 |
| ivo_brace_machinist | 1536×1024 | 6135 | 735, 736, 793 | 535×717 @ (32,18) | 444×717 @ (728,18) | 75 / 0 | 0 / 0 | 6726 / 5819 |
| marek_sump_saboteur | 1536×1024 | 7588 | 710, 711, 776 | 511×603 @ (71,107) | 479×590 @ (651,120) | 0 / 0 | 0 / 0 | 6270 / 5796 |
| jory_slate_chemist | 1448×1086 | 8366 | 764, 765 | 523×718 @ (44,46) | 439×722 @ (643,42) | 182 / 31 | 1 / 0 | 7649 / 7058 |
| orin_vane_augmented | 1536×1024 | 12613 | 737–741, 796 | 491×699 @ (103,38) | 461×701 @ (643,36) | 0 / 0 | 0 / 0 | 7222 / 6914 |
| della_tine_railrunner | 1536×1024 | 18499 | 739–742, 805, 806 | 569×695 @ (21,44) | 546×690 @ (639,49) | 92 / 25 | 17 / 9 | 9972 / 9881 |

Notes the table cannot carry:

- **Rowen's frame is not cyan.** Her guide lines are a desaturated `#578989`,
  outside the guide test, so only 227 px were stripped. It did not matter: her
  two figures are already separate blobs once the ground line is cut, and her
  frame lines fall outside both cell bounds. She is the reason the locator does
  not *depend* on stripping the frame.
- **Three sheets need the ground-line cut to work at all.** On Marek, Orin and
  Della the drawn ground line runs across both cells and welds the two figures
  into a single blob; without cutting it the "two largest blobs" are one figure
  and the preview inset. Rowen, Ivo and Jory draw a separate line per cell.
- **Accent/guide collisions, named.** Ivo's goggle lens (75 px) and Jory's
  bandolier vials (182 px front, 31 back) key as guide teal and are handed back
  by the 2 px reclaim. Della's 17 + 9 collisions are the frame line physically
  crossing her coupling hook and her goggle rim; they stay stripped, cost about
  one pixel at final scale, and are counted here rather than absorbed. **No
  legitimate verdigris was eaten:** `verdigris-500` (#2f7a6c) and
  `verdigris-300` fail the guide test on the `b >= g - 8` clause, which is why
  Jory's apron and Marek's rag survive intact.
- **Ambiguous alpha is the soft matte edge**, 6–10k px per cell out of 140–200k,
  i.e. ~4%. It is the anti-aliased rim of the delivered figure. Reported, not
  resolved: the threshold decides those pixels and the count says how many
  decisions it made.
- **Discarded blobs** (preview inset, proportion silhouette, palette swatches,
  caption glyphs) run 33k–51k px across 171–184 blobs per sheet, all at least an
  order of magnitude smaller than either figure.

## 3. Reduction and landmarks

Both cells of a character are reduced at **one shared scale** (`masterFitScale`)
so a unit cannot change height when it turns around; fitting each view alone made
Rowen 70 rows from the front and 85 from the back. Nothing is clipped to buy
height — cropping the owner's maul off would be a repair.

| Job | Reduction | se rows / cols | ne rows / cols | shoulderRow | hipRow | Height lost to gear spread |
|---|---|---|---|---|---|---|
| enforcer | 1:9.44 | 18–87 (70) / 62 | 17–87 (71) / 51 | 29 | 52 | **17 rows (−20%)** |
| machinist | 1:8.63 | 5–87 (83) / 62 | 5–87 (83) / 51 | 26 | 50 | 4 rows |
| saboteur | 1:8.24 | 15–87 (73) / 62 | 16–87 (72) / 58 | 27 | 50 | 14 rows, mostly the hunch |
| chemist | 1:8.44 | 3–87 (85) / 62 | 2–87 (86) / 52 | 20 | 46 | 2 rows |
| augmented | 1:8.06 | 1–87 (87) / 61 | 1–87 (87) / 57 | 16 | 45 | none — fills the box |
| railrunner | 1:9.18 | 12–87 (76) / 62 | 13–87 (75) / 59 | 26 | 49 | **11 rows (−13%)** |
| conduit | (crop) | 1–87 (87) / 41 | — | 24 | 46 | none |

Landmarks were measured off the fitted masters, not off the rig: these are drawn
at 5–5.5 heads and the armature is 3, so the default cut would take half of each
chest with the head. `hipRow` is the belt-to-skirt transition, which is where the
coat and the leg armour part company.

## 4. Audit, per master

Every master is **REJECTED** by `report.ok` and every one ships, per C.8.6. The
violations are the same five on all seven, and they are all consequences of
reducing painted art rather than hand-placing pixels:

| Job / view | Colors (budget 14) | Amber (budget 245) | Team tint | Quantized px | mean / worst move | Open-outline px | Orphan 1px clusters | Ambiguous quantizations |
|---|---|---|---|---|---|---|---|---|
| enforcer se | 19 | 3 | 0 | 2179 | 16.7 / 48.1 | 367 | 267 | 1416 |
| enforcer ne | 20 | 7 | 0 | 1966 | 15.2 / 41.1 | 346 | 229 | 1292 |
| machinist se | 22 | 21 | 2 | 2251 | 16.2 / 44.3 | 413 | 372 | 1536 |
| machinist ne | 21 | 21 | 2 | 1939 | 16.2 / 69.8 | 356 | 302 | 1340 |
| saboteur se | 18 | 1 | 6 | 2345 | 16.0 / 39.1 | 377 | 324 | 1644 |
| saboteur ne | 15 | 0 | 4 | 2270 | 15.2 / 39.2 | 353 | 327 | 1588 |
| chemist se | 24 | 16 | 5 | 2895 | 18.0 / 46.2 | 476 | 499 | 2077 |
| chemist ne | 20 | 18 | 1 | 2536 | 17.5 / 43.6 | 445 | 406 | 1802 |
| augmented se | 22 | 29 | 7 | 3070 | 17.1 / 43.2 | 507 | 455 | 2212 |
| augmented ne | 20 | 16 | 4 | 2922 | 16.4 / 42.2 | 508 | 384 | 2077 |
| railrunner se | 17 | 1 | 0 | 2250 | 18.0 / 54.1 | 592 | 320 | 1504 |
| railrunner ne | 16 | 0 | 0 | 2048 | 17.5 / 40.0 | 592 | 307 | 1320 |
| conduit se | 22 | 85 | 0 | 1906 | 13.9 / 52.2 | 399 | 407 | 1137 |

What each column costs downstream (C.8.6):

- **Colors 15–24 against 12+2.** Nothing mechanical. The budget is a
  hand-drawing rule and a reduction of painted art cannot meet it. Every color
  is a valid §2 value.
- **Amber.** Everyone is well inside the 4% budget; nobody is close. Marek and
  Della are effectively at zero, which is what their briefs asked for.
- **Team tint 0–7 px.** The real cost, and the one worth a regeneration: see
  §1 finding 3.
- **Open outline, 346–592 px.** Nothing in-game — derivation discards the
  master's outline and re-derives a closed one per frame — but the master itself
  cannot be used as a drawing reference.
- **Orphan clusters, 229–499 against an allowance of 12.** Dither-like sparkle
  at 1×, visible when the camera pulls out. Inherent to an 8:1 reduction.
- **Ambiguous quantizations, 1292–2212 px.** The warm-drift problem of §1
  finding 4, quantified: these are pixels whose winning palette step beat the
  runner-up by less than the move itself. C.8.2 says do not proceed past a
  non-empty ambiguous list; we proceeded, deliberately, because the alternative
  is shipping the compositor's placeholder. The `allowed` lever was used as far
  as it usefully goes — see below.
- **Reserved signal colors were kept out.** The intake target is
  `FIELD_PALETTE`: §2 minus `overload-*`, `veinglass-*`, `hazard` and
  `brightblood`. Against the whole palette, Della's cheek (`#eba386`) quantized
  to `brightblood` and Jory's copper injector to `hazard` — a face wearing an
  emissive gets a halo instead of an outline. `augmented` declares
  `brightblood` back in, because his neck scarring is what the color is for.
  `amber-glow` stays in the target because the amber ramp is load-bearing, and
  it lands exactly once each on Jory's front cell and Della's — a single
  unoutlined pixel apiece, which is the whole of the "Della has no amber"
  divergence.

## 5. Derivation artifacts found in the 56-frame review

Reviewed at 6× from the shipped sheet, all 56 frames per character
(`.art-review/intake/shipped-<job>-intake-6x.png`).

- **Fixed a real pipeline bug.** `cutMaster` bucketed pixels by segment *name*,
  so a view with two `prop` regions handed each of them the whole prop pixel
  list — Rowen's tower shield was painted a second time at her maul's offset and
  flew off the top-left corner of every `attack` frame. Vale's single prop region
  never exposed it. Now bucketed per segment instance;
  `tests/art/delivery.test.ts` covers it.
- **Ivo's pack seam.** The pack straddles the shoulder line and the arm band; the
  first prop rectangle stopped at row 43 and the pack's lower canister sheared
  away with the arm. Widened to rows 2–53. The residual is a flat vertical edge,
  not a tear.
- **Clipping at the reserved ring.** Machinist, Enforcer, Saboteur and Railrunner
  fill all 62 columns of the figure box, so `attack` and `walk` poses that
  translate laterally by 4–8 px push their widest gear into column 63, which
  derivation clears. The result is a straight vertical edge on the pack or the
  shield in the extreme frames. Same root cause as §1 finding 2: the stances are
  too wide. Not repaired.
- **`downed` frames 2–3 smear** on all seven, as C.8.4 predicts. Legible
  collapse, not a good one.
- **Back views are genuinely used.** Every `ne` row of every job but Vale shows
  the delivered back cell: Ivo's pack and wire spool, Marek's spool and hood
  back, Jory's tank rig, Orin's graft from behind, Della's coat tail and scarf,
  Rowen's ponytail and slung shield. This is the upgrade Vale's single-view
  delivery could not have.
- **Feet meet the anchor in all 7 × 56 frames**, asserted as well as eyeballed.

---

# Part B — Wave 1 terrain textures

The brief is `art-src/TERRAIN_BRIEFS.md`; the binding spec is `ART_DIRECTION` §5
and D.4. One delivered file, `art-src/greyfall_terrain.png` (1535 × 1024): a
labelled sheet carrying nine framed preview cells — five tile tops and four tile
sides — with a title block, a "wave 1 includes" panel, per-cell captions and a
delivery checklist.

Regenerate the numbers with:

```
npx tsx tools/ingest-tiles.ts --dry                              # report only
npx tsx tools/ingest-tiles.ts                                    # rewrite src/art/masters/tiles.ts
npx tsx tools/ingest-tiles.ts --png .art-review/terrain/masters  # + 8x previews and the 4x masters
```

`tests/art/tiles.test.ts` re-runs the whole path against the delivered PNG and
compares it byte for byte with the committed grids, and pins every number in §B.3.

## B.1 Verdicts against the brief

| Face | Material read | Seams | Strata band | Colours | Verdict |
|---|---|---|---|---|---|
| `plain-top` | **Right.** Poured concrete: `soot-500` ground, sparse `umber-500` grit, `soot-700` shadow. Quietest thing on the board, as asked | E/W 1.10 — clean. **N/S 2.60** — the grit is bottom-weighted, so a faint horizontal band shows once per tile | n/a | 3 | **Ship.** Best face in the set |
| `plain-side` | **Right.** Cut stone over dark mortar, courses running horizontally | E/W 0.71 — clean | Present, **flat**, 2 rows — but drawn `soot-500`, one ramp step darker than §5's `soot-300` | 5 | **Ship, minor** |
| `rail-top` | **Right and legible at 32 px** — two rails on umber ballast with sleeper bands, findable across a whole map at a glance. But the rails are drawn as **cool grey metal, not copper**: no `copper-700` rail body and **no `copper-300` head specular anywhere**. The only shine on the ground plane was not delivered | E/W 0.52, N/S 0.33 — the best-wrapping face in the set; rails run unbroken tile to tile | n/a | 7 | **Ship, regenerate** |
| `rough-top` | **Right.** Visibly coarser grain than plain at the same value, which is exactly the contrast §5 asks for | E/W 1.18, N/S 1.27 — clean | n/a | 5 | **Ship** |
| `rough-side` | **Right.** Packed earth and broken stone, warmer and darker than `plain-side` | E/W 0.89 — clean | Present and **flat `umber-500`** — but §5 wants it **interrupted**, broken into segments over about half the width. The move-cost tell is missing, and the band is warm rather than `soot-300` | 6 | **Ship, regenerate** |
| `water-top` | **Wrong, and the one that costs the most.** The delivered water is near-black cool grey with thin light caustic filaments. It quantizes to `soot-800`/`soot-700`/`soot-500`/`umber-700` and lands on **zero verdigris**: no `verdigris-700` body, no `verdigris-500` shimmer bands. On the board it does not read as water at all and is hard to tell from `impassable` | **E/W 2.06** — the horizontal filaments do not meet across the join; the repeat is visible as diagonal streaking on a flat run | n/a | 4 | **Ship, regenerate first** |
| `water-side` | Plausible wet masonry, darker than `plain-side` | E/W 1.23 — clean | Present but **not flat** (two colours across the 2 rows) | 6 | **Ship, minor** |
| `impassable-top` | **Wrong.** §5 asks for `soot-900` almost flat, "nearly featureless", explicitly *uncountable*. The delivery is warm broken rock and debris in six colours — busier and warmer than `rough-top`, and the single loudest material on the board. On the Charterhouse Steps and Tallow Row the eye goes to the impassable masses before it goes to the units | E/W 1.47, N/S 0.82 — clean | n/a | 6 | **Ship, regenerate** |
| `impassable-side` | Same material as its top, drawn as a rock face with breaks | E/W 1.48 — clean | **Present, and §5 says there must be none.** Countable height on a face whose height must not be countable | 7 | **Ship, regenerate** |

Three things the table cannot carry:

- **The band is at the top, not the bottom.** Three of the four side captions say
  "Strata band at bottom" and the fourth says "Strata band — water at base". The
  paint says otherwise: on all four faces the top 2 shipped rows are lighter than
  the body (100% of band pixels) and the bottom 2 rows are darker (0%). The
  captions are wrong about their own art; the art is right, and no rows were
  moved to make it so. This is the one place the delivery accidentally matches §5
  better than its own checklist claims.
- **The delivery's checklist contradicts the brief on colour.** The sheet's own
  panel asks for "16–24 colors (inclusive)"; the brief's shared spec says **max
  6, flat, no gradients, no anti-aliasing**. What arrived is continuous-tone
  painting, so the ceiling is measured after the reduction and the quantization
  against each material's ramp: 3 to 7 colours, over the ceiling on two faces.
  Nothing mechanical rides on that count — see §B.3.
- **The one missing asset is the second water frame.** §5 and the brief both ask
  for two `water-top` frames with the shimmer bands at different heights,
  alternating every 30 ticks. One frame was delivered. The interim is engine-side
  and is recorded in §B.5.

## B.2 Cell location in the delivered sheet

The nine crop rects are **hand-measured off this one file and declared** in
`src/art/tileSheet.ts` — the same honesty `tools/ingest-master.ts` uses for Vale's
sheet. What keeps them honest is automatic: a frame sweep finds the nine cell
boxes without being told where they are, and every rect is checked against the 1px
near-black inset line that fences each painting on all four sides.

An automatic *interior* locator was tried first and rejected. Luma and
variance sweeps find seven of the nine cells to the pixel and then miss badly on
the other two: `rail-top`'s ballast is as dark as the panel behind it (found 179
of 289 columns) and `water-top`'s lower half is nearly flat (found 237 of 270
rows). A locator that is right about seven cells and lies about two is worse than
a measured number, because only the measured number can be checked.

Found automatically:

| Band | Frame rules (rows) | Cell box edges (columns) |
|---|---|---|
| tops | 170 / 541 | 17, 314, 609, 919, 1210, 1518 |
| sides | 583 / 880 | 17, 364, 733, 1119, 1518 |

Declared, and the inset check on each:

| Face | Crop rect | Delivered aspect | Nominal | Inset margins L/R/T/B |
|---|---|---|---|---|
| `plain-top` | 277 × 270 @ (29,204) | 1.026 | 1.000 | −66.2 / −24.7 / −28.1 / −52.2 |
| `impassable-top` | 276 × 270 @ (325,204) | 1.022 | 1.000 | −29.2 / −24.4 / −10.3 / −21.8 |
| `rail-top` | 289 × 270 @ (621,204) | 1.070 | 1.000 | −52.1 / −45.1 / −15.0 / −34.7 |
| `rough-top` | 271 × 270 @ (930,204) | 1.004 | 1.000 | −33.0 / −36.4 / −16.8 / −27.1 |
| `water-top` | 284 × 270 @ (1223,204) | 1.052 | 1.000 | −9.7 / −29.3 / −16.7 / −22.9 |
| `plain-side` | 328 × 185 @ (28,618) | 1.773 | 2.000 | −4.0 / −29.1 / −42.1 / −19.1 |
| `impassable-side` | 349 × 185 @ (375,618) | 1.886 | 2.000 | −10.5 / −26.0 / −32.0 / −17.2 |
| `rough-side` | 366 × 185 @ (744,618) | 1.978 | 2.000 | −31.2 / −24.6 / −27.9 / −18.6 |
| `water-side` | 377 × 185 @ (1130,618) | 2.038 | 2.000 | −32.1 / −24.1 / −41.7 / −24.4 |

Every margin is negative, which is what "the pixel just outside the rect is darker
than the painting just inside it" means: no caption, cell title or frame rule is
inside any crop. `impassable-side` was one column wide on the first pass — the
inset check caught it, which is the whole reason the check exists.

**The cells are not at nominal aspect.** Both rows are drawn at a constant height
(tops 270 rows, sides 185 rows) and a per-cell width, so resampling to 128 × 128
and 128 × 64 stretches each face by a different amount. The tops are within 0.4%
to 7%, which is invisible. `plain-side` is the outlier at 1.773 against 2.000: it
is stretched 12.8% horizontally to reach the nominal master. Nothing was cropped
to fix the ratio — cropping the owner's painting would be a repair — and the
courses read correctly stretched, but a Wave 2 sheet drawing the cells at their
nominal ratio would remove the question.

## B.3 Audit, per face

The reduction is two steps, both `resampleRGBA`: delivered preview → the 4×
nominal master D.4 fixes → the shipped face §5 fixes. Quantization targets **each
material's own ramps** and nothing else, which is what makes the first three rows
of this table true by construction rather than by inspection.

| Face | Shipped | Colours (ceiling 6) | Amber | Reserved ramps | `copper-300` | Off-ramp | E/W wrap ratio | N/S wrap ratio | Quantized | mean / worst move | Ambiguous |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `plain-top` | 32×32 | 3 | 0 | 0 | 0 | 0 | 1.10 | **2.60** | 1024/1024 | 28.0 / 45.8 | 996 |
| `plain-side` | 32×16 | 5 | 0 | 0 | 0 | 0 | 0.71 | 5.49 † | 512/512 | 21.0 / 40.8 | 442 |
| `impassable-top` | 32×32 | 6 | 0 | 0 | 0 | 0 | 1.47 | 0.82 | 1024/1024 | 21.1 / 35.0 | 1021 |
| `impassable-side` | 32×16 | **7** | 0 | 0 | 0 | 0 | 1.48 | 2.79 † | 512/512 | 18.2 / 36.0 | 468 |
| `rail-top` | 32×32 | **7** | 0 | 0 | **0** | 0 | 0.52 | 0.33 | 1024/1024 | 19.5 / 35.8 | 923 |
| `rough-top` | 32×32 | 5 | 0 | 0 | 0 | 0 | 1.18 | 1.27 | 1024/1024 | 23.6 / 35.7 | 1007 |
| `rough-side` | 32×16 | 6 | 0 | 0 | 0 | 0 | 0.89 | 5.33 † | 512/512 | 15.8 / 35.4 | 413 |
| `water-top` | 32×32 | 4 | 0 | 0 | 0 | 0 | **2.06** | 1.45 | 1024/1024 | 14.0 / 31.9 | 597 |
| `water-side` | 32×16 | 6 | 0 | 0 | 0 | 0 | 1.23 | 5.87 † | 512/512 | 16.0 / 35.0 | 512 |

**How the seam numbers are built, and why the ratio is the one to read.** A wrap
edge is measured as the mean per-channel step across the join — pixel (w−1, y) laid
beside (0, y) — divided by the same texture's mean step between *neighbouring
interior* pixels on the same axis. A coarse material has a big step everywhere, so
the absolute number says nothing on its own; the ratio says whether the join is
worse than the grain. 1.0 is invisible, and the eye starts finding a seam around
2.0 on a 32 px tile laid 300 times. Nothing was smeared, cloned or blended to
improve a number.

† **A side face's vertical join is measured but not held against it.** §5 puts a
lighter cut line across the top 2 rows of every side face and nothing across the
bottom, so a face stacked on a copy of itself *must* step from dark masonry to
light cut line at every height unit. That discontinuity is not a seam; it is the
thing the player counts steps with. The numbers are logged because the brief asked
for them and because a Wave 2 face that lost the band would show up here as a
ratio near 1.0.

**Strata band, per side face:**

| Face | Top 2 rows | Flat? | Colour | Band luminance vs body | §5 wants |
|---|---|---|---|---|---|
| `plain-side` | lighter, 100% of pixels | **yes**, 2/2 | `soot-500` | 0.0862 vs 0.0295 | flat `soot-300` — **band right, colour one step dark** |
| `impassable-side` | lighter, 100% | no, 0/2 | `soot-700` `soot-500` `umber-500` | 0.0596 vs 0.0220 | **no band at all** — divergence |
| `rough-side` | lighter, 100% | **yes**, 2/2 | `umber-500` | 0.0409 vs 0.0212 | **interrupted** — divergence, and warm |
| `water-side` | lighter, 100% | no, 0/2 | `soot-700` `soot-500` | 0.0752 vs 0.0115 | flat `soot-300` — band right, not flat |

`soot-300` appears in **none** of the four bands. Height is still countable on the
board — the staircase and sampler shots make that plain — but it is countable at
one ramp step less contrast than §5 specified.

**What each column costs downstream:**

- **Colours 3–7 against a ceiling of 6.** Nothing mechanical; the engine draws
  whatever the grid holds. Two faces are over. Same root cause as the sprites: the
  ceiling is a hand-drawing rule and a reduction of painted art cannot meet it.
- **Amber, reserved ramps, off-ramp all zero, on all nine faces.** True by
  construction: `allowed` is soot + umber, plus the copper ramp on `rail-top` and
  the verdigris ramp on the two water faces, and nothing else. The whole amber,
  overload, vein-glass, blood, steel and bone families are not in the target, so
  the ground cannot be powered by accident.
- **`copper-300` zero everywhere, including where it was wanted.** The rail head
  specular is §5's single most load-bearing pixel on the ground plane and it is
  absent. Rail still reads, in cool grey against warm ballast, and the engine's
  old placeholder rail strips were removed rather than left on top of the
  delivered art — see §B.5.
- **Ambiguous quantizations, 413–1021 px of 512/1024.** C.8.2 says do not proceed
  past a non-empty ambiguous list. We proceeded, deliberately and for the same
  reason the sprites did: the alternative is shipping flat vertex colour. The
  numbers are high here because a photographic ground texture is *all* midtone
  drift — there are no flat areas to be unambiguous about — and because terrain is
  the surface with the most near-black in it, which is exactly the
  `soot-900`/`umber-900` collision `allowed` exists to fence. The `allowed` lever
  was used as far as it usefully goes.

## B.4 What the owner should regenerate, in priority order

1. **`water-top`, twice over.** It has no verdigris in it and does not read as
   water; and only one of the two frames arrived. §5 wants a `verdigris-700` body
   with two 4-master-pixel `verdigris-500` shimmer bands, crisp horizontal lines,
   no reflection and no caustics — the filaments in the delivery are 1–2 master
   pixels wide and the 4:1 reduction eats them. This is the only face where the
   textured board is **less** legible than the flat colour it replaced, and it is
   the first thing to redraw. Deliver both frames, bands at different heights.
2. **`impassable-top` and `impassable-side`.** §5: `soot-900` almost flat, the
   barest `soot-800` grain, no courses, no strata, nothing whose height a player
   could try to measure. What arrived is warm rock and rubble with a cut line, and
   it is the loudest material on the board — it wins the contest for the eye
   against the units, which the shared spec says is the one thing a ground
   texture must never do. It is also close enough to `rough-top` to be confused
   with it, which costs a real tactical read (impassable vs. costly-to-cross).
3. **The rail head specular.** Two `copper-700` rails 16 master pixels wide with a
   4-pixel `copper-300` specular along the upper edge. The delivery's grey rails
   are legible but they are not the promised shine, and `copper-300` is reserved
   for them alone, so nothing else in the set can carry it.
4. **`rough-side`'s interrupted band.** Draw it broken into irregular segments over
   roughly half the width. As delivered the band is unbroken, so the cut face does
   not tell the player this ground costs more to cross.
5. **The strata band colour.** All four bands should be flat `soot-300`. Two are
   flat but one ramp step dark (`soot-500`, `umber-500`); two are not flat.
6. **Draw the cells at nominal aspect.** Tops square, sides exactly 2:1.
   `plain-side` currently arrives 12.8% narrow and is stretched to fit.
7. **`plain-top`'s grit distribution.** The only real top seam in the set: the grit
   is bottom-weighted, so tiling shows a faint horizontal band once per tile
   (N/S ratio 2.60). Spread the grit evenly and it goes away. `water-top`'s
   E/W 2.06 is on the same list and is fixed by redrawing it anyway.

## B.5 Engine decisions the intake had to make

The renderer had no `uv` attribute and no tileset before this pass. Four decisions,
recorded because D.4 left them open and because the art depends on them:

- **Nine textures, not an atlas.** ≤9 draw calls on a board that is one merged
  mesh, against two things an atlas cannot pay for: `RepeatWrapping`, which is
  what the tall-face rule below needs, and edge-clean mip levels, since a tiling
  texture's edge pixel's true neighbour is the pixel on the opposite edge and any
  atlas padding is a lie about that. The maps actually use three to five groups.
- **A tall face is one quad with `v` running 0..N.** §5: "a column of height N
  stacks N side tiles." One quad per face against a repeating texture gives the
  same texels as N quads at a sixth of the vertices, and it puts the strata cut
  line at the top of every height step — which is the point of the band, because
  that is what makes a four-step drop countable without moving the cursor. The
  skirt is `SKIRT_DEPTH / HEIGHT_STEP` = 3 whole steps, so it lands square too.
- **32 texels per world unit, on every face.** A top is 32 × 32 across 1 × 1; a
  side is 32 × 16 across 1 × HEIGHT_STEP. One ruler, asserted in
  `tests/render/terrain.test.ts`, so there is no zoom at which the ground changes
  density between a top and the face under it. Mip chains are supplied rather than
  generated (`gl.generateMipmap` clamps at the edge); `NearestFilter` magnifies,
  trilinear minifies, matching the sprite sheet.
- **The water shimmer is an engine translation, not a repaint.** With one frame
  delivered instead of two, `water-top` is the one texture whose `offset.y` is
  animated: the whole surface steps one texel and back on the brief's 30-tick
  beat, which puts the shimmer bands at two different heights without touching a
  pixel of the owner's painting. Verified alternating in live GL. When the second
  frame lands, `WATER_SHIMMER_TICKS` in `src/render/terrainTextures.ts` is what it
  replaces.

The three strata still come from light alone: one set of nine textures serves the
Rise, the Works and the Underveins, and the Underveins board (Tallow Row) reads
darker than the Works boards with no per-stratum art, exactly as §1 and D.4 say it
should.

# Part C — Wave 1 map objects

The brief is `art-src/OBJECT_BRIEFS.md`; the binding spec is `ART_DIRECTION` §6
and D.6. First delivery of the set: `art-src/flux_main.png` (576 × 328), the
three faces of the **flux main** — long side, short end, top — on transparent
ground, with corner guide brackets and a swatch row below them.

Regenerate the numbers with:

```
npx tsx tools/ingest-objects.ts --dry                            # report only
npx tsx tools/ingest-objects.ts                                  # rewrite src/art/masters/objects.ts
npx tsx tools/ingest-objects.ts --dry --png .art-review/objects/masters   # + 8x previews, all four states
```

`tests/art/objects.test.ts` re-runs the whole path against the delivered PNG,
compares it byte for byte with the committed grids, and pins every number in
§C.3. `tests/render/objects.test.ts` pins the `spriteId` wiring and
`tests/content.test.ts` pins which map objects are allowed to wear it.

## C.1 Verdict against the brief

**The cleanest delivery this project has taken in.** Every other intake in this
file proceeded past a non-empty `ambiguous` list and said so; this one does not
have to. The art arrived **palette-exact at exactly 4×** — nine colours, all of
them values the brief lists, every 4 × 4 block uniform, alpha strictly 0 or 255 —
so the 4:1 box filter is lossless, `movedCount` is **0 of 6656 pixels**, and the
`ambiguous` list is **empty** rather than merely short. C.8.2's bar is met
literally for the first time.

| Face | Read | Colours (ceiling 8) | Amber | `copper-500` | Verdict |
|---|---|---|---|---|---|
| `long` 64 × 48 | **Right.** Braced cast frame in `copper-700` over a `soot-700` plinth, two stacks of insulator bells and bus risers either side of the carrier column, plinth drawers along the base | 8 — **exactly at the ceiling** | 96 px, **3.13%** of the face, one continuous column, full 48 rows | 26 px, one cluster, rows 33–40 | **Ship** |
| `end` 32 × 48 | **Right.** The braced end of the same frame, a triangular truss over the plinth drawer. Reads as the short side of the long face and not as another object | 4 | none | none | **Ship** |
| `top` 32 × 64 | **Right.** The bell stacks seen from above either side of the bus channel, with the riser head breaking the surface | 7 | 16 px, 0.78% | none | **Ship, minor** |

Three things the table cannot carry:

- **The identity read works, and it is the whole point of the set.** At default
  zoom on the Meter House a main is separable from a switchboard without
  hovering, on all three of the cues §1 ordered: it stands 1.5 world units
  against the boards' ~1.0, it is the only object on the board with a
  full-height amber column, and it is massive at the base where a board is a
  thin cabinet. Verified in live GL — `.art-review/objects/` (gitignored).
- **The `copper-500` rule holds by measurement, not by inspection.** `#a5622f`
  appears on exactly one face, as exactly one connected cluster of 26 pixels,
  and nowhere else on the object. That is §6's most load-bearing rule and it is
  the first delivery in which it is checkable rather than asserted.
- **`copper-300` appears nowhere**, and unlike the terrain set that is a real
  finding rather than a construction: the copper ramp is *in* this object's
  quantization target on purpose, so a stray specular would have landed and the
  audit would have rejected it. The rail head keeps its reservation.

## C.2 Cell location in the delivered sheet

The three crop rects are **hand-measured off this one file and declared** in
`src/art/objectSheet.ts`, the same honesty `tileSheet.ts` uses. What keeps them
honest is different from the terrain set's, because the sheet is different: there
are no frame rules and no inset lines to read, and there is no need for them.

| Check | Method | Result |
|---|---|---|
| Size | The rect must equal the brief's 4× size for that face, or the cut throws | 256 × 192, 128 × 192, 128 × 256 — exact on all three |
| Fence | The 1px ring just outside the rect must be fully transparent | 0 opaque pixels on all four edges of all three cells |
| Fill | The rect's own opaque bounding box must *be* the rect | flush on all three; no slack |
| Alpha | Values strictly between the two modes are counted, never resolved by guess | **0** partial-alpha pixels |
| Accounting | Every opaque pixel on the sheet belongs to a cell, to the declared swatch row, or is reported | 177 px unaccounted — the six corner guide brackets, and nothing else |

Found automatically, without being told where the cells are (opaque-run sweep):

| Axis | Runs |
|---|---|
| columns | 4–12, 16–415, 420–428, 432–559, 564–572 |
| rows | 4–12, 16–271, 276–284, 288–311 |

Declared:

| Face | Crop rect | Delivered aspect | Nominal |
|---|---|---|---|
| `long` | 256 × 192 @ (16,16) | 1.333 | 1.333 |
| `end` | 128 × 192 @ (288,16) | 0.667 | 0.667 |
| `top` | 128 × 256 @ (432,16) | 0.500 | 0.500 |

**Every cell is at nominal aspect**, which the terrain set was not on a single
face. Nothing is stretched to reach its master size.

The swatch row (216 × 24 at (180,288), nine 24 px squares) is declared as
*reference and not a cell*, which lets the intake cross-check it: the nine
swatched colours are **exactly** the nine the three cells use, with none missing
and none spare. `soot-800`, `soot-700`, `soot-500`, `copper-700`, `copper-500`,
`amber-700`, `amber-500`, `amber-300`, `amber-glow` — the brief's list minus
`soot-900`, the whole umber ramp and `copper-300`, none of which the painting
needed.

## C.3 Audit, per face

One resample, not the terrain flow's two: the delivered cells are already at
exactly the brief's 4× size, so landing on a nominal master first would be a
no-op. Quantization targets **this object's own ramp** — soot + umber + the full
copper ramp + amber — and `fitMasterToCanvas` is deliberately not used, because it
measures a figure and stands it on an anchor row and a machine face has neither.

| Face | Shipped | Colours | Amber / budget | Amber share | Column rows | Column cols | `copper-500` | `copper-300` | Reserved | Off-ramp | Quantized | Ambiguous | Glow off core |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `long` | 64×48 | **8** | 96 / 122 | 3.13% | **48/48** | 31, 32 | 26 px ×1, rows 33–40 | 0 | 0 | 0 | 0/3072 | **0** | 3 |
| `end` | 32×48 | 4 | 0 / 61 | 0.00% | 0/48 | — | none | 0 | 0 | 0 | 0/1536 | **0** | 0 |
| `top` | 32×64 | 7 | 16 / 81 | 0.78% | 4/64 | 14–17 | none | 0 | 0 | 0 | 0/2048 | **0** | 0 |

**What each column costs downstream:**

- **Colours 4–8 against a ceiling of 8.** Nothing is over. The long face is
  *exactly* at it, which is worth knowing before Wave 2 revises it: there is no
  headroom for a tenth colour anywhere on this object.
- **Amber 3.13% against 4%.** The brief costed the column at "about 3% of a
  64 × 48 face" and it came in at 3.13. The carrier is **two** game pixels wide,
  not one — a 1px `amber-700` recess beside a 1px `amber-500` body — which is
  what makes it 3.13 rather than 1.6, and it is inside budget, so nothing is
  wrong with it. Recorded so the cable trough's filament is not drawn two pixels
  wide by analogy: that brief costs one, over a nine-tile run, deliberately.
- **The column is continuous over all 48 rows and confined to two columns.**
  Measured, not eyeballed: every row of the long face carries amber and every
  amber pixel on the face is in column 31 or 32, dead centre of the two-tile run.
- **`copper-500` present on exactly the one face the brief gives a control, as
  one cluster.** The audit tests presence against the spec's `control` flag in
  both directions, so a handle on the end cap would fail and a missing handle on
  the long face would fail.
- **Amber, reserved ramps and off-ramp are all zero where they should be.** The
  overload, vein-glass, blood, steel and bone families are not in the target, so
  a machine cannot acquire a signal colour by accident; the end cap carries no
  amber at all and the audit would reject one there under a `powered: null`
  authoring.
- **Three `amber-glow` pixels sit off the core.** See §C.4 item 1. The only
  warning in the whole delivery.

**The states, as generated.** Only the powered painting is stored; §6's other
three are a substitution over five palette steps (D.6). Measured on the long face:
96 amber pixels move in every state and **not one non-amber pixel moves in any of
them** — the cast frame, the plinth and the `copper-500` handle are identical in
all four, which is exactly what "identical shapes, dead" has to mean for the
player to learn that the seam is the power indicator. `amber-glow` count by state:
3 powered, 0 unpowered, 0 destroyed, 0 overloading (12 `overload-100` instead).
The handle does not go out with the light — it is an affordance, not a readout.

## C.4 What the owner should regenerate, in priority order

Nothing here blocks. The face set ships as drawn and the identity read works.

1. **The long face's value separation, for the shades the engine actually
   shows.** `copper-700` frame and `soot-700` panels sit close in value, and
   `soot-500` — the brief's "worked edges" — is only 377 of 3072 pixels, 12% of
   the face. At 62% face shade in the Works' fog the insulator stacks stop
   reading past mid range and the long side flattens to a dark mass; the column
   and the silhouette carry the object on their own. More `#4a545f` on the worked
   edges, or one lighter step in the panels, and the stacks would survive the
   shade. This is the only note with a visible cost.
2. **The reclose handle is drawn at knee height.** Rows 33–40 of 48 put it 0.25
   to 0.47 world units above the plinth; a field sprite is about 1.25 world units
   tall, so a figure standing beside it would be reaching down past its own knee.
   Rows ~22–30 (0.55–0.80 units) is hand height. The audit only checks "lower
   half" — it cannot see a figure — so this one is a human note.
3. **The top face's riser head does not line up with the column.** The long
   face's carrier is dead centre of the run (columns 31–32 of 64); the top's only
   amber is a 4 × 4 lamp at rows 5–8 of 64, about a tenth of the way along it.
   Whichever way the engine turns the object, the two do not meet. Cheap to fix
   and it is the only continuity error between the three cells.
4. **Three `amber-glow` pixels are drawn off the core.** The brief puts the halo
   colour "on the core pixels only", and the column's `amber-300` core is drawn as
   nine intermittent ticks rather than a continuous 1px line, so the three glow
   pixels land between ticks with no core touching them. It reads well — the bloom
   turns them into three tap points up the column — so this is a note about the
   brief and the art disagreeing, not about the result.
5. **Optional: one warm tick on the end cap.** The end carries no amber, so from
   the two of four bearings where a main presents its end to the camera, its only
   warm mark is the top-face lamp. §1 asked for the column on the long face and
   the corner camera always shows one long face, so this is not a divergence — but
   a single `amber-500` terminal pixel would make "is it running?" answerable from
   every bearing.

## C.5 Engine decisions the intake had to make

The renderer read no `spriteId` and had no object textures before this pass. The
decisions are recorded in full as `ART_DIRECTION` D.6, because they are binding
rather than a report; in brief:

- **`spriteId` is the key, and `null` means "keep the primitive".** Objects
  without delivered art are untouched — verified on Foundry Floor Nine, whose
  presses, gantries and switchboards are pixel-for-pixel the primitives they were.
- **One box, six slots, three paintings, built long-axis-on-z and turned.** The
  top cell lands on the one face whose UVs run across-by-along at every
  orientation, with no rotated copy of the painting.
- **A state is a substitution over the amber ramp; only the powered face ships.**
- **A painted carrier needs an emissive map, because a painted seam is texels
  inside a face the engine is already shading.** This was found in live GL: the
  first build painted the column and stopped there, and a main's bus read as a
  dull ochre stripe at 62% shade where the placeholder's emissive seam bars had
  blazed. The mask is the carrier's seam, core and halo only — a recess is a
  shadow and does not emit — and it is `null` in the two states §6 gives no halo,
  which is where "no halo, no pulse" lives.
- **The halo is still the bloom pass's**, via the same `emissiveKeyMaterial` the
  unit sheets use, so the brief's "paint no glow" holds and an overloading main
  halos on `overload-100` with no extra code.

**Content follow-up, done.** `OBJECT_BRIEFS`' recorded follow-up was that the two
mains should say what they are. `meter-house.json`'s `west-main` and `east-main`
— the two objects `meter-house-grid` declares `role: "source"` — now carry
`spriteId: "flux-main"`. The four other `switch-board` uses are untouched: two are
the map's `breaker` switchboards, and `foundry-floor-nine`'s `floor-nine-mains`
and `refinery-three`'s `switchboard-main` are on no grid at all and are not
sources, whatever their names suggest. `tests/content.test.ts` now fails if a
delivered `spriteId` lands on anything but a source, if a source is still wearing
`switch-board`, or if a footprint does not match the massing the art was drawn for.
