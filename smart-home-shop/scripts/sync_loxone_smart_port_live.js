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

const BASE = "https://smart-port.ru";
const START = `${BASE}/shop`;
const BRAND = "Loxone";
const STORE_API = "https://store.tildaapi.com/api/getproductslist/";

const TIMEOUT = 35000;
const DELAY_MS = 120;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
  return toText(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, " - ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
  );
}

function parsePrice(raw) {
  const n = Number(String(raw || "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function isDiscontinuedText(v) {
  const s = toText(v).toLowerCase();
  if (!s) return false;
  return (
    s.includes("снят с производства") ||
    s.includes("снята с производства") ||
    s.includes("discontinued") ||
    s.includes("end of life") ||
    s.includes("eol")
  );
}

function decodeCategoryNameFromUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return "Каталог";
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const map = {
    all: "Все",
    "miniserver-extensions": "Miniserver Extensions",
    lighting: "Освещение",
    climate: "Климат",
    shades: "Шторы и жалюзи",
    "access-intercom": "Контроль доступа и домофония",
    safety: "Безопасность",
    energy: "Энергоменеджмент",
    wellness: "Wellness",
    software: "Программное обеспечение",
    control: "Управление",
    accessories: "Аксессуары",
    audio: "Аудио",
    "audio/server": "Аудиосервер",
    "audio/speakers": "Акустика",
    "audio/accessories": "Аудио аксессуары"
  };
  if (map[last]) return map[last];
  return decodeURIComponent(last).replace(/-/g, " ").trim() || "Каталог";
}

function sectionNameFromSlug(slug) {
  const key = toText(slug).toLowerCase();
  const map = {
    all: "Все",
    "miniserver-extensions": "Минисерверы и расширения",
    lighting: "Освещение",
    climate: "Климат",
    shades: "Шторы и жалюзи",
    "access-intercom": "Контроль доступа",
    safety: "Безопасность",
    energy: "Энергия",
    wellness: "Отдых и SPA",
    software: "Программное обеспечение",
    control: "Управление",
    accessories: "Аксессуары",
    audio: "Аудио",
    multimedia: "Аудио"
  };
  return map[key] || (decodeURIComponent(slug || "").replace(/-/g, " ").trim());
}

function sectionNameFromProductUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[0] === "shop" && parts[2] === "tproduct") {
      const slug = parts[1];
      if (slug && slug !== "all") return sectionNameFromSlug(slug);
    }
  } catch (_) {}
  return "";
}

function inferTopCategory(sectionName) {
  const s = toText(sectionName).toLowerCase();
  if (s.includes("освещ")) return "Освещение";
  if (s.includes("климат")) return "Климат";
  if (s.includes("безопас")) return "Безопасность";
  if (s.includes("энерго")) return "Энергомониторинг";
  if (s.includes("аудио")) return "Аудио / Multiroom";
  if (s.includes("аксесс")) return "Аксессуары";
  if (s.includes("жалю") || s.includes("штор")) return "Управление и автоматизация";
  if (s.includes("домоф") || s.includes("доступ")) return "Безопасность";
  return "Управление и автоматизация";
}

function isGenericSectionName(sectionName) {
  const s = toText(sectionName).toLowerCase();
  if (!s) return true;
  return (
    s === "каталог" ||
    s === "все" ||
    s.includes("вся продукц") ||
    s.includes("all products")
  );
}

function makeProductId(article, uid) {
  const a = toText(article)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (a) return `LX-${a}`;
  return `LX-UID-${toText(uid) || Date.now().toString(36)}`;
}

function parseArticleFromDescr(descr) {
  const txt = toText(descr).replace(/№/g, "");
  const m = txt.match(/артикул[^A-Za-zА-Яа-я0-9]*([A-Za-z0-9._+\-\/]+)/i);
  return m && m[1] ? toText(m[1]) : "";
}

function parseGallery(rawGallery, editions) {
  const out = [];
  const seen = new Set();
  function push(url) {
    const abs = toAbsUrl(url, BASE);
    if (!abs) return;
    const key = abs.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(abs);
  }
  if (Array.isArray(rawGallery)) {
    for (const g of rawGallery) {
      if (g && g.img) push(g.img);
      else if (typeof g === "string") push(g);
    }
  } else if (typeof rawGallery === "string" && rawGallery.trim()) {
    try {
      const parsed = JSON.parse(rawGallery);
      if (Array.isArray(parsed)) {
        for (const g of parsed) {
          if (g && g.img) push(g.img);
          else if (typeof g === "string") push(g);
        }
      }
    } catch (_) {}
  }
  if (Array.isArray(editions)) {
    for (const e of editions) {
      if (e && e.img) push(e.img);
    }
  }
  return out;
}

