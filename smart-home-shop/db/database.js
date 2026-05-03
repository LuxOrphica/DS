const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const {
  fixMojibake,
  normalizeBrand,
  normalizeCategory,
  normalizeChannelsValue,
  normalizeIntBool,
  normalizeMetricValue,
  normalizeMountingValue,
  normalizeOrderDocumentsInput,
  normalizeProtocolValue,
  normalizeScalar,
  normalizeSystemType,
  normalizeTechnicalPatchValues,
  normalizeText
} = require("./normalization");
const { createOrdersModule } = require("./modules/orders");
const { createAuditModule } = require("./modules/audit");
const { createCatalogFiltersModule } = require("./modules/catalog-filters");

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "shop.db");
const curatedBrandCategoriesPath = path.join(dataDir, "brand-native-categories.json");
const normalizedCatalogV2Path = path.join(__dirname, "..", "reports", "functional_catalog_products.normalized.v2.csv");
let nativeBrandCategoriesCache = {
  mtimeMs: -1,
  byBrand: new Map()
};
let curatedBrandCategoriesCache = {
  mtimeMs: -1,
  byBrand: new Map()
};

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath, { timeout: 10000 });
try {
  db.pragma("journal_mode = WAL");
} catch {
  // ignore transient lock
}
db.pragma("foreign_keys = ON");

function isServiceLikeRow(row) {
  const brand = normalizeBrand(row && row.brand);
  const category = normalizeCategory(row && row.category);
  const commercialGroup = normalizeCategory(
    (row && (row.commercialGroup || row.commercial_group || row.commercial_group_name)) || ""
  );
  const entityType = String((row && (row.entityType || row.entity_type)) || "product")
    .trim()
    .toLowerCase();
  const hiddenCategory = new Set(["услуги", "мерч"]);
  return (
    entityType === "service" ||
    entityType === "merch" ||
    hiddenCategory.has(category.toLowerCase()) ||
    hiddenCategory.has(commercialGroup.toLowerCase()) ||
    category.toLowerCase() === "\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451" ||
    brand.toLowerCase() === "\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451" ||
    String((row && row.id) || "").toLowerCase() === "service-networks"
  );
}

function sanitizeProductRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(out)) out[k] = normalizeScalar(v);
  out.brand = normalizeBrand(out.brand);
  out.category = normalizeCategory(out.category);
  out.status = String(out.status || "active").trim().toLowerCase() || "active";
  if (Object.prototype.hasOwnProperty.call(out, "group")) out.group = normalizeText(fixMojibake(out.group));
  if (Object.prototype.hasOwnProperty.call(out, "groupName")) out.groupName = normalizeText(fixMojibake(out.groupName));
  if (Object.prototype.hasOwnProperty.call(out, "brandSubcategory")) out.brandSubcategory = normalizeText(fixMojibake(out.brandSubcategory));
  if (Object.prototype.hasOwnProperty.call(out, "systemType")) out.systemType = normalizeSystemType(out.systemType);
  if (Object.prototype.hasOwnProperty.call(out, "protocol")) out.protocol = normalizeProtocolValue(out.protocol);
  if (Object.prototype.hasOwnProperty.call(out, "mounting")) out.mounting = normalizeMountingValue(out.mounting);
  if (Object.prototype.hasOwnProperty.call(out, "supplyVoltage")) out.supplyVoltage = normalizeMetricValue("voltage", out.supplyVoltage);
  if (Object.prototype.hasOwnProperty.call(out, "channels")) out.channels = normalizeChannelsValue(out.channels);
  if (Object.prototype.hasOwnProperty.call(out, "nominalCurrent")) out.nominalCurrent = normalizeMetricValue("current", out.nominalCurrent);
  if (Object.prototype.hasOwnProperty.call(out, "nominalPower")) out.nominalPower = normalizeMetricValue("power", out.nominalPower);
  return out;
}

function createValidationError(message) {
  const err = new Error(String(message || "validation_error"));
  err.code = "validation_error";
  err.statusCode = 400;
  return err;
}

function parseAttributeValues(raw) {
  let parsed = [];
  if (Array.isArray(raw)) parsed = raw;
  else {
    try {
      const v = JSON.parse(String(raw || "[]"));
      parsed = Array.isArray(v) ? v : [];
    } catch {
      parsed = [];
    }
  }
  const out = new Map();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.code || item.key || item.name || "").trim().toLowerCase();
    if (!key) continue;
    const value = String(item.value ?? "").trim();
    if (!value) continue;
    out.set(key, value);
  }
  return out;
}

function getRequiredAttributeCodesForCategories(categories = []) {
  const values = Array.isArray(categories)
    ? [...new Set(categories.map((x) => normalizeCategory(x)).filter(Boolean))]
    : [];
  if (!values.length) return [];
  const placeholders = values.map((_, i) => `@c${i}`).join(", ");
  const params = Object.fromEntries(values.map((v, i) => [`c${i}`, v]));
  const rows = db.prepare(`
    SELECT DISTINCT LOWER(TRIM(cat.attribute_code)) AS code
    FROM category_attribute_templates cat
    LEFT JOIN attributes a ON a.code = cat.attribute_code
    WHERE cat.required = 1
      AND LOWER(TRIM(cat.category_name)) IN (${placeholders})
      AND LOWER(TRIM(COALESCE(a.status, 'active'))) = 'active'
      AND TRIM(COALESCE(cat.attribute_code, '')) <> ''
  `).all(params);
  return rows.map((r) => String(r.code || "").trim()).filter(Boolean);
}

function ensureProductActivationRules({
  name,
  brand,
  article,
  price,
  functionalCategories,
  brandCategoryIds,
  attributesJson,
  variantsTotal,
  activeVariants,
  productId,
  hasCover = true
}) {
  if (!String(name || "").trim()) {
    throw createValidationError("Cannot activate product: name is required.");
  }
  if (!String(brand || "").trim()) {
    throw createValidationError("Cannot activate product: brand is required.");
  }
  const fnCats = Array.isArray(functionalCategories) ? functionalCategories.filter(Boolean) : [];
  if (!fnCats.length) {
    throw createValidationError("Cannot activate product: at least one functional category is required.");
  }
  const brandCats = Array.isArray(brandCategoryIds) ? brandCategoryIds.filter((x) => Number.isFinite(Number(x)) && Number(x) > 0) : [];
  if (!brandCats.length) {
    throw createValidationError("Cannot activate product: at least one brand category is required.");
  }

  if (!hasCover) {
    throw createValidationError("Cannot activate product: add product cover or active variant image.");
  }

  const requiredCodes = getRequiredAttributeCodesForCategories(fnCats);
  if (requiredCodes.length) {
    const values = parseAttributeValues(attributesJson);
    const missing = requiredCodes.filter((code) => !values.has(String(code).toLowerCase()));
    if (missing.length) {
      throw createValidationError(`Cannot activate product: required attributes are missing (${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", ..." : ""}).`);
    }
  }

  const hasVariants = Number(variantsTotal || 0) > 0;
  if (!hasVariants) {
    if (!String(article || "").trim()) {
      throw createValidationError("Cannot activate product without variants: article/SKU is required.");
    }
    if (price == null || price === "" || !Number.isFinite(Number(price))) {
      throw createValidationError("Cannot activate product without variants: price is required.");
    }
    return;
  }

  if (Number(activeVariants || 0) <= 0) {
    throw createValidationError("Cannot activate product: no active variant is available.");
  }

  if (productId) {
    const badActiveVariant = db
      .prepare(`
        SELECT id
        FROM product_variants
        WHERE product_id = @productId
          AND LOWER(TRIM(COALESCE(status, ''))) = 'active'
          AND (
            TRIM(COALESCE(sku, '')) = ''
            OR price IS NULL
          )
        LIMIT 1
      `)
      .get({ productId: String(productId) });
    if (badActiveVariant) {
      throw createValidationError("Cannot activate product: active variants must have SKU and price.");
    }
  }
}
function hasNonEmptyJsonList(raw) {
  try {
    const arr = JSON.parse(String(raw || "[]"));
    return Array.isArray(arr) && arr.some((x) => String(x || "").trim() !== "");
  } catch {
    return false;
  }
}

function getProductCoverState(productId, productRow = null) {
  const id = String(productId || "").trim();
  if (!id) return { hasCover: false };
  const row = productRow || db.prepare(`SELECT image, gallery_json FROM products WHERE id = @id LIMIT 1`).get({ id }) || {};
  const hasImage = String(row.image || "").trim() !== "";
  const hasGallery = hasNonEmptyJsonList(row.gallery_json);
  const hasProductMedia = Number(
    db.prepare(`SELECT EXISTS(SELECT 1 FROM product_media WHERE product_id = @id LIMIT 1) AS e`).get({ id })?.e || 0
  ) === 1;
  const hasActiveVariantMedia = Number(
    db.prepare(`
      SELECT EXISTS(
        SELECT 1
        FROM product_variants v
        JOIN product_media pm ON pm.variant_id = v.id
        WHERE v.product_id = @id
          AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
        LIMIT 1
      ) AS e
    `).get({ id })?.e || 0
  ) === 1;
  return { hasCover: hasImage || hasGallery || hasProductMedia || hasActiveVariantMedia };
}

