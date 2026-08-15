# FFT Clone — Project Breakdown

A tactics RPG in the style of Final Fantasy Tactics. This document records the
creative direction, the workstream breakdown, the tech stack decision, and the
plan for parallelizing work across agents.

## Creative direction (2026-08-15)

**Industrial fantasy / magical industrial revolution.** FFT meets Dishonored
meets Arcane. Magic is an industrial resource: cities of factories, railways,
and magical power plants. Original IP — FFT's political-tragedy register
(class conflict, contested succession, unreliable history) maps onto labor vs.
capital and magical resource extraction, but names, nations, and jobs are our
own.

Job roster (slice):

- **Enforcer** — armored police/soldier with suppression equipment; the
  readable melee baseline players calibrate against.
- **Machinist** — deploys turrets, mines, drones.
- **Conduit** — manipulates electrical/magical infrastructure.
- **Saboteur** — explosives and environmental manipulation.
- **Chemist** — experimental compounds rather than generic potions.
- **Augmented** — body modifications granting radically different abilities.
- **Railrunner** — mobility specialist keyed to rails and machinery.

**Design pillar: the battlefield is a system.** Machinery can be operated,
powered equipment overloaded, terrain destroyed. This is the mechanical thesis
FFT never had and the riskiest part of the project — it lives in the vertical
slice, not after it.

### Mechanics stance

FFT's setting-neutral skeleton survives: CT-based turn order, height and
Move/Jump, facing hit rates. Brave/Faith is reflavored as a **Resolve /
Attunement** stat pair (Attunement scales how strongly magic and magical
infrastructure affect a unit, for good and ill; Augmented builds may trade one
against the other). Zodiac compatibility is cut.

## Tech stack decision (2026-08-15)

**TypeScript + Three.js (web).**

Key context: FFT was never a 2D game — its maps are true 3D geometry (height,
rotating camera) with 2D pixel-art sprites billboarded on top. The faithful
architecture and the modern "HD-2D" look (Octopath Traveler, Triangle
Strategy, Tactics Ogre Reborn) are the *same* architecture: 3D environments +
pixel sprites + modern lighting/bloom/depth-of-field. The knob for retro vs.
modern is shaders and post-processing, not engine choice.

Why this stack won:

- **Agent-driven workflow.** Everything is text (code, scenes, data), runs
  headless in Node for tests and simulation, and renders in a browser that
  agents can launch and screenshot. No GUI editor bottleneck.
- **Genre fit.** Tactics games are turn-based, menu-heavy, low object count —
  they need very little of what a big engine provides (no physics, no complex
  realtime demands).
- **Distribution.** Anyone can playtest via a URL.

Costs accepted: engine services (save system, input, UI menus, audio,
particles, post-processing chain) are libraries or hand-rolled.

Rejected alternatives:

- **Pure 2D isometric (Phaser, Canvas):** faking height in 2D is a tar pit —
  draw-order sorting with multi-level terrain is miserable and camera
  rotation is impossible. Harder work for a worse result.
- **Godot 4 (close second):** real engine services for free and reasonably
  agent-workable (text `.tscn`, headless mode), but editor-centric workflow
  has friction from WSL. Revisit if a Steam/console release becomes a goal.
- **Unity:** binary-ish scenes, license account, worst agent ergonomics.
- **MonoGame/raw framework:** all of the build-it-yourself cost, none of the
  browser/testing convenience.

Rendering approach: blocky terrain meshes built from heightmap data, unit
sprites as camera-facing billboards, orthographic camera orbiting in 90°
steps, post-processing (bloom, tilt-shift DoF) layered on later.

## Workstreams

### Foundation (sequential — must exist before parallel work)

1. **Game design document / creative bible** — scope, tone, setting, how
   faithful vs. inspired-by. Every other agent reads this.
   **Done: `docs/CREATIVE_BIBLE.md`.**
2. **Architecture** — project structure, how systems talk to each other.
   **Done: `docs/ARCHITECTURE.md`.**
3. **Data schemas** — the coordination backbone. JSON/TS formats for units,
   jobs, abilities, items, maps, encounters, dialogue. Once frozen, mechanics,
   content, and story agents work independently against the same contract.
   **Done: zod schemas in `src/data/schemas/`, example content in `data/`,
   validation + cross-reference tests in `tests/content.test.ts`.**

### Mechanics

4. **Tactical battle core** — grid with height, movement ranges (Move/Jump),
   pathfinding, line-of-sight and area targeting, facing (front/side/back hit
   rates).
