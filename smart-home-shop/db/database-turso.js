// Turso (libSQL) async implementation of database.js public API
"use strict";
const { createClient } = require("@libsql/client");
const {
  fixMojibake, normalizeBrand, normalizeCategory, normalizeChannelsValue,
  normalizeIntBool, normalizeOrderDocumentsInput,
  normalizeMetricValue, normalizeMountingValue,
  normalizeProtocolValue, normalizeScalar, normalizeTechnicalPatchValues,
  normalizeSystemType, normalizeText
} = require("./normalization");
const { SITE_PAGE_SEED } = require("./site-pages-seed");

// Client
const turso = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
  intMode: "number",
});

const dbPath = process.env.TURSO_URL || "turso";

// Helpers
async function q(sql, args = {}) {
  const r = await turso.execute({ sql, args });
  return r.rows;
}

async function q1(sql, args = {}) {
  const r = await turso.execute({ sql, args });
  return r.rows[0] ?? null;
}

async function run(sql, args = {}) {
  return turso.execute({ sql, args });
}

function createValidationError(message) {
  const err = new Error(String(message || "validation_error"));
  err.code = "validation_error";
  err.statusCode = 400;
  return err;
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase() === "EUR" ? "EUR" : "RUB";
}

function inferCurrencyByBrand(brand) {
  return String(brand || "").toLowerCase().includes("loxone") ? "EUR" : "RUB";
}

async function getEffectiveEurRubRate() {
  const row = await getLatestExchangeRate("EUR", "RUB");
  const rate = Number(row?.rate || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 100;
}

async function computePriceRub(priceValue, priceCurrency) {
  const price = priceValue == null || priceValue === "" ? null : Number(priceValue);
  if (!Number.isFinite(price)) return null;
  const currency = normalizeCurrency(priceCurrency);
  if (currency === "EUR") return Math.round(price * await getEffectiveEurRubRate() * 100) / 100;
  return Math.round(price * 100) / 100;
}

function boolNumber(value) {
  return value ? 1 : 0;
}

function rowsAffected(result) {
  return Number(result?.rowsAffected || 0);
}

function insertId(result) {
  return Number(result?.lastInsertRowid || 0);
}

function makeInParams(values, prefix = "id") {
  const list = (Array.isArray(values) ? values : []).map((x) => String(x || "").trim()).filter(Boolean);
  const args = {};
  const placeholders = list.map((value, index) => {
    const key = `${prefix}${index}`;
    args[key] = value;
    return `:${key}`;
  });
  return { list, args, placeholders: placeholders.join(", ") };
}

function omitKeys(source, keys) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(source || {}).filter(([key]) => !blocked.has(key)));
}

function hasActiveVariantConflict(productStatus, variantsTotal, activeVariants) {
  return (
    String(productStatus || "").trim().toLowerCase() === "active" &&
    Number(variantsTotal || 0) > 0 &&
    Number(activeVariants || 0) <= 0
  );
}

function normalizeCategoryListInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) return [...new Set(input.map((x) => normalizeCategory(x)).filter(Boolean))];
  return [...new Set(String(input).split(/[,\n;]+/g).map((x) => normalizeCategory(x)).filter(Boolean))];
}

function isServiceLikeRow(row) {
  const brand = normalizeBrand(row && row.brand).toLowerCase();
  const category = normalizeCategory(row && row.category).toLowerCase();
  const commercialGroup = normalizeCategory((row && (row.commercialGroup || row.commercial_group)) || "").toLowerCase();
  const entityType = String((row && (row.entityType || row.entity_type)) || "product").trim().toLowerCase();
  return (
    entityType === "service" ||
    entityType === "merch" ||
    category === "услуги" ||
    category === "мерч" ||
    commercialGroup === "услуги" ||
    commercialGroup === "мерч" ||
    String((row && row.id) || "").toLowerCase() === "service-networks" ||
    brand === "?????? ????"
  );
}

async function writeAuditLog(action, entityType, entityId, details = {}, actor = "system") {
  await run(
    `INSERT INTO audit_log (created_at, actor, action, entity_type, entity_id, details_json)
     VALUES (:createdAt, :actor, :action, :entityType, :entityId, :detailsJson)`,
    {
      createdAt: new Date().toISOString(),
      actor: String(actor || "system").trim() || "system",
      action: String(action || "").trim(),
      entityType: String(entityType || "").trim(),
      entityId: String(entityId || "").trim(),
      detailsJson: JSON.stringify(details || {})
    }
  );
}

function sanitizeProductRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(out)) out[k] = normalizeScalar(v);
  out.brand = normalizeBrand(out.brand);
  out.category = normalizeCategory(out.category);
  out.status = String(out.status || "active").trim().toLowerCase() || "active";
  if ("group" in out) out.group = normalizeText(fixMojibake(out.group));
  if ("groupName" in out) out.groupName = normalizeText(fixMojibake(out.groupName));
  if ("brandSubcategory" in out) out.brandSubcategory = normalizeText(fixMojibake(out.brandSubcategory));
  if ("systemType" in out) out.systemType = normalizeSystemType(out.systemType);
  if ("protocol" in out) out.protocol = normalizeProtocolValue(out.protocol);
  if ("mounting" in out) out.mounting = normalizeMountingValue(out.mounting);
  if ("supplyVoltage" in out) out.supplyVoltage = normalizeMetricValue("voltage", out.supplyVoltage);
  if ("channels" in out) out.channels = normalizeChannelsValue(out.channels);
  if ("nominalCurrent" in out) out.nominalCurrent = normalizeMetricValue("current", out.nominalCurrent);
  if ("nominalPower" in out) out.nominalPower = normalizeMetricValue("power", out.nominalPower);
  return out;
}

// Schema
async function initSchema() {
  // Schema already exists in Turso; just verify connection.
  await turso.execute("SELECT 1");
  // site_pages is a newer table — create + seed it if missing (idempotent).
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS site_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      subtitle TEXT DEFAULT '',
      body_html TEXT DEFAULT '',
      menu_group TEXT NOT NULL DEFAULT 'aux',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await seedSitePages();
  console.log("Turso: connected, schema assumed ready.");
}

async function seedSitePages() {
  const row = await q1("SELECT COUNT(*) AS n FROM site_pages");
  if (Number(row?.n || 0) > 0) return;
  const now = new Date().toISOString();
  for (const p of SITE_PAGE_SEED) {
    await run(
      `INSERT INTO site_pages (slug, title, subtitle, body_html, menu_group, sort_order, is_visible, created_at, updated_at)
       VALUES (:slug, :title, :subtitle, :bodyHtml, :menuGroup, :sortOrder, 1, :now, :now)`,
      { slug: p.slug, title: p.title, subtitle: p.subtitle || "", bodyHtml: p.bodyHtml,
        menuGroup: p.menuGroup || "aux", sortOrder: Number(p.sortOrder || 0), now }
    );
  }
}

function mapSitePageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title || "",
    subtitle: row.subtitle || "",
    bodyHtml: row.body_html || "",
    menuGroup: row.menu_group || "aux",
    sortOrder: Number(row.sort_order || 0),
    isVisible: Number(row.is_visible || 0) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePageSlug(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9Ѐ-ӿ-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const listSitePages = async () =>
  (await q("SELECT * FROM site_pages WHERE is_visible = 1 ORDER BY sort_order ASC, title COLLATE NOCASE ASC")).map(mapSitePageRow);

const listSitePagesAdmin = async () =>
  (await q("SELECT * FROM site_pages ORDER BY menu_group ASC, sort_order ASC, title COLLATE NOCASE ASC")).map(mapSitePageRow);

const getSitePageBySlug = async (slug) =>
  mapSitePageRow(await q1("SELECT * FROM site_pages WHERE slug = :slug", { slug: String(slug || "").trim() }));

const createSitePage = async (payload = {}) => {
  const now = new Date().toISOString();
  const slug = normalizePageSlug(payload.slug || payload.title || "");
  if (!slug) throw new Error("slug or title is required");
  await run(
    `INSERT INTO site_pages (slug, title, subtitle, body_html, menu_group, sort_order, is_visible, created_at, updated_at)
     VALUES (:slug, :title, :subtitle, :bodyHtml, :menuGroup, :sortOrder, :isVisible, :now, :now)`,
    {
      slug,
      title: String(payload.title || "").trim(),
      subtitle: String(payload.subtitle || "").trim(),
      bodyHtml: String(payload.bodyHtml || ""),
      menuGroup: String(payload.menuGroup || "aux").trim() || "aux",
      sortOrder: Number(payload.sortOrder || 0),
      isVisible: payload.isVisible === false ? 0 : 1,
      now
    }
  );
  const page = await getSitePageBySlug(slug);
  await writeAuditLog("create", "site_page", page?.id, { slug, title: page?.title || "" });
  return page;
};

const updateSitePage = async (id, patch = {}) => {
  const changes = await updateByMap("site_pages", "id", id, patch, {
    slug: "slug", title: "title", subtitle: "subtitle", bodyHtml: "body_html",
    menuGroup: "menu_group", sortOrder: "sort_order", isVisible: "is_visible"
  }, {
    slug: (v) => normalizePageSlug(v),
    bodyHtml: (v) => String(v || ""),
    sortOrder: (v) => Number(v || 0),
    isVisible: (v) => (v ? 1 : 0)
  });
  if (changes) await writeAuditLog("update", "site_page", id, { patch: { ...patch, bodyHtml: undefined } });
  return changes;
};

const deleteSitePage = async (id) => {
  const changes = rowsAffected(await run("DELETE FROM site_pages WHERE id = :id", { id: Number(id) }));
  if (changes) await writeAuditLog("delete", "site_page", id, {});
  return changes;
};

// Exchange rates
async function getLatestExchangeRate(base = "EUR", quote = "RUB") {
  return q1(
    `SELECT base, quote, rate, effective_date AS effectiveDate, source, updated_at AS updatedAt
     FROM exchange_rates
     WHERE base = :base AND quote = :quote
     ORDER BY effective_date DESC, updated_at DESC LIMIT 1`,
    { base: String(base).toUpperCase(), quote: String(quote).toUpperCase() }
  );
}

async function upsertExchangeRate({ base = "EUR", quote = "RUB", rate, effectiveDate = "", source = "cbr.ru" } = {}) {
  const normalizedRate = Number(rate);
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return null;
  const b = String(base).toUpperCase();
  const qc = String(quote).toUpperCase();
  const now = new Date().toISOString();
  const d = String(effectiveDate || now.slice(0, 10)).trim() || now.slice(0, 10);
  await run(
    `INSERT INTO exchange_rates (base, quote, rate, effective_date, source, updated_at)
     VALUES (:base, :quote, :rate, :effectiveDate, :source, :updatedAt)
     ON CONFLICT(base, quote, effective_date) DO UPDATE SET
       rate = excluded.rate, source = excluded.source, updated_at = excluded.updated_at`,
    { base: b, quote: qc, rate: normalizedRate, effectiveDate: d, source, updatedAt: now }
  );
  return getLatestExchangeRate(b, qc);
}

async function recalculateProductPriceRub(eurRubRate) {
  const safeRate = Number.isFinite(Number(eurRubRate)) && Number(eurRubRate) > 0
    ? Number(eurRubRate)
    : await getEffectiveEurRubRate();
  const r = await run(
    `UPDATE products SET price_rub = CASE
       WHEN UPPER(COALESCE(price_currency,'RUB')) = 'EUR' AND price IS NOT NULL THEN ROUND(price * :rate, 2)
       WHEN price IS NOT NULL THEN ROUND(price, 2)
       ELSE NULL END,
     updated_at = COALESCE(updated_at, :now)`,
    { rate: safeRate, now: new Date().toISOString() }
  );
  return r.rowsAffected ?? 0;
}

// Products
async function getFunctionalCategoriesByProductIds(ids) {
  const out = new Map();
  const productIds = (Array.isArray(ids) ? ids : []).map(x => String(x || "")).filter(Boolean);
  if (!productIds.length) return out;
  const placeholders = productIds.map((_, i) => `:id${i}`).join(", ");
  const args = Object.fromEntries(productIds.map((id, i) => [`id${i}`, id]));
  const rows = await q(
    `SELECT product_id AS productId, category_name AS categoryName, is_primary AS isPrimary, sort_order AS sortOrder
     FROM product_function_categories
     WHERE product_id IN (${placeholders})
     ORDER BY product_id ASC, is_primary DESC, sort_order ASC, category_name COLLATE NOCASE ASC`,
    args
  );
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

async function listProducts() {
  const rows = (await q(
    `SELECT id, article, entity_type AS entityType, name,
        price AS priceValue,
        COALESCE(price_rub, price) AS price,
        COALESCE(NULLIF(price_currency,''),'RUB') AS priceCurrency,
        image, category, group_name AS "group",
        commercial_group AS commercialGroup,
        commercial_subgroup AS commercialSubgroup,
        source_category AS sourceCategory,
        brand, description, description_html AS descriptionHtml,
        specs, gallery_json AS galleryJson, attributes_json AS attributesJson,
        documents_json AS documentsJson, breadcrumbs,
        brand_subcategory AS brandSubcategory, system_type AS systemType,
        protocol, mounting, supply_voltage AS supplyVoltage, channels,
        nominal_current AS nominalCurrent, nominal_power AS nominalPower,
        sensor_type AS sensorType, indoor_outdoor AS indoorOutdoor,
        ip_rating AS ipRating, io_count AS ioCount,
        web_interface AS webInterface, scenario_support AS scenarioSupport,
        load_type AS loadType, max_load AS maxLoad, status, price_text,
        source_url AS sourceUrl, subcategory, is_extra,
        COALESCE(is_brand_featured,0) AS isBrandFeatured,
        COALESCE(is_conflict,0) AS isConflict,
        COALESCE(conflict_note,'') AS conflictNote
     FROM products
     WHERE LOWER(TRIM(COALESCE(entity_type,'product'))) NOT IN ('service','merch')
       AND COALESCE(NULLIF(TRIM(status), ''), 'active') = 'active'
       AND COALESCE(is_extra, 0) <> 1
       AND COALESCE(is_active_normalized, 1) <> 0
       AND LOWER(TRIM(COALESCE(category,''))) NOT IN ('услуги','мерч')
       AND LOWER(TRIM(COALESCE(commercial_group,''))) NOT IN ('услуги','мерч')
     ORDER BY name COLLATE NOCASE ASC`
  )).map(sanitizeProductRow);

  const fmap = await getFunctionalCategoriesByProductIds(rows.map(r => r.id));
  return rows.map(row => {
    const fc = fmap.get(String(row.id)) || [];
    const primary = (fc.find(x => x.isPrimary)?.category) || row.category || "";
    return {
      ...row,
      category: row.category || "",
      primaryFunctionalCategory: primary || "",
      functionalCategories: fc.map(x => x.category).filter(Boolean)
    };
  });
}

async function getStats() {
  const [p, o, wd, wdesc] = await Promise.all([
    q1("SELECT COUNT(*) AS cnt FROM products"),
    q1("SELECT COUNT(*) AS cnt FROM orders"),
    q1("SELECT COUNT(*) AS cnt FROM products WHERE documents_json IS NOT NULL AND documents_json <> '[]'"),
    q1("SELECT COUNT(*) AS cnt FROM products WHERE description_html IS NOT NULL AND description_html <> ''"),
  ]);
  return { products: p?.cnt ?? 0, orders: o?.cnt ?? 0, withDocs: wd?.cnt ?? 0, withDescription: wdesc?.cnt ?? 0 };
}

async function rebuildCatalogConflicts() {
  return { flagged: 0, groups: 0 };
}

// Orders
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createOrder({ customer, items, total, paymentMethod, deliveryComment } = {}) {
  const id = generateId();
  const now = new Date().toISOString();
  const pm = String(paymentMethod || "");
  await run(
    `INSERT INTO orders (id, created_at, customer_name, customer_phone, customer_email,
       customer_address, payment_method, delivery_comment, total, status, payment_status, updated_at)
     VALUES (:id,:now,:name,:phone,:email,:address,:paymentMethod,:deliveryComment,:total,'pending','unpaid',:now)`,
    {
      id, now,
      name: String(customer?.name || ""),
      phone: String(customer?.phone || ""),
      email: String(customer?.email || ""),
      address: String(customer?.address || ""),
      paymentMethod: pm,
      deliveryComment: String(deliveryComment || ""),
      total: Number(total) || 0,
    }
  );
  if (Array.isArray(items) && items.length) {
    const stmts = items.map(item => ({
      sql: `INSERT INTO order_items (order_id, product_id, name, article, price, qty, image)
            VALUES (:orderId,:productId,:name,:article,:price,:qty,:image)`,
      args: {
        orderId: id,
        productId: String(item.id || item.productId || ""),
        name: String(item.name || ""),
        article: String(item.article || ""),
        price: Number(item.price) || 0,
        qty: Number(item.qty) || 1,
        image: String(item.image || ""),
      }
    }));
    await turso.batch(stmts, "write");
  }
  return { orderId: id, status: "pending", paymentStatus: "unpaid", paymentMethod: pm, deliveryMethod: "" };
}

async function listPublicOrdersByIds({ ids, limit = 10 } = {}) {
  if (!Array.isArray(ids) || !ids.length) return { rows: [] };
  const safeIds = ids.slice(0, Math.min(limit, 20));
  const placeholders = safeIds.map((_, i) => `:id${i}`).join(", ");
  const args = Object.fromEntries(safeIds.map((id, i) => [`id${i}`, id]));
  const orders = await q(
    `SELECT id, created_at AS createdAt, customer_name AS customerName,
        customer_phone AS customerPhone, customer_email AS customerEmail,
        customer_address AS customerAddress,
        payment_method AS paymentMethod, payment_status AS paymentStatus,
        delivery_method AS deliveryMethod, delivery_comment AS deliveryComment,
        total, status, updated_at AS updatedAt
     FROM orders WHERE id IN (${placeholders})`,
    args
  );
  const items = await q(
    `SELECT order_id AS orderId, product_id AS productId, name, article, price, qty, image
     FROM order_items WHERE order_id IN (${placeholders})`,
    args
  );
  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId).push(item);
  }
  const rows = orders.map(o => ({ ...o, items: itemsByOrder.get(o.id) || [] }));
  return { rows };
}

