const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const DETAILS_PATH = path.join(ROOT, "data", "larnitech_detailed_specs.json");

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanLine(v) {
  return String(v || "")
    .replace(/\(cid:\d+\)/gi, " ")
    .replace(/\s+/g, " ")
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

function extractFunctionLines(text) {
  const src = String(text || "");
  if (!src.trim()) return [];

  const lines = src
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const startIdx = lines.findIndex((l) => /^(функц|functions?)/i.test(l));
  if (startIdx < 0) return [];

  const out = [];
  const seen = new Set();
  let started = false;

  function pushLine(raw) {
    let v = cleanLine(raw)
      .replace(/^[▪▫•·\-\u2022]+\s*/g, "")
      .replace(/^\d+[.)]\s*/g, "")
      .trim();
    if (!v) return;
    if (v.length < 3) return;
    if (/^(тип монтажа|материал корпуса|класс защиты|температурный диапазон|габариты|масса|название параметра|значение)$/i.test(v)) {
      return;
    }
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  }

  for (let i = startIdx; i < lines.length; i++) {
    const l = lines[i];
    const low = l.toLowerCase();

    if (i === startIdx) {
      started = true;
      const tail = l.replace(/^(функц(?:ии)?|functions?)\s*[:\-]?\s*/i, "").trim();
      if (tail) {
        tail.split(/[;|]/g).forEach(pushLine);
      }
      continue;
    }

    if (!started) continue;

    if (
      /^(пример подключения|характеристики|название параметра|parameter name|control parameters|viewing angle|power supply|max current)/i.test(low)
    ) {
      break;
    }

    if (/^(тип монтажа|материал корпуса|класс защиты|температурный диапазон|габариты|масса)\b/i.test(low)) {
      break;
    }

    // Keep bullet-like and short functional statements; skip dense garbage lines.
    if (/^[▪▫•·\-\u2022]/.test(l) || l.length <= 140) {
      l.split(/[;|]/g).forEach(pushLine);
    }
  }

  return out.slice(0, 24);
}

function main() {
  if (!fs.existsSync(DETAILS_PATH)) {
    console.error(`details file not found: ${DETAILS_PATH}`);
    process.exit(1);
  }
  const details = JSON.parse(fs.readFileSync(DETAILS_PATH, "utf8"));
  const db = new Database(DB_PATH, { timeout: 15000 });

  const rows = db
    .prepare("SELECT id, article, attributes_json FROM products WHERE lower(brand)='larnitech'")
    .all();

  const byNormArticle = new Map();
  for (const r of rows) {
    const keys = [norm(r.id), norm(r.article)];
    for (const k of keys) {
      if (!k) continue;
      const arr = byNormArticle.get(k) || [];
      arr.push(r);
      byNormArticle.set(k, arr);
    }
  }

  const update = db.prepare("UPDATE products SET attributes_json=@attrs, updated_at=@updatedAt WHERE id=@id");
  const now = new Date().toISOString();

  let touchedProducts = 0;
  let addedFunctionRows = 0;
  const noTarget = [];
  const noFunctionsInDetail = [];

  const tx = db.transaction(() => {
    for (const [key, item] of Object.entries(details || {})) {
      const detailText = String((item && item.text) || "");
      const functionLines = extractFunctionLines(detailText);
      if (!functionLines.length) {
        noFunctionsInDetail.push(key);
        continue;
      }

      const nk = norm((item && item.article) || key);
      let targets = byNormArticle.get(nk) || [];

      // Special bucket for "METAFORSA" generalized entry.
      if (!targets.length && nk === "metaforsa") {
        targets = rows.filter((r) => norm(r.id).startsWith("metaforsa") || norm(r.article).startsWith("metaforsa"));
      }

      if (!targets.length) {
        noTarget.push(key);
        continue;
      }

      for (const t of targets) {
        const attrs = parseJsonArray(t.attributes_json);
        const existingFunctionValues = new Set(
          attrs
            .filter((a) => /^функц/i.test(String((a && a.name) || "").toLowerCase()) || /^(function|functions)$/i.test(String((a && a.name) || "")))
            .map((a) => cleanLine(a && a.value).toLowerCase())
            .filter(Boolean)
        );

        let localAdded = 0;
        for (const line of functionLines) {
          const v = cleanLine(line);
          const lk = v.toLowerCase();
          if (!v || existingFunctionValues.has(lk)) continue;
          attrs.push({ name: "Функция", value: v });
          existingFunctionValues.add(lk);
          localAdded += 1;
        }

        if (localAdded > 0) {
          update.run({
            id: t.id,
            attrs: JSON.stringify(attrs, null, 0),
            updatedAt: now
          });
          touchedProducts += 1;
          addedFunctionRows += localAdded;
        }
      }
    }
  });

  tx();
  db.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        touchedProducts,
        addedFunctionRows,
        noTargetCount: noTarget.length,
        noTarget,
        noFunctionsInDetailCount: noFunctionsInDetail.length,
        noFunctionsInDetail
      },
      null,
      2
    )
  );
}

main();

