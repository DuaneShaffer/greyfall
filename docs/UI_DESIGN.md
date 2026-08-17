# UI Design — Greyfall

How the interface is built, so the next pass does not drift. `docs/ART_DIRECTION.md`
governs colour and is binding on everything here; `docs/CREATIVE_BIBLE.md` §5.5
governs the words. This document records the decisions those two leave open:
type, panel anatomy, hierarchy, affordances, and the input contract.

The code is `src/ui/**` (components and `styles.css`) plus the app-side seam in
`src/app/{controller,viewmodels,main}.ts`. No hex is authored outside
`src/art/palette.ts`; `styles.css` mirrors its values as `--gf-*` tokens with the
canonical name in a comment beside each.

**Sections 1–11 are the interface's behaviour and remain binding. Section 12 —
*The chrome* — is how it is built out of materials, and supersedes the flat
construction §4 and §1 originally described.** Where the two disagree about a
fill, a border or a shadow, §12 wins; where they disagree about what a panel
*says* or *does*, §1–11 win, always.

---

## 1. The voice

**The UI is a form issued by a standards bureau.** The Assay Sodality meters,
licenses, surveys and files; the player is reading its paperwork over a
battlefield. Practically that means:

- Plates, not headers. Every panel wears a stamped title bar.
- Ledger columns, not sentences, for anything countable.
- Flat fills, hairline rules, a 1px ink drop line. No gradients, no radii, no
  blurred shadows (ART_DIRECTION §2, binding).
- The one place the register softens is **prose**: dialogue and item/ability
  descriptions are typeset, not stamped. The record of a person is written; the
  machine's readout is punched.

## 2. Type

Three system stacks, three jobs. No web fonts, no downloads — the game ships one
CSS file and no font payload.

| Token | Stack (first hits) | Used for |
|---|---|---|
| `--gf-face-stamp` | Liberation Sans Narrow → DejaVu Sans Condensed → Arial Narrow → system-ui | plate titles, labels, menu rows, buttons — everything stamped |
| `--gf-face-record` | Liberation Serif → Nimbus Roman → DejaVu Serif → Georgia | dialogue, descriptions, the end banner's note |
| `--gf-face-ledger` | DejaVu Sans Mono → Liberation Mono → ui-monospace | figures only: costs, ticks, meters, deltas, tile coordinates |

Monospace is **not** the interface font. It is a column alignment tool, used
where numbers stack.

**Scale** (fixed `px`; this is product UI, not a marketing page — no fluid type):

| Token | Size | Role |
|---|---|---|
| `--gf-t-100` | 10px | serials, tick counts, chips |
| `--gf-t-200` | 11.5px | labels, plate titles, hints |
| `--gf-t-300` | 13px | base |
| `--gf-t-400` | 16px | panel subject (unit name, ability name) |
| `--gf-t-500` | 20px | the dominant number (hit %) |
| `--gf-t-600` | 24px | screen title (added by §12.5) |
| `--gf-t-700` | 30px | end banner |

Steps are ≥1.25 apart at the ends of the range; weight does the rest (400 body,
600 labels and subjects, 700 banner and buttons). Tracking is `0.22em` on plates
(`0.18em` before §12.5 gave the engraved faces room) and `0.1em` on labels — uppercase is only ever used on short labels, never on a
sentence. Dialogue prose runs 17px/1.6 with a 68ch measure; all other prose caps
at 56–60ch.

## 3. Space

