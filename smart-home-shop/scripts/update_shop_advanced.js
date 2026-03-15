#!/usr/bin/env node
const path = require("path");
const { runPipeline } = require("./lib/run_pipeline");

async function main() {
  const scriptsDir = __dirname;
  await runPipeline("Shop update (clean + advanced import)", [
    {
      script: path.join(scriptsDir, "clean_data.js"),
      description: "Step 1/2: clean old data"
    },
    {
      script: path.join(scriptsDir, "import_advanced.js"),
      description: "Step 2/2: advanced import"
    }
  ]);

  console.log("\nStart server: npm start");
  console.log("Storefront: http://localhost:3030");
}

main().catch((error) => {
  console.error(`\nAdvanced update failed: ${error.message}`);
  process.exit(1);
});
