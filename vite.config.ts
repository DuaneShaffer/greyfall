import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        battle: resolve(root, "index.html"),
        harness: resolve(root, "ui-harness.html"),
      },
    },
  },
});