4pt scale, semantic names: `--gf-s-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24,
`-6` 32. Panels use `-2`/`-3` internally; screens use `-4` between blocks. Rhythm
comes from varying these, not from padding everything equally.

## 4. Panel anatomy

Every surface in the game is the same object, so the player learns one shape:

```
┌─────────────────────────────────────┐
│ PLATE TITLE                  STAMP  │  .gf-plate  — stamped, uppercase,
├─────────────────────────────────────┤              right-hand stamp optional
│ body                                │  .gf-panel-body (or bespoke sections)
└─────────────────────────────────────┘  1px border + 1px ink drop line
```

Build one with `panel({ title, stamp, variant, children })` or compose
`plate(title, stamp)` yourself. The right-hand **stamp** carries one fact about
the panel — the team of the unit, the number of entries, the slot being edited —
never decoration.

Three weights, and only one `is-live` on screen at a time:

| Variant | Border | Plate | Meaning |
|---|---|---|---|
| `is-live` | `amber-700` | amber ground, amber text | the decision the player is making now |
| (default) | `soot-700` | plate ground, body text | present and readable |
| `is-quiet` | `soot-700`, translucent ground | transparent plate, dim text | reference: the queue, the hovered unit |

The *meanings* above are binding; how each weight is drawn is §12.3's, which
replaced the translucent ground with an elevation change and the plate strip
with a bronze nameplate.

## 5. Colour, and where amber is allowed

The palette is ART_DIRECTION §2's. The scarcity rule is enforced by *usage*, not
by tint: on a normal battle frame amber appears in exactly three places —

1. the cursor row of the active menu (`is-selected` on the live menu),
2. the charge meter (the UI reporting a charge state, which §2 permits),
3. the single COMMIT stamp on the forecast.

Everything else is soot with reserved accents:

| Colour | Reserved for |
|---|---|
| `copper-500 / 300` | operable machinery — the Operate entry, machine names, the operate acknowledgement. Nothing else. |
| `steel-400` | the player's units and their move range |
| `blood-300 / 500` | enemies, refusals, the loss banner |
| `overload-500` | charging casts and flux-borne statuses |
| `verdigris-300 / 500` | health, buffs, deployment tiles |
| `hazard` | environmental status only |

Greyed entries explain themselves in **dim**, not red: a disabled row is
information, and the danger colours stay reserved for a refusal the player just
triggered.

## 6. Hierarchy — the battle HUD

Grid areas, and the order the eye is meant to travel:

```
┌──────────┬──────────────┬────────┐
│ inspect  │   notice     │ clock  │   inspect: hovered unit (quiet)
│          │              │ (quiet)│   notice: transient feedback
│  order   │   forecast   │        │   order:  ACTING plate + ORDERS menu (live)
├──────────┴──────────────┴────────┤   forecast: the consequence (live)
│            dialogue              │   clock:  turn order, then the POWER
├──────────────────────────────────┤            register on maps that have one
│            mode bar              │
└──────────────────────────────────┘
```

1. **The order column** is one object: the acting unit's plate sits directly on
   top of its order menu, sharing a border. Who is acting and what they may do is
   a single read, in the corner the player's hand already is.
2. **The forecast** answers it from the other side of the field.
3. **Queue and inspect card** are `is-quiet` and never compete.
4. **The mode bar** always names the current mode and what it wants.

The inspect card only appears for a unit that is *not* the actor — the acting
unit already has a panel, and printing it twice was noise.

**The power register** is a quiet ledger under the queue: one row per machine
whose power something on the map can throw, name on the left, LIVE or DEAD on
the right, in copper. It exists because power was the one piece of map state
with no readout at all — the only cue that Floor Nine's mains had been cut was
the Operate entry greying out on a unit that happened to be standing beside a
press. Maps that switch nothing draw no register.

On a map that declares a **flux grid** (`COMBAT_RULES` §14a) the register grows
a section per network, and the right column widens to exactly one of LIVE /
DEAD / OPEN / CUT / DESTROYED / TRIPPED / TIE OPEN / TIE CLOSED — a thrown
switch, a cut span and a wreck are different problems with different answers, so
they are different words, and only two of the three have an answer at all.
Sections run in grid-id order and then the ungridded machines; inside a section,
sources, then breakers and ties, then lines, then sinks, each by object id, so
the register never reshuffles under the player's eye (`COMBAT_RULES` §17).

**Inside a section the rows are grouped by bus, and the LOAD line belongs to the
bus rather than to the network.** A network is not a circuit; the switches
decide how many circuits it currently is, and an open tie makes a house into two
of them. The register groups each connected component, heads it with what feeds
it ("West Main", "West Main + East Main", or *Unfed*) and its own
`LOAD load/capacity`, and lists that component's nodes underneath in the order
above. **That header wraps rather than ellipsizing**: it is the one place the
register names what feeds the bus, and `EAST MAIN + WEST…` hides the second
source in exactly the line that exists to name it. Nodes conducting nothing — switched out, cut, wrecked — are grouped last
as **Out of circuit**, with no arithmetic, because they are on no bus to have
any. Groups run by their lowest node id, so the grouping is as stable as the
ordering inside it and rows move only when the topology actually moves — which
is the thing the player most needs to see.

Summing components was the bug this replaced: a house running as two halves at
10 of 14 read `LOAD 20/28`, a number describing a circuit nobody was standing
in, and a house whose feeds were both gone read `16/28` in copper, at rest. **A
component with no rating prints no LOAD line at all**, and that absence is the
readout at its most useful: nothing feeds this, so there is nothing left to read
against.

The **LOAD line** — `LOAD load/capacity`, what a bus is carrying against what it
is rated for — is the single most important addition the grid made to this
interface: it is what turns a trip into a decision the player can plan instead
of a surprise they absorb. Its colour is the one place the register spends
anything but copper and dim:

| state | colour |
|---|---|
| under 90% of the rating | `copper-300` — a bus is machinery like any other |
| 90% and over | `overload-500` — already the colour of flux-borne state, which is precisely what a bus at its rating is |
| over 100% | `blood-300` |
| tripped, whatever the ratio | never copper: a bus that has blown is not a bus running quietly |

**A tripped bus never reads at rest, and says how much of its rating is still
closed.** On a house running on two mains they can latch one after the other —
the east one carrying both halves through a closed tie, the west one the moment
the feeder is put back and it inherits the same bus — and the group then
contains both of them. Its rating is their sum, so it read `LOAD 18/28
TRIPPED` in copper: a blown circuit painting its load as headroom, and a number
that is only true of a house whose every main has been reclosed. The figures
stay what the component is carrying against what it is rated for, because that
is the arithmetic the annunciator quotes; what goes is the claim that this is a
bus at rest, and beside them the header prints `0/28 closed` — the part of that
rating a reclose actually has to beat. On a bus holding all of its rating the
clause is absent, so it appears exactly where it is load-bearing.

Thresholds are integer comparisons against the same numbers printed beside
them, so the colour can never disagree with the figure. §5's scarcity rule
survives literally: amber still appears in exactly its three places, copper is
still reserved for machinery, and blood is spent once — on the number that
caused the trip, not on the rows that went dark for it. The seams on the
battlefield read the same arithmetic off the same components, so a bus at rest
and a bus past its rating can be lit differently on one floor at one moment,
and a bus with nothing feeding it is painted dead rather than overloaded.

**The inspect card answers for machinery too.** The quiet card under the notice
slot takes whatever the cursor is over: a unit, or — when no unit is standing
there — the machine on the tile, reading its name in copper, what it is on the
bus ("Source · rated 14", "Sink · draws 4", "Cable run", "Breaker") or off it,
its power state in the register's own word, and its integrity. On a map where
the machines are the terrain, "what is this and is it being fed" was a question
only the register could answer, by name, about something the player was already
pointing at.

## 7. Modes

`HudMode` (`src/ui/state.ts`) is the UI's account of what the game is waiting
for; the controller announces it on every phase change and every selection
change (`UiPort.setMode`). The mode bar stamps its name, says what it wants in
one sentence, lists only the controls that apply, and — for modes the player
entered on purpose (`move`, `target`, `facing`) — offers a **Withdraw** button.

| Mode | Colour | Orders menu |
|---|---|---|
| `orders` | amber | live |
| `move` | steel | live |
| `target` | blood | live |
| `facing` | amber | live |
| `dialogue` / `presenting` / `ai` / `ended` | dim | inert (`is-busy`) |
| `deploy` | verdigris | — (between-battle) |

## 8. Affordance rules

- **Everything the keyboard can do, the mouse can do.** Hover moves the menu
  cursor, click confirms, right-click cancels, and every mode with a way in has a
  visible way out. This is a contract, not a nicety: it is the bug the interface
  shipped with.
- **The camera's bearing is one of those things.** The rig turns in 90° steps on
  **Q / E**, on **middle-drag** (one quarter per ~110px of travel), and on the
  **⟲ / ⟳ pair in the mode bar**. Right-drag is deliberately not it: right-click
  already means withdraw. This is not a convenience — at one fixed bearing the
  taller geometry occludes whole columns of the board from the terrain raycast,
  and on the Meter House the entire East Main could not be picked with the
  pointer at all. The parity claim is measured rather than assumed: every tile
  is reachable from at least one of the four bearings
  (`tests/render/orbitReach.test.ts`).
- **The cursor never rebuilds the list.** `MenuStack.setCursor` is a no-op when
  the index has not changed, and `refresh` patches in place unless the entries
  themselves changed. Rebuilding under a resting pointer destroys the node that
  is about to receive `mousedown`.
- **Disabled means visible and explained.** Greyed row, dim reason, tooltip.
- **Inert means it stops looking live.** A menu row under an open submenu takes
  no input, so it carries `is-inert`: no hover fill, no pointer, and the row the
  player descended through reads as a trail rather than a pending selection.
- **Refusals are non-modal.** A brief notice in the annunciator slot, in the
  register: "No path there", "Out of reach", "Field Repair cannot target that".
- **The annunciator keeps a short scrollback.** The slot holds one line, and the
  lines it displaces stack under it, dimmer, newest first, each on its own
  clock, out of the live region and taking no pointer. A single slot was fine
  while a notice was one machine answering a click; it stopped being fine when
  the strip became how the grid explains itself, because an enemy turn that
  cuts a span, trips a bus and drops a lift deck is three lines and the player
  saw the third. A demoted line **wraps to two lines and is held ~6.8s** — long
  enough that a whole enemy batch is still readable once the batch has finished
  arriving, and wide enough that the closing clause survives. Clipping it was
  worse than losing it: an ellipsis takes the answering verb off the end of
  "Someone has to reclose it" and leaves a sentence that looks finished.
- **Every order the player can send says what it would do before it is sent.**
  Aiming an ability marks the tiles it covers and, on a grid, the component it
  would flip; the forecast panel reports the whole order. Operate has no aim
  step, so the Operate menu's cursor does that job instead: resting on a machine
  forecasts the order off the real recompute and marks what it would flip, and
  the panel's stamp sends it. An order with no preview is an order the player
  learns by spending a turn on it, and on a grid the cheapest verb was the one
  with none.
- **An order the rules will refuse is never offered.** The aim overlay lights
  only what the command layer would accept, and the two ask the same question:
  a multi-tile machine answers on any of its own tiles, and an order with
  nothing to act on — an isolator thrown at a stack of drums — is not lit, is
  refused by name, and costs nothing. A stamp that commits and then does
  nothing is worse than a stamp that is not offered.
- **A panel never offers what it cannot do — and never hides what it can.** A
  forecast with no targets says so and its stamp is dead; a committed forecast
  keeps its numbers and loses its stamp, and holds them through the redraw that
  follows until a new order is staged; a closed battle empties the queue rather
  than listing the dead. The converse binds equally: an order whose whole payload
  is a machine laid on an empty tile has an outcome and no target rows, and must
  still offer its stamp.
- **The forecast reports the whole order.** Damage, healing, status rolls, stat
  grants and their window, a cleansed status, a shove, a machine placed. A row
  that deals no damage prints no damage line at all — "Damage —" beside a
  three-turn buff reads as "this does nothing".
- **Machinery answers.** Operating an object prints what was operated and what it
  did to the rest of the floor, in copper; power that changes without the player
  throwing anything is announced the same way, naming the switch that carries it.
- **On a grid, the annunciator names the cause *and* the verb that answers it.**
  "North Bus cut. 4 machines dark. Splice it or take the gallery tie."
  "Refinery main tripped — 14 against a rating of 12. Someone has to reclose
  it." The register tells the player the state; this tells them what to do
  about it, because a mechanic whose counterplay has to be inferred is a
  mechanic that measures well and plays badly. The verb is asked of the rules
  rather than guessed: a tie is only offered when closing it would actually
  bring something back.

## 9. Placeholder portraits

Painted portraits are the open art workstream (ART_DIRECTION §4, A.9). Until they
land, `portrait()` draws a designed stand-in rather than hatching: a monogram
record card — initials in the stamp face, a job-initial tab, a 1px team-tint rim,
a punched corner, and a faint photostat grid. Sizes are `small` (22–24px, queue
rows), default (40px, panels) and `large` (64px, dialogue and records). When real
art lands it replaces the inside of this one function.

## 10. Between-battle screens

Same system, page-shaped: a title block, a two-column body (list + record), and a
footer that says what the screen is for. The list carries one fact per column
(name, job + level); everything else belongs to the record beside it. Formation
is the exception — it runs as a rail over the live battlefield, and only its
chrome takes the pointer so the map stays clickable.

## 11. Testing the interface

`tests/ui` covers components against `src/ui/mock.ts`; `tests/app` covers the
seam (`viewmodels`, `controller`, `betweenBattles`) with fake ports. The
behaviours that are easy to regress and expensive to notice have their own tests:
cursor movement must not rebuild nodes, a click must survive a no-op refresh, the
turn order must name exactly one "Now", the forecast must lock on commit, and the
final frame must carry an empty queue.

---

# 12. The chrome

The interface passed acceptance on what it says and refuses to say. It failed on
what it is made of: eleven rectangles of `#171c22` with a hairline round them,
which is a dashboard, not a game. This section replaces the *material* of the
interface without touching a word of §1–11. Everything below is programmatic —
CSS, inline SVG in `data:` URIs, layered shadows. No image files, no fonts, no
dependencies, and no representational art.