function getProductVariantSummary(productId) {
  const id = String(productId || "").trim();
  if (!id) return { total: 0, active: 0 };
  const row = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'active' THEN 1 ELSE 0 END) AS active
      FROM product_variants
      WHERE product_id = @id
    `)
    .get({ id });
  return {
    total: Number(row?.total || 0),
    active: Number(row?.active || 0)
  };
}

function hasActiveVariantConflict(productStatus, variantsTotal, activeVariants) {
  return (
    String(productStatus || "").trim().toLowerCase() === "active" &&
    Number(variantsTotal || 0) > 0 &&
    Number(activeVariants || 0) <= 0
  );
}

const ALLOWED_TABLES = new Set([
  "products", "orders", "product_variants", "product_media", "product_documents",
  "product_tabs", "product_tab_blocks", "product_function_categories",
  "product_brand_categories", "brands", "functional_categories", "brand_categories",
  "brand_native_categories", "product_attributes", "attribute_definitions",
  "category_attribute_templates", "exchange_rates", "audit_log"
]);

const SAFE_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/i;

function assertSafeIdentifier(value, label) {
  if (!SAFE_IDENTIFIER_RE.test(String(value || ""))) {
    throw new Error(`Unsafe SQL identifier for ${label}: ${value}`);
  }
}

function hasColumn(table, column) {
  assertSafeIdentifier(table, "table");
  assertSafeIdentifier(column, "column");
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Unknown table: ${table}`);
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function addColumnIfMissing(table, column, definition) {
  assertSafeIdentifier(table, "table");
  assertSafeIdentifier(column, "column");
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Unknown table: ${table}`);
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function normalizeCurrency(value) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "EUR") return "EUR";
  return "RUB";
}

function inferCurrencyByBrand(brand) {
  const b = String(brand || "").trim().toLowerCase();
  if (b.includes("loxone")) return "EUR";
  return "RUB";
}

function getLatestExchangeRate(base = "EUR", quote = "RUB") {
  return db
    .prepare(
      `
      SELECT base, quote, rate, effective_date AS effectiveDate, source, updated_at AS updatedAt
      FROM exchange_rates
      WHERE base = @base AND quote = @quote
      ORDER BY effective_date DESC, updated_at DESC
      LIMIT 1
    `
    )
    .get({ base: String(base || "EUR").toUpperCase(), quote: String(quote || "RUB").toUpperCase() });
}

function upsertExchangeRate({ base = "EUR", quote = "RUB", rate, effectiveDate = "", source = "cbr.ru" } = {}) {
  const normalizedRate = Number(rate);
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return null;
  const b = String(base || "EUR").toUpperCase();
  const q = String(quote || "RUB").toUpperCase();
  const now = new Date().toISOString();
  const d = String(effectiveDate || now.slice(0, 10)).trim() || now.slice(0, 10);
  db.prepare(
    `
    INSERT INTO exchange_rates (base, quote, rate, effective_date, source, updated_at)
    VALUES (@base, @quote, @rate, @effectiveDate, @source, @updatedAt)
    ON CONFLICT(base, quote, effective_date) DO UPDATE SET
      rate = excluded.rate,
      source = excluded.source,
      updated_at = excluded.updated_at
  `
  ).run({ base: b, quote: q, rate: normalizedRate, effectiveDate: d, source, updatedAt: now });
  return getLatestExchangeRate(b, q);
}

function getEffectiveEurRubRate() {
  const row = getLatestExchangeRate("EUR", "RUB");
  const rate = Number(row?.rate || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 100;
}

function recalculateProductPriceRub(eurRubRate = getEffectiveEurRubRate()) {
  const rate = Number(eurRubRate);
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 100;
  return db
    .prepare(
      `
      UPDATE products
      SET price_rub = CASE
        WHEN UPPER(COALESCE(price_currency, 'RUB')) = 'EUR' AND price IS NOT NULL
          THEN ROUND(price * @eurRubRate, 2)
        WHEN price IS NOT NULL
          THEN ROUND(price, 2)
        ELSE NULL
      END,
      updated_at = COALESCE(updated_at, @updatedAt)
    `
    )
    .run({ eurRubRate: safeRate, updatedAt: new Date().toISOString() }).changes;
}

function computePriceRub(priceValue, priceCurrency, eurRubRate = getEffectiveEurRubRate()) {
  const price = priceValue == null || priceValue === "" ? null : Number(priceValue);
  if (!Number.isFinite(price)) return null;
  const currency = normalizeCurrency(priceCurrency);
  if (currency === "EUR") return Math.round(price * Number(eurRubRate || 100) * 100) / 100;
  return Math.round(price * 100) / 100;
}

function recalculateCatalogConflicts() {
  const rows = db
    .prepare(
      `
      SELECT id, brand, article, name, category, group_name AS groupName
      FROM products
    `
    )
    .all();

  const normalizeKey = (value) => normalizeText(fixMojibake(value)).toLowerCase();
  const byBrandArticle = new Map();
  for (const row of rows) {
    const brand = normalizeKey(row.brand);
    const article = normalizeKey(row.article);
    if (!brand || !article) continue;
    const key = `${brand}::${article}`;
    const bucket = byBrandArticle.get(key);
    if (bucket) bucket.push(row);
    else byBrandArticle.set(key, [row]);
  }

  const notesByProductId = new Map();
  const pushNote = (productId, note) => {
    const id = String(productId || "").trim();
    const txt = String(note || "").trim();
    if (!id || !txt) return;
    const set = notesByProductId.get(id) || new Set();
    set.add(txt);
    notesByProductId.set(id, set);
  };

  for (const bucket of byBrandArticle.values()) {
    if (!Array.isArray(bucket) || bucket.length <= 1) continue;
    const names = new Set(bucket.map((x) => normalizeText(x.name)).filter(Boolean));
    const categories = new Set(bucket.map((x) => normalizeText(x.category)).filter(Boolean));
    const groups = new Set(bucket.map((x) => normalizeText(x.groupName)).filter(Boolean));
    let reason = "\u0420\u201d\u0421\u0453\u0420\u00b1\u0420\u00bb\u0420\u0451\u0420\u0454\u0420\u00b0\u0421\u201a \u0420\u00b0\u0421\u0402\u0421\u201a\u0420\u0451\u0420\u0454\u0421\u0453\u0420\u00bb\u0420\u00b0 \u0420\u0406 \u0421\u0402\u0420\u00b0\u0420\u0458\u0420\u0454\u0420\u00b0\u0421\u2026 \u0420\u00b1\u0421\u0402\u0420\u00b5\u0420\u0405\u0420\u0491\u0420\u00b0";
    if (names.size > 1) reason += " (\u0421\u0402\u0420\u00b0\u0420\u00b7\u0420\u0405\u0421\u2039\u0420\u00b5 \u0420\u0405\u0420\u00b0\u0420\u00b7\u0420\u0406\u0420\u00b0\u0420\u0405\u0420\u0451\u0421\u040f)";
    else if (categories.size > 1 || groups.size > 1) reason += " (\u0421\u0402\u0420\u00b0\u0420\u00b7\u0420\u0405\u0421\u2039\u0420\u00b5 \u0420\u0454\u0420\u00b0\u0421\u201a\u0420\u00b5\u0420\u0456\u0420\u0455\u0421\u0402\u0420\u0451\u0420\u0451)";
    for (const row of bucket) pushNote(row.id, reason);
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE products SET is_conflict = 0, conflict_note = ''").run();
    const stmt = db.prepare("UPDATE products SET is_conflict = 1, conflict_note = @note WHERE id = @id");
    for (const [id, notes] of notesByProductId.entries()) {
      stmt.run({ id, note: [...notes].join("; ") });
    }
    return notesByProductId.size;
  });
  const flagged = tx();
  return { flagged, groups: [...byBrandArticle.values()].filter((x) => x.length > 1).length };
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      article TEXT,
      name TEXT NOT NULL,
      price REAL,
      price_currency TEXT DEFAULT 'RUB',
      price_rub REAL,
      price_text TEXT,
      category TEXT,
      group_name TEXT,
      brand TEXT,
      image TEXT,
      source_url TEXT,
      description TEXT,
      specs TEXT,
      breadcrumbs TEXT,
      brand_subcategory TEXT,
      system_type TEXT,
      protocol TEXT,
      mounting TEXT,
      supply_voltage TEXT,
      channels TEXT,
      nominal_current TEXT,
      nominal_power TEXT,
      sensor_type TEXT,
      indoor_outdoor TEXT,
      ip_rating TEXT,
      io_count TEXT,
      web_interface TEXT,
      scenario_support TEXT,
      load_type TEXT,
      max_load TEXT,
      is_conflict INTEGER DEFAULT 0,
      conflict_note TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      delivery_comment TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base TEXT NOT NULL,
      quote TEXT NOT NULL,
      rate REAL NOT NULL,
      effective_date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'cbr.ru',
      updated_at TEXT NOT NULL,
      UNIQUE(base, quote, effective_date)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT,
      name TEXT NOT NULL,
      article TEXT,
      price REAL NOT NULL,
      qty INTEGER NOT NULL,
      image TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      option_summary TEXT DEFAULT '',
      price REAL,
      qty INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      media_mode TEXT NOT NULL DEFAULT 'inherit',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      variant_id INTEGER,
      url TEXT NOT NULL,
      is_cover INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      label TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      variant_id INTEGER,
      title TEXT NOT NULL,
      type TEXT DEFAULT '',
      lang TEXT DEFAULT '',
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      variant_id INTEGER,
      title TEXT NOT NULL,
      code TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_tab_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      content_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(tab_id) REFERENCES product_tabs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_function_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(product_id, category_name)
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT DEFAULT '',
      description TEXT DEFAULT '',
      country TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      meta_title TEXT DEFAULT '',
      meta_description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS functional_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(parent_id, name),
      FOREIGN KEY(parent_id) REFERENCES functional_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS brand_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      parent_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(brand_id, parent_id, name),
      FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_id) REFERENCES brand_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS product_brand_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      brand_category_id INTEGER NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(product_id, brand_category_id),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(brand_category_id) REFERENCES brand_categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'string',
      options_json TEXT NOT NULL DEFAULT '[]',
      unit TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_attribute_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      attribute_code TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      filterable INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(category_name, attribute_code),
      FOREIGN KEY(attribute_code) REFERENCES attributes(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
    CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_media_product ON product_media(product_id);
    CREATE INDEX IF NOT EXISTS idx_docs_product ON product_documents(product_id);
    CREATE INDEX IF NOT EXISTS idx_tabs_product ON product_tabs(product_id);
    CREATE INDEX IF NOT EXISTS idx_pfc_product ON product_function_categories(product_id);
    CREATE INDEX IF NOT EXISTS idx_bc_brand ON brand_categories(brand_id);
    CREATE INDEX IF NOT EXISTS idx_pbc_product ON product_brand_categories(product_id);
    CREATE INDEX IF NOT EXISTS idx_cat_attr_tpl_category ON category_attribute_templates(category_name);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
  `);

  addColumnIfMissing("products", "description_html", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "attributes_json", "TEXT DEFAULT '[]'");
  addColumnIfMissing("products", "documents_json", "TEXT DEFAULT '[]'");
  addColumnIfMissing("products", "gallery_json", "TEXT DEFAULT '[]'");
  addColumnIfMissing("products", "brand_subcategory", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "system_type", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "protocol", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "mounting", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "supply_voltage", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "channels", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "nominal_current", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "nominal_power", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "sensor_type", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "indoor_outdoor", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "ip_rating", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "io_count", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "web_interface", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "scenario_support", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "load_type", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "max_load", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "slug", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "meta_title", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "meta_description", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "status", "TEXT DEFAULT 'active'");
  addColumnIfMissing("products", "is_extra", "INTEGER DEFAULT 0");
  addColumnIfMissing("products", "is_brand_featured", "INTEGER DEFAULT 0");
  addColumnIfMissing("products", "is_conflict", "INTEGER DEFAULT 0");
  addColumnIfMissing("products", "conflict_note", "TEXT DEFAULT ''");
  addColumnIfMissing("products", "price_currency", "TEXT DEFAULT 'RUB'");
  addColumnIfMissing("products", "price_rub", "REAL");
  addColumnIfMissing("orders", "customer_email", "TEXT DEFAULT ''");
  addColumnIfMissing("orders", "payment_status", "TEXT DEFAULT 'unpaid'");
  addColumnIfMissing("orders", "delivery_method", "TEXT DEFAULT ''");
  addColumnIfMissing("orders", "manager", "TEXT DEFAULT ''");
  addColumnIfMissing("orders", "manager_comment", "TEXT DEFAULT ''");
  addColumnIfMissing("orders", "updated_at", "TEXT DEFAULT ''");
  addColumnIfMissing("orders", "status_history_json", "TEXT DEFAULT '[]'");
  addColumnIfMissing("orders", "order_documents_json", "TEXT DEFAULT '[]'");

  // SQLite treats NULLs as distinct in UNIQUE(parent_id, name), so root categories
  // (parent_id = NULL) can accumulate duplicates over time. Deduplicate once and
  // enforce uniqueness with an expression-based index.
  const functionalRows = db
    .prepare(`
      SELECT id, parent_id AS parentId, LOWER(TRIM(COALESCE(name, ''))) AS nameKey
      FROM functional_categories
      ORDER BY id ASC
    `)
    .all();
  const keepByKey = new Map();
  const duplicates = [];
  for (const row of functionalRows) {
    const parentPart = row.parentId == null ? "null" : String(Number(row.parentId));
    const key = `${parentPart}::${String(row.nameKey || "")}`;
    const id = Number(row.id);
    const keepId = keepByKey.get(key);
    if (!keepId) {
      keepByKey.set(key, id);
      continue;
    }
    duplicates.push({ id, keepId });
  }
  if (duplicates.length) {
    const dedupeTx = db.transaction((items) => {
      const reparent = db.prepare(`
        UPDATE functional_categories
        SET parent_id = @keepId
        WHERE parent_id = @id
      `);
      const drop = db.prepare(`DELETE FROM functional_categories WHERE id = @id`);
      for (const item of items) {
        reparent.run({ id: item.id, keepId: item.keepId });
        drop.run({ id: item.id });
      }
    });
    dedupeTx(duplicates);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_parent_name_norm
    ON functional_categories(IFNULL(parent_id, -1), LOWER(TRIM(name)));
    CREATE INDEX IF NOT EXISTS idx_fc_parent ON functional_categories(parent_id);
  `);

  db.exec(`
    UPDATE products
    SET price_currency = CASE
      WHEN LOWER(TRIM(COALESCE(brand, ''))) LIKE '%loxone%' THEN 'EUR'
      WHEN TRIM(COALESCE(price_currency, '')) <> '' THEN UPPER(TRIM(price_currency))
      ELSE 'RUB'
    END
  `);
  recalculateProductPriceRub(getEffectiveEurRubRate());
  db.exec(`
    UPDATE orders
    SET updated_at = created_at
    WHERE TRIM(COALESCE(updated_at, '')) = '';
  `);

  // One-time compatibility backfill: mirror legacy single category into N:N table.
  db.exec(`
    INSERT OR IGNORE INTO product_function_categories (
      product_id, category_name, is_primary, sort_order, created_at, updated_at
    )
    SELECT
      p.id,
      TRIM(COALESCE(p.category, '')),
      1,
      0,
      COALESCE(p.updated_at, datetime('now')),
      COALESCE(p.updated_at, datetime('now'))
    FROM products p
    WHERE TRIM(COALESCE(p.category, '')) <> '';
  `);

  const seedNow = new Date().toISOString();
  db.exec(`
    INSERT OR IGNORE INTO brands (name, created_at, updated_at)
    SELECT DISTINCT TRIM(COALESCE(p.brand, '')), '${seedNow}', '${seedNow}'
    FROM products p
    WHERE TRIM(COALESCE(p.brand, '')) <> '';
  `);

  db.exec(`
    INSERT OR IGNORE INTO functional_categories (parent_id, name, created_at, updated_at)
    SELECT DISTINCT NULL, TRIM(COALESCE(pfc.category_name, '')), '${seedNow}', '${seedNow}'
    FROM product_function_categories pfc
    WHERE TRIM(COALESCE(pfc.category_name, '')) <> '';
  `);
  recalculateCatalogConflicts();
}

function writeAuditLog(action, entityType, entityId, details = {}, actor = "system") {
  db.prepare(`
    INSERT INTO audit_log (
      created_at, actor, action, entity_type, entity_id, details_json
    ) VALUES (
      @createdAt, @actor, @action, @entityType, @entityId, @detailsJson
    )
  `).run({
    createdAt: new Date().toISOString(),
    actor: String(actor || "system").trim() || "system",
    action: String(action || "").trim(),
    entityType: String(entityType || "").trim(),
    entityId: String(entityId || "").trim(),
    detailsJson: JSON.stringify(details || {})
  });
}

function listBrandsAdmin() {
  return db
    .prepare(`
      SELECT
        id, name, slug, description, country, logo_url AS logoUrl,
        meta_title AS metaTitle, meta_description AS metaDescription,
        status, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
      FROM brands
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `)
    .all();
}

function createBrandAdmin(payload = {}) {
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO brands (
      name, slug, description, country, logo_url, meta_title, meta_description, status, sort_order, created_at, updated_at
    ) VALUES (
      @name, @slug, @description, @country, @logoUrl, @metaTitle, @metaDescription, @status, @sortOrder, @createdAt, @updatedAt
    )
  `).run({
    name: normalizeBrand(payload.name || ""),
    slug: String(payload.slug || "").trim(),
    description: String(payload.description || "").trim(),
    country: String(payload.country || "").trim(),
    logoUrl: String(payload.logoUrl || "").trim(),
    metaTitle: String(payload.metaTitle || "").trim(),
    metaDescription: String(payload.metaDescription || "").trim(),
    status: String(payload.status || "active").trim() || "active",
    sortOrder: Number(payload.sortOrder || 0),
    createdAt: now,
    updatedAt: now
  });
  const brand = db.prepare(`SELECT * FROM brands WHERE id = @id`).get({ id: info.lastInsertRowid });
  writeAuditLog("create", "brand", brand?.id, {
    name: brand?.name || "",
    status: brand?.status || ""
  });
  return brand;
}

