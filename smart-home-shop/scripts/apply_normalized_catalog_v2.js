#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { dbPath, initSchema } = require('../db/database');

const DEFAULT_CSV = path.join(__dirname, '..', 'reports', 'functional_catalog_products.normalized.v2.csv');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(value);
      value = '';
      continue;
    }
    if (ch === '\n') {
      row.push(value.replace(/\r$/, ''));
      value = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
      row = [];
      continue;
    }
    value += ch;
  }
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function normalize(value) {
  return String(value || '').trim();
}

function boolFromCsv(value) {
  const v = normalize(value).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function normKey(value) {
  return normalize(value).toLowerCase();
}

function addColumnIfMissing(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => String(c.name).toLowerCase() === String(column).toLowerCase())) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function ensureNormalizationColumns(db) {
  addColumnIfMissing(db, 'products', 'entity_type', "TEXT DEFAULT 'product'");
  addColumnIfMissing(db, 'products', 'product_name_ru', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'product_name_en', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'display_name', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'base_article', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'revision', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'system_domain', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'device_type', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'commercial_group', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'commercial_subgroup', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'is_active_normalized', 'INTEGER DEFAULT 1');
  addColumnIfMissing(db, 'products', 'source_category', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'source_subcategory', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'source_label', "TEXT DEFAULT ''");
  addColumnIfMissing(db, 'products', 'normalization_status', "TEXT DEFAULT 'needs_review'");
  addColumnIfMissing(db, 'products', 'normalization_note', "TEXT DEFAULT ''");
}

function parseRows(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error('CSV is empty');
  const header = rows[0].map((h) => normalize(h));
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const required = [
    'entity_id', 'entity_type', 'brand', 'product_name_ru', 'product_name_en', 'display_name',
    'article', 'base_article', 'revision', 'system_domain', 'device_type', 'commercial_group',
    'commercial_subgroup', 'is_active', 'source_category', 'source_subcategory', 'source_label',
    'normalization_status', 'normalization_note', 'created_at', 'updated_at'
  ];
  for (const col of required) {
    if (!Object.prototype.hasOwnProperty.call(idx, col)) {
      throw new Error(`Missing CSV column: ${col}`);
    }
  }
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const rec = {
      entityId: normalize(row[idx.entity_id]),
      entityType: normalize(row[idx.entity_type]) || 'product',
      brand: normalize(row[idx.brand]),
      productNameRu: normalize(row[idx.product_name_ru]),
      productNameEn: normalize(row[idx.product_name_en]),
      displayName: normalize(row[idx.display_name]),
      article: normalize(row[idx.article]),
      baseArticle: normalize(row[idx.base_article]),
      revision: normalize(row[idx.revision]),
      systemDomain: normalize(row[idx.system_domain]),
      deviceType: normalize(row[idx.device_type]),
      commercialGroup: normalize(row[idx.commercial_group]),
      commercialSubgroup: normalize(row[idx.commercial_subgroup]),
      isActive: boolFromCsv(row[idx.is_active]),
      sourceCategory: normalize(row[idx.source_category]),
      sourceSubcategory: normalize(row[idx.source_subcategory]),
      sourceLabel: normalize(row[idx.source_label]),
      normalizationStatus: normalize(row[idx.normalization_status]) || 'needs_review',
      normalizationNote: normalize(row[idx.normalization_note]),
      createdAt: normalize(row[idx.created_at]),
      updatedAt: normalize(row[idx.updated_at])
    };
    if (!rec.entityId) continue;
    out.push(rec);
  }
  return out;
}