## 12.1 The thesis: an instrument case, not a form

§1 said "a form issued by a standards bureau" and the CSS took it literally: a
form is flat, so the UI was flat. The fiction is better served one step out. The
player is not holding the Assay's paperwork; they are reading it **off the
Assay's field instrument** — an iron case that opens over a battlefield, with
bronze-fitted plates bolted into it, gauge windows recessed behind bezels, and
grey pulp record cards tipped into the lid. The paperwork is still there. It is
now inside a machine, and the machine is a made thing.

Three consequences, and they are the whole spec:

1. **Every surface is a material with a thickness.** Nothing is a fill with a
   line round it. A plate has an edge you could catch a fingernail on; a card is
   laid *on* a plate and casts a shadow; a trough is cut *into* one.
2. **Light comes from the top, always.** Every bevel, emboss, rivet and rule in
   the interface is lit from directly above. One violated highlight and the
   whole case reads as decals.
3. **The materials are the world's.** Blackened iron, tarnished bronze, grey
   pulp stock, punched lead. Copper stays reserved for machinery and amber stays
   reserved for flux — see §12.6, which re-derives the scarcity rule rather than
   grandfathering it.

## 12.2 The material vocabulary

Five materials. Everything in the interface is exactly one of them, and which
one is a semantic decision, not a styling one.

