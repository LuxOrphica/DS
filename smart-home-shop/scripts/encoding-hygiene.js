#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");
const iconv = require("iconv-lite");

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
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

function normalizeKnownArtifacts(text) {
  return String(text || "")
    .replace(/\u0432\u201A\u00AC/g, "\u20AC")
    .replace(/\u0432\u201A\u0455/g, "\u20BD")
    .replace(/\u0432\u2030\u20AC/g, "\u2248")
    .replace(/\u0432\u20AC\u201D/g, "\u2014")
    .replace(/\u0432\u20AC\u201C/g, "\u2013")
    .replace(/\u0432\u20AC\u00A6/g, "\u2026")
    .replace(/\u0432\u20AC\u0153/g, "\u201C")
    .replace(/\u0432\u20AC\u009D/g, "\u201D")
    .replace(/\u0432\u20AC\u02DC/g, "\u2018")
    .replace(/\u0432\u20AC\u2122/g, "\u2019");
}

function stats(text) {
  const value = String(text || "");
  const badMarkers = (value.match(BAD_MARKER_RX) || []).length;
  const mojiPairs = (value.match(MOJI_PAIR_RX) || []).length;
  const mojiRuns = (value.match(MOJI_RUN_RX) || []).length;
  const cyrCount = (value.match(CYR_RX) || []).length;
  const mojiPairAllowance = Math.floor(cyrCount * 0.08);
  const mojiOverflow = Math.max(0, mojiPairs - mojiPairAllowance);
  const score = badMarkers * 15 + mojiRuns * 10 + mojiOverflow * 2;
  return { score, badMarkers, mojiPairs, mojiRuns, cyrCount };
}

function convertCp1251ToUtf8(text) {
  try {
    return iconv.decode(iconv.encode(String(text || ""), "win1251"), "utf8");
  } catch {
    return String(text || "");
  }
}

function hasControlChars(text) {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(String(text || ""));
}

function pickBestText(source) {
  const normalized = String(source || "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const candidateA = normalizeKnownArtifacts(normalized);
  const candidateB = normalizeKnownArtifacts(convertCp1251ToUtf8(normalized));
  const candidateC = normalizeKnownArtifacts(convertCp1251ToUtf8(candidateB));
  const candidates = Array.from(new Set([normalized, candidateA, candidateB, candidateC])).filter((x) => !hasControlChars(x));

  let best = {
    text: normalized,
    ...stats(normalized)
  };

  for (const candidate of candidates) {
    const st = stats(candidate);
    const betterScore = st.score + 2 < best.score;
    const sameScoreBetterMarkers = st.score === best.score && st.badMarkers < best.badMarkers;
    const sameMarkersMoreCyr = st.score === best.score && st.badMarkers === best.badMarkers && st.cyrCount > best.cyrCount;
    if (betterScore || sameScoreBetterMarkers || sameMarkersMoreCyr) {
      best = { text: candidate, ...st };
    }
  }

  return {
    source: normalized,
    output: best.text,
    before: stats(normalized),
    after: {
      score: best.score,
      badMarkers: best.badMarkers,
      mojiPairs: best.mojiPairs,
      mojiRuns: best.mojiRuns,
      cyrCount: best.cyrCount
    }
  };
}

function collectChangedLines(beforeText, afterText, limit = 200) {
  const beforeLines = String(beforeText || "").split("\n");
  const afterLines = String(afterText || "").split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const changed = [];
  for (let i = 0; i < max; i += 1) {
    const b = beforeLines[i] || "";
    const a = afterLines[i] || "";
    if (b !== a) changed.push({ line: i + 1, before: b, after: a });
    if (changed.length >= limit) break;
  }
  return changed;
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
  const files = collectTargets();
  const report = {
    mode: writeMode ? "write" : "audit",
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
      decoded = iconv.decode(raw, "win1251");
    }

    const picked = pickBestText(decoded);
    const changedLines = collectChangedLines(picked.source, picked.output);
    const changed = picked.output !== picked.source;

    if (writeMode && (hadBom || invalidUtf8 || changed)) {
      fs.writeFileSync(filePath, picked.output, "utf8");
    }

    const suspiciousBefore = picked.before.score > 0 || invalidUtf8 || hadBom;
    const suspiciousAfter = picked.after.score > 0;
    if (suspiciousBefore || changed || suspiciousAfter) {
      const fileRel = rel(filePath);
      report.files.push({
        file: fileRel,
        blocking: !isNonBlockingDataFile(fileRel),
        hadBom,
        invalidUtf8,
        recodedFromCp1251: invalidUtf8,
        before: picked.before,
        after: picked.after,
        changedCount: changedLines.length,
        changedLines
      });
    }
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const problematic = report.files.filter((f) => f.hadBom || f.invalidUtf8 || f.changedCount > 0 || (f.after?.score || 0) > 0);
  const blocking = problematic.filter((f) => f.blocking !== false);
  console.log(`Checked: ${report.checkedFiles} files`);
  console.log(`Problematic: ${problematic.length} files`);
  console.log(`Blocking: ${blocking.length} files`);
  console.log(`Report: ${rel(reportPath)}`);

  if (!writeMode && blocking.length > 0) process.exit(1);
}

main();
