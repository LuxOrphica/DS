const { test } = require("node:test");

const { compareSnapshot } = require("../scripts/catalog_golden_snapshot");

test("catalog golden master matches current database snapshot", () => {
  compareSnapshot();
});