| Material | What it is | Built from | Carries |
|---|---|---|---|
| **Iron plate** | the structural panel — a sheet bolted into the case | soot-800 ground, plate grain, four-step bezel with a bronze liner, bronze corner straps, hard drop | every panel: acting, orders, forecast, clock, notice, mode bar, screen frames |
| **Bronze fitting** | the worked metal *on* a plate — nameplates, the cursor, the stamp | umber-900 → umber-500 → umber-300 gradient, 1px light crown, two end rivets, engraved text | plate titles, the menu cursor, buttons, the advance prompt |
| **Grey pulp card** | the filed record — paper, in a city where paper is grey | soot-700 warmed toward umber-700, paper tooth, cut edge, own shadow | dialogue prose, item/ability descriptions, detail text, results record, campaign file |
| **Gauge window** | a recessed readout behind a bezel | inset dark at top, light line at bottom, a glass sheen | meters, ledger figure columns, menu list troughs, the turn-order rail |
| **Punched lead** | the authenticating mark — a seal, a stamp, a punched hole | flat disc or cartouche, hard emboss, no gradient | the file seal, the FILED mark, the results verdict, the portrait's corner punch |

**Bronze is not copper and not amber.** This is the load-bearing decision of the
whole pass. FFT-register ornament wants gold; Greyfall has already spent gold
twice — `copper-500` is the operable-machinery affordance (ART_DIRECTION §2 rule
5) and the amber ramp is flux. So the chrome's precious metal is drawn from the
**umber ramp**: tarnished bronze, warm but dark, never emissive, never bloomed.
It sits at a value the amber ramp never occupies and reads unmistakably as
*worked metal that is not lit*. The fittings on the Assay's case are bronze; the
machines on the floor are copper; the flux in both is amber. Three metals, three
meanings, no collision.

