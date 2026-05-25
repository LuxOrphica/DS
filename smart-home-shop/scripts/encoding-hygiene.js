#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const writeRequested = args.has("--write");
const includeLegacyData = args.has("--include-legacy-data");
const reportPath = path.join(rootDir, "reports", "encoding-hygiene-report.json");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const TARGET_GROUPS = [
  { dir: "public", exts: new Set([".js", ".mjs", ".cjs", ".html", ".css"]) },
  { dir: "data", exts: new Set([".json"]) },
  { dir: "db", exts: new Set([".js", ".mjs", ".cjs", ".json"]) }
];
const TARGET_FILES = ["server.js"];
const IGNORE_DIRS = new Set(["node_modules", ".git", "tmp", "dist", "build", "coverage", "reports"]);

const BAD_MARKER_RX = /(?:\uFFFD|\u043F\u0457\u0457\u0405|cid:\d+|\(cid:\d+\))/g;
const MOJI_PAIR_RX = /[\u0420\u0421][^\s.,:;!?()[\]{}"'`<>\/\\|+\-=]/g;
const MOJI_RUN_RX = /(?:[\u0420\u0421][^\s.,:;!?()[\]{}"'`<>\/\\|+\-=]){3,}/g;
const CYR_RX = /[\u0410-\u042F\u0430-\u044F\u0401\u0451]/g;

function rel(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function isNonBlockingDataFile(filePath) {
  return /^data\/import\//.test(filePath) ||
    /^data\/larnitech_(?:detailed_specs|pdf_extracted|products_detailed|products_full|toc_pages_2_3)\.json$/.test(filePath);
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function walk(baseDir, exts, out = []) {
  if (!fs.existsSync(baseDir)) return out;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(full, exts, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (exts.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function stats(text) {
  const value = String(text || "");
  const badMarkers = (value.match(BAD_MARKER_RX) || []).length;
  const mojiPairs = (value.match(MOJI_PAIR_RX) || []).length;
  const mojiRuns = (value.match(MOJI_RUN_RX) || []).length;
  const cyrCount = (value.match(CYR_RX) || []).length;
  const score = badMarkers * 15 + mojiRuns * 10;
  return { score, badMarkers, mojiPairs, mojiRuns, cyrCount };
}

function collectSuspiciousLines(text, limit = 80) {
  const out = [];
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const kinds = [];
    if (BAD_MARKER_RX.test(line)) kinds.push("bad-marker");
    if (MOJI_RUN_RX.test(line)) kinds.push("mojibake-run");
    BAD_MARKER_RX.lastIndex = 0;
    MOJI_RUN_RX.lastIndex = 0;
    MOJI_PAIR_RX.lastIndex = 0;
    if (kinds.length > 0) {
      out.push({
        line: i + 1,
        kinds,
        text: line.length > 220 ? `${line.slice(0, 217)}...` : line
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}

function collectTargets() {
  const out = [];
  for (const group of TARGET_GROUPS) {
    out.push(
      ...walk(path.join(rootDir, group.dir), group.exts).filter((filePath) => {
        const fileRel = rel(filePath);
        if (includeLegacyData) return true;
        return !isNonBlockingDataFile(fileRel);
      })
    );
  }
  for (const fileName of TARGET_FILES) {
    const full = path.join(rootDir, fileName);
    if (fs.existsSync(full)) out.push(full);
  }
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
}

function main() {
  if (writeRequested) {
    console.warn("encoding-hygiene: --write is disabled. Fix source text manually and commit valid UTF-8.");
  }

  const files = collectTargets();
  const report = {
    mode: "audit",
    writeRequested,
    includeLegacyData,
    checkedAt: new Date().toISOString(),
    checkedFiles: files.length,
    files: []
  };

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath);
    const hadBom = hasUtf8Bom(raw);

    let decoded;
    let invalidUtf8 = false;
    try {
      decoded = utf8Decoder.decode(raw);
    } catch {
      invalidUtf8 = true;
      decoded = raw.toString("utf8");
    }

    const currentStats = stats(decoded.replace(/^\uFEFF/, ""));
    const suspicious = currentStats.score > 0 || invalidUtf8 || hadBom;
    if (suspicious) {
      const fileRel = rel(filePath);
      report.files.push({
        file: fileRel,
        blocking: !isNonBlockingDataFile(fileRel),
        hadBom,
        invalidUtf8,
        stats: currentStats,
        suspiciousLines: collectSuspiciousLines(decoded)
      });
    }
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const problematic = report.files.filter((f) => f.hadBom || f.invalidUtf8 || (f.stats?.score || 0) > 0);
  const blocking = problematic.filter((f) => f.blocking !== false);
  console.log(`Checked: ${report.checkedFiles} files`);
  console.log(`Problematic: ${problematic.length} files`);
  console.log(`Blocking: ${blocking.length} files`);
  console.log(`Report: ${rel(reportPath)}`);

  if (blocking.length > 0) process.exit(1);
}

main();
