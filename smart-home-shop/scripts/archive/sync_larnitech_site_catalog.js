const https = require("https");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..", "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const SITE_URL = "https://larnitech-rus.ru/";
const SITEMAP_URL = "https://larnitech-rus.ru/sitemap.xml";
const MANUAL_STOREPARTS = ["754959572690", "951849075984", "488202032144", "362732348713", "641936558900"];
const SKU_ALIASES = new Map(
  [
    ["mfc14metaforsa2cloud", "metaforsamfc14"],
    ["dwrsuart", "dwuart"],
    ["dwdali2", "dwdali"],
    ["bwbclc", "bwbcpwlc"],
    ["bwbcpw", "bwbcpwlc"],
    ["dwhto7", "dwht07"],
    ["degwknx", "degw"],
    ["demgdali", "demg"],
    ["dwdali", "dwdali2"],
    ["cwmii", "cwm"],
    ["cwmsdii", "cwmsd"]
  ].map(([from, to]) => [norm(from), norm(to)])
);

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

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function stripHtml(v) {
  return String(v || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseGallery(v) {
  let arr = [];
  try {
    arr = Array.isArray(v) ? v : JSON.parse(String(v || "[]"));
  } catch (_) {
    arr = [];
  }
  const out = [];
  for (const item of arr) {
    const src = normalizeImageUrl(String((item && item.img) || "").trim());
    if (!src) continue;
    out.push(src);
  }
  return out;
}

function normalizeImageUrl(url) {
  let u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("//")) u = `https:${u}`;
  if (/^https?:\/\/(thb|optim)\.tildacdn\.com\//i.test(u)) {
    u = u.replace(/^https?:\/\/(thb|optim)\.tildacdn\.com\//i, "https://static.tildacdn.com/");
  }
  // Remove Tilda transform tail like /-/resize/200x/-/format/webp/
  u = u.replace(/\/-\/(?:resize|format|quality|cover|fit|stretch|trim)\/[^/]+/gi, "");
  // Remove leftovers like /-/empty/
  u = u.replace(/\/-\/empty\//gi, "/");
  return u;
}

function extractStorepartsFromHtml(html) {
  const out = new Set();
  const text = String(html || "");
  for (const m of text.matchAll(/storepart\s*:\s*['"]?(\d{6,})['"]?/gi)) out.add(m[1]);
  for (const m of text.matchAll(/storepartuid=(\d{6,})/gi)) out.add(m[1]);
  return out;
}

function parseSitemapUrls(xmlText) {
  return [...String(xmlText || "").matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => String(m[1] || "").trim()).filter(Boolean);
}

async function discoverStoreparts() {
  const parts = new Set(MANUAL_STOREPARTS);
  let urls = [];
  try {
    const xml = await fetchText(SITEMAP_URL);
    urls = parseSitemapUrls(xml);
  } catch (_) {
    urls = [SITE_URL];
  }
  if (!urls.includes(SITE_URL)) urls.unshift(SITE_URL);

  const maxPages = Math.min(140, urls.length);
  for (let i = 0; i < maxPages; i++) {
    try {
      const html = await fetchText(urls[i]);
      const found = extractStorepartsFromHtml(html);
      for (const p of found) parts.add(p);
    } catch (_) {
      // Ignore individual page fetch failures.
    }
  }

  return [...parts];
}

async function fetchProductsFromStoreparts(storeparts) {
  const all = [];
  for (const part of storeparts) {
    const apiUrl = `https://store.tildacdn.com/api/getproductslist/?storepartuid=${encodeURIComponent(part)}&size=300`;
    let payload = {};
    try {
      payload = JSON.parse(await fetchText(apiUrl));
    } catch (_) {
      payload = {};
    }
    const rows = Array.isArray(payload.products) ? payload.products : [];
    for (const p of rows) all.push({ ...p, __storepart: part });
  }
  return all;
}

function absoluteUrl(href, baseUrl) {
  const s = String(href || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  try {
    return new URL(s, baseUrl).toString();
  } catch (_) {
    return s;
  }
}

function findWikiLink(html, baseUrl) {
  const hrefMatches = [...String(html || "").matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  const candidates = hrefMatches
    .map((x) => absoluteUrl(x, baseUrl))
    .filter((x) => /wiki\.|\/wiki/i.test(x));
  if (candidates.length) return candidates[0];

  // Some links are present escaped in inline scripts.
  const scriptMatches = [...String(html || "").matchAll(/https?:\\\/\\\/[^"'\s]+/gi)]
    .map((m) => m[0].replace(/\\\//g, "/"))
    .filter((x) => /wiki\.|\/wiki/i.test(x));
  return scriptMatches.length ? scriptMatches[0] : "";
}

function skuCandidates(siteSku) {
  const raw = String(siteSku || "").trim();
  const base = norm(raw);
  if (!base) return [];
  const out = [base];

  for (const part of raw.split(/[-_/+|(),\s]+/g)) {
    const p = norm(part);
    if (p && !out.includes(p)) out.push(p);
  }

  const aliased = SKU_ALIASES.get(base);
  if (aliased && !out.includes(aliased)) out.push(aliased);

  return out;
}

function chooseMatch(siteSku, rows, byNorm) {
  const variants = skuCandidates(siteSku);
  if (!variants.length) return null;
  for (const v of variants) {
    if (byNorm.has(v)) return byNorm.get(v)[0];
  }

  const scored = [];
  for (const r of rows) {
    const a = norm(r.article);
    const i = norm(r.id);
    const n = norm(r.name);
    let score = -1;
    for (const skuNorm of variants) {
      if (a && (a.startsWith(skuNorm) || skuNorm.startsWith(a))) score = Math.max(score, 90 - Math.abs(a.length - skuNorm.length));
      if (i && (i.startsWith(skuNorm) || skuNorm.startsWith(i))) score = Math.max(score, 88 - Math.abs(i.length - skuNorm.length));
      if (score < 0 && n.includes(skuNorm)) score = 40;
    }
    if (score >= 0) scored.push({ r, score });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.length ? scored[0].r : null;
}

async function run() {
  const db = new Database(DB_PATH);
  const larnitechRows = db
    .prepare("SELECT id, article, name, price, description, image, gallery_json, documents_json, source_url FROM products WHERE brand='Larnitech'")
    .all();

  const byNorm = new Map();
  for (const r of larnitechRows) {
    for (const k of [norm(r.id), norm(r.article)]) {
      if (!k) continue;
      const cur = byNorm.get(k) || [];
      cur.push(r);
      byNorm.set(k, cur);
    }
  }

  const storeparts = await discoverStoreparts();
  const products = await fetchProductsFromStoreparts(storeparts);

  const update = db.prepare(`
    UPDATE products
    SET
      price = @price,
      image = @image,
      gallery_json = @galleryJson,
      description = @description,
      documents_json = @documentsJson,
      source_url = @sourceUrl,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  const unmatched = [];
  let updated = 0;
  let withWiki = 0;

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx];
    const sku = String((p && p.sku) || "").trim();
    const match = chooseMatch(sku, larnitechRows, byNorm);
    if (!match) {
      unmatched.push(sku || `index_${idx}`);
      continue;
    }

    const gallery = parseGallery(p.gallery);
    const mainImage = normalizeImageUrl(gallery[0] || String(match.image || ""));
    const sitePrice = parsePrice(p && p.price);
    const currentPrice = parsePrice(match && match.price);
    const nextPrice = sitePrice !== null ? sitePrice : currentPrice;
    const siteDescr = stripHtml(p.descr || p.text || "");
    const currentDescr = String(match.description || "").trim();
    const nextDescr = siteDescr.length > currentDescr.length ? siteDescr : currentDescr;

    let docs;
    try {
      docs = JSON.parse(String(match.documents_json || "[]"));
      if (!Array.isArray(docs)) docs = [];
    } catch (_) {
      docs = [];
    }

    let wikiUrl = "";
    const sourceUrl = String(p.url || "").trim();
    if (sourceUrl) {
      try {
        const html = await fetchText(sourceUrl);
        wikiUrl = findWikiLink(html, sourceUrl);
      } catch (_) {
        wikiUrl = "";
      }
    }

    if (wikiUrl) {
      const exists = docs.some((d) => String((d && d.url) || "").trim() === wikiUrl);
      if (!exists) {
        docs.push({
          title: "Техническая документация (wiki Larnitech)",
          url: wikiUrl,
          meta: "Официальная техническая страница производителя"
        });
      }
      withWiki += 1;
    }

    update.run({
      id: match.id,
      price: nextPrice,
      image: mainImage,
      galleryJson: JSON.stringify(gallery),
      description: nextDescr,
      documentsJson: JSON.stringify(docs),
      sourceUrl: sourceUrl || String(match.source_url || ""),
      updatedAt: new Date().toISOString()
    });
    updated += 1;
  }

  const stats = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN price IS NULL OR price<=0 THEN 1 ELSE 0 END) AS noPrice,
        SUM(CASE WHEN IFNULL(TRIM(image),'')='' THEN 1 ELSE 0 END) AS noImage,
        SUM(CASE WHEN image LIKE '/images/larnitech_pdf/%' THEN 1 ELSE 0 END) AS pdfMain,
        SUM(CASE WHEN IFNULL(TRIM(gallery_json),'') IN ('','[]') THEN 1 ELSE 0 END) AS noGallery,
        SUM(CASE WHEN IFNULL(TRIM(source_url),'')='' THEN 1 ELSE 0 END) AS noSource
      FROM products
      WHERE brand='Larnitech'
    `)
    .get();

  db.close();
  console.log(
    JSON.stringify(
      {
        ok: true,
        discoveredStoreparts: storeparts,
        siteProducts: products.length,
        updated,
        withWiki,
        unmatched,
        stats
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

module.exports = {
  SITE_URL,
  SITEMAP_URL,
  norm,
  stripHtml,
  parsePrice,
  parseGallery,
  normalizeImageUrl,
  extractStorepartsFromHtml,
  parseSitemapUrls,
  absoluteUrl,
  findWikiLink,
  skuCandidates,
  chooseMatch
};
