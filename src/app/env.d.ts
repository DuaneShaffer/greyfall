/// <reference types="vite/client" />

// `src/app` is the browser entry: it reaches for Vite's build-time helpers
// (`import.meta.glob` for the content directories, CSS side-effect imports).
// A sibling `content.d.ts` would be shadowed by `content.ts`, so the reference
// lives in its own file.
