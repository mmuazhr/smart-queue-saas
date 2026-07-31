import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Vitest 4 removed the old `all: true` flag -- `include` alone now
      // reports every matching file, not just ones touched by a test.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/types/**", "**/*.d.ts"],
      // Floor is the measured baseline at the time CI was introduced (Statements
      // 4.48%, Branches 4.41%, Functions 8.94%, Lines 4.33%) minus a small margin
      // so measurement noise doesn't flake the build. Ratchet these up as Phase 3
      // test coverage work lands -- do not jump straight to a high target.
      thresholds: {
        statements: 4,
        branches: 4,
        functions: 8,
        lines: 4,
      },
    },
  },
});
