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
*says* or *does*, §1–11 win, always. **Section 13 — *The frame at arm's length* —
is the composition and the scale**: it supersedes §2's type sizes *inside the
battle frame only*, and it is where the confirm takeover, dialogue dominance, the
charge telegraph and the portrait registry are specified.

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

**Scale** (fixed `px`; this is product UI, not a marketing page — no fluid type).
These are the *page* sizes, and they are what the between-battle screens use; the
battle frame redefines the same tokens one to two steps larger, because it is read
across a room rather than at a desk (§13.1):

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
  **Q / E** and on the **⟲ / ⟳ pair in the mode bar**. This is not a
  convenience — at one fixed bearing the taller geometry occludes whole columns
  of the board from the terrain raycast, and on the Meter House the entire East
  Main could not be picked with the pointer at all. The parity claim is measured
  rather than assumed: every tile is reachable from at least one of the four
  bearings (`tests/render/orbitReach.test.ts`).
- **The middle button is the hand.** The pointer rests as an open hand over the
  board and closes while the button is held; the drag carries the ground with
  it, pixel for pixel, at every bearing and zoom (`tests/render/camera.test.ts`).
  Screen vertical is foreshortened by the rig's 33° pitch, so a pixel down the
  screen buys a longer step across the ground than a pixel across it — a drag
  that ignored that would slide the board out from under the hand. Middle rather
  than right: right-click already means withdraw. The bearing gave the button
  up because it has the mode bar; panning had only keys and the screen edge, and
  the edge is not a gesture anyone reaches for on purpose. Edge pan stands down
  while the hand is closed — a hand that has dragged the board to the edge is
  holding it there, not asking for more.
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
- **The confirm moment takes the frame.** With a target staged and the stamp
  armed, the forecast is not a side panel: it is a bar across the foot of the
  frame with the two parties facing each other across the numbers, and the orders
  stand down for it (§13.3). A preview nobody staged — the Operate cursor — stays
  the compact panel.
- **A committed order's numbers live in the corner, not on the stage.** On commit
  the panel stands back down to the compact side panel, keeping every figure and
  losing the stamp: the takeover exists to ask a question, and the animation the
  numbers describe is playing where the bar was (§13.3).
- **A committed charge is a visible fact; an intent is not.** A charging unit is
  marked on the field, its landing tiles paint when the player asks about it, and
  the inspect card says what is charging and when it lands — all off charges the
  rules have already accepted (§13.5).
- **Story dialogue commands the frame while it runs.** Multi-line trigger
  dialogue is a scene and dominates; a single line is a callout and stays a card
  (§13.4).
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

Painted portraits are the open art workstream (ART_DIRECTION §4, A.9). They land
in the `portraitId`-keyed registry `portrait()` reads first
(`src/ui/portraits.ts`, §13.6); until a character has one — and most never
will — `portrait()` draws a designed stand-in rather than hatching: a monogram
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
seam (`viewmodels`, `controller`, `betweenBattles`) with fake ports, and the
dev-only UX probe (§14.5) drives the real overlay as text. The behaviours that
are easy to regress and expensive to notice have their own tests:
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

---

# 13. The frame at arm's length

The chrome pass (§12) fixed what the interface is made of. This one fixes what
it *composes into*: how large it is, how much of it there is, and what happens to
the frame at the two moments the game is asking for something — a target being
confirmed, and a scene being played. **Sections 1–11 remain binding on what each
panel says; §12 remains binding on how it is built. Where §2's type scale and
§13.1 disagree about a size inside the battle frame, §13.1 wins; everywhere else
§2 stands.**

The finding this answers, in the owner's words: *"everything reads as too
small."* It was measured against the genre — FFT and Tactics Ogre Reborn use
large, chunky type and few words, and a status panel there is a name, three big
numbers and two bars. Ours was eleven small dense rows. Density was half the
problem, so half the fix is subtraction.

## 13.1 One scale, declared in one block

