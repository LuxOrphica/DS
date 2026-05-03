import {
  searchRow,
  imageTag,
  breadCrumbs,
  slugify,
  productMatchesSearch,
  getProductPriceView,
  normalizeMeasurementValue,
  fixMojibake,
  applySafeHtml,
  favoriteIconMarkup
} from "./utils.js";
import {
  renderProductCard,
  getProductBrand,
  extractGalleryImages,
  pickPrimaryImage,
  isSoftSourceImage,
  getProductVariants,
  getSpecsRows,
  getFunctionRows,
  rebalanceProductCardMedia,
  bindProductCardGalleries
} from "./products.js";
import { isFavorite } from "./favorites.js";
import { getBrandSubcategory } from "./brand-pages.js";
import { PLACEHOLDER_IMAGE } from "./config.js";
import { addToCart, changeQty, getCartQtyByProduct, syncCardBuyBadges, updateCartBadges } from "./cart.js";
import { getCategoryFacetProfile, applyFacetProfile } from "./facet-profiles.js";
import { createFacetHelpers } from "./facet-utils.js";

function escapeHtmlText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanTextBlock(raw) {
  return fixMojibake(String(raw || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitDashListCandidate(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  const dashCount = (compact.match(/\s-\s/g) || []).length;
  if (dashCount < 4) return null;
  const parts = compact.split(/\s-\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 5) return null;
  const lead = parts.shift() || "";
  const items = parts
    .map((item) => item.replace(/[;,.]\s*$/g, "").trim())
    .filter((item) => item.length >= 3);
  if (items.length < 4) return null;
  return { lead, items };
}

function splitColonSpecCandidate(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact || !compact.includes(":")) return null;

  const labelRe = /([\p{L}][\p{L}0-9()В°+\-\/\s]{1,42}):/gu;
  const matches = [];
  let hit;
  while ((hit = labelRe.exec(compact)) !== null) {
    const label = String(hit[1] || "").trim();
    if (!label || label.length < 2) continue;
    matches.push({
      label,
      start: hit.index,
      end: labelRe.lastIndex
    });
  }

  if (matches.length < 2) return null;

  const rows = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const rawValue = compact.slice(current.end, next ? next.start : compact.length).trim();
    rows.push({ label: current.label, value: rawValue });
  }

  const valueRows = rows.filter((row) => row.value);
  if (valueRows.length < 2) return null;

  const hasTechLabels = rows.some((row) =>
    /(напряж|угол|свет|поток|размер|габарит|мощ|ток|частот|температур|влаж|монтаж|класс|протокол|канал|интерфейс|масса|материал|питани|voltage|power|current|frequency|temperature|dimensions|size|weight|protocol|mount)/i.test(row.label)
  );
  if (!hasTechLabels && valueRows.length < 3) return null;

  const leadParts = [];
  const beforeFirst = compact.slice(0, matches[0].start).trim();
  if (beforeFirst) leadParts.push(beforeFirst);
  for (const row of rows) {
    if (!row.value) leadParts.push(row.label);
  }

  const items = valueRows.map((row) => `${row.label}: ${row.value}`);
  return {
    lead: leadParts.join(". ").replace(/\.\s*\./g, ".").trim(),
    items
  };
}

function formatDescriptionHtml(raw) {
  const source = cleanTextBlock(raw);
  if (!source) return "";
  const paragraphBlocks = source
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const blocks = paragraphBlocks.length ? paragraphBlocks : [source];
  const out = [];

  for (const block of blocks) {
    const candidate = splitDashListCandidate(block);
    if (candidate) {
      if (candidate.lead) {
        out.push(`<p>${escapeHtmlText(candidate.lead)}</p>`);
      }
      out.push(
        `<ul>${candidate.items.map((item) => `<li>${escapeHtmlText(item)}</li>`).join("")}</ul>`
      );
      continue;
    }

    const specCandidate = splitColonSpecCandidate(block);
    if (specCandidate) {
      if (specCandidate.lead) {
        out.push(`<p>${escapeHtmlText(specCandidate.lead)}</p>`);
      }
      out.push(
        `<ul>${specCandidate.items.map((item) => `<li>${escapeHtmlText(item)}</li>`).join("")}</ul>`
      );
      continue;
    }

    if (/^[•\-]\s*/.test(block) || block.includes("\n- ") || block.includes("\n• ")) {
      const items = block
        .split(/\n+/)
        .map((line) => line.replace(/^[•\-]\s*/, "").trim())
        .filter(Boolean);
      if (items.length >= 2) {
        out.push(`<ul>${items.map((item) => `<li>${escapeHtmlText(item)}</li>`).join("")}</ul>`);
        continue;
      }
    }

    out.push(`<p>${escapeHtmlText(block)}</p>`);
  }

  return out.join("");
}

function canonicalTopCategoryName(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value === "Аудио" || value === "Аудио / Multiroom") return "Аудио и мультимедиа";
  if (value === "Безопасность") return "Безопасность и доступ";
  if (value === "Энергомониторинг") return "Энергия и учет";
  if (value === "Монтаж") return "Монтаж и расходники";
  if (value === "Сеть и инфраструктура") return "Монтаж и расходники";
  return value;
}

function isHiddenShowcaseCategory(raw) {
  const value = canonicalTopCategoryName(raw);
  return value === "Мерч" || value === "Услуги";
}

const CATALOG_CATEGORY_HERO_IMAGES = new Map([
  ["Управление и автоматизация", "/images/category-hero/control-automation.svg"],
  ["Монтаж и расходники", "/images/category-hero/mounting.svg"],
  ["Освещение", "/images/category-hero/lighting.svg"],
  ["Безопасность и доступ", "/images/category-hero/security.svg"],
  ["Климат", "/images/category-hero/climate.svg"],
  ["Энергия и учет", "/images/category-hero/energy.svg"],
  ["Аудио и мультимедиа", "/images/category-hero/audio-multiroom.svg"],
  ["Комплекты", "/images/category-hero/kits.svg"]
]);

const MAIN_CATALOG_SECTIONS = [
  "Управление и автоматизация",
  "Монтаж и расходники",
  "Освещение",
  "Безопасность и доступ",
  "Климат",
  "Аудио и мультимедиа",
  "Энергия и учет",
  "Комплекты"
];

const CATEGORY_SLUG_ALIASES = new Map([
  ["control_automation", "Управление и автоматизация"],
  ["installation", "Монтаж и расходники"],
  ["lighting", "Освещение"],
  ["security", "Безопасность и доступ"],
  ["climate", "Климат"],
  ["audio_multimedia", "Аудио и мультимедиа"],
  ["audio-multimedia", "Аудио и мультимедиа"],
  ["energy", "Энергия и учет"],
  ["kits", "Комплекты"]
]);

function resolveCategoryNameBySlug(products, categorySlug) {
  const raw = decodeURIComponent(String(categorySlug || "")).trim();
  const normalizedSlug = slugify(raw);
  const topCategories = Array.from(new Set((products || []).map((p) => getCatalogTopCategory(p)).filter(Boolean)));

  const direct = topCategories.find((name) => slugify(name) === normalizedSlug);
  if (direct) return direct;

  const aliasName = CATEGORY_SLUG_ALIASES.get(raw.toLowerCase()) || "";
  if (!aliasName) return "";
  return topCategories.find((name) => name === aliasName) || "";
}

const CATEGORY_BROWSER_ORDER = {
  "Управление и автоматизация": [
    "Минисерверы и расширения",
    "Контроллеры",
    "Реле и диммеры",
    "Шторы",
    "HMI",
    "Клавишные выключатели",
    "Датчики",
    "Аксессуары",
    "Прочее"
  ],
  "Освещение": [
    "Светильники",
    "Реле и диммеры",
    "Выключатели и панели",
    "Датчики",
    "LED-ленты",
    "Контроллеры освещения",
    "Аксессуары",
    "Прочее"
  ],
  "Монтаж и расходники": [
    "Монтажные элементы",
    "Кабели и переходники",
    "Крепеж и монтаж",
    "Аксессуары",
    "Прочее"
  ],
  "Безопасность и доступ": [
    "Датчики",
    "Контроль доступа",
    "Сирены и тревожные устройства",
    "Кнопки и брелоки",
    "Аксессуары",
    "Прочее"
  ],
  "Климат": [
    "Термостаты",
    "Датчики климата",
    "Управление кондиционерами",
    "Приводы и клапаны",
    "Аксессуары",
    "Прочее"
  ],
  "Энергия и учет": [
    "Электросчетчики",
    "Прочее"
  ],
  "Аудио и мультимедиа": [
    "Акустика",
    "Multiroom",
    "Аксессуары",
    "Прочее"
  ],
  "Комплекты": [
    "Готовые комплекты",
    "Наборы для освещения",
    "Наборы управления",
    "Наборы датчиков",
    "Прочее"
  ],
  "Аксессуары": [
    "Блоки питания",
    "Клеммы и коннекторы",
    "Кабели и переходники",
    "Крепеж и монтаж",
    "Прочее"
  ]
};

function normalizeCatalogBrowserSubcategory(topCategoryName, rawSubcategory, product = null) {
  const top = canonicalTopCategoryName(topCategoryName);
  const value = fixMojibake(String(rawSubcategory || "")).replace(/\s+/g, " ").trim();
  if (!top || !value || isHiddenShowcaseCategory(top)) return "";

  const allowed = CATEGORY_BROWSER_ORDER[top] || [];
  // If top category has no fixed order dictionary yet, keep raw normalized value.
  if (!allowed.length) return value;

  // Strict mode: storefront taxonomy follows normalized catalog only.
  // No heuristic remapping from noisy source labels.
  const exact = allowed.find((name) => name.toLowerCase() === value.toLowerCase());
  if (exact) return exact;

  // Unknown subcategory — bucket into Прочее so products remain visible.
  return "Прочее";
}