async function listPublicOrdersByLookup({ query, limit = 10 } = {}) {
  if (!query) return { rows: [] };
  const safeLimit = Math.min(limit, 20);
  const isEmail = String(query).includes("@");
  const orders = await q(
    isEmail
      ? `SELECT id, created_at AS createdAt, customer_name AS customerName,
             customer_phone AS customerPhone, customer_email AS customerEmail,
             customer_address AS customerAddress,
             payment_method AS paymentMethod, payment_status AS paymentStatus,
             delivery_method AS deliveryMethod, delivery_comment AS deliveryComment,
             total, status, updated_at AS updatedAt
           FROM orders WHERE customer_email LIKE :q ORDER BY created_at DESC LIMIT :lim`
      : `SELECT id, created_at AS createdAt, customer_name AS customerName,
             customer_phone AS customerPhone, customer_email AS customerEmail,
             customer_address AS customerAddress,
             payment_method AS paymentMethod, payment_status AS paymentStatus,
             delivery_method AS deliveryMethod, delivery_comment AS deliveryComment,
             total, status, updated_at AS updatedAt
           FROM orders WHERE customer_phone LIKE :q ORDER BY created_at DESC LIMIT :lim`,
    { q: `%${query}%`, lim: safeLimit }
  );
  if (!orders.length) return { rows: [] };
  const placeholders = orders.map((_, i) => `:id${i}`).join(", ");
  const args = Object.fromEntries(orders.map((o, i) => [`id${i}`, o.id]));
  const items = await q(
    `SELECT order_id AS orderId, product_id AS productId, name, article, price, qty, image
     FROM order_items WHERE order_id IN (${placeholders})`,
    args
  );
  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId).push(item);
  }
  const rows = orders.map(o => ({ ...o, items: itemsByOrder.get(o.id) || [] }));
  return { rows };
}

// Admin fallbacks
function notImplemented(name) {
  return async () => { throw Object.assign(new Error(`${name}: not implemented for Turso admin runtime`), { statusCode: 501 }); };
}

const listBrandsAdmin = async () => q(`
  SELECT id, name, slug, description, country, logo_url AS logoUrl,
    meta_title AS metaTitle, meta_description AS metaDescription,
    status, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
  FROM brands
  ORDER BY sort_order ASC, name COLLATE NOCASE ASC
`);

const createBrandAdmin = async (payload = {}) => {
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO brands (name, slug, description, country, logo_url, meta_title, meta_description, status, sort_order, created_at, updated_at)
     VALUES (:name, :slug, :description, :country, :logoUrl, :metaTitle, :metaDescription, :status, :sortOrder, :createdAt, :updatedAt)`,
    {
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
    }
  );
  const brand = await q1("SELECT * FROM brands WHERE id = :id", { id: insertId(result) });
  await writeAuditLog("create", "brand", brand?.id, { name: brand?.name || "" });
  return brand;
};

async function updateByMap(table, idColumn, id, patch, map, normalizers = {}) {
  const setParts = [];
  const args = { id: Number(id), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = :${key}`);
    args[key] = normalizers[key] ? normalizers[key](patch[key]) : String(patch[key] ?? "").trim();
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = :updatedAt");
  return rowsAffected(await run(`UPDATE ${table} SET ${setParts.join(", ")} WHERE ${idColumn} = :id`, args));
}

const updateBrandAdmin = async (brandId, patch = {}) => {
  const changes = await updateByMap("brands", "id", brandId, patch, {
    name: "name", slug: "slug", description: "description", country: "country", logoUrl: "logo_url",
    metaTitle: "meta_title", metaDescription: "meta_description", status: "status", sortOrder: "sort_order"
  }, { name: (v) => normalizeBrand(v || ""), sortOrder: (v) => Number(v || 0) });
  if (changes) await writeAuditLog("update", "brand", brandId, { patch });
  return changes;
};

const deleteBrandAdmin = async (brandId) => {
  const changes = rowsAffected(await run("DELETE FROM brands WHERE id = :id", { id: Number(brandId) }));
  if (changes) await writeAuditLog("delete", "brand", brandId, {});
  return changes;
};

const listFunctionalCategoriesAdmin = async () => q(`
  SELECT id, parent_id AS parentId, name, slug, status, sort_order AS sortOrder,
    created_at AS createdAt, updated_at AS updatedAt
  FROM functional_categories
  ORDER BY sort_order ASC, name COLLATE NOCASE ASC
`);

const createFunctionalCategoryAdmin = async (payload = {}) => {
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO functional_categories (parent_id, name, slug, status, sort_order, created_at, updated_at)
     VALUES (:parentId, :name, :slug, :status, :sortOrder, :createdAt, :updatedAt)`,
    {
      parentId: payload.parentId == null || payload.parentId === "" ? null : Number(payload.parentId),
      name: normalizeCategory(payload.name || ""),
      slug: String(payload.slug || "").trim(),
      status: String(payload.status || "active").trim() || "active",
      sortOrder: Number(payload.sortOrder || 0),
      createdAt: now,
      updatedAt: now
    }
  );
  const category = await q1("SELECT * FROM functional_categories WHERE id = :id", { id: insertId(result) });
  await writeAuditLog("create", "functional_category", category?.id, { name: category?.name || "" });
  return category;
};

const updateFunctionalCategoryAdmin = async (categoryId, patch = {}) => {
  const changes = await updateByMap("functional_categories", "id", categoryId, patch, {
    parentId: "parent_id", name: "name", slug: "slug", status: "status", sortOrder: "sort_order"
  }, {
    parentId: (v) => v == null || v === "" ? null : Number(v),
    name: (v) => normalizeCategory(v || ""),
    sortOrder: (v) => Number(v || 0)
  });
  if (changes) await writeAuditLog("update", "functional_category", categoryId, { patch });
  return changes;
};

const deleteFunctionalCategoryAdmin = async (categoryId) => {
  const changes = rowsAffected(await run("DELETE FROM functional_categories WHERE id = :id", { id: Number(categoryId) }));
  if (changes) await writeAuditLog("delete", "functional_category", categoryId, {});
  return changes;
};

const listBrandCategoriesAdmin = async (brandId = null) => {
  const where = brandId != null && brandId !== "" ? "WHERE bc.brand_id = :brandId" : "";
  return q(`
    SELECT bc.id, bc.brand_id AS brandId, bc.parent_id AS parentId,
      bc.name, bc.slug, bc.status, bc.sort_order AS sortOrder,
      bc.created_at AS createdAt, bc.updated_at AS updatedAt, b.name AS brandName
    FROM brand_categories bc
    JOIN brands b ON b.id = bc.brand_id
    ${where}
    ORDER BY b.name COLLATE NOCASE ASC, bc.sort_order ASC, bc.name COLLATE NOCASE ASC
  `, where ? { brandId: Number(brandId) } : {});
};

const listBrandNativeCategoriesAdmin = async (brandName = "") => {
  const brand = normalizeBrand(brandName);
  if (!brand) return [];
  const rows = await q(`
    SELECT DISTINCT TRIM(COALESCE(brand_subcategory, '')) AS sub
    FROM products
    WHERE LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM(:brand))
      AND TRIM(COALESCE(brand_subcategory, '')) <> ''
  `, { brand });
  return rows.map((row) => normalizeText(row.sub)).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "ru"));
};

const createBrandCategoryAdmin = async (payload = {}) => {
  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO brand_categories (brand_id, parent_id, name, slug, status, sort_order, created_at, updated_at)
     VALUES (:brandId, :parentId, :name, :slug, :status, :sortOrder, :createdAt, :updatedAt)`,
    {
      brandId: Number(payload.brandId),
      parentId: payload.parentId == null || payload.parentId === "" ? null : Number(payload.parentId),
      name: String(payload.name || "").trim(),
      slug: String(payload.slug || "").trim(),
      status: String(payload.status || "active").trim() || "active",
      sortOrder: Number(payload.sortOrder || 0),
      createdAt: now,
      updatedAt: now
    }
  );
  const category = await q1("SELECT * FROM brand_categories WHERE id = :id", { id: insertId(result) });
  await writeAuditLog("create", "brand_category", category?.id, { name: category?.name || "" });
  return category;
};

