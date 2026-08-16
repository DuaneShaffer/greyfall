# Creative Bible — Greyfall

The single source of creative truth. Every agent — mechanics, content, story,
art, audio — reads this before producing anything. If work contradicts this
document, the work is wrong or this document gets amended first; nothing
drifts silently.

**Binding:** tone pillars, the rules of flux, faction identities, naming
conventions, the seven jobs' fantasies, the slice arc.
**Suggestive:** specific ability names, minor character details, palette
notes — starting points, not law.

---

## 1. Pitch

**Final Fantasy Tactics meets Dishonored meets Arcane.** A tactics RPG set in
the first century of a magical industrial revolution. Magic is not a mystery —
it is a resource: mined, refined, piped, metered, and fought over. Cities run
on it. Fortunes are built on it. People are ground up by it.

The mechanical skeleton is FFT's — charge-time turn order, height, facing,
jobs and ability learning. The world, names, factions, and every piece of
flavor are original. The new pillar FFT never had: **the battlefield is a
system** — machinery operates, power flows, terrain breaks, and the player
fights the environment as much as the enemy.

## 2. Tone pillars

1. **History is written by the winners.** The frame device: everything the
   player sees is a reconstruction — the official record of the Greyfall
   Inquiry, annotated by a later archivist against recovered letters and
   testimony that contradict it. The protagonist has been erased; the game is
   the act of writing them back in.
2. **Magic is labor.** Every spell has a supply chain. Someone mined the
   vein-glass, someone refined the flux, someone died of brightblood doing
   it. No effect comes from nowhere — casters redirect power that exists in
   the world, they do not conjure it.
3. **Personal tragedy at industrial scale.** Stakes are political and human —
   a strike, a frame-up, a family fracturing — not apocalyptic. When the
   slice ends, the city is still standing and the wrong people still won.
4. **The battlefield is a workplace.** Maps are real functioning places —
   rail yards, foundries, refineries — and their function is their danger.
   Nothing on a map is decoration if it could plausibly do something.

Register: grounded, unsentimental, dry. Violence has weight; permadeath is
canon-consistent (there is no resurrection in this world — see §5). Humor is
scarce and comes from working people's gallows wit, never from quips.

## 3. Faithful vs. original

| Layer | Policy |
|---|---|
| Turn/CT system, height, Move/Jump, facing | Faithful to FFT's math |
| Brave/Faith | Reflavored as **Resolve/Attunement** (§7) |
| Zodiac compatibility | Cut |
| Jobs, abilities, items | Original — industrial vocabulary throughout |
| Names, places, factions, plot | Entirely original IP |
| Structural beats (cadet chapter, erased hero, rising commoner) | Homage at the structure level, never the surface |

Nothing nameable from Ivalice appears anywhere: no chocobos, no crystals, no
FFT proper nouns, including in code identifiers and test fixtures.

## 4. The world

### Flux

Sixty years ago, refiners in the lowlands learned to render **vein-glass** —
a pale, faintly luminous mineral laced through deep rock — into **flux**, a
stable charge that can be celled, piped, and discharged on demand. Before
refinement, magic was hedge-craft: rare attuned individuals coaxing weak
effects from raw seams. After it, magic became infrastructure.

Flux is the coal and the electricity of this world at once. It drives mills,
lights streets, powers the trams and the great works. Raw vein-glass glows
pale green; refined flux burns **warm amber**, shifting white-violet when
overloaded — the visual signature of the entire game.

Costs: prolonged exposure causes **brightblood** — luminous scarring, tremors,
early death. Refinery workers get it. Augmented soldiers court it. The
Chartered Houses insure against it and settle quietly.

### The Velden Compact

A federation of industrial city-states bound by a trade charter, governed in
theory by a Charter Council, in practice by the **Chartered Houses** — the
founding families whose seam claims and refineries the Compact was built
around. There is no king; there is a charter, and the fights over who holds
its seats are FFT's war of succession recast as boardroom-and-street warfare.

### Greyfall

The Compact's industrial heart and the game's stage. Built over the first
great vein-glass seam, layered vertically like its economy:

