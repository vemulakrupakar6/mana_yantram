import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)
          )
            return "react";
          if (/\/node_modules\/(zod|react-hook-form|@hookform)\//.test(id)) return "forms";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
