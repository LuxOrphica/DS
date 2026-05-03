#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");

function runNodeScript(scriptPath, description = "") {
  return new Promise((resolve, reject) => {
    if (description) {
      console.log(`\n-> ${description}`);
    }

    const proc = spawn("node", [scriptPath], {
      stdio: "inherit",
      cwd: path.join(__dirname, "..", "..")
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Step failed with code ${code}: ${path.basename(scriptPath)}`));
    });
  });
}

async function runPipeline(title, steps) {
  console.log(`\n=== ${title} ===`);
  for (const step of steps) {
    await runNodeScript(step.script, step.description);
  }
  console.log("\nPipeline completed successfully.");
}

module.exports = {
  runNodeScript,
  runPipeline
};
