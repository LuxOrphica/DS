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

const BASE = "https://www.hite-pro.ru";
const START = `${BASE}/shop/c`;
const CATEGORY_PREFIX = "/shop/c";
const BRAND = "Hite Pro";

const TIMEOUT = 30000;
const DELAY_MS = 140;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

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

function stripHtml(html) {
  return toText(String(html || "").replace(/<[^>]+>/g, " "));
}

function parsePrice(text) {
  const s = toText(text).replace(/\u00A0/g, " ");
  const m = s.match(/(\d[\d\s]*)/);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/\s+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function slugToArticle(slug) {
  return toText(slug)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function makeId(article, fallbackSlug) {
  const a = slugToArticle(article);
  if (a) return a;
  return `HP-${slugToArticle(fallbackSlug || "item")}`;
}

function inferCategory(groupName, productName) {
  const g = toText(groupName).toLowerCase();
  const n = toText(productName).toLowerCase();

  if (g.includes("комплект")) return "Комплекты";
  if (g.includes("датчик")) {
    if (n.includes("температур") || n.includes("влажност")) return "Климат";
    return "Безопасность";
  }
  if (g.includes("блок") || g.includes("выключ") || g.includes("сервер")) return "Управление и автоматизация";
  return "Управление и автоматизация";
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
          "Accept-Language": "ru-RU,ru;q=0.9"
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

async function collectCategoryUrls() {
  const queue = [START];
  const seen = new Set();
  const out = new Map();
  const maxPages = 260;

  while (queue.length && seen.size < maxPages) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    let html = "";
    let status = 0;
    try {
      const fetched = await fetchText(current);
      html = fetched.html;
      status = fetched.status;
    } catch (_) {
      continue;
    }
    if (status < 200 || status >= 300) continue;

    const $ = cheerio.load(html);
    const pageTitle =
      toText($("nav.woocommerce-breadcrumb .breadcrumb-last").first().text()) ||
      toText($("h1").first().text()) || "Category";
    if (!out.has(current)) out.set(current, pageTitle);

    $("a[href]").each((_, a) => {
      const href = toText($(a).attr("href"));
      if (!href) return;
      const abs = toAbsUrl(href);
      if (!abs) return;

      let u;
      try {
        u = new URL(abs);
      } catch (_) {
        return;
      }

      const cleanPath = u.pathname.replace(/\/+$/, "");
      if (!cleanPath.startsWith(CATEGORY_PREFIX)) return;
      if (cleanPath.includes("/feed")) return;
      if (/\/page\/\d+\/?$/i.test(cleanPath)) return;
      if (u.search || u.hash) return;

      const cleanAbs = u.origin + cleanPath;
      if (!out.has(cleanAbs)) {
        const title = toText($(a).text()) || "Category";
        out.set(cleanAbs, title);
      }
      if (!seen.has(cleanAbs)) queue.push(cleanAbs);
    });
  }

  return Array.from(out.entries()).map(([url, title]) => ({ url, title }));
}
function categoryDepth(url) {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "");
    const parts = p.split("/").filter(Boolean);
    const cIdx = parts.indexOf("c");
    if (cIdx < 0) return 0;
    return Math.max(0, parts.length - (cIdx + 1));
  } catch (_) {
    return 0;
  }
}
function extractCardsFromCategoryPage(url, html) {
  const $ = cheerio.load(html);
  const cards = [];
  $(".product-grid-item.product").each((_, el) => {
    const $el = $(el);
    const name = toText($el.find(".wd-entities-title a").first().text());
    const link = toAbsUrl($el.find(".wd-entities-title a").first().attr("href"), url);
    const image = toAbsUrl($el.find(".product-image-link img").first().attr("src"), url);
    const sku = toText($el.find("[data-product_sku]").first().attr("data-product_sku"));
    const price = parsePrice($el.find(".price").first().text());

    if (!name || !link) return;
    const slug = toText(new URL(link).pathname.split("/").filter(Boolean).pop());
    cards.push({
      name,
      link,
      image,
      sku,
      price,
      slug
    });
  });
  return cards;
}

