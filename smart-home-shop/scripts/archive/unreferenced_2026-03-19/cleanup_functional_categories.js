const Database = require("better-sqlite3");
const path = require("path");
const { normalizeCategory } = require("../db/normalization");

const dbPath = path.join(__dirname, "..", "data", "shop.db");
const db = new Database(dbPath);

const CANONICAL_ROOTS = [
  "Управление и автоматизация",
  "Аудио и мультимедиа",
  "Освещение",
  "Безопасность и доступ",
  "Климат",
  "Энергия и учет",
  "Монтаж и расходники",
  "Комплекты"
];

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

const FALLBACK_CATEGORY = "Управление и автоматизация";

function norm(value) {
  return normalizeCategory(String(value || "").trim());
}

function mappedCategory(value) {
  const fixed = norm(value);
  return CATEGORY_MAP[fixed] || fixed;
}

function getDistinctPfc() {
  return db.prepare(`
    SELECT category_name AS name, COUNT(*) AS cnt
    FROM product_function_categories
    GROUP BY category_name
    ORDER BY cnt DESC, category_name COLLATE NOCASE ASC
  `).all();
}

function ensureCanonicalRoots() {
  const now = new Date().toISOString();
  const findRootByName = db.prepare(`
    SELECT id, name FROM functional_categories
    WHERE (parent_id IS NULL OR parent_id = 0) AND LOWER(TRIM(name)) = LOWER(TRIM(@name))
    ORDER BY id ASC LIMIT 1
  `);
  const insertRoot = db.prepare(`
    INSERT INTO functional_categories (parent_id, name, slug, status, sort_order, created_at, updated_at)
    VALUES (NULL, @name, '', 'active', @sortOrder, @now, @now)
  `);
  const roots = new Map();
  CANONICAL_ROOTS.forEach((name, index) => {
    let row = findRootByName.get({ name });
    if (!row) {
      const info = insertRoot.run({ name, sortOrder: index, now });
      row = { id: Number(info.lastInsertRowid), name };
    }
    roots.set(name, Number(row.id));
  });
  return roots;
}

function mergePfcCategory(fromName, toName) {
  if (fromName === toName) return;
  const rows = db.prepare(`
    SELECT product_id AS productId, is_primary AS isPrimary, sort_order AS sortOrder
    FROM product_function_categories
    WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(@fromName))
  `).all({ fromName });
  if (!rows.length) return;

  const upsert = db.prepare(`
    INSERT INTO product_function_categories (product_id, category_name, is_primary, sort_order, created_at, updated_at)
    VALUES (@productId, @toName, @isPrimary, @sortOrder, @now, @now)
    ON CONFLICT(product_id, category_name) DO UPDATE SET
      is_primary = CASE WHEN excluded.is_primary = 1 OR product_function_categories.is_primary = 1 THEN 1 ELSE 0 END,
      sort_order = MIN(product_function_categories.sort_order, excluded.sort_order),
      updated_at = excluded.updated_at
  `);
  const del = db.prepare(`
    DELETE FROM product_function_categories
    WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(@fromName))
  `);
  const now = new Date().toISOString();
  rows.forEach((row) => {
    const productId = String(row.productId || "").trim();
    if (!productId) {
      throw new Error(`Invalid productId in product_function_categories for "${fromName}" -> "${toName}": ${JSON.stringify(row)}`);
    }
    upsert.run({
      productId,
      toName,
      isPrimary: Number(row.isPrimary || 0) ? 1 : 0,
      sortOrder: Number(row.sortOrder || 0),
      now
    });
  });
  del.run({ fromName });
}

function normalizePrimaryFlags() {
  const productIds = db.prepare(`
    SELECT DISTINCT product_id AS productId
    FROM product_function_categories
  `).all();

  const rowsByProduct = db.prepare(`
    SELECT rowid, is_primary AS isPrimary, sort_order AS sortOrder, category_name AS categoryName
    FROM product_function_categories
    WHERE product_id = @productId
    ORDER BY is_primary DESC, sort_order ASC, category_name COLLATE NOCASE ASC, rowid ASC
  `);
  const clearPrimary = db.prepare(`
    UPDATE product_function_categories
    SET is_primary = 0, updated_at = @now
    WHERE product_id = @productId
  `);
  const setPrimary = db.prepare(`
    UPDATE product_function_categories
    SET is_primary = 1, updated_at = @now
    WHERE rowid = @rowid
  `);

  const now = new Date().toISOString();
  productIds.forEach(({ productId }) => {
    const rows = rowsByProduct.all({ productId: Number(productId) });
    if (!rows.length) return;
    clearPrimary.run({ productId: Number(productId), now });
    setPrimary.run({ rowid: Number(rows[0].rowid), now });
  });
}

