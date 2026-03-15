#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

console.warn("[deprecated] fix-mojibake.js -> encoding-hygiene.js --write");

const target = path.join(__dirname, "encoding-hygiene.js");
const result = spawnSync("node", [target, "--write"], { stdio: "inherit" });
process.exit(typeof result.status === "number" ? result.status : 1);