function extractSpecsFromProductPage($) {
  const specsRows = [];
  $(".woocommerce-product-attributes tr").each((_, tr) => {
    const key = toText($(tr).find("th").first().text());
    const val = toText($(tr).find("td").first().text());
    if (!key || !val) return;
    specsRows.push({ name: key, value: val });
  });
  return specsRows;
}

function extractGalleryFromProductPage($, pageUrl) {
  const imgs = [];
  $(".woocommerce-product-gallery__image a[href]").each((_, a) => {
    const href = toAbsUrl($(a).attr("href"), pageUrl);
    if (href) imgs.push(href);
  });
  if (!imgs.length) {
    $(".woocommerce-product-gallery__wrapper img[src]").each((_, img) => {
      const src = toAbsUrl($(img).attr("src"), pageUrl);
      if (src) imgs.push(src);
    });
  }
  return Array.from(new Set(imgs));
}

async function fetchProductDetails(productUrl, fallback) {
  try {
    const { status, html } = await fetchText(productUrl);
    if (status < 200 || status >= 300) {
      return {
        ...fallback,
        sourceUrl: productUrl,
        warning: `product_http_${status}`
      };
    }

    const $ = cheerio.load(html);
    const name = toText($("h1.product_title").first().text()) || fallback.name;
    const price = parsePrice($(".summary .price").first().text()) ?? fallback.price ?? null;
    const article =
      toText($(".sku_wrapper .sku").first().text()) ||
      fallback.sku ||
      slugToArticle(fallback.slug);
    const descriptionHtml = toText($("#tab-description").html());
    const description = stripHtml(descriptionHtml);
    const specsRows = extractSpecsFromProductPage($);
    const specs = specsRows.map((x) => `${x.name}: ${x.value}`).join("; ");
    const attributes = specsRows;
    const gallery = extractGalleryFromProductPage($, productUrl);
    const image = gallery[0] || fallback.image || "";

    return {
      sourceUrl: productUrl,
      name,
      price,
      article,
      description,
      descriptionHtml,
      specs,
      attributes,
      gallery
    };
  } catch (e) {
    return {
      ...fallback,
      sourceUrl: productUrl,
      warning: `product_fetch_failed: ${e.message}`
    };
  }
}