const updateBrandCategoryAdmin = async (categoryId, patch = {}) => {
  const changes = await updateByMap("brand_categories", "id", categoryId, patch, {
    brandId: "brand_id", parentId: "parent_id", name: "name", slug: "slug", status: "status", sortOrder: "sort_order"
  }, {
    brandId: (v) => Number(v || 0),
    parentId: (v) => v == null || v === "" ? null : Number(v),
    sortOrder: (v) => Number(v || 0)
  });
  if (changes) await writeAuditLog("update", "brand_category", categoryId, { patch });
  return changes;
};

const deleteBrandCategoryAdmin = async (categoryId) => {
  const changes = rowsAffected(await run("DELETE FROM brand_categories WHERE id = :id", { id: Number(categoryId) }));
  if (changes) await writeAuditLog("delete", "brand_category", categoryId, {});
  return changes;
};
const listAttributesAdmin = async () => q(`
  SELECT id, code, name, type, options_json AS optionsJson, unit, status,
    created_at AS createdAt, updated_at AS updatedAt
  FROM attributes
  ORDER BY name COLLATE NOCASE ASC
`);

const createAttributeAdmin = async (payload = {}) => {
  const now = new Date().toISOString();
  const code = String(payload.code || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  if (!code || !name) throw createValidationError("code and name are required");
  const result = await run(
    `INSERT INTO attributes (code, name, type, options_json, unit, status, created_at, updated_at)
     VALUES (:code, :name, :type, :optionsJson, :unit, :status, :createdAt, :updatedAt)`,
    {
      code,
      name,
      type: String(payload.type || "string").trim() || "string",
      optionsJson: JSON.stringify(Array.isArray(payload.options) ? payload.options : []),
      unit: String(payload.unit || "").trim(),
      status: String(payload.status || "active").trim() || "active",
      createdAt: now,
      updatedAt: now
    }
  );
  const row = await q1("SELECT * FROM attributes WHERE id = :id", { id: insertId(result) });
  await writeAuditLog("create", "attribute", row?.id, { code, name });
  return row;
};

const updateAttributeAdmin = async (attributeId, patch = {}) => {
  const setParts = [];
  const args = { id: Number(attributeId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries({ code: "code", name: "name", type: "type", unit: "unit", status: "status" })) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = :${key}`);
    args[key] = key === "code" ? String(patch[key] || "").trim().toLowerCase() : String(patch[key] || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "options")) {
    setParts.push("options_json = :optionsJson");
    args.optionsJson = JSON.stringify(Array.isArray(patch.options) ? patch.options : []);
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = :updatedAt");
  const changes = rowsAffected(await run(`UPDATE attributes SET ${setParts.join(", ")} WHERE id = :id`, args));
  if (changes) await writeAuditLog("update", "attribute", attributeId, { patch });
  return changes;
};

const deleteAttributeAdmin = async (attributeId) => {
  const changes = rowsAffected(await run("DELETE FROM attributes WHERE id = :id", { id: Number(attributeId) }));
  if (changes) await writeAuditLog("delete", "attribute", attributeId, {});
  return changes;
};

const listCategoryAttributeTemplates = async (categoryName = "") => {
  const args = {};
  const where = String(categoryName || "").trim() ? "WHERE LOWER(TRIM(t.category_name)) = LOWER(TRIM(:categoryName))" : "";
  if (where) args.categoryName = normalizeCategory(categoryName);
  const rows = await q(`
    SELECT t.id, t.category_name AS categoryName, t.attribute_code AS attributeCode,
      t.required, t.filterable, t.visible, t.sort_order AS sortOrder,
      t.created_at AS createdAt, t.updated_at AS updatedAt,
      a.name AS attributeName, a.type AS attributeType, a.unit AS attributeUnit
    FROM category_attribute_templates t
    LEFT JOIN attributes a ON a.code = t.attribute_code
    ${where}
    ORDER BY t.category_name COLLATE NOCASE ASC, t.sort_order ASC, t.attribute_code COLLATE NOCASE ASC
  `, args);
  return rows.map((row) => ({ ...row, required: Number(row.required) === 1, filterable: Number(row.filterable) === 1, visible: Number(row.visible) === 1 }));
};

const createCategoryAttributeTemplate = async (payload = {}) => {
  const now = new Date().toISOString();
  const categoryName = normalizeCategory(payload.categoryName || "");
  const attributeCode = String(payload.attributeCode || "").trim().toLowerCase();
  if (!categoryName || !attributeCode) throw createValidationError("categoryName and attributeCode are required");
  const result = await run(
    `INSERT INTO category_attribute_templates (category_name, attribute_code, required, filterable, visible, sort_order, created_at, updated_at)
     VALUES (:categoryName, :attributeCode, :required, :filterable, :visible, :sortOrder, :createdAt, :updatedAt)`,
    { categoryName, attributeCode, required: boolNumber(payload.required), filterable: boolNumber(payload.filterable), visible: payload.visible === false ? 0 : 1, sortOrder: Number(payload.sortOrder || 0), createdAt: now, updatedAt: now }
  );
  const row = await q1("SELECT * FROM category_attribute_templates WHERE id = :id", { id: insertId(result) });
  await writeAuditLog("create", "category_attribute_template", row?.id, { categoryName, attributeCode });
  return row;
};

const updateCategoryAttributeTemplate = async (templateId, patch = {}) => {
  const setParts = [];
  const args = { id: Number(templateId), updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries({ categoryName: "category_name", attributeCode: "attribute_code", sortOrder: "sort_order" })) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = :${key}`);
    if (key === "categoryName") args[key] = normalizeCategory(patch[key] || "");
    else if (key === "attributeCode") args[key] = String(patch[key] || "").trim().toLowerCase();
    else args[key] = Number(patch[key] || 0);
  }
  for (const key of ["required", "filterable", "visible"]) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${key} = :${key}`);
    args[key] = boolNumber(patch[key]);
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = :updatedAt");
  const changes = rowsAffected(await run(`UPDATE category_attribute_templates SET ${setParts.join(", ")} WHERE id = :id`, args));
  if (changes) await writeAuditLog("update", "category_attribute_template", templateId, { patch });
  return changes;
};

const deleteCategoryAttributeTemplate = async (templateId) => {
  const changes = rowsAffected(await run("DELETE FROM category_attribute_templates WHERE id = :id", { id: Number(templateId) }));
  if (changes) await writeAuditLog("delete", "category_attribute_template", templateId, {});
  return changes;
};
async function getProductBrandCategories(productId) {
  const rows = await q(`SELECT brand_category_id AS brandCategoryId, is_primary AS isPrimary FROM product_brand_categories WHERE product_id = :productId ORDER BY is_primary DESC, sort_order ASC, id ASC`, { productId: String(productId) });
  return rows.map((row) => ({ brandCategoryId: Number(row.brandCategoryId), isPrimary: Number(row.isPrimary) === 1 }));
}

async function syncProductBrandCategories(productId, idsInput, primaryInput) {
  const id = String(productId || "").trim();
  if (!id) return;
  const ids = Array.isArray(idsInput) ? [...new Set(idsInput.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))] : [];
  const primary = ids.includes(Number(primaryInput || 0)) ? Number(primaryInput) : (ids[0] || 0);
  const now = new Date().toISOString();
  const statements = [{ sql: "DELETE FROM product_brand_categories WHERE product_id = :productId", args: { productId: id } }];
  ids.forEach((categoryId, index) => statements.push({
    sql: `INSERT INTO product_brand_categories (product_id, brand_category_id, is_primary, sort_order, created_at, updated_at) VALUES (:productId, :brandCategoryId, :isPrimary, :sortOrder, :createdAt, :updatedAt)`,
    args: { productId: id, brandCategoryId: categoryId, isPrimary: categoryId === primary ? 1 : 0, sortOrder: index, createdAt: now, updatedAt: now }
  }));
  await turso.batch(statements, "write");
}

async function syncProductFunctionalCategories(productId, categoriesInput, primaryInput) {
  const id = String(productId || "").trim();
  if (!id) return;
  const categories = normalizeCategoryListInput(categoriesInput);
  const primary = normalizeCategory(primaryInput || "");
  if (primary && !categories.includes(primary)) categories.unshift(primary);
  if (!categories.length) return;
  const resolvedPrimary = primary || categories[0] || "";
  const now = new Date().toISOString();
  const statements = [{ sql: "DELETE FROM product_function_categories WHERE product_id = :productId", args: { productId: id } }];
  categories.forEach((category, index) => statements.push({
    sql: `INSERT INTO product_function_categories (product_id, category_name, is_primary, sort_order, created_at, updated_at) VALUES (:productId, :categoryName, :isPrimary, :sortOrder, :createdAt, :updatedAt)`,
    args: { productId: id, categoryName: category, isPrimary: category === resolvedPrimary ? 1 : 0, sortOrder: index, createdAt: now, updatedAt: now }
  }));
  await turso.batch(statements, "write");
}

const listAdminFilters = async () => {
  const rows = (await listProducts()).filter((row) => !isServiceLikeRow(row));
  const brandMap = new Map();
  const categoryMap = new Map();
  const groupMap = new Map();
  const categoryGroupMap = new Map();
  for (const row of rows) {
    const brand = normalizeBrand(row.brand);
    const group = normalizeText(row.group || "");
    if (brand) brandMap.set(brand, (brandMap.get(brand) || 0) + 1);
    if (group) groupMap.set(group, (groupMap.get(group) || 0) + 1);
    for (const category of (row.functionalCategories || [row.category]).map(normalizeCategory).filter(Boolean)) {
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      if (!group) continue;
      const groups = categoryGroupMap.get(category) || [];
      const found = groups.find((x) => x.group_name === group);
      if (found) found.count += 1;
      else groups.push({ group_name: group, count: 1 });
      categoryGroupMap.set(category, groups);
    }
  }
  const asSorted = (map, key) => [...map.entries()].map(([value, count]) => ({ [key]: value, count })).sort((a, b) => (b.count - a.count) || String(a[key]).localeCompare(String(b[key]), "ru"));
  const categoryGroups = [...categoryGroupMap.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ru")).map(([category, groups]) => ({ category, groups: groups.slice().sort((a, b) => (b.count - a.count) || String(a.group_name).localeCompare(String(b.group_name), "ru")) }));
  return { brands: asSorted(brandMap, "brand"), categories: asSorted(categoryMap, "category"), groups: asSorted(groupMap, "group_name"), categoryGroups };
};

const listAdminProductsAdvanced = async (filters = {}) => {
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 50)));
  const offset = Math.max(0, Number(filters.offset || 0));
  const where = ["LOWER(TRIM(COALESCE(p.entity_type, 'product'))) NOT IN ('service', 'merch')", "LOWER(TRIM(COALESCE(p.id, ''))) <> LOWER('service-networks')"];
  const args = { limit, offset };
  if (filters.q) { where.push("(p.name LIKE :q OR p.article LIKE :q OR p.id LIKE :q)"); args.q = `%${String(filters.q).trim()}%`; }
  if (filters.brand) { where.push("LOWER(TRIM(p.brand)) = LOWER(TRIM(:brand))"); args.brand = normalizeBrand(filters.brand); }
  if (filters.category) { where.push("EXISTS (SELECT 1 FROM product_function_categories pfc WHERE pfc.product_id = p.id AND LOWER(TRIM(pfc.category_name)) = LOWER(TRIM(:category)))"); args.category = normalizeCategory(filters.category); }
  if (filters.brandCategoryId) { where.push("EXISTS (SELECT 1 FROM product_brand_categories pbc WHERE pbc.product_id = p.id AND pbc.brand_category_id = :brandCategoryId)"); args.brandCategoryId = Number(filters.brandCategoryId); }
  if (filters.group) { where.push("LOWER(TRIM(p.group_name)) = LOWER(TRIM(:group))"); args.group = normalizeText(filters.group); }
  if (filters.status) { where.push("p.status = :status"); args.status = String(filters.status).trim(); }
  if (filters.isBrandFeatured === "1" || filters.isBrandFeatured === "0") { where.push("COALESCE(p.is_brand_featured, 0) = :isBrandFeatured"); args.isBrandFeatured = Number(filters.isBrandFeatured); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const totalRow = await q1(`SELECT COUNT(*) AS c FROM products p ${whereSql}`, omitKeys(args, ["limit", "offset"]));
  const products = (await q(`
    SELECT p.id, p.article, p.name, p.brand, p.category, p.group_name AS "group", p.status, p.price, p.image, p.updated_at AS updatedAt,
      COALESCE(p.is_extra, 0) AS is_extra, COALESCE(p.is_brand_featured, 0) AS isBrandFeatured, COALESCE(p.is_conflict, 0) AS isConflict, COALESCE(p.conflict_note, '') AS conflictNote,
      (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
      (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active') AS activeVariants,
      ((SELECT COUNT(*) FROM product_documents d WHERE d.product_id = p.id) + CASE WHEN p.documents_json IS NOT NULL AND p.documents_json <> '[]' THEN 1 ELSE 0 END) AS documentsCount
    FROM products p ${whereSql}
    ORDER BY p.updated_at DESC, p.name COLLATE NOCASE ASC
    LIMIT :limit OFFSET :offset
  `, args)).map(sanitizeProductRow).filter((row) => !isServiceLikeRow(row));
  const fmap = await getFunctionalCategoriesByProductIds(products.map((row) => row.id));
  const mapped = products.map((row) => {
    const fc = fmap.get(String(row.id)) || [];
    const primary = (fc.find((x) => x.isPrimary)?.category) || row.category || "";
    const variants = Number(row.variants || 0);
    const activeVariants = Number(row.activeVariants || 0);
    return { ...row, variants, activeVariants, hasVariantConflict: hasActiveVariantConflict(row.status, variants, activeVariants), category: primary || "", primaryFunctionalCategory: primary || "", functionalCategories: fc.map((x) => x.category) };
  });
  const total = Number(totalRow?.c || 0);
  return { products: mapped, pagination: { offset, limit, total, hasMore: offset + limit < total } };
};

const listAdminProducts = async (opts = {}) => {
  const result = await listAdminProductsAdvanced(opts);
  return { rows: result.products, total: result.pagination.total };
};

const getAdminProductById = async (id) => {
  const row = await q1(`
    SELECT id, article, name, price, price_currency AS priceCurrency, COALESCE(price_rub, price) AS priceRub, price_text AS priceText, category, group_name AS groupName, brand, image, source_url AS sourceUrl, status, description, description_html AS descriptionHtml, specs, breadcrumbs, gallery_json AS galleryJson, attributes_json AS attributesJson, documents_json AS documentsJson, brand_subcategory AS brandSubcategory, system_type AS systemType, protocol, mounting, supply_voltage AS supplyVoltage, channels, nominal_current AS nominalCurrent, nominal_power AS nominalPower, sensor_type AS sensorType, indoor_outdoor AS indoorOutdoor, ip_rating AS ipRating, io_count AS ioCount, web_interface AS webInterface, scenario_support AS scenarioSupport, load_type AS loadType, max_load AS maxLoad, slug, meta_title AS metaTitle, meta_description AS metaDescription, COALESCE(is_brand_featured, 0) AS isBrandFeatured, COALESCE(is_conflict, 0) AS isConflict, COALESCE(conflict_note, '') AS conflictNote, updated_at AS updatedAt
    FROM products WHERE id = :id LIMIT 1
  `, { id: String(id) });
  if (!row) return null;
  const base = sanitizeProductRow(row);
  const fc = (await getFunctionalCategoriesByProductIds([base.id])).get(String(base.id)) || [];
  const primary = (fc.find((x) => x.isPrimary)?.category) || base.category || "";
  return { ...base, category: primary || "", primaryFunctionalCategory: primary || "", functionalCategories: fc.map((x) => x.category) };
};

const getProductVariantSummary = async (productId) => {
  const row = await q1(`SELECT COUNT(*) AS total, SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'active' THEN 1 ELSE 0 END) AS active FROM product_variants WHERE product_id = :id`, { id: String(productId) });
  return { total: Number(row?.total || 0), active: Number(row?.active || 0) };
};

const getAdminProductDetails = async (id) => {
  const product = await getAdminProductById(id);
  if (!product) return null;
  const [variants, media, documents, brandCategories, summary] = await Promise.all([listProductVariantsAdmin(id), listProductMediaAdmin(id), listProductDocumentsAdmin(id), getProductBrandCategories(id), getProductVariantSummary(id)]);
  return { ...product, variants, media, documents, brandCategoryIds: brandCategories.map((x) => x.brandCategoryId), primaryBrandCategoryId: (brandCategories.find((x) => x.isPrimary)?.brandCategoryId) || null, variantsCount: summary.total, activeVariants: summary.active, hasVariantConflict: hasActiveVariantConflict(product.status, summary.total, summary.active) };
};

const createAdminProduct = async (payload = {}) => {
  const now = new Date().toISOString();
  const id = String(payload.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).trim();
  const name = String(payload.name || "").trim();
  if (!name) throw createValidationError("Product name is required.");
  const brand = normalizeBrand(payload.brand || "");
  const price = payload.price === "" || payload.price == null ? null : Number(payload.price);
  const priceCurrency = normalizeCurrency(payload.priceCurrency || inferCurrencyByBrand(brand));
  const technical = normalizeTechnicalPatchValues(payload);
  const primaryCategory = normalizeCategory(payload.primaryFunctionalCategory || payload.category || "");
  await run(`INSERT INTO products (id, article, name, price, price_currency, price_rub, price_text, category, group_name, brand, image, source_url, description, description_html, specs, breadcrumbs, gallery_json, attributes_json, documents_json, brand_subcategory, system_type, protocol, mounting, supply_voltage, channels, nominal_current, nominal_power, slug, meta_title, meta_description, status, is_brand_featured, updated_at) VALUES (:id, :article, :name, :price, :priceCurrency, :priceRub, :priceText, :category, :groupName, :brand, :image, :sourceUrl, :description, :descriptionHtml, :specs, :breadcrumbs, :galleryJson, :attributesJson, :documentsJson, :brandSubcategory, :systemType, :protocol, :mounting, :supplyVoltage, :channels, :nominalCurrent, :nominalPower, :slug, :metaTitle, :metaDescription, :status, :isBrandFeatured, :updatedAt)`, {
    id, article: String(payload.article || "").trim(), name, price, priceCurrency, priceRub: await computePriceRub(price, priceCurrency), priceText: String(payload.priceText || ""), category: primaryCategory, groupName: normalizeText(payload.group || payload.groupName || ""), brand, image: String(payload.image || ""), sourceUrl: String(payload.sourceUrl || ""), description: String(payload.description || ""), descriptionHtml: String(payload.descriptionHtml || ""), specs: String(payload.specs || ""), breadcrumbs: String(payload.breadcrumbs || ""), galleryJson: String(payload.galleryJson || "[]"), attributesJson: String(payload.attributesJson || "[]"), documentsJson: String(payload.documentsJson || "[]"), brandSubcategory: String(payload.brandSubcategory || ""), systemType: String(technical.systemType || ""), protocol: String(technical.protocol || ""), mounting: String(technical.mounting || ""), supplyVoltage: String(technical.supplyVoltage || ""), channels: String(technical.channels || ""), nominalCurrent: String(technical.nominalCurrent || ""), nominalPower: String(technical.nominalPower || ""), slug: String(payload.slug || ""), metaTitle: String(payload.metaTitle || ""), metaDescription: String(payload.metaDescription || ""), status: String(payload.status || "draft").trim().toLowerCase() || "draft", isBrandFeatured: normalizeIntBool(payload.isBrandFeatured), updatedAt: now
  });
  await syncProductFunctionalCategories(id, payload.functionalCategories, primaryCategory);
  await syncProductBrandCategories(id, payload.brandCategoryIds, payload.primaryBrandCategoryId);
  await writeAuditLog("create", "product", id, { name });
  return getAdminProductDetails(id);
};

const updateAdminProduct = async (id, patch = {}) => {
  const productId = String(id || "").trim();
  if (!productId) return 0;
  const patchData = { ...(patch || {}), ...normalizeTechnicalPatchValues(patch || {}) };
  const map = { article: "article", name: "name", price: "price", priceText: "price_text", category: "category", groupName: "group_name", group: "group_name", brand: "brand", status: "status", image: "image", sourceUrl: "source_url", description: "description", descriptionHtml: "description_html", specs: "specs", breadcrumbs: "breadcrumbs", galleryJson: "gallery_json", attributesJson: "attributes_json", documentsJson: "documents_json", brandSubcategory: "brand_subcategory", systemType: "system_type", protocol: "protocol", mounting: "mounting", supplyVoltage: "supply_voltage", channels: "channels", nominalCurrent: "nominal_current", nominalPower: "nominal_power", sensorType: "sensor_type", indoorOutdoor: "indoor_outdoor", ipRating: "ip_rating", ioCount: "io_count", webInterface: "web_interface", scenarioSupport: "scenario_support", loadType: "load_type", maxLoad: "max_load", slug: "slug", metaTitle: "meta_title", metaDescription: "meta_description", isBrandFeatured: "is_brand_featured" };
  if (Object.prototype.hasOwnProperty.call(patchData, "primaryFunctionalCategory") && !Object.prototype.hasOwnProperty.call(patchData, "category")) patchData.category = normalizeCategory(patchData.primaryFunctionalCategory);
  const setParts = [];
  const args = { id: productId, updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patchData, key)) continue;
    setParts.push(`${col} = :${key}`);
    if (key === "price") args[key] = patchData[key] === "" || patchData[key] == null ? null : Number(patchData[key]);
    else if (key === "category") args[key] = normalizeCategory(patchData[key]);
    else if (key === "brand") args[key] = normalizeBrand(patchData[key]);
    else if (key === "group" || key === "groupName") args[key] = normalizeText(patchData[key]);
    else if (key === "isBrandFeatured") args[key] = normalizeIntBool(patchData[key]);
    else args[key] = String(patchData[key] ?? "");
  }
  if (Object.prototype.hasOwnProperty.call(patchData, "price") || Object.prototype.hasOwnProperty.call(patchData, "priceCurrency") || Object.prototype.hasOwnProperty.call(patchData, "brand")) {
    const current = await q1("SELECT price, price_currency AS priceCurrency, brand FROM products WHERE id = :id", { id: productId }) || {};
    const nextPrice = Object.prototype.hasOwnProperty.call(args, "price") ? args.price : current.price;
    const currency = normalizeCurrency(patchData.priceCurrency || current.priceCurrency || inferCurrencyByBrand(args.brand || current.brand));
    args.priceCurrency = currency;
    args.priceRub = await computePriceRub(nextPrice, currency);
    setParts.push("price_currency = :priceCurrency", "price_rub = :priceRub");
  }
  let changes = 0;
  if (setParts.length) {
    setParts.push("updated_at = :updatedAt");
    changes = rowsAffected(await run(`UPDATE products SET ${setParts.join(", ")} WHERE id = :id`, args));
  } else if (!(await q1("SELECT id FROM products WHERE id = :id", { id: productId }))) return 0;
  if (Object.prototype.hasOwnProperty.call(patchData, "functionalCategories") || Object.prototype.hasOwnProperty.call(patchData, "primaryFunctionalCategory") || Object.prototype.hasOwnProperty.call(patchData, "category")) await syncProductFunctionalCategories(productId, patchData.functionalCategories, patchData.primaryFunctionalCategory || patchData.category);
  if (Object.prototype.hasOwnProperty.call(patchData, "brandCategoryIds") || Object.prototype.hasOwnProperty.call(patchData, "primaryBrandCategoryId")) await syncProductBrandCategories(productId, patchData.brandCategoryIds || [], patchData.primaryBrandCategoryId);
  await writeAuditLog("update", "product", productId, { patch: patchData });
  return changes || 1;
};

const upsertAdminProduct = async (id, payload) => (await updateAdminProduct(id, payload)) > 0;

const applyBulkAdminProducts = async ({ action, productIds, data = {} }) => {
  const { list, args, placeholders } = makeInParams(productIds);
  if (!list.length) return { success: false, message: "No products selected" };
  if (action === "delete") return { success: true, message: `Deleted products: ${rowsAffected(await run(`DELETE FROM products WHERE id IN (${placeholders})`, args))}` };
  if (action === "archive") return { success: true, message: `Archived: ${rowsAffected(await run(`UPDATE products SET status = 'archived', updated_at = :updatedAt WHERE id IN (${placeholders})`, { ...args, updatedAt: new Date().toISOString() }))}` };
  if (action === "updateStatus") return { success: true, message: `Status updated: ${rowsAffected(await run(`UPDATE products SET status = :status, updated_at = :updatedAt WHERE id IN (${placeholders})`, { ...args, status: String(data.status || "draft"), updatedAt: new Date().toISOString() }))}` };
  if (action === "export") return { success: true, message: "Exported", rows: await q(`SELECT * FROM products WHERE id IN (${placeholders})`, args) };
  return { success: false, message: "Unsupported action" };
};

const listProductVariantsAdmin = async (productId) => q(`
  SELECT id, product_id AS productId, sku, option_summary AS optionSummary, price, qty, status,
    media_mode AS mediaMode, created_at AS createdAt, updated_at AS updatedAt
  FROM product_variants
  WHERE product_id = :productId
  ORDER BY id ASC
`, { productId: String(productId) });
const createProductVariantAdmin = async (productId, payload = {}) => {
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO product_variants (product_id, sku, option_summary, price, qty, status, media_mode, created_at, updated_at) VALUES (:productId, :sku, :optionSummary, :price, :qty, :status, :mediaMode, :createdAt, :updatedAt)`, {
    productId: String(productId), sku: String(payload.sku || "").trim(), optionSummary: String(payload.optionSummary || "").trim(), price: payload.price === "" || payload.price == null ? null : Number(payload.price), qty: Number(payload.qty || 0), status: String(payload.status || "draft"), mediaMode: String(payload.mediaMode || "inherit"), createdAt: now, updatedAt: now
  });
  const row = await q1("SELECT * FROM product_variants WHERE id = :id", { id: insertId(result) });
  await writeAuditLog("create", "product_variant", row?.id, { productId: String(productId) });
  return row;
};