function getCatalogBrowserSubcategories(products, topCategoryName) {
  const top = canonicalTopCategoryName(topCategoryName);
  const order = CATEGORY_BROWSER_ORDER[top] || [];
  const normToRaw = new Map();
  const normalizedList = [];

  (products || []).forEach((product) => {
    const rawSub = String(product?.subCategory || "").trim();
    const normSub = normalizeCatalogBrowserSubcategory(top, rawSub, product);
    if (normSub === "Мерч" || normSub === "Услуги") return;
    if (!normSub || normSub === top) return;
    if (!normToRaw.has(normSub)) {
      normToRaw.set(normSub, rawSub || normSub);
      normalizedList.push(normSub);
    }
  });

  if (!normalizedList.length) return [];
  const singleGenericSub = normalizedList.length === 1
    && (normalizedList[0] === "Аксессуары" || normalizedList[0] === "Прочее");
  if (singleGenericSub) return [];
  if (!order.length) return normalizedList.sort((a, b) => a.localeCompare(b, "ru"));

  const indexByName = new Map(order.map((name, index) => [name, index]));
  return normalizedList.sort((a, b) => {
    const ai = indexByName.has(a) ? indexByName.get(a) : Number.MAX_SAFE_INTEGER;
    const bi = indexByName.has(b) ? indexByName.get(b) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    if (a === "Прочее") return 1;
    if (b === "Прочее") return -1;
    return a.localeCompare(b, "ru");
  });
}

function getCatalogTopCategory(product) {
  const top = canonicalTopCategoryName(product?.topCategory);
  if (!top) return "";
  if (top !== "Аксессуары") return canonicalTopCategoryName(top);
  const rawSub = String(product?.subCategory || "").trim() || "Аксессуары";
  const bucket = normalizeCatalogBrowserSubcategory("Аксессуары", rawSub, product);
  if (bucket === "Мерч") return "Аксессуары";
  if (bucket === "Антенны") return "Управление и автоматизация";
  if (!bucket) return "Аксессуары";
  return "Монтаж и расходники";
}

function pickCategoryHeroImage(categoryName, products) {
  const key = String(categoryName || "").trim();
  const direct = CATALOG_CATEGORY_HERO_IMAGES.get(key);
  if (direct) return direct;
  const norm = key.toLowerCase();
  if (norm.includes("автомат")) return "/images/category-hero/control-automation.svg";
  if (norm.includes("монтаж")) return "/images/category-hero/mounting.svg";
  if (norm.includes("освещ")) return "/images/category-hero/lighting.svg";
  if (norm.includes("безопас")) return "/images/category-hero/security.svg";
  if (norm.includes("климат")) return "/images/category-hero/climate.svg";
  if (norm.includes("энерго")) return "/images/category-hero/energy.svg";
  if (norm.includes("audio") || norm.includes("multiroom") || norm.includes("мультир")) return "/images/category-hero/audio-multiroom.svg";
  if (norm.includes("комплект")) return "/images/category-hero/kits.svg";

  const inCategory = (products || []).filter((p) => String((p && p.topCategory) || "") === key);

  const fallback = inCategory
    .map((p) => pickPrimaryImage(p, "", { allowSoftFallback: false }))
    .find((src) => String(src || "").trim());
  return fallback || "";
}

function normalizeFacetValue(key, raw) {
  const value = fixMojibake(String(raw || "")).replace(/\s+/g, " ").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  const parseMetric = () => {
    const m = value.match(/(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/);
    if (!m) return null;
    const n = Number(String(m[1]).replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return { n, unit: String(m[2] || "").toLowerCase() };
  };

  if (key === "systemTypes") {
    if (/service/.test(lower)) return "";
    if (/wireless/.test(lower) || /rf/.test(lower)) return "беспроводная";
    if (/wired/.test(lower)) return "проводная";
    return value;
  }

  if (key === "protocols") {
    if (/rs[\s-]?485/i.test(value)) return "RS-485";
    if (/modbus/i.test(value)) return "Modbus";
    if (/ethernet/i.test(value)) return "Ethernet";
    if (/wi[\s-]?fi/i.test(value)) return "Wi-Fi";
    if (/zigbee/i.test(value)) return "Zigbee";
    if (/z[\s-]?wave/i.test(value)) return "Z-Wave";
    if (/dali/i.test(value)) return "DALI";
    if (/bluetooth|\bble\b/i.test(value)) return "BLE";
    if (/knx/i.test(value)) return "KNX";
    if (/mqtt/i.test(value)) return "MQTT";
    if (/\bcan\b/i.test(value)) return "CAN";
    return value;
  }

  if (key === "mountings") {
    if (/din/i.test(value)) return "DIN";
    if (/подрозетн|розетк|встро/i.test(lower)) return "подрозетник";
    if (/наклад|поверх/i.test(lower)) return "накладной";
    if (/кабел/i.test(lower)) return "кабельный";
    return value;
  }

  if (key === "channels") {
    const match = lower.match(/(\d+)/);
    if (match) {
      const n = Number(match[1]);
      if (!Number.isFinite(n) || n < 1 || n > 64) return "";
      return `${n} ch`;
    }
    return value;
  }

  if (key === "supplyVoltages") {
    const m = parseMetric();
    if (!m) return value;
    if (m.unit === "mv") {
      if (m.n < 1 || m.n > 600000) return "";
      return value;
    }
    if (m.unit === "kv") {
      if (m.n <= 0 || m.n > 1) return "";
      return value;
    }
    if (m.unit === "v") {
      if (m.n <= 0 || m.n > 400) return "";
      return value;
    }
    return value;
  }

  if (key === "nominalCurrents") {
    const m = parseMetric();
    if (!m) return value;
    if (m.unit === "ma") {
      if (m.n <= 0 || m.n > 100000) return "";
      return value;
    }
    if (m.unit === "a") {
      if (m.n <= 0 || m.n > 200) return "";
      return value;
    }
    return value;
  }

  if (key === "nominalPowers" || key === "maxLoads") {
    const m = parseMetric();
    if (!m) return value;
    if (m.unit === "mw") {
      if (m.n <= 0 || m.n > 1000000) return "";
      return value;
    }
    if (m.unit === "w") {
      if (m.n <= 0 || m.n > 20000) return "";
      return value;
    }
    if (m.unit === "kw") {
      if (m.n <= 0 || m.n > 20) return "";
      return value;
    }
    return value;
  }

  return value;
}

function formatFacetFilterValue(facetKey, rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return value;
  const unitsOnly = new Set(["supplyVoltages", "nominalCurrents", "nominalPowers", "maxLoads"]);
  if (!unitsOnly.has(String(facetKey || ""))) return value;
  return value
    .replace(/\s*кВт\b/gi, " kW")
    .replace(/\s*кВ\b/gi, " kV")
    .replace(/\s*мВт\b/gi, " mW")
    .replace(/\s*мВ\b/gi, " mV")
    .replace(/\s*мА\b/gi, " mA")
    .replace(/\s*Вт\b/gi, " W")
    .replace(/\s*В\b/gi, " V")
    .replace(/\s*А\b/gi, " A")
    .replace(/\s+/g, " ")
    .trim();
}

const facetHelpers = createFacetHelpers({
  normalizeValue: normalizeFacetValue,
  formatValue: formatFacetFilterValue
});
const {
  splitMulti,
  parseFacetNumericValue,
  compareFacetOptionsByKey,
  countSingle,
  countMulti,
  matchesSingle,
  matchesMulti,
  matchesMultiAll,
  renderCheckGroup,
  detectContext
} = facetHelpers;
function normalizeBrandKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "");
}

function canonicalBrandLabel(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const key = normalizeBrandKey(value);
  if (key === "hitepro") return "Hite Pro";
  if (key === "larnitech") return "Larnitech";
  if (key === "loxone") return "Loxone";
  if (key === "wirenboard") return "Wiren Board";
  return value;
}

function getBrandLogoPath(brandName) {
  const key = normalizeBrandKey(brandName);
  if (!key) return "";
  if (key.includes("larnitech")) return "/brand-logos/larnitech.svg";
  if (key.includes("loxone")) return "/brand-logos/loxone.svg";
  if (key.includes("hite") && key.includes("pro")) return "/brand-logos/hite-pro-ink.svg";
  if (key.includes("wiren")) return "/brand-logos/wiren-board.svg";
  return "";
}

function getBrandLogoToneClass(brandName) {
  const key = normalizeBrandKey(brandName);
  if (!key) return "";
  if (key.includes("hite") && key.includes("pro")) return "logo-mass-hite-pro";
  if (key.includes("larnitech")) return "logo-mass-larnitech";
  if (key.includes("loxone")) return "logo-mass-loxone";
  if (key.includes("wiren")) return "logo-mass-wiren-board";
  return "";
}

function mergeBrandOptions(options) {
  const map = new Map();
  for (const item of options || []) {
    const label = canonicalBrandLabel(item && item.value);
    if (!label) continue;
    const key = normalizeBrandKey(label);
    const prev = map.get(key) || { value: label, count: 0 };
    prev.count += Number(item && item.count) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => a.value.localeCompare(b.value, "ru"));
}

function compactFilterOptions(options, selectedSet) {
  const out = [];
  for (const opt of options || []) {
    const value = String((opt && opt.value) || "").trim();
    const count = Number(opt && opt.count) || 0;
    if (!value) continue;
    out.push({ value, count });
  }
  return out;
}

function popularityScore(product) {
  const p = product || {};
  const direct =
    Number(p.popularityScore) ||
    Number(p.popularity) ||
    Number(p.salesCount) ||
    Number(p.ordersCount) ||
    Number(p.viewsCount) ||
    Number(p.viewCount) ||
    0;
  if (direct > 0) return direct;

  const qty = Number(p.qtySold) || 0;
  const rating = Number(p.rating) || 0;
  const rev = Number(p.reviewsCount) || 0;
  return qty * 5 + rating * 10 + rev;
}

function pickPopularProducts(products, limit = 8) {
  return (products || [])
    .filter((p) => !isHiddenShowcaseCategory(getCatalogTopCategory(p)))
    .slice()
    .sort((a, b) => {
      const scoreDelta = popularityScore(b) - popularityScore(a);
      if (scoreDelta !== 0) return scoreDelta;
      return Number(b.price || 0) - Number(a.price || 0);
    })
    .slice(0, Math.max(1, limit));
}

