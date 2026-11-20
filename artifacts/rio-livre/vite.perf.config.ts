import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    ssr: true,
    outDir: path.resolve(root, ".perf"),
    emptyOutDir: true,
    minify: false,
    target: "node20",
    rollupOptions: {
      input: path.resolve(root, "tests/perf.ts"),
      output: { format: "esm", entryFileNames: "perf.mjs" },
    },
  },
});