async function buildHiteProducts() {
  const categories = await collectCategoryUrls();
  const productCardsByUrl = new Map();
  const debug = {
    categoriesScanned: categories.length,
    categories: [],
    cardsFound: 0,
    detailWarnings: []
  };

  for (const cat of categories) {
    await sleep(DELAY_MS);
    let html = "";
    let status = 0;
    try {
      const fetched = await fetchText(cat.url);
      html = fetched.html;
      status = fetched.status;
    } catch (e) {
      debug.categories.push({ url: cat.url, title: cat.title, status: 0, cards: 0, error: e.message });
      continue;
    }
    if (status < 200 || status >= 300) {
      debug.categories.push({ url: cat.url, title: cat.title, status, cards: 0 });
      continue;
    }

    const $ = cheerio.load(html);
    const breadcrumbLast = toText($("nav.woocommerce-breadcrumb .breadcrumb-last").first().text());
    const h1 = toText($("h1").first().text());
    const pageCategoryTitle =
      (/^страница\s+\d+$/i.test(breadcrumbLast) ? "" : breadcrumbLast) ||
      h1 ||
      cat.title;
    const cards = extractCardsFromCategoryPage(cat.url, html);
    debug.cardsFound += cards.length;
    debug.categories.push({ url: cat.url, title: pageCategoryTitle, status, cards: cards.length });

    for (const card of cards) {
      const nextEntry = {
        ...card,
        categoryTitle: pageCategoryTitle,
        categoryUrl: cat.url
      };
      const prev = productCardsByUrl.get(card.link);
      if (!prev) {
        productCardsByUrl.set(card.link, nextEntry);
        continue;
      }
      const prevDepth = categoryDepth(prev.categoryUrl);
      const nextDepth = categoryDepth(cat.url);
      if (nextDepth > prevDepth) {
        productCardsByUrl.set(card.link, nextEntry);
      }
    }
  }

  const products = [];
  for (const card of productCardsByUrl.values()) {
    await sleep(DELAY_MS);
    const details = await fetchProductDetails(card.link, card);

    if (details.warning) {
      debug.detailWarnings.push({ url: card.link, warning: details.warning });
    }

    const article = toText(details.article || card.sku || slugToArticle(card.slug));
    const id = makeId(article, card.slug);
    const category = inferCategory(card.categoryTitle, details.name);
    const group = `HitePro / ${toText(card.categoryTitle) || "Каталог"}`;

    products.push({
      id,
      article,
      name: toText(details.name),
      price: Number.isFinite(Number(details.price)) ? Number(details.price) : null,
      category,
      group_name: group,
      brand: BRAND,
      image: toText(details.gallery && details.gallery[0]) || toText(details.image),
      source_url: toText(details.sourceUrl || card.link),
      description: toText(details.description),
      specs: toText(details.specs),
      description_html: toText(details.descriptionHtml),
      attributes_json: JSON.stringify(Array.isArray(details.attributes) ? details.attributes : []),
      documents_json: "[]",
      gallery_json: JSON.stringify(Array.isArray(details.gallery) ? details.gallery : []),
      updated_at: new Date().toISOString()
    });
  }

  return { products, debug };
}

function upsertHiteProducts(products) {
  const db = new Database(DB_PATH, { timeout: 15000 });
  db.pragma("journal_mode = WAL");

  const columns = db.prepare("PRAGMA table_info(products)").all().map((x) => x.name);
  const hasStatus = columns.includes("status");
  const hasIsExtra = columns.includes("is_extra");

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
  if (hasStatus) insertCols.push("status");
  if (hasIsExtra) insertCols.push("is_extra");

  const placeholders = insertCols.map((c) => `@${c}`).join(", ");
  const sql = `INSERT OR REPLACE INTO products (${insertCols.join(", ")}) VALUES (${placeholders})`;
  const insert = db.prepare(sql);
  const purge = db.prepare("DELETE FROM products WHERE brand = @brand");

  const tx = db.transaction((rows) => {
    purge.run({ brand: BRAND });
    for (const r of rows) {
      insert.run({
        ...r,
        price_text: r.price == null ? "" : `${Math.round(r.price)} руб. / шт`,
        breadcrumbs: `Товары / ${r.category} / ${r.group_name.replace(/^HitePro\s*\/\s*/i, "")} / ${r.name}`,
        status: "active",
        is_extra: 0
      });
    }
  });

  tx(products);
  const count = db.prepare("SELECT COUNT(*) AS c FROM products WHERE brand = @brand").get({ brand: BRAND }).c;
  db.close();
  return count;
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(REPORTS_DIR, `hite_shop_sync_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  return out;
}

async function main() {
  const started = Date.now();
  const { products, debug } = await buildHiteProducts();
  const count = upsertHiteProducts(products);

  const report = {
    ok: true,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    startUrl: START,
    brand: BRAND,
    parsedProducts: products.length,
    dbBrandProducts: count,
    productsWithImage: products.filter((x) => toText(x.image)).length,
    productsWithoutImage: products.filter((x) => !toText(x.image)).length,
    debug
  };

  const reportPath = writeReport(report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        parsedProducts: report.parsedProducts,
        dbBrandProducts: report.dbBrandProducts,
        productsWithImage: report.productsWithImage,
        productsWithoutImage: report.productsWithoutImage,
        reportFile: reportPath
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: e.message
      },
      null,
      2
    )
  );
  process.exit(1);
});
