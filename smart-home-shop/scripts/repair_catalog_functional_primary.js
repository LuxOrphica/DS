"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const REPORTS_DIR = path.join(ROOT, "reports");
const APPLY = process.argv.includes("--apply");

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`;
}

function findCandidates(db) {
  return db.prepare(`
    SELECT
      p.id,
      p.article,
      p.name,
      p.brand,
      p.category,
      SUM(CASE WHEN COALESCE(pfc.is_primary, 0) = 1 THEN 1 ELSE 0 END) AS primaryCount,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(pfc.category_name, ''))) = LOWER(TRIM(COALESCE(p.category, ''))) THEN 1 ELSE 0 END) AS hasProductCategoryLink,
      GROUP_CONCAT(pfc.category_name || ':' || COALESCE(pfc.is_primary, 0), ' | ') AS links
    FROM products p
    LEFT JOIN product_function_categories pfc ON pfc.product_id = p.id
    WHERE TRIM(COALESCE(p.category, '')) <> ''
    GROUP BY p.id
    HAVING primaryCount <> 1 OR hasProductCategoryLink = 0
    ORDER BY p.category, p.brand, p.article, p.id
  `).all();
}

function repair(db, candidates) {
  const now = new Date().toISOString();
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO product_function_categories (
      product_id, category_name, is_primary, sort_order, created_at, updated_at
    ) VALUES (
      @productId, @categoryName, 0, 0, @createdAt, @updatedAt
    )
  `);
  const clearAndSetPrimary = db.prepare(`
    UPDATE product_function_categories
    SET
      is_primary = CASE
        WHEN LOWER(TRIM(category_name)) = LOWER(TRIM(@categoryName)) THEN 1
        ELSE 0
      END,
      sort_order = CASE
        WHEN LOWER(TRIM(category_name)) = LOWER(TRIM(@categoryName)) THEN 0
        ELSE sort_order + 1
      END,
      updated_at = @updatedAt
    WHERE product_id = @productId
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      const params = {
        productId: String(item.id),
        categoryName: String(item.category || "").trim(),
        createdAt: now,
        updatedAt: now
      };
      insertCategory.run(params);
      clearAndSetPrimary.run(params);
    }
  });
  tx(candidates);
}

function main() {
  const db = new Database(DB_PATH, { timeout: 10_000 });
  try {
    const before = findCandidates(db);
    if (APPLY && before.length) repair(db, before);
    const after = findCandidates(db);

    const report = {
      ok: after.length === 0,
      mode: APPLY ? "apply" : "dry-run",
      dbPath: DB_PATH,
      checkedAt: new Date().toISOString(),
      candidatesBefore: before.length,
      candidatesAfter: after.length,
      samplesBefore: before.slice(0, 50),
      samplesAfter: after.slice(0, 50)
    };

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const reportFile = path.join(REPORTS_DIR, `catalog_functional_primary_repair_${nowStamp()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");

    console.log(JSON.stringify({
      ok: report.ok,
      mode: report.mode,
      candidatesBefore: report.candidatesBefore,
      candidatesAfter: report.candidatesAfter,
      reportFile
    }, null, 2));

    if (!report.ok) process.exitCode = APPLY ? 1 : 0;
  } finally {
    db.close();
  }
}

main();
