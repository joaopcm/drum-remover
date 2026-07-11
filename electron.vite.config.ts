import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // The pipeline worker is a second entry bundled alongside the main
        // process; main forks `out/main/worker.js` into a utilityProcess.
        input: {
          index: resolve("src/main/index.ts"),
          worker: resolve("src/worker/index.ts"),
        },
      },
    },
    // Keep node deps (e.g. ffmpeg-static, which resolves a native binary path
    // at runtime) external rather than bundled.
    plugins: [externalizeDepsPlugin()],
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
  },
});