5. **Turn system** — FFT's Charge Time system: speed-driven turn order,
   charged spells resolving mid-timeline, Haste/Slow interactions.
   Deceptively deep; deserves focused attention.
6. **Combat resolution** — damage formulas, hit chance, elemental affinities,
   status effects and timers, reactions (Counter, Auto-Potion), win/loss
   conditions, permadeath and crystal/treasure timers.
7. **Job & progression system** — job tree with prerequisites, JP earning and
   ability learning, primary/secondary skillsets, support/reaction/movement
   slots, stat growth per job, equipment.
8. **Enemy AI** — target selection, ability evaluation, positioning. Often
   the weakest part of hobby tactics games; can be its own agent entirely.
9. **Overworld layer** — world map travel, random encounters, shops,
   recruiting, errands/propositions, party management between battles.

### Story

10. **Narrative design** — plot in FFT's political-tragedy register recast
    for the industrial setting (labor vs. capital, magical resource
    extraction, an unreliable historical record), chapter structure,
    character arcs.
11. **Dialogue & cutscene scripting** — the scenes themselves plus the system
    that plays them: a cutscene script format the engine executes (camera
    moves, unit walk-ons, dialogue boxes). Half writing, half engineering.
12. **Worldbuilding / lore** — nations, institutions, industrial houses and
    guilds, the nature of magic-as-resource, item flavor text, in-game
    encyclopedia (Brave Story equivalent).

### Visuals

13. **Art direction** — palette, sprite resolution, proportions (FFT's chunky
    3-heads-tall sprites), portrait style. Set once so other art doesn't
    diverge.
14. **Unit sprites & animation** — walk/attack/cast/hurt cycles × facing
    directions × jobs × genders. The single biggest asset pipeline.
15. **Environment/tile art & map geometry** — terrain textures, height-mapped
    battle maps, terrain types that interact with mechanics (water, lava).
16. **VFX & UI art** — spell effects, damage popups, menu chrome, icons.

### Often forgotten

17. **UI/UX engineering** — battle menus, attack forecast panel, formation
    screen, job/ability/shop menus. Tactics games are 50% menus; huge
    workstream.
18. **Audio** — music direction and SFX (sourced or generated).
19. **Content authoring & tooling** — filling the schemas: ~20 jobs × ~16
    abilities, hundreds of items, dozens of encounter layouts. Plus editors
    that make authoring bearable (a map editor pays for itself immediately).
20. **Balance & simulation** — headless battle simulator running AI-vs-AI
    fights to catch degenerate strategies and tune formulas. Highly
    automatable; great agent work.