function updateBrandAdmin(brandId, patch = {}) {
  const map = {
    name: "name",
    slug: "slug",
    description: "description",
    country: "country",
    logoUrl: "logo_url",
    metaTitle: "meta_title",
    metaDescription: "meta_description",
    status: "status",
    sortOrder: "sort_order"
  };
  const setParts = [];
  const params = { id: Number(brandId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = @${key}`);
    if (key === "sortOrder") params[key] = Number(patch[key] || 0);
    else if (key === "name") params[key] = normalizeBrand(patch[key] || "");
    else params[key] = String(patch[key] || "").trim();
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = @updatedAt");
  const changes = db.prepare(`UPDATE brands SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
  if (changes > 0) {
    writeAuditLog("update", "brand", Number(brandId), { patch });
  }
  return changes;
}

function deleteBrandAdmin(brandId) {
  const brand = db.prepare(`SELECT id, name FROM brands WHERE id = @id`).get({ id: Number(brandId) });
  const changes = db.prepare(`DELETE FROM brands WHERE id = @id`).run({ id: Number(brandId) }).changes;
  if (changes > 0) {
    writeAuditLog("delete", "brand", Number(brandId), { name: brand?.name || "" });
  }
  return changes;
}

function listFunctionalCategoriesAdmin() {
  return db
    .prepare(`
      SELECT
        id, parent_id AS parentId, name, slug, status, sort_order AS sortOrder,
        created_at AS createdAt, updated_at AS updatedAt
      FROM functional_categories
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `)
    .all();
}

function createFunctionalCategoryAdmin(payload = {}) {
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO functional_categories (
      parent_id, name, slug, status, sort_order, created_at, updated_at
    ) VALUES (
      @parentId, @name, @slug, @status, @sortOrder, @createdAt, @updatedAt
    )
  `).run({
    parentId: payload.parentId == null || payload.parentId === "" ? null : Number(payload.parentId),
    name: normalizeCategory(payload.name || ""),
    slug: String(payload.slug || "").trim(),
    status: String(payload.status || "active").trim() || "active",
    sortOrder: Number(payload.sortOrder || 0),
    createdAt: now,
    updatedAt: now
  });
  const category = db.prepare(`SELECT * FROM functional_categories WHERE id = @id`).get({ id: info.lastInsertRowid });
  writeAuditLog("create", "functional_category", category?.id, {
    name: category?.name || "",
    parentId: category?.parent_id ?? null
  });
  return category;
}

function updateFunctionalCategoryAdmin(categoryId, patch = {}) {
  const map = {
    parentId: "parent_id",
    name: "name",
    slug: "slug",
    status: "status",
    sortOrder: "sort_order"
  };
  const setParts = [];
  const params = { id: Number(categoryId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = @${key}`);
    if (key === "sortOrder") params[key] = Number(patch[key] || 0);
    else if (key === "parentId") params[key] = patch[key] == null || patch[key] === "" ? null : Number(patch[key]);
    else if (key === "name") params[key] = normalizeCategory(patch[key] || "");
    else params[key] = String(patch[key] || "").trim();
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = @updatedAt");
  const changes = db.prepare(`UPDATE functional_categories SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
  if (changes > 0) {
    writeAuditLog("update", "functional_category", Number(categoryId), { patch });
  }
  return changes;
}

function deleteFunctionalCategoryAdmin(categoryId) {
  const category = db.prepare(`SELECT id, name FROM functional_categories WHERE id = @id`).get({ id: Number(categoryId) });
  const changes = db.prepare(`DELETE FROM functional_categories WHERE id = @id`).run({ id: Number(categoryId) }).changes;
  if (changes > 0) {
    writeAuditLog("delete", "functional_category", Number(categoryId), { name: category?.name || "" });
  }
  return changes;
}

function listBrandCategoriesAdmin(brandId = null) {
  let sql = `
    SELECT
      bc.id, bc.brand_id AS brandId, bc.parent_id AS parentId,
      bc.name, bc.slug, bc.status, bc.sort_order AS sortOrder,
      bc.created_at AS createdAt, bc.updated_at AS updatedAt,
      b.name AS brandName
    FROM brand_categories bc
    JOIN brands b ON b.id = bc.brand_id
  `;
  const params = {};
  if (brandId != null && brandId !== "") {
    sql += " WHERE bc.brand_id = @brandId ";
    params.brandId = Number(brandId);
  }
  sql += " ORDER BY b.name COLLATE NOCASE ASC, bc.sort_order ASC, bc.name COLLATE NOCASE ASC";
  return db.prepare(sql).all(params);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === "\"" && next === "\"") {
        value += "\"";
        i += 1;
      } else if (ch === "\"") {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (ch === "\n") {
      row.push(value.replace(/\r$/, ""));
      value = "";
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
      row = [];
      continue;
    }
    value += ch;
  }
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function readNativeBrandCategoriesFromFile() {
  try {
    const stat = fs.statSync(normalizedCatalogV2Path);
    if (nativeBrandCategoriesCache.mtimeMs === stat.mtimeMs) {
      return nativeBrandCategoriesCache.byBrand;
    }

    const raw = fs.readFileSync(normalizedCatalogV2Path, "utf8");
    const rows = parseCsvRows(raw);
    if (!rows.length) {
      nativeBrandCategoriesCache = { mtimeMs: stat.mtimeMs, byBrand: new Map() };
      return nativeBrandCategoriesCache.byBrand;
    }

    const header = rows[0].map((x) => String(x || "").trim().toLowerCase());
    const brandIdx = header.indexOf("brand");
    const subIdx = header.indexOf("commercial_subgroup");
    const grouped = new Map();
    if (brandIdx >= 0 && subIdx >= 0) {
      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        const brand = normalizeBrand(row[brandIdx]);
        const sub = normalizeText(row[subIdx]);
        if (!brand || !sub) continue;
        const set = grouped.get(brand) || new Set();
        set.add(sub);
        grouped.set(brand, set);
      }
    }

    const byBrand = new Map();
    for (const [brand, set] of grouped.entries()) {
      byBrand.set(
        brand,
        [...set].sort((a, b) => String(a).localeCompare(String(b), "ru"))
      );
    }
    nativeBrandCategoriesCache = { mtimeMs: stat.mtimeMs, byBrand };
    return nativeBrandCategoriesCache.byBrand;
  } catch {
    return new Map();
  }
}

function readNativeBrandCategoriesFromProducts(brandName) {
  const brand = normalizeBrand(brandName);
  if (!brand) return [];
  const rows = db.prepare(`
    SELECT DISTINCT TRIM(COALESCE(brand_subcategory, '')) AS sub
    FROM products
    WHERE LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM(@brand))
      AND TRIM(COALESCE(brand_subcategory, '')) <> ''
  `).all({ brand });
  return rows
    .map((row) => normalizeText(row.sub))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), "ru"));
}

function readCuratedBrandCategories() {
  try {
    const stat = fs.statSync(curatedBrandCategoriesPath);
    if (curatedBrandCategoriesCache.mtimeMs === stat.mtimeMs) {
      return curatedBrandCategoriesCache.byBrand;
    }
    const raw = JSON.parse(fs.readFileSync(curatedBrandCategoriesPath, "utf8"));
    const byBrand = new Map();
    if (raw && typeof raw === "object") {
      for (const [brandRaw, listRaw] of Object.entries(raw)) {
        const brand = normalizeBrand(brandRaw);
        if (!brand) continue;
        const list = Array.isArray(listRaw) ? listRaw : [];
        const categories = Array.from(
          new Set(list.map((x) => normalizeText(x)).filter(Boolean))
        );
        if (categories.length) byBrand.set(brand, categories);
      }
    }
    curatedBrandCategoriesCache = { mtimeMs: stat.mtimeMs, byBrand };
    return curatedBrandCategoriesCache.byBrand;
  } catch {
    return new Map();
  }
}

function listBrandNativeCategoriesAdmin(brandName = "") {
  const brand = normalizeBrand(brandName);
  if (!brand) return [];

  const curated = readCuratedBrandCategories();
  const fromCurated = curated.get(brand) || [];
  if (fromCurated.length) return fromCurated;

  const byBrand = readNativeBrandCategoriesFromFile();
  const fromFile = byBrand.get(brand) || [];
  if (fromFile.length) return fromFile;

  return readNativeBrandCategoriesFromProducts(brand);
}

function createBrandCategoryAdmin(payload = {}) {
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO brand_categories (
      brand_id, parent_id, name, slug, status, sort_order, created_at, updated_at
    ) VALUES (
      @brandId, @parentId, @name, @slug, @status, @sortOrder, @createdAt, @updatedAt
    )
  `).run({
    brandId: Number(payload.brandId),
    parentId: payload.parentId == null || payload.parentId === "" ? null : Number(payload.parentId),
    name: String(payload.name || "").trim(),
    slug: String(payload.slug || "").trim(),
    status: String(payload.status || "active").trim() || "active",
    sortOrder: Number(payload.sortOrder || 0),
    createdAt: now,
    updatedAt: now
  });
  const category = db.prepare(`SELECT * FROM brand_categories WHERE id = @id`).get({ id: info.lastInsertRowid });
  writeAuditLog("create", "brand_category", category?.id, {
    name: category?.name || "",
    brandId: category?.brand_id ?? null,
    parentId: category?.parent_id ?? null
  });
  return category;
}

function updateBrandCategoryAdmin(categoryId, patch = {}) {
  const map = {
    brandId: "brand_id",
    parentId: "parent_id",
    name: "name",
    slug: "slug",
    status: "status",
    sortOrder: "sort_order"
  };
  const setParts = [];
  const params = { id: Number(categoryId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = @${key}`);
    if (key === "sortOrder" || key === "brandId") params[key] = Number(patch[key] || 0);
    else if (key === "parentId") params[key] = patch[key] == null || patch[key] === "" ? null : Number(patch[key]);
    else params[key] = String(patch[key] || "").trim();
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = @updatedAt");
  const changes = db.prepare(`UPDATE brand_categories SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
  if (changes > 0) {
    writeAuditLog("update", "brand_category", Number(categoryId), { patch });
  }
  return changes;
}

function deleteBrandCategoryAdmin(categoryId) {
  const category = db.prepare(`SELECT id, name FROM brand_categories WHERE id = @id`).get({ id: Number(categoryId) });
  const changes = db.prepare(`DELETE FROM brand_categories WHERE id = @id`).run({ id: Number(categoryId) }).changes;
  if (changes > 0) {
    writeAuditLog("delete", "brand_category", Number(categoryId), { name: category?.name || "" });
  }
  return changes;
}

function listAttributesAdmin() {
  return db.prepare(`
    SELECT
      id,
      code,
      name,
      type,
      options_json AS optionsJson,
      unit,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM attributes
    ORDER BY name COLLATE NOCASE ASC
  `).all();
}

function createAttributeAdmin(payload = {}) {
  const now = new Date().toISOString();
  const code = String(payload.code || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  if (!code || !name) throw createValidationError("code \u0420\u0451 name \u0420\u0455\u0420\u00b1\u0421\u040f\u0420\u00b7\u0420\u00b0\u0421\u201a\u0420\u00b5\u0420\u00bb\u0421\u040a\u0420\u0405\u0421\u2039");
  const info = db.prepare(`
    INSERT INTO attributes (
      code, name, type, options_json, unit, status, created_at, updated_at
    ) VALUES (
      @code, @name, @type, @optionsJson, @unit, @status, @createdAt, @updatedAt
    )
  `).run({
    code,
    name,
    type: String(payload.type || "string").trim() || "string",
    optionsJson: JSON.stringify(Array.isArray(payload.options) ? payload.options : []),
    unit: String(payload.unit || "").trim(),
    status: String(payload.status || "active").trim() || "active",
    createdAt: now,
    updatedAt: now
  });
  const row = db.prepare(`SELECT * FROM attributes WHERE id = @id`).get({ id: info.lastInsertRowid });
  writeAuditLog("create", "attribute", row?.id, { code, name });
  return row;
}

function updateAttributeAdmin(attributeId, patch = {}) {
  const map = {
    code: "code",
    name: "name",
    type: "type",
    unit: "unit",
    status: "status"
  };
  const setParts = [];
  const params = { id: Number(attributeId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = @${key}`);
    params[key] = key === "code"
      ? String(patch[key] || "").trim().toLowerCase()
      : String(patch[key] || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "options")) {
    setParts.push("options_json = @optionsJson");
    params.optionsJson = JSON.stringify(Array.isArray(patch.options) ? patch.options : []);
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = @updatedAt");
  const changes = db.prepare(`UPDATE attributes SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
  if (changes > 0) writeAuditLog("update", "attribute", Number(attributeId), { patch });
  return changes;
}

function deleteAttributeAdmin(attributeId) {
  const row = db.prepare(`SELECT id, code FROM attributes WHERE id = @id`).get({ id: Number(attributeId) });
  const changes = db.prepare(`DELETE FROM attributes WHERE id = @id`).run({ id: Number(attributeId) }).changes;
  if (changes > 0) writeAuditLog("delete", "attribute", Number(attributeId), { code: row?.code || "" });
  return changes;
}

function listCategoryAttributeTemplates(categoryName = "") {
  const where = [];
  const params = {};
  if (String(categoryName || "").trim()) {
    where.push("LOWER(TRIM(t.category_name)) = LOWER(TRIM(@categoryName))");
    params.categoryName = normalizeCategory(categoryName);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT
      t.id,
      t.category_name AS categoryName,
      t.attribute_code AS attributeCode,
      t.required,
      t.filterable,
      t.visible,
      t.sort_order AS sortOrder,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt,
      a.name AS attributeName,
      a.type AS attributeType,
      a.unit AS attributeUnit
    FROM category_attribute_templates t
    LEFT JOIN attributes a ON a.code = t.attribute_code
    ${whereSql}
    ORDER BY t.category_name COLLATE NOCASE ASC, t.sort_order ASC, t.attribute_code COLLATE NOCASE ASC
  `).all(params).map((row) => ({
    ...row,
    required: Number(row.required) === 1,
    filterable: Number(row.filterable) === 1,
    visible: Number(row.visible) === 1
  }));
}

function createCategoryAttributeTemplate(payload = {}) {
  const now = new Date().toISOString();
  const categoryName = normalizeCategory(payload.categoryName || "");
  const attributeCode = String(payload.attributeCode || "").trim().toLowerCase();
  if (!categoryName || !attributeCode) throw createValidationError("categoryName \u0420\u0451 attributeCode \u0420\u0455\u0420\u00b1\u0421\u040f\u0420\u00b7\u0420\u00b0\u0421\u201a\u0420\u00b5\u0420\u00bb\u0421\u040a\u0420\u0405\u0421\u2039");
  const info = db.prepare(`
    INSERT INTO category_attribute_templates (
      category_name, attribute_code, required, filterable, visible, sort_order, created_at, updated_at
    ) VALUES (
      @categoryName, @attributeCode, @required, @filterable, @visible, @sortOrder, @createdAt, @updatedAt
    )
  `).run({
    categoryName,
    attributeCode,
    required: payload.required ? 1 : 0,
    filterable: payload.filterable ? 1 : 0,
    visible: payload.visible === false ? 0 : 1,
    sortOrder: Number(payload.sortOrder || 0),
    createdAt: now,
    updatedAt: now
  });
  const row = db.prepare(`SELECT * FROM category_attribute_templates WHERE id = @id`).get({ id: info.lastInsertRowid });
  writeAuditLog("create", "category_attribute_template", row?.id, { categoryName, attributeCode });
  return row;
}

function updateCategoryAttributeTemplate(templateId, patch = {}) {
  const map = {
    categoryName: "category_name",
    attributeCode: "attribute_code",
    sortOrder: "sort_order"
  };
  const setParts = [];
  const params = { id: Number(templateId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = @${key}`);
    if (key === "categoryName") params[key] = normalizeCategory(patch[key] || "");
    else if (key === "attributeCode") params[key] = String(patch[key] || "").trim().toLowerCase();
    else params[key] = Number(patch[key] || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "required")) {
    setParts.push("required = @required");
    params.required = patch.required ? 1 : 0;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "filterable")) {
    setParts.push("filterable = @filterable");
    params.filterable = patch.filterable ? 1 : 0;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "visible")) {
    setParts.push("visible = @visible");
    params.visible = patch.visible ? 1 : 0;
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = @updatedAt");
  const changes = db.prepare(`UPDATE category_attribute_templates SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
  if (changes > 0) writeAuditLog("update", "category_attribute_template", Number(templateId), { patch });
  return changes;
}

function deleteCategoryAttributeTemplate(templateId) {
  const row = db.prepare(`SELECT id, category_name AS categoryName, attribute_code AS attributeCode FROM category_attribute_templates WHERE id = @id`).get({ id: Number(templateId) });
  const changes = db.prepare(`DELETE FROM category_attribute_templates WHERE id = @id`).run({ id: Number(templateId) }).changes;
  if (changes > 0) writeAuditLog("delete", "category_attribute_template", Number(templateId), row || {});
  return changes;
}

function getProductBrandCategories(productId) {
  return db.prepare(`
    SELECT
      pbc.brand_category_id AS brandCategoryId,
      pbc.is_primary AS isPrimary
    FROM product_brand_categories pbc
    WHERE pbc.product_id = @productId
    ORDER BY pbc.is_primary DESC, pbc.sort_order ASC, pbc.id ASC
  `).all({ productId: String(productId) }).map((row) => ({
    brandCategoryId: Number(row.brandCategoryId),
    isPrimary: Number(row.isPrimary) === 1
  }));
}

function syncProductBrandCategories(productId, brandCategoryIdsInput, primaryBrandCategoryIdInput) {
  const id = String(productId || "").trim();
  if (!id) return;
  const categoryIds = Array.isArray(brandCategoryIdsInput)
    ? [...new Set(brandCategoryIdsInput.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))]
    : [];
  const primaryId = Number(primaryBrandCategoryIdInput || 0);
  const resolvedPrimary = categoryIds.includes(primaryId) ? primaryId : (categoryIds[0] || 0);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM product_brand_categories WHERE product_id = @productId`).run({ productId: id });
    if (!categoryIds.length) return;
    const insert = db.prepare(`
      INSERT INTO product_brand_categories (
        product_id, brand_category_id, is_primary, sort_order, created_at, updated_at
      ) VALUES (
        @productId, @brandCategoryId, @isPrimary, @sortOrder, @createdAt, @updatedAt
      )
    `);
    categoryIds.forEach((categoryId, index) => {
      insert.run({
        productId: id,
        brandCategoryId: categoryId,
        isPrimary: categoryId === resolvedPrimary ? 1 : 0,
        sortOrder: index,
        createdAt: now,
        updatedAt: now
      });
    });
  });
  tx();
}

function normalizeCategoryListInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return [...new Set(input.map((x) => normalizeCategory(x)).filter(Boolean))];
  }
  return [...new Set(
    String(input)
      .split(/[,\n;]+/g)
      .map((x) => normalizeCategory(x))
      .filter(Boolean)
  )];
}

