// Форматирование цены
export function formatPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "Цена по запросу";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n)} руб.`;
}

// Создание URL-дружественной строки
export function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-zР°-СЏС'0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Нормализация текста
export function normText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Парсинг JSON списка
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

// Сброс фильтров
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

// Разделение хлебных крошек
export function splitBreadcrumbs(value) {
  return String(value || "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.toLowerCase() !== "товары");
}

// Подсчет уникальных значений с сортировкой
export function uniqueSorted(values) {
  return Array.from(new Set(values.map(normText).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
}

// Подсчет фасетов (количества для фильтров)
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

// Проверка соответствия товара поисковому запросу
export function productMatchesSearch(product, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  const aliases = extractArticleAliases(product && product.article);
  const hay = [product.name, product.article, product.id, ...aliases].map((x) => String(x || "").toLowerCase());
  return hay.some((x) => x.includes(q));
}

// Разбор артикулов-алиасов: "CW-MSD / CW-MSD-II" -> ["CW-MSD", "CW-MSD-II"]
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
    const clean = chunk
      .replace(/\s+/g, " ")
      .replace(/[()]+/g, "")
      .trim();
    if (!clean) continue;
    const key = clean.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

// Создание хлебных крошек
export function breadCrumbs(parts) {
  const html = parts
    .map((part, index) => {
      if (!part.href || index === parts.length - 1) return `<span>${part.label}</span>`;
      return `<a href="${part.href}">${part.label}</a>`;
    })
    .join(" / ");
  return `<div class="breadcrumbs">${html}</div>`;
}

// Создание заголовка страницы
export function pageTitle(text) {
  return `<h1 class="h1">${text}</h1><div class="h1-line"></div>`;
}

// Создание строки поиска
export function searchRow(value = "") {
  return `
    <div class="search-row">
      <input class="input" id="searchInput" value="${value}" placeholder="Поиск по каталогу" />
      <button class="button button-outline" id="searchBtn" type="button">Найти</button>
    </div>
  `;
}

// Создание тега изображения
export function imageTag(src, alt, className = "", placeholderImage = "") {
  const cls = className ? ` class="${className}"` : "";
  // Всегда используем заглушку если src пустой или внешний URL
  const finalSrc = (!src || src.startsWith('https://via.placeholder.com')) ? placeholderImage : src;
  return `<img${cls} src="${finalSrc}" alt="${alt}" loading="lazy" onerror="this.src='${placeholderImage}'" />`;
}

// Установка fallback для изображения
export function setImageFallback(img, placeholderImage) {
  if (img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = placeholderImage;
}

// Нормализация базового имени варианта
export function normalizeVariantBaseName(name) {
  return String(name || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[.,/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Парсинг строки характеристик
export function parseSpecsString(specsData, extra) {
  String(specsData)
    .split(";")
    .map((part) => part.trim())
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
  const s = String(raw || "").trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

export function normalizeMeasurementValue(kind, rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const match = lower.match(/(-?\d+(?:[.,]\d+)?)\s*([a-z\u0430-\u044f\u0451%\u00b0]+)/i);
  if (!match) return raw;

  const num = formatMetricNumber(match[1]);
  if (!num) return raw;
  const unitRaw = String(match[2] || "").toLowerCase();

  if (kind === "voltage") {
    if (/^kv|^\u043a\u0432/.test(unitRaw)) return `${num} \u043a\u0412`;
    if (/^mv|^\u043c\u0432/.test(unitRaw)) return `${num} \u043c\u0412`;
    if (/^v|^\u0432/.test(unitRaw)) return `${num} \u0412`;
  }

  if (kind === "power") {
    if (/^kw|^\u043a\u0432\u0442/.test(unitRaw)) return `${num} \u043a\u0412\u0442`;
    if (/^mw|^\u043c\u0432\u0442/.test(unitRaw)) return `${num} \u043c\u0412\u0442`;
    if (/^w|^\u0432\u0442/.test(unitRaw)) return `${num} \u0412\u0442`;
  }

  if (kind === "current") {
    if (/^ma|^\u043ca|^\u043c\u0430/.test(unitRaw)) return `${num} \u043c\u0410`;
    if (/^a|^\u0430/.test(unitRaw)) return `${num} \u0410`;
  }

  return raw;
}


