"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { fixMojibake } = require("../db/normalization");
let iconv = null;

try {
  iconv = require("iconv-lite");
} catch {
  iconv = null;
}

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const SNAPSHOT_PATH = path.join(ROOT, "test", "fixtures", "golden", "catalog.snapshot.json");
const REPORT_PATH = path.join(ROOT, "reports", "catalog-golden-current.json");

const SNAPSHOT_VERSION = 1;
const REPRESENTATIVE_LIMIT_PER_BRAND = 5;

function text(value) {
  return String(value == null ? "" : value).trim();
}

function displayText(value) {
  let current = text(fixMojibake(text(value)));
  if (iconv && /(?:\u0420.|\u0421.){3,}/u.test(current)) {
    try {
      const fixed = iconv.decode(iconv.encode(current, "win1251"), "utf8");
      if (fixed && !/(?:\u0420.|\u0421.){3,}|\uFFFD/u.test(fixed)) current = fixed;
    } catch {
      // Keep the audited source text if optional decoding cannot improve it.
    }
  }
  return text(current);
}

function lower(value) {
  return displayText(value).toLowerCase();
}

function parseJsonArray(raw) {
  const value = text(raw);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(text).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
}

function sortObject(input) {
  return Object.fromEntries(
    Object.entries(input).sort(([a], [b]) => a.localeCompare(b, "ru"))
  );
}

