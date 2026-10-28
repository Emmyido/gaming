import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build`        -> dist/        (static site: host on greenrevs.com/roadtrip or any CDN)
// `npm run build:single` -> dist-single/ (one self-contained index.html, handy for mobile WebViews)
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "single" ? [viteSingleFile()] : [],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    chunkSizeWarningLimit: 1200,
  },
  test: { environment: "node" },
}));
