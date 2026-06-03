import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const usePolling = process.env.VITE_USE_POLLING === "true";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": [
            "@tanstack/react-query",
            "@tanstack/react-query-devtools",
          ],
          "ui-vendor": ["lucide-react"],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: ["localhost", "127.0.0.1", "floci-ui"],
    watch: {
      usePolling,
    },
    proxy: {
      "/api": {
        target: process.env.API_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
