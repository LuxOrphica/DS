"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const REPORTS_DIR = path.join(ROOT, "reports");

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

function toText(v) {
  return String(v || "").trim();
}

function lower(v) {
  return toText(v).toLowerCase();
}

function isUrl(v) {
  return /^https?:\/\//i.test(toText(v));
}

function parseHost(v) {
  if (!isUrl(v)) return "";
  try {
    return new URL(v).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
}

function parseJsonSafe(raw) {
  if (!toText(raw)) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function hasMojibake(v) {
  const s = toText(v);
  if (!s) return false;
  if (s.includes("\uFFFD")) return true;
  if (/(?:Р.|С.){3,}/.test(s)) return true;
  if (/(?:Ã.|â.){3,}/.test(s)) return true;
  return false;
}

function imageState(imageValue) {
  const s = toText(imageValue);
  if (!s) return "missing";
  const low = s.toLowerCase();
  if (
    low.includes("via.placeholder.com") ||
    low.includes("placeholder") ||
    low.includes("no-image") ||
    low.includes("no_photo")
  ) {
    return "placeholder";
  }
  return "ok";
}

function normalizeBrand(v) {
  return toText(v).toLowerCase();
}

function normalizeSkuLike(v) {
  return toText(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function addIssue(list, issue) {
  list.push({
    severity: issue.severity || "warning",
    code: issue.code || "unknown",
    id: issue.id || "",
    article: issue.article || "",
    brand: issue.brand || "",
    name: issue.name || "",
    message: issue.message || ""
  });
}

function buildAllowedHostsMap() {
  return new Map([
    ["larnitech", new Set(["larnitech.com", "www.larnitech.com", "larnitech-rus.ru", "www.larnitech-rus.ru"])],
    ["hite pro", new Set(["hite-pro.ru", "www.hite-pro.ru"])],
    ["loxone", new Set(["loxone.com", "www.loxone.com", "smart-port.ru", "www.smart-port.ru"])],
    ["wiren board", new Set(["wirenboard.com", "www.wirenboard.com"])]
  ]);
}

function checkUnitScripts(rows) {
  const fields = [
    { name: "supply_voltage", latin: /\d[\d\s.,-]*(?:v|vac|vdc)\b/i, cyr: /\d[\d\s.,-]*в\b/i },
    { name: "nominal_power", latin: /\d[\d\s.,-]*w\b/i, cyr: /\d[\d\s.,-]*вт\b/i },
    { name: "nominal_current", latin: /\d[\d\s.,-]*a\b/i, cyr: /\d[\d\s.,-]*а\b/i },
    { name: "max_load", latin: /\d[\d\s.,-]*(?:w|a)\b/i, cyr: /\d[\d\s.,-]*(?:вт|а)\b/i }
  ];
  const out = [];
  for (const f of fields) {
    let latinCount = 0;
    let cyrCount = 0;
    for (const r of rows) {
      const v = toText(r[f.name]);
      if (!v) continue;
      if (f.latin.test(v)) latinCount += 1;
      if (f.cyr.test(v)) cyrCount += 1;
    }
    if (latinCount > 0 && cyrCount > 0) {
      out.push({
        field: f.name,
        latinCount,
        cyrCount
      });
    }
  }
  return out;
}

function hasRevisionMarker(rowLike) {
  const s = [rowLike?.revision, rowLike?.article, rowLike?.name]
    .map((x) => lower(x))
    .join(" ");
  return /\bv\d+\b|(?:^|\b)(case|kit|set|mini|th)(?:\b|$)/i.test(s);
}

function shouldIgnoreDuplicateBrandArticleRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const activeRows = rows.filter((r) => Number(r.isActiveNormalized || 0) !== 0);
  if (activeRows.length <= 1) return true;
  const nonEmptyRevisions = activeRows.map((r) => toText(r.revision)).filter(Boolean);
  const uniqueRevisions = new Set(nonEmptyRevisions.map((x) => x.toLowerCase()));
  if (nonEmptyRevisions.length === activeRows.length && uniqueRevisions.size === activeRows.length) return true;
  if (activeRows.every((r) => hasRevisionMarker(r))) return true;
  return false;
}

function main() {
  const db = new Database(DB_PATH, { readonly: true, timeout: 10000 });
  const rows = db
    .prepare(
      `
      SELECT
        id, article, name, brand, entity_type, revision, is_active_normalized,
        category, group_name,
        image, source_url, description, specs,
        attributes_json, documents_json, gallery_json,
        supply_voltage, nominal_power, nominal_current, max_load
      FROM products
      ORDER BY brand, article, id
    `
    )
    .all();

  const issues = [];
  const byBrandArticle = new Map();
  const allowedHostsByBrand = buildAllowedHostsMap();

  for (const row of rows) {
    const id = toText(row.id);
    const article = toText(row.article);
    const name = toText(row.name);
    const brand = toText(row.brand);
    const category = toText(row.category);
    const groupName = toText(row.group_name);
    const sourceUrl = toText(row.source_url);
    const entityType = lower(row.entity_type);
    const isService = entityType === "service" || id.startsWith("service-") || id.startsWith("direction-");

    if (!id) {
      addIssue(issues, { severity: "error", code: "missing_id", message: "Empty id" });
      continue;
    }
    if (!article) {
      addIssue(issues, {
        severity: "error",
        code: "missing_article",
        id,
        brand,
        name,
        message: "Product has empty article"
      });
    }
    if (!name) {
      addIssue(issues, {
        severity: "error",
        code: "missing_name",
        id,
        article,
        brand,
        message: "Product has empty name"
      });
    }

    if (article && name && normalizeBrand(brand) === "larnitech") {
      const artNorm = normalizeSkuLike(article);
      const nameNorm = normalizeSkuLike(name);
      const articleBase = normalizeSkuLike(article.split("-")[0]);
      const hasArticleInName =
        nameNorm.includes(artNorm) ||
        (articleBase && nameNorm.includes(articleBase));
      if (!hasArticleInName) {
        addIssue(issues, {
          severity: "warning",
          code: "name_article_mismatch",
          id,
          article,
          brand,
          name,
          message: "Name does not include article"
        });
      }
    }

    const isActiveNormalized = Number(row.is_active_normalized || 0);

    if (!sourceUrl && !isService) {
      addIssue(issues, {
        severity: "warning",
        code: "missing_source_url",
        id,
        article,
        brand,
        name,
        message: "source_url is empty"
      });
    } else if (isUrl(sourceUrl) && !isService) {
      const host = parseHost(sourceUrl);
      const allowed = allowedHostsByBrand.get(normalizeBrand(brand));
      if (allowed && host && !allowed.has(host)) {
        addIssue(issues, {
          severity: "warning",
          code: "source_brand_host_mismatch",
          id,
          article,
          brand,
          name,
          message: `Host ${host} does not match brand ${brand}`
        });
      }
    }

    const imgState = imageState(row.image);
    if (imgState === "missing" && !isService) {
      addIssue(issues, {
        severity: "warning",
        code: "missing_image",
        id,
        article,
        brand,
        name,
        message: "Main image is empty"
      });
    } else if (imgState === "placeholder") {
      addIssue(issues, {
        severity: "warning",
        code: "placeholder_image",
        id,
        article,
        brand,
        name,
        message: "Main image looks like placeholder"
      });
    }

    const attrs = parseJsonSafe(row.attributes_json);
    if (!attrs.ok) {
      addIssue(issues, {
        severity: "error",
        code: "invalid_attributes_json",
        id,
        article,
        brand,
        name,
        message: attrs.error
      });
    }

    const docs = parseJsonSafe(row.documents_json);
    if (!docs.ok) {
      addIssue(issues, {
        severity: "error",
        code: "invalid_documents_json",
        id,
        article,
        brand,
        name,
        message: docs.error
      });
    }

    const gallery = parseJsonSafe(row.gallery_json);
    if (!gallery.ok) {
      addIssue(issues, {
        severity: "error",
        code: "invalid_gallery_json",
        id,
        article,
        brand,
        name,
        message: gallery.error
      });
    }

    if (hasMojibake(name) || hasMojibake(category) || hasMojibake(groupName) || hasMojibake(row.description) || hasMojibake(row.specs)) {
      addIssue(issues, {
        severity: "warning",
        code: "suspected_mojibake",
        id,
        article,
        brand,
        name,
        message: "Mojibake-like text detected in content fields"
      });
    }

    const key = `${normalizeBrand(brand)}||${article.toUpperCase()}`;
    if (!byBrandArticle.has(key)) byBrandArticle.set(key, []);
    byBrandArticle.get(key).push({
      id,
      article,
      name,
      brand,
      revision: toText(row.revision),
      isActiveNormalized
    });
  }

  for (const [key, rowsForKey] of byBrandArticle.entries()) {
    if (rowsForKey.length <= 1) continue;
    if (shouldIgnoreDuplicateBrandArticleRows(rowsForKey)) continue;
    const [brand, article] = key.split("||");
    addIssue(issues, {
      severity: "error",
      code: "duplicate_brand_article",
      brand,
      article,
      message: `Duplicate rows for brand+article: ${rowsForKey.map((x) => x.id).join(", ")}`
    });
  }

  const mixedUnits = checkUnitScripts(rows);
  for (const u of mixedUnits) {
    addIssue(issues, {
      severity: "warning",
      code: "mixed_unit_scripts",
      message: `${u.field}: latin=${u.latinCount}, cyrillic=${u.cyrCount}`
    });
  }

  const byCode = {};
  const bySeverity = {};
  for (const it of issues) {
    byCode[it.code] = (byCode[it.code] || 0) + 1;
    bySeverity[it.severity] = (bySeverity[it.severity] || 0) + 1;
  }

  const report = {
    ok: issues.filter((x) => x.severity === "error").length === 0,
    generatedAt: new Date().toISOString(),
    dbPath: DB_PATH,
    productsTotal: rows.length,
    issuesTotal: issues.length,
    bySeverity,
    byCode,
    issues
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = nowStamp();
  const outPath = path.join(REPORTS_DIR, `catalog_integrity_audit_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  const topCodes = Object.entries(byCode)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        productsTotal: report.productsTotal,
        issuesTotal: report.issuesTotal,
        bySeverity: report.bySeverity,
        topCodes,
        reportFile: outPath
      },
      null,
      2
    )
  );
}

main();

