# UI Design — Greyfall

How the interface is built, so the next pass does not drift. `docs/ART_DIRECTION.md`
governs colour and is binding on everything here; `docs/CREATIVE_BIBLE.md` §5.5
governs the words. This document records the decisions those two leave open:
type, panel anatomy, hierarchy, affordances, and the input contract.

The code is `src/ui/**` (components and `styles.css`) plus the app-side seam in
`src/app/{controller,viewmodels,main}.ts`. No hex is authored outside
`src/art/palette.ts`; `styles.css` mirrors its values as `--gf-*` tokens with the
canonical name in a comment beside each.

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
| `--gf-t-500` | 20px | screen title, the dominant number (hit %) |
| `--gf-t-700` | 30px | end banner |

Steps are ≥1.25 apart at the ends of the range; weight does the rest (400 body,
600 labels and subjects, 700 banner and buttons). Tracking is `0.18em` on plates
and `0.1em` on labels — uppercase is only ever used on short labels, never on a
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
