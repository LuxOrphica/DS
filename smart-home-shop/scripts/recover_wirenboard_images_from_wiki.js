#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const OUT_DIR = path.join(ROOT, "public", "images", "products", "mirror", "wb-wiki");
const OUT_PREFIX = "/images/products/mirror/wb-wiki/";
const WIKI_BASE = "https://wiki.wirenboard.com";
const TIMEOUT_MS = Number(process.env.WB_WIKI_TIMEOUT_MS || 12000);
const CONCURRENCY = Math.max(1, Number(process.env.WB_WIKI_CONCURRENCY || 4));
const MIN_SCORE = Number(process.env.WB_WIKI_MIN_SCORE || 35);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAbsoluteUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${WIKI_BASE}${value}`;
  return `${WIKI_BASE}/${value}`;
}

function normalizeToken(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildSearchTerms(product) {
  const out = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  const article = String(product.article || "").trim();
  const idTail = String(product.id || "").replace(/^WB-/, "").trim();
  const name = String(product.name || "").trim();
  push(article);
  if (article.toUpperCase().startsWith("WB-")) push(article.slice(3));
  push(idTail);
  if (idTail.toUpperCase().startsWith("WB-")) push(idTail.slice(3));
  const nameSkuLike = name.match(/[A-Z0-9][A-Z0-9._/-]{3,}/g) || [];
  for (const t of nameSkuLike) push(t);
  return out.slice(0, 5);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extByUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname || "").toLowerCase();
    if (ext && ext.length <= 6) return ext;
  } catch {}
  return ".jpg";
}

function localName(productId, sourceUrl) {
  const hash = crypto.createHash("sha1").update(String(sourceUrl)).digest("hex").slice(0, 16);
  const safe = String(productId || "wb").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 50);
  return `${safe}-${hash}${extByUrl(sourceUrl)}`;
}

function isLikelyTechnicalImage(url) {
  const lower = String(url || "").toLowerCase();
  return /(web[_-]?ui|register|dimension|scheme|schema|diagram|indication|button|wiring|modbus_address|changelog|errata|revision|wiki\/images\/7\/75\/wb_logo)/i.test(lower);
}

function scoreImage(url, product) {
  const lower = String(url || "").toLowerCase();
  const article = String(product.article || "").trim();
  const idTail = String(product.id || "").replace(/^WB-/, "").trim();
  const articleNorm = normalizeToken(article);
  const idNorm = normalizeToken(idTail);

  let score = 0;
  if (lower.includes("/wiki/images/")) score += 10;
  if (/\.(png|jpe?g|webp)(\?|$)/i.test(lower)) score += 10;

  const lowerNorm = normalizeToken(lower);
  if (articleNorm && lowerNorm.includes(articleNorm)) score += 80;
  if (idNorm && lowerNorm.includes(idNorm)) score += 40;

  const partTokens = String(article || idTail)
    .split(/[-_/.\s]+/g)
    .map(normalizeToken)
    .filter((x) => x.length >= 3);
  for (const token of partTokens.slice(0, 4)) {
    if (lowerNorm.includes(token)) score += 8;
  }

  if (isLikelyTechnicalImage(lower)) score -= 40;
  if (/thumb\//i.test(lower)) score -= 10;
  if (/wb_logo/i.test(lower)) score -= 100;
  if (/yandex|google|mc\.yandex|poweredby_mediawiki/i.test(lower)) score -= 120;
  return score;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; smart-home-shop/1.0)",
        Accept: "text/html,*/*;q=0.8"
      }
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; smart-home-shop/1.0)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });
    if (!res.ok) return null;
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractWikiPageLinks(searchHtml) {
  const links = [];
  const seen = new Set();
  const re = /<a href="(\/wiki\/[^"#]+)" title="([^"]+)" data-serp-pos="\d+"/g;
  let m;
  while ((m = re.exec(searchHtml)) !== null) {
    const href = String(m[1] || "");
    const title = String(m[2] || "").trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    links.push({ url: `${WIKI_BASE}${href}`, title });
    if (links.length >= 10) break;
  }
  return links;
}

function extractWikiPageLinksLoose(searchHtml) {
  const links = [];
  const seen = new Set();
  const re = /<a href="(\/wiki\/[^"#]+)"(?:[^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(searchHtml)) !== null) {
    const href = String(m[1] || "");
    const rawTitle = String(m[2] || "");
    const title = rawTitle.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!href || /^\/wiki\/(index\.php|Special:|Служебная:|File:|Файл:)/i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ url: `${WIKI_BASE}${href}`, title });
    if (links.length >= 14) break;
  }
  return links;
}

function extractImageUrls(pageHtml) {
  const urls = [];
  const seen = new Set();
  const re = /<img[^>]+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(pageHtml)) !== null) {
    const abs = toAbsoluteUrl(m[1]);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    urls.push(abs);
  }
  return urls;
}

async function chooseImageForProduct(product) {
  const articleNorm = normalizeToken(product.article || "");
  const idNorm = normalizeToken(String(product.id || "").replace(/^WB-/, ""));
  const productNameNorm = normalizeToken(product.name || "");
  const terms = buildSearchTerms(product);
  if (!terms.length) return null;

  let best = null;
  for (const termRaw of terms) {
    const term = encodeURIComponent(termRaw);
    const searchUrl = `${WIKI_BASE}/wiki/index.php?title=%D0%A1%D0%BB%D1%83%D0%B6%D0%B5%D0%B1%D0%BD%D0%B0%D1%8F:%D0%9F%D0%BE%D0%B8%D1%81%D0%BA&search=${term}`;
    const searchHtml = await fetchText(searchUrl);
    if (!searchHtml) continue;
    const strictLinks = extractWikiPageLinks(searchHtml);
    const looseLinks = extractWikiPageLinksLoose(searchHtml);
    const pageLinks = [...strictLinks, ...looseLinks].slice(0, 16);
    if (!pageLinks.length) continue;

    for (const pageInfo of pageLinks) {
      const pageUrl = pageInfo.url;
      const pageTitleNorm = normalizeToken(pageInfo.title || "");
      const pageUrlNorm = normalizeToken(pageUrl);
      let pageScore = 0;
      if (articleNorm && (pageTitleNorm.includes(articleNorm) || pageUrlNorm.includes(articleNorm))) pageScore += 120;
      if (idNorm && (pageTitleNorm.includes(idNorm) || pageUrlNorm.includes(idNorm))) pageScore += 80;
      if (productNameNorm && pageTitleNorm && (productNameNorm.includes(pageTitleNorm) || pageTitleNorm.includes(productNameNorm.slice(0, 10)))) pageScore += 20;
      if (normalizeToken(termRaw) && (pageTitleNorm.includes(normalizeToken(termRaw)) || pageUrlNorm.includes(normalizeToken(termRaw)))) pageScore += 30;
      if (pageScore < 12) continue;

      await sleep(90);
      const pageHtml = await fetchText(pageUrl);
      if (!pageHtml) continue;
      const imgUrls = extractImageUrls(pageHtml);
      let pageBest = null;
      for (let idx = 0; idx < imgUrls.length; idx += 1) {
        const imgUrl = imgUrls[idx];
        let score = pageScore + scoreImage(imgUrl, product);
        if (/\/wiki\/images\/thumb\//i.test(imgUrl)) score += 6;
        if (/\/wiki\/images\/[0-9a-f]{1,2}\//i.test(imgUrl)) score += 8;
        if (!isLikelyTechnicalImage(imgUrl)) score += Math.max(0, 24 - idx * 2);
        if (!pageBest || score > pageBest.score) pageBest = { pageUrl, imgUrl, score };
      }
      if (pageBest && (!best || pageBest.score > best.score)) {
        best = pageBest;
      }
    }
  }

  if (!best || best.score < MIN_SCORE) return null;
  return best;
}

async function mapWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runOne() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  const threads = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne());
  await Promise.all(threads);
  return results;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const db = new Database(DB_PATH);

  const rows = db.prepare(`
    SELECT id, article, name, image, gallery_json AS galleryJson
    FROM products
    WHERE LOWER(COALESCE(brand, '')) LIKE '%wiren%'
      AND LOWER(COALESCE(image, '')) LIKE 'https://wirenboard.com/%'
  `).all();

  console.log(`Wiren products with remote wirenboard image: ${rows.length}`);
  if (!rows.length) return;

  const report = [];
  const foundMap = new Map();
  let processed = 0;

  await mapWithConcurrency(
    rows,
    async (row) => {
      const best = await chooseImageForProduct(row);
      processed += 1;
      if (best) {
        foundMap.set(row.id, best);
      }
      report.push({
        id: row.id,
        article: row.article,
        name: row.name,
        found: Boolean(best),
        score: best ? best.score : null,
        pageUrl: best ? best.pageUrl : "",
        imgUrl: best ? best.imgUrl : ""
      });
      if (processed % 20 === 0 || processed === rows.length) {
        console.log(`Scanned ${processed}/${rows.length}`);
      }
    },
    CONCURRENCY
  );

  const updates = [];
  for (const row of rows) {
    const found = foundMap.get(row.id);
    if (!found) continue;

    const bytes = await fetchBytes(found.imgUrl);
    if (!bytes || !bytes.length) continue;

    const name = localName(row.id, found.imgUrl);
    const diskPath = path.join(OUT_DIR, name);
    fs.writeFileSync(diskPath, bytes);
    const localUrl = `${OUT_PREFIX}${name}`;

    let gallery = [];
    try {
      const parsed = JSON.parse(String(row.galleryJson || "[]"));
      gallery = Array.isArray(parsed) ? parsed : [];
    } catch {
      gallery = [];
    }

    const nextGallery = [localUrl, ...gallery.filter((x) => String(x || "").trim() !== localUrl)];
    updates.push({
      id: row.id,
      image: localUrl,
      galleryJson: JSON.stringify(nextGallery),
      updatedAt: new Date().toISOString()
    });
  }

  const updateStmt = db.prepare(`
    UPDATE products
    SET image = @image,
        gallery_json = @galleryJson,
        updated_at = @updatedAt
    WHERE id = @id
  `);
  const tx = db.transaction((items) => {
    for (const item of items) updateStmt.run(item);
  });
  if (updates.length) tx(updates);

  const summary = {
    scanned: rows.length,
    foundCandidates: foundMap.size,
    updated: updates.length,
    minScore: MIN_SCORE
  };
  console.log(JSON.stringify(summary, null, 2));

  const reportPath = path.join(ROOT, "reports", "wb-wiki-image-recovery-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report.sort((a, b) => Number(b.score || -999) - Number(a.score || -999)), null, 2));
  console.log(`Report saved: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
