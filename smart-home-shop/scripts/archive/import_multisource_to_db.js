const { initSchema, replaceAllProducts, getStats } = require("../db/database");
const cheerio = require("cheerio");

const UA = "Mozilla/5.0 (compatible; SmartHomeShopMultiImporter/1.0)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function text(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function parsePrice(raw) {
  const cleaned = text(raw).replace(/\u00A0/g, " ");
  const nums = cleaned.match(/[\d\s,.]+/);
  if (!nums) return null;
  const value = Number(nums[0].replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function abs(base, href) {
  if (!href) return "";
  return new URL(href, base).toString();
}

function uniqBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function makeId(prefix, value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^\wа-яё-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${normalized || Math.random().toString(36).slice(2, 10)}`;
}

async function scrapeHiteWireless() {
  const root = "https://www.hite-pro.ru";
  const start = `${root}/shop/c/besprovodnoj-umnyj-dom`;

  const startHtml = await fetchHtml(start);
  const $start = cheerio.load(startHtml);

  const categoryUrls = new Set([start]);
  $start("a[href*='/shop/c/besprovodnoj-umnyj-dom']").each((_, a) => {
    categoryUrls.add(abs(root, $start(a).attr("href")));
  });

  const products = [];
  for (const url of categoryUrls) {
    let html = "";
    try {
      html = await fetchHtml(url);
    } catch {
      continue;
    }
    const $ = cheerio.load(html);
    const sub = text($("h1, .title.page-title").first().text()) || "Каталог";

    $("li.product, .products .product").each((_, node) => {
      const card = $(node);
      const href = abs(root, card.find("a[href*='/shop/goods/']").first().attr("href"));
      if (!href) return;
      const name =
        text(card.find(".wd-entities-title").first().text()) ||
        text(card.find("h3").first().text()) ||
        text(card.find("a[aria-label]").first().attr("aria-label"));
      if (!name) return;
      const priceText = text(card.find(".price").first().text());
      const price = parsePrice(priceText);
      const image = abs(root, card.find("img").first().attr("src") || card.find("img").first().attr("data-src"));
      products.push({
        id: makeId("hite", href),
        article: "",
        name,
        price,
        priceText,
        category: sub,
        group: sub,
        brand: "HiTE PRO",
        image,
        gallery: image ? [image] : [],
        sourceUrl: href,
        description: `Импорт из hite-pro.ru. ${name}`,
        specs: "",
        breadcrumbs: `Оборудование УД беспроводное / HiTE PRO / ${sub}`
      });
    });
    await sleep(120);
  }

  return uniqBy(products, (x) => x.sourceUrl);
}

async function scrapeWirenBoard() {
  const root = "https://wirenboard.com";
  const catalogUrl = `${root}/ru/catalog/`;
  const html = await fetchHtml(catalogUrl);
  const $ = cheerio.load(html);

  const categoryUrls = new Set();
  $("a[href*='/catalog/']").each((_, a) => {
    const u = abs(root, $(a).attr("href"));
    if (!/\/catalog\/[^/]+\/?$/.test(new URL(u).pathname)) return;
    if (/pricelist|discontinued|wirenboard-pro/i.test(u)) return;
    categoryUrls.add(u);
  });

  const productUrls = new Set();
  for (const url of categoryUrls) {
    let page = "";
    try {
      page = await fetchHtml(url);
    } catch {
      continue;
    }
    const $cat = cheerio.load(page);
    $cat("a[href*='/ru/product/']").each((_, a) => {
      productUrls.add(abs(root, $cat(a).attr("href")));
    });
    await sleep(100);
  }

  const products = [];
  for (const url of productUrls) {
    let page = "";
    try {
      page = await fetchHtml(url);
    } catch {
      continue;
    }
    const $p = cheerio.load(page);

    const name =
      text($p("meta[property='og:title']").attr("content")) ||
      text($p("title").text()).replace(/\s*-\s*Wiren Board\s*$/i, "");
    if (!name) continue;

    const priceText = text($p(".product-description__price .price").first().text());
    const price = parsePrice(priceText);
    const image = text($p("meta[property='og:image']").attr("content"));
    const description = text($p("meta[name='description']").attr("content")) || `Импорт из wirenboard.com. ${name}`;

    let category = "";
    const m = page.match(/ecommerceDetail\(\[\{[\s\S]*?"category":"([^"]+)"/);
    if (m) category = text(m[1]);
    if (!category) category = "Оборудование";

    const article = text(url.split("/").filter(Boolean).at(-1)).toUpperCase();
    products.push({
      id: makeId("wb", url),
      article,
      name,
      price,
      priceText,
      category,
      group: category,
      brand: "Wiren Board",
      image,
      gallery: image ? [image] : [],
      sourceUrl: url,
      description,
      specs: "",
      breadcrumbs: `Оборудование УД проводное, сделано в РФ / Wiren Board / ${category}`
    });
    await sleep(100);
  }

  return uniqBy(products, (x) => x.sourceUrl);
}

function staticDirectionProducts() {
  const rows = [
    {
      id: "loxone-direction",
      article: "LOXONE",
      name: "Loxone (Австрия): подбор оборудования и внедрение",
      price: null,
      priceText: "По запросу",
      category: "Loxone",
      group: "Loxone",
      brand: "Loxone",
      image: "",
      gallery: [],
      sourceUrl: "https://smart-port.ru/smart-home",
      description: "Направление умного дома на базе Loxone. Детализация каталога будет добавлена отдельно.",
      specs: "",
      breadcrumbs: "Оборудование УД сделано в Австрии, Loxone / Loxone"
    },
    {
      id: "larnitech-direction",
      article: "LARNITECH",
      name: "Larnitech (Германия): подбор оборудования и внедрение",
      price: null,
      priceText: "По запросу",
      category: "Larnitech",
      group: "Larnitech",
      brand: "Larnitech",
      image: "",
      gallery: [],
      sourceUrl: "https://larnitech-rus.ru/",
      description: "Направление умного дома на базе Larnitech. Детализация каталога будет добавлена отдельно.",
      specs: "",
      breadcrumbs: "Оборудование УД сделано в Германии, Larnitech / Larnitech"
    },
    {
      id: "design-direction",
      article: "DESIGN-UD",
      name: "Проектирование систем умного дома",
      price: null,
      priceText: "По запросу",
      category: "Проектирование",
      group: "Услуги",
      brand: "делаемСЕТИ",
      image: "",
      gallery: [],
      sourceUrl: "",
      description: "Проектирование умного дома: ТЗ, схемы, подбор оборудования, смета, авторский надзор.",
      specs: "",
      breadcrumbs: "Проектирование УД / Услуги"
    },
    {
      id: "networks-direction",
      article: "NET-WIFI-SCS",
      name: "Сети передачи данных: Wi-Fi, Internet, СКС",
      price: null,
      priceText: "По запросу",
      category: "Сети передачи данных",
      group: "Услуги",
      brand: "делаемСЕТИ",
      image: "",
      gallery: [],
      sourceUrl: "",
      description: "Построение и модернизация сетей передачи данных: Wi-Fi, Internet, СКС.",
      specs: "",
      breadcrumbs: "Оборудование для построения сетей передачи данных, WIFI, internet, СКС / Услуги"
    }
  ];
  return rows;
}

async function run() {
  initSchema();
  console.log("Importing new catalog sources...");

  const hite = await scrapeHiteWireless();
  console.log(`Hite products: ${hite.length}`);

  const wb = await scrapeWirenBoard();
  console.log(`Wiren Board products: ${wb.length}`);

  const staticRows = staticDirectionProducts();
  const all = [...hite, ...wb, ...staticRows];
  replaceAllProducts(all);

  const stats = getStats();
  console.log(`Imported total: ${all.length}`);
  console.log("Stats:", stats);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