**Grey pulp, not cream paper.** A record inset wants paper, and paper wants to
be light — which would blow a dark interface apart and put a colour on screen
that is in no ramp. The Works has ash-fall for weather. The Assay files on grey
pulp stock: `soot-700` pulled a few percent toward `umber-700`, tooth texture,
`soot-100` ink. It reads as card the moment it has an edge and a shadow, and it
never fights the plate for luminance.

## 12.3 Construction: the plate stack

Every panel is the same object, built out of six layers of `background` and
`box-shadow` on the element itself plus one overlay pseudo-element. **No
ornament needs a wrapper or a new node** — which is why this pass rebuilt the
whole interface in materials without touching a single component's markup, and
kept every behaviour test with it.

```
  ┌ 1  drop      1px ink ring + hard 0/2px step + 3px of settle — the plate sits proud
  │ 2  bezel     inset: soot-300 crown on top, ink shade below, bronze liner all round,
  │              and a 16px inner vignette so a wide plate is not one flat value
  │ 3  straps    2 inline-SVG bronze corner straps at the foot, as a ::before overlay
  │              (ornate panels only) — an overlay because a footer or a trough
  │              painted over them when they were a background layer
  │ 4  grain     feTurbulence tile at 8% alpha over the ground
  │ 5  sheen     one 177° gradient, ~5% light at the top edge, gone by a quarter down
  └ 6  ground    soot-800
```

