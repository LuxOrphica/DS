#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scriptsDir = path.join(root, "scripts");
const packageJsonPath = path.join(root, "package.json");
const reportDir = path.join(root, "reports");
const reportJsonPath = path.join(reportDir, "scripts_inventory_audit.json");
const reportMdPath = path.join(reportDir, "scripts_inventory_audit.md");

function readPackageScripts() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return pkg.scripts || {};
}

function extractReferencedScriptFiles(scriptCommands) {
  const referenced = new Set();
  const re = /scripts\/([A-Za-z0-9_.-]+\.(?:js|mjs|cjs|py))/g;
  for (const cmd of Object.values(scriptCommands)) {
    const text = String(cmd || "");
    let m;
    while ((m = re.exec(text)) !== null) {
      referenced.add(m[1]);
    }
  }
  return referenced;
}

function listScriptFiles() {
  return fs
    .readdirSync(scriptsDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => /\.(js|mjs|cjs|py)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "ru"));
}

function findNearDuplicates(files) {
  const buckets = new Map();
  for (const file of files) {
    const stem = file
      .replace(/\.(js|mjs|cjs|py)$/i, "")
      .replace(/[-_.]?(advanced|live|full|safe|new|v2|v3|copy|backup)$/i, "")
      .replace(/[-_.]?\d+$/g, "");
    if (!buckets.has(stem)) buckets.set(stem, []);
    buckets.get(stem).push(file);
  }
  return Array.from(buckets.values())
    .filter((group) => group.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0], "ru"));
}

function buildReport() {
  const packageScripts = readPackageScripts();
  const allFiles = listScriptFiles();
  const referenced = extractReferencedScriptFiles(packageScripts);
  const active = allFiles.filter((name) => referenced.has(name));
  const unreferenced = allFiles.filter((name) => !referenced.has(name));
  const nearDuplicates = findNearDuplicates(allFiles);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      all: allFiles.length,
      active: active.length,
      unreferenced: unreferenced.length,
      nearDuplicateGroups: nearDuplicates.length
    },
    active,
    unreferenced,
    nearDuplicates,
    packageScripts
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Scripts Inventory Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- All scripts: ${report.totals.all}`);
  lines.push(`- Referenced from package scripts: ${report.totals.active}`);
  lines.push(`- Unreferenced candidates: ${report.totals.unreferenced}`);
  lines.push(`- Near-duplicate groups (heuristic): ${report.totals.nearDuplicateGroups}`);
  lines.push("");

  lines.push("## Active (package scripts)");
  lines.push("");
  for (const name of report.active) lines.push(`- ${name}`);
  lines.push("");

  lines.push("## Unreferenced candidates");
  lines.push("");
  for (const name of report.unreferenced) lines.push(`- ${name}`);
  lines.push("");

  lines.push("## Near-duplicate groups");
  lines.push("");
  for (const group of report.nearDuplicates) {
    lines.push(`- ${group.join(", ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

function main() {
  const report = buildReport();
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(reportMdPath, toMarkdown(report), "utf8");

  console.log(`scripts: total=${report.totals.all}, active=${report.totals.active}, unreferenced=${report.totals.unreferenced}`);
  console.log(`report: ${path.relative(root, reportJsonPath)}`);
  console.log(`report: ${path.relative(root, reportMdPath)}`);
}

main();
