export function formatPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "Цена по запросу";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n)} ₽`;
}

export function formatPriceByCurrency(value, currency = "RUB") {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "Цена по запросу";
  if (String(currency || "RUB").toUpperCase() === "EUR") {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} €`;
  }
  return formatPrice(n);
}

export function getProductPriceView(product) {
  const currency = String(product?.priceCurrency || "RUB").toUpperCase();
  const value = Number(product?.priceValue ?? product?.price);
  const rub = Number(product?.price ?? product?.priceRub ?? 0);
  const main = formatPriceByCurrency(value, currency);
  const approxRub = currency === "EUR" && Number.isFinite(rub) && rub > 0 ? `≈ ${formatPrice(rub)}` : "";
  return { currency, main, approxRub, rub };
}

export function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function parseJsonList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function resetFacetFilters(filters) {
  filters.brands = [];
  filters.types = [];
  filters.systemTypes = [];
  filters.protocols = [];
  filters.mountings = [];
  filters.supplyVoltages = [];
  filters.channels = [];
  filters.nominalCurrents = [];
  filters.nominalPowers = [];
  filters.sensorTypes = [];
  filters.indoorOutdoor = [];
  filters.ipRatings = [];
  filters.ioCounts = [];
  filters.webInterfaces = [];
  filters.scenarioSupports = [];
  filters.loadTypes = [];
  filters.maxLoads = [];
  filters.minPrice = "";
  filters.maxPrice = "";
}

export function splitBreadcrumbs(value) {
  return String(value || "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.toLowerCase() !== "товары");
}

export function uniqueSorted(values) {
  return Array.from(new Set(values.map(normText).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
}

export function facetCounts(items, projector) {
  const map = new Map();
  for (const item of items) {
    const key = projector(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "ru"));
}

export function extractArticleAliases(rawArticle) {
  const raw = String(rawArticle || "").trim();
  if (!raw) return [];
  const chunks = raw
    .split(/[\/|,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const clean = chunk.replace(/\s+/g, " ").replace(/[()]+/g, "").trim();
    if (!clean) continue;
    const key = clean.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function productMatchesSearch(product, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  const aliases = extractArticleAliases(product && product.article);
  const hay = [product.name, product.article, product.id, ...aliases].map((x) => String(x || "").toLowerCase());
  return hay.some((x) => x.includes(q));
}

export function breadCrumbs(parts) {
  const html = parts
    .map((part, index) => {
      if (!part.href || index === parts.length - 1) return `<span>${part.label}</span>`;
      return `<a href="${part.href}">${part.label}</a>`;
    })
    .join(" / ");
  return `<div class="breadcrumbs">${html}</div>`;
}

export function pageTitle(text) {
  return `<h1 class="h1">${text}</h1><div class="h1-line"></div>`;
}

export function searchRow(value = "") {
  return `
    <div class="search-row">
      <div class="search-field">
        <input class="input search-input" id="searchInput" value="${value}" placeholder="Поиск по каталогу" />
        <button class="search-clear-btn" id="searchClearBtn" type="button" aria-label="Очистить поиск" hidden>×</button>
      </div>
    </div>
  `;
}

export function imageTag(src, alt, className = "", placeholderImage = "") {
  const cls = className ? ` class="${className}"` : "";
  const finalSrc = (!src || src.startsWith("https://via.placeholder.com")) ? placeholderImage : src;
  const placeholderAttr = placeholderImage ? ` data-placeholder-src="${placeholderImage}"` : "";
  return `<img${cls} src="${finalSrc}" alt="${alt}" loading="lazy"${placeholderAttr} />`;
}

export function favoriteIconMarkup(active) {
  return active
    ? '<span class="material-symbols-rounded msi" aria-hidden="true">favorite</span>'
    : '<span class="material-symbols-rounded msi" aria-hidden="true">favorite_border</span>';
}

export function setImageFallback(img, placeholderImage) {
  if (img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = placeholderImage;
}

export function normalizeVariantBaseName(name) {
  return String(name || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[.,/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseSpecsString(specsData, extra) {
  String(specsData || "")
    .split(";")
    .map((spec) => spec.trim())
    .filter(Boolean)
    .forEach((spec) => {
      const idx = spec.indexOf(":");
      if (idx > 0) {
        extra.push([spec.slice(0, idx).trim(), spec.slice(idx + 1).trim()]);
      } else {
        extra.push(["Параметр", spec]);
      }
    });
}

function formatMetricNumber(raw) {
  const s = String(raw || "").replace(",", ".").trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

export function normalizeMeasurementValue(kind, raw) {
  if (!raw) return "";
  const lower = String(raw).toLowerCase().replace(/\s+/g, " ");
  const match = lower.match(/(-?\d+(?:[.,]\d+)?)\s*([a-zа-яё%°]+)/i);
  if (!match) return fixMojibake(String(raw).trim());

  const num = formatMetricNumber(match[1]);
  if (!num) return fixMojibake(String(raw).trim());

  const unitRaw = String(match[2] || "").toLowerCase();

  if (kind === "voltage") {
    if (/^(kv|кв)/.test(unitRaw)) return `${num} kV`;
    if (/^(mv|мв)/.test(unitRaw)) return `${num} mV`;
    if (/^(v|в)/.test(unitRaw)) return `${num} V`;
  }

  if (kind === "power") {
    if (/^(kw|квт)/.test(unitRaw)) return `${num} kW`;
    if (/^(mw|мвт)/.test(unitRaw)) return `${num} mW`;
    if (/^(w|вт)/.test(unitRaw)) return `${num} W`;
  }

  if (kind === "current") {
    if (/^(ma|мa|ма)/.test(unitRaw)) return `${num} mA`;
    if (/^(a|а)/.test(unitRaw)) return `${num} A`;
  }

  return fixMojibake(String(raw).trim());
}

export function fixMojibake(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export function applySafeHtml(el, html) {
  if (!el) return;
  el.innerHTML = fixMojibake(String(html || ""));
}

function sanitizeUnknown(value) {
  if (value == null) return value;
  if (typeof value === "string") return fixMojibake(value);
  if (Array.isArray(value)) return value.map(sanitizeUnknown);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeUnknown(v);
    return out;
  }
  return value;
}

export function sanitizeCatalogProduct(product) {
  if (!product || typeof product !== "object") return product;

  const out = sanitizeUnknown(product);

  out.systemType = fixMojibake(out.systemType || "");
  out.protocol = fixMojibake(out.protocol || "");
  out.mounting = fixMojibake(out.mounting || "");
  out.sensorType = fixMojibake(out.sensorType || "");
  out.indoorOutdoor = fixMojibake(out.indoorOutdoor || "");
  out.ipRating = fixMojibake(out.ipRating || "");
  out.ioCount = fixMojibake(out.ioCount || "");
  out.webInterface = fixMojibake(out.webInterface || "");
  out.scenarioSupport = fixMojibake(out.scenarioSupport || "");
  out.loadType = fixMojibake(out.loadType || "");
  out.maxLoad = fixMojibake(out.maxLoad || "");
  out.channels = fixMojibake(out.channels || "");
  out.supplyVoltage = normalizeMeasurementValue("voltage", out.supplyVoltage || "");
  out.nominalCurrent = normalizeMeasurementValue("current", out.nominalCurrent || "");
  out.nominalPower = normalizeMeasurementValue("power", out.nominalPower || "");

  if (!Array.isArray(out.attributes)) out.attributes = [];
  if (!Array.isArray(out.gallery)) out.gallery = [];
  if (!Array.isArray(out.documents)) out.documents = [];

  return out;
}
