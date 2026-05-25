#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const cheerio = require("cheerio");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const REPORTS_DIR = path.join(ROOT, "reports");

const BASE = "https://wirenboard.com";
const START = `${BASE}/ru/catalog/list/`;
const BRAND = "Wiren Board";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TIMEOUT = 35000;
const DELAY_MS = 90;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toText(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function toAbsUrl(url, base = BASE) {
  if (!url) return "";
  try {
    return new URL(url, base).toString();
  } catch (_) {
    return "";
  }
}

function parsePrice(raw) {
  const txt = toText(raw).replace(/\u00a0/g, " ");
  const m = txt.match(/(\d[\d\s]*)/);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/\s+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function stripHtml(html) {
  return toText(String(html || "").replace(/<[^>]+>/g, " "));
}

function slugToArticle(slug) {
  return toText(slug)
    .replace(/[^A-Za-z0-9.+/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function categoryToTopCategory(sub) {
  const s = toText(sub).toLowerCase();
  if (s.includes("электросчет")) return "Энергомониторинг";
  if (s.includes("датчик")) return "Безопасность";
  return "Управление и автоматизация";
}

function extractArticleFromName(name, fallbackSlug) {
  const n = toText(name);
  const wb = n.match(/\b(WB[-A-Z0-9./+]+)\b/i);
  if (wb && wb[1]) return wb[1].toUpperCase();
  const hw = n.match(/\b(HSTS[-A-Z0-9./+]+)\b/i);
  if (hw && hw[1]) return hw[1].toUpperCase();
  return slugToArticle(fallbackSlug || n);
}

function buildId(article, sourceUrl) {
  const slug = toText(sourceUrl.split("/").filter(Boolean).pop());
  const bySlug = slugToArticle(slug);
  if (bySlug) return `WB-${bySlug}`;
  const a = slugToArticle(article);
  if (a) return `WB-${a}`;
  return `WB-${Date.now().toString(36)}`;
}

function fetchText(url, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.7,en;q=0.6"
        },
        timeout: TIMEOUT
      },
      (res) => {
        const status = Number(res.statusCode || 0);
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          const nextUrl = toAbsUrl(String(res.headers.location), url);
          res.resume();
          resolve(fetchText(nextUrl, redirectsLeft - 1));
          return;
        }
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => resolve({ status: status || 0, html: raw }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${TIMEOUT}ms`));
    });
  });
}

function parseCatalogList(html) {
  const $ = cheerio.load(html);
  const out = [];
  let currentSubcategory = "";

  $("#search_replace .categories-list")
    .children()
    .each((_, node) => {
      const $node = $(node);
      if ($node.hasClass("categories__item")) {
        currentSubcategory = toText($node.find(".categories__header h2").first().text());
        return;
      }
      if (!$node.hasClass("product-list")) return;

      $node.find(".product-list__item").each((__, item) => {
        const $item = $(item);
        const link = toAbsUrl(
          $item.find('.product-list__title a[href*="/ru/product/"]').first().attr("href"),
          BASE
        );
        if (!link) return;
        const name = toText($item.find(".product-list__title a").first().text());
        if (!name) return;
        const image = toAbsUrl($item.find(".product-list__img img").first().attr("src"), BASE);
        const price = parsePrice($item.find(".price").first().text());
        const slug = toText(new URL(link).pathname.split("/").filter(Boolean).pop());
        out.push({
          link,
          slug,
          name,
          image,
          price,
          subcategory: currentSubcategory || "Каталог"
        });
      });
    });

  const byLink = new Map();
  for (const row of out) {
    const key = String(row.link || "").toLowerCase();
    if (!key) continue;
    if (!byLink.has(key)) byLink.set(key, row);
  }
  return Array.from(byLink.values());
}

function extractGallery($, pageUrl) {
  const images = [];
  $('a[href*="/storage/"]').each((_, a) => {
    const href = toAbsUrl($(a).attr("href"), pageUrl);
    if (href) images.push(href);
  });
  $(".main-promo img[src], .certificate-list img[src], .product-list__img img[src]").each((_, img) => {
    const src = toAbsUrl($(img).attr("src"), pageUrl);
    if (src) images.push(src);
  });
  return Array.from(new Set(images));
}

function parseEcommerceDetail(html) {
  const m = html.match(/ecommerceDetail\(\[\{([\s\S]*?)\}\]\)/);
  if (!m) return {};
  const chunk = `{${m[1]}}`;
  try {
    return JSON.parse(chunk);
  } catch (_) {
    return {};
  }
}

function normalizeAttrName(name) {
  return toText(name).replace(/[:\s]+$/g, "");
}

function normalizeAttrValue(value) {
  return toText(value)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/\s{2,}/g, " ");
}

function pushAttr(list, name, value) {
  const n = normalizeAttrName(name);
  const v = normalizeAttrValue(value);
  if (!n || !v) return;
  list.push({ name: n, value: v });
}

function uniqAttrs(attrs) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(attrs) ? attrs : []) {
    const name = normalizeAttrName(row && row.name);
    const value = normalizeAttrValue(row && row.value);
    if (!name || !value) continue;
    const key = `${name.toLowerCase()}|${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, value });
  }
  return out;
}

function textFromNode($, node) {
  return toText($(node).text().replace(/\u00a0/g, " "));
}

function extractAttributesFromProductPage($) {
  const attrs = [];

  // 1) Regular table attributes (if present).
  $(".woocommerce-product-attributes tr, table tr").each((_, tr) => {
    const cells = $(tr).find("th, td");
    if (cells.length < 2) return;
    const name = textFromNode($, cells[0]);
    const value = textFromNode($, cells[1]);
    pushAttr(attrs, name, value);
  });

  // 2) Wiren Board blocks with title + text/list under "Основные характеристики".
  $(".certificate-list__item").each((_, item) => {
    const name = textFromNode($, $(item).find(".certificate-list__name").first());
    if (!name) return;
    const chunks = [];
    const textBlocks = $(item).find(".certificate-list__text p, .certificate-list__text li");
    if (textBlocks.length) {
      textBlocks.each((__, el) => {
        const t = textFromNode($, el);
        if (t) chunks.push(t);
      });
    } else {
      const plain = textFromNode($, $(item).find(".certificate-list__text").first());
      if (plain) chunks.push(plain);
    }
    const value = chunks.join("; ");
    pushAttr(attrs, name, value);
  });

  // 3) Promo dots often contain short technical features.
  $(".main-promo__dot-item").each((_, dot) => {
    const name = textFromNode($, $(dot).find(".main-promo__dot-title").first());
    if (!name) return;
    const parts = [];
    const dotText = textFromNode($, $(dot).find(".main-promo__dot-text").first());
    if (dotText) parts.push(dotText);
    $(dot)
      .find(".main-promo__dot-characteristics li")
      .each((__, li) => {
        const t = textFromNode($, li);
        if (t) parts.push(t);
      });
    pushAttr(attrs, name, parts.join("; "));
  });

  // 4) Fallback: parse "Параметр: значение" lines from description text.
  $(".product-description__holder p, .product-description__holder li").each((_, el) => {
    const line = textFromNode($, el);
    if (!line || !line.includes(":")) return;
    const idx = line.indexOf(":");
    if (idx <= 0 || idx >= line.length - 1) return;
    const name = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (name.length < 2 || name.length > 80) return;
    if (value.length < 1 || value.length > 260) return;
    if (/[.;]{2,}/.test(name)) return;
    pushAttr(attrs, name, value);
  });

  return uniqAttrs(attrs);
}

async function fetchProductDetails(url, fallback) {
  try {
    const { status, html } = await fetchText(url);
    if (status < 200 || status >= 300) {
      return { ...fallback, sourceUrl: url, warning: `product_http_${status}` };
    }

    const $ = cheerio.load(html);
    const ecom = parseEcommerceDetail(html);
    const ogTitle = toText($('meta[property="og:title"]').attr("content"));
    const ogImage = toAbsUrl($('meta[property="og:image"]').attr("content"), url);
    const metaDesc = toText($('meta[name="description"]').attr("content"));
    const descHtmlRaw = $(".product-description__holder").first().html() || "";
    const descriptionHtml = toText(descHtmlRaw);
    const description = stripHtml(descHtmlRaw) || metaDesc;
    const gallery = extractGallery($, url);
    const image = gallery[0] || ogImage || fallback.image || "";
    const attributes = extractAttributesFromProductPage($);
    const price =
      parsePrice($(".product-description__price .price").first().text()) ??
      Number(ecom.price) ??
      fallback.price ??
      null;

    const name = toText(ogTitle || ecom.name || fallback.name);
    const category = toText(fallback.subcategory || ecom.category || "");
    const article = extractArticleFromName(name, fallback.slug);

    return {
      sourceUrl: url,
      name,
      category,
      article,
      price,
      description,
      descriptionHtml,
      image,
      gallery,
      attributes,
      specs: attributes.map((x) => `${x.name}: ${x.value}`).join("; ")
    };
  } catch (e) {
    return { ...fallback, sourceUrl: url, warning: `product_fetch_failed: ${e.message}` };
  }
}

async function buildWirenBoardProducts() {
  const { status, html } = await fetchText(START);
  if (status < 200 || status >= 300) {
    throw new Error(`catalog_list_http_${status}`);
  }
  const cards = parseCatalogList(html);

  const debug = {
    source: START,
    cardsFound: cards.length,
    detailsWarnings: []
  };

  const products = [];
  for (const card of cards) {
    await sleep(DELAY_MS);
    const details = await fetchProductDetails(card.link, card);
    if (details.warning) debug.detailsWarnings.push({ url: card.link, warning: details.warning });

    const subcategory = toText(card.subcategory || details.category || "Каталог");
    const topCategory = categoryToTopCategory(subcategory);
    const groupName = `Wiren Board / ${subcategory}`;
    const article = toText(details.article || extractArticleFromName(card.name, card.slug));
    const id = buildId(article, details.sourceUrl || card.link);
    const price = Number.isFinite(Number(details.price)) ? Number(details.price) : null;

    products.push({
      id,
      article,
      name: toText(details.name || card.name),
      price,
      category: topCategory,
      group_name: groupName,
      brand: BRAND,
      image: toText(details.image || card.image),
      source_url: toText(details.sourceUrl || card.link),
      description: toText(details.description),
      specs: toText(details.specs || ""),
      description_html: toText(details.descriptionHtml || ""),
      attributes_json: JSON.stringify(Array.isArray(details.attributes) ? details.attributes : []),
      documents_json: "[]",
      gallery_json: JSON.stringify(Array.isArray(details.gallery) ? details.gallery : []),
      brand_subcategory: subcategory,
      updated_at: new Date().toISOString(),
      price_text: price == null ? "" : `${Math.round(price)} руб. / шт`,
      breadcrumbs: `Товары / ${topCategory} / Wiren Board / ${subcategory} / ${toText(details.name || card.name)}`,
      status: "active",
      is_extra: 0
    });
  }

  const uniq = new Map();
  for (const p of products) {
    const key = String(p.source_url || "").toLowerCase();
    if (!key) continue;
    if (!uniq.has(key)) uniq.set(key, p);
  }
  return { products: Array.from(uniq.values()), debug };
}

function upsertWirenBoardProducts(products) {
  const db = new Database(DB_PATH, { timeout: 15000 });
  db.pragma("journal_mode = WAL");

  const columns = db.prepare("PRAGMA table_info(products)").all().map((x) => x.name);
  const hasStatus = columns.includes("status");
  const hasIsExtra = columns.includes("is_extra");
  const hasBrandSub = columns.includes("brand_subcategory");

  const insertCols = [
    "id",
    "article",
    "name",
    "price",
    "price_text",
    "category",
    "group_name",
    "brand",
    "image",
    "source_url",
    "description",
    "specs",
    "breadcrumbs",
    "description_html",
    "attributes_json",
    "documents_json",
    "gallery_json",
    "updated_at"
  ];
  if (hasBrandSub) insertCols.push("brand_subcategory");
  if (hasStatus) insertCols.push("status");
  if (hasIsExtra) insertCols.push("is_extra");

  const placeholders = insertCols.map((c) => `@${c}`).join(", ");
  const sql = `INSERT OR REPLACE INTO products (${insertCols.join(", ")}) VALUES (${placeholders})`;
  const insert = db.prepare(sql);
  const purge = db.prepare("DELETE FROM products WHERE brand = @brand");

  const tx = db.transaction((rows) => {
    purge.run({ brand: BRAND });
    for (const row of rows) insert.run(row);
  });
  tx(products);

  const brandCount = db.prepare("SELECT COUNT(*) AS c FROM products WHERE brand = @brand").get({ brand: BRAND }).c;
  const subcats = db
    .prepare(
      "SELECT brand_subcategory AS sub, COUNT(*) AS c FROM products WHERE brand = @brand GROUP BY brand_subcategory ORDER BY c DESC, sub ASC"
    )
    .all({ brand: BRAND });
  db.close();
  return { brandCount, subcats };
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(REPORTS_DIR, `wirenboard_sync_${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");
  return filePath;
}

async function main() {
  const startedAt = Date.now();
  const { products, debug } = await buildWirenBoardProducts();
  const { brandCount, subcats } = upsertWirenBoardProducts(products);

  const report = {
    ok: true,
    brand: BRAND,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - startedAt) / 1000),
    parsedProducts: products.length,
    dbBrandProducts: brandCount,
    productsWithImage: products.filter((x) => toText(x.image)).length,
    productsWithoutImage: products.filter((x) => !toText(x.image)).length,
    subcategories: subcats,
    debug
  };

  const reportFile = writeReport(report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        parsedProducts: report.parsedProducts,
        dbBrandProducts: report.dbBrandProducts,
        productsWithImage: report.productsWithImage,
        productsWithoutImage: report.productsWithoutImage,
        subcategories: report.subcategories,
        reportFile
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  BRAND,
  BASE,
  toText,
  toAbsUrl,
  parsePrice,
  stripHtml,
  slugToArticle,
  categoryToTopCategory,
  extractArticleFromName,
  buildId,
  parseCatalogList,
  extractGallery,
  parseEcommerceDetail,
  extractAttributesFromProductPage
};