function pickMainBrands(products, limit = 14) {
  const counts = new Map();
  const preferredOrder = new Map([
    ["loxone", 0],
    ["wiren board", 1],
    ["larnitech", 2],
    ["hite pro", 3]
  ]);
  for (const product of products || []) {
    const brand = canonicalBrandLabel(getProductBrand(product));
    if (!brand) continue;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      const aKey = String(a[0] || "").trim().toLowerCase();
      const bKey = String(b[0] || "").trim().toLowerCase();
      const aOrder = preferredOrder.has(aKey) ? preferredOrder.get(aKey) : Number.MAX_SAFE_INTEGER;
      const bOrder = preferredOrder.has(bKey) ? preferredOrder.get(bKey) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (b[1] - a[1]) || a[0].localeCompare(b[0], "ru");
    })
    .slice(0, Math.max(1, limit))
    .map(([brand, count]) => ({ brand, count }));
}

function buildTaskCards(byTopCategory) {
  const defs = [
    { key: "apt", title: "Квартира", text: "Свет, сценарии и комфорт в помещениях.", targets: ["Освещение", "Управление и автоматизация"] },
    { key: "house", title: "Частный дом", text: "Климат, безопасность и управление участком.", targets: ["Климат", "Безопасность и доступ"] },
    { key: "office", title: "Офис", text: "Экономия энергии и централизованное управление.", targets: ["Энергия и учет", "Управление и автоматизация"] },
    { key: "panel", title: "Щитовая", text: "Монтаж и компоненты для надежной сборки.", targets: ["Монтаж и расходники", "Энергия и учет"] }
  ];

  return defs
    .map((item) => {
      const target = item.targets.find((name) => byTopCategory.has(name)) || item.targets[0];
      const count = (byTopCategory.get(target) || []).length;
      return {
        ...item,
        target,
        count
      };
    });
}

function hasBrokenBreadcrumbText(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  return /(?:Р[Ѐ-ӿ]|С[Ѐ-ӿ]|Ð.|Ñ.|Ã.|�)/.test(s);
}

function renderAdaptiveBreadcrumbs(parts) {
  const list = Array.isArray(parts) ? parts.filter((p) => p && p.label) : [];
  const full = breadCrumbs(list).replace('class="breadcrumbs"', 'class="breadcrumbs breadcrumbs-full"');
  if (list.length < 2) return full;
  const current = list[list.length - 1];
  const prev = list[list.length - 2];
  const backHref = String(prev && prev.href ? prev.href : (list[0] && list[0].href ? list[0].href : "/catalog"));
  const currentLabel = escapeHtmlText(String(current && current.label ? current.label : ""));
  const backLabel = escapeHtmlText(`Назад: ${String(prev && prev.label ? prev.label : "раздел")}`);
  return `
    ${full}
    <div class="breadcrumbs breadcrumbs-compact" aria-label="Навигация по разделу">
      <a class="breadcrumbs-back" href="${backHref}" aria-label="${backLabel}">
        <span class="material-symbols-rounded msi" aria-hidden="true">arrow_back</span>
      </a>
      <span class="breadcrumbs-current">${currentLabel}</span>
    </div>
  `;
}

function compactBreadcrumb(backHref, currentLabel, backLabel = "") {
  const safeHref = String(backHref || "/catalog");
  const safeCurrent = escapeHtmlText(String(currentLabel || ""));
  const safeBackLabel = escapeHtmlText(String(backLabel || `Назад в раздел «${currentLabel || ""}»`));
  return `
    <div class="breadcrumbs breadcrumbs-compact" aria-label="Навигация по разделу">
      <a class="breadcrumbs-back" href="${safeHref}" aria-label="${safeBackLabel}">
        <span class="material-symbols-rounded msi" aria-hidden="true">arrow_back</span>
      </a>
      <span class="breadcrumbs-current">${safeCurrent}</span>
    </div>
  `;
}

export function renderCatalog(state, appEl, bindSearch, toggleFavoriteFn) {
  const byTopCategory = new Map();
  for (const p of state.products) {
    const top = getCatalogTopCategory(p);
    if (!top || top === "Каталог" || isHiddenShowcaseCategory(top)) continue;
    if (!byTopCategory.has(top)) byTopCategory.set(top, []);
    byTopCategory.get(top).push(p);
  }

  const categories = MAIN_CATALOG_SECTIONS
    .filter((name) => byTopCategory.has(name))
    .map((name) => ({
      name,
      image: pickCategoryHeroImage(name, byTopCategory.get(name))
    }));
  const visible = categories.filter((c) => !state.search || c.name.toLowerCase().includes(state.search.toLowerCase()));
  const searchProducts = state.search ? state.products.filter((p) => productMatchesSearch(p, state.search)).slice(0, 120) : [];
  const popularProducts = pickPopularProducts(state.products, 10);
  const brandStrip = pickMainBrands(state.products, 14);
  const taskCards = buildTaskCards(byTopCategory);

  applySafeHtml(appEl, `
    ${
      state.search
        ? `
      <section class="product-grid product-grid--search">
        ${searchProducts.map((p) => renderProductCard(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("")}
      </section>
      ${searchProducts.length === 0 ? '<p class="note">По запросу ничего не найдено.</p>' : ""}
    `
        : `

      <section class="home-section home-section--side-title">
        <div class="home-section__head">
          <h2>Бренды</h2>
        </div>
        <div class="home-brands-strip">
          ${brandStrip
            .map((item) => {
              const logo = getBrandLogoPath(item.brand);
              const toneClass = getBrandLogoToneClass(item.brand);
              return `
              <a class="home-brand-logo-link" href="/brands/${slugify(item.brand)}" aria-label="${item.brand}">
                ${logo
                  ? `<img class="home-brand-logo ${toneClass}" src="${logo}" alt="${item.brand}" loading="lazy" />`
                  : `<span class="home-brand-logo-fallback">${item.brand}</span>`}
              </a>
            `;
            })
            .join("")}
        </div>
      </section>

      <div class="home-search-row">
        ${searchRow(state.search)}
      </div>

      <section class="home-section home-section--side-title" id="homeCategories">
        <div class="home-section__head">
          <h2>Категории</h2>
        </div>
        <div class="category-grid home-categories-grid">
          ${visible
            .slice(0, 8)
            .map(
              (c) => `
              <a class="category-card category-card-text" href="/catalog/${slugify(c.name)}">
                <h3>${c.name}</h3>
                <p>${(byTopCategory.get(c.name) || []).length} товаров</p>
              </a>
            `
            )
            .join("")}
        </div>
      </section>

      <section class="home-section home-section--side-title">
        <div class="home-section__head">
          <h2>Хиты и популярное</h2>
        </div>
        <section class="product-grid product-grid--popular">
          ${popularProducts.map((p) => renderProductCard(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("")}
        </section>
      </section>

      

    `
    }
  `);

  appEl.querySelectorAll("[data-scroll-to-categories]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = appEl.querySelector("#homeCategories");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavoriteFn(id);
      const active = isFavorite(state, id);
      btn.classList.toggle("is-active", active);
      btn.innerHTML = favoriteIconMarkup(active);
    });
  });
  appEl.querySelectorAll("[data-card-buy]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(btn.dataset.cardBuy || "").trim();
      if (!id) return;
      const cartQtyEl = document.getElementById("cartQty");
      const miniCartEl = document.getElementById("miniCart");
      addToCart(state, id, cartQtyEl, miniCartEl);
      syncCardBuyBadges(state, appEl);
    });
  });
  syncCardBuyBadges(state, appEl);
  bindProductCardGalleries(appEl);
  rebalanceProductCardMedia(appEl);
  bindSearch();
}

