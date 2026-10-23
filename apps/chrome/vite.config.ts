import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: { popup: resolve(import.meta.dirname, "popup.html"), content: resolve(import.meta.dirname, "src/content.ts") }, output: { entryFileNames: "[name].js" } } }
});