function extractLinksFromHtml(html) {
  const links = [];
  const seen = new Set();
  const $ = cheerio.load(`<div>${String(html || "")}</div>`);
  $("a[href]").each((_, a) => {
    const href = toAbsUrl($(a).attr("href"), BASE);
    const title = toText($(a).text()) || "Ссылка";
    if (!href) return;
    const key = href.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ title, url: href });
  });
  return links;
}

function parseListItemsFromHtml(html) {
  const values = [];
  const seen = new Set();
  const $ = cheerio.load(`<div>${String(html || "")}</div>`);
  $("li").each((_, li) => {
    const v = toText($(li).text());
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    values.push(v);
  });
  return values;
}

function parseCharacteristics(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    const name = toText(row && (row.title || row.name || row.key));
    const value = toText(row && (row.value || row.text));
    if (!name || !value) continue;
    out.push({ name, value });
  }
  return out;
}

function parsePartuidsList(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x || "").trim()).filter(Boolean);
  const s = String(raw || "").trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x || "").trim()).filter(Boolean);
    }
  } catch (_) {}
  const m = s.match(/\d{6,}/g);
  return Array.isArray(m) ? m : [];
}

function parseJsonWithBom(text) {
  return JSON.parse(String(text || "").replace(/^\uFEFF/, ""));
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
          const next = toAbsUrl(String(res.headers.location), url);
          res.resume();
          resolve(fetchText(next, redirectsLeft - 1));
          return;
        }
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => resolve({ status, text: raw }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${TIMEOUT}ms`));
    });
  });
}

function extractShopCategoryUrls(shopHtml) {
  const $ = cheerio.load(shopHtml);
  const out = new Map();
  $("a[href]").each((_, a) => {
    const href = toAbsUrl($(a).attr("href"), BASE);
    if (!href) return;
    let u;
    try {
      u = new URL(href);
    } catch (_) {
      return;
    }
    if (u.origin !== BASE) return;
    if (!u.pathname.startsWith("/shop/")) return;
    if (u.pathname.includes("/tproduct/")) return;
    const cleanPath = u.pathname.replace(/\/+$/, "");
    if (cleanPath === "/shop") return;
    const abs = `${u.origin}${cleanPath}`;
    if (!out.has(abs)) out.set(abs, true);
  });
  return Array.from(out.keys());
}

function extractStorePartIds(pageHtml) {
  const ids = new Set();
  const rx = /storepart\s*:\s*['"](\d{6,})['"]/g;
  let m;
  while ((m = rx.exec(pageHtml)) !== null) {
    ids.add(String(m[1]));
  }
  return Array.from(ids);
}

async function collectParts() {
  const { status, text } = await fetchText(START);
  if (status < 200 || status >= 300) throw new Error(`shop_start_http_${status}`);

  const urls = extractShopCategoryUrls(text);
  const parts = new Map();
  const debugCategories = [];

  for (const catUrl of urls) {
    await sleep(DELAY_MS);
    let catStatus = 0;
    let html = "";
    try {
      const res = await fetchText(catUrl);
      catStatus = res.status;
      html = res.text;
    } catch (e) {
      debugCategories.push({ url: catUrl, status: 0, partIds: [], error: e.message });
      continue;
    }

    if (catStatus < 200 || catStatus >= 300) {
      debugCategories.push({ url: catUrl, status: catStatus, partIds: [] });
      continue;
    }

    const $ = cheerio.load(html);
    const pageTitle = toText($("title").first().text()) || decodeCategoryNameFromUrl(catUrl);
    const sectionName = pageTitle.replace(/\s*[-|]\s*.*$/g, "").trim() || decodeCategoryNameFromUrl(catUrl);
    const ids = extractStorePartIds(html);
    debugCategories.push({ url: catUrl, status: catStatus, partIds: ids, sectionName });

    for (const id of ids) {
      if (!parts.has(id)) {
        parts.set(id, {
          partuid: id,
          categoryUrl: catUrl,
          sectionName
        });
      }
    }
  }

  return {
    parts: Array.from(parts.values()),
    debugCategories
  };
}

async function fetchPartProducts(partuid) {
  const out = [];
  let slice = 1;
  const maxSlices = 25;

  while (slice <= maxSlices) {
    const url = `${STORE_API}?storepartuid=${encodeURIComponent(partuid)}&slice=${slice}`;
    await sleep(DELAY_MS);
    let status = 0;
    let body = "";
    try {
      const res = await fetchText(url);
      status = res.status;
      body = res.text;
    } catch (e) {
      throw new Error(`part_${partuid}_slice_${slice}_fetch_failed: ${e.message}`);
    }
    if (status < 200 || status >= 300) {
      throw new Error(`part_${partuid}_slice_${slice}_http_${status}`);
    }

    const parsed = parseJsonWithBom(body);
    const rows = Array.isArray(parsed.products) ? parsed.products : [];
    out.push(...rows);

    const next = Number(parsed.nextslice || 0);
    if (!next || next <= slice || rows.length === 0) break;
    slice = next;
  }

  return out;
}

function productScoreForPick(p) {
  const galleryLen = Array.isArray(p.gallery) ? p.gallery.length : 0;
  const descrLen = String(p.description || "").length;
  const specsLen = String(p.specs || "").length;
  const hasPrice = Number.isFinite(Number(p.price)) ? 1 : 0;
  return galleryLen * 1000 + descrLen + specsLen + hasPrice * 100;
}

function normalizeProduct(raw, partMeta, sectionByPartuid) {
  const title = toText(raw && raw.title);
  const sku = toText(raw && raw.sku);
  const article = sku || parseArticleFromDescr(raw && raw.descr) || "";
  const uid = toText(raw && raw.uid);
  const id = makeProductId(article || uid, uid);

  const gallery = parseGallery(raw && raw.gallery, raw && raw.editions);
  const image = gallery[0] || toAbsUrl(raw && raw.img, BASE) || "";

  const descriptionHtml = toText(raw && raw.text);
  const description = stripHtml(descriptionHtml);
  const listItems = parseListItemsFromHtml(descriptionHtml);
  const characteristics = parseCharacteristics(raw && raw.characteristics);

  const attributes = [];
  for (const row of characteristics) attributes.push(row);
  if (listItems.length) {
    attributes.push({
      name: "Особенности",
      value: listItems.join("; ")
    });
  }

  const specs = attributes.map((x) => `${x.name}: ${x.value}`).join("; ");
  const docs = extractLinksFromHtml(descriptionHtml);
  const price = parsePrice(raw && raw.price);
  const isDiscontinued = isDiscontinuedText(title) || isDiscontinuedText(descriptionHtml) || isDiscontinuedText(raw && raw.descr);

  const sourceUrl = toAbsUrl(raw && raw.url, BASE);
  const partuids = parsePartuidsList(raw && raw.partuids);
  const sectionFromPartuids = partuids
    .map((id) => toText(sectionByPartuid.get(String(id)) || ""))
    .find((x) => x && !isGenericSectionName(x));
  const sectionName =
    sectionFromPartuids ||
    sectionNameFromProductUrl(sourceUrl) ||
    toText(partMeta && partMeta.sectionName) ||
    "Каталог";
  const category = inferTopCategory(sectionName);
  const groupName = `Loxone / ${sectionName}`;

  return {
    id,
    article: article || uid,
    uid,
    name: title || `Loxone ${uid}`,
    price,
    category,
    group_name: groupName,
    brand: BRAND,
    image,
    source_url: sourceUrl,
    description,
    specs,
    description_html: descriptionHtml,
    attributes_json: JSON.stringify(attributes),
    documents_json: JSON.stringify(docs),
    gallery_json: JSON.stringify(gallery),
    status: isDiscontinued ? "archived" : "active",
    updated_at: new Date().toISOString(),
    partuid: String(partMeta && partMeta.partuid || ""),
    partuids_json: JSON.stringify(partuids),
    categoryUrl: String(partMeta && partMeta.categoryUrl || "")
  };
}

async function buildLoxoneProducts() {
  const { parts, debugCategories } = await collectParts();
  const all = [];
  const debugParts = [];
  const sectionByPartuid = new Map(parts.map((p) => [String(p.partuid), toText(p.sectionName)]));

  for (const part of parts) {
    let rawProducts = [];
    try {
      rawProducts = await fetchPartProducts(part.partuid);
      debugParts.push({
        partuid: part.partuid,
        categoryUrl: part.categoryUrl,
        sectionName: part.sectionName,
        products: rawProducts.length
      });
    } catch (e) {
      debugParts.push({
        partuid: part.partuid,
        categoryUrl: part.categoryUrl,
        sectionName: part.sectionName,
        products: 0,
        error: e.message
      });
      continue;
    }

    for (const rp of rawProducts) {
      all.push(normalizeProduct(rp, part, sectionByPartuid));
    }
  }

  const byUid = new Map();
  for (const p of all) {
    const key = String(p.uid || p.source_url || p.id).toLowerCase();
    if (!key) continue;
    const prev = byUid.get(key);
    if (!prev) {
      byUid.set(key, p);
      continue;
    }

    const prevScore = productScoreForPick(prev);
    const nextScore = productScoreForPick(p);
    const prevGeneric = isGenericSectionName(prev.brand_subcategory);
    const nextGeneric = isGenericSectionName(p.brand_subcategory);

    if (
      nextScore > prevScore ||
      (nextScore === prevScore && prevGeneric && !nextGeneric)
    ) {
      byUid.set(key, p);
    }
  }

  return {
    products: Array.from(byUid.values()),
    debug: {
      categoriesScanned: debugCategories.length,
      partsFound: parts.length,
      categories: debugCategories,
      parts: debugParts
    }
  };
}

function upsertLoxoneProducts(products) {
  const db = new Database(DB_PATH, { timeout: 20000 });
  db.pragma("journal_mode = WAL");

  const columns = db.prepare("PRAGMA table_info(products)").all().map((x) => x.name);
  const hasStatus = columns.includes("status");
  const hasIsExtra = columns.includes("is_extra");
  const hasBrandSubcategory = columns.includes("brand_subcategory");

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
  if (hasBrandSubcategory) insertCols.push("brand_subcategory");
  if (hasStatus) insertCols.push("status");
  if (hasIsExtra) insertCols.push("is_extra");

  const placeholders = insertCols.map((c) => `@${c}`).join(", ");
  const sql = `INSERT OR REPLACE INTO products (${insertCols.join(", ")}) VALUES (${placeholders})`;
  const insert = db.prepare(sql);
  const purge = db.prepare("DELETE FROM products WHERE brand = @brand");

  const tx = db.transaction((rows) => {
    purge.run({ brand: BRAND });
    for (const r of rows) {
      const subcat = toText(String(r.group_name || "").replace(/^Loxone\s*\/\s*/i, "")) || "Каталог";
      insert.run({
        ...r,
        price_text: r.price == null ? "" : `${Math.round(r.price)} руб. / шт`,
        breadcrumbs: `Товары / ${r.category} / ${subcat} / ${r.name}`,
        brand_subcategory: subcat,
        status: String(r.status || "active").toLowerCase() === "archived" ? "archived" : "active",
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
  const out = path.join(REPORTS_DIR, `loxone_smart_port_sync_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  return out;
}

