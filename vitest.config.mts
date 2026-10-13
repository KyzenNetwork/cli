import { defineConfig } from "vitest/config";

// The CLI's unit tests; none of them reads a network.
export default defineConfig({ test: { environment: "node", include: ["cli/src/**/*.test.ts"] } });
