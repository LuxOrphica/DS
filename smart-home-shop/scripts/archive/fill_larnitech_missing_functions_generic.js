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

function inferFunctions(name, attrs) {
  const low = clean(name).toLowerCase();
  const out = [];

  if (/\b(датчик|sensor|сенсор)\b/.test(low)) {
    out.push("Контроль параметров и передача данных в систему умного дома.");
  } else if (/\b(шлюз|gateway)\b/.test(low)) {
    out.push("Интеграция устройств и обмен данными между интерфейсами системы.");
  } else if (/\b(реле|контроллер|модул|диммер)\b/.test(low)) {
    out.push("Управление нагрузкой и исполнительными устройствами.");
  } else if (/\b(interface|интерфейс|rs-?232|rs-?485|uart|can|knx|dali|ethernet|bluetooth)\b/.test(low)) {
    out.push("Интеграция внешних устройств через интерфейсы связи.");
  } else if (/\b(panel|панель|multiroom|плеер)\b/.test(low)) {
    out.push("Управление и взаимодействие с элементами системы умного дома.");
  }

  const busAttr = attrs.find((a) => /тип шины|type bus|bus/i.test(String(a && a.name)));
  const busValue = clean(busAttr && busAttr.value);
  if (busValue) {
    out.push(`Подключение и работа по шине: ${busValue}.`);
  }

  if (!out.length) {
    out.push("Работа в составе системы Larnitech для автоматизации сценариев.");
  }

  // Deduplicate and clamp.
  const uniq = [];
  const seen = new Set();
  for (const x of out) {
    const v = clean(x);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(v);
  }
  return uniq.slice(0, 2);
}

function main() {
  const rows = db
    .prepare(
      "SELECT id, article, name, attributes_json FROM products WHERE lower(brand)='larnitech' AND id!='direction-larnitech'"
    )
    .all();
  const update = db.prepare("UPDATE products SET attributes_json=@attrs, updated_at=@updatedAt WHERE id=@id");
  const now = new Date().toISOString();

  let touched = 0;
  let addedRows = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      const attrs = parseJsonArray(row.attributes_json);
      const hasFn = attrs.some((a) => isFunctionKey(a && a.name) && clean(a && a.value));
      if (hasFn) continue;

      const generated = inferFunctions(row.name, attrs);
      if (!generated.length) continue;

      for (const g of generated) attrs.push({ name: "Функция", value: g });

      update.run({
        id: row.id,
        attrs: JSON.stringify(attrs),
        updatedAt: now
      });
      touched += 1;
      addedRows += generated.length;
    }
  });
  tx();
  db.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        touchedProducts: touched,
        addedFunctionRows: addedRows
      },
      null,
      2
    )
  );
}

main();

