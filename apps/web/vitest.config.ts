import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // @vitejs/plugin-react transforms JSX/TSX in tests (components under
  // test import .tsx modules with jsx:preserve sources). Component tests
  // still prefer React.createElement in .ts files for speed; full .tsx
  // suites (ea-stream-drop) run through this transform.
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Playwright E2E specs live in tests/e2e/ and run via `playwright test`,
    // not vitest. Without this exclusion vitest tries to load them and fails
    // with "Playwright Test did not expect test.describe() to be called here",
    // which fails the whole unit suite in CI.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