const updateProductVariantAdmin = async (variantId, patch = {}) => {
  const changes = await updateByMap("product_variants", "id", variantId, patch, { sku: "sku", optionSummary: "option_summary", price: "price", qty: "qty", status: "status", mediaMode: "media_mode" }, { price: (v) => v === "" || v == null ? null : Number(v), qty: (v) => Number(v || 0) });
  if (changes) await writeAuditLog("update", "product_variant", variantId, { patch });
  return changes;
};

const deleteProductVariantAdmin = async (variantId) => {
  const changes = rowsAffected(await run("DELETE FROM product_variants WHERE id = :id", { id: Number(variantId) }));
  if (changes) await writeAuditLog("delete", "product_variant", variantId, {});
  return changes;
};

const listProductMediaAdmin = async (productId) => {
  const rows = await q(`SELECT id, product_id AS productId, variant_id AS variantId, url, is_cover AS isCover, sort_order AS sortOrder, label, created_at AS createdAt FROM product_media WHERE product_id = :productId ORDER BY sort_order ASC, id ASC`, { productId: String(productId) });
  return rows.map((row) => ({ ...row, isCover: Number(row.isCover) === 1 }));
};

const saveProductMediaAdmin = async (productId, media = []) => {
  const id = String(productId || "").trim();
  if (!id) return [];
  const now = new Date().toISOString();
  const statements = [{ sql: "DELETE FROM product_media WHERE product_id = :productId", args: { productId: id } }];
  (Array.isArray(media) ? media : []).forEach((item, index) => {
    const url = String(item?.url || "").trim();
    if (!url) return;
    statements.push({ sql: `INSERT INTO product_media (product_id, variant_id, url, is_cover, sort_order, label, created_at) VALUES (:productId, :variantId, :url, :isCover, :sortOrder, :label, :createdAt)`, args: { productId: id, variantId: item?.variantId == null || item?.variantId === "" ? null : Number(item.variantId), url, isCover: item?.isCover ? 1 : 0, sortOrder: Number(item?.sortOrder ?? index), label: String(item?.label || "").trim(), createdAt: now } });
  });
  await turso.batch(statements, "write");
  const saved = await listProductMediaAdmin(id);
  await writeAuditLog("save_media", "product", id, { total: saved.length });
  return saved;
};

