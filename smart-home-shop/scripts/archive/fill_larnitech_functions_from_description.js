const Database = require("better-sqlite3");

const db = new Database("data/shop.db", { timeout: 15000 });

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function clean(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFunctionAttrs(attrs) {
  return (attrs || []).some((a) => {
    const key = String((a && a.name) || "").toLowerCase().trim();
    return /^функц/.test(key) || key === "function" || key === "functions";
  });
}

function pickFunctionFromDescription(description) {
  const text = clean(description);
  if (!text || text.length < 20) return "";
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean);

  const badStart = /^(артикул|питание|напряжение|тип|класс защиты|габариты|масса)\b/i;
  const goodHint = /\b(модул|контрол|датчик|устройств|предназначен|разработан|управлен|поддерж|позвол|использ|подключ)\b/i;

  for (const p of parts) {
    if (p.length < 20) continue;
    if (badStart.test(p)) continue;
    if (!goodHint.test(p)) continue;
    return p.replace(/\s*[.;:]+$/, "").trim();
  }

  return "";
}

function main() {
  const rows = db
    .prepare("SELECT id, article, name, description, attributes_json FROM products WHERE lower(brand)='larnitech' AND id!='direction-larnitech'")
    .all();
  const update = db.prepare("UPDATE products SET attributes_json=@attrs, updated_at=@updatedAt WHERE id=@id");
  const now = new Date().toISOString();

  let touched = 0;
  let added = 0;
  const skipped = [];

  const tx = db.transaction(() => {
    for (const r of rows) {
      const attrs = parseJsonArray(r.attributes_json);
      if (hasFunctionAttrs(attrs)) continue;

      const fn = pickFunctionFromDescription(r.description);
      if (!fn) {
        skipped.push(r.id);
        continue;
      }

      attrs.push({ name: "Функция", value: fn });
      update.run({
        id: r.id,
        attrs: JSON.stringify(attrs),
        updatedAt: now
      });
      touched += 1;
      added += 1;
    }
  });
  tx();
  db.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        touchedProducts: touched,
        addedFunctionRows: added,
        skippedCount: skipped.length,
        skipped
      },
      null,
      2
    )
  );
}

main();