The nameplate carries the rivets — two bronze domes at its ends — because the
plate's own top corners are under it, and a screwed-on nameplate is where rivets
belong anyway.

Every layer is driven by a `--gf-*` token, so a variant changes a token rather
than a shadow list. The weights of §4 survive exactly:

| Variant | Stack |
|---|---|
| `is-ornate` (and the forecast, turn order, dialogue, screen header, end banner) | all six layers plus the straps |
| (default) | layers 1, 2, 4, 5, 6; no straps |
| `is-quiet` | the bezel, grain and ground at reduced contrast; no drop — a quiet panel is *flush* with the case rather than proud of it, which is a cleaner way to say "subordinate" than turning its ground translucent |
| `is-live` | default stack, plus the lit window (§12.6) |

### The nameplate

`.gf-plate` stops being a darker strip and becomes a **bronze nameplate screwed
onto the plate**: a bronze gradient band, a 1px umber-300 crown on its top edge,
a hard ink line under it, and the title *engraved* — `text-shadow` dark below
and a 6% light above, which is the only way type reads as cut into metal rather
than printed on it. Tracking goes to `0.22em`; the right-hand stamp keeps the
ledger face and sits in its own small punched recess.

### Engraved rules

Every `1px solid` divider in the interface becomes a **groove**: 1px ink over
1px `soot-500` at 30%. Same box, same cost, and the difference between a
dashboard and an object is almost entirely this.

### Troughs

Any list, meter or figure column is cut into its plate: `inset 0 1px 2px ink` at
the top, `inset 0 -1px 0 soot-500/25%` at the bottom, and a ground one step
darker than the plate. Menu lists, meter tracks, the turn-order rail and the
POWER register's node lists are all troughs.

### Cards

`.gf-card` is the grey pulp inset: a cut edge (1px light at the top, ink at the
bottom), a soft own-shadow onto the plate under it, paper tooth, faint ruled
lines and a margin rule, and a **punched top-right corner** — the same diagonal
the portrait slot already wears. That clip is now a shared motif rather than a
portrait quirk: everything in this interface that is *a record of something* is
cut the same way.

It needed no new markup in the end. Three elements are records by nature and
share the rule directly — `.gf-dialogue-body`, `.gf-detail-text` and
`.gf-end-banner-note` — and `.gf-card` is the name the next one uses. **The
whole chrome pass changed no component markup at all**: every layer of it is
`background`, `box-shadow` and two pseudo-elements on classes the components
already emitted.

## 12.4 Depth: five levels, and what may be at each

Elevation is not decoration; it is the answer to "is this thing on, in, or
behind". Exactly five levels exist and nothing invents a sixth.

| Level | Name | Reads as | Shadow rule |
|---|---|---|---|
| L0 | Case | the battlefield itself | none |
| L1 | Plate | bolted into the case | hard drop, 0 2px, no blur past 3px |
| L2 | Trough | cut into a plate | inset top-dark / bottom-light |
| L3 | Card | laid on a plate | 0 1px 3px at 40%, plus a 1px cut edge |
| L4 | Fitting | worked onto a plate | 0 1px 0 crown, 0 -1px 0 shade |
| L5 | Lit window | the live decision | L4 plus an amber rim; only one on screen |

