#!/usr/bin/env node
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "shop.db");
const db = new Database(dbPath);
const now = new Date().toISOString();

const KNOWN_REPLACEMENTS = [
  {
    bad: "?????? ? ???????????",
    good: "Кабели и переходники",
    columns: ["group_name", "commercial_subgroup", "brand_subcategory"]
  },
  {
    bad: "Р\u2018РµР· РєР°С‚РµРіРѕСЂРёРё",
    good: "Без категории",
    columns: ["category", "commercial_group"]
  }
];

function applyReplacement(rule) {
  let changed = 0;
  for (const column of rule.columns) {
    const sql = `
      UPDATE products
      SET ${column} = @good,
          updated_at = @now
      WHERE COALESCE(${column}, '') = @bad
    `;
    const run = db.prepare(sql).run({ bad: rule.bad, good: rule.good, now });
    changed += Number(run.changes || 0);
  }
  return changed;
}

let totalChanges = 0;
for (const rule of KNOWN_REPLACEMENTS) {
  totalChanges += applyReplacement(rule);
}

const leftovers = db.prepare(`
  SELECT
    SUM(CASE WHEN COALESCE(group_name,'') LIKE '%?%' THEN 1 ELSE 0 END) AS badGroup,
    SUM(CASE WHEN COALESCE(commercial_subgroup,'') LIKE '%?%' THEN 1 ELSE 0 END) AS badCommercialSubgroup,
    SUM(CASE WHEN COALESCE(brand_subcategory,'') LIKE '%?%' THEN 1 ELSE 0 END) AS badBrandSubcategory,
    SUM(CASE WHEN COALESCE(category,'') LIKE '%?%' THEN 1 ELSE 0 END) AS badCategory
  FROM products
`).get();

console.log(JSON.stringify({
  ok: true,
  dbPath,
  totalChanges,
  leftovers
}, null, 2));
