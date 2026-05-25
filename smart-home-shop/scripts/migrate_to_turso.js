#!/usr/bin/env node
// One-time migration: local shop.db to Turso.
// Usage: node scripts/migrate_to_turso.js
require("dotenv").config();
const Database = require("better-sqlite3");
const { createClient } = require("@libsql/client");
const path = require("path");

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Set TURSO_URL and TURSO_TOKEN in .env");
  process.exit(1);
}

const local = new Database(path.join(__dirname, "../data/shop.db"), { readonly: true });
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const TABLES = [
  "products",
  "orders",
  "order_items",
  "exchange_rates",
  "product_variants",
  "product_media",
  "product_documents",
  "product_tabs",
  "tab_blocks",
  "functional_categories",
  "product_function_categories",
  "brand_categories",
  "product_brand_categories",
  "brand_native_categories",
  "category_attribute_templates",
  "audit_log",
];

async function migrateTable(table) {
  let rows;
  try {
    rows = local.prepare(`SELECT * FROM ${table}`).all();
  } catch {
    console.log(`  skip ${table} (not found locally)`);
    return 0;
  }
  if (rows.length === 0) {
    console.log(`  skip ${table} (empty)`);
    return 0;
  }

  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const statements = batch.map(row => ({
      sql,
      args: cols.map(c => row[c] ?? null),
    }));
    await turso.batch(statements, "write");
    inserted += batch.length;
    process.stdout.write(`\r  ${table}: ${inserted}/${rows.length}`);
  }
  console.log(`\r  ${table}: ${inserted} rows ok`);
  return inserted;
}

async function main() {
  console.log("Connecting to Turso...");
  await turso.execute("SELECT 1");
  console.log("Connected.\n");

  let total = 0;
  for (const table of TABLES) {
    total += await migrateTable(table);
  }

  console.log(`\nDone. Total rows migrated: ${total}`);
  local.close();
}

main().catch(err => { console.error(err); process.exit(1); });
