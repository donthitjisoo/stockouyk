import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  envDir: "..",
  base: "./",
  plugins: [react()],
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 900
  }
});
