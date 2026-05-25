const nodeTest = require("node:test");
const assert = require("node:assert/strict");

const test = globalThis.test || nodeTest;

module.exports = {
  assert,
  test
};
