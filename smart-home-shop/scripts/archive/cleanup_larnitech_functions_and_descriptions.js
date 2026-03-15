const Database = require("better-sqlite3");

const db = new Database("data/shop.db", { timeout: 15000 });

function clean(v) {
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

function isFunctionKey(name) {
  const k = String(name || "").toLowerCase().trim();
  return /^функц/.test(k) || k === "function" || k === "functions";
}

function isSpecLikeLine(line) {
  const s = clean(line).toLowerCase();
  if (!s) return true;
  if (s.length < 4) return true;
  if (/^(тип монтажа|материал корпуса|класс защиты|температурный диапазон|габариты|масса|напряжение|питание|максимальный ток|тип шины|parameter name|value)\b/i.test(s)) {
    return true;
  }
  if (/(\bip\d{2}\b|v dc|v ac|\b\d+\s*(a|ma|w|в|вт|ма)\b|en 60715)/i.test(s) && /тип|класс|диапазон|габариты|масса|питани|напряж|ток/.test(s)) {
    return true;
  }
  if (/^(название параметра|значение)\b/i.test(s)) return true;
  return false;
}

function normalizeFunctionLines(values) {
  const out = [];
  const seen = new Set();

  function push(raw) {
    const val = clean(raw)
      .replace(/^[▪▫•·\-\u2022]+\s*/g, "")
      .replace(/^\d+[.)]\s*/g, "")
      .trim();
    if (!val) return;
    if (isSpecLikeLine(val)) return;
    const k = val.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(val);
  }

  for (const v of values || []) {
    const chunks = String(v || "")
      .split(/[;|]/g)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!chunks.length) {
      push(v);
      continue;
    }
    for (const c of chunks) push(c);
  }
  return out.slice(0, 12);
}

function getPreferredAttrs(attrs, keys) {
  const out = [];
  const keySet = new Set(keys.map((x) => String(x || "").toLowerCase()));
  for (const a of attrs) {
    if (!a || typeof a !== "object") continue;
    const name = clean(a.name).toLowerCase();
    const value = clean(a.value);
    if (!name || !value) continue;
    if (keySet.has(name)) out.push({ name: clean(a.name), value });
  }
  return out;
}

function buildDescriptionFallback(row, attrs) {
  const name = clean(row.name);
  if (!name) return "";
  const typePart = name.includes(" - ") ? clean(name.split(" - ").slice(1).join(" - ")) : name;

  const preferred = getPreferredAttrs(attrs, [
    "тип подключения",
    "протоколы",
    "питание",
    "тип шины",
    "выходные каналы кол-во",
    "входные каналы кол-во",
    "дискретные входы кол-во"
  ]);

  const intro = `${typePart} для интеграции в систему умного дома Larnitech.`;
  if (!preferred.length) return intro;

  const chunks = preferred.slice(0, 3).map((x) => `${x.name}: ${x.value}`);
  return `${intro} ${chunks.join(". ")}.`;
}

function pickFunctionFromDescription(description) {
  const text = clean(description);
  if (!text) return "";
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean);
  for (const p of parts) {
    if (p.length < 20) continue;
    if (isSpecLikeLine(p)) continue;
    if (!/\b(модул|датчик|устройств|контрол|предназнач|разработ|управлен|поддерж|позвол|подключ)\b/i.test(p)) continue;
    return p.replace(/[.;:\s]+$/, "").trim();
  }
  return "";
}

function main() {
  const rows = db
    .prepare("SELECT id, article, name, description, attributes_json FROM products WHERE lower(brand)='larnitech' AND id!='direction-larnitech'")
    .all();
  const update = db.prepare(
    "UPDATE products SET description=@description, attributes_json=@attributesJson, updated_at=@updatedAt WHERE id=@id"
  );
  const now = new Date().toISOString();

  let touched = 0;
  let cleanedFunctionProducts = 0;
  let addedFunctionProducts = 0;
  let rebuiltDescriptions = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      const attrs = parseJsonArray(row.attributes_json);
      const nonFnAttrs = attrs.filter((a) => !isFunctionKey(a && a.name));
      const fnAttrs = attrs.filter((a) => isFunctionKey(a && a.name));
      const fnValues = fnAttrs.map((a) => clean(a && a.value)).filter(Boolean);

      const normalizedFn = normalizeFunctionLines(fnValues);
      let finalFn = normalizedFn;

      if (!finalFn.length) {
        const one = pickFunctionFromDescription(row.description);
        if (one) finalFn = [one];
      }

      const finalAttrs = nonFnAttrs.slice();
      for (const line of finalFn) finalAttrs.push({ name: "Функция", value: line });

      const oldDesc = clean(row.description);
      let nextDesc = oldDesc;
      if (!oldDesc || oldDesc.length < 40) {
        const fallback = buildDescriptionFallback(row, nonFnAttrs);
        if (fallback && fallback !== oldDesc) {
          nextDesc = fallback;
          rebuiltDescriptions += 1;
        }
      }

      const oldAttrsJson = JSON.stringify(attrs);
      const newAttrsJson = JSON.stringify(finalAttrs);
      const attrsChanged = oldAttrsJson !== newAttrsJson;
      const descChanged = nextDesc !== oldDesc;

      if (!attrsChanged && !descChanged) continue;

      update.run({
        id: row.id,
        description: nextDesc,
        attributesJson: newAttrsJson,
        updatedAt: now
      });
      touched += 1;
      if (fnAttrs.length && normalizedFn.length !== fnValues.length) cleanedFunctionProducts += 1;
      if (!fnAttrs.length && finalFn.length) addedFunctionProducts += 1;
    }
  });

  tx();
  db.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        touchedProducts: touched,
        cleanedFunctionProducts,
        addedFunctionProducts,
        rebuiltDescriptions
      },
      null,
      2
    )
  );
}

main();

