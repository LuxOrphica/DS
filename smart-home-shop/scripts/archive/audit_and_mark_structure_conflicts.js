const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database("data/shop.db");

const ALLOWED = {
  "Управление и автоматизация": new Set([
    "Минисерверы и расширения",
    "Контроллеры",
    "Реле и диммеры",
    "Шторы",
    "Датчики",
    "HMI",
    "Панели управления",
    "Интерфейсы",
    "Шлюзы",
    "Сценарное управление"
  ]),
  "Освещение": new Set([
    "Светильники",
    "Реле и диммеры",
    "Выключатели и панели",
    "Датчики",
    "LED-ленты",
    "Контроллеры освещения"
  ]),
  "Климат": new Set([
    "Термостаты",
    "Датчики климата",
    "Управление кондиционерами",
    "Приводы и клапаны",
    "Климат-контроллеры",
    "Исполнительные устройства"
  ]),
  "Безопасность и доступ": new Set([
    "Датчики",
    "Контроль доступа",
    "Сирены и тревожные устройства",
    "Кнопки и брелоки",
    "Видеодомофония",
    "Идентификаторы и аксессуары",
    "Оповещение",
    "Замки"
  ]),
  "Энергия и учет": new Set([
    "Электросчетчики",
    "Мониторинг энергии",
    "Реле нагрузки",
    "Блоки питания",
    "Защита и распределение",
    "Счетчики"
  ]),
  "Аудио и мультимедиа": new Set([
    "Аудио",
    "Multiroom",
    "Акустика",
    "Усилители",
    "Интерфейсы AV",
    "Аудиопанели",
    "Акустические короба"
  ]),
  "Сеть и инфраструктура": new Set([
    "Антенны",
    "Аксессуары",
    "Шлюзы",
    "Коммутация",
    "Сетевые модули",
    "Интерфейсы связи"
  ]),
  "Монтаж и расходники": new Set([
    "Блоки питания",
    "Кабели и переходники",
    "Клеммы и коннекторы",
    "Крепеж и монтаж",
    "Монтажные элементы",
    "Кабель и провода",
    "Крепеж"
  ]),
  "Комплекты": new Set([
    "Готовые комплекты",
    "Наборы для освещения",
    "Наборы управления",
    "Наборы датчиков",
    "Аксессуары",
    "Стартовые наборы автоматизации"
  ]),
  "ПО и сервисы": new Set([
    "ПО",
    "Программное обеспечение",
    "Лицензии",
    "Облачные сервисы",
    "API и интеграции"
  ]),
  "Услуги": new Set([
    "Услуги",
    "Проектирование",
    "Монтаж",
    "Пусконаладка",
    "Консалтинг",
    "Обследование",
    "Поддержка"
  ]),
  "Мерч": new Set([
    "Мерч",
    "Одежда",
    "Сувениры",
    "Подарочная продукция"
  ])
};

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function addIssue(bucket, id, code, note) {
  if (!bucket.has(id)) bucket.set(id, []);
  bucket.get(id).push({ code, note });
}

const rows = db
  .prepare(
    `SELECT id, article, name, brand, entity_type, normalization_status, revision,
            IFNULL(is_active_normalized,1) AS is_active_normalized,
            commercial_group, commercial_subgroup
     FROM products
     WHERE IFNULL(is_active_normalized,1)=1`
  )
  .all();

const issuesById = new Map();

for (const row of rows) {
  const id = String(row.id || "");
  const group = String(row.commercial_group || "").trim();
  const subgroup = String(row.commercial_subgroup || "").trim();
  const et = norm(row.entity_type || "product");

  if (!group) addIssue(issuesById, id, "missing_group", "Пустая коммерческая группа");
  if (!subgroup) addIssue(issuesById, id, "missing_subgroup", "Пустая коммерческая подгруппа");

  const allowed = ALLOWED[group];
  if (allowed && subgroup && !allowed.has(subgroup)) {
    addIssue(
      issuesById,
      id,
      "subgroup_not_allowed",
      `Подгруппа "${subgroup}" не входит в словарь группы "${group}"`
    );
  }

  if (group === "Услуги" && et !== "service") {
    addIssue(issuesById, id, "entity_type_mismatch", "Для группы Услуги ожидается entity_type=service");
  }
  if (group === "Мерч" && et !== "merch") {
    addIssue(issuesById, id, "entity_type_mismatch", "Для группы Мерч ожидается entity_type=merch");
  }
  if (group === "ПО и сервисы" && et !== "software" && et !== "service") {
    addIssue(
      issuesById,
      id,
      "entity_type_mismatch",
      "Для группы ПО и сервисы ожидается entity_type=software/service"
    );
  }

  const status = norm(row.normalization_status);
  if (status && status !== "normalized" && status !== "manual_override") {
    addIssue(issuesById, id, "needs_review", `normalization_status=${row.normalization_status}`);
  }
}