export function renderCategory(state, appEl, categorySlug, subCategorySlug, bindSearch, toggleFavoriteFn) {
  const categoryName = resolveCategoryNameBySlug(state.products, categorySlug);
  if (!categoryName) {
    applySafeHtml(appEl, "<p>Категория не найдена</p>");
    return;
  }

  const inCategory = state.products.filter((p) => getCatalogTopCategory(p) === categoryName);
  const categorySubcategories = getCatalogBrowserSubcategories(inCategory, categoryName);
  const normalizedSubSlug = slugify(decodeURIComponent(String(subCategorySlug || "")));
  const selectedSub = categorySubcategories.find((name) => slugify(name) === normalizedSubSlug) || "";
  const facetBase = selectedSub
    ? inCategory.filter((p) => slugify(normalizeCatalogBrowserSubcategory(categoryName, p.subCategory, p)) === slugify(selectedSub))
    : inCategory;
  const visibleTopCategories = Array.from(new Set(state.products
    .map((p) => getCatalogTopCategory(p))
    .filter((name) => Boolean(name) && !isHiddenShowcaseCategory(name))));
  const orderedTopCategories = [
    ...MAIN_CATALOG_SECTIONS.filter((name) => visibleTopCategories.includes(name)),
    ...visibleTopCategories
      .filter((name) => !MAIN_CATALOG_SECTIONS.includes(name))
      .sort((a, b) => a.localeCompare(b, "ru"))
  ];
  const categoryBrowserTree = orderedTopCategories.map((name) => {
    const subs = getCatalogBrowserSubcategories(
      state.products.filter((p) => getCatalogTopCategory(p) === name),
      name
    );
    return { name, subs };
  });

  const facets = {
    brands: mergeBrandOptions(countSingle(facetBase, (p) => getProductBrand(p), "brands")),
    systemTypes: countSingle(facetBase, (p) => p.systemType, "systemTypes"),
    protocols: countMulti(facetBase, (p) => p.protocol, "protocols"),
    mountings: countMulti(facetBase, (p) => p.mounting, "mountings"),
    supplyVoltages: countSingle(facetBase, (p) => normalizeMeasurementValue("voltage", p.supplyVoltage), "supplyVoltages"),
    channels: countSingle(facetBase, (p) => p.channels, "channels"),
    nominalCurrents: countSingle(facetBase, (p) => normalizeMeasurementValue("current", p.nominalCurrent), "nominalCurrents"),
    nominalPowers: countSingle(facetBase, (p) => normalizeMeasurementValue("power", p.nominalPower), "nominalPowers"),
    sensorTypes: countSingle(facetBase, (p) => p.sensorType, "sensorTypes"),
    indoorOutdoor: countSingle(facetBase, (p) => p.indoorOutdoor, "indoorOutdoor"),
    ipRatings: countSingle(facetBase, (p) => p.ipRating, "ipRatings"),
    ioCounts: countSingle(facetBase, (p) => p.ioCount, "ioCounts"),
    webInterfaces: countSingle(facetBase, (p) => p.webInterface, "webInterfaces"),
    scenarioSupports: countSingle(facetBase, (p) => p.scenarioSupport, "scenarioSupports"),
    loadTypes: countMulti(facetBase, (p) => p.loadType, "loadTypes"),
    maxLoads: countSingle(facetBase, (p) => p.maxLoad, "maxLoads")
  };

  const normalizedSelectedBrands = new Set((state.filters.brands || []).map((v) => canonicalBrandLabel(v)).filter(Boolean));
  state.filters.brands = Array.from(normalizedSelectedBrands);

  const selected = {
    brands: normalizedSelectedBrands,
    systemTypes: new Set(state.filters.systemTypes),
    protocols: new Set(state.filters.protocols),
    mountings: new Set(state.filters.mountings),
    supplyVoltages: new Set(state.filters.supplyVoltages),
    channels: new Set(state.filters.channels),
    nominalCurrents: new Set(state.filters.nominalCurrents),
    nominalPowers: new Set(state.filters.nominalPowers),
    sensorTypes: new Set(state.filters.sensorTypes),
    indoorOutdoor: new Set(state.filters.indoorOutdoor),
    ipRatings: new Set(state.filters.ipRatings),
    ioCounts: new Set(state.filters.ioCounts),
    webInterfaces: new Set(state.filters.webInterfaces),
    scenarioSupports: new Set(state.filters.scenarioSupports),
    loadTypes: new Set(state.filters.loadTypes),
    maxLoads: new Set(state.filters.maxLoads)
  };
  const selectedBrandKeys = new Set(Array.from(selected.brands).map((v) => normalizeBrandKey(v)));

  const priceValues = facetBase
    .map((p) => Number(p.price || 0))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const positivePriceValues = priceValues.filter((n) => n > 0);
  const minFacetPrice = positivePriceValues.length
    ? Math.floor(Math.min(...positivePriceValues))
    : (priceValues.length ? Math.floor(Math.min(...priceValues)) : 0);
  const maxFacetPrice = priceValues.length ? Math.ceil(Math.max(...priceValues)) : 0;
  const minSelected = state.filters.minPrice !== "" ? Number(state.filters.minPrice) : null;
  const maxSelected = state.filters.maxPrice !== "" ? Number(state.filters.maxPrice) : null;
  const context = detectContext(selectedSub);
  const facetProfile = getCategoryFacetProfile(categoryName);
  const profiledFacets = {
    ...facets,
    channels: applyFacetProfile(facets.channels, "channels", facetProfile),
    supplyVoltages: applyFacetProfile(facets.supplyVoltages, "supplyVoltages", facetProfile),
    nominalCurrents: applyFacetProfile(facets.nominalCurrents, "nominalCurrents", facetProfile),
    nominalPowers: applyFacetProfile(facets.nominalPowers, "nominalPowers", facetProfile)
  };

  const filteredItems = facetBase.filter((p) => {
    if (!productMatchesSearch(p, state.search)) return false;
    if (selectedBrandKeys.size > 0 && !selectedBrandKeys.has(normalizeBrandKey(canonicalBrandLabel(getProductBrand(p))))) return false;
    if (!matchesSingle(p.systemType, selected.systemTypes, "systemTypes")) return false;
    if (!matchesMultiAll(p.protocol, selected.protocols, "protocols")) return false;
    if (!matchesMulti(p.mounting, selected.mountings, "mountings")) return false;
    if (!matchesSingle(normalizeMeasurementValue("voltage", p.supplyVoltage), selected.supplyVoltages, "supplyVoltages")) return false;
    if (!matchesSingle(p.channels, selected.channels, "channels")) return false;
    if (!matchesSingle(normalizeMeasurementValue("current", p.nominalCurrent), selected.nominalCurrents, "nominalCurrents")) return false;
    if (!matchesSingle(normalizeMeasurementValue("power", p.nominalPower), selected.nominalPowers, "nominalPowers")) return false;

    if (context.sensors) {
      if (!matchesSingle(p.sensorType, selected.sensorTypes, "sensorTypes")) return false;
      if (!matchesSingle(p.indoorOutdoor, selected.indoorOutdoor, "indoorOutdoor")) return false;
      if (!matchesSingle(p.ipRating, selected.ipRatings, "ipRatings")) return false;
    }
    if (context.controllers) {
      if (!matchesSingle(p.ioCount, selected.ioCounts, "ioCounts")) return false;
      if (!matchesSingle(p.webInterface, selected.webInterfaces, "webInterfaces")) return false;
      if (!matchesSingle(p.scenarioSupport, selected.scenarioSupports, "scenarioSupports")) return false;
    }
    if (context.relays) {
      if (!matchesMulti(p.loadType, selected.loadTypes, "loadTypes")) return false;
      if (!matchesSingle(p.maxLoad, selected.maxLoads, "maxLoads")) return false;
    }

    const price = Number(p.price || 0);
    if (minSelected !== null && price < minSelected) return false;
    if (maxSelected !== null && price > maxSelected) return false;
    return true;
  });

  const allowedSortModes = new Set(["popular", "cheaper", "expensive"]);
  const requestedSortMode = String(state.catalogSort || "popular");
  const sortMode = allowedSortModes.has(requestedSortMode) ? requestedSortMode : "popular";
  const sortItems = (list, mode) => {
    const withIndex = list.map((item, index) => ({ item, index }));
    const numericPrice = (product) => {
      const view = getProductPriceView(product || {});
      const n = Number(view && view.rub);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    withIndex.sort((a, b) => {
      if (mode === "cheaper") {
        const ap = numericPrice(a.item);
        const bp = numericPrice(b.item);
        if (ap == null && bp == null) return a.index - b.index;
        if (ap == null) return 1;
        if (bp == null) return -1;
        if (ap !== bp) return ap - bp;
        return a.index - b.index;
      }
      if (mode === "expensive") {
        const ap = numericPrice(a.item);
        const bp = numericPrice(b.item);
        if (ap == null && bp == null) return a.index - b.index;
        if (ap == null) return 1;
        if (bp == null) return -1;
        if (ap !== bp) return bp - ap;
        return a.index - b.index;
      }
      return a.index - b.index;
    });
    return withIndex.map((entry) => entry.item);
  };
  const items = sortItems(filteredItems, sortMode);
  const listingBreadcrumbParts = [
    { label: "Товары", href: "/catalog" },
    { label: categoryName, href: `/catalog/${slugify(categoryName)}` },
    ...(selectedSub ? [{ label: selectedSub, href: `/catalog/${slugify(categoryName)}/${slugify(selectedSub)}` }] : [])
  ];
  applySafeHtml(appEl, `
    <div class="listing-top">
      ${renderAdaptiveBreadcrumbs(listingBreadcrumbParts)}
      ${searchRow(state.search)}
      <div class="filters-selected filters-selected-top" id="selectedFilters"></div>
      <div class="mobile-catalog-toolbar">
        <section class="subcategory-grid subcategory-grid-inline">
          <button class="subcategory-chip subcategory-chip--trigger" id="openCategoryBrowserBtn" type="button" aria-label="Разделы">
            <span>Категории</span>
            <span class="material-symbols-rounded msi mobile-categories-chevron" aria-hidden="true">expand_more</span>
          </button>
          <button class="button button-outline mobile-sort-btn" id="openSortBtn" type="button" aria-label="Сортировка">
            <span class="material-symbols-rounded msi" aria-hidden="true">sort</span>
          </button>
          <button class="button button-outline mobile-filters-btn" id="openFiltersBtn" type="button" aria-label="Фильтры">
            <span class="material-symbols-rounded msi" aria-hidden="true">tune</span>
            <span class="mobile-filters-count" id="mobileFiltersCount" hidden>0</span>
          </button>
        </section>
        <div class="mobile-selected-filters" id="mobileSelectedFilters"></div>
      </div>
    </div>
    
    <div class="grid-layout">
      <aside class="filters" id="filtersPanel">
        <div class="filters-popup-head">
          <h4>Фильтры</h4>
          <button class="button button-plain filters-close-btn" id="closeFiltersBtn" type="button" aria-label="Закрыть">✕</button>
        </div>
        <fieldset class="filter-group subcategory-sidebar">
          <legend>Подкатегории</legend>
          <div class="subcategory-sidebar-list">
            <a class="subcategory-sidebar-link ${!selectedSub ? "is-active" : ""}" href="/catalog/${slugify(categoryName)}">Все товары</a>
            ${categorySubcategories
              .map((subName) => `
                <a class="subcategory-sidebar-link ${selectedSub === subName ? "is-active" : ""}" href="/catalog/${slugify(categoryName)}/${slugify(subName)}">${subName}</a>
              `)
              .join("")}
          </div>
        </fieldset>
        <h4>Фильтры</h4>
        <fieldset class="filter-group">
          <legend>Цена, ₽ (пересчет)</legend>
          <div class="price-row">
            <input class="input" id="minPriceFilter" type="number" min="${minFacetPrice}" placeholder="от ${minFacetPrice}" value="${state.filters.minPrice}" />
            <input class="input" id="maxPriceFilter" type="number" min="${minFacetPrice}" placeholder="до ${maxFacetPrice}" value="${state.filters.maxPrice}" />
          </div>
        </fieldset>
        ${renderCheckGroup("Бренд", "brands", compactFilterOptions(profiledFacets.brands, selected.brands), selected.brands)}
        ${renderCheckGroup("Тип системы", "systemTypes", compactFilterOptions(profiledFacets.systemTypes, selected.systemTypes), selected.systemTypes)}
        ${renderCheckGroup("Протокол", "protocols", compactFilterOptions(profiledFacets.protocols, selected.protocols), selected.protocols)}
        ${renderCheckGroup("Монтаж", "mountings", compactFilterOptions(profiledFacets.mountings, selected.mountings), selected.mountings)}
        ${renderCheckGroup("Напряжение питания", "supplyVoltages", compactFilterOptions(profiledFacets.supplyVoltages, selected.supplyVoltages), selected.supplyVoltages)}
        ${renderCheckGroup("Количество каналов", "channels", compactFilterOptions(profiledFacets.channels, selected.channels), selected.channels)}
        ${renderCheckGroup("Номинальный ток", "nominalCurrents", compactFilterOptions(profiledFacets.nominalCurrents, selected.nominalCurrents), selected.nominalCurrents)}
        ${renderCheckGroup("Номинальная мощность", "nominalPowers", compactFilterOptions(profiledFacets.nominalPowers, selected.nominalPowers), selected.nominalPowers)}
        ${context.sensors ? renderCheckGroup("Тип датчика", "sensorTypes", compactFilterOptions(facets.sensorTypes, selected.sensorTypes), selected.sensorTypes) : ""}
        ${context.sensors ? renderCheckGroup("Внутренний / уличный", "indoorOutdoor", compactFilterOptions(facets.indoorOutdoor, selected.indoorOutdoor), selected.indoorOutdoor) : ""}
        ${context.sensors ? renderCheckGroup("Степень защиты IP", "ipRatings", compactFilterOptions(facets.ipRatings, selected.ipRatings), selected.ipRatings) : ""}
        ${context.controllers ? renderCheckGroup("Входы / выходы", "ioCounts", compactFilterOptions(facets.ioCounts, selected.ioCounts), selected.ioCounts) : ""}
        ${context.controllers ? renderCheckGroup("Web-интерфейс", "webInterfaces", compactFilterOptions(facets.webInterfaces, selected.webInterfaces), selected.webInterfaces) : ""}
        ${context.controllers ? renderCheckGroup("Поддержка сценариев", "scenarioSupports", compactFilterOptions(facets.scenarioSupports, selected.scenarioSupports), selected.scenarioSupports) : ""}
        ${context.relays ? renderCheckGroup("Тип нагрузки", "loadTypes", compactFilterOptions(facets.loadTypes, selected.loadTypes), selected.loadTypes) : ""}
        ${context.relays ? renderCheckGroup("Максимальная нагрузка", "maxLoads", compactFilterOptions(facets.maxLoads, selected.maxLoads), selected.maxLoads) : ""}
        <button class="button apply-filters-btn" id="applyFiltersBtn" type="button">Показать товары (${items.length})</button>
      </aside>
      <section class="product-grid">
        ${items.length ? items.map((p) => renderProductCard(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("") : '<div class="note">Товары не найдены</div>'}
      </section>
    </div>
    <aside class="category-browser-panel" id="categoryBrowserPanel" aria-label="Навигатор категорий">
      <div class="filters-popup-head category-browser-head">
        <h4>Категории</h4>
        <button class="button button-plain filters-close-btn" id="closeCategoryBrowserBtn" type="button" aria-label="Закрыть">✕</button>
      </div>
      <div class="category-browser-list">
        ${categoryBrowserTree.map((node, index) => {
          const isActiveCategory = node.name === categoryName;
          const isGroupOpen = isActiveCategory || (!selectedSub && index === 0);
          const groupId = `categoryBrowserGroup-${slugify(node.name) || index}`;
          return `
            <section class="category-browser-group ${isGroupOpen ? "is-open" : ""}">
              <button
                class="category-browser-toggle"
                type="button"
                data-category-toggle="${groupId}"
                aria-expanded="${isGroupOpen ? "true" : "false"}"
                aria-controls="${groupId}"
              >
                <span class="category-browser-main ${isActiveCategory ? "is-active" : ""}">${node.name}</span>
                <span class="material-symbols-rounded msi category-browser-chevron" aria-hidden="true">expand_more</span>
              </button>
              ${node.subs.length ? `
                <div class="category-browser-subs" id="${groupId}">
                  <a class="category-browser-sub ${isActiveCategory && !selectedSub ? "is-active" : ""}" href="/catalog/${slugify(node.name)}">Все товары категории</a>
                  ${node.subs.map((subName) => {
                    const isActiveSub = isActiveCategory && selectedSub === subName;
                    return `<a class="category-browser-sub ${isActiveSub ? "is-active" : ""}" href="/catalog/${slugify(node.name)}/${slugify(subName)}">${subName}</a>`;
                  }).join("")}
                </div>
              ` : `
                <div class="category-browser-subs" id="${groupId}">
                  <a class="category-browser-sub ${isActiveCategory && !selectedSub ? "is-active" : ""}" href="/catalog/${slugify(node.name)}">Все товары категории</a>
                </div>
              `}
            </section>
          `;
        }).join("")}
      </div>
    </aside>
    <aside class="sort-panel" id="sortPanel" aria-label="Сортировка">
      <div class="sort-panel-handle" aria-hidden="true"></div>
      <div class="sort-panel-head">
        <h4>Показывать сначала</h4>
        <button class="button button-plain filters-close-btn" id="closeSortBtn" type="button" aria-label="Закрыть">✕</button>
      </div>
      <div class="sort-options">
        <label class="sort-option">
          <span>Популярные</span>
          <input type="radio" name="sortMode" value="popular" ${sortMode === "popular" ? "checked" : ""} />
        </label>
        <label class="sort-option">
          <span>Подешевле</span>
          <input type="radio" name="sortMode" value="cheaper" ${sortMode === "cheaper" ? "checked" : ""} />
        </label>
        <label class="sort-option">
          <span>Подороже</span>
          <input type="radio" name="sortMode" value="expensive" ${sortMode === "expensive" ? "checked" : ""} />
        </label>
      </div>
      <button class="button button-outline sort-cancel-btn" id="cancelSortBtn" type="button">Отменить</button>
    </aside>
    <div class="filters-backdrop" id="filtersBackdrop" hidden></div>
    <div class="filters-backdrop" id="categoryBrowserBackdrop" hidden></div>
    <div class="filters-backdrop" id="sortBackdrop" hidden></div>
  `);

  bindSearch();

  const filterKeys = [
    "brands",
    "systemTypes",
    "protocols",
    "mountings",
    "supplyVoltages",
    "channels",
    "nominalCurrents",
    "nominalPowers",
    "sensorTypes",
    "indoorOutdoor",
    "ipRatings",
    "ioCounts",
    "webInterfaces",
    "scenarioSupports",
    "loadTypes",
    "maxLoads"
  ];
  const buildSelected = (filtersSnapshot) => {
    const normalizedBrands = new Set((filtersSnapshot.brands || []).map((v) => canonicalBrandLabel(v)).filter(Boolean));
    return {
      brands: normalizedBrands,
      systemTypes: new Set(filtersSnapshot.systemTypes || []),
      protocols: new Set(filtersSnapshot.protocols || []),
      mountings: new Set(filtersSnapshot.mountings || []),
      supplyVoltages: new Set(filtersSnapshot.supplyVoltages || []),
      channels: new Set(filtersSnapshot.channels || []),
      nominalCurrents: new Set(filtersSnapshot.nominalCurrents || []),
      nominalPowers: new Set(filtersSnapshot.nominalPowers || []),
      sensorTypes: new Set(filtersSnapshot.sensorTypes || []),
      indoorOutdoor: new Set(filtersSnapshot.indoorOutdoor || []),
      ipRatings: new Set(filtersSnapshot.ipRatings || []),
      ioCounts: new Set(filtersSnapshot.ioCounts || []),
      webInterfaces: new Set(filtersSnapshot.webInterfaces || []),
      scenarioSupports: new Set(filtersSnapshot.scenarioSupports || []),
      loadTypes: new Set(filtersSnapshot.loadTypes || []),
      maxLoads: new Set(filtersSnapshot.maxLoads || [])
    };
  };
  const countItemsForFilters = (filtersSnapshot) => {
    const selectedSnapshot = buildSelected(filtersSnapshot);
    const selectedBrandKeysSnapshot = new Set(Array.from(selectedSnapshot.brands).map((v) => normalizeBrandKey(v)));
    const minLocal = filtersSnapshot.minPrice !== "" ? Number(filtersSnapshot.minPrice) : null;
    const maxLocal = filtersSnapshot.maxPrice !== "" ? Number(filtersSnapshot.maxPrice) : null;
    return facetBase.filter((p) => {
      if (!productMatchesSearch(p, state.search)) return false;
      if (selectedBrandKeysSnapshot.size > 0 && !selectedBrandKeysSnapshot.has(normalizeBrandKey(canonicalBrandLabel(getProductBrand(p))))) return false;
      if (!matchesSingle(p.systemType, selectedSnapshot.systemTypes, "systemTypes")) return false;
      if (!matchesMultiAll(p.protocol, selectedSnapshot.protocols, "protocols")) return false;
      if (!matchesMulti(p.mounting, selectedSnapshot.mountings, "mountings")) return false;
      if (!matchesSingle(normalizeMeasurementValue("voltage", p.supplyVoltage), selectedSnapshot.supplyVoltages, "supplyVoltages")) return false;
      if (!matchesSingle(p.channels, selectedSnapshot.channels, "channels")) return false;
      if (!matchesSingle(normalizeMeasurementValue("current", p.nominalCurrent), selectedSnapshot.nominalCurrents, "nominalCurrents")) return false;
      if (!matchesSingle(normalizeMeasurementValue("power", p.nominalPower), selectedSnapshot.nominalPowers, "nominalPowers")) return false;

      if (context.sensors) {
        if (!matchesSingle(p.sensorType, selectedSnapshot.sensorTypes, "sensorTypes")) return false;
        if (!matchesSingle(p.indoorOutdoor, selectedSnapshot.indoorOutdoor, "indoorOutdoor")) return false;
        if (!matchesSingle(p.ipRating, selectedSnapshot.ipRatings, "ipRatings")) return false;
      }
      if (context.controllers) {
        if (!matchesSingle(p.ioCount, selectedSnapshot.ioCounts, "ioCounts")) return false;
        if (!matchesSingle(p.webInterface, selectedSnapshot.webInterfaces, "webInterfaces")) return false;
        if (!matchesSingle(p.scenarioSupport, selectedSnapshot.scenarioSupports, "scenarioSupports")) return false;
      }
      if (context.relays) {
        if (!matchesMulti(p.loadType, selectedSnapshot.loadTypes, "loadTypes")) return false;
        if (!matchesSingle(p.maxLoad, selectedSnapshot.maxLoads, "maxLoads")) return false;
      }

      const price = Number(p.price || 0);
      if (minLocal !== null && price < minLocal) return false;
      if (maxLocal !== null && price > maxLocal) return false;
      return true;
    }).length;
  };
  const collectDraftFilters = () => {
    const draft = { ...state.filters };
    filterKeys.forEach((key) => {
      draft[key] = [];
    });
    appEl.querySelectorAll("[data-filter-key]").forEach((input) => {
      const key = input.dataset.filterKey;
      if (!key || !Array.isArray(draft[key])) return;
      if (input.checked) draft[key].push(input.value);
    });
    draft.minPrice = minPriceFilter?.value?.trim?.() || "";
    draft.maxPrice = maxPriceFilter?.value?.trim?.() || "";
    return draft;
  };
  const applyBtn = document.getElementById("applyFiltersBtn");
  const selectedBox = document.getElementById("selectedFilters");
  const mobileSelectedBox = document.getElementById("mobileSelectedFilters");
  const mobileFiltersCount = document.getElementById("mobileFiltersCount");
  const buildDraftChips = (draft) => {
    const chips = [];
    filterKeys.forEach((key) => {
      (draft[key] || []).forEach((value) => {
        chips.push({ key, value, label: value });
      });
    });
    if (draft.minPrice) chips.push({ key: "minPrice", value: draft.minPrice, label: `от ${draft.minPrice}` });
    if (draft.maxPrice) chips.push({ key: "maxPrice", value: draft.maxPrice, label: `до ${draft.maxPrice}` });
    return chips;
  };
  const removeDraftChip = (key, value) => {
    if (key === "minPrice" && minPriceFilter) {
      minPriceFilter.value = "";
      minPriceFilter.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (key === "maxPrice" && maxPriceFilter) {
      maxPriceFilter.value = "";
      maxPriceFilter.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const target = appEl.querySelector(`[data-filter-key="${key}"][value="${CSS.escape(value)}"]`);
    if (target) {
      target.checked = false;
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const renderSelectedChips = () => {
    if (!selectedBox && !mobileSelectedBox) return;
    const esc = (value) =>
      String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const draft = collectDraftFilters();
    const chips = buildDraftChips(draft);
    if (mobileFiltersCount) {
      mobileFiltersCount.textContent = String(chips.length);
      mobileFiltersCount.hidden = chips.length < 1;
    }

    if (!chips.length) {
      if (selectedBox) selectedBox.innerHTML = "";
      if (mobileSelectedBox) mobileSelectedBox.innerHTML = "";
      return;
    }

    const chipsMarkup = `
      ${chips
        .map(
          ({ key, value, label }) => `
            <button class="filter-chip" type="button" data-chip-remove="${key}" data-chip-value="${esc(String(value))}">
              <span>${esc(String(label))}</span>
              <span class="filter-chip-x">×</span>
            </button>
          `
        )
        .join("")}
    `;
    if (selectedBox) {
      selectedBox.innerHTML = `
        <button class="filter-chip filter-chip-clear" type="button" data-chip-clear-all>×</button>
        ${chipsMarkup}
      `;
    }
    if (mobileSelectedBox) {
      mobileSelectedBox.innerHTML = chipsMarkup;
    }

    [selectedBox, mobileSelectedBox].filter(Boolean).forEach((box) => {
      box.querySelectorAll("[data-chip-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.chipRemove;
          const value = btn.dataset.chipValue || "";
          removeDraftChip(key, value);
          applyDraftFilters();
        });
      });
    });

    const clearAllBtn = selectedBox ? selectedBox.querySelector("[data-chip-clear-all]") : null;
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", () => {
        appEl.querySelectorAll("[data-filter-key]").forEach((input) => {
          input.checked = false;
        });
        if (minPriceFilter) minPriceFilter.value = "";
        if (maxPriceFilter) maxPriceFilter.value = "";
        applyDraftFilters();
      });
    }
  };
  const updateApplyButton = () => {
    if (!applyBtn) return;
    const count = countItemsForFilters(collectDraftFilters());
    if (count < 1) {
      applyBtn.textContent = "Нет подходящих предложений";
      applyBtn.classList.add("is-empty");
    } else {
      applyBtn.textContent = `Показать товары (${count})`;
      applyBtn.classList.remove("is-empty");
    }
  };
  appEl.querySelectorAll("[data-filter-key]").forEach((input) => {
    input.addEventListener("change", () => {
      updateApplyButton();
      renderSelectedChips();
    });
  });
  const minPriceFilter = document.getElementById("minPriceFilter");
  const maxPriceFilter = document.getElementById("maxPriceFilter");
  if (minPriceFilter) minPriceFilter.addEventListener("input", () => {
    updateApplyButton();
    renderSelectedChips();
  });
  if (maxPriceFilter) maxPriceFilter.addEventListener("input", () => {
    updateApplyButton();
    renderSelectedChips();
  });
  updateApplyButton();
  renderSelectedChips();

  const filtersPanel = document.getElementById("filtersPanel");
  const openFiltersBtn = document.getElementById("openFiltersBtn");
  const closeFiltersBtn = document.getElementById("closeFiltersBtn");
  const filtersBackdrop = document.getElementById("filtersBackdrop");
  const categoryBrowserPanel = document.getElementById("categoryBrowserPanel");
  const openCategoryBrowserBtn = document.getElementById("openCategoryBrowserBtn");
  const closeCategoryBrowserBtn = document.getElementById("closeCategoryBrowserBtn");
  const categoryBrowserBackdrop = document.getElementById("categoryBrowserBackdrop");
  const sortPanel = document.getElementById("sortPanel");
  const openSortBtn = document.getElementById("openSortBtn");
  const closeSortBtn = document.getElementById("closeSortBtn");
  const cancelSortBtn = document.getElementById("cancelSortBtn");
  const sortBackdrop = document.getElementById("sortBackdrop");
  const closeFilters = () => {
    if (!filtersPanel || !filtersBackdrop) return;
    filtersPanel.classList.remove("is-open");
    filtersBackdrop.hidden = true;
  };
  const closeCategoryBrowser = () => {
    if (!categoryBrowserPanel || !categoryBrowserBackdrop) return;
    categoryBrowserPanel.classList.remove("is-open");
    categoryBrowserBackdrop.hidden = true;
  };
  const closeSort = () => {
    if (!sortPanel || !sortBackdrop) return;
    sortPanel.classList.remove("is-open");
    sortBackdrop.hidden = true;
  };
  const applyDraftFilters = () => {
    const draft = collectDraftFilters();
    filterKeys.forEach((key) => {
      state.filters[key] = Array.isArray(draft[key]) ? draft[key] : [];
    });
    state.filters.minPrice = draft.minPrice;
    state.filters.maxPrice = draft.maxPrice;
    closeFilters();
    renderCategory(state, appEl, categorySlug, subCategorySlug, bindSearch, toggleFavoriteFn);
  };
  if (openFiltersBtn && filtersPanel && filtersBackdrop) {
    openFiltersBtn.addEventListener("click", () => {
      closeCategoryBrowser();
      closeSort();
      filtersPanel.classList.add("is-open");
      filtersBackdrop.hidden = false;
    });
  }
  if (openCategoryBrowserBtn && categoryBrowserPanel && categoryBrowserBackdrop) {
    openCategoryBrowserBtn.addEventListener("click", () => {
      closeFilters();
      closeSort();
      categoryBrowserPanel.classList.add("is-open");
      categoryBrowserBackdrop.hidden = false;
    });
  }
  if (openSortBtn && sortPanel && sortBackdrop) {
    openSortBtn.addEventListener("click", () => {
      closeFilters();
      closeCategoryBrowser();
      sortPanel.classList.add("is-open");
      sortBackdrop.hidden = false;
    });
  }
  if (closeFiltersBtn) closeFiltersBtn.addEventListener("click", closeFilters);
  if (filtersBackdrop) filtersBackdrop.addEventListener("click", closeFilters);
  if (closeCategoryBrowserBtn) closeCategoryBrowserBtn.addEventListener("click", closeCategoryBrowser);
  if (categoryBrowserBackdrop) categoryBrowserBackdrop.addEventListener("click", closeCategoryBrowser);
  if (closeSortBtn) closeSortBtn.addEventListener("click", closeSort);
  if (cancelSortBtn) cancelSortBtn.addEventListener("click", closeSort);
  if (sortBackdrop) sortBackdrop.addEventListener("click", closeSort);
  if (applyBtn) {
    applyBtn.addEventListener("click", (event) => {
      event.preventDefault();
      applyDraftFilters();
    });
    applyBtn.addEventListener("touchend", (event) => {
      event.preventDefault();
      applyDraftFilters();
    }, { passive: false });
  }
  appEl.querySelectorAll('input[name="sortMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      const next = String(input.value || "popular");
      state.catalogSort = next;
      renderCategory(state, appEl, categorySlug, subCategorySlug, bindSearch, toggleFavoriteFn);
    });
  });
  appEl.querySelectorAll("[data-category-toggle]").forEach((toggleBtn) => {
    toggleBtn.addEventListener("click", () => {
      const group = toggleBtn.closest(".category-browser-group");
      const list = toggleBtn.closest(".category-browser-list");
      if (!group || !list) return;
      const shouldOpen = !group.classList.contains("is-open");
      list.querySelectorAll(".category-browser-group.is-open").forEach((openGroup) => {
        openGroup.classList.remove("is-open");
        const openBtn = openGroup.querySelector("[data-category-toggle]");
        if (openBtn) openBtn.setAttribute("aria-expanded", "false");
      });
      if (shouldOpen) {
        group.classList.add("is-open");
        toggleBtn.setAttribute("aria-expanded", "true");
      }
    });
  });

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavoriteFn(id);
      const active = isFavorite(state, id);
      btn.classList.toggle("is-active", active);
      btn.innerHTML = favoriteIconMarkup(active);
    });
  });
  appEl.querySelectorAll("[data-card-buy]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(btn.dataset.cardBuy || "").trim();
      if (!id) return;
      const cartQtyEl = document.getElementById("cartQty");
      const miniCartEl = document.getElementById("miniCart");
      addToCart(state, id, cartQtyEl, miniCartEl);
      syncCardBuyBadges(state, appEl);
    });
  });
  syncCardBuyBadges(state, appEl);
  bindProductCardGalleries(appEl);
  rebalanceProductCardMedia(appEl);
}

