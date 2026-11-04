import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const proxy = {
  "/api": "http://127.0.0.1:8000",
  "/health": "http://127.0.0.1:8000",
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  ssr: {
    noExternal: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: [
      "e2e/**",
      "node_modules/**",
      "dist/**",
      "tests/visual/**",
      "playwright/**",
      "tools/**",
    ],
  },
});