Blur on an **outer** shadow is capped at 3px. This interface shares a frame with
billboarded pixel art at a fixed orthographic scale; a soft outer edge next to a
1px sprite outline reads as a rendering error, and the whole case would go to
mush. Depth comes from *value steps at hard edges*, which is the same trick the
sprites use. Inset vignettes are a different object — they live inside a plate,
never meet a sprite, and are what stops a wide panel reading as one flat value;
they may go to 16px. `tests/ui/styles.test.ts` holds the outer cap.

## 12.5 Typography: same three faces, better execution

The three-face system of §2 is unchanged in its roles and its stacks. What
changes is that type now has a relationship to the metal under it.

- **Stamp face on bronze is engraved.** Plate titles, screen titles, menu
  labels on the cursor row, button faces: dark shadow below, faint light above.
- **The display register gets presence.** A screen title is no longer 20px of
  tracked caps floating on the background; it sits on a **header plate** — an
  iron plate with a bronze crown rail, engraved title at `--gf-t-600` (24px),
  tracking `0.16em`, and bronze straps at its foot. This is the one place the
  interface is allowed to be big, and it is what makes a between-battle screen
  feel like a page in a file rather than a settings dialog. Where a screen
  carries a filing serial — the results and chapter-close records — it is struck
  as a **punched lead tag**, hole and all, in the page foot.
- **Ledger figures live in troughs.** Any stacked column of numbers gets the
  recessed treatment, so figures read as punched.
- **Record face on pulp.** Prose keeps its 68ch measure and 1.6 leading and now
  sits on the card that justifies it. Its ink is `soot-100`; the card is what
  makes serif legible at that size on a dark screen.

New scale step: `--gf-t-600: 24px` (screen titles). The rest of §2's scale is
unchanged.

## 12.6 Amber, re-derived for ornate chrome

Ornament is where a scarcity rule dies: gilt everything and the eye stops
finding the one lit thing. So the budget is re-derived from first principles
rather than carried over.

**The derivation.** ART_DIRECTION §2 rule 1 caps amber at 4% of a frame's pixels
and requires every amber pixel to have an in-fiction source. The chrome's
ornament is *metal*, and metal in this world is bronze and iron — neither is a
flux source, so ornament spends **zero** of the amber budget. That is not a
concession; it is the reason bronze was chosen over gold in §12.2.

Amber therefore appears in exactly the places §5 already allowed, and the ornate
build changes only *how* they are drawn:

1. **The cursor row of the active menu.** The row's ground is the amber ink
   (`amber-900`), its label engraved in `amber-300`, and the bronze cursor
   fitting gains a single `amber-glow` leading edge. The glow is a 1px line, not
   a halo.
2. **The charge meter.** A gauge window whose fill is amber — the UI reporting a
   charge state, which ART_DIRECTION §2 permits by name.
3. **The COMMIT stamp.** One struck bronze plate with an amber-lit face.
4. **The live panel's lit window (L5).** New, and the only growth: the live
   panel's nameplate is backlit — amber ground, amber engraved title — and the
   panel carries a 1px amber rim. **Its body is never amber-filled**, which caps
   the added area at a 20px band plus a rim.

`amber-glow` — the one colour the bloom chain keys on — is spent on exactly two
rules in the entire interface: the cursor's leading edge and the commit stamp's
hover face. Nothing else in `styles.css` may name it, by token or by value, and
`tests/ui/styles.test.ts` counts the rules rather than trusting the discipline.
Everything else that wants to look lit takes `amber-300`.

Copper is untouched and still means machinery: the Operate entry, machine names,
the inspect card's machine readout, and the POWER register, which is the one
panel whose *rules and figures* are copper because a register is an instrument.
Blood, verdigris, overload, steel and hazard keep their §5 meanings exactly.

**Measured, not asserted.** The amber share of a battle frame is measured off
the real app at 1600×1000 the same way sprite frames are (`ART_DIRECTION`
Appendix A.5): count pixels whose nearest palette family is amber, divide by the
frame. The overhaul's acceptance number is recorded in §12.9.

## 12.7 Motion: the cursor is a hand

FFT's cursor is a physical object that arrives at a row. A background-colour
swap is not that. The rules:

- **The cursor is a bronze pointer that travels.** It sits in its own gutter,
  and on a cursor move it slides with a 90ms ease-out and a 1px overshoot that
  settles. It never fades.
