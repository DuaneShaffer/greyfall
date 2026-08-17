# Field-sprite intake log

What was delivered, what the audit found, and what shipped anyway. One entry per
job. The rule this file lives by is `ART_DIRECTION` C.8.2: **the intake reports,
it never repairs.** Nothing below was fixed by hand; where the delivery diverges
from its brief, the divergence is written down and the art ships as drawn.

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
