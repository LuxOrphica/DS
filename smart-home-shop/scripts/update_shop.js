#!/usr/bin/env node
const path = require("path");
const { runPipeline } = require("./lib/run_pipeline");

async function main() {
  const scriptsDir = __dirname;
  await runPipeline("Shop update (clean + import new structure)", [
    {
      script: path.join(scriptsDir, "clean_data.js"),
      description: "Step 1/2: clean old data"
    },
    {
      script: path.join(scriptsDir, "import_new_structure.js"),
      description: "Step 2/2: import new structure"
    }
  ]);

  console.log("\nStart server: npm start");
  console.log("Storefront: http://localhost:3030");
}

main().catch((error) => {
  console.error(`\nUpdate failed: ${error.message}`);
  process.exit(1);
});