const listProductDocumentsAdmin = async (productId) => q(`SELECT id, product_id AS productId, variant_id AS variantId, title, type, lang, url, sort_order AS sortOrder, created_at AS createdAt FROM product_documents WHERE product_id = :productId ORDER BY sort_order ASC, id ASC`, { productId: String(productId) });

const saveProductDocumentsAdmin = async (productId, documents = []) => {
  const id = String(productId || "").trim();
  if (!id) return [];
  const now = new Date().toISOString();
  const statements = [{ sql: "DELETE FROM product_documents WHERE product_id = :productId", args: { productId: id } }];
  (Array.isArray(documents) ? documents : []).forEach((item, index) => {
    const url = String(item?.url || "").trim();
    if (!url) return;
    statements.push({ sql: `INSERT INTO product_documents (product_id, variant_id, title, type, lang, url, sort_order, created_at) VALUES (:productId, :variantId, :title, :type, :lang, :url, :sortOrder, :createdAt)`, args: { productId: id, variantId: item?.variantId == null || item?.variantId === "" ? null : Number(item.variantId), title: String(item?.title || "").trim() || "Document", type: String(item?.type || "").trim(), lang: String(item?.lang || "").trim(), url, sortOrder: Number(item?.sortOrder ?? index), createdAt: now } });
  });
  await turso.batch(statements, "write");
  const saved = await listProductDocumentsAdmin(id);
  await writeAuditLog("save_documents", "product", id, { total: saved.length });
  return saved;
};