function getFunctionalCategoriesByProductIds(ids) {
  const out = new Map();
  const productIds = Array.isArray(ids) ? ids.map((x) => String(x || "")).filter(Boolean) : [];
  if (!productIds.length) return out;
  const placeholders = productIds.map((_, i) => `@id${i}`).join(", ");
  const params = Object.fromEntries(productIds.map((id, i) => [`id${i}`, id]));
  const rows = db.prepare(`
    SELECT product_id AS productId, category_name AS categoryName, is_primary AS isPrimary, sort_order AS sortOrder
    FROM product_function_categories
    WHERE product_id IN (${placeholders})
    ORDER BY product_id ASC, is_primary DESC, sort_order ASC, category_name COLLATE NOCASE ASC
  `).all(params);

  for (const row of rows) {
    const key = String(row.productId);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({
      category: normalizeCategory(row.categoryName),
      isPrimary: Number(row.isPrimary || 0) === 1,
      sortOrder: Number(row.sortOrder || 0)
    });
  }
  return out;
}

function syncProductFunctionalCategories(productId, categoriesInput, primaryInput) {
  const id = String(productId || "").trim();
  if (!id) return;
  const categories = normalizeCategoryListInput(categoriesInput);
  const primary = normalizeCategory(primaryInput || "");
  if (!categories.length && !primary) return;

  const merged = categories.slice();
  if (primary && !merged.includes(primary)) merged.unshift(primary);
  const resolvedPrimary = primary || merged[0] || "";
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM product_function_categories WHERE product_id = @id").run({ id });
    const ins = db.prepare(`
      INSERT INTO product_function_categories (
        product_id, category_name, is_primary, sort_order, created_at, updated_at
      ) VALUES (
        @productId, @categoryName, @isPrimary, @sortOrder, @createdAt, @updatedAt
      )
    `);
    merged.forEach((cat, index) => {
      ins.run({
        productId: id,
        categoryName: cat,
        isPrimary: cat === resolvedPrimary ? 1 : 0,
        sortOrder: index,
        createdAt: now,
        updatedAt: now
      });
    });
  });
  tx();
}

function listProducts() {
  const rows = db
    .prepare(`
      SELECT
        id,
        article,
        entity_type AS entityType,
        name,
        price AS priceValue,
        COALESCE(price_rub, price) AS price,
        COALESCE(NULLIF(price_currency, ''), 'RUB') AS priceCurrency,
        image,
        category,
        group_name AS "group",
        commercial_group AS commercialGroup,
        commercial_subgroup AS commercialSubgroup,
        source_category AS sourceCategory,
        brand,
        description,
        description_html AS descriptionHtml,
        specs,
        gallery_json AS galleryJson,
        attributes_json AS attributesJson,
        documents_json AS documentsJson,
        breadcrumbs,
        brand_subcategory AS brandSubcategory,
        system_type AS systemType,
        protocol,
        mounting,
        supply_voltage AS supplyVoltage,
        channels,
        nominal_current AS nominalCurrent,
        nominal_power AS nominalPower,
        sensor_type AS sensorType,
        indoor_outdoor AS indoorOutdoor,
        ip_rating AS ipRating,
        io_count AS ioCount,
        web_interface AS webInterface,
        scenario_support AS scenarioSupport,
        load_type AS loadType,
        max_load AS maxLoad,
        status,
        price_text,
        source_url AS sourceUrl,
        subcategory,
        is_extra,
        COALESCE(is_brand_featured, 0) AS isBrandFeatured,
        COALESCE(is_conflict, 0) AS isConflict,
        COALESCE(conflict_note, '') AS conflictNote
      FROM products
      WHERE LOWER(TRIM(COALESCE(entity_type, 'product'))) NOT IN ('service', 'merch')
        AND TRIM(COALESCE(source_category, '')) <> ''
        AND LOWER(TRIM(COALESCE(category, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')
        AND LOWER(TRIM(COALESCE(commercial_group, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')
      ORDER BY name COLLATE NOCASE ASC
    `)
    .all()
    .map(sanitizeProductRow);

  const fmap = getFunctionalCategoriesByProductIds(rows.map((r) => r.id));
  return rows.map((row) => {
    const fc = fmap.get(String(row.id)) || [];
    const categories = fc.map((x) => x.category).filter(Boolean);
    const primary = (fc.find((x) => x.isPrimary)?.category) || row.category || "";
    return {
      ...row,
      category: primary || row.category || "",
      primaryFunctionalCategory: primary || "",
      functionalCategories: categories
    };
  });
}

function replaceAllProducts(products) {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO products (
      id, article, name, price, price_currency, price_rub, price_text, category, group_name, brand, image,
      source_url, description, specs, breadcrumbs, description_html, gallery_json, attributes_json, documents_json,
      brand_subcategory, system_type, protocol, mounting, supply_voltage, channels, nominal_current, nominal_power,
      sensor_type, indoor_outdoor, ip_rating, io_count, web_interface, scenario_support, load_type, max_load, updated_at
    ) VALUES (
      @id, @article, @name, @price, @priceCurrency, @priceRub, @priceText, @category, @group, @brand, @image,
      @sourceUrl, @description, @specs, @breadcrumbs, @descriptionHtml, @galleryJson, @attributesJson, @documentsJson,
      @brandSubcategory, @systemType, @protocol, @mounting, @supplyVoltage, @channels, @nominalCurrent, @nominalPower,
      @sensorType, @indoorOutdoor, @ipRating, @ioCount, @webInterface, @scenarioSupport, @loadType, @maxLoad, @updatedAt
    )
  `);

  const tx = db.transaction((rows) => {
    db.prepare("DELETE FROM products").run();
    for (const row of rows) {
      insert.run({
        ...(() => {
          const detectedCurrency = normalizeCurrency(row.priceCurrency || inferCurrencyByBrand(row.brand || ""));
          const basePrice = row.price ?? null;
          const rubPrice = computePriceRub(basePrice, detectedCurrency);
          return { priceCurrency: detectedCurrency, priceRub: rubPrice };
        })(),
        id: String(row.id || ""),
        article: row.article || "",
        name: row.name || "",
        price: row.price ?? null,
        priceText: row.priceText || "",
        category: row.category || "",
        group: row.group || "",
        brand: row.brand || "",
        image: row.image || "",
        sourceUrl: row.sourceUrl || "",
        description: row.description || "",
        specs: row.specs || "",
        breadcrumbs: row.breadcrumbs || "",
        descriptionHtml: row.descriptionHtml || "",
        galleryJson: JSON.stringify(row.gallery || []),
        attributesJson: JSON.stringify(row.attributes || []),
        documentsJson: JSON.stringify(row.documents || []),
        brandSubcategory: row.brandSubcategory || "",
        systemType: row.systemType || "",
        protocol: row.protocol || "",
        mounting: row.mounting || "",
        supplyVoltage: row.supplyVoltage || "",
        channels: row.channels || "",
        nominalCurrent: row.nominalCurrent || "",
        nominalPower: row.nominalPower || "",
        sensorType: row.sensorType || "",
        indoorOutdoor: row.indoorOutdoor || "",
        ipRating: row.ipRating || "",
        ioCount: row.ioCount || "",
        webInterface: row.webInterface || "",
        scenarioSupport: row.scenarioSupport || "",
        loadType: row.loadType || "",
        maxLoad: row.maxLoad || "",
        updatedAt: now
      });
    }
    db.exec(`
      INSERT OR IGNORE INTO product_function_categories (
        product_id, category_name, is_primary, sort_order, created_at, updated_at
      )
      SELECT
        p.id,
        TRIM(COALESCE(p.category, '')),
        1,
        0,
        COALESCE(p.updated_at, datetime('now')),
        COALESCE(p.updated_at, datetime('now'))
      FROM products p
      WHERE TRIM(COALESCE(p.category, '')) <> '';
    `);
  });

  tx(products);
}

function getProductsForDetailEnrich(limit = 500, onlyMissing = true) {
  let sql = `
    SELECT id, source_url AS sourceUrl
    FROM products
    WHERE source_url IS NOT NULL
      AND source_url <> ''
  `;
  if (onlyMissing) {
    sql += " AND (description_html IS NULL OR description_html = '' OR documents_json = '[]')";
  }
  sql += " ORDER BY id LIMIT @limit";
  return db.prepare(sql).all({ limit });
}

function updateProductDetailsBatch(items) {
  const stmt = db.prepare(`
    UPDATE products
    SET
      description = @description,
      description_html = @descriptionHtml,
      image = @image,
      gallery_json = @galleryJson,
      specs = @specs,
      attributes_json = @attributesJson,
      documents_json = @documentsJson,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  const now = new Date().toISOString();
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      stmt.run({
        id: row.id,
        description: row.description || "",
        descriptionHtml: row.descriptionHtml || "",
        image: row.image || "",
        galleryJson: JSON.stringify(row.gallery || []),
        specs: row.specs || "",
        attributesJson: JSON.stringify(row.attributes || []),
        documentsJson: JSON.stringify(row.documents || []),
        updatedAt: now
      });
    }
  });
  tx(items);
  recalculateCatalogConflicts();
}

function listProductsForImageRetouch({ limit = 200, offset = 0, onlyRemote = true } = {}) {
  let sql = `
    SELECT id, name, image, source_url AS sourceUrl
    FROM products
    WHERE image IS NOT NULL
      AND image <> ''
  `;
  if (onlyRemote) {
    sql += " AND (image LIKE 'http://%' OR image LIKE 'https://%')";
  }
  sql += " ORDER BY name COLLATE NOCASE ASC LIMIT @limit OFFSET @offset";
  return db.prepare(sql).all({ limit, offset });
}

function updateProductImagesBatch(items) {
  const stmt = db.prepare(`
    UPDATE products
    SET image = @image, updated_at = @updatedAt
    WHERE id = @id
  `);
  const now = new Date().toISOString();
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      stmt.run({
        id: String(row.id),
        image: String(row.image || ""),
        updatedAt: now
      });
    }
  });
  tx(items);
}

function listAdminProducts({ limit = 200, offset = 0, q = "" } = {}) {
  let sql = `
    SELECT
      id, article, name, category, group_name AS groupName, price, source_url AS sourceUrl,
      CASE WHEN documents_json IS NULL OR documents_json = '[]' THEN 0 ELSE 1 END AS hasDocs,
      CASE WHEN description_html IS NULL OR description_html = '' THEN 0 ELSE 1 END AS hasDescription,
      COALESCE(is_conflict, 0) AS isConflict,
      COALESCE(conflict_note, '') AS conflictNote
    FROM products
    WHERE LOWER(TRIM(COALESCE(category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')
      AND LOWER(TRIM(COALESCE(brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')
      AND LOWER(TRIM(COALESCE(id, ''))) <> LOWER('service-networks')
  `;
  const params = { limit, offset };
  if (q) {
    sql += " AND (name LIKE @q OR article LIKE @q OR category LIKE @q) ";
    params.q = `%${q}%`;
  }
  sql += " ORDER BY name COLLATE NOCASE ASC LIMIT @limit OFFSET @offset";
  const rowsRaw = db.prepare(sql).all(params).map(sanitizeProductRow).filter((row) => !isServiceLikeRow(row));
  const fmap = getFunctionalCategoriesByProductIds(rowsRaw.map((r) => r.id));
  const rows = rowsRaw.map((row) => {
    const fc = fmap.get(String(row.id)) || [];
    const primary = (fc.find((x) => x.isPrimary)?.category) || row.category || "";
    return {
      ...row,
      category: primary || "",
      primaryFunctionalCategory: primary || "",
      functionalCategories: fc.map((x) => x.category)
    };
  });
  const totalSql = q
    ? `
      SELECT COUNT(*) AS c
      FROM products
      WHERE LOWER(TRIM(COALESCE(category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')
        AND LOWER(TRIM(COALESCE(brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')
        AND LOWER(TRIM(COALESCE(id, ''))) <> LOWER('service-networks')
        AND (name LIKE @q OR article LIKE @q OR category LIKE @q)
    `
    : `
      SELECT COUNT(*) AS c
      FROM products
      WHERE LOWER(TRIM(COALESCE(category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')
        AND LOWER(TRIM(COALESCE(brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')
        AND LOWER(TRIM(COALESCE(id, ''))) <> LOWER('service-networks')
    `;
  const total = db.prepare(totalSql).get(q ? { q: `%${q}%` } : {}).c;
  return { rows, total };
}

