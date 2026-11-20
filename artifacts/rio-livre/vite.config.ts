import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: path.resolve(root, "dist"),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        main: path.resolve(root, "index.html"),
        game: path.resolve(root, "game.html"),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