export function renderProduct(state, appEl, productId, toggleFavoriteFn, miniCartEl, cartQtyEl) {
  const p = state.products.find((item) => item.id === productId);
  if (!p) {
    applySafeHtml(appEl, "<p>Товар не найден</p>");
    return;
  }

  const categorySlug = slugify(p.topCategory || p.category);
  const subCategorySlug = slugify(p.subCategory || p.category);
  const groupRaw = String(p.group || p.group_name || "").trim();
  const groupParts = groupRaw.split("/").map((x) => String(x || "").trim()).filter(Boolean);
  const brandFromGroup = groupParts.length >= 2 ? groupParts[0] : "";
  const subFromGroup = groupParts.length >= 2 ? groupParts[groupParts.length - 1] : "";
  const brandSubcategory = p.brand ? String(getBrandSubcategory(p.brand, p) || "").trim() : "";
  const rawSubForCrumbs = brandSubcategory || subFromGroup || "";
  const fixedSubForCrumbs = fixMojibake(rawSubForCrumbs);
  const subForCrumbs = hasBrokenBreadcrumbText(fixedSubForCrumbs) ? "" : fixedSubForCrumbs;
  const safeBrandLabel = fixMojibake(String(p.brand || "").trim());
  const safeProductName = fixMojibake(String(p.name || "").trim());
  const safeTopCategory = fixMojibake(String(p.topCategory || p.category || "").trim());
  const safeSubCategory = fixMojibake(String(p.subCategory || "").trim());
  const sameBrandInGroup =
    !!brandFromGroup &&
    String(brandFromGroup).toLowerCase() === String(safeBrandLabel || "").toLowerCase();
  // Brand-first breadcrumbs for brand pages (same behavior as Larnitech),
  // even when source group does not explicitly include brand prefix.
  const hasBrandRouteCrumbs = !!p.brand && (!!subForCrumbs || sameBrandInGroup);
  const brandSlug = hasBrandRouteCrumbs ? slugify(p.brand) : "";
  const brandSubSlug = subForCrumbs ? slugify(subForCrumbs) : "";
  const mobileBackHref = hasBrandRouteCrumbs
    ? (subForCrumbs ? `/brands/${brandSlug}/${brandSubSlug}` : `/brands/${brandSlug}`)
    : (safeSubCategory && safeSubCategory !== safeTopCategory
        ? `/catalog/${categorySlug}/${subCategorySlug}`
        : `/catalog/${categorySlug}`);
  const mobileCurrentLabel = hasBrandRouteCrumbs
    ? (subForCrumbs || safeBrandLabel || "Каталог")
    : (safeSubCategory && safeSubCategory !== safeTopCategory ? safeSubCategory : safeTopCategory || "Каталог");
  const mobileBackLabel = `Назад в раздел «${mobileCurrentLabel}»`;
  const mobileBreadcrumbsMarkup = compactBreadcrumb(mobileBackHref, mobileCurrentLabel, mobileBackLabel);
  const breadcrumbsMarkup = breadCrumbs(
    hasBrandRouteCrumbs
      ? [
          { label: "Товары", href: "/catalog" },
          { label: safeBrandLabel, href: `/brands/${brandSlug}` },
          ...(subForCrumbs
            ? [{ label: subForCrumbs, href: `/brands/${brandSlug}/${brandSubSlug}` }]
            : []),
          { label: safeProductName }
        ]
      : [
          { label: "Товары", href: "/catalog" },
          { label: safeTopCategory, href: `/catalog/${categorySlug}` },
          ...(safeSubCategory && safeSubCategory !== safeTopCategory
            ? [{ label: safeSubCategory, href: `/catalog/${categorySlug}/${subCategorySlug}` }]
            : []),
          { label: safeProductName }
        ]
  );
  const gallery = extractGalleryImages(p);
  const mainImage = pickPrimaryImage(p, PLACEHOLDER_IMAGE, { allowSoftFallback: true });
  const lightboxImages = (gallery.length ? gallery : [mainImage]).filter(Boolean);
  const mainPhotoClass = isSoftSourceImage(mainImage) ? "photo is-soft-source" : "photo";
  const variants = getProductVariants(p, state.products);
  const isProductFavorite = isFavorite(state, p.id);
  const cartQtyByProduct = Math.max(0, Number(getCartQtyByProduct(state, p.id) || 0));
  const priceView = getProductPriceView(p);
  const specsRows = getSpecsRows(p);
  const functionRows = getFunctionRows(p);
  const normalizeDocItem = (doc) => {
    if (!doc || typeof doc !== "object") return null;
    const rawUrl = String(doc.url || doc.href || "").trim();
    const rawTitle = fixMojibake(String(doc.title || doc.name || doc.label || "").trim());
    const rawMeta = fixMojibake(String(doc.meta || doc.note || "").trim());
    let title = rawTitle;
    const badSingleTitles = new Set(["n", "Р", "p", "-", "—"]);
    if (title && (title.length < 2 || badSingleTitles.has(title.toLowerCase()))) {
      if (!rawUrl) return null;
      try {
        const urlPart = decodeURIComponent(rawUrl.split(/[?#]/)[0].split("/").pop() || "").trim();
        title = urlPart.replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, "").trim();
      } catch {
        title = "";
      }
      if (!title || title.length < 2 || /^index$/i.test(title)) return null;
    }
    if (!rawUrl && !title) return null;
    if (rawUrl && !/^https?:\/\//i.test(rawUrl) && !rawUrl.startsWith("/")) return null;
    return {
      url: rawUrl,
      title: title || "Документ",
      meta: rawMeta
    };
  };
  const docs = Array.isArray(p.documents) ? p.documents.map(normalizeDocItem).filter(Boolean) : [];
  const descriptionText = String(p.description || "").trim();
  const connectionText = String(
    p.connection ||
      p.connectionInfo ||
      p.connectionDetails ||
      p.wiring ||
      p.scheme ||
      p.installation ||
      ""
  ).trim();
  const descriptionHtml = formatDescriptionHtml(descriptionText);
  const connectionHtml = formatDescriptionHtml(connectionText);
  const hasMeaningfulValue = (v) => {
    const t = String(v == null ? "" : v).trim();
    if (!t) return false;
    return t !== "-" && t !== "нет" && t.toLowerCase() !== "n/a";
  };
  const sections = [];
  if (hasMeaningfulValue(descriptionText) && descriptionHtml) {
    sections.push({
      id: "description",
      title: "Описание",
      body: `<div class="desc">${descriptionHtml}</div>`
    });
  }
  if (specsRows.some((row) => hasMeaningfulValue(row[1]))) {
    sections.push({
      id: "specs",
      title: "Характеристики",
      body: `
        <table class="spec-table">
          <thead><tr><th>Параметр</th><th>Значение</th></tr></thead>
          <tbody>
            ${specsRows
              .map((row) => row[1] && row[1].length > 60
                ? `<tr class="is-long"><td colspan="2"><span class="spec-name">${row[0]}</span><div>${row[1]}</div></td></tr>`
                : `<tr><td class="spec-name">${row[0]}</td><td>${row[1]}</td></tr>`)
              .join("")}
          </tbody>
        </table>
      `
    });
  }
  if (functionRows.length > 0) {
    sections.push({
      id: "functions",
      title: "Функции",
      body: `<div class="functions-list"><ul>${functionRows.map((line) => `<li>${line}</li>`).join("")}</ul></div>`
    });
  }
  if (hasMeaningfulValue(connectionText) && connectionHtml) {
    sections.push({
      id: "connection",
      title: "Подключение",
      body: `<div class="desc">${connectionHtml}</div>`
    });
  }
  if (docs.length > 0) {
    sections.push({
      id: "documents",
      title: "Документы",
      body: `
        <div class="docs-list" style="margin-bottom:4px;">
          ${docs
            .map(
              (d) => `
            <div class="doc-item">
              <a href="${d.url}" target="_blank" rel="noreferrer">
                <span class="material-symbols-rounded msi" aria-hidden="true">picture_as_pdf</span>
                <span>${d.title || "Документ"}</span>
              </a>
              <div class="note">${d.meta || ""}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `
    });
  }
  const accordionMarkup = sections.length
    ? sections
        .map(
          (section, idx) => `
        <details class="product-accordion-item" ${idx === 0 ? "open" : ""}>
          <summary class="product-accordion-head">${section.title}</summary>
          <div class="product-accordion-body">
            ${section.body}
          </div>
        </details>
      `
        )
        .join("")
    : `<div class="note">Данных по товару пока нет.</div>`;

  applySafeHtml(appEl, `
    <div class="product-breadcrumbs-desktop">
      ${breadcrumbsMarkup}
    </div>
    <div class="product-mobile-nav">
      <button type="button" class="product-back-btn" aria-label="Назад">
        <span class="material-symbols-rounded msi" aria-hidden="true">arrow_back</span>
      </button>
      ${mobileBreadcrumbsMarkup}
    </div>
    <section class="product-page">
      <div class="product-gallery">
        <div class="product-main-photo" id="productMainPhoto" role="button" tabindex="0" aria-label="Открыть фото">
          <button
            class="button button-plain favorite-btn favorite-btn-float ${isProductFavorite ? "is-active" : ""}"
            id="favoriteBtn"
            type="button"
            aria-label="${isProductFavorite ? "Убрать из избранного" : "Добавить в избранное"}"
          >
            ${favoriteIconMarkup(isProductFavorite)}
          </button>
          ${imageTag(mainImage, p.name, mainPhotoClass, PLACEHOLDER_IMAGE)}
        </div>
        ${
          gallery.length > 1
            ? `
          <div class="product-thumbs" aria-label="Галерея товара">
            ${gallery
              .map(
                (src, idx) => `
              <button class="thumb ${idx === 0 ? "is-active" : ""}" type="button" data-gallery-thumb="${idx}" data-src="${src}">
                ${imageTag(src, `${p.name} ${idx + 1}`, "", PLACEHOLDER_IMAGE)}
              </button>
            `
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <div class="product-content">
        <h2 class="product-title">${p.name}</h2>
        <div class="price">
          <span class="price-main">${priceView.main}</span>
          ${priceView.approxRub ? `<span class="price-approx">${priceView.approxRub}</span>` : ""}
        </div>
        ${
          variants.length > 1
            ? `
          <div class="variant-row">
            <label for="variantSelect" class="note">Вариант панели:</label>
            <select class="input variant-select" id="variantSelect">
              ${variants
                .map((v) => {
                  const selected = String(v.id) === String(p.id) ? "selected" : "";
                  const title = `${v.article || v.id}, ${v.name}`;
                  return `<option value="${v.id}" ${selected}>${title}</option>`;
                })
                .join("")}
            </select>
          </div>
        `
            : ""
        }
        <div class="cta">
          <button class="button button-outline" id="buyOneClick">Купить сейчас</button>
          <button class="button" id="productAddToCartBtn" type="button" ${cartQtyByProduct > 0 ? "hidden" : ""}>В корзину</button>
          <div class="product-qty-cta" id="productQtyCta" aria-label="Количество в корзине" ${cartQtyByProduct < 1 ? "hidden" : ""}>
            <button class="product-qty-btn" id="productQtyMinus" type="button" aria-label="Убавить">−</button>
            <strong class="product-qty-value" id="productQtyValue">${cartQtyByProduct}</strong>
            <button class="product-qty-btn" id="productQtyPlus" type="button" aria-label="Добавить">+</button>
          </div>
        </div>
        <div class="product-accordion">
          ${accordionMarkup}
        </div>
      </div>
    </section>
    <div class="product-lightbox" id="productLightbox" hidden>
      <div class="product-lightbox-backdrop" id="productLightboxBackdrop"></div>
      <div class="product-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Просмотр изображения товара">
        <button class="button button-plain product-lightbox-close" id="productLightboxClose" type="button" aria-label="Закрыть"><span class="material-symbols-rounded msi" aria-hidden="true">close</span></button>
        ${
          lightboxImages.length > 1
            ? `<button class="button button-plain product-lightbox-nav prev" id="productLightboxPrev" type="button" aria-label="Предыдущее фото"><span class="material-symbols-rounded msi" aria-hidden="true">chevron_left</span></button>
               <button class="button button-plain product-lightbox-nav next" id="productLightboxNext" type="button" aria-label="Следующее фото"><span class="material-symbols-rounded msi" aria-hidden="true">chevron_right</span></button>`
            : ""
        }
        <img id="productLightboxImage" src="${lightboxImages[0] || mainImage}" alt="${p.name}" />
      </div>
    </div>
  `);

  let currentGalleryIndex = 0;
  appEl.querySelectorAll("[data-gallery-thumb]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.dataset.src || "";
      const idx = Number(btn.dataset.galleryThumb || 0);
      const main = appEl.querySelector(".product-main-photo img");
      if (main && src) {
        main.src = src;
        main.classList.toggle("is-soft-source", isSoftSourceImage(src));
      }
      currentGalleryIndex = Number.isFinite(idx) ? idx : 0;
      appEl.querySelectorAll("[data-gallery-thumb]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  const lightboxEl = document.getElementById("productLightbox");
  const lightboxImgEl = document.getElementById("productLightboxImage");
  const lightboxCloseBtn = document.getElementById("productLightboxClose");
  const lightboxPrevBtn = document.getElementById("productLightboxPrev");
  const lightboxNextBtn = document.getElementById("productLightboxNext");
  const lightboxBackdrop = document.getElementById("productLightboxBackdrop");
  const lightboxSetImage = (index) => {
    if (!lightboxImgEl || !lightboxImages.length) return;
    const safeIndex = ((index % lightboxImages.length) + lightboxImages.length) % lightboxImages.length;
    currentGalleryIndex = safeIndex;
    lightboxImgEl.src = lightboxImages[safeIndex];
  };
  const openLightbox = (index) => {
    if (!lightboxEl) return;
    lightboxSetImage(index);
    lightboxEl.hidden = false;
    document.body.classList.add("lightbox-open");
  };
  const closeLightbox = () => {
    if (!lightboxEl) return;
    lightboxEl.hidden = true;
    document.body.classList.remove("lightbox-open");
  };
  const mainPhotoEl = document.getElementById("productMainPhoto");
  if (mainPhotoEl) {
    mainPhotoEl.addEventListener("click", () => openLightbox(currentGalleryIndex));
    mainPhotoEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(currentGalleryIndex);
      }
    });
  }
  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener("click", closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener("click", closeLightbox);
  if (lightboxPrevBtn) lightboxPrevBtn.addEventListener("click", () => lightboxSetImage(currentGalleryIndex - 1));
  if (lightboxNextBtn) lightboxNextBtn.addEventListener("click", () => lightboxSetImage(currentGalleryIndex + 1));
  const win = window;
  if (win.__productLightboxKeydownHandler) {
    document.removeEventListener("keydown", win.__productLightboxKeydownHandler);
  }
  win.__productLightboxKeydownHandler = (event) => {
    if (!lightboxEl || lightboxEl.hidden) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") lightboxSetImage(currentGalleryIndex - 1);
    if (event.key === "ArrowRight") lightboxSetImage(currentGalleryIndex + 1);
  };
  document.addEventListener("keydown", win.__productLightboxKeydownHandler);

  const backBtn = document.querySelector(".product-back-btn");
  if (backBtn) backBtn.addEventListener("click", () => history.back());

  const variantSelect = document.getElementById("variantSelect");
  if (variantSelect) {
    variantSelect.addEventListener("change", () => {
      const nextId = String(variantSelect.value || "");
      if (nextId && nextId !== String(p.id)) { history.pushState({}, "", `/product/${encodeURIComponent(nextId)}`); window.dispatchEvent(new PopStateEvent("popstate")); }
    });
  }

  const favoriteBtn = document.getElementById("favoriteBtn");
  if (favoriteBtn) {
    favoriteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavoriteFn(p.id);
      const active = isFavorite(state, p.id);
      favoriteBtn.classList.toggle("is-active", active);
      favoriteBtn.innerHTML = favoriteIconMarkup(active);
      favoriteBtn.setAttribute("aria-label", active ? "Убрать из избранного" : "Добавить в избранное");
    });
  }

  const productQtyValueEl = document.getElementById("productQtyValue");
  const productQtyMinusBtn = document.getElementById("productQtyMinus");
  const productQtyPlusBtn = document.getElementById("productQtyPlus");
  const productQtyCtaEl = document.getElementById("productQtyCta");
  const productAddToCartBtn = document.getElementById("productAddToCartBtn");
  const syncProductCta = () => {
    if (!productQtyValueEl) return;
    const qty = Math.max(0, Number(getCartQtyByProduct(state, p.id) || 0));
    productQtyValueEl.textContent = String(qty);
    if (productQtyCtaEl) productQtyCtaEl.hidden = qty < 1;
    if (productAddToCartBtn) productAddToCartBtn.hidden = qty > 0;
    if (productQtyMinusBtn) {
      productQtyMinusBtn.disabled = qty < 1;
      productQtyMinusBtn.classList.toggle("is-disabled", qty < 1);
    }
  };
  syncProductCta();
  if (productAddToCartBtn) {
    productAddToCartBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addToCart(state, p.id, cartQtyEl, miniCartEl, { showToast: false });
      syncProductCta();
      syncCardBuyBadges(state, document);
    });
  }
  if (productQtyPlusBtn) {
    productQtyPlusBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addToCart(state, p.id, cartQtyEl, miniCartEl, { showToast: false });
      syncProductCta();
      syncCardBuyBadges(state, document);
    });
  }
  if (productQtyMinusBtn) {
    productQtyMinusBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const qty = Math.max(0, Number(getCartQtyByProduct(state, p.id) || 0));
      if (qty < 1) return;
      changeQty(state, p.id, -1);
      updateCartBadges(state, cartQtyEl);
      if (miniCartEl) miniCartEl.classList.add("hidden");
      syncProductCta();
      syncCardBuyBadges(state, document);
    });
  }

  const buyOneClickBtn = document.getElementById("buyOneClick");
  if (buyOneClickBtn) {
    buyOneClickBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentQty = Math.max(0, Number(getCartQtyByProduct(state, p.id) || 0));
      // "Buy now" should not increment already selected quantity.
      if (currentQty < 1) {
        addToCart(state, p.id, cartQtyEl, miniCartEl, { showToast: false });
        syncProductCta();
        syncCardBuyBadges(state, document);
      }
      history.pushState({}, "", "/cart"); window.dispatchEvent(new PopStateEvent("popstate"));
    });
  }

}
