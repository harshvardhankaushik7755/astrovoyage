import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from /astrovoyage/; the deploy workflow sets BASE_PATH. Locally it stays "/".
  base: process.env.BASE_PATH ?? "/",
  // the 3D view (three.js, ~510 kB) is its own chunk, loaded only when the player presses "3D view"
  build: { chunkSizeWarningLimit: 600 },
  test: { environment: "node" },
});
