import { defineConfig } from "vitest/config";

// Firestore emulator tests: security rules and the server reminder job.
// Run with `npm run test:rules`, which starts the emulator (needs Java).
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // "server-only" throws outside Next's server bundle; it is a no-op here.
      "server-only": new URL("./tests/rules/server-only-stub.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