- **The Charter Rise** — house estates, the Council chambers, the Assay's
  spire. Clean light, metered air.
- **The Works** — foundries, rail yards, refineries. The middle city, where
  the slice takes place. Ash-fall greys the sky year-round; the city's name
  is a weather report. Officially. The older register underneath (§5.5
  applies even to the city's own name): *the grey fall* — the
  famine-and-plague winter that filled the pits the first great seam later
  formed in. Almost nobody remembers; the Assay's Archive does.
- **The Underveins** — tenements and black markets threaded through exhausted
  mine galleries. Unlicensed grafts, unmetered taps, the Ledger's territory.

### Factions

- **The Chartered Houses** — industrial dynasties. The slice concerns **House
  Corvane**, a founding house whose fortune is rail and freight, and whose
  private militia (the **House Watch**) polices its yards.
- **The Assay Sodality** — part standards bureau, part priesthood. Holds
  monopoly doctrine on refinement purity and attunement licensing; assays
  every cell, licenses every Conduit, examines every graft. Publicly a
  technical institution, quietly the Compact's most patient accumulator of
  power. (The FFT-church analog; its deeper agenda is a campaign matter, §12.)
  Internal structure (binding — the doctrine's operational shape must not
  drift): five offices under the **Master of Standards** and the **Table of
  Measures** — the **Meter** (metering and rates), the **Survey** (seams and
  claims), the **Licence** (attunement and grafts), the **Archive** (the
  filed record), and the **Clean Grounds Office** (interment law under a
  hygiene rubric — the quiet arm; see the story bible for why). Field agents
  are **wardens**.
- **The Combine of Trades** — the unions. Foundrymen, railrunners, refinery
  hands. Striking, in the slice, for graft-safety standards and brightblood
  compensation.
- **The Ledger** — the Underveins' organized crime: unlicensed flux taps,
  back-alley grafts, and anyone who needs something moved off the books.

## 5. Rules of magic (binding on all ability design)

1. **Flux is conserved.** No caster creates energy. Every magical effect
   draws from a source: a carried cell, a tapped line, a machine's reservoir,
   or (rarely, weakly) a raw seam. Ability design must answer "where does the
   power come from?" — this is what makes infrastructure tactically real.
2. **Attunement is a valve, not a wellspring.** Attuned people shape and
   redirect nearby flux with unusual efficiency. A Conduit on a dead map with
   no cells is nearly powerless — and that is a feature, not a bug.
3. **Flux corrupts flesh.** Brightblood, graft rejection, overload scarring.
   Power always costs the body something, eventually.
4. **The dead stay dead.** Flux can accelerate healing of the living
   (chemistry does the work; flux drives it) but nothing recalls the dead.
   Permadeath is a fact of the world, not just a mechanic.
5. **Two registers for everything technical.** Official Assay terminology vs.
   worker slang. A "flux discharge event" is *a flare*. A "somatic
   augmentation" is *a graft*. An unlicensed attuned is *a sparker*. Writers
   choose register by speaker; UI uses official terms, barks use slang.

## 6. The seven jobs

Fantasies are binding; ability names are suggestive seeds.

**Enforcer** — the readable melee baseline. House Watch armor, riot shield,
shock maul. Control and suppression: holds lines, pins targets, punishes
adjacency. *Seeds: Shield Advance, Pin, Kettle (zone slow), Breach Posture.*

**Machinist** — battlefield engineer. Deploys sentry turrets, mines, and
skitter-drones; the only job that adds new objects to the map. Weak alone,
oppressive with setup time. *Seeds: Sentry Frame, Tripwire Charge, Skitter
Drone, Field Repair (heals machines, not people).*

**Conduit** — licensed attuned. Manipulates flux infrastructure: powers and
kills machines, overloads cells into detonation, arcs charge between
conductive targets. The mage analog whose spellbook is the map itself.
*Seeds: Tap Line, Overload Cell, Arc, Ground (strip a machine or Augmented
of charge).*

**Saboteur** — explosives and environmental manipulation. The job that makes
destructible terrain a plan rather than an accident: drops catwalks, blows
walls, ruptures gas lines. High damage to structures, squishy in the open.
*Seeds: Shaped Charge, Bring It Down, Smoke Canister, Rig Machinery.*

**Chemist** — experimental compounds, not generic potions. Field medic and
debuffer whose kit reads like a portable lab: accelerants, coagulants,
aerosolized misery. Item mastery is the job identity (FFT Chemist homage at
the structure level). *Seeds: Coagulant Jet, Cinder Oil, Numbing Fog,
Triage.*

**Augmented** — flux-grafted body modification. Radically non-standard
abilities that rewrite the job's own action economy: hydraulic leaps, graft
overdrive, absorbing charge as health. Every strength has a body-horror
price; the Augmented runs on the same flux the map does — Conduits can
*Ground* them. *Seeds: Piston Lunge, Overdrive, Siphon, Rejection (self-harm
burst).*

**Railrunner** — mobility specialist keyed to rails and machinery. Moves
along rail tiles at multiplied speed, rides freight hooks and lifts, drags
enemies onto tracks. Terrain-conditional excellence: on a rail map a demon,
in a bare courtyard merely quick. *Seeds: Rail Dash, Coupling Hook, Switch
Kick (force-move), Signal Jump.*

Job-system structure follows FFT: primary/secondary skillsets,
reaction/support/movement slots, JP-analog earned in battle (working name:
**Standing**, as in standing with your trade).

## 7. Resolve & Attunement

The hidden stat pair, replacing Brave/Faith:

- **Resolve** — grit under fire. Scales physical steadiness: reaction-ability
  trigger rates, resistance to fear/suppression effects. Low-Resolve units
  flinch; very low-Resolve units may bolt.
- **Attunement** — how strongly a unit's body couples to flux. Scales magical
  damage dealt *and received*, graft efficiency, and susceptibility to
  flux-borne status effects. High Attunement is power and vulnerability in
  the same number.

In-fiction these are legible facts about a person, not abstractions: the
Assay measures Attunement to issue licenses; sergeants judge Resolve in the
yard. Story events may move them permanently — mirroring FFT's Brave/Faith
manipulation — and the Augmented job trades Resolve for Attunement as grafts
accumulate.

## 8. The vertical slice — "The Foundry Chapter"

The cadet-chapter analog. Rowen Corvane (she/her), youngest of House Corvane,
newly commissioned into the House Watch under her elder brother **Aldric
Corvane**, Master of the Watch. The Combine has struck the Corvane rail
yards. Over five battles the "strike violence" Rowen is sent to suppress
reveals itself as manufactured — provocateurs paid through House channels to
justify breaking the Combine and seizing an Underveins seam claim. Her
childhood friend **Jory Slate**, a foundry hand, is on the wrong side of the
kettle lines. The chapter ends with Rowen deserting — the moment the official
record begins erasing her.

Supporting cast: **Maren Voss**, Combine steward, the strike's weary center
of gravity; **Prelate-Assayer Quill**, the Assay's observer, always taking
measurements, never taking sides — visibly.

The five battles (each showcases a battlefield system):

1. **The Marshaling Yard** — tutorial. Break up a blockade that turns violent
   when provocateurs fire first. *Systems: rail switches, freight lift;
   Railrunner showcase.*
2. **Foundry Floor Nine** — suppress the "riot" inside the working foundry.
   *Systems: presses and pour-ladles as operable hazards; destructible
   catwalks; first fight where not operating the machinery is the mistake.*
3. **The Underveins — Tallow Row** — pursue the saboteur cell into the
   tenements; find House Corvane requisition seals on their explosives.
   *Systems: destructible walls opening new routes, gas lines that flare.*
4. **Corvane Refinery Three** — race to stop (and fail to fully stop) an
   engineered overload meant to be blamed on the Combine. *Systems: powered
   machinery, overloadable cells; Conduit showcase; partial map destruction
   scripted at the midpoint.*
5. **The Charterhouse Steps** — confront Aldric with the proof; he does not
   deny it. Boss battle against the Watch's best on the estate's terraced
   approach. Rowen wins the field and loses everything else; the chapter
   closes on the Inquiry record stating she died in the refinery accident.
   *Systems: everything, height as the primary terrain weapon.*

Slice content boundaries: all seven jobs playable; Standing/ability learning,
equipment, and save/load between battles; no overworld, shops, or recruiting.

## 9. Naming conventions

- **People:** clipped one-or-two-syllable given names (Rowen, Jory, Maren,
  Aldric) + surnames that are trades, materials, or house names (Slate, Voss,
  Corvane). Underveins folk often drop surnames for trade-names.
- **Places:** functional compounds and worn-down descriptions — the Works,
  Tallow Row, Foundry Floor Nine, the Marshaling Yard. Numbered industrial
  sites are always numbered mid-name, never suffixed ("Refinery Three").
- **Technology:** two registers per §5.5. Never "mana," "spell," "wizard,"
  or generic fantasy vocabulary — it is always flux, charge, discharge,
  attunement, grafts.
- **No apostrophe names, no Ivalice echoes, no Latin.**

## 10. Visual & audio direction seeds

(Non-binding until the art-direction doc; recorded so exploration starts
aligned.)

- Palette: soot greys, oxidized copper, coal umber — punctuated by flux amber
  as the scarce, precious accent. Overload states shift white-violet. Raw
  vein-glass pale green appears only underground.
- The vertical city read: light quality changes by stratum — clean and cold
  on the Rise, furnace-warm in the Works, bioluminescent-dim in the
  Underveins.
- Sprites: FFT-register chunky proportions (≈3 heads tall), pixel art
  billboarded in 3D; exact resolution/anchor/frame counts frozen in the art
  spec, not here.
- Audio: industrial ambience is the score's percussion section — the map's
  machinery is audible and its rhythms sit under the music. Silence when the
  power dies should be frightening.

## 11. Glossary

| Term | Meaning |
|---|---|
| Vein-glass | Raw magical mineral; pale green glow |
| Flux | Refined charge; the industrial form of magic; amber |
| Cell | Portable flux container |
| Brightblood | Degenerative flux-exposure sickness |
| Graft | Flux-powered body modification |
| Sparker | Slang: unlicensed attuned person |
| Flare | Slang: flux discharge event |
| The Assay | The Assay Sodality; standards bureau/priesthood |
| The Combine | The trade unions |
| The Ledger | Underveins organized crime |
| Standing | JP-analog progression currency |
| The Watch | A Chartered House's private militia |

## 12. Campaign canon (accepted 2026-08-15; developed in docs/STORY_BIBLE.md)

The former seeds are promoted to canon: `docs/STORY_BIBLE.md` Layers 0–1 are
binding — the thesis, the five-chapter spine, the ending (truth **filed, not
published**; Rowen erased-but-alive as the counter-record's author), and the
three engines:

- **The Assay's secret:** vein-glass is not geology. The richest seams form
  where great numbers died — battlefields, plague pits, collapsed mines. The
  Assay knows, and its purity doctrine exists to control who else learns it.
  Refinement is, at the bottom of the supply chain, rendering the dead.
  (The Lucavi-stone analog; turns from secret to engine in Chapter 4.)
- **Jory Slate's rise:** the Delita arc — from foundry hand to the Compact's
  celebrated reformer, built partly on Rowen's erasure. Engine in Chapter 3.
- **The archivist frame:** the annotating historian is **Tam Ash**, son of
  Perren Ash ("Log the name." / "We log numbers, ma'am."). Revealed in the
  Chapter 5 epilogue.

The wider Compact, canon per the story bible: city-states **Saltmere**,
**Coldelve**, **Wanefield**; founding houses **Bracken**, **Coll**, **Marle**
(House **Cander** extinguished); the **Claim Wars** the charter ended; the
winter rout at **the Sedge**; the charter's **sealed annex**.

Canon rulings (encounter and code agents inherit these from here):

1. The shipped win paths are the canonical outcomes of battles 1–5.
2. Downed ≠ dead for named characters; permadeath narration applies to the
   unnamed. (Rules of magic §5.4 is untouched — nothing recalls the dead.)
3. The Watch Sergeant of battles 1–5 is one man: **Dray**.
4. Jory Slate is she/her.
