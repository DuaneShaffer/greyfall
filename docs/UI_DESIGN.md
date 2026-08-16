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
│            dialogue              │
├──────────────────────────────────┤
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
- **The cursor never rebuilds the list.** `MenuStack.setCursor` is a no-op when
  the index has not changed, and `refresh` patches in place unless the entries
  themselves changed. Rebuilding under a resting pointer destroys the node that
  is about to receive `mousedown`.
- **Disabled means visible and explained.** Greyed row, dim reason, tooltip.
- **Refusals are non-modal.** A brief notice in the annunciator slot, in the
  register: "No path there", "Out of reach".
- **A panel never offers what it cannot do.** A forecast with no targets says so
  and its stamp is dead; a committed forecast keeps its numbers and loses its
  stamp; a closed battle empties the queue rather than listing the dead.
- **Machinery answers.** Operating an object prints what was operated and what it
  did, in copper.

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