function recalcConflicts(db) {
  const rows = db.prepare(`
    SELECT id, COALESCE(brand,'') AS brand, COALESCE(article,'') AS article, COALESCE(name,'') AS name,
           COALESCE(category,'') AS category, COALESCE(group_name,'') AS groupName,
           COALESCE(normalization_status,'') AS normalizationStatus
    FROM products
  `).all();

  const byBrandArticle = new Map();
  const notesById = new Map();
  for (const row of rows) {
    const brand = normKey(row.brand);
    const article = normKey(row.article);
    if (!brand || !article) continue;
    const key = `${brand}::${article}`;
    const bucket = byBrandArticle.get(key) || [];
    bucket.push(row);
    byBrandArticle.set(key, bucket);
  }

  function addNote(id, note) {
    if (!id || !note) return;
    const s = notesById.get(id) || new Set();
    s.add(note);
    notesById.set(id, s);
  }

  for (const bucket of byBrandArticle.values()) {
    if (bucket.length <= 1) continue;
    const names = new Set(bucket.map((x) => normKey(x.name)).filter(Boolean));
    const groups = new Set(bucket.map((x) => normKey(x.category + '|' + x.groupName)).filter(Boolean));
    let reason = 'Р”СѓР±Р»РёРєР°С‚ Р°СЂС‚РёРєСѓР»Р° РІ СЂР°РјРєР°С… Р±СЂРµРЅРґР°';
    if (names.size > 1) reason += ' (СЂР°Р·РЅС‹Рµ РЅР°Р·РІР°РЅРёСЏ)';
    else if (groups.size > 1) reason += ' (СЂР°Р·РЅС‹Рµ РєР°С‚РµРіРѕСЂРёРё)';
    for (const row of bucket) addNote(row.id, reason);
  }

  for (const row of rows) {
    const status = normKey(row.normalizationStatus);
    if (status && status !== 'normalized') {
      addNote(row.id, `РўСЂРµР±СѓРµС‚ РїСЂРѕРІРµСЂРєРё РЅРѕСЂРјР°Р»РёР·Р°С†РёРё: ${row.normalizationStatus}`);
    }
  }

  const clear = db.prepare("UPDATE products SET is_conflict = 0, conflict_note = ''");
  const set = db.prepare('UPDATE products SET is_conflict = 1, conflict_note = ? WHERE id = ?');
  const tx = db.transaction(() => {
    clear.run();
    for (const [id, notes] of notesById.entries()) {
      set.run(Array.from(notes).join('; '), id);
    }
  });
  tx();
  return { flagged: notesById.size, duplicateGroups: Array.from(byBrandArticle.values()).filter((g) => g.length > 1).length };
}