21. **QA / test harness** — deterministic combat tests ("Fire on a unit with
    30 Faith → exactly N damage"), save/load round-trips, regression suite.

## Agent phasing

- **Phase 0 (sequential):** design doc, architecture, data schemas. Don't
  parallelize this.
- **Phase 1 (3–4 agents):** battle core + turn system, job/data systems, UI
  framework, art direction + placeholder assets.
- **Phase 2 (fan out wide):** story, AI, content authoring, VFX, audio,
  balance sim — all hang off the phase-1 skeleton and genuinely parallelize.

**Integration risk mitigation:** the data schemas and system interfaces are
the contract. Agents produce code and data against them rather than inventing
their own structures.

## Vertical slice (decided 2026-08-15)

Scope is a vertical slice, not a campaign:

- **~5 battles chained by a progression loop** — between-battle screen with
  JP-equivalent spend, ability learning, equipment, party roster, save/load.
- **All 7 jobs** from the creative direction.
- **Battlefield systems in the slice:** operable machinery (cranes, presses,
  rail switches, lifts — activatable objects with state, including a simple
  `powered` flag Conduit can toggle or overload) and destructible terrain
  (walls, catwalks, cover that change pathing and line-of-sight mid-battle).
  Consequence: pathfinding and LoS must treat map geometry as mutable from
  the start.
- **Deferred past the slice:** networked infrastructure (power grids, steam
  pressure systems as graphs — the first post-slice mechanic, and Conduit's
  full kit), overworld travel, shops/recruiting, cutscene system, audio,
  post-processing chain.
- **Art:** placeholder-first — untextured colored terrain blocks and
  flat-color billboard quads — with sprite resolution, anchors, and animation
  frame counts frozen in the art-direction doc so real assets drop in without
  code changes.

## Phase 1 status (2026-08-15)

Complete and green (220 tests, tsc clean): battle core (`src/core`,
`docs/COMBAT_RULES.md`), renderer (`src/render`, `src/app`), UI framework
(`src/ui`, `ui-harness.html`), art direction (`src/art`,
`docs/ART_DIRECTION.md`). Built deliberately unintegrated — each workstream
documented its seam. Phase 2 integration items:

- Wire the app: core events → `render/adapter.ts` (`toRenderEvents`,
  `viewModelFromGameState`); UI intents → core commands; UI view models from
  core selectors; add `vite.config.ts` with `ui-harness.html` as a dev input.
- Replace `src/render/palette.ts` stopgap with `src/art/palette.ts`
  (migration table in ART_DIRECTION.md §10); renderer placeholder sprites →
  `src/art/placeholders.ts` shape data.
- Deliberate schema amendments from core-agent friction log: add `mine` and
  `drone` to `MapObjectKind` (engine currently maps both to `machine`); an
  explicit effect target-scope field if an ability ever needs to hit units
  and objects in one area; a status-resistance hook if Resolve/Attunement
  should modify status chance (COMBAT_RULES §8 documents the flat-chance
  simplification); decide whether `data/units/` joins `ContentLibrary` for
  the save/load layer. The reserved `basic-attack` ability id is now
  guarded by a content test.

## Phase 2 findings queue (escalated by workstream agents, 2026-08-15)

Deliberate engine/schema amendments for the post-wave engine pass, from the
content agent's vocabulary-gap report (full detail in docs/CONTENT_NOTES.md):

1. **Deployables are inert** — spawnObject creates objects with no behavior;
   turrets don't shoot, mines don't detonate. Needs an AI hook for spawned
   turret/drone units-or-objects and an authorable payload (onContact /
   per-turn effects) for mines. Biggest gap; the Machinist kit depends on it.
2. **No conditional ability gating** — "requires rail underfoot", "requires
   adjacent powered object". Without it the bible's "Conduit on a dead map
   is nearly powerless" is flavor, not rules.
3. **No self-targeting movement effect** — Piston Lunge / Signal Jump can't
   reposition the caster.
4. **Consumables are inert** — no use-item command, no consumable inventory
   slot; consumableEffectBonusPercent unread by core.
5. Minor: no accuracy stat (blind modeled as stat loss); no on-expiry status
   cost; reaction trigger vocabulary can't express ally-protection.
6. **Balance escalation**: TTK collapses with level (HP sub-linear vs phys
   linear; L1 = 4 hits, L5 = 1). Slice (L1-3) playable; fix is a core
   formula lever (WEAPON_DAMAGE_DIVISOR scaling or STAT_BASE.hp raise) —
   assign to the balance-sim workstream with the sim as the measuring tool.
   Bites concretely in e5: Aldric one-shots a L3 Conduit.

From the encounter agent (full detail in docs/ENCOUNTER_NOTES.md):

7. **`turnStart` trigger evaluation bug** — `state.turn` increments per unit
   turn (not per round) and the condition uses `===`; a turn index consumed
   entirely inside advanceClock never gets trigger evaluation, so
   `turnStart: n` can silently skip. Real core bug; e4 works around it with
   a widened tile trigger. Also add a regression test for
   trigger-before-outcome ordering in settle(), which every closing-dialogue
   beat depends on.
8. Trigger vocabulary: `moveUnit`/`removeUnit` actions (Aldric's scripted
   withdrawal is inexpressible), a unit-reaches-tiles LOSS condition (enemy
   escape), unit-targeting trigger actions, persistent flags,
   entered-vs-present semantics for unitEntersTiles.
9. **Neutral team is hostile to both sides** in grid.ts and ai/context.ts —
   blocks non-combatant placement (Jory, Quill are voices only, contra the
   bible). Neutral should be non-hostile, AI-ignored, non-blocking to allies.
10. Win-condition combinators (AND groups) for "defeat all provocateurs".
11. e1 polish queue: provocateurs should demonstrably fire first (premise is
    only asserted); rail-showcase triggers; Maren placement; consider
    unitDowned:rowen loss to establish stakes at battle 1.

## Open decisions

- **Retro-PS1 vs. HD-2D shader treatment** — decide once art direction
  exists; the architecture is identical either way.
- **Gamepad support** — keyboard/mouse first; input abstraction keeps this
  cheap later.
- **Resolve/Attunement formula details** — how far the pair deviates from
  Brave/Faith's exact multipliers.
