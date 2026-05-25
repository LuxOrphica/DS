import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "test/parser-*.test.js",
      "test/property-normalization.test.js"
    ],
    exclude: [
      "test/admin-*.test.js",
      "test/catalog-*.test.js",
      "test/orders-*.test.js",
      "test/smoke.test.js",
      "test/ui-smoke.test.js"
    ],
    fileParallelism: false,
    testTimeout: 30_000
  }
});
