const Database = require("better-sqlite3");

const db = new Database("data/shop.db", { timeout: 15000 });

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
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

function secondFunctionLine(name) {
  const low = clean(name).toLowerCase();
  if (/\b(датчик|sensor|сенсор)\b/.test(low)) return "Поддержка сценариев автоматизации на основе измеряемых событий.";
  if (/\b(шлюз|gateway)\b/.test(low)) return "Маршрутизация и передача команд между подсистемами.";
  if (/\b(реле|контроллер|модул|диммер)\b/.test(low)) return "Поддержка централизованного управления из интерфейса системы.";
  if (/\b(interface|интерфейс|rs-?232|rs-?485|uart|can|knx|dali|ethernet|bluetooth)\b/.test(low)) return "Обеспечивает стабильный обмен данными с совместимыми устройствами.";
  if (/\b(panel|панель|multiroom|плеер)\b/.test(low)) return "Интеграция в единый пользовательский сценарий управления домом.";
  return "Работа в единой экосистеме Larnitech с настройкой через контроллер.";
}

function main() {
  const rows = db
    .prepare("SELECT id, name, attributes_json FROM products WHERE lower(brand)='larnitech' AND id!='direction-larnitech'")
    .all();
  const update = db.prepare("UPDATE products SET attributes_json=@attrs, updated_at=@updatedAt WHERE id=@id");
  const now = new Date().toISOString();

  let touched = 0;

  const tx = db.transaction(() => {
    for (const r of rows) {
      const attrs = parseJsonArray(r.attributes_json);
      const fn = attrs.filter((a) => isFunctionKey(a && a.name) && clean(a && a.value));
      if (fn.length !== 1) continue;
      const existing = new Set(fn.map((x) => clean(x.value).toLowerCase()));
      const extra = clean(secondFunctionLine(r.name));
      if (!extra || existing.has(extra.toLowerCase())) continue;
      attrs.push({ name: "Функция", value: extra });
      update.run({ id: r.id, attrs: JSON.stringify(attrs), updatedAt: now });
      touched += 1;
    }
  });
  tx();
  db.close();
  console.log(JSON.stringify({ ok: true, touchedProducts: touched }, null, 2));
}

main();

