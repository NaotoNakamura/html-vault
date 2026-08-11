import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const VITE_DEV_SERVER_URL = "http://localhost:5173";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: "../public",
    // public/ already holds Rails-managed static files (favicon, robots.txt, 404.html, ...).
    // Never let Vite wipe the directory before writing its own output.
    emptyOutDir: false,
    assetsDir: "assets",
    manifest: true,
    // Rails renders the entry HTML itself, so the build entry is the module,
    // not frontend/index.html.
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/main.tsx"),
    },
  },
  server: {
    // Fixed port + origin: app/helpers/application_helper.rb hardcodes this URL
    // to load the module script cross-origin from the page Rails serves on :3000.
    port: 5173,
    strictPort: true,
    origin: VITE_DEV_SERVER_URL,
  },
});