- **The selected row lifts.** It gains the L4 crown, translates 2px along the
  reading direction, and its label brightens. Transform and shadow only: no
  layout property animates, so `MenuStack.setCursor`'s no-op discipline and the
  "never rebuild under a resting pointer" contract (§8) are untouched.
- **Hover is a lighter version of the same gesture** — the trough brightens and
  a bronze rule appears at the row's leading edge — so mouse and keyboard read
  as one mechanism, per the mouse-parity contract.
- **Press depresses.** Buttons and rows invert their bevel and drop 1px on
  `:active`. This is the entire reason a struck stamp feels struck.
- **Nothing else moves.** No panel entrances, no fades on refresh, no easing on
  data. The dialogue prompt's existing nudge stays because it is a prompt.
- `prefers-reduced-motion: reduce` removes the travel and the overshoot and
  keeps every value change, so the interface degrades to instant, not to flat.

Durations: 90ms cursor travel, 70ms hover, 40ms press. Anything slower than
110ms in a tactics menu is latency.

## 12.8 The ornament budget

Coherence beats spectacle: one construction language everywhere, ornament spent
where the player actually looks. Three tiers, and a panel's tier is fixed by
what it is for, not by how it looks next to its neighbour.

| Tier | Gets | Panels |
|---|---|---|
| **Ornate** | full stack: bronze corner straps at the foot, nameplate with rivets, engraved title | acting panel + orders menu (one object), forecast, turn order, dialogue card, screen header plates, end banner |
| **Plain** | bezel, grain, sheen, nameplate with rivets, grooves | inspect card, POWER register, notice slot, mode bar, between-battle detail panels, campaign file |
| **Bare** | grooves and troughs only | list rows, chips, meters, ledger rows, toasts, the notice scrollback |

The POWER register is deliberately *plain* despite being a headline panel: it is
an instrument readout, its content is already dense, and straps round a
fourteen-row ledger is noise. It earns its distinctiveness the honest way — its
nameplate is copper-700 rather than bronze and its section rules are copper,
because a register is a machine reading itself.

## 12.9 What this pass did not do, and what it left for paint

- **No painted panel backdrop.** The one thing the chrome genuinely wants and
  cannot generate is a *painted* leather-and-iron case texture behind the HUD
  columns — the equivalent of Octopath's canvas ground. Spec'd here as a future
  external brief: a 512×512 tileable, two-value, low-contrast painted iron sheet
  with wear concentrated at the edges, delivered like every other master
  (4× → reduced, hue-family checked). The programmatic stand-in shipped is
  `feTurbulence` grain plus a directional sheen, and it is genuinely good enough
  that the brief is an improvement, not a repair.
- **No portrait art.** Unchanged: `portrait()` still draws the monogram card
  stand-in (§9), now cut and lit like every other record. The dialogue slot has
  been resized from its old 64×64 square to the **128×160** the portrait briefs
  specify, keeping the filing-card corner clip and the opaque card ground — the
  first of the two UI follow-ups `art-src/PORTRAIT_BRIEFS.md` recorded.
- **Measured amber share**, whole frame, 1600×1000, the Marshaling Yard in
  orders mode with the cursor on the live menu — nearest palette family per
  pixel, the way ART_DIRECTION §2 rule 1 asks:

  | frame | amber family | `amber-glow` | copper-500 | copper-300 |
  |---|---|---|---|---|
  | before the chrome pass | 2.67% | 0.007% | 0.078% | 0.109% |
  | after | **1.95%** | 0.006% | 0.104% | 0.193% |

  The ornate build added rivets, straps, nameplates and lit bands and *lowered*
  the amber number, because the flat build painted whole plate headers amber and
  this one lights a band and a rim. Both are well inside the 4% cap.

  One measurement caveat worth recording so the next pass does not read it as a
  violation: total copper rises 0.40% → 1.31%, and effectively all of that is
  **copper-700**, not the reserved steps. A two-stop bronze gradient from
  umber-500 to umber-300 necessarily passes through values whose nearest palette
  neighbour is copper-700, which sits between them; and the POWER register's
  nameplate spends copper-700 on purpose, because a register is an instrument.
  The affordance colours themselves — copper-500 and copper-300 — barely move,
  and nothing in the chrome names them.