const listProductTabsAdmin = async (productId, variantId = null) => {
  const tabs = await q(`SELECT id, product_id AS productId, variant_id AS variantId, title, code, enabled, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt FROM product_tabs WHERE product_id = :productId AND ((:variantId IS NULL AND variant_id IS NULL) OR variant_id = :variantId) ORDER BY sort_order ASC, id ASC`, { productId: String(productId), variantId: variantId == null || variantId === "" ? null : Number(variantId) });
  if (!tabs.length) return [];
  const ids = tabs.map((tab) => String(tab.id));
  const { args, placeholders } = makeInParams(ids, "tab");
  const blocks = await q(`SELECT id, tab_id AS tabId, block_type AS blockType, content_json AS contentJson, sort_order AS sortOrder, created_at AS createdAt FROM product_tab_blocks WHERE tab_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`, args);
  const byTab = new Map();
  for (const block of blocks) {
    let content = {};
    try { content = JSON.parse(block.contentJson || "{}"); } catch { content = {}; }
    const arr = byTab.get(Number(block.tabId)) || [];
    arr.push({ id: block.id, tabId: block.tabId, blockType: block.blockType, content, sortOrder: block.sortOrder, createdAt: block.createdAt });
    byTab.set(Number(block.tabId), arr);
  }
  return tabs.map((tab) => ({ ...tab, enabled: Number(tab.enabled) === 1, blocks: byTab.get(Number(tab.id)) || [] }));
};

const createProductTabAdmin = async (productId, payload = {}) => {
  const now = new Date().toISOString();
  const result = await run(`INSERT INTO product_tabs (product_id, variant_id, title, code, enabled, sort_order, created_at, updated_at) VALUES (:productId, :variantId, :title, :code, :enabled, :sortOrder, :createdAt, :updatedAt)`, { productId: String(productId), variantId: payload.variantId == null || payload.variantId === "" ? null : Number(payload.variantId), title: String(payload.title || "Новая вкладка"), code: String(payload.code || "new_tab"), enabled: payload.enabled === false ? 0 : 1, sortOrder: Number(payload.sortOrder || 0), createdAt: now, updatedAt: now });
  return q1("SELECT id, product_id AS productId, variant_id AS variantId, title, code, enabled, sort_order AS sortOrder FROM product_tabs WHERE id = :id", { id: insertId(result) });
};

const updateProductTabAdmin = (tabId, patch = {}) => updateByMap("product_tabs", "id", tabId, patch, { title: "title", code: "code", enabled: "enabled", sortOrder: "sort_order" }, { enabled: (v) => v ? 1 : 0, sortOrder: (v) => Number(v || 0) });
const deleteProductTabAdmin = async (tabId) => rowsAffected(await run("DELETE FROM product_tabs WHERE id = :id", { id: Number(tabId) }));

const saveTabBlocksAdmin = async (tabId, blocks = []) => {
  const id = Number(tabId);
  const now = new Date().toISOString();
  const statements = [{ sql: "DELETE FROM product_tab_blocks WHERE tab_id = :tabId", args: { tabId: id } }];
  (Array.isArray(blocks) ? blocks : []).forEach((block, index) => statements.push({ sql: `INSERT INTO product_tab_blocks (tab_id, block_type, content_json, sort_order, created_at) VALUES (:tabId, :blockType, :contentJson, :sortOrder, :createdAt)`, args: { tabId: id, blockType: String(block?.blockType || "text"), contentJson: JSON.stringify(block?.content || {}), sortOrder: Number(block?.sortOrder ?? index), createdAt: now } }));
  await turso.batch(statements, "write");
  const rows = await q(`SELECT id, tab_id AS tabId, block_type AS blockType, content_json AS contentJson, sort_order AS sortOrder, created_at AS createdAt FROM product_tab_blocks WHERE tab_id = :tabId ORDER BY sort_order ASC, id ASC`, { tabId: id });
  return rows.map((row) => { let content = {}; try { content = JSON.parse(row.contentJson || "{}"); } catch { content = {}; } return { id: row.id, tabId: row.tabId, blockType: row.blockType, content, sortOrder: row.sortOrder, createdAt: row.createdAt }; });
};

