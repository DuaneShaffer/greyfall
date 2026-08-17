# FFT Clone

Tactics RPG with FFT's mechanical skeleton in an original industrial-fantasy
setting (magic as industrial resource; interactive battlefields — operable
machinery, destructible terrain). TypeScript + Three.js:
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