function getAdminProductById(id) {
  const row = db
    .prepare(`
      SELECT
        id, article, name, price, price_currency AS priceCurrency, COALESCE(price_rub, price) AS priceRub, price_text AS priceText, category,
        group_name AS groupName, brand, image, source_url AS sourceUrl,
        status,
        description, description_html AS descriptionHtml, specs, breadcrumbs,
        gallery_json AS galleryJson,
        attributes_json AS attributesJson, documents_json AS documentsJson,
        brand_subcategory AS brandSubcategory,
        system_type AS systemType,
        protocol,
        mounting,
        supply_voltage AS supplyVoltage,
        channels,
        nominal_current AS nominalCurrent,
        nominal_power AS nominalPower,
        sensor_type AS sensorType,
        indoor_outdoor AS indoorOutdoor,
        ip_rating AS ipRating,
        io_count AS ioCount,
        web_interface AS webInterface,
        scenario_support AS scenarioSupport,
        load_type AS loadType,
        max_load AS maxLoad,
        slug,
        meta_title AS metaTitle,
        meta_description AS metaDescription,
        COALESCE(is_brand_featured, 0) AS isBrandFeatured,
        COALESCE(is_conflict, 0) AS isConflict,
        COALESCE(conflict_note, '') AS conflictNote,
        updated_at AS updatedAt
      FROM products
      WHERE id = @id
      LIMIT 1
    `)
    .get({ id });
  if (!row) return row;
  const base = sanitizeProductRow(row);
  const fc = getFunctionalCategoriesByProductIds([base.id]).get(String(base.id)) || [];
  const primary = (fc.find((x) => x.isPrimary)?.category) || base.category || "";
  return {
    ...base,
    category: primary || "",
    primaryFunctionalCategory: primary || "",
    functionalCategories: fc.map((x) => x.category)
  };
}

function updateAdminProduct(id, patch) {
  const productId = String(id || "").trim();
  if (!productId) return 0;
  const normalizedTechnical = normalizeTechnicalPatchValues(patch || {});
  const patchData = { ...(patch || {}), ...normalizedTechnical };

  const functionalCategoriesInput = Object.prototype.hasOwnProperty.call(patchData, "functionalCategories")
    ? patchData.functionalCategories
    : null;
  const primaryFunctionalCategoryInput = Object.prototype.hasOwnProperty.call(patchData, "primaryFunctionalCategory")
    ? patchData.primaryFunctionalCategory
    : (Object.prototype.hasOwnProperty.call(patchData, "category") ? patchData.category : null);
  const brandCategoryIdsInput = Object.prototype.hasOwnProperty.call(patchData, "brandCategoryIds")
    ? patchData.brandCategoryIds
    : null;
  const primaryBrandCategoryIdInput = Object.prototype.hasOwnProperty.call(patchData, "primaryBrandCategoryId")
    ? patchData.primaryBrandCategoryId
    : null;

  const map = {
    article: "article",
    name: "name",
    price: "price",
    priceText: "price_text",
    category: "category",
    groupName: "group_name",
    group: "group_name",
    brand: "brand",
    status: "status",
    image: "image",
    sourceUrl: "source_url",
    description: "description",
    descriptionHtml: "description_html",
    specs: "specs",
    breadcrumbs: "breadcrumbs",
    galleryJson: "gallery_json",
    attributesJson: "attributes_json",
    documentsJson: "documents_json",
    brandSubcategory: "brand_subcategory",
    systemType: "system_type",
    protocol: "protocol",
    mounting: "mounting",
    supplyVoltage: "supply_voltage",
    channels: "channels",
    nominalCurrent: "nominal_current",
    nominalPower: "nominal_power",
    sensorType: "sensor_type",
    indoorOutdoor: "indoor_outdoor",
    ipRating: "ip_rating",
    ioCount: "io_count",
    webInterface: "web_interface",
    scenarioSupport: "scenario_support",
    loadType: "load_type",
    maxLoad: "max_load",
    slug: "slug",
    metaTitle: "meta_title",
    metaDescription: "meta_description",
    isBrandFeatured: "is_brand_featured"
  };

  const setParts = [];
  const params = { id: productId, updatedAt: new Date().toISOString() };
  const normalizedPrimary = primaryFunctionalCategoryInput != null
    ? normalizeCategory(primaryFunctionalCategoryInput)
    : "";

  // Keep legacy single category column aligned to selected primary functional category.
  if (primaryFunctionalCategoryInput != null && !Object.prototype.hasOwnProperty.call(patchData, "category")) {
    patchData.category = normalizedPrimary;
  } else if (Object.prototype.hasOwnProperty.call(patchData, "category")) {
    patchData.category = normalizeCategory(patchData.category);
  }

  if (String(patchData.status || "").trim().toLowerCase() === "active") {
    const current = db.prepare(`
      SELECT id, name, brand, article, price, price_currency, image, gallery_json, attributes_json
      FROM products
      WHERE id = @id
      LIMIT 1
    `).get({ id: productId }) || {};
    const summary = getProductVariantSummary(productId);
    const currentFunctional = getFunctionalCategoriesByProductIds([productId]).get(productId) || [];
    const nextFunctional = functionalCategoriesInput != null
      ? normalizeCategoryListInput(functionalCategoriesInput)
      : currentFunctional.map((x) => x.category).filter(Boolean);
    if (!nextFunctional.length && normalizedPrimary) nextFunctional.push(normalizedPrimary);
    const currentBrandCategories = getProductBrandCategories(productId).map((x) => x.brandCategoryId);
    const nextBrandCategories = brandCategoryIdsInput != null
      ? [...new Set((brandCategoryIdsInput || []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))]
      : currentBrandCategories;
    const nextImage = Object.prototype.hasOwnProperty.call(patchData, "image") ? patchData.image : current.image;
    const nextGalleryJson = Object.prototype.hasOwnProperty.call(patchData, "galleryJson") ? patchData.galleryJson : current.gallery_json;
    const nextAttributesJson = Object.prototype.hasOwnProperty.call(patchData, "attributesJson") ? patchData.attributesJson : current.attributes_json;
    const coverState = getProductCoverState(productId, { image: nextImage, gallery_json: nextGalleryJson });

    ensureProductActivationRules({
      name: Object.prototype.hasOwnProperty.call(patchData, "name") ? patchData.name : current.name,
      brand: Object.prototype.hasOwnProperty.call(patchData, "brand") ? patchData.brand : current.brand,
      article: Object.prototype.hasOwnProperty.call(patchData, "article") ? patchData.article : current.article,
      price: Object.prototype.hasOwnProperty.call(patchData, "price") ? patchData.price : current.price,
      functionalCategories: nextFunctional,
      brandCategoryIds: nextBrandCategories,
      attributesJson: nextAttributesJson,
      variantsTotal: summary.total,
      activeVariants: summary.active,
      productId,
      hasCover: coverState.hasCover
    });
  }

  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patchData, key)) {
      setParts.push(`${col} = @${key}`);
      if (key === "price") {
        params[key] = patchData[key] === "" ? null : Number(patchData[key]);
      } else if (key === "isBrandFeatured") {
        params[key] = normalizeIntBool(patchData[key]);
      } else {
        params[key] = String(patchData[key] ?? "");
      }
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(patchData, "price") ||
    Object.prototype.hasOwnProperty.call(patchData, "priceCurrency") ||
    Object.prototype.hasOwnProperty.call(patchData, "brand")
  ) {
    const current = db
      .prepare(`SELECT price, price_currency, brand FROM products WHERE id = @id LIMIT 1`)
      .get({ id: productId }) || {};
    const nextBrand = Object.prototype.hasOwnProperty.call(params, "brand") ? params.brand : current.brand;
    const nextPrice = Object.prototype.hasOwnProperty.call(params, "price") ? params.price : current.price;
    const nextCurrency = Object.prototype.hasOwnProperty.call(params, "priceCurrency")
      ? params.priceCurrency
      : normalizeCurrency(current.price_currency || inferCurrencyByBrand(nextBrand));
    params.priceCurrency = normalizeCurrency(nextCurrency);
    params.priceRub = computePriceRub(nextPrice, params.priceCurrency);
    setParts.push("price_currency = @priceCurrency");
    setParts.push("price_rub = @priceRub");
  }
  const tx = db.transaction(() => {
    let changes = 0;
    const nextStatus = Object.prototype.hasOwnProperty.call(patchData, "status")
      ? String(patchData.status || "").trim().toLowerCase()
      : null;
    if (nextStatus === "active") {
      const summary = getProductVariantSummary(productId);
      if (hasActiveVariantConflict(nextStatus, summary.total, summary.active)) {
        throw createValidationError("\u0420\u045c\u0420\u00b5\u0420\u00bb\u0421\u040a\u0420\u00b7\u0421\u040f \u0420\u00b0\u0420\u0454\u0421\u201a\u0420\u0451\u0420\u0406\u0420\u0451\u0421\u0402\u0420\u0455\u0420\u0406\u0420\u00b0\u0421\u201a\u0421\u040a \u0421\u201a\u0420\u0455\u0420\u0406\u0420\u00b0\u0421\u0402: \u0421\u0453 \u0421\u201a\u0420\u0455\u0420\u0406\u0420\u00b0\u0421\u0402\u0420\u00b0 \u0420\u00b5\u0421\u0403\u0421\u201a\u0421\u040a \u0420\u0406\u0420\u00b0\u0421\u0402\u0420\u0451\u0420\u00b0\u0420\u0405\u0421\u201a\u0421\u2039, \u0420\u0405\u0420\u0455 \u0420\u0405\u0420\u00b5\u0421\u201a \u0420\u0405\u0420\u0451 \u0420\u0455\u0420\u0491\u0420\u0405\u0420\u0455\u0420\u0456\u0420\u0455 \u0420\u00b0\u0420\u0454\u0421\u201a\u0420\u0451\u0420\u0406\u0420\u0405\u0420\u0455\u0420\u0456\u0420\u0455 \u0420\u0406\u0420\u00b0\u0421\u0402\u0420\u0451\u0420\u00b0\u0420\u0405\u0421\u201a\u0420\u00b0.");
      }
    }

    if (setParts.length > 0) {
      setParts.push("updated_at = @updatedAt");
      const sql = `UPDATE products SET ${setParts.join(", ")} WHERE id = @id`;
      changes = db.prepare(sql).run(params).changes;
    } else {
      const exists = db.prepare(`SELECT 1 FROM products WHERE id = @id`).get({ id: productId });
      if (!exists) return 0;
    }

    const shouldSyncFunctionalCategories =
      functionalCategoriesInput != null ||
      primaryFunctionalCategoryInput != null ||
      Object.prototype.hasOwnProperty.call(patchData, "category");

    if (shouldSyncFunctionalCategories) {
      const existing = getFunctionalCategoriesByProductIds([productId]).get(productId) || [];
      const fallback = existing.map((x) => x.category);
      const categoriesToSync = functionalCategoriesInput != null ? functionalCategoriesInput : fallback;
      syncProductFunctionalCategories(productId, categoriesToSync, normalizedPrimary || patchData.category || "");
    }

    if (brandCategoryIdsInput != null || primaryBrandCategoryIdInput != null) {
      syncProductBrandCategories(productId, brandCategoryIdsInput || [], primaryBrandCategoryIdInput || null);
    }
    return changes;
  });

  const changes = tx();
  if (changes > 0 || functionalCategoriesInput != null || brandCategoryIdsInput != null || primaryBrandCategoryIdInput != null) {
    writeAuditLog("update", "product", productId, { patch: patchData });
    recalculateCatalogConflicts();
  }
  return changes;
}

function listAdminOrders({
  limit = 200,
  offset = 0,
  search = "",
  status = "",
  paymentStatus = "",
  paymentMethod = "",
  manager = "",
  deliveryMethod = "",
  dateFrom = "",
  dateTo = ""
} = {}) {
  const normalizeIsoDateStart = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
    return raw;
  };
  const normalizeIsoDateEnd = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:59.999Z`;
    return raw;
  };
  const where = [];
  const params = {
    limit: Math.max(1, Math.min(500, Number(limit || 200))),
    offset: Math.max(0, Number(offset || 0))
  };
  if (String(search || "").trim()) {
    where.push(`
      (
        o.id LIKE @search
        OR o.customer_name LIKE @search
        OR o.customer_phone LIKE @search
        OR o.customer_email LIKE @search
      )
    `);
    params.search = `%${String(search).trim()}%`;
  }
  if (String(status || "").trim()) {
    where.push("o.status = @status");
    params.status = String(status).trim();
  }
  if (String(paymentStatus || "").trim()) {
    where.push("o.payment_status = @paymentStatus");
    params.paymentStatus = String(paymentStatus).trim();
  }
  if (String(paymentMethod || "").trim()) {
    where.push("o.payment_method = @paymentMethod");
    params.paymentMethod = String(paymentMethod).trim();
  }
  if (String(manager || "").trim()) {
    where.push("o.manager LIKE @manager");
    params.manager = `%${String(manager).trim()}%`;
  }
  if (String(deliveryMethod || "").trim()) {
    where.push("o.delivery_method = @deliveryMethod");
    params.deliveryMethod = String(deliveryMethod).trim();
  }
  if (String(dateFrom || "").trim()) {
    where.push("o.created_at >= @dateFrom");
    params.dateFrom = normalizeIsoDateStart(dateFrom);
  }
  if (String(dateTo || "").trim()) {
    where.push("o.created_at <= @dateTo");
    params.dateTo = normalizeIsoDateEnd(dateTo);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(`
      SELECT
        o.id,
        o.created_at AS createdAt,
        o.updated_at AS updatedAt,
        o.customer_name AS customerName,
        o.customer_phone AS customerPhone,
        o.customer_email AS customerEmail,
        o.customer_address AS customerAddress,
        o.payment_method AS paymentMethod,
        o.payment_status AS paymentStatus,
        o.delivery_method AS deliveryMethod,
        o.manager,
        o.total,
        o.status,
        COUNT(oi.id) AS itemCount
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      ${whereSql}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT @limit OFFSET @offset
    `)
    .all(params);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`).get(params).c;
  return { rows, total };
}