function applyNormalized(csvPath) {
  initSchema();
  const db = new Database(dbPath, { timeout: 10000 });
  db.pragma('journal_mode = WAL');
  ensureNormalizationColumns(db);

  const rows = parseRows(csvPath);
  const byId = new Map(db.prepare('SELECT id FROM products').all().map((r) => [String(r.id), true]));
  const byBrandArticle = new Map(
    db
      .prepare("SELECT id, LOWER(TRIM(COALESCE(brand,''))) AS b, LOWER(TRIM(COALESCE(article,''))) AS a FROM products")
      .all()
      .filter((r) => r.b && r.a)
      .map((r) => [`${r.b}::${r.a}`, String(r.id)])
  );

  const updateStmt = db.prepare(`
    UPDATE products
    SET
      article = @article,
      name = @name,
      brand = @brand,
      category = @category,
      group_name = @groupName,
      brand_subcategory = @brandSubcategory,
      entity_type = @entityType,
      product_name_ru = @productNameRu,
      product_name_en = @productNameEn,
      display_name = @displayName,
      base_article = @baseArticle,
      revision = @revision,
      system_domain = @systemDomain,
      device_type = @deviceType,
      commercial_group = @commercialGroup,
      commercial_subgroup = @commercialSubgroup,
      is_active_normalized = @isActiveNormalized,
      source_category = @sourceCategory,
      source_subcategory = @sourceSubcategory,
      source_label = @sourceLabel,
      normalization_status = @normalizationStatus,
      normalization_note = @normalizationNote,
      status = @status,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  const insertStmt = db.prepare(`
    INSERT INTO products (
      id, article, name, price, price_currency, price_rub, price_text, category, group_name, brand, image, source_url,
      description, specs, breadcrumbs, description_html, gallery_json, attributes_json, documents_json,
      brand_subcategory, system_type, protocol, mounting, supply_voltage, channels, nominal_current, nominal_power,
      sensor_type, indoor_outdoor, ip_rating, io_count, web_interface, scenario_support, load_type, max_load,
      status, is_extra, is_brand_featured,
      entity_type, product_name_ru, product_name_en, display_name, base_article, revision,
      system_domain, device_type, commercial_group, commercial_subgroup, is_active_normalized,
      source_category, source_subcategory, source_label, normalization_status, normalization_note,
      updated_at
    ) VALUES (
      @id, @article, @name, NULL, 'RUB', NULL, '', @category, @groupName, @brand, '', '',
      '', '', '', '', '[]', '[]', '[]',
      @brandSubcategory, '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '',
      @status, 0, 0,
      @entityType, @productNameRu, @productNameEn, @displayName, @baseArticle, @revision,
      @systemDomain, @deviceType, @commercialGroup, @commercialSubgroup, @isActiveNormalized,
      @sourceCategory, @sourceSubcategory, @sourceLabel, @normalizationStatus, @normalizationNote,
      @updatedAt
    )
  `);

  const deletePfcStmt = db.prepare('DELETE FROM product_function_categories WHERE product_id = ?');
  const insertPfcStmt = db.prepare(`
    INSERT OR IGNORE INTO product_function_categories (
      product_id, category_name, is_primary, sort_order, created_at, updated_at
    ) VALUES (?, ?, 1, 0, ?, ?)
  `);

  const now = new Date().toISOString();
  const stats = { total: rows.length, updated: 0, inserted: 0, categoryLinked: 0 };
  const touched = [];

  const tx = db.transaction(() => {
    for (const rec of rows) {
      const key = `${normKey(rec.brand)}::${normKey(rec.article)}`;
      const id = byId.get(rec.entityId) ? rec.entityId : (byBrandArticle.get(key) || rec.entityId);
      const name = rec.displayName || rec.productNameRu || rec.article || id;
      const params = {
        id,
        article: rec.article,
        name,
        brand: rec.brand,
        category: rec.commercialGroup,
        groupName: rec.commercialSubgroup,
        brandSubcategory: rec.commercialSubgroup,
        entityType: rec.entityType,
        productNameRu: rec.productNameRu,
        productNameEn: rec.productNameEn,
        displayName: rec.displayName,
        baseArticle: rec.baseArticle,
        revision: rec.revision,
        systemDomain: rec.systemDomain,
        deviceType: rec.deviceType,
        commercialGroup: rec.commercialGroup,
        commercialSubgroup: rec.commercialSubgroup,
        isActiveNormalized: rec.isActive ? 1 : 0,
        sourceCategory: rec.sourceCategory,
        sourceSubcategory: rec.sourceSubcategory,
        sourceLabel: rec.sourceLabel,
        normalizationStatus: rec.normalizationStatus,
        normalizationNote: rec.normalizationNote,
        status: rec.isActive ? 'active' : 'hidden',
        updatedAt: rec.updatedAt || now
      };

      if (byId.get(id)) {
        updateStmt.run(params);
        stats.updated += 1;
      } else {
        insertStmt.run(params);
        byId.set(id, true);
        if (key !== '::') byBrandArticle.set(key, id);
        stats.inserted += 1;
      }

      touched.push({ id, category: rec.commercialGroup, updatedAt: params.updatedAt });
    }

    for (const item of touched) {
      deletePfcStmt.run(item.id);
      if (item.category) {
        insertPfcStmt.run(item.id, item.category, item.updatedAt, item.updatedAt);
        stats.categoryLinked += 1;
      }
    }
  });

  tx();
  const conflicts = recalcConflicts(db);
  db.close();

  return { ...stats, ...conflicts, csvPath };
}

function main() {
  const arg = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV;
  if (!fs.existsSync(arg)) {
    throw new Error(`CSV not found: ${arg}`);
  }
  const result = applyNormalized(arg);
  const reportPath = path.join(path.dirname(arg), 'apply_normalized_catalog_v2.report.json');
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, reportPath, ...result }, null, 2));
}

if (require.main === module) {
  main();
}