async function main() {
  const started = Date.now();
  const { products, debug } = await buildLoxoneProducts();
  const dbCount = upsertLoxoneProducts(products);

  const report = {
    ok: true,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    startUrl: START,
    apiUrl: STORE_API,
    brand: BRAND,
    parsedProducts: products.length,
    dbBrandProducts: dbCount,
    productsWithImage: products.filter((x) => toText(x.image)).length,
    productsWithoutImage: products.filter((x) => !toText(x.image)).length,
    productsWithPrice: products.filter((x) => Number.isFinite(Number(x.price))).length,
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
        productsWithPrice: report.productsWithPrice,
        reportFile: reportPath
      },
      null,
      2
    )
  );
}

if (require.main === module) {
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
}

module.exports = {
  BRAND,
  BASE,
  toText,
  toAbsUrl,
  stripHtml,
  parsePrice,
  decodeCategoryNameFromUrl,
  sectionNameFromSlug,
  sectionNameFromProductUrl,
  inferTopCategory,
  isGenericSectionName,
  makeProductId,
  parseArticleFromDescr,
  parseGallery,
  extractLinksFromHtml,
  parseListItemsFromHtml,
  parseCharacteristics,
  parsePartuidsList,
  extractShopCategoryUrls,
  extractStorePartIds,
  normalizeProduct
};