`.gf-battle-hud` **redefines the `--gf-t-*` tokens for the battle frame** rather
than each panel overriding its own sizes. Every component in there already reads
the tokens, so one block moves the whole HUD together, and the between-battle
pages — read at page distance, not across a room — keep §2's scale.

| Token | §2 (page) | Battle frame | Role in the frame |
|---|---|---|---|
| `--gf-t-100` | 10px | **12px** | tick columns, key hints, serials |
| `--gf-t-200` | 11.5px | **14px** | labels, nameplates, chips |
| `--gf-t-300` | 13px | **16px** | base: menu rows, notices, queue names |
| `--gf-t-400` | 16px | **20px** | panel subject, party names, gauge figures |
| `--gf-t-500` | 20px | **28px** | HP and Charge — the condition figures |
| `--gf-t-600` | 24px | **34px** | the ability being confirmed |
| `--gf-t-700` | 30px | **44px** | the hit chance on the confirm stage |

Reading text is up about a quarter; the figures a decision turns on are up by
half or more. The rule behind the split: **a figure the player decides on is a
display number, a word that labels it is not.** HP reads at 28px with its label
at 14px beside it, and the hit chance at the confirm moment is the largest thing
in the frame.

The side columns widen to hold it (`minmax(330px, 24vw)` and
`minmax(286px, 20vw)`), and the sprites are untouched: this is DOM chrome over a
fixed orthographic board, so growing the panels costs board area and nothing
else.

**On a window shorter than 900px the frame takes one step down** (base 15px, HP
24px, hit 36px) and the left column gives up padding and the acting unit's
absolute facing. That is still well above §2's scale in every slot. The step
exists because 1280×800 has to hold an inspect card, an acting card and a menu in
one column, and a smaller step is a better answer than a clipped card.

## 13.2 What was cut, and why cutting was the point

Type got bigger by *subtraction*, not by scrolling. Each of these was a row
saying something the frame said somewhere else:

- **The CT meter on the unit panels.** The queue beside it prints the same fact
  in ticks, per unit, ordered. What is left of CT is a figure in the gauge strip.
- **"No status effects."** A chip, a rule and a strip of padding spent saying a
  list is empty, which an empty list says by being absent.
- **The job line on every turn-order row.** The chip's job tab and the inspect
  card both already carry it. A charging cast keeps its line, because the queue
  is the only place that fact appears.
- **`Facing north` on the inspect card.** Facing is the *acting* unit's to
  change, so it is printed where it is actionable; a hovered unit's facing is on
  its sprite and the angle that decides a hit is on the forecast.

Two bars, one gauge strip of three figures, and chips only when something is in
force. `tests/ui/screens.test.ts` holds the meter count, so the CT bar cannot
come back by accident.

## 13.3 The confirm takeover (§8, extended)

**When a target is staged and the stamp is the next thing the player presses, the
forecast stops being a side panel and takes the foot of the frame.** A wide bar:
the actor on one side, the target on the other — record card, name, job, HP with
its meter — and the exchange between them: the ability, its cost, the hit chance
at 44px, the damage, the status rolls, the facing and height that produced the
number. `COMMIT` is the amber stamp, `Withdraw` beside it. The reference is
Tactics Ogre Reborn's targeting frame; the mechanism is FFT's, which hands its
bottom bar to the confirmation.

Four rules make it honest rather than decorative:

1. **`ForecastView.armed` is a view-model fact, not a CSS state.** It is true
   only for an order built from a staged target. Operate has no aim step, so its
   cursor-rest preview is `armed: false` and stays the compact side panel — the
   panel never takes the frame for something the player has not chosen.
2. **The orders stand down for it.** The bar and the order column cannot both
   have the foot of a 1000px frame, and the actor's name, job and condition have
   moved into the bar. The menu comes back with the frame the moment the order is
   sent or withdrawn. Nothing is lost: Withdraw is beside the stamp and in the
   mode bar, and right-click still cancels.
3. **The stage stops at the clock column.** The queue is what the player is
   deciding *against*; a bar that covered it would answer one question by hiding
   another.
