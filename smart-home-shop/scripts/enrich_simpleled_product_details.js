const cheerio = require("cheerio");
const {
  initSchema,
  getProductsForDetailEnrich,
  updateProductDetailsBatch,
  getStats
} = require("../db/database");

const BASE = "https://simpleled.ru";

function cleanText(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function absUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${BASE}${url}`;
  return url;
}

function toSourceImageUrl(url) {
  const absolute = absUrl(url);
  const flat = absolute.match(/\/(s\.siteapi\.org\/[^"'?\s]+\/img\/[^\s"'?]+)/i);
  if (flat && flat[1]) {
    return `https://${flat[1]}`;
  }
  const nested = absolute.match(/\/([a-z0-9.-]+)\.s\.siteapi\.org\/img\/([^\s"'?]+)/i);
  if (nested && nested[1] && nested[2]) {
    return `https://s.siteapi.org/${nested[1]}/img/${nested[2]}`;
  }
  return absolute;
}

function stripHtml(html) {
  return cleanText(String(html || "").replace(/<[^>]*>/g, " "));
}

function parseProductPage(html) {
  const $ = cheerio.load(html);

  const descHtml =
    $(".product__desc.show-for-large").first().html() ||
    $(".product__desc").first().html() ||
    "";
  const description = stripHtml(descHtml);

  const attrs = [];
  $("table.product-attributes tr").each((_, tr) => {
    const name = cleanText($(tr).find(".product-attributes__label").text());
    const value = cleanText($(tr).find(".product-attributes__value").text());
    if (name && value) attrs.push({ name, value });
  });
  const specs = attrs.map((x) => `${x.name}: ${x.value}`).join("; ");

  const docs = [];
  $(".document-item").each((_, node) => {
    const a = $(node).find("a.document-item__title").first();
    const title = cleanText(a.text());
    const href = absUrl(a.attr("href"));
    const meta = cleanText($(node).find(".document-item__size").text());
    if (title && href) docs.push({ title, url: href, meta });
  });

  const gallery = [];
  $("a.fancy-img[rel^='product-album-']").each((_, node) => {
    const href = toSourceImageUrl($(node).attr("href"));
    if (href) gallery.push(href);
  });

  const uniqGallery = [];
  const seen = new Set();
  for (const url of gallery) {
    const key = String(url || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqGallery.push(key);
  }

  const fallbackMain = toSourceImageUrl($(".product-media-slider img").first().attr("src"));
  const mainImage = uniqGallery[0] || fallbackMain || "";

  return {
    image: mainImage,
    gallery: uniqGallery,
    description,
    descriptionHtml: descHtml || "",
    attributes: attrs,
    specs,
    documents: docs
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SmartHomeShopDetailsImporter/1.0)"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function run() {
  initSchema();
  const limit = Number(process.argv[2] || 1000);
  const onlyMissing = process.argv[3] !== "--all";
  const rows = getProductsForDetailEnrich(limit, onlyMissing);
  console.log(`Enrich candidates: ${rows.length}`);

  const updates = [];
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    try {
      const html = await fetchHtml(row.sourceUrl);
      const parsed = parseProductPage(html);
      updates.push({
        id: row.id,
        ...parsed
      });
      ok += 1;
      if (ok % 50 === 0) console.log(`Parsed ${ok}/${rows.length}`);
    } catch (error) {
      fail += 1;
      if (fail <= 20) {
        console.log(`Skip ${row.id}: ${error.message}`);
      }
    }
  }

  updateProductDetailsBatch(updates);
  const stats = getStats();
  console.log(`Done. updated=${updates.length}, failed=${fail}`);
  console.log(`Stats:`, stats);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
