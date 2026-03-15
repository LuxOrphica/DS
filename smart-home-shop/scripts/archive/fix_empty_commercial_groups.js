const Database = require("better-sqlite3");

const db = new Database("data/shop.db");

function classify(row) {
  const id = String(row.id || "");
  const article = String(row.article || "");
  const name = String(row.name || "");
  const groupName = String(row.group_name || "");
  const category = String(row.category || "");
  const lower = `${name} ${groupName}`.toLowerCase();

  // Services
  if (category === "Услуги") {
    let subgroup = "Услуги";
    if (lower.includes("проект")) subgroup = "Проектирование";
    else if (lower.includes("монтаж")) subgroup = "Монтаж";
    else if (lower.includes("пусконал")) subgroup = "Пусконаладка";
    else if (lower.includes("консалт") || lower.includes("обуч") || lower.includes("мастеркласс")) subgroup = "Консалтинг";
    else if (lower.includes("поддерж")) subgroup = "Поддержка";
    else if (lower.includes("обслед")) subgroup = "Обследование";
    return { g: "Услуги", sg: subgroup, et: "service", reason: "category=Услуги" };
  }

  // Accessories bucket fallout
  if (category === "Аксессуары") {
    if (/тапоч|поло|shirt|fanshirt/i.test(lower)) {
      return { g: "Мерч", sg: "Одежда", et: "merch", reason: "merch by name" };
    }
    if (/мастеркласс|обучение/i.test(lower)) {
      return { g: "Услуги", sg: "Консалтинг", et: "service", reason: "training as service" };
    }
    if (/колонк|speaker|audio/i.test(lower)) {
      return { g: "Аудио и мультимедиа", sg: "Аудио", et: "product", reason: "speaker/audio" };
    }
    if (/кондиционер|ac control/i.test(lower)) {
      return { g: "Климат", sg: "Управление кондиционерами", et: "product", reason: "AC gateway" };
    }
    if (/клемм|terminal|connector/i.test(lower)) {
      return { g: "Монтаж и расходники", sg: "Клеммы и коннекторы", et: "product", reason: "connector/terminal" };
    }
    return { g: "Монтаж и расходники", sg: "Монтажные элементы", et: "product", reason: "fallback accessories" };
  }

  // Energy
  if (/энергия|energy/i.test(groupName) || /счетчик|energy meter|трансформатор тока|wallbox|розетка/i.test(lower)) {
    if (/блок питания|power supply/i.test(lower)) {
      return { g: "Энергия и учет", sg: "Блоки питания", et: "product", reason: "power supply" };
    }
    return { g: "Энергия и учет", sg: "Электросчетчики", et: "product", reason: "energy bucket" };
  }

  // Security
  if (category === "Безопасность") {
    return { g: "Безопасность и доступ", sg: "Датчики", et: "product", reason: "security -> sensors" };
  }

  // Lighting
  if (category === "Освещение") {
    if (/реле|диммер/i.test(lower)) return { g: "Освещение", sg: "Реле и диммеры", et: "product", reason: "lighting relay/dimmer" };
    return { g: "Освещение", sg: "Контроллеры освещения", et: "product", reason: "lighting fallback" };
  }

  // Management & automation
  if (category === "Управление и автоматизация") {
    if (/креплен/i.test(lower)) return { g: "Монтаж и расходники", sg: "Крепеж и монтаж", et: "product", reason: "mounting hardware" };
    if (/сетев.*карт/i.test(lower)) return { g: "Сеть и инфраструктура", sg: "Сетевые модули", et: "product", reason: "network module" };
    if (/реле|dimmer/i.test(lower)) return { g: "Управление и автоматизация", sg: "Реле и диммеры", et: "product", reason: "relay/dimmer" };
    if (/датчик|sensor|detector/i.test(lower)) return { g: "Управление и автоматизация", sg: "Датчики", et: "product", reason: "sensor" };
    return { g: "Управление и автоматизация", sg: "Контроллеры", et: "product", reason: "management fallback" };
  }

  return null;
}

const rows = db
  .prepare(
    `SELECT id, article, name, category, group_name, entity_type
     FROM products
     WHERE IFNULL(is_active_normalized,1)=1
       AND (COALESCE(commercial_group,'')='' OR COALESCE(commercial_subgroup,'')='')`
  )
  .all();

const update = db.prepare(
  `UPDATE products
   SET commercial_group=@g,
       commercial_subgroup=@sg,
       entity_type=@et,
       normalization_status='manual_override',
       normalization_note=@note
   WHERE id=@id`
);

const tx = db.transaction(() => {
  let changed = 0;
  for (const row of rows) {
    const c = classify(row);
    if (!c) continue;
    const note = `Auto-fix empty commercial fields (${c.reason})`;
    const info = update.run({
      id: row.id,
      g: c.g,
      sg: c.sg,
      et: c.et || String(row.entity_type || "product"),
      note
    });
    changed += info.changes;
  }
  return changed;
});

const changed = tx();
console.log(JSON.stringify({ scanned: rows.length, changed }, null, 2));

