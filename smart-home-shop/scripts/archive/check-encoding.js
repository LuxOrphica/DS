#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const target = path.join(__dirname, "encoding-hygiene.js");
const result = spawnSync("node", [target], { stdio: "inherit" });
process.exit(typeof result.status === "number" ? result.status : 1);