const listAdminOrders = async ({ limit = 200, offset = 0, search = "", status = "", paymentStatus = "", paymentMethod = "", manager = "", deliveryMethod = "", dateFrom = "", dateTo = "" } = {}) => {
  const where = [];
  const args = { limit: Math.max(1, Math.min(500, Number(limit || 200))), offset: Math.max(0, Number(offset || 0)) };
  if (String(search || "").trim()) { where.push("(o.id LIKE :search OR o.customer_name LIKE :search OR o.customer_phone LIKE :search OR o.customer_email LIKE :search)"); args.search = `%${String(search).trim()}%`; }
  for (const [key, col] of Object.entries({ status: "status", paymentStatus: "payment_status", paymentMethod: "payment_method", manager: "manager", deliveryMethod: "delivery_method" })) {
    const value = { status, paymentStatus, paymentMethod, manager, deliveryMethod }[key];
    if (!String(value || "").trim()) continue;
    where.push(`o.${col} ${key === "manager" ? "LIKE" : "="} :${key}`);
    args[key] = key === "manager" ? `%${String(value).trim()}%` : String(value).trim();
  }
  if (String(dateFrom || "").trim()) { where.push("o.created_at >= :dateFrom"); args.dateFrom = String(dateFrom).trim(); }
  if (String(dateTo || "").trim()) { where.push("o.created_at <= :dateTo"); args.dateTo = String(dateTo).trim(); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await q(`
    SELECT o.id, o.created_at AS createdAt, o.updated_at AS updatedAt, o.customer_name AS customerName, o.customer_phone AS customerPhone, o.customer_email AS customerEmail, o.customer_address AS customerAddress, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.delivery_method AS deliveryMethod, o.manager, o.total, o.status, COUNT(oi.id) AS itemCount
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    ${whereSql}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT :limit OFFSET :offset
  `, args);
  const total = await q1(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`, omitKeys(args, ["limit", "offset"]));
  return { rows, total: Number(total?.c || 0) };
};

const getAdminOrderById = async (orderId) => {
  const id = String(orderId || "").trim();
  if (!id) return null;
  const order = await q1(`
    SELECT id, created_at AS createdAt, updated_at AS updatedAt, customer_name AS customerName, customer_phone AS customerPhone, customer_email AS customerEmail, customer_address AS customerAddress, payment_method AS paymentMethod, payment_status AS paymentStatus, delivery_method AS deliveryMethod, delivery_comment AS deliveryComment, manager, manager_comment AS managerComment, total, status, status_history_json AS statusHistoryJson, order_documents_json AS orderDocumentsJson
    FROM orders
    WHERE id = :id
    LIMIT 1
  `, { id });
  if (!order) return null;
  const items = await q(`SELECT id, product_id AS productId, name, article, price, qty, image FROM order_items WHERE order_id = :id ORDER BY id ASC`, { id });
  let statusHistory = [];
  let orderDocuments = [];
  try { statusHistory = JSON.parse(order.statusHistoryJson || "[]"); } catch { statusHistory = []; }
  try { orderDocuments = normalizeOrderDocumentsInput(JSON.parse(order.orderDocumentsJson || "[]")); } catch { orderDocuments = []; }
  return { ...order, items, statusHistory: Array.isArray(statusHistory) ? statusHistory : [], orderDocuments };
};

const updateAdminOrder = async (orderId, patch = {}) => {
  const id = String(orderId || "").trim();
  if (!id) return 0;
  const current = await getAdminOrderById(id);
  if (!current) return 0;
  const map = { status: "status", paymentStatus: "payment_status", paymentMethod: "payment_method", deliveryMethod: "delivery_method", manager: "manager", managerComment: "manager_comment", deliveryComment: "delivery_comment", orderDocuments: "order_documents_json" };
  const setParts = [];
  const args = { id, updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    setParts.push(`${col} = :${key}`);
    args[key] = key === "orderDocuments" ? JSON.stringify(normalizeOrderDocumentsInput(patch[key])) : String(patch[key] ?? "").trim();
  }
  const nextStatus = Object.prototype.hasOwnProperty.call(patch, "status") ? String(patch.status || "").trim() : current.status;
  const nextPaymentStatus = Object.prototype.hasOwnProperty.call(patch, "paymentStatus") ? String(patch.paymentStatus || "").trim() : current.paymentStatus;
  if (nextStatus !== current.status || nextPaymentStatus !== current.paymentStatus) {
    const history = Array.isArray(current.statusHistory) ? current.statusHistory.slice() : [];
    history.push({ at: args.updatedAt, by: "admin", status: nextStatus, paymentStatus: nextPaymentStatus });
    setParts.push("status_history_json = :statusHistoryJson");
    args.statusHistoryJson = JSON.stringify(history);
  }
  if (!setParts.length) return 0;
  setParts.push("updated_at = :updatedAt");
  const changes = rowsAffected(await run(`UPDATE orders SET ${setParts.join(", ")} WHERE id = :id`, args));
  if (changes) await writeAuditLog("update", "order", id, { patch });
  return changes;
};

const listAdminAuditLog = async ({ limit = 200, offset = 0, entityType = "", action = "" } = {}) => {
  const where = [];
  const args = { limit: Math.max(1, Math.min(500, Number(limit || 200))), offset: Math.max(0, Number(offset || 0)) };
  if (String(entityType || "").trim()) { where.push("entity_type = :entityType"); args.entityType = String(entityType).trim(); }
  if (String(action || "").trim()) { where.push("action = :action"); args.action = String(action).trim(); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = (await q(`SELECT id, created_at AS createdAt, actor, action, entity_type AS entityType, entity_id AS entityId, details_json AS detailsJson FROM audit_log ${whereSql} ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset`, args)).map((row) => {
    let details = {};
    try { details = JSON.parse(row.detailsJson || "{}"); } catch { details = {}; }
    return { id: row.id, createdAt: row.createdAt, actor: row.actor, action: row.action, entityType: row.entityType, entityId: row.entityId, details };
  });
  const total = await q1(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`, omitKeys(args, ["limit", "offset"]));
  return { rows, total: Number(total?.c || 0) };
};
const replaceAllProducts = notImplemented("replaceAllProducts");

module.exports = {
  dbPath,
  initSchema,
  listProducts,
  replaceAllProducts,
  getProductsForDetailEnrich: notImplemented("getProductsForDetailEnrich"),
  updateProductDetailsBatch: notImplemented("updateProductDetailsBatch"),
  listProductsForImageRetouch: notImplemented("listProductsForImageRetouch"),
  updateProductImagesBatch: notImplemented("updateProductImagesBatch"),
  listAdminProducts,
  listAdminProductsAdvanced,
  listAdminFilters,
  listBrandsAdmin, createBrandAdmin, updateBrandAdmin, deleteBrandAdmin,
  listSitePages, listSitePagesAdmin, getSitePageBySlug, createSitePage, updateSitePage, deleteSitePage,
  listFunctionalCategoriesAdmin, createFunctionalCategoryAdmin,
  updateFunctionalCategoryAdmin, deleteFunctionalCategoryAdmin,
  listBrandCategoriesAdmin, listBrandNativeCategoriesAdmin,
  createBrandCategoryAdmin, updateBrandCategoryAdmin, deleteBrandCategoryAdmin,
  listAttributesAdmin, createAttributeAdmin, updateAttributeAdmin, deleteAttributeAdmin,
  listCategoryAttributeTemplates, createCategoryAttributeTemplate,
  updateCategoryAttributeTemplate, deleteCategoryAttributeTemplate,
  getAdminProductById, getAdminProductDetails,
  createAdminProduct, updateAdminProduct, upsertAdminProduct, applyBulkAdminProducts,
  listProductVariantsAdmin, createProductVariantAdmin, updateProductVariantAdmin, deleteProductVariantAdmin,
  listProductMediaAdmin, saveProductMediaAdmin,
  listProductDocumentsAdmin, saveProductDocumentsAdmin,
  listProductTabsAdmin, createProductTabAdmin, updateProductTabAdmin, deleteProductTabAdmin,
  saveTabBlocksAdmin,
  listAdminAuditLog,
  listAdminOrders,
  listPublicOrdersByIds,
  listPublicOrdersByLookup,
  getAdminOrderById, updateAdminOrder,
  getLatestExchangeRate,
  upsertExchangeRate,
  recalculateProductPriceRub,
  rebuildCatalogConflicts,
  createOrder,
  getStats,
};
