const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const targets = ["server.js", "db", "routes", "services", "scripts", "test", "test-support"];
const exts = new Set([".js", ".mjs", ".cjs"]);
const ignoreDirs = new Set(["node_modules", ".git", "tmp", "reports", "coverage", "dist", "build", "archive", "__pycache__"]);

function collect(filePath, out) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  if (stat.isFile()) {
    if (exts.has(path.extname(filePath).toLowerCase())) out.push(filePath);
    return;
  }
  const entries = fs.readdirSync(filePath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(filePath, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      collect(full, out);
      continue;
    }
    if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
}

const files = [];
for (const target of targets) collect(path.join(root, target), files);
const unique = Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));

let failed = 0;
for (const file of unique) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const run = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (run.status !== 0) {
    failed += 1;
    process.stderr.write(`\n[lint:syntax] ${rel}\n`);
    if (run.stderr) process.stderr.write(run.stderr);
  }
}

if (failed > 0) {
  process.stderr.write(`\nSyntax lint failed: ${failed} file(s)\n`);
  process.exit(1);
}

console.log(`Syntax lint passed: ${unique.length} file(s)`);
