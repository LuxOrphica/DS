const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const BASE_URL = "https://simpleled.ru";
const START_URL = `${BASE_URL}/products`;
const OUT_DIR = path.join(__dirname, "..", "data", "import");
const OUT_JSON = path.join(OUT_DIR, "simpleled-products.json");
const OUT_CSV = path.join(OUT_DIR, "simpleled-products.csv");
const OUT_CATS = path.join(OUT_DIR, "simpleled-categories.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(href) {
  if (!href) return null;
  const url = new URL(href, BASE_URL);
  url.hash = "";

  if (url.pathname === "/products") {
    url.search = "";
    return url.toString();
  }

  if (!url.pathname.startsWith("/products/category/")) {
    return null;
  }

  const page = Number(url.searchParams.get("page") || "1");
  url.search = "";
  if (Number.isFinite(page) && page > 1) {
    url.searchParams.set("page", String(page));
  }
  return url.toString();
}

function absoluteImage(src) {
  if (!src) return "";
  const abs = src.startsWith("//") ? `https:${src}` : src.startsWith("/") ? `${BASE_URL}${src}` : src;
  const flat = abs.match(/\/(s\.siteapi\.org\/[^"'?\s]+\/img\/[^\s"'?]+)/i);
  if (flat && flat[1]) {
    return `https://${flat[1]}`;
  }
  const nested = abs.match(/\/([a-z0-9.-]+)\.s\.siteapi\.org\/img\/([^\s"'?]+)/i);
  if (nested && nested[1] && nested[2]) {
    return `https://s.siteapi.org/${nested[1]}/img/${nested[2]}`;
  }
  return abs;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parsePrice(text) {
  const normalized = cleanText(text).replace(/\u00A0/g, "").replace(",", ".");
  const numeric = normalized.match(/[\d.]+/g);
  if (!numeric) return null;
  return Number(numeric.join(""));
}

function parseGtagItems(html) {
  const match = html.match(/gtag\('event',\s*'view_item_list',\s*(\{[\s\S]*?\})\);/);
  if (!match) return [];
  try {
    const payload = JSON.parse(match[1]);
    return Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

function getBreadcrumbs($) {
  const crumbs = [];
  $(".bread-crumbs__item").each((_, node) => {
    const txt = cleanText($(node).text());
    if (txt) crumbs.push(txt);
  });
  return crumbs.filter((x) => x !== "/");
}

function toCsv(rows, columns) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = columns.map(esc).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SmartHomeShopImporter/1.0)"
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function run() {
  process.stdout.on("error", () => {});
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const queue = [START_URL];
  const visited = new Set();
  const productByUrl = new Map();
  const categoryByUrl = new Map();

  let fetchCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    const normalizedCurrent = normalizeUrl(current);
    if (!normalizedCurrent || visited.has(normalizedCurrent)) continue;
    visited.add(normalizedCurrent);

    fetchCount += 1;
    if (fetchCount % 20 === 1) {
      process.stdout.write(`Fetch #${fetchCount}: ${normalizedCurrent}\n`);
    }
    let html = "";
    try {
      html = await fetchHtml(normalizedCurrent);
    } catch (error) {
      process.stdout.write(`Skip: ${error.message}\n`);
      continue;
    }

    const $ = cheerio.load(html);
    const breadcrumbs = getBreadcrumbs($);
    const activeCategory = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 1] : "";

    $(".category-item__link a").each((_, a) => {
      const href = $(a).attr("href");
      const url = normalizeUrl(href);
      if (!url) return;

      const title = cleanText($(a).text());
      const image = absoluteImage($(a).closest(".category-item").find("img").first().attr("src"));
      if (title) {
        categoryByUrl.set(url, {
          name: title,
          url,
          parent: activeCategory || "",
          image
        });
      }
      if (!visited.has(url)) queue.push(url);
    });

    $(".catalog__pagination a[href*='page=']").each((_, a) => {
      const href = $(a).attr("href");
      const url = normalizeUrl(href);
      if (!url) return;
      if (!visited.has(url)) queue.push(url);
    });

    const gtagItems = parseGtagItems(html);
    const gtagByName = new Map();
    gtagItems.forEach((item) => {
      const key = cleanText(item.name).toLowerCase();
      if (!key) return;
      gtagByName.set(key, item);
    });

    $(".catalog__product .product-item").each((_, node) => {
      const card = $(node);
      const linkNode = card.find(".product-item__link a").first();
      const href = linkNode.attr("href");
      const productUrl = href ? new URL(href, BASE_URL).toString() : "";
      const name = cleanText(linkNode.text());
      if (!name || !productUrl) return;

      const imgSrc = absoluteImage(card.find(".product-item__preview img").first().attr("src"));
      const priceText = cleanText(card.find(".product-item-price").first().text());
      const price = parsePrice(priceText);
      const gtag = gtagByName.get(name.toLowerCase()) || {};

      const record = {
        id: gtag.id || "",
        article: gtag.id || "",
        name,
        price: price ?? (gtag.price ? Number(gtag.price) : null),
        priceText: priceText || "",
        category: activeCategory || gtag.category || "",
        breadcrumbs: breadcrumbs.join(" / "),
        image: imgSrc,
        sourceUrl: productUrl
      };
      productByUrl.set(productUrl, record);
    });

    await sleep(180);
  }

  const products = Array.from(productByUrl.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const categories = Array.from(categoryByUrl.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    OUT_CSV,
    toCsv(products, ["id", "article", "name", "price", "priceText", "category", "breadcrumbs", "image", "sourceUrl"]),
    "utf8"
  );
  fs.writeFileSync(OUT_CATS, `${JSON.stringify(categories, null, 2)}\n`, "utf8");

  process.stdout.write(`Done. Categories: ${categories.length}, Products: ${products.length}\n`);
  process.stdout.write(`Saved:\n- ${OUT_JSON}\n- ${OUT_CSV}\n- ${OUT_CATS}\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
