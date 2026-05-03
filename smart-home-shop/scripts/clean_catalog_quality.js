"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { TextDecoder } = require("util");
let iconv = null;
try {
  iconv = require("iconv-lite");
} catch {
  iconv = null;
}

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const BACKUP_DIR = path.join(ROOT, "data");

const writeMode = process.argv.includes("--write");

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function hasMojibakeMarkers(value) {
  const s = String(value || "");
  if (!s) return false;
  return /(?:Р.|С.){3,}|Гђ|Г‘|Ã.|Ð.|Ñ.|�/u.test(s);
}

function cp1251ByteFromChar(ch) {
  const code = ch.charCodeAt(0);
  if (code <= 0x7f) return code;
  if (code === 0x0401) return 0xa8;
  if (code === 0x0451) return 0xb8;
  if (code >= 0x0410 && code <= 0x044f) return code - 0x350;
  if (code === 0x2116) return 0xb9;
  if (code === 0x2122) return 0x99;
  if (code === 0x2013) return 0x96;
  if (code === 0x2014) return 0x97;
  if (code === 0x2026) return 0x85;
  if (code === 0x201c) return 0x93;
  if (code === 0x201d) return 0x94;
  if (code === 0x2018) return 0x91;
  if (code === 0x2019) return 0x92;
  return null;
}

function tryFixCp1251Utf8Mojibake(value) {
  if (!hasMojibakeMarkers(value)) return value;
  const bytes = [];
  for (const ch of String(value || "")) {
    const b = cp1251ByteFromChar(ch);
    if (b == null) return value;
    bytes.push(b);
  }
  try {
    const decoded = UTF8_DECODER.decode(new Uint8Array(bytes));
    if (!decoded) return value;
    return hasMojibakeMarkers(decoded) ? value : decoded;
  } catch {
    return value;
  }
}

function tryFixWin1251ViaIconv(value) {
  if (!iconv) return value;
  const s = String(value || "");
  if (!s) return s;
  if (!hasMojibakeMarkers(s)) return s;
  try {
    const fixed = iconv.decode(iconv.encode(s, "win1251"), "utf8");
    if (!fixed) return s;
    return fixed;
  } catch {
    return s;
  }
}

function cleanText(raw) {
  let s = String(raw == null ? "" : raw);
  for (let i = 0; i < 3; i += 1) {
    const before = s;
    s = tryFixCp1251Utf8Mojibake(s);
    s = tryFixWin1251ViaIconv(s);
    if (s === before) break;
  }
  s = s
    .replace(/(?:^|[\s(])cid:\d+(?:[\s)]|$)/gi, " ")
    .replace(/cid:\d+/gi, " ")
    .replace(/\uFFFD+/g, "")
    .replace(/[\u0080-\u009F]/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function parseAttributes(raw) {
  const source = String(raw || "").trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeAttrKey(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/[.:;,/()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreAttrValue(v) {
  const s = cleanText(v);
  if (!s) return -1;
  let score = s.length;
  if (hasMojibakeMarkers(s)) score -= 100;
  if (/cid:\d+/i.test(s)) score -= 100;
  return score;
}

function cleanAttributes(raw) {
  const rows = parseAttributes(raw);
  const byKey = new Map();

  for (const row of rows) {
    const name = cleanText(row?.name || row?.key || "");
    const value = cleanText(row?.value || "");
    if (!name) continue;
    if (!value) continue;

    const normalizedKey = normalizeAttrKey(name);
    const candidate = { name, value };
    const prev = byKey.get(normalizedKey);
    if (!prev) {
      byKey.set(normalizedKey, candidate);
      continue;
    }
    if (scoreAttrValue(candidate.value) > scoreAttrValue(prev.value)) {
      byKey.set(normalizedKey, candidate);
    }
  }

  const dedup = [];
  const seenPairs = new Set();
  for (const item of byKey.values()) {
    const pair = `${normalizeAttrKey(item.name)}||${item.value.toLowerCase()}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    dedup.push(item);
  }
  return dedup;
}

function backupDatabase() {
  const target = path.join(BACKUP_DIR, `shop.db.bak_quality_${nowStamp()}`);
  fs.copyFileSync(DB_PATH, target);
  return target;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`DB not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { timeout: 10000 });
  const rows = db
    .prepare(
      `
      SELECT id, description, specs, attributes_json AS attributesJson, updated_at AS updatedAt
      FROM products
      ORDER BY id
    `
    )
    .all();

  const update = db.prepare(
    `
    UPDATE products
    SET description = @description,
        specs = @specs,
        attributes_json = @attributesJson,
        updated_at = @updatedAt
    WHERE id = @id
  `
  );

  let changed = 0;
  let changedAttributes = 0;
  let changedSpecs = 0;
  let changedDescription = 0;
  const samples = [];

  const tx = db.transaction(() => {
    for (const row of rows) {
      const nextDescription = cleanText(row.description || "");
      const nextSpecs = cleanText(row.specs || "");
      const nextAttributes = cleanAttributes(row.attributesJson || "[]");
      const nextAttributesJson = JSON.stringify(nextAttributes);

      const oldAttributesJson = String(row.attributesJson || "[]");
      const isChanged =
        nextDescription !== String(row.description || "") ||
        nextSpecs !== String(row.specs || "") ||
        nextAttributesJson !== oldAttributesJson;

      if (!isChanged) continue;

      changed += 1;
      if (nextDescription !== String(row.description || "")) changedDescription += 1;
      if (nextSpecs !== String(row.specs || "")) changedSpecs += 1;
      if (nextAttributesJson !== oldAttributesJson) changedAttributes += 1;

      if (samples.length < 25) {
        samples.push({
          id: row.id,
          changedDescription: nextDescription !== String(row.description || ""),
          changedSpecs: nextSpecs !== String(row.specs || ""),
          changedAttributes: nextAttributesJson !== oldAttributesJson
        });
      }

      if (writeMode) {
        update.run({
          id: row.id,
          description: nextDescription,
          specs: nextSpecs,
          attributesJson: nextAttributesJson,
          updatedAt: new Date().toISOString()
        });
      }
    }
  });

  let backupPath = "";
  if (writeMode) {
    backupPath = backupDatabase();
    tx();
  } else {
    tx();
  }

  console.log(`Products scanned: ${rows.length}`);
  console.log(`Products changed: ${changed}`);
  console.log(`Changed description: ${changedDescription}`);
  console.log(`Changed specs: ${changedSpecs}`);
  console.log(`Changed attributes_json: ${changedAttributes}`);
  if (writeMode) {
    console.log(`DB backup: ${backupPath}`);
  } else {
    console.log("Dry-run only. Add --write to apply changes.");
  }
  console.log("Sample rows:");
  samples.forEach((s) =>
    console.log(
      `- ${s.id}: description=${s.changedDescription}, specs=${s.changedSpecs}, attributes=${s.changedAttributes}`
    )
  );
}

main();