// Duplicates by brand+article+revision.
// Per catalog contract, revisions are independent entities.
const byBrandArticle = new Map();
for (const row of rows) {
  const key = `${norm(row.brand)}::${norm(row.article)}::${norm(row.revision)}`;
  if (key === "::") continue;
  if (!byBrandArticle.has(key)) byBrandArticle.set(key, []);
  byBrandArticle.get(key).push(row);
}
for (const bucket of byBrandArticle.values()) {
  if (bucket.length <= 1) continue;
  const names = new Set(bucket.map((x) => norm(x.name)).filter(Boolean));
  const groups = new Set(bucket.map((x) => `${norm(x.commercial_group)}|${norm(x.commercial_subgroup)}`));
  let reason = "Дубликат brand+article+revision";
  if (names.size > 1) reason += " (разные названия)";
  else if (groups.size > 1) reason += " (разные группы/подгруппы)";
  for (const row of bucket) {
    addIssue(issuesById, String(row.id), "duplicate_brand_article", reason);
  }
}

const clearStmt = db.prepare("UPDATE products SET is_conflict=0, conflict_note='' WHERE IFNULL(is_active_normalized,1)=1");
const setStmt = db.prepare("UPDATE products SET is_conflict=1, conflict_note=@note WHERE id=@id");
const applyTx = db.transaction(() => {
  clearStmt.run();
  for (const [id, items] of issuesById.entries()) {
    const uniq = [];
    const seen = new Set();
    for (const item of items) {
      const key = `${item.code}:${item.note}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(item.note);
    }
    setStmt.run({ id, note: uniq.join("; ") });
  }
});
applyTx();

const flat = [];
for (const row of rows) {
  const id = String(row.id || "");
  const items = issuesById.get(id) || [];
  for (const item of items) {
    flat.push({
      id,
      article: row.article || "",
      brand: row.brand || "",
      name: row.name || "",
      revision: row.revision || "",
      commercial_group: row.commercial_group || "",
      commercial_subgroup: row.commercial_subgroup || "",
      entity_type: row.entity_type || "",
      code: item.code,
      note: item.note
    });
  }
}

const byCode = {};
const byGroup = {};
for (const i of flat) {
  byCode[i.code] = (byCode[i.code] || 0) + 1;
  const g = i.commercial_group || "(empty)";
  byGroup[g] = (byGroup[g] || 0) + 1;
}

const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const outJson = path.join("reports", `catalog_structure_conflicts_${ts}.json`);
const outCsv = path.join("reports", `catalog_structure_conflicts_${ts}.csv`);

fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      totalProducts: rows.length,
      conflictedProducts: issuesById.size,
      issueCount: flat.length,
      byCode,
      byGroup,
      issues: flat
    },
    null,
    2
  ),
  "utf8"
);

const header = [
  "id",
  "article",
  "brand",
  "name",
  "revision",
  "commercial_group",
  "commercial_subgroup",
  "entity_type",
  "code",
  "note"
];
const esc = (v) => {
  const s = String(v || "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [header.join(",")]
  .concat(flat.map((r) => header.map((h) => esc(r[h])).join(",")))
  .join("\n");
fs.writeFileSync(outCsv, csv, "utf8");

console.log(
  JSON.stringify(
    {
      totalProducts: rows.length,
      conflictedProducts: issuesById.size,
      issueCount: flat.length,
      byCode,
      byGroup,
      outJson,
      outCsv
    },
    null,
    2
  )
);
