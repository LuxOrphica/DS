const Database = require("better-sqlite3");
const path = require("path");
const { normalizeCategory, normalizeText, fixMojibake } = require("../db/normalization");

const dbPath = path.join(__dirname, "..", "data", "shop.db");
const db = new Database(dbPath);

const CATEGORY_MAP = {
  "Безопасность": "Безопасность и доступ",
  "Монтаж": "Монтаж и расходники",
  "Энергомониторинг": "Энергия и учет",
  "Аудио / Multiroom": "Аудио и мультимедиа",
  "Аксессуары": "Монтаж и расходники",
  "Проводное оборудование УД": "Управление и автоматизация",
  "Сеть и инфраструктура": "Управление и автоматизация",
  "Мерч": "Комплекты",
  "Услуги": "Монтаж и расходники"
};

const CANONICAL_ROOTS = new Set([
  "Управление и автоматизация",
  "Аудио и мультимедиа",
  "Освещение",
  "Безопасность и доступ",
  "Климат",
  "Энергия и учет",
  "Монтаж и расходники",
  "Комплекты"
]);

function mappedCategory(value) {
  const fixed = normalizeCategory(String(value || "").trim());
  return CATEGORY_MAP[fixed] || fixed;
}

function normalizeGroup(groupRaw, brandRaw) {
  let s = normalizeText(fixMojibake(groupRaw || ""));
  if (!s) return "";
  const brand = normalizeText(fixMojibake(brandRaw || ""));
  if (brand) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`^${escaped}\\s*\\/\\s*`, "i"), "");
  }
  s = s.replace(/^[^—]*—\s*/, "");
  const parts = s.split("/").map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) s = parts[parts.length - 1];
  return s.trim();
}

const roots = db.prepare(`
  SELECT id, name
  FROM functional_categories
  WHERE parent_id IS NULL OR parent_id = 0
`).all();
const rootByName = new Map(roots.map((r) => [normalizeCategory(r.name), Number(r.id)]));

const rows = db.prepare(`
  SELECT
    category,
    COALESCE(group_name, subcategory, commercial_subgroup, '') AS groupName,
    brand
  FROM products
  WHERE TRIM(COALESCE(category, '')) <> ''
`).all();

const pairs = new Map();
for (const row of rows) {
  const category = mappedCategory(row.category);
  if (!CANONICAL_ROOTS.has(category)) continue;
  const group = normalizeGroup(row.groupName, row.brand);
  if (!group) continue;
  if (normalizeCategory(group) === normalizeCategory(category)) continue;
  const key = `${category}||${group.toLowerCase()}`;
  if (!pairs.has(key)) pairs.set(key, { category, group });
}

const now = new Date().toISOString();
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO functional_categories (
    parent_id, name, slug, status, sort_order, created_at, updated_at
  ) VALUES (
    @parentId, @name, '', 'active', 0, @now, @now
  )
`);

let inserted = 0;
const tx = db.transaction(() => {
  for (const pair of pairs.values()) {
    const parentId = rootByName.get(pair.category);
    if (!parentId) continue;
    const info = insertStmt.run({
      parentId,
      name: pair.group,
      now
    });
    if (Number(info.changes || 0) > 0) inserted += 1;
  }
});
tx();

const summary = db.prepare(`
  SELECT p.name AS parent, COUNT(c.id) AS children
  FROM functional_categories p
  LEFT JOIN functional_categories c ON c.parent_id = p.id
  WHERE p.parent_id IS NULL OR p.parent_id = 0
  GROUP BY p.id, p.name
  ORDER BY p.name COLLATE NOCASE
`).all();

console.log(`Inserted subcategories: ${inserted}`);
summary.forEach((r) => {
  console.log(`${r.parent}: ${r.children}`);
});
console.log(`Done: ${dbPath}`);
