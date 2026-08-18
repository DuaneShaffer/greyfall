# Greyfall

An original industrial-fantasy tactics RPG — magic as an industrial resource,
interactive battlefields (operable machinery, destructible terrain) — whose
mechanical skeleton follows the Final Fantasy Tactics tradition: CT turn
order, facing, charge-time casting, job-based growth. TypeScript + Three.js:
3D terrain meshes with billboarded pixel-art sprites, orthographic camera,
game logic runs headless in Node for tests and simulation.

Read `docs/PROJECT_BREAKDOWN.md` for the full workstream breakdown, stack
rationale, agent phasing plan, and open decisions. Read
`docs/CREATIVE_BIBLE.md` before producing any content, story, art, or
ability design — it is the source of creative truth. Read
`docs/ARCHITECTURE.md` before writing code — dependency rules and
determinism rules there are binding.

Content lives as JSON in `data/`, validated by the zod schemas in
`src/data/schemas/` (the frozen contract; amend schemas deliberately, never
ad hoc). `npm test` validates content and cross-references; `npm run
typecheck` runs tsc.

The README screenshots (`docs/media/*.png`) must track the game's real look:
after landing any change that affects what the battle screen looks like (UI
chrome or layout, rendering, sprites, terrain, bloom/post), run `npm run
shots` from a clean tree and commit the refreshed images with the change.

Iterate with `npm run test:fast`. It drops the per-job sprite conformance
shards and the two balance sweeps — `tests/sim/sweeps.test.ts` and
`tests/sim/meterHouse.test.ts`, which are minutes of battles whose numbers are
aggregates over whole seed sets and so cannot be parallelised — and runs
everything else, every golden replay included, in a quarter of the time. It is
an inner-loop tool and never the gate: the full `npx vitest run` must pass
before any commit.

The default gate runs the balance instruments CI-sized (a deterministic seed
subset against widened bands). `GREYFALL_SIM=full` runs the whole measurement —
all seed sets, the tight bands `docs/BALANCE_REPORT.md` records. Any change
that touches balance (abilities, stats, AI weights, encounter content) must
pass the full measurement before it lands, not just the smoke gate.