function getAdminOrderById(orderId) {
  const id = String(orderId || "").trim();
  if (!id) return null;
  const order = db
    .prepare(`
      SELECT
        id,
        created_at AS createdAt,
        updated_at AS updatedAt,
        customer_name AS customerName,
        customer_phone AS customerPhone,
        customer_email AS customerEmail,
        customer_address AS customerAddress,
        payment_method AS paymentMethod,
        payment_status AS paymentStatus,
        delivery_method AS deliveryMethod,
        delivery_comment AS deliveryComment,
        manager,
        manager_comment AS managerComment,
        total,
        status,
        status_history_json AS statusHistoryJson,
        order_documents_json AS orderDocumentsJson
      FROM orders
      WHERE id = @id
      LIMIT 1
    `)
    .get({ id });
  if (!order) return null;

  const items = db
    .prepare(`
      SELECT
        id, product_id AS productId, name, article, price, qty, image
      FROM order_items
      WHERE order_id = @id
      ORDER BY id ASC
    `)
    .all({ id });

  let statusHistory = [];
  try {
    const parsed = JSON.parse(order.statusHistoryJson || "[]");
    statusHistory = Array.isArray(parsed) ? parsed : [];
  } catch {
    statusHistory = [];
  }
  let orderDocuments = [];
  try {
    const parsed = JSON.parse(order.orderDocumentsJson || "[]");
    orderDocuments = normalizeOrderDocumentsInput(parsed);
  } catch {
    orderDocuments = [];
  }
  return {
    ...order,
    items,
    statusHistory,
    orderDocuments
  };
}

function updateAdminOrder(orderId, patch = {}) {
  const id = String(orderId || "").trim();
  if (!id) return 0;
  const current = getAdminOrderById(id);
  if (!current) return 0;

  const map = {
    status: "status",
    paymentStatus: "payment_status",
    paymentMethod: "payment_method",
    deliveryMethod: "delivery_method",
    manager: "manager",
    managerComment: "manager_comment",
    deliveryComment: "delivery_comment",
    orderDocuments: "order_documents_json"
  };
  const setParts = [];
  const params = { id, updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = @${key}`);
    if (key === "orderDocuments") {
      params[key] = JSON.stringify(normalizeOrderDocumentsInput(patch[key]));
    } else {
      params[key] = String(patch[key] ?? "").trim();
    }
  }
  if (!setParts.length) return 0;

  const history = Array.isArray(current.statusHistory) ? [...current.statusHistory] : [];
  const nextStatus = Object.prototype.hasOwnProperty.call(patch, "status")
    ? String(patch.status || "").trim()
    : current.status;
  const nextPaymentStatus = Object.prototype.hasOwnProperty.call(patch, "paymentStatus")
    ? String(patch.paymentStatus || "").trim()
    : current.paymentStatus;
  if (nextStatus !== current.status || nextPaymentStatus !== current.paymentStatus) {
    history.push({
      at: params.updatedAt,
      by: "admin",
      status: nextStatus,
      paymentStatus: nextPaymentStatus
    });
    setParts.push("status_history_json = @statusHistoryJson");
    params.statusHistoryJson = JSON.stringify(history);
  }

  setParts.push("updated_at = @updatedAt");
  const changes = db.prepare(`UPDATE orders SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
  if (changes > 0) {
    writeAuditLog("update", "order", id, { patch });
  }
  return changes;
}

function listPublicOrdersByLookup({ query = "", limit = 20 } = {}) {
  const raw = String(query || "").trim();
  if (raw.length < 4) return { rows: [], total: 0 };

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 20)));
  const like = `%${raw}%`;
  const whereParts = [
    "o.id = @exactId",
    "o.customer_phone LIKE @like",
    "o.customer_email LIKE @like"
  ];
  const params = { exactId: raw, like, limit: safeLimit };

  const ids = db
    .prepare(`
      SELECT o.id
      FROM orders o
      WHERE ${whereParts.join(" OR ")}
      ORDER BY o.created_at DESC
      LIMIT @limit
    `)
    .all(params)
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);

  const rows = ids
    .map((id) => getAdminOrderById(id))
    .filter(Boolean)
    .map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      deliveryMethod: order.deliveryMethod,
      total: order.total,
      status: order.status,
      items: Array.isArray(order.items) ? order.items : [],
      statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [],
      orderDocuments: Array.isArray(order.orderDocuments) ? order.orderDocuments : []
    }));

  return { rows, total: rows.length };
}

