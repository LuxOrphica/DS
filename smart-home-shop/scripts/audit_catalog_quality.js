"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const REPORTS_DIR = path.join(ROOT, "reports");

function stamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`;
}

function toText(v) {
  return String(v == null ? "" : v).trim();
}

function lower(v) {
  return toText(v).toLowerCase();
}

function parseJsonList(raw) {
  const s = toText(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasMojibake(v) {
  const s = toText(v);
  if (!s) return false;
  return /(?:Р.|С.){3,}|Гђ|Г‘|Ã.|Ð.|Ñ.|�/u.test(s);
}

function hasCid(v) {
  return /(?:\(|\s|^)cid:\d+(?:\)|\s|$)/i.test(toText(v));
}

function normalizeAttrKey(v) {
  return lower(v)
    .replace(/[.:;,/()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAttrVal(v) {
  return toText(v).replace(/\s+/g, " ");
}

function pushIssue(list, issue) {
  list.push({
    severity: issue.severity || "warning",
    code: issue.code || "unknown",
    id: issue.id || "",
    article: issue.article || "",
    brand: issue.brand || "",
    name: issue.name || "",
    field: issue.field || "",
    details: issue.details || ""
  });
}

function buildCsv(rows) {
  const header = ["severity", "code", "id", "article", "brand", "name", "field", "details"];
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, "\"\"")}"`;
  const lines = [header.map(esc).join(",")];
  for (const row of rows) lines.push(header.map((k) => esc(row[k])).join(","));
  return lines.join("\n");
}

function hasRevisionMarker(rowLike) {
  const s = [
    rowLike?.id,
    rowLike?.article,
    rowLike?.name
  ]
    .map((x) => lower(x))
    .join(" ");
  return /\bv\d+\b|(?:^|\b)(case|kit|set|mini|th)(?:\b|$)/i.test(s);
}

function shouldIgnoreDuplicateBrandArticle(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const activeRows = rows.filter((r) => Number(r.isActiveNormalized || 0) !== 0);
  if (activeRows.length <= 1) return true;
  const articles = new Set(rows.map((r) => toText(r.article).toUpperCase()).filter(Boolean));
  if (articles.size !== 1) return false;
  const hasAnyRevision = activeRows.some((r) => hasRevisionMarker(r));
  if (!hasAnyRevision) return false;
  const nonEmptyRevisions = activeRows.map((r) => toText(r.revision)).filter(Boolean);
  const uniqueRevisions = new Set(nonEmptyRevisions.map((x) => x.toLowerCase()));
  if (nonEmptyRevisions.length === activeRows.length && uniqueRevisions.size === activeRows.length) return true;
  return true;
}