4. **An area order's other targets run underneath the stage**, at row measure —
   the primary faces the actor, the rest are listed. A panel never hides what its
   order does.

**Where a committed order's numbers live.** On commit the panel keeps every
figure, loses the stamp (`Committed`, and the `FILED` mark), and **stands back
down to the compact side panel**. The takeover exists to ask a question; once the
order is away there is no question, and a full-width bar over the field would
cover the animation the numbers are describing. So: armed → bar, committed →
corner, and the record holds there until a new order is staged (§8's rule,
unchanged).

## 13.4 Dialogue dominance, and the line that decides it

**If the dialogue matters it commands the frame until it does not.** A scene gets
a scrim over the field, the rest of the case at 0.3 opacity, a card at 42vh, a
portrait plate at 2× the in-game size, and the speaker's name on a bronze tab at
28px. When the last line is out, the class comes off and every one of those goes
with it.

**The rule for what counts, decided from what `data/encounters/*.json` actually
contains: a trigger with two or more lines is a scene; a single line is a
callout.** The data carries no importance flag, but the split is clean without
one — every single-line trigger in the campaign is a shout across the yard
("Down the rail, now", "The cell is going up", "The west main just went out"),
and every exchange of two or more has a speaker turn in it. So the rule is a
count (`isScene` in `src/ui/battle/dialogue.ts`) rather than a schema field
nobody would fill in twice. If a one-line scene ever needs the big card, that is
the moment to add the field — and the rule is written down here so it is a
decision rather than a discovery.

**The scene card leaves the grid** (`position: fixed`, bottom-anchored) rather
than taking a row. A card that size in the dialogue row pushes the mode bar off
the bottom of a 1000px frame; and every panel it would have displaced is behind
it at 0.3 anyway. Nothing else in the HUD moves when a scene opens or closes,
which is the other half of getting out of the way. Every advance affordance —
click the card, Enter, Space, the prompt's nudge — and the no-camera-steal rule
are untouched.

## 13.5 The charge telegraph: FFT's level, not Into the Breach's

A cast the enemy has **committed** is a visible fact; an intent nobody has staged
is not reported anywhere. That line is deliberate — full intent telegraphs make a
tactics game a puzzle game — and it is drawn at "committed", so everything here
reads off `state.charges`, which the turn order was already naming.

Three cues, one source:

1. **A mark under the caster.** An `OVERLOAD_500` tile mark (inset, not a wash)
   on every charging unit's tile, so the tile underneath is still whatever the
   move or aim overlay is saying about it. Flux colour, because a cast in flight
   is flux-borne state (§5) and the queue paints it the same way.
2. **The landing tiles, when the player asks.** Selecting or hovering the
   charging unit — on the field or on its turn-order row — paints the cast's
   affected tiles from `affectedTiles` on the charge's own target. It is the
   answer to a question, not a permanent overlay of everything in flight.
3. **The inspect card dates it**: `Charging · Cinder Oil` and `Resolves in 3`,
   with the tick count read off the same `turnOrderPreview` the queue lists, so
   the card and the queue can never disagree.

Selection clears do not unpaint the mark: a charge in flight is a fact about the
field, not something the player staged. A closed field clears both layers, for
the same reason it empties the queue.

## 13.6 Portrait chips: the plumbing, ahead of the paint

`src/ui/portraits.ts` is a `portraitId`-keyed registry, and `portrait()` reads it
before it draws anything. When a plate has been filed the slot shows it; when it
has not, the monogram record card of §9 is drawn — **and that is a shipped
fallback, not a placeholder**, because a third of the units on a field will never
be painted.

**One asset per character, never two.** The briefs are explicit that the 32×32
head chip is a crop rather than a delivery, so every square slot cuts
`CHIP_RECT` — (32, 16, 64, 64) of the 128×160 — out of the same plate in CSS,
expressed as fractions of the slot size, and the 4:5 slots show the whole plate.
A 34px queue chip and an 80px record head are then the same crop at two sizes and
cannot drift from the dialogue portrait.