function listAdminAuditLog({ limit = 200, offset = 0, entityType = "", action = "" } = {}) {
  const where = [];
  const params = {
    limit: Math.max(1, Math.min(500, Number(limit || 200))),
    offset: Math.max(0, Number(offset || 0))
  };
  if (String(entityType || "").trim()) {
    where.push("entity_type = @entityType");
    params.entityType = String(entityType).trim();
  }
  if (String(action || "").trim()) {
    where.push("action = @action");
    params.action = String(action).trim();
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(`
      SELECT
        id,
        created_at AS createdAt,
        actor,
        action,
        entity_type AS entityType,
        entity_id AS entityId,
        details_json AS detailsJson
      FROM audit_log
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT @limit OFFSET @offset
    `)
    .all(params)
    .map((row) => {
      let details = {};
      try {
        details = JSON.parse(row.detailsJson || "{}");
      } catch {
        details = {};
      }
      return {
        id: row.id,
        createdAt: row.createdAt,
        actor: row.actor,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        details
      };
    });

  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`).get(params).c;
  return { rows, total };
}

function listAdminFilters() {
  const rows = listProducts().filter((row) => !isServiceLikeRow(row));
  const brandMap = new Map();
  const categoryMap = new Map();
  const groupMap = new Map();
  const categoryRows = db.prepare(`
    SELECT pfc.product_id AS productId, pfc.category_name AS categoryName
    FROM product_function_categories pfc
    JOIN products p ON p.id = pfc.product_id
    WHERE LOWER(TRIM(COALESCE(p.category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')
      AND LOWER(TRIM(COALESCE(p.brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')
      AND LOWER(TRIM(COALESCE(p.id, ''))) <> LOWER('service-networks')
  `).all();

  for (const row of rows) {
    const brand = normalizeBrand(row.brand);
    const group = normalizeText(row.group || "");
    if (brand) brandMap.set(brand, (brandMap.get(brand) || 0) + 1);
    if (group) groupMap.set(group, (groupMap.get(group) || 0) + 1);
  }
  for (const row of categoryRows) {
    const category = normalizeCategory(row.categoryName);
    if (!category) continue;
    categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
  }

  const asSorted = (map, key) =>
    [...map.entries()]
      .map(([value, count]) => ({ [key]: value, count }))
      .sort((a, b) => (b.count - a.count) || String(a[key]).localeCompare(String(b[key]), "ru"));

  return {
    brands: asSorted(brandMap, "brand"),
    categories: asSorted(categoryMap, "category"),
    groups: asSorted(groupMap, "group_name")
  };
}

function listAdminProductsAdvanced(filters = {}) {
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 50)));
  const offset = Math.max(0, Number(filters.offset || 0));

  const where = [
    "LOWER(TRIM(COALESCE(p.category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')",
    "LOWER(TRIM(COALESCE(p.brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')",
    "LOWER(TRIM(COALESCE(p.id, ''))) <> LOWER('service-networks')"
  ];
  const params = { limit, offset };
  if (filters.q) {
    where.push("(p.name LIKE @q OR p.article LIKE @q OR p.id LIKE @q)");
    params.q = `%${String(filters.q).trim()}%`;
  }
  if (filters.brand) {
    where.push("LOWER(TRIM(p.brand)) = LOWER(TRIM(@brand))");
    params.brand = normalizeBrand(String(filters.brand).trim());
  }
  if (filters.category) {
    where.push(`
      EXISTS (
        SELECT 1
        FROM product_function_categories pfc
        WHERE pfc.product_id = p.id
          AND LOWER(TRIM(pfc.category_name)) = LOWER(TRIM(@category))
      )
    `);
    params.category = normalizeCategory(String(filters.category).trim());
  }
  if (filters.brandCategoryId) {
    where.push(`
      EXISTS (
        SELECT 1
        FROM product_brand_categories pbc
        WHERE pbc.product_id = p.id
          AND pbc.brand_category_id = @brandCategoryId
      )
    `);
    params.brandCategoryId = Number(filters.brandCategoryId);
  }
  if (filters.group) {
    where.push("LOWER(TRIM(p.group_name)) = LOWER(TRIM(@group))");
    params.group = normalizeText(String(filters.group).trim());
  }
  if (filters.status) {
    where.push("p.status = @status");
    params.status = String(filters.status).trim();
  }
  if (filters.protocol) {
    where.push("p.protocol LIKE @protocol");
    params.protocol = `%${String(filters.protocol).trim()}%`;
  }
  if (filters.systemType) {
    where.push("p.system_type = @systemType");
    params.systemType = String(filters.systemType).trim();
  }
  if (filters.mounting) {
    where.push("p.mounting LIKE @mounting");
    params.mounting = `%${String(filters.mounting).trim()}%`;
  }
  if (filters.hasDocs === "1") {
    where.push("((p.documents_json IS NOT NULL AND p.documents_json <> '[]') OR EXISTS (SELECT 1 FROM product_documents d WHERE d.product_id = p.id))");
  } else if (filters.hasDocs === "0") {
    where.push("((p.documents_json IS NULL OR p.documents_json = '[]') AND NOT EXISTS (SELECT 1 FROM product_documents d WHERE d.product_id = p.id))");
  }
  if (filters.hasVariants === "1") {
    where.push("EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)");
  } else if (filters.hasVariants === "0") {
    where.push("NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)");
  }
  if (filters.hasPhotos === "1") {
    where.push(`
      (
        TRIM(COALESCE(p.image, '')) <> ''
        OR (p.gallery_json IS NOT NULL AND p.gallery_json <> '[]')
        OR EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
      )
    `);
  } else if (filters.hasPhotos === "0") {
    where.push(`
      (
        TRIM(COALESCE(p.image, '')) = ''
        AND (p.gallery_json IS NULL OR p.gallery_json = '[]')
        AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
      )
    `);
  }
  if (filters.is_extra === "1" || filters.is_extra === "0") {
    where.push("COALESCE(p.is_extra, 0) = @isExtra");
    params.isExtra = Number(filters.is_extra);
  }
  if (filters.minPrice !== undefined && filters.minPrice !== "") {
    where.push("COALESCE(p.price_rub, p.price, 0) >= @minPrice");
    params.minPrice = Number(filters.minPrice);
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== "") {
    where.push("COALESCE(p.price_rub, p.price, 0) <= @maxPrice");
    params.maxPrice = Number(filters.maxPrice);
  }
  if (filters.updatedFrom) {
    where.push("p.updated_at >= @updatedFrom");
    params.updatedFrom = String(filters.updatedFrom);
  }
  if (filters.updatedTo) {
    where.push("p.updated_at <= @updatedTo");
    params.updatedTo = String(filters.updatedTo);
  }
  if (filters.hasConflict === "1") {
    where.push("COALESCE(p.is_conflict, 0) = 1");
  } else if (filters.hasConflict === "0") {
    where.push("COALESCE(p.is_conflict, 0) = 0");
  }
  if (filters.variantConflict === "1") {
    where.push(`
      LOWER(TRIM(COALESCE(p.status, ''))) = 'active'
      AND EXISTS (
        SELECT 1
        FROM product_variants v
        WHERE v.product_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM product_variants v
        WHERE v.product_id = p.id
          AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
      )
    `);
  } else if (filters.variantConflict === "0") {
    where.push(`
      NOT (
        LOWER(TRIM(COALESCE(p.status, ''))) = 'active'
        AND EXISTS (
          SELECT 1
          FROM product_variants v
          WHERE v.product_id = p.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM product_variants v
          WHERE v.product_id = p.id
            AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
        )
      )
    `);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseSql = `
    FROM products p
    ${whereSql}
  `;

  const total = db.prepare(`SELECT COUNT(*) AS c ${baseSql}`).get(params).c;
  const products = db
    .prepare(`
      SELECT
        p.id,
        p.article,
        p.name,
        p.brand,
        p.category,
        p.group_name AS "group",
        p.status,
        p.price,
        p.image,
        p.updated_at AS updatedAt,
        COALESCE(p.is_extra, 0) AS is_extra,
        COALESCE(p.is_brand_featured, 0) AS isBrandFeatured,
        COALESCE(p.is_conflict, 0) AS isConflict,
        COALESCE(p.conflict_note, '') AS conflictNote,
        (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
        (
          SELECT COUNT(*)
          FROM product_variants v
          WHERE v.product_id = p.id
            AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
        ) AS activeVariants,
        (
          (SELECT COUNT(*) FROM product_documents d WHERE d.product_id = p.id)
          + CASE WHEN p.documents_json IS NOT NULL AND p.documents_json <> '[]' THEN 1 ELSE 0 END
        ) AS documentsCount
      ${baseSql}
      ORDER BY p.updated_at DESC, p.name COLLATE NOCASE ASC
      LIMIT @limit OFFSET @offset
    `)
    .all(params)
    .map(sanitizeProductRow)
    .filter((row) => !isServiceLikeRow(row));

  const fmap = getFunctionalCategoriesByProductIds(products.map((r) => r.id));
  const mapped = products.map((row) => {
    const fc = fmap.get(String(row.id)) || [];
    const primary = (fc.find((x) => x.isPrimary)?.category) || row.category || "";
    const variants = Number(row.variants || 0);
    const activeVariants = Number(row.activeVariants || 0);
    return {
      ...row,
      variants,
      activeVariants,
      hasVariantConflict: hasActiveVariantConflict(row.status, variants, activeVariants),
      category: primary || "",
      primaryFunctionalCategory: primary || "",
      functionalCategories: fc.map((x) => x.category)
    };
  });

  return {
    products: mapped,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

function getAdminProductDetails(id) {
  const product = getAdminProductById(id);
  if (!product) return null;

  const variants = db
    .prepare(
      `
      SELECT
        id, product_id AS productId, sku, option_summary AS optionSummary, price, qty, status,
        media_mode AS mediaMode, created_at AS createdAt, updated_at AS updatedAt
      FROM product_variants
      WHERE product_id = @id
      ORDER BY id ASC
    `
    )
    .all({ id });

  const media = db
    .prepare(
      `
      SELECT
        id, product_id AS productId, variant_id AS variantId, url, is_cover AS isCover,
        sort_order AS sortOrder, label, created_at AS createdAt
      FROM product_media
      WHERE product_id = @id
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all({ id });

  const documents = db
    .prepare(
      `
      SELECT
        id, product_id AS productId, variant_id AS variantId, title, type, lang, url, sort_order AS sortOrder
      FROM product_documents
      WHERE product_id = @id
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all({ id });

  const variantSummary = getProductVariantSummary(id);
  const productBrandCategories = getProductBrandCategories(id);
  return {
    ...product,
    variants,
    media,
    documents,
    brandCategoryIds: productBrandCategories.map((x) => x.brandCategoryId),
    primaryBrandCategoryId: (productBrandCategories.find((x) => x.isPrimary)?.brandCategoryId) || null,
    variantsCount: variantSummary.total,
    activeVariants: variantSummary.active,
    hasVariantConflict: hasActiveVariantConflict(product.status, variantSummary.total, variantSummary.active)
  };
}

function createAdminProduct(payload = {}) {
  const now = new Date().toISOString();
  const productId = String(payload.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).trim();
  const name = String(payload.name || "").trim();
  if (!name) {
    throw createValidationError("Product name is required.");
  }

  const article = String(payload.article || "").trim();
  const brand = normalizeBrand(payload.brand || "");
  const primaryFunctionalCategory = normalizeCategory(
    payload.primaryFunctionalCategory || payload.category || ""
  );
  const functionalCategories = normalizeCategoryListInput(payload.functionalCategories);
  const groupName = normalizeText(payload.group || payload.groupName || "");
  const brandCategoryIds = Array.isArray(payload.brandCategoryIds) ? payload.brandCategoryIds : [];
  const primaryBrandCategoryId = payload.primaryBrandCategoryId ?? null;
  const status = String(payload.status || "draft").trim().toLowerCase() || "draft";
  const price = payload.price === "" || payload.price == null ? null : Number(payload.price);
  const priceCurrency = normalizeCurrency(payload.priceCurrency || inferCurrencyByBrand(brand));
  const priceRub = computePriceRub(price, priceCurrency);
  const technical = normalizeTechnicalPatchValues(payload);

  if (status === "active") {
    const hasCover =
      String(payload.image || "").trim() !== "" ||
      hasNonEmptyJsonList(payload.galleryJson);
    ensureProductActivationRules({
      name,
      brand,
      article,
      price,
      functionalCategories: functionalCategories.length ? functionalCategories : [primaryFunctionalCategory].filter(Boolean),
      brandCategoryIds,
      attributesJson: payload.attributesJson,
      variantsTotal: 0,
      activeVariants: 0,
      productId: null,
      hasCover
    });
  }

  db.prepare(
    `
    INSERT INTO products (
      id,
      article,
      name,
      price,
      price_currency,
      price_rub,
      price_text,
      category,
      group_name,
      brand,
      image,
      source_url,
      description,
      description_html,
      specs,
      breadcrumbs,
      gallery_json,
      attributes_json,
      documents_json,
      brand_subcategory,
      system_type,
      protocol,
      mounting,
      supply_voltage,
      channels,
      nominal_current,
      nominal_power,
      slug,
      meta_title,
      meta_description,
      status,
      is_brand_featured,
      updated_at
    ) VALUES (
      @id,
      @article,
      @name,
      @price,
      @priceCurrency,
      @priceRub,
      @priceText,
      @category,
      @groupName,
      @brand,
      @image,
      @sourceUrl,
      @description,
      @descriptionHtml,
      @specs,
      @breadcrumbs,
      @galleryJson,
      @attributesJson,
      @documentsJson,
      @brandSubcategory,
      @systemType,
      @protocol,
      @mounting,
      @supplyVoltage,
      @channels,
      @nominalCurrent,
      @nominalPower,
      @slug,
      @metaTitle,
      @metaDescription,
      @status,
      @isBrandFeatured,
      @updatedAt
    )
  `
  ).run({
    id: productId,
    article,
    name,
    price,
    priceCurrency,
    priceRub,
    priceText: String(payload.priceText || ""),
    category: primaryFunctionalCategory,
    groupName,
    brand,
    image: String(payload.image || ""),
    sourceUrl: String(payload.sourceUrl || ""),
    description: String(payload.description || ""),
    descriptionHtml: String(payload.descriptionHtml || ""),
    specs: String(payload.specs || ""),
    breadcrumbs: String(payload.breadcrumbs || ""),
    galleryJson: String(payload.galleryJson || "[]"),
    attributesJson: String(payload.attributesJson || "[]"),
    documentsJson: String(payload.documentsJson || "[]"),
    brandSubcategory: String(payload.brandSubcategory || ""),
    systemType: String(technical.systemType || ""),
    protocol: String(technical.protocol || ""),
    mounting: String(technical.mounting || ""),
    supplyVoltage: String(technical.supplyVoltage || ""),
    channels: String(technical.channels || ""),
    nominalCurrent: String(technical.nominalCurrent || ""),
    nominalPower: String(technical.nominalPower || ""),
    slug: String(payload.slug || ""),
    metaTitle: String(payload.metaTitle || ""),
    metaDescription: String(payload.metaDescription || ""),
    status,
    isBrandFeatured: normalizeIntBool(payload.isBrandFeatured),
    updatedAt: now
  });

  syncProductFunctionalCategories(productId, functionalCategories, primaryFunctionalCategory);
  syncProductBrandCategories(productId, brandCategoryIds, primaryBrandCategoryId);
  const created = getAdminProductDetails(productId);
  writeAuditLog("create", "product", productId, {
    name: created?.name || name,
    status: created?.status || status
  });
  recalculateCatalogConflicts();
  return created;
}

function upsertAdminProduct(id, payload) {
  const changes = updateAdminProduct(id, payload);
  return changes > 0;
}

function applyBulkAdminProducts({ action, productIds, data = {} }) {
  const ids = Array.isArray(productIds) ? productIds.map(String).filter(Boolean) : [];
  if (!ids.length) return { success: false, message: "?? ??????? ??????" };
  const placeholders = ids.map((_, i) => `@id${i}`).join(", ");
  const params = Object.fromEntries(ids.map((v, i) => [`id${i}`, v]));
  let result = 0;

  if (action === "delete") {
    result = db.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).run(params).changes;
    recalculateCatalogConflicts();
    return { success: true, message: `??????? ???????: ${result}` };
  }
  if (action === "updateBrand") {
    const brand = String(data.brand || "").trim();
    result = db
      .prepare(`UPDATE products SET brand = @brand, updated_at = @updatedAt WHERE id IN (${placeholders})`)
      .run({ ...params, brand, updatedAt: new Date().toISOString() }).changes;
    recalculateCatalogConflicts();
    return { success: true, message: `????? ????????: ${result}` };
  }
  if (action === "updateCategory") {
    const group = String(data.group || "").trim();
    result = db
      .prepare(`UPDATE products SET group_name = @group, updated_at = @updatedAt WHERE id IN (${placeholders})`)
      .run({ ...params, group, updatedAt: new Date().toISOString() }).changes;
    recalculateCatalogConflicts();
    return { success: true, message: `???????????? ?????????: ${result}` };
  }
  if (action === "assignFunctionalCategory") {
    const category = normalizeCategory(String(data.category || "").trim());
    if (!category) return { success: false, message: "??????? ?????????????? ?????????" };
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO product_function_categories (
        product_id, category_name, is_primary, sort_order, created_at, updated_at
      ) VALUES (
        @productId, @categoryName, @isPrimary, @sortOrder, @createdAt, @updatedAt
      )
    `);
    const tx = db.transaction(() => {
      let changed = 0;
      for (const productId of ids) {
        const existing = getFunctionalCategoriesByProductIds([productId]).get(productId) || [];
        const hasPrimary = existing.some((x) => x.isPrimary);
        changed += insert.run({
          productId,
          categoryName: category,
          isPrimary: hasPrimary ? 0 : 1,
          sortOrder: existing.length,
          createdAt: now,
          updatedAt: now
        }).changes;
      }
      return changed;
    });
    result = tx();
    recalculateCatalogConflicts();
    return { success: true, message: `????????? ?????????: ${result}` };
  }
  if (action === "removeFunctionalCategory") {
    const category = normalizeCategory(String(data.category || "").trim());
    if (!category) return { success: false, message: "??????? ?????????????? ?????????" };
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      let changed = 0;
      for (const productId of ids) {
        changed += db.prepare(`
          DELETE FROM product_function_categories
          WHERE product_id = @productId
            AND LOWER(TRIM(category_name)) = LOWER(TRIM(@categoryName))
        `).run({ productId, categoryName: category }).changes;
        const left = getFunctionalCategoriesByProductIds([productId]).get(productId) || [];
        if (left.length) {
          const primary = left.find((x) => x.isPrimary)?.category || left[0].category;
          db.prepare(`UPDATE product_function_categories SET is_primary = CASE WHEN category_name = @primary THEN 1 ELSE 0 END, updated_at = @updatedAt WHERE product_id = @productId`)
            .run({ productId, primary, updatedAt: now });
          db.prepare(`UPDATE products SET category = @category, updated_at = @updatedAt WHERE id = @id`)
            .run({ id: productId, category: primary, updatedAt: now });
        }
      }
      return changed;
    });
    result = tx();
    recalculateCatalogConflicts();
    return { success: true, message: `????????? ?????: ${result}` };
  }
  if (action === "adjustPrice") {
    const mode = String(data.mode || "set").trim();
    const value = Number(data.value);
    if (!Number.isFinite(value)) return { success: false, message: "??????? ?????????? ????????" };
    const rows = db.prepare(`SELECT id, price, price_currency AS priceCurrency FROM products WHERE id IN (${placeholders})`).all(params);
    const update = db.prepare(`UPDATE products SET price = @price, price_rub = @priceRub, updated_at = @updatedAt WHERE id = @id`);
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      let changed = 0;
      for (const row of rows) {
        const current = Number(row.price || 0);
        let next = current;
        if (mode === "set") next = value;
        else if (mode === "delta") next = current + value;
        else if (mode === "percent") next = current + (current * value) / 100;
        next = Math.max(0, Math.round(next * 100) / 100);
        const currency = normalizeCurrency(row.priceCurrency || "RUB");
        const priceRub = computePriceRub(next, currency);
        changed += update.run({ id: row.id, price: next, priceRub, updatedAt: now }).changes;
      }
      return changed;
    });
    result = tx();
    recalculateCatalogConflicts();
    return { success: true, message: `???? ?????????: ${result}` };
  }
  if (action === "archive") {
    result = db
      .prepare(`UPDATE products SET status = 'archived', updated_at = @updatedAt WHERE id IN (${placeholders})`)
      .run({ ...params, updatedAt: new Date().toISOString() }).changes;
    recalculateCatalogConflicts();
    return { success: true, message: `????????????: ${result}` };
  }
  if (action === "updateStatus") {
    const status = String(data.status || "draft").trim();
    if (status.toLowerCase() === "active") {
      const candidates = db.prepare(`
        SELECT
          p.id,
          p.name,
          p.brand,
          p.article,
          p.price,
          p.image,
          p.gallery_json AS galleryJson,
          p.attributes_json AS attributesJson,
          (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
          (
            SELECT COUNT(*)
            FROM product_variants v
            WHERE v.product_id = p.id
              AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
          ) AS activeVariants
        FROM products p
        WHERE p.id IN (${placeholders})
      `).all(params);
      const failed = [];
      for (const row of candidates) {
        const functional = (getFunctionalCategoriesByProductIds([row.id]).get(row.id) || []).map((x) => x.category);
        const brandCats = getProductBrandCategories(row.id).map((x) => x.brandCategoryId);
        const coverState = getProductCoverState(row.id, { image: row.image, gallery_json: row.galleryJson });
        try {
          ensureProductActivationRules({
            name: row.name,
            brand: row.brand,
            article: row.article,
            price: row.price,
            functionalCategories: functional,
            brandCategoryIds: brandCats,
            attributesJson: row.attributesJson,
            variantsTotal: row.variants,
            activeVariants: row.activeVariants,
            productId: row.id,
            hasCover: coverState.hasCover
          });
        } catch (error) {
          failed.push(row.id);
        }
      }
      if (failed.length) {
        return { success: false, message: `?????? ????????????: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? ' ...' : ''}` };
      }
    }
    result = db
      .prepare(`UPDATE products SET status = @status, updated_at = @updatedAt WHERE id IN (${placeholders})`)
      .run({ ...params, status, updatedAt: new Date().toISOString() }).changes;
    recalculateCatalogConflicts();
    return { success: true, message: `?????? ????????: ${result}` };
  }
  if (action === "deactivateVariantConflict") {
    const now = new Date().toISOString();
    result = db
      .prepare(`
        UPDATE products
        SET status = 'hidden', updated_at = @updatedAt
        WHERE id IN (${placeholders})
          AND LOWER(TRIM(COALESCE(status, ''))) = 'active'
          AND EXISTS (
            SELECT 1
            FROM product_variants v
            WHERE v.product_id = products.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM product_variants v
            WHERE v.product_id = products.id
              AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
          )
      `)
      .run({ ...params, updatedAt: now }).changes;
    recalculateCatalogConflicts();
    return { success: true, message: `?????? ??????????? ???????: ${result}` };
  }
  if (action === "export") {
    const rows = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(params);
    return { success: true, message: `???????: ${rows.length}`, rows };
  }

  return { success: false, message: "??????????? ????????" };
}

function listProductVariantsAdmin(productId) {
  return db
    .prepare(
      `
      SELECT
        id, product_id AS productId, sku, option_summary AS optionSummary, price, qty, status,
        media_mode AS mediaMode, created_at AS createdAt, updated_at AS updatedAt
      FROM product_variants
      WHERE product_id = @productId
      ORDER BY id ASC
    `
    )
    .all({ productId: String(productId) });
}

function createProductVariantAdmin(productId, payload = {}) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
      INSERT INTO product_variants (
        product_id, sku, option_summary, price, qty, status, media_mode, created_at, updated_at
      ) VALUES (
        @productId, @sku, @optionSummary, @price, @qty, @status, @mediaMode, @createdAt, @updatedAt
      )
    `
    )
    .run({
      productId: String(productId),
      sku: String(payload.sku || "").trim(),
      optionSummary: String(payload.optionSummary || "").trim(),
      price: payload.price === "" || payload.price == null ? null : Number(payload.price),
      qty: Number(payload.qty || 0),
      status: String(payload.status || "draft"),
      mediaMode: String(payload.mediaMode || "inherit"),
      createdAt: now,
      updatedAt: now
    });
  const variant = db
    .prepare(`SELECT * FROM product_variants WHERE id = @id`)
    .get({ id: info.lastInsertRowid });
  writeAuditLog("create", "product_variant", variant?.id, {
    productId: String(productId),
    sku: variant?.sku || ""
  });
  return variant;
}

function updateProductVariantAdmin(variantId, patch = {}) {
  const map = {
    sku: "sku",
    optionSummary: "option_summary",
    price: "price",
    qty: "qty",
    status: "status",
    mediaMode: "media_mode"
  };
  const setParts = [];
  const params = { id: Number(variantId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      setParts.push(`${col} = @${key}`);
      if (key === "price") params[key] = patch[key] === "" || patch[key] == null ? null : Number(patch[key]);
      else if (key === "qty") params[key] = Number(patch[key] || 0);
      else params[key] = String(patch[key] ?? "");
    }
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = @updatedAt");
  const changes = db.prepare(`UPDATE product_variants SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
  if (changes > 0) {
    writeAuditLog("update", "product_variant", Number(variantId), { patch });
  }
  return changes;
}

function deleteProductVariantAdmin(variantId) {
  const variant = db.prepare(`SELECT id, product_id AS productId, sku FROM product_variants WHERE id = @id`).get({ id: Number(variantId) });
  const changes = db.prepare(`DELETE FROM product_variants WHERE id = @id`).run({ id: Number(variantId) }).changes;
  if (changes > 0) {
    writeAuditLog("delete", "product_variant", Number(variantId), {
      productId: variant?.productId || "",
      sku: variant?.sku || ""
    });
  }
  return changes;
}

function listProductMediaAdmin(productId) {
  return db
    .prepare(
      `
      SELECT
        id,
        product_id AS productId,
        variant_id AS variantId,
        url,
        is_cover AS isCover,
        sort_order AS sortOrder,
        label,
        created_at AS createdAt
      FROM product_media
      WHERE product_id = @productId
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all({ productId: String(productId) })
    .map((row) => ({
      ...row,
      isCover: Number(row.isCover) === 1
    }));
}

function saveProductMediaAdmin(productId, media = []) {
  const id = String(productId || "").trim();
  if (!id) return [];
  const now = new Date().toISOString();

  const tx = db.transaction((items) => {
    db.prepare(`DELETE FROM product_media WHERE product_id = @productId`).run({ productId: id });
    const insert = db.prepare(`
      INSERT INTO product_media (
        product_id, variant_id, url, is_cover, sort_order, label, created_at
      ) VALUES (
        @productId, @variantId, @url, @isCover, @sortOrder, @label, @createdAt
      )
    `);

    items.forEach((item, index) => {
      const url = String(item?.url || "").trim();
      if (!url) return;
      insert.run({
        productId: id,
        variantId: item?.variantId == null || item?.variantId === "" ? null : Number(item.variantId),
        url,
        isCover: item?.isCover ? 1 : 0,
        sortOrder: Number(item?.sortOrder ?? index),
        label: String(item?.label || "").trim(),
        createdAt: now
      });
    });
  });
  tx(Array.isArray(media) ? media : []);
  const saved = listProductMediaAdmin(id);
  writeAuditLog("save_media", "product", id, { total: saved.length });
  return saved;
}

function listProductDocumentsAdmin(productId) {
  return db
    .prepare(
      `
      SELECT
        id,
        product_id AS productId,
        variant_id AS variantId,
        title,
        type,
        lang,
        url,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM product_documents
      WHERE product_id = @productId
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all({ productId: String(productId) });
}

function saveProductDocumentsAdmin(productId, documents = []) {
  const id = String(productId || "").trim();
  if (!id) return [];
  const now = new Date().toISOString();

  const tx = db.transaction((items) => {
    db.prepare(`DELETE FROM product_documents WHERE product_id = @productId`).run({ productId: id });
    const insert = db.prepare(`
      INSERT INTO product_documents (
        product_id, variant_id, title, type, lang, url, sort_order, created_at
      ) VALUES (
        @productId, @variantId, @title, @type, @lang, @url, @sortOrder, @createdAt
      )
    `);

    items.forEach((item, index) => {
      const url = String(item?.url || "").trim();
      if (!url) return;
      insert.run({
        productId: id,
        variantId: item?.variantId == null || item?.variantId === "" ? null : Number(item.variantId),
        title: String(item?.title || "").trim() || "Document",
        type: String(item?.type || "").trim(),
        lang: String(item?.lang || "").trim(),
        url,
        sortOrder: Number(item?.sortOrder ?? index),
        createdAt: now
      });
    });
  });
  tx(Array.isArray(documents) ? documents : []);
  const saved = listProductDocumentsAdmin(id);
  writeAuditLog("save_documents", "product", id, { total: saved.length });
  return saved;
}

function listProductTabsAdmin(productId, variantId = null) {
  const tabs = db
    .prepare(
      `
      SELECT
        id,
        product_id AS productId,
        variant_id AS variantId,
        title,
        code,
        enabled,
        sort_order AS sortOrder,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM product_tabs
      WHERE product_id = @productId
        AND (
          (@variantId IS NULL AND variant_id IS NULL)
          OR variant_id = @variantId
        )
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all({
      productId: String(productId),
      variantId: variantId == null ? null : Number(variantId)
    });

  if (!tabs.length) return [];

  const blocks = db
    .prepare(
      `
      SELECT
        id,
        tab_id AS tabId,
        block_type AS blockType,
        content_json AS contentJson,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM product_tab_blocks
      WHERE tab_id IN (${tabs.map((t) => Number(t.id)).join(",")})
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all();

  const blocksByTab = new Map();
  for (const block of blocks) {
    const arr = blocksByTab.get(block.tabId) || [];
    let parsed = {};
    try {
      parsed = JSON.parse(block.contentJson || "{}");
    } catch {
      parsed = {};
    }
    arr.push({
      id: block.id,
      tabId: block.tabId,
      blockType: block.blockType,
      content: parsed,
      sortOrder: block.sortOrder,
      createdAt: block.createdAt
    });
    blocksByTab.set(block.tabId, arr);
  }

  return tabs.map((tab) => ({
    ...tab,
    enabled: Number(tab.enabled) === 1,
    blocks: blocksByTab.get(tab.id) || []
  }));
}

function createProductTabAdmin(productId, payload = {}) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
      INSERT INTO product_tabs (
        product_id, variant_id, title, code, enabled, sort_order, created_at, updated_at
      ) VALUES (
        @productId, @variantId, @title, @code, @enabled, @sortOrder, @createdAt, @updatedAt
      )
    `
    )
    .run({
      productId: String(productId),
      variantId: payload.variantId == null ? null : Number(payload.variantId),
      title: String(payload.title || "\u0420\u045c\u0420\u0455\u0420\u0406\u0420\u00b0\u0421\u040f \u0420\u0406\u0420\u0454\u0420\u00bb\u0420\u00b0\u0420\u0491\u0420\u0454\u0420\u00b0"),
      code: String(payload.code || "new_tab"),
      enabled: payload.enabled === false ? 0 : 1,
      sortOrder: Number(payload.sortOrder || 0),
      createdAt: now,
      updatedAt: now
    });

  return db
    .prepare(
      `
      SELECT
        id, product_id AS productId, variant_id AS variantId, title, code, enabled, sort_order AS sortOrder
      FROM product_tabs
      WHERE id = @id
      LIMIT 1
    `
    )
    .get({ id: info.lastInsertRowid });
}

function updateProductTabAdmin(tabId, patch = {}) {
  const map = {
    title: "title",
    code: "code",
    enabled: "enabled",
    sortOrder: "sort_order"
  };
  const setParts = [];
  const params = { id: Number(tabId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      setParts.push(`${col} = @${key}`);
      if (key === "enabled") params[key] = patch[key] ? 1 : 0;
      else if (key === "sortOrder") params[key] = Number(patch[key] || 0);
      else params[key] = String(patch[key] ?? "");
    }
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = @updatedAt");
  return db.prepare(`UPDATE product_tabs SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
}

function deleteProductTabAdmin(tabId) {
  return db.prepare(`DELETE FROM product_tabs WHERE id = @id`).run({ id: Number(tabId) }).changes;
}

function saveTabBlocksAdmin(tabId, blocks = []) {
  const id = Number(tabId);
  const now = new Date().toISOString();
  const tx = db.transaction((items) => {
    db.prepare(`DELETE FROM product_tab_blocks WHERE tab_id = @tabId`).run({ tabId: id });
    const insert = db.prepare(
      `
      INSERT INTO product_tab_blocks (
        tab_id, block_type, content_json, sort_order, created_at
      ) VALUES (
        @tabId, @blockType, @contentJson, @sortOrder, @createdAt
      )
    `
    );
    for (let i = 0; i < items.length; i += 1) {
      const block = items[i] || {};
      insert.run({
        tabId: id,
        blockType: String(block.blockType || "text"),
        contentJson: JSON.stringify(block.content || {}),
        sortOrder: Number(block.sortOrder ?? i),
        createdAt: now
      });
    }
  });
  tx(blocks);

  return db
    .prepare(
      `
      SELECT
        id,
        tab_id AS tabId,
        block_type AS blockType,
        content_json AS contentJson,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM product_tab_blocks
      WHERE tab_id = @tabId
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all({ tabId: id })
    .map((row) => {
      let content = {};
      try {
        content = JSON.parse(row.contentJson || "{}");
      } catch {
        content = {};
      }
      return {
        id: row.id,
        tabId: row.tabId,
        blockType: row.blockType,
        content,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt
      };
    });
}

function createOrder(payload) {
  const orderId = `ORD-${Date.now()}`;
  const now = new Date().toISOString();

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, created_at, customer_name, customer_phone, customer_address, payment_method,
      customer_email, payment_status, delivery_method, manager, manager_comment,
      delivery_comment, total, status, updated_at, status_history_json, order_documents_json
    ) VALUES (
      @id, @createdAt, @customerName, @customerPhone, @customerAddress, @paymentMethod,
      @customerEmail, @paymentStatus, @deliveryMethod, @manager, @managerComment,
      @deliveryComment, @total, @status, @updatedAt, @statusHistoryJson, @orderDocumentsJson
    )
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (
      order_id, product_id, name, article, price, qty, image
    ) VALUES (
      @orderId, @productId, @name, @article, @price, @qty, @image
    )
  `);

  const tx = db.transaction(() => {
    insertOrder.run({
      id: orderId,
      createdAt: now,
      customerName: payload.customer.name,
      customerPhone: payload.customer.phone,
      customerAddress: payload.customer.address,
      customerEmail: String(payload?.customer?.email || "").trim(),
      paymentMethod: payload.paymentMethod || "card_on_delivery",
      paymentStatus: String(payload.paymentStatus || "unpaid").trim() || "unpaid",
      deliveryMethod: String(payload.deliveryMethod || "").trim(),
      manager: "",
      managerComment: "",
      deliveryComment: payload.deliveryComment || "",
      total: Number(payload.total || 0),
      status: "new",
      updatedAt: now,
      statusHistoryJson: JSON.stringify([{ at: now, by: "system", status: "new", paymentStatus: "unpaid" }]),
      orderDocumentsJson: "[]"
    });

    for (const item of payload.items) {
      insertItem.run({
        orderId,
        productId: item.id || "",
        name: item.name || "",
        article: item.article || "",
        price: Number(item.price || 0),
        qty: Number(item.qty || 1),
        image: item.image || ""
      });
    }
  });

  tx();
  writeAuditLog("create", "order", orderId, {
    total: Number(payload.total || 0),
    items: Array.isArray(payload.items) ? payload.items.length : 0,
    customerPhone: String(payload?.customer?.phone || "")
  });
  return {
    orderId,
    createdAt: now,
    status: "new",
    paymentStatus: String(payload.paymentStatus || "unpaid").trim() || "unpaid",
    paymentMethod: payload.paymentMethod || "card_on_delivery",
    deliveryMethod: String(payload.deliveryMethod || "").trim()
  };
}

function getStats() {
  const products = db.prepare("SELECT COUNT(*) AS cnt FROM products").get().cnt;
  const orders = db.prepare("SELECT COUNT(*) AS cnt FROM orders").get().cnt;
  const withDocs = db
    .prepare("SELECT COUNT(*) AS cnt FROM products WHERE documents_json IS NOT NULL AND documents_json <> '[]'")
    .get().cnt;
  const withDescription = db
    .prepare("SELECT COUNT(*) AS cnt FROM products WHERE description_html IS NOT NULL AND description_html <> ''")
    .get().cnt;
  return { products, orders, withDocs, withDescription };
}

function rebuildCatalogConflicts() {
  return recalculateCatalogConflicts();
}

// Domain facade: keep database.js as composition root while heavy domain logic lives in db/modules/*
const auditModule = createAuditModule({ db });
const ordersModule = createOrdersModule({
  db,
  writeAuditLog: auditModule.writeAuditLog,
  normalizeOrderDocumentsInput
});
const catalogFiltersModule = createCatalogFiltersModule({
  db,
  listProducts,
  isServiceLikeRow,
  normalizeBrand,
  normalizeCategory,
  normalizeText,
  sanitizeProductRow,
  getFunctionalCategoriesByProductIds,
  hasActiveVariantConflict
});

module.exports = {
  dbPath,
  initSchema,
  listProducts,
  replaceAllProducts,
  getProductsForDetailEnrich,
  updateProductDetailsBatch,
  listProductsForImageRetouch,
  updateProductImagesBatch,
  listAdminProducts,
  listAdminProductsAdvanced: catalogFiltersModule.listAdminProductsAdvanced,
  listAdminFilters: catalogFiltersModule.listAdminFilters,
  listBrandsAdmin,
  createBrandAdmin,
  updateBrandAdmin,
  deleteBrandAdmin,
  listFunctionalCategoriesAdmin,
  createFunctionalCategoryAdmin,
  updateFunctionalCategoryAdmin,
  deleteFunctionalCategoryAdmin,
  listBrandCategoriesAdmin,
  listBrandNativeCategoriesAdmin,
  createBrandCategoryAdmin,
  updateBrandCategoryAdmin,
  deleteBrandCategoryAdmin,
  listAttributesAdmin,
  createAttributeAdmin,
  updateAttributeAdmin,
  deleteAttributeAdmin,
  listCategoryAttributeTemplates,
  createCategoryAttributeTemplate,
  updateCategoryAttributeTemplate,
  deleteCategoryAttributeTemplate,
  getAdminProductById,
  getAdminProductDetails,
  createAdminProduct,
  updateAdminProduct,
  upsertAdminProduct,
  applyBulkAdminProducts,
  listProductVariantsAdmin,
  createProductVariantAdmin,
  updateProductVariantAdmin,
  deleteProductVariantAdmin,
  listProductMediaAdmin,
  saveProductMediaAdmin,
  listProductDocumentsAdmin,
  saveProductDocumentsAdmin,
  listProductTabsAdmin,
  createProductTabAdmin,
  updateProductTabAdmin,
  deleteProductTabAdmin,
  saveTabBlocksAdmin,
  listAdminAuditLog: auditModule.listAdminAuditLog,
  listAdminOrders: ordersModule.listAdminOrders,
  listPublicOrdersByIds: ordersModule.listPublicOrdersByIds,
  listPublicOrdersByLookup: ordersModule.listPublicOrdersByLookup,
  getAdminOrderById: ordersModule.getAdminOrderById,
  updateAdminOrder: ordersModule.updateAdminOrder,
  getLatestExchangeRate,
  upsertExchangeRate,
  recalculateProductPriceRub,
  rebuildCatalogConflicts,
  createOrder: ordersModule.createOrder,
  getStats
};