function increment(map, key, amount = 1) {
  const normalized = text(key) || "<empty>";
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function mapToSortedObject(map) {
  return sortObject(Object.fromEntries(map.entries()));
}

function isActiveStorefrontProduct(row) {
  const status = lower(row.status || "active");
  const entityType = lower(row.entity_type || "product");
  return (status === "" || status === "active") &&
    entityType !== "service" &&
    entityType !== "merch" &&
    Number(row.is_extra || 0) !== 1 &&
    Number(row.is_active_normalized == null ? 1 : row.is_active_normalized) !== 0;
}

function attrKeys(row) {
  const attrs = parseJsonArray(row.attributes_json);
  return uniqueSorted(attrs.map((item) => item && displayText(item.name)));
}

function sourceKind(value) {
  const ref = text(value);
  if (!ref) return "missing";
  if (ref.startsWith("/")) return "local";
  if (/^https?:\/\//i.test(ref)) {
    try {
      return new URL(ref).hostname.toLowerCase();
    } catch {
      return "url";
    }
  }
  return "other";
}

function mediaState(row) {
  const gallery = parseJsonArray(row.gallery_json);
  const docs = parseJsonArray(row.documents_json);
  return {
    hasImage: Boolean(text(row.image)),
    galleryCount: gallery.length,
    documentsCount: docs.length,
    sourceKind: sourceKind(row.source_url)
  };
}

function productSnapshot(row) {
  return {
    id: text(row.id),
    article: text(row.article),
    name: displayText(row.name),
    brand: displayText(row.brand),
    category: displayText(row.category),
    group: displayText(row.group_name),
    // Точную цену намеренно не фиксируем: price_rub пересчитывается по курсу
    // EUR→RUB при старте и дрейфует. Golden отслеживает структуру каталога,
    // а не волатильную цену. Флаг сохраняет сигнал «у товара пропала цена».
    hasPrice: Number(row.price_rub || row.price || 0) > 0,
    media: mediaState(row),
    attributes: attrKeys(row)
  };
}

function loadRows() {
  assert.equal(fs.existsSync(DB_PATH), true, "data/shop.db must exist before creating catalog golden snapshot");
  const db = new Database(DB_PATH, { readonly: true, timeout: 10_000 });
  try {
    return db.prepare(`
      SELECT
        id, article, name, brand, category, group_name, status, entity_type,
        is_extra, is_active_normalized, image, source_url, price, price_rub,
        price_currency, attributes_json, documents_json, gallery_json
      FROM products
      ORDER BY brand, category, group_name, article, id
    `).all();
  } finally {
    db.close();
  }
}

function buildCatalogSnapshot(rows = loadRows()) {
  const activeRows = rows.filter(isActiveStorefrontProduct);
  const byBrand = new Map();
  const byCategory = new Map();
  const byCategoryBrand = new Map();
  const categoryTree = new Map();
  const media = {
    withImage: 0,
    withoutImage: 0,
    withGallery: 0,
    withDocuments: 0,
    bySourceKind: new Map()
  };

  for (const row of activeRows) {
    const brand = displayText(row.brand) || "<empty>";
    const category = displayText(row.category) || "<empty>";
    const group = displayText(row.group_name) || "<empty>";
    const gallery = parseJsonArray(row.gallery_json);
    const docs = parseJsonArray(row.documents_json);

    increment(byBrand, brand);
    increment(byCategory, category);
    increment(byCategoryBrand, `${category} :: ${brand}`);
    increment(media.bySourceKind, sourceKind(row.source_url));

    if (text(row.image)) media.withImage += 1;
    else media.withoutImage += 1;
    if (gallery.length) media.withGallery += 1;
    if (docs.length) media.withDocuments += 1;

    if (!categoryTree.has(category)) categoryTree.set(category, new Map());
    increment(categoryTree.get(category), group);
  }

  const representatives = {};
  for (const brand of uniqueSorted(activeRows.map((row) => displayText(row.brand)))) {
    representatives[brand] = activeRows
      .filter((row) => displayText(row.brand) === brand)
      .sort((a, b) => text(a.id).localeCompare(text(b.id), "ru"))
      .slice(0, REPRESENTATIVE_LIMIT_PER_BRAND)
      .map(productSnapshot);
  }

  const categoryTreeObject = {};
  for (const [category, groups] of categoryTree.entries()) {
    categoryTreeObject[category] = mapToSortedObject(groups);
  }

  return {
    schemaVersion: SNAPSHOT_VERSION,
    generatedFrom: "data/shop.db",
    totals: {
      products: rows.length,
      activeStorefrontProducts: activeRows.length,
      brands: byBrand.size,
      categories: byCategory.size
    },
    byBrand: mapToSortedObject(byBrand),
    byCategory: mapToSortedObject(byCategory),
    byCategoryBrand: mapToSortedObject(byCategoryBrand),
    categoryTree: sortObject(categoryTreeObject),
    media: {
      withImage: media.withImage,
      withoutImage: media.withoutImage,
      withGallery: media.withGallery,
      withDocuments: media.withDocuments,
      bySourceKind: mapToSortedObject(media.bySourceKind)
    },
    representatives: sortObject(representatives)
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeSnapshot(filePath, snapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableJson(snapshot), "utf8");
}

function compareSnapshot() {
  const current = buildCatalogSnapshot();
  assert.equal(fs.existsSync(SNAPSHOT_PATH), true, `Missing golden snapshot: ${SNAPSHOT_PATH}. Run npm run snapshot:catalog:update.`);
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  try {
    assert.deepStrictEqual(current, expected);
    return { ok: true, current };
  } catch (error) {
    writeSnapshot(REPORT_PATH, current);
    error.message = `${error.message}\nCurrent snapshot written to ${REPORT_PATH}`;
    throw error;
  }
}

function main() {
  const shouldUpdate = process.argv.includes("--update");
  if (shouldUpdate) {
    const snapshot = buildCatalogSnapshot();
    writeSnapshot(SNAPSHOT_PATH, snapshot);
    console.log(JSON.stringify({
      ok: true,
      updated: SNAPSHOT_PATH,
      totals: snapshot.totals,
      media: snapshot.media
    }, null, 2));
    return;
  }

  const result = compareSnapshot();
  console.log(JSON.stringify({
    ok: true,
    snapshot: SNAPSHOT_PATH,
    totals: result.current.totals
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  SNAPSHOT_PATH,
  buildCatalogSnapshot,
  compareSnapshot
};