`src/app/portraitArt.ts` globs `art/portraits/<portraitId>.png` at build time and
files whatever is there, the same way `content.ts` globs `data/`. The directory is
empty today; the console says which plates were filed when it is not. Named cast
who were missing an id have one (`maren-voss`, `quill`, and `dray` on the
`watch-sergeant` roster slot, per PORTRAIT_BRIEFS' follow-up 1).

## 13.7 Resolve and Attunement, everywhere a unit is read

They are measured, not hidden (`CREATIVE_BIBLE`; the Assay files them). They now
print on the acting panel, the inspect card, the unit sheet **and the roster
record** — the last of which was the hole. On the battle cards they sit in the
gauge strip beside CT, which is where a static trait belongs next to a clock.

## 13.8 What was verified, and where

Captured off the real app over CDP at the reference **1600×1000** and again at
**1280×800**, on the Marshaling Yard: the resting orders frame, the confirm
takeover armed, a scene dominating, and a charging unit's landing tiles with the
card dating the cast. `docs/media/battle-ui/`.

The orders with a walk still open to be taken back are captured at 1600×1000 on
Floor Nine (`undo-move-1600x1000.png`): "Undo move / Take the step back" sitting
under a spent Move as an ordinary row, cursor on it, reached by either hand
(COMBAT_RULES §10b).

Measured on every frame, at both sizes: the mode bar's bottom is inside the
viewport, the inspect card does not collide with the order column, and the
document never scrolls horizontally. Those three are the frame's fit contract —
a panel that grew until it pushed the thing that says what the game is waiting
for off the bottom would be a worse interface than the small one.

---

# 14. The seam's data, and the probe that reads it

Sections 1–13 say what the interface must tell the player. This one says what the
seam has to *carry* for that to be possible, and it exists because a blind
playtest found the interface withholding facts the view models never had: what an
ability does before you spend an action on it, whether the last order hit, how
high the tile under the cursor is, whether a red tile can actually be hit, and
whose side the second name on the forecast is on.

The rules of §state.ts's header are unchanged: **plain serializable data, no core
types, formatted where formatting is a rules decision.** Everything below is
built in `src/app/viewmodels.ts` (battle), `src/app/campaignViews.ts`
(between battles), `src/app/mechanics.ts` (shared) and `src/app/battleLog.ts`
(the record), and every field is optional so no panel is obliged to grow before
its own pass reaches it.

## 14.1 `MechanicsView` — what an order does

One shape per ability and per item, derived from the data definition: `range`
(min/max/vertical), `area` (`single` / `radius` / `line`), `targets` +
`targetsLabel`, `requiresLos`, `amounts`, `statuses`, `chargeCost`, `castSpeed`,
`usesRemaining` for items, and a formatted one-line `summary`.

`amounts` states the scale, never a total: only `fixed` is a number the player can
hold the game to, so `Weapon 80% kinetic` and `Mag ×20` are printed as the pair
they are. A total would be a forecast wearing a stat's clothes.

It rides on `AbilityView.mechanics` (battle menus, unit sheet),
`ItemEntryView.mechanics` (field kit, satchel) and `LearnableView.mechanics`
(purchase). In battle it is read off the ability the unit *would issue* — the
weapon attack's reach comes from the weapon, an item's from the thrower's mastery.
Between battles it is the shipped definition, unmodified.

## 14.2 `LogEntryView` — the record of what happened

`BattleHudView.log` is battle-long and accumulated by `BattleLog` from the events
`applyCommand` returns. One entry per resolved action, plus entries for turn
boundaries, joins, departures, deaths and grid changes nobody ordered.

Every figure is what the rules did, not what a forecast promised — a vial that
would have restored 30 to an unhurt unit files `0 recovered`. Entries carry a
monotonic `index`, the `turn` and `tick` they landed on, the `actor` with its
team, the order's `action` name, per-target `hit` / `damage` / `recovery` /
`hpRemaining` / `statuses` / `downed`, free-text `notes` for consequences aimed at
nobody, and a formatted `text` line. Enemy turns and actions resolved behind a
dialogue box land the same way, which is the whole point: the two findings this
answers were "I cannot tell whether it hit" and "the enemy's turn happened off
screen".

## 14.3 Elevation and legality

- `BattleHudView.cursor` — the hovered tile, its `height`, and `heightDelta`
  against the acting unit's tile (positive = the target stands higher). The delta
  is null outside a targeting mode: there is nothing to measure a resting hover
  against.
- `BattleHudView.targeting` — `inRange` (reach, what the range overlay lights),
  `legal` (the subset the aim gate accepts) and `illegal` (each with the gate's
  own `code` and `reason`). It is built on the read-only core selector
  `aimVerdicts`, which asks `aimRefusal` — the one gate the command layer refuses
  by. A red tile that cannot be hit is the overlay lying, and this is the data
  that stops it.
- `BattleHudView.field` — the board: `width`, `depth`, a `heights[y][x]` grid,
  every unit with its tile, height, facing, HP, charge, statuses and whether it is
  acting, and every machine with its footprint and power state. Heights are
  recomputed per frame on purpose: wreck a catwalk and the tiles it was decking
  drop.

## 14.4 Allegiance, whose turn, the objective, the formation

- `ForecastTargetView.team` and `ForecastView.attacker.team` — friendly fire is
  correct mechanics and must be *read* as what it is.
- `BattleHudView.activeUnitId` — whose turn it is, distinct from `action.unit`
  (who the orders are about) and from `inspected` (who is being read).
- `BattleHudView.objective` — the encounter's own line, from the optional
  `objective` field on the encounter schema; null for an engagement that has not
  been written up, never invented.
- `RosterEntryView.deployed` and `PartyView.deployedCount` — membership off the
  staged formation, so the roster and the formation screen cannot disagree.

## 14.5 The UX probe (`src/app/probe.ts`, dev only)

`window.__greyfall` is filed by `main.ts` under `import.meta.env.DEV` and must
never exist in a build.

- `describe()` — the screen and mode, every visible menu as rows with cursor,
  disabled and **inert** state, the notices, the dialogue, every visible panel as
  lines of text, what is clickable by name, and `battle`: the controller's phase,
  the overlay layers it is painting, and *the exact `BattleHudView` the panels
  were drawn from* with the log trimmed to its tail. The probe derives no second
  opinion about the game; one that computed its own answer could agree with itself
  while the interface said something else.
- `act(verb, target)` — `click`/`hover` on a menu row or button **by label**
  (dispatched as the real click on the row the player would hit), `click`/`hover`
  on a `{x, y}` tile (through the controller's own tile handlers, bypassing pixel
  picking), and `key` (a real `keydown` on the document).
- It fails loudly: an unknown label throws with everything that *was* on screen, a
  greyed row throws with its reason, a tile off the board throws with the board's
  size. A probe that quietly no-ops recreates the silent-failure bugs it exists to
  catch.

`tests/app/probe.test.ts` holds the honesty contract: the forecast the probe
reports must be the forecast the panel printed — same ability name, same hit
percentages, same amounts, and exactly the same set of named parties. If a panel
and the seam ever diverge, that test fails rather than the probe quietly
disagreeing with the screen.

---

# 15. The panels this phase adds

**Status: landing with this phase.** Everything in this section is being built
now, across parallel waves, against the seam §14 describes. It is recorded here
before the paint dries so five waves do not each invent a different answer to
"where does the log go". Section 14 says what the seam *carries*; this one says
what is drawn with it, and what the player may press.

The findings behind it are the same blind playtest's second half: the record of
the battle scrolled away unread, nobody could say what the engagement was for,
there was no way out of a battle and no way to look anything up from inside one,
right-click meant three different things depending on where the pointer was, and
a red tile could mean *out of reach*, *refused* or *your own man* with nothing to
tell them apart.

## 15.1 The combat log panel — bottom-left, three lines, expandable

The battle-long record, drawn where the eye already goes for the order column.

- **Position: bottom-left**, under the order column, sharing its gutter. The
  order column is where the hand rests (§6.1); the record of what the last order
  did belongs directly beneath the place the next one is given.
- **Collapsed it is three lines** — the newest three entries, oldest at the top,
  in the register's own type. Three because that is one exchange: an order, its
  answer, and the consequence nobody aimed at. It is `is-quiet` and never
  competes with the forecast.
- **Expanded it is the whole battle**, scrolled to the tail, over the board
  rather than reflowing it, and it closes the way everything closes (§15.4).
  Expansion is a mode with a visible way out and it does not stop the clock.
- **It is fed by `BattleHudView.log`** (§14.2) and nothing else. The panel
  formats; it never computes. Every figure in it is what the rules did — a vial
  that would have restored 30 to an unhurt unit files `0 recovered` — because the
  finding this answers was "I cannot tell whether it hit", and a panel that
  re-derived its own numbers could disagree with the engine and look right.
- **Enemy turns land in it the same way**, which is the other half of the same
  finding: an enemy turn resolved behind a dialogue box happened off screen, and
  the log is where it stops having happened off screen.
- The annunciator (§8) keeps its short scrollback and keeps its job. The
  annunciator is *transient and about now*; the log is *permanent and about the
  battle*. A line may reasonably appear in both.

## 15.2 The objective chip

One line, in the HUD, saying what the engagement is for.

- **Source: `BattleHudView.objective`** — the encounter's own `objective` string
  (§14.4). **Null means the chip is not drawn.** It is never filled with a guess,
  a win-condition paraphrase, or "Defeat all enemies": an engagement nobody has
  written up says nothing, which is honest, where an invented goal is a lie the
  interface tells with total confidence.
- **It is a chip, not a plate**: one line, no title bar, soot ground, no amber —
  amber's three places on a battle frame are spoken for (§5) and an objective is
  standing information, not the decision being made now.
- It sits with the mode bar's information rather than the live column: the mode
  bar says what the interface wants, the chip says what the battle wants.
- The same string is the Objectives page's first line (§15.3), so the chip and
  the page can never disagree — there is one string.

Shipped objectives, for reference (`data/encounters/*.json`):

| Encounter | Objective |
|---|---|
| The Marshaling Yard | Clear the yard gate and put down whoever swung first. |
| Foundry Floor Nine | Take the aisle and put down the three who set Floor Nine. |
| Tallow Row | Take Wick before he reaches the tram lane. |
| Corvane Refinery Three | Get Marek to the gallery switchboard, or take Nessa Kiln off the floor. |
| The Charterhouse Steps | Climb the terraces and put Aldric Corvane down on them. |
| The Meter House | Take the meter house boards off the crew holding them. |

## 15.3 The battle menu — Escape at root

**Escape with no mode open opens the battle menu.** Escape inside a mode still
backs out of that mode, one step at a time, exactly as it did; the menu is what
Escape means when there is nothing left to back out of. Three entries:

- **Objectives** — the encounter's objective line, then the win and loss
  conditions in words. This is where a player checks what they are being asked
  for without guessing from the enemy roster. An encounter with no objective
  string still lists its conditions.
- **Systems** — the help pages. **The copy is `docs/SYSTEMS_COPY.md` and that
  file is the source**: Power (with LIVE/DEAD, throwing a breaker, and the
  Marshaling Yard's Freight Lift), Standing, Charge, Cast speed, Resolve,
  Attunement, damage types and resistance, borrowing a skillset, doctrine, and
  elevation.
  A wave shipping provisional inline strings reconciles *to* that file. Every
  entry there carries a `key` for exactly that, and `SYSTEMS_NOTES`
  (`src/ui/battle/battleMenu.ts`) is keyed off it: the entry's *one line* is the
  row, and confirming the row opens the entry's body as a page of its own. The
  markdown emphasis and the rule citations are the only things dropped on the
  way in — a help page does not send the player to `COMBAT_RULES`.
- **Forfeit** — and it confirms. Forfeit is the one destructive thing a player
  can do from inside a battle, so it borrows §13.3's discipline rather than its
  shape: §13.3's bar is built around an actor and a target and a forfeit has
  neither, but the rule that a takeover **names the consequence in words and
  will not accept the press that reaches it as the press that commits it**
  carries over exactly. A forfeit is a loss, and a loss banks nothing and
  changes nothing (`docs/PROGRESSION.md` §3) — the confirm says so, because a
  player who thinks they are throwing away a chapter's Standing will sit in a
  battle they cannot win rather than take the retry that is actually on offer.
  Nothing in the battle seam ends an engagement by choice, so the app supplies
  the verb: the confirmed forfeit hands the unfinished `GameState` to the
  chapter loop through the same door a battle that ended itself goes through,
  and `applyBattleResults` reads a state with no result as the loss it is —
  nothing banked, nothing advanced, the roster exactly as it deployed.

The menu is a mode like any other: it names itself in the mode bar, it does not
stop the clock from being read, and it closes on Escape and on right-click.

## 15.4 Right-click backs out, everywhere — and right-drag orbits

Two gestures on one button, told apart by whether the pointer moved.

- **Right-click — press and release without dragging — backs out one step, from
  anywhere.** Out of a targeting mode, out of a submenu, out of the expanded log,
  out of the battle menu, out of a confirm. This was already the contract for the
  board and the menus (§8) and was not honoured by every panel; the rule is that
  there is no surface where right-click means nothing and no surface where it
  means something else.
- **Right-drag orbits the camera.** Held and moved, the right button turns the
  rig, and **the cursor becomes the rotate cursor** for as long as it is held, so
  the gesture names itself the moment it starts. The 90° steps on **Q / E** and
  the **⟲ / ⟳** pair in the mode bar stay exactly as they were — the drag is a
  finer-grained way to reach the same bearings, not a replacement, and the
  measured reach guarantee (`tests/render/orbitReach.test.ts`) is about the four
  bearings and is unaffected.
- **The middle button is still the hand** (§8) and keeps the whole pan gesture.
  The note in §8 that panning took the middle button "because right-click already
  means withdraw" still holds and is now more precisely true: right-*click*
  withdraws, right-*drag* orbits, and neither is a pan.
- A drag that starts on the board and a drag that starts on a panel behave the
  same way. The camera is not a panel's business, and a gesture that worked in
  one place and died in another is the bug this whole section exists to close.

## 15.5 Blocked and support highlight layers

Two new tile layers, so a coloured tile means one thing.

The aim overlays already separate reach from legality in the *data*
(`BattleHudView.targeting`: `inRange`, `legal`, `illegal`, each refusal carrying
the gate's own code and reason — §14.3). On the board they were one colour, so
"too far", "the gate refuses this" and "that is your own man" all painted the
same and the player had to guess which.

- **Blocked** — tiles inside reach that the aim gate will refuse. Blood, and
  dimmer than the legal layer: it is a refusal, which is what blood is reserved
  for (§5). It reads as *the reach goes there and the order does not*, which is a
  different sentence from *out of reach* and needs to look like one. Hovering a
  blocked tile puts the gate's own `reason` in the annunciator — the same words
  the command layer would have refused with, never a second opinion.
- **Support** — tiles where the staged order would land on your own side: allies,
  neutrals, and the acting unit itself. Verdigris, which is already health and
  buffs (§5). It is drawn for helpful orders so the player can see the whole
  reach of a heal, and it is drawn for harmful ones **so friendly fire is legible
  before it is committed** rather than after — everything standing in an area is
  affected, allies included (`COMBAT_RULES` §12), and that has always been
  correct mechanics badly reported.

Both layers go through the controller's one `setHighlight` pair, so
`controller.highlights` — and therefore the probe and the tests — knows what is
painted (§14.5). Neither layer takes amber and neither takes copper: copper is
operable machinery and nothing else.