function shouldIgnoreDuplicateBrandName(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const activeRows = rows.filter((r) => Number(r.isActiveNormalized || 0) !== 0);
  if (activeRows.length <= 1) return true;
  const nonEmptyArticles = activeRows.map((r) => toText(r.article).toUpperCase()).filter(Boolean);
  const distinctArticles = new Set(nonEmptyArticles);
  // Same visible name but different article means separate SKU/variation.
  if (distinctArticles.size > 1) return true;
  return false;
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const db = new Database(DB_PATH, { readonly: true, timeout: 10000 });

  const products = db
    .prepare(
      `
      SELECT
        id, article, name, brand,
        revision, is_active_normalized AS isActiveNormalized,
        price, price_currency AS priceCurrency, price_rub AS priceRub,
        category, group_name AS groupName,
        description, specs,
        attributes_json AS attributesJson,
        updated_at AS updatedAt
      FROM products
      ORDER BY brand, article, id
    `
    )
    .all();

  const rate = db
    .prepare(
      `
      SELECT rate
      FROM exchange_rates
      WHERE base = 'EUR' AND quote = 'RUB'
      ORDER BY effective_date DESC, updated_at DESC
      LIMIT 1
    `
    )
    .get();
  const eurRubRate = Number(rate?.rate || 0);

  const issues = [];
  const byBrandArticle = new Map();
  const byNameBrand = new Map();

  for (const p of products) {
    const id = toText(p.id);
    const article = toText(p.article);
    const brand = toText(p.brand);
    const name = toText(p.name);
    const price = Number(p.price);
    const priceRub = Number(p.priceRub);
    const currency = toText(p.priceCurrency || "RUB").toUpperCase() || "RUB";

    const fieldsToCheck = [
      ["name", p.name],
      ["category", p.category],
      ["group_name", p.groupName],
      ["description", p.description],
      ["specs", p.specs]
    ];
    for (const [field, val] of fieldsToCheck) {
      if (hasMojibake(val)) {
        pushIssue(issues, { severity: "warning", code: "mojibake", id, article, brand, name, field, details: "Suspicious encoding sequence" });
      }
      if (hasCid(val)) {
        pushIssue(issues, { severity: "error", code: "cid_token", id, article, brand, name, field, details: "Contains cid:* artifacts" });
      }
    }

    const attrs = parseJsonList(p.attributesJson);
    const keyCounts = new Map();
    const pairCounts = new Map();
    for (const a of attrs) {
      const k = normalizeAttrKey(a?.name || a?.key || "");
      const v = normalizeAttrVal(a?.value || "");
      if (!k) continue;
      keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
      const pairKey = `${k}||${v}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      if (hasMojibake(a?.name) || hasMojibake(a?.value)) {
        pushIssue(issues, { severity: "warning", code: "mojibake_attr", id, article, brand, name, field: "attributes_json", details: `Bad encoding in attribute "${toText(a?.name)}"` });
      }
      if (hasCid(a?.value)) {
        pushIssue(issues, { severity: "error", code: "cid_attr", id, article, brand, name, field: "attributes_json", details: `cid token in "${toText(a?.name)}"` });
      }
    }
    for (const [k, n] of keyCounts) {
      if (n > 1) {
        pushIssue(issues, { severity: "warning", code: "duplicate_attr_key", id, article, brand, name, field: "attributes_json", details: `${k} x${n}` });
      }
    }
    for (const [k, n] of pairCounts) {
      if (n > 1) {
        pushIssue(issues, { severity: "warning", code: "duplicate_attr_pair", id, article, brand, name, field: "attributes_json", details: `${k} x${n}` });
      }
    }

    const baKey = `${lower(brand)}||${article.toUpperCase()}`;
    if (!byBrandArticle.has(baKey)) byBrandArticle.set(baKey, []);
    byBrandArticle.get(baKey).push({
      id,
      article,
      name,
      brand,
      revision: toText(p.revision),
      isActiveNormalized: Number(p.isActiveNormalized || 0),
      price,
      priceRub,
      currency
    });

    const nbKey = `${lower(brand)}||${lower(name)}`;
    if (!byNameBrand.has(nbKey)) byNameBrand.set(nbKey, []);
    byNameBrand.get(nbKey).push({
      id,
      article,
      name,
      brand,
      revision: toText(p.revision),
      isActiveNormalized: Number(p.isActiveNormalized || 0),
      price,
      priceRub,
      currency
    });

    if (!["RUB", "EUR"].includes(currency)) {
      pushIssue(issues, { severity: "error", code: "unknown_currency", id, article, brand, name, field: "price_currency", details: currency });
    }

    const isLoxone = lower(brand).includes("loxone");
    if (isLoxone && currency !== "EUR") {
      pushIssue(issues, { severity: "warning", code: "loxone_not_eur", id, article, brand, name, field: "price_currency", details: currency || "-" });
    }
    if (!isLoxone && currency === "EUR") {
      pushIssue(issues, { severity: "warning", code: "non_loxone_eur", id, article, brand, name, field: "price_currency", details: "EUR outside Loxone brand" });
    }

    if (Number.isFinite(price) && price > 0 && currency === "EUR" && Number.isFinite(eurRubRate) && eurRubRate > 0) {
      const expected = Math.round(price * eurRubRate * 100) / 100;
      if (!Number.isFinite(priceRub) || Math.abs(priceRub - expected) > 1.5) {
        pushIssue(issues, {
          severity: "warning",
          code: "price_rub_mismatch",
          id,
          article,
          brand,
          name,
          field: "price_rub",
          details: `actual=${Number.isFinite(priceRub) ? priceRub : "null"}, expected~=${expected}`
        });
      }
    }
  }

  for (const [k, rows] of byBrandArticle) {
    if (rows.length > 1) {
      if (shouldIgnoreDuplicateBrandArticle(rows)) continue;
      const [brandKey, article] = k.split("||");
      pushIssue(issues, {
        severity: "error",
        code: "duplicate_brand_article",
        brand: brandKey,
        article,
        details: rows.map((x) => x.id).join(", ")
      });
    }
  }

  for (const [k, rows] of byNameBrand) {
    if (rows.length > 1) {
      if (shouldIgnoreDuplicateBrandName(rows)) continue;
      const [brandKey, name] = k.split("||");
      pushIssue(issues, {
        severity: "warning",
        code: "duplicate_brand_name",
        brand: brandKey,
        name,
        details: rows.map((x) => x.id).join(", ")
      });
    }
  }

  const countsByCode = {};
  const countsBySeverity = {};
  for (const i of issues) {
    countsByCode[i.code] = (countsByCode[i.code] || 0) + 1;
    countsBySeverity[i.severity] = (countsBySeverity[i.severity] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dbPath: DB_PATH,
    productsTotal: products.length,
    eurRubRate: Number.isFinite(eurRubRate) && eurRubRate > 0 ? eurRubRate : null,
    issuesTotal: issues.length,
    countsBySeverity,
    countsByCode,
    topIssues: issues.slice(0, 500)
  };

  const ts = stamp();
  const jsonPath = path.join(REPORTS_DIR, `catalog_quality_${ts}.json`);
  const csvPath = path.join(REPORTS_DIR, `catalog_quality_${ts}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(csvPath, buildCsv(issues), "utf8");

  console.log(`Quality audit done. Products: ${products.length}, issues: ${issues.length}`);
  console.log(`Report JSON: ${jsonPath}`);
  console.log(`Report CSV: ${csvPath}`);
  console.log(`Severity: ${JSON.stringify(countsBySeverity)}`);
  console.log(`Top codes:`);
  Object.entries(countsByCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([code, n]) => console.log(`- ${code}: ${n}`));
}

main();
