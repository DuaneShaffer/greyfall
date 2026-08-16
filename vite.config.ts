import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  // Sprite conformance sweeps run over 4x the pixels since the 64x96 re-spec.
  test: {
    testTimeout: 30_000,
  },
  build: {
    rollupOptions: {
      input: {
        battle: resolve(root, "index.html"),
        harness: resolve(root, "ui-harness.html"),
        spritePreview: resolve(root, "src/art/preview.html"),
      },
    },
  },
});
