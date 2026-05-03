const https = require("https");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const STOREPARTS = ["754959572690", "951849075984", "488202032144", "362732348713", "641936558900"];

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchText(next));
        }
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => resolve(buf));
      })
      .on("error", reject);
  });
}

function extractUrlCode(url) {
  const s = String(url || "");
  if (!s) return "";
  const m = s.match(/\b((?:dw|de|bw|cw|fw|ww|fe|ew|bt|lcp|metaforsa)[-_a-z0-9./]{1,60})/i);
  if (!m) return "";
  const raw = String(m[1] || "").replace(/\/+$/, "");
  const head = raw.match(/^(?:dw|de|bw|cw|fw|ww|fe|ew|bt|lcp|metaforsa)[-_a-z0-9.]*/i);
  return norm(head ? head[0] : raw);
}

function pickPdfPageUrl(documentsJson) {
  let docs = [];
  try {
    docs = JSON.parse(String(documentsJson || "[]"));
    if (!Array.isArray(docs)) docs = [];
  } catch (_) {
    docs = [];
  }
  const pageDoc = docs.find((d) => /#page=\d+/i.test(String((d && d.url) || "")));
  return pageDoc ? String(pageDoc.url || "").trim() : "";
}

async function fetchTildaSkuMap() {
  const bySku = new Map();
  for (const part of STOREPARTS) {
    const apiUrl = `https://store.tildacdn.com/api/getproductslist/?storepartuid=${encodeURIComponent(part)}&size=300`;
    let payload = {};
    try {
      payload = JSON.parse(await fetchText(apiUrl));
    } catch (_) {
      payload = {};
    }
    const items = Array.isArray(payload.products) ? payload.products : [];
    for (const p of items) {
      const sku = norm(p && p.sku);
      const url = String((p && p.url) || "").trim();
      if (!sku || !url) continue;
      if (!bySku.has(sku)) bySku.set(sku, url);
    }
  }
  return bySku;
}

async function main() {
  const db = new Database(DB_PATH);
  const rows = db
    .prepare(
      "SELECT id, article, source_url, documents_json FROM products WHERE lower(brand)='larnitech' ORDER BY article COLLATE NOCASE"
    )
    .all();

  const skuMap = await fetchTildaSkuMap();
  const updateStmt = db.prepare("UPDATE products SET source_url=@sourceUrl, updated_at=@updatedAt WHERE id=@id");

  const report = {
    total: rows.length,
    exactSkuMatched: 0,
    fixedByExactSku: 0,
    mismatchedForeignLinksFixed: 0,
    unchanged: 0,
    changed: []
  };

  for (const row of rows) {
    const id = String(row.id || "");
    const article = String(row.article || row.id || "");
    const articleKey = norm(article);
    const idKey = norm(id);
    const currentUrl = String(row.source_url || "").trim();

    const exactUrl = skuMap.get(articleKey) || skuMap.get(idKey) || "";
    if (exactUrl) report.exactSkuMatched += 1;

    let nextUrl = currentUrl;
    let reason = "";

    if (exactUrl) {
      if (currentUrl !== exactUrl) {
        nextUrl = exactUrl;
        reason = "exact_sku_url";
        report.fixedByExactSku += 1;
      }
    } else {
      const urlCode = extractUrlCode(currentUrl);
      const likelyForeign =
        urlCode &&
        urlCode !== articleKey &&
        !urlCode.startsWith(articleKey) &&
        !articleKey.startsWith(urlCode);
      if (likelyForeign) {
        const pdfUrl = pickPdfPageUrl(row.documents_json);
        nextUrl = pdfUrl;
        reason = pdfUrl ? "foreign_url_to_pdf_page" : "foreign_url_cleared";
        report.mismatchedForeignLinksFixed += 1;
      }
    }

    if (nextUrl !== currentUrl) {
      updateStmt.run({
        id,
        sourceUrl: nextUrl,
        updatedAt: new Date().toISOString()
      });
      report.changed.push({ id, article, from: currentUrl, to: nextUrl, reason });
    } else {
      report.unchanged += 1;
    }
  }

  db.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});