function mergeFunctionalDuplicateRows() {
  const rows = db.prepare(`
    SELECT id, parent_id AS parentId, LOWER(TRIM(COALESCE(name, ''))) AS nameKey
    FROM functional_categories
    ORDER BY id ASC
  `).all();
  const keepByKey = new Map();
  const dup = [];
  for (const row of rows) {
    const parentPart = row.parentId == null ? "null" : String(Number(row.parentId));
    const key = `${parentPart}::${String(row.nameKey || "")}`;
    const id = Number(row.id);
    if (!keepByKey.has(key)) {
      keepByKey.set(key, id);
      continue;
    }
    dup.push({ id, keepId: keepByKey.get(key) });
  }
  if (!dup.length) return 0;

  const reparent = db.prepare(`
    UPDATE functional_categories
    SET parent_id = @keepId
    WHERE parent_id = @id
  `);
  const drop = db.prepare(`DELETE FROM functional_categories WHERE id = @id`);
  dup.forEach((d) => {
    reparent.run({ id: d.id, keepId: d.keepId });
    drop.run({ id: d.id });
  });
  return dup.length;
}

const before = {
  roots: db.prepare(`
    SELECT id, name FROM functional_categories
    WHERE parent_id IS NULL OR parent_id = 0
    ORDER BY name COLLATE NOCASE ASC
  `).all(),
  pfc: getDistinctPfc()
};

const tx = db.transaction(() => {
  const now = new Date().toISOString();

  const canonicalRoots = ensureCanonicalRoots();

  const roots = db.prepare(`
    SELECT id, name
    FROM functional_categories
    WHERE parent_id IS NULL OR parent_id = 0
    ORDER BY id ASC
  `).all();
  const updateParent = db.prepare(`
    UPDATE functional_categories
    SET parent_id = @newParentId, updated_at = @now
    WHERE parent_id = @oldParentId
  `);
  const dropRoot = db.prepare(`DELETE FROM functional_categories WHERE id = @id`);

  for (const root of roots) {
    const rootId = Number(root.id);
    const rootName = mappedCategory(root.name);
    const isCanonical = canonicalRoots.has(rootName);
    if (!isCanonical) continue;
    const keepId = Number(canonicalRoots.get(rootName));
    if (keepId === rootId) continue;
    updateParent.run({ oldParentId: rootId, newParentId: keepId, now });
    dropRoot.run({ id: rootId });
  }

  mergeFunctionalDuplicateRows();

  const currentRoots = db.prepare(`
    SELECT id, name FROM functional_categories
    WHERE parent_id IS NULL OR parent_id = 0
  `).all();
  currentRoots.forEach((row) => {
    const name = norm(row.name);
    if (CANONICAL_ROOTS.includes(name)) return;
    dropRoot.run({ id: Number(row.id) });
  });

  const pfcDistinct = db.prepare(`
    SELECT DISTINCT category_name AS name
    FROM product_function_categories
  `).all();
  pfcDistinct.forEach(({ name }) => {
    const from = norm(name);
    let to = mappedCategory(from);
    if (!CANONICAL_ROOTS.includes(to)) to = FALLBACK_CATEGORY;
    mergePfcCategory(from, to);
  });

  normalizePrimaryFlags();
  ensureCanonicalRoots();
  mergeFunctionalDuplicateRows();
});

tx();

const after = {
  roots: db.prepare(`
    SELECT id, name FROM functional_categories
    WHERE parent_id IS NULL OR parent_id = 0
    ORDER BY name COLLATE NOCASE ASC
  `).all(),
  pfc: getDistinctPfc()
};

console.log("=== BEFORE ROOTS ===");
before.roots.forEach((r) => console.log(`${r.id}\t${r.name}`));
console.log("=== AFTER ROOTS ===");
after.roots.forEach((r) => console.log(`${r.id}\t${r.name}`));

console.log("=== AFTER DISTINCT product_function_categories ===");
after.pfc.forEach((r) => console.log(`${r.cnt}\t${r.name}`));

console.log("Done:", dbPath);
