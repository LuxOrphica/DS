const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const REPORT_PATH = path.join(ROOT, "data", "import", "specs-normalize-report.json");

const KNOWN_KEYS = [
  "Контролируемые параметры",
  "Допустимые типы проводов для подключения",
  "Дальность действия ИК-передатчика",
  "Макс. дистанция обнаружения",
  "Интерфейсы входа/выхода",
  "Скорость передачи данных",
  "Температурный диапазон",
  "Макс. нагрузка на устройство",
  "Макс. нагрузка на канал",
  "Выходные каналы кол-во",
  "Дискретные входы кол-во",
  "Входы датчиков кол-во",
  "Входы сухих контактов кол-во",
  "Максимальный ток шины CAN",
  "Максимальный ток (24V)",
  "Макс. длина шины CAN",
  "Тип диммирования",
  "Тип подключения",
  "Тип напряжения",
  "Тип интерфейса",
  "Тип шины",
  "Тип монтажа",
  "Класс защиты",
  "Материал корпуса",
  "Питание",
  "Напряжение",
  "Габариты",
  "Масса",
  "Power supply",
  "Max current(13V)",
  "Max current (24V)",
  "Viewing angle",
  "Control parameters",
  "Parameter name",
  "Output channels",
  "Input channels",
  "Mounting type",
  "Protection class"
].sort((a, b) => b.length - a.length);

const GENERIC_KEYS = new Set([
  "название параметра",
  "parameter name",
  "параметр",
  "значение",
  "value",
  "spec",
  "specs"
]);

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.:;,]/g, "")
    .trim();
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+/g, " | ")
    .trim();
}

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function dedupePairs(pairs) {
  const out = [];
  const seen = new Set();
  for (const p of pairs || []) {
    const name = cleanValue(p && p.name);
    const value = cleanValue(p && p.value);
    if (!name || !value) continue;
    const nk = normalizeKey(name);
    if (GENERIC_KEYS.has(nk)) continue;
    const key = `${nk}::${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, value });
  }
  return out;
}

function parseByColonOrDash(line) {
  const s = cleanValue(line);
  if (!s) return null;
  const m = s.match(/^([^:]{2,80})\s*:\s*(.{1,300})$/);
  if (m) return { name: cleanValue(m[1]), value: cleanValue(m[2]) };
  const m2 = s.match(/^([A-Za-zА-Яа-я0-9().\/\- ]{2,80})\s+([0-9].{0,220})$/);
  if (m2) return { name: cleanValue(m2[1]), value: cleanValue(m2[2]) };
  return null;
}

function splitByKnownKeys(chunk) {
  const text = cleanValue(chunk);
  if (!text || text.length < 12) return [];

  const hits = [];
  const lower = text.toLowerCase();
  for (const key of KNOWN_KEYS) {
    const idx = lower.indexOf(key.toLowerCase());
    if (idx >= 0) hits.push({ key, idx });
  }
  if (hits.length < 2) return [];

  hits.sort((a, b) => a.idx - b.idx);
  const compact = [];
  let last = -1;
  for (const h of hits) {
    if (h.idx === last) continue;
    compact.push(h);
    last = h.idx;
  }
  if (compact.length < 2) return [];

  const out = [];
  for (let i = 0; i < compact.length; i++) {
    const cur = compact[i];
    const nextStart = i + 1 < compact.length ? compact[i + 1].idx : text.length;
    const valueRaw = text.slice(cur.idx + cur.key.length, nextStart);
    const value = cleanValue(valueRaw.replace(/^[:\-\s|]+/, ""));
    if (!value) continue;
    if (value.length > 260) continue;
    out.push({ name: cur.key, value });
  }
  return out;
}

function parseSpecsText(rawSpecs) {
  const src = String(rawSpecs || "").trim();
  if (!src) return [];

  // JSON-like specs from old import.
  if (src.startsWith("{") || src.startsWith("[")) {
    try {
      const parsed = JSON.parse(src);
      const out = [];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object" && item.name && item.value) {
            out.push({ name: String(item.name), value: String(item.value) });
          }
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [name, value] of Object.entries(parsed)) {
          out.push({ name: String(name), value: String(value) });
        }
      }
      return dedupePairs(out);
    } catch (_) {
      // Keep going with text parse.
    }
  }

  const lines = src
    .replace(/\r/g, "\n")
    .split(/\n|;/g)
    .map((x) => cleanValue(x))
    .filter(Boolean);

  const out = [];
  for (const line of lines) {
    const pair = parseByColonOrDash(line);
    if (pair) {
      out.push(pair);
      continue;
    }
    const splitPairs = splitByKnownKeys(line);
    if (splitPairs.length) out.push(...splitPairs);
  }

  // Fallback for fully glued one-liner.
  if (!out.length) out.push(...splitByKnownKeys(src));
  return dedupePairs(out);
}

function isSuspiciousSpecs(rawSpecs) {
  const s = String(rawSpecs || "").trim();
  if (!s) return false;
  const hasSeparators = /[:;\n]/.test(s);
  let keyHits = 0;
  const lower = s.toLowerCase();
  for (const key of KNOWN_KEYS) {
    if (lower.includes(key.toLowerCase())) keyHits += 1;
    if (keyHits >= 3) break;
  }
  return keyHits >= 3 && !hasSeparators;
}

function main() {
  const db = new Database(DB_PATH, { timeout: 15000 });
  const rows = db
    .prepare(`
      SELECT id, brand, name, specs, attributes_json
      FROM products
      ORDER BY name COLLATE NOCASE ASC
    `)
    .all();

  const update = db.prepare(`
    UPDATE products
    SET specs=@specs, attributes_json=@attributesJson, updated_at=@updatedAt
    WHERE id=@id
  `);

  const report = {
    createdAt: new Date().toISOString(),
    total: rows.length,
    updated: 0,
    unchanged: 0,
    suspicious: [],
    updatedItems: []
  };

  const tx = db.transaction((items) => {
    for (const row of items) {
      const attrs = parseJsonArray(row.attributes_json);
      const attrsClean = dedupePairs(attrs.map((x) => ({ name: x && x.name, value: x && x.value })));
      const parsedFromSpecs = parseSpecsText(row.specs);

      const merged = dedupePairs(attrsClean.concat(parsedFromSpecs));
      const shouldUpdateAttrs = merged.length > attrsClean.length;
      const shouldUpdateSpecs = parsedFromSpecs.length >= 2;

      if (isSuspiciousSpecs(row.specs) && parsedFromSpecs.length < 2) {
        report.suspicious.push({ id: row.id, brand: row.brand, sample: String(row.specs || "").slice(0, 220) });
      }

      if (!shouldUpdateAttrs && !shouldUpdateSpecs) {
        report.unchanged += 1;
        continue;
      }

      const nextSpecs = shouldUpdateSpecs
        ? parsedFromSpecs.map((x) => `${x.name}: ${x.value}`).join("; ")
        : String(row.specs || "");

      update.run({
        id: row.id,
        specs: nextSpecs,
        attributesJson: JSON.stringify(merged),
        updatedAt: new Date().toISOString()
      });

      report.updated += 1;
      report.updatedItems.push({
        id: row.id,
        brand: row.brand,
        parsedPairs: parsedFromSpecs.length,
        attrsBefore: attrsClean.length,
        attrsAfter: merged.length
      });
    }
  });

  tx(rows);
  db.close();

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();

