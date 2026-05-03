const fs = require("fs");
const path = require("path");
const { initSchema, replaceAllProducts, getStats } = require("../db/database");

const sourcePath = path.join(__dirname, "..", "data", "import", "simpleled-products.json");

function loadSource() {
  const raw = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function parseSpecsFromName(name) {
  if (!name) return "";
  const m = String(name).match(/\(([^)]+)\)/);
  return m ? `Параметры: ${m[1]}` : "";
}

function inferGroup(category, breadcrumbs) {
  const parts = String(breadcrumbs || "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 1];
  return category || "";
}

function normalizeId(item, seen) {
  const base = String(item.id || "").trim() || String(item.article || "").trim() || String(item.name || "").trim();
  let candidate = base || `prd-${Math.random().toString(36).slice(2, 10)}`;
  if (!seen.has(candidate)) {
    seen.add(candidate);
    return candidate;
  }
  let i = 2;
  while (seen.has(`${candidate}-${i}`)) i += 1;
  candidate = `${candidate}-${i}`;
  seen.add(candidate);
  return candidate;
}

function normalizeImage(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  const abs = value.startsWith("//") ? `https:${value}` : value;
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

function transform(source) {
  const seen = new Set();
  return source.map((item) => {
    const id = normalizeId(item, seen);
    const name = String(item.name || "").trim();
    const category = String(item.category || "").trim();
    const group = inferGroup(category, item.breadcrumbs);
    return {
      id,
      article: String(item.article || item.id || "").trim(),
      name,
      price: item.price ?? null,
      priceText: String(item.priceText || "").trim(),
      category,
      group,
      brand: group || "simpleLED",
      image: normalizeImage(item.image),
      gallery: Array.isArray(item.gallery) ? item.gallery.map(normalizeImage).filter(Boolean) : [],
      sourceUrl: String(item.sourceUrl || "").trim(),
      description: `Импорт из simpleled.ru. ${name}`,
      specs: parseSpecsFromName(name),
      breadcrumbs: String(item.breadcrumbs || "").trim()
    };
  });
}

function run() {
  initSchema();
  const source = loadSource();
  const products = transform(source);
  replaceAllProducts(products);
  const stats = getStats();
  console.log(`Imported to DB: ${products.length} products`);
  console.log(`Stats: products=${stats.products}, orders=${stats.orders}`);
}

run();
