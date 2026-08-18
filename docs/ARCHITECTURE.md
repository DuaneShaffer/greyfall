# Architecture

How the code is organized and how systems talk to each other. Binding on all
implementation agents. `docs/CREATIVE_BIBLE.md` governs what gets built; this
governs how.

## Principles

1. **The core is headless and deterministic.** All game rules run in plain
   TypeScript with no DOM, no Three.js, no timers, no wall-clock. The same
   inputs always produce the same battle. This is what makes tests, replays,
   the balance simulator, and AI development possible.
2. **Commands in, events out.** The only way to change game state is to apply
   a **Command** (a serializable intent: "move unit A to (x,y)", "use Overload
   Cell on tile T"). The core validates it against the rules and returns
   **Events** (serializable facts: `UnitMoved`, `CellOverloaded`,
   `CatwalkCollapsed`, `UnitDowned`). Everything downstream — renderer, UI,
   audio, logs, tests — consumes events. Nothing downstream mutates state.
3. **The map is mutable state, not level geometry.** Destructible terrain and
   operable machinery mean pathfinding, line-of-sight, and targeting query
   live map state on every evaluation. No precomputed static navgrids or
   baked LoS tables.
4. **Data is content, code is rules.** Jobs, abilities, items, maps, and
   encounters are JSON validated by zod schemas. Content agents edit JSON;
   engine agents edit rules that interpret it. The schemas are the contract
   between them.

## Package layout

Single npm package, Vite + TypeScript (strict), Vitest; no linter.

```
src/
  core/      # headless game logic — imports nothing from below this line
    state/     # GameState types, serialization
    rules/     # movement, targeting, damage, status, CT engine, machinery
    commands/  # command types + validation + application
    events/    # event types
    ai/        # enemy decision-making (consumes state, produces commands)
    progression/ # campaign state, job levels, learning, between-battle ops
    rng/       # seeded RNG
  data/      # zod schemas + content loaders/validators
  render/    # Three.js: terrain mesh, billboards, camera, VFX
  ui/        # DOM overlay: menus, forecast panel, battle HUD
  art/       # sprite generation and external-master intake
  app/       # browser entry: wires core + render + ui together
  sim/       # headless entry: AI-vs-AI battles, balance harness
data/        # content JSON: jobs/, abilities/, items/, maps/, encounters/
tools/       # authoring tools (map editor, later)
```

**Dependency rule:** `core` imports only from `core` and type-only from `data`
schemas. `render`, `ui`, and `sim` import from `core` and `data`; never from
each other. `app` imports anything. Nothing mechanises this yet — there is no
lint step; what holds it are the seam headers on the crossing modules
(`render/presentation.ts`, `render/adapter.ts`, `ui/intents.ts`,
`ui/state.ts`), which name the one legal crossing and say what may not import
what, plus review. Three.js appearing in `core` is a bug this document names,
not something the build catches.

## The core loop

```
applyCommand(state: GameState, cmd: Command): { state: GameState, events: Event[] }
```

Pure function over immutable-in-practice state (structural sharing where
cheap, cloning where clear). A battle is: initial state (map + encounter +
units + RNG seed) plus an ordered command log. That gives us for free:

- **Save/load** — serialize `GameState` to JSON (versioned envelope).
- **Replay** — initial state + command log re-produces the identical battle;
  golden-replay tests catch rule regressions.
- **Undo in tools/debug** — keep prior states. The player-facing one-step undo
  (`COMBAT_RULES` §10b) is the same trick made a rule: `GameState.moveUndo`
  holds the pre-move battle, and `{ kind: "undoMove" }` restores it wholesale.
  It is still plain JSON, and it is still one snapshot deep.
- **AI and player parity** — the AI emits the same `Command` type the input
  layer does; the core cannot tell who is playing.

### Determinism rules (binding)

- One seeded RNG stream lives inside `GameState`; every roll draws from it.
  No `Math.random`, `Date.now`, or platform-dependent iteration order in
  `core`.
- Damage/CT formulas use integer math (FFT's own convention) — no float
  accumulation drift between platforms.
- Collections that affect rule outcomes iterate in explicit, stable order
  (unit id, tile index), never object-key order.

## Battlefield-as-system model

The map is a heightfield of **tiles** plus a set of **map objects** (presses,
switches, lifts, cells, catwalks, walls). Both carry state:

- Tiles: terrain type, height, standability, hazard state (scalded, gas).
- Objects: `powered` flag, structural integrity, activation state, occupancy
  and blocking footprint.
- Flux grids: a map may declare **grids** — nodes (sources with a capacity,
  sinks with a draw, ties and buses) joined by edges, with each object's
  `network` tag naming the grid it belongs to. Energization is then a graph
  walk rather than a per-object flag, and a section drawing past its source's
  rating trips it (`docs/design/FLUX_GRID.md`). A map that declares no grid
  behaves exactly as before: `powered` alone decides.

Interactions are rules, not scripts: an ability targets a tile or object; the
rules resolve what that does (`Overload Cell` on a powered press → press
destroyed → `PressDestroyed`, tiles it shaded become standable, LoS changes).
Encounter JSON may attach **triggers** (declarative condition → command) for
scripted beats like Refinery Three's midpoint, but triggers inject commands
through the same front door — no side channel mutates state.

Pathfinding (uniform-cost search over the tile graph with Move/Jump edge
rules, producing the whole move field the UI paints anyway) and LoS
(height-aware ray sampling) are pure functions of current state, called
per-query. Maps are FFT-scale (< ~20×20, < ~20 units); recompute-on-demand is
well within budget and avoids cache-invalidation bugs when a Saboteur deletes
a wall.

## Renderer and UI

The core resolves a command instantly; the renderer plays the resulting event
list back at animation pace through a **presentation queue** (event →
animation, sequenced, skippable). Renderer state is derived, never
authoritative — it can be rebuilt from `GameState` at any time (this is also
how load-game renders).

- `render/` (Three.js): terrain mesh built from tile data, units as
  camera-facing billboard quads driven by the sprite spec, orthographic
  camera orbiting in 90° steps, object/hazard visual states, later the
  post-processing chain.
- `ui/` (DOM overlay): all menus, the attack forecast, HUD, between-battle
  screens as HTML/CSS over the canvas. Tactics games are half menus; DOM is
  dramatically faster to build and test (agents can drive it with standard
  DOM tooling) than in-canvas UI, and gets accessibility semantics for free.
  Input flows UI → command → core.

## Content pipeline

zod schemas in `src/data` are the single source of truth for content shape;
TS types derive from them (`z.infer`). Loaders validate all JSON at startup
(dev) and in a `validate-content` test that runs in CI — malformed content
fails the build, not the battle. Every content file carries `schemaVersion`.

Ability effects are data too: a small composable effect vocabulary
(`damage`, `applyStatus`, `forceMove`, `setPower`, `damageObject`,
`spawnObject`, …) interpreted by `core/rules`. New abilities are usually new
JSON; a new effect primitive is an engine change with tests.

## Testing & simulation

- **Formula tests** — "Arc from a unit with 60 Attunement onto wet tiles →
  exactly N damage" (Vitest, `core` only).
- **Golden replays** — recorded command logs per slice battle; rule changes
  that alter outcomes must regenerate goldens deliberately.
- **Content validation** — schemas + cross-reference checks (every ability an
  encounter references exists, every map object id is unique).
- **Sim harness** (`src/sim`) — headless AI-vs-AI battles over encounter
  matrices for balance sweeps and degenerate-strategy hunting; emits stats
  (win rates, job usage, turn counts).

## Deliberately deferred

- Cutscene script format — post-slice; scripted beats in the slice use
  encounter triggers + dialogue lines only.
- **Mid-battle save/load — deliberately not built.** What is persisted is
  `CampaignState` (roster, progress, inventory, fallen, encounter index), one
  file per campaign, written between battles. A battle is initial state plus a
  command log, so resuming one mid-fight is a replay-format problem rather than
  a save-format one: it needs the log persisted, the RNG stream restored at the
  right draw, and a rule that a reloaded battle cannot re-roll a miss. None of
  that is hard and none of it is free, and an engagement being a thing you
  finish is a design position as much as a scope one. Recorded so it reads as a
  decision rather than an omission.
- Gamepad input, audio engine, post-processing chain, map editor tooling.
