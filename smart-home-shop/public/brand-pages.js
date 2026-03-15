import { BRAND_STANDARD_SUBCATEGORIES, PLACEHOLDER_IMAGE } from "./config.js";
import { slugify, pageTitle, imageTag, searchRow, productMatchesSearch, normalizeMeasurementValue, applySafeHtml, fixMojibake, getProductPriceView, favoriteIconMarkup } from "./utils.js";
import { renderProductCard, getUnifiedBrandSubcategory, getProductBrand, rebalanceProductCardMedia, bindProductCardGalleries } from "./products.js";
import { isFavorite, toggleFavorite } from "./favorites.js";
import { addToCart, syncCardBuyBadges } from "./cart.js";
import { getCategoryFacetProfile, applyFacetProfile } from "./facet-profiles.js";
import { createFacetHelpers } from "./facet-utils.js";

const HIDDEN_BRAND_KEYS = new Set([
  "\u0434\u0435\u043b\u0430\u0435\u043c \u0441\u0435\u0442\u0438"
]);

const BRAND_LOGO_BY_NAME = new Map([
  ["loxone", "/brand-logos/loxone.svg"],
  ["larnitech", "/brand-logos/larnitech.svg"],
  ["hite pro", "/brand-logos/hite-pro.svg"],
  ["hite-pro", "/brand-logos/hite-pro.svg"],
  ["wiren board", "/brand-logos/wiren-board.svg"],
  ["wirenboard", "/brand-logos/wiren-board.svg"]
]);

const BRAND_LOGO_CLASS_BY_NAME = new Map([
  ["loxone", "brand-logo brand-logo-on-brand-bg brand-logo-loxone"],
  ["larnitech", "brand-logo brand-logo-on-brand-bg brand-logo-larnitech"],
  ["hite pro", "brand-logo brand-logo-on-brand-bg brand-logo-hite-pro"],
  ["hite-pro", "brand-logo brand-logo-on-brand-bg brand-logo-hite-pro"],
  ["wiren board", "brand-logo brand-logo-on-brand-bg brand-logo-wiren-board"],
  ["wirenboard", "brand-logo brand-logo-on-brand-bg brand-logo-wiren-board"]
]);

const LARNITECH_NATIVE_SECTIONS = [
  "\u0421\u0435\u0440\u0438\u044f Metaforsa",
  "DIN-\u0440\u0435\u0435\u0447\u043d\u043e\u0435 \u043e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u0435",
  "\u041e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u0435 \u0434\u043b\u044f \u043f\u043e\u0434\u0440\u043e\u0437\u0435\u0442\u043d\u044b\u0445 \u043a\u043e\u0440\u043e\u0431\u043e\u043a",
  "\u0414\u0430\u0442\u0447\u0438\u043a\u0438",
  "Multiroom",
  "Wireless",
  "\u041f\u0440\u043e\u0447\u0435\u0435"
];

const HITE_PRO_NATIVE_SECTIONS = [
  "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430",
  "\u0411\u043b\u043e\u043a\u0438 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f",
  "\u0414\u0430\u0442\u0447\u0438\u043a\u0438",
  "\u0423\u043c\u043d\u044b\u0439 \u0434\u043e\u043c \u043f\u043e\u0434 \u043a\u043b\u044e\u0447",
  "\u041a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u044b",
  "\u0423\u043c\u043d\u044b\u0435 \u0437\u0430\u043c\u043a\u0438",
  "\u0410\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u0432\u043e\u0440\u043e\u0442\u0430",
  "\u0423\u0441\u0438\u043b\u0438\u0442\u0435\u043b\u0438 \u0441\u0438\u0433\u043d\u0430\u043b\u0430 3G/4G",
  "\u0420\u0435\u043b\u0435 \u0438 \u0434\u0438\u043c\u043c\u0435\u0440\u044b",
  "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u043b\u0435\u0440\u044b",
  "\u0410\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u044b",
  "\u0422\u0435\u0440\u043c\u043e\u0441\u0442\u0430\u0442\u044b",
  "\u041f\u0440\u043e\u0447\u0435\u0435"
];

function normalizeBrandKey(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[^\p{L}\p{N}\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBrandFacetValue(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const key = normalizeBrandKey(value);
  if (key.includes("hite") && key.includes("pro")) return "Hite Pro";
  if (key.includes("larnitech")) return "Larnitech";
  if (key.includes("loxone")) return "Loxone";
  if (key.includes("wiren")) return "Wiren Board";
  return value;
}

function safeText(value) {
  return fixMojibake(String(value || "").trim());
}

function subcategoryRouteToken(subcategory) {
  const raw = String(subcategory || "").trim();
  if (!raw) return "";
  const slug = slugify(raw);
  return slug || encodeURIComponent(raw);
}

function isSameSubcategoryToken(subcategory, token) {
  const left = String(subcategory || "").trim();
  const right = String(token || "").trim();
  if (!left || !right) return false;
  if (slugify(left) === slugify(right)) return true;
  if (left.toLowerCase() === right.toLowerCase()) return true;
  return encodeURIComponent(left) === right;
}

function normalizeSku(raw) {
  const first = String(raw || "")
    .split(/[\/|,;]+/g)[0] || "";
  return String(first)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function isLarnitechBrand(brandName) {
  return normalizeBrandKey(brandName).includes("larnitech");
}

function isHiteProBrand(brandName) {
  const b = normalizeBrandKey(brandName);
  return b.includes("hite pro") || b.includes("hite-pro");
}

function isWirenBoardBrand(brandName) {
  const b = normalizeBrandKey(brandName);
  return b.includes("wiren board") || b.includes("wirenboard");
}

function getGroupTail(product) {
  const raw = String((product && (product.group || product.group_name || "")) || "").trim();
  if (!raw) return "";
  const parts = raw.split("/").map((x) => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
}

function getLarnitechNativeSubcategory(product) {
  const articleRaw = String((product && (product.article || product.id)) || "");
  const article = normalizeSku(articleRaw);
  const name = String((product && product.name) || "").toUpperCase();
  const isSensorByName = /\u0414\u0410\u0422\u0427\u0418\u041a|SENSOR|SENSORS|TEMPERATURE|HUMIDITY|CO2|MOTION|LEAK/i.test(name);
  const isExplicitSensorSku = (
    article.startsWith("CW") ||
    article.startsWith("WW") ||
    article.startsWith("FWTS") ||
    article.startsWith("FWFT") ||
    article === "EWWL" ||
    article === "FWWL" ||
    article === "DWLS01" ||
    article === "DWLS02" ||
    article === "DWLS03" ||
    article === "DWHT05" ||
    article === "DWHT07" ||
    article === "DWHTO7" ||
    article === "DETRV"
  );

  if (
    article === "METAFORSA2MF14" ||
    article === "METAFORSA2CLOUDMFC14" ||
    article === "MFC14" ||
    article === "MF14" ||
    article === "DWRC12" ||
    article === "DWHT07" ||
    article === "DWHT05" ||
    name.includes("METAFORSA")
  ) {
    return "\u0421\u0435\u0440\u0438\u044f Metaforsa";
  }

  if (article.startsWith("BW")) return "\u041e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u0435 \u0434\u043b\u044f \u043f\u043e\u0434\u0440\u043e\u0437\u0435\u0442\u043d\u044b\u0445 \u043a\u043e\u0440\u043e\u0431\u043e\u043a";

  if (isExplicitSensorSku || isSensorByName) {
    return "\u0414\u0430\u0442\u0447\u0438\u043a\u0438";
  }

  if (article.startsWith("FEMP") || article.startsWith("FEIC") || article === "LCP") {
    return "Multiroom";
  }

  if (
    article.startsWith("DWWLS") ||
    article.startsWith("DWWL") ||
    article.startsWith("BTCAN") ||
    article === "EWWL" ||
    article === "FWWL"
  ) {
    return "Wireless";
  }

  if (article.startsWith("DE") || article.startsWith("DW")) return "DIN-\u0440\u0435\u0435\u0447\u043d\u043e\u0435 \u043e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u0435";

  return "\u041f\u0440\u043e\u0447\u0435\u0435";
}

function getHiteProNativeSubcategory(product) {
  const tail = getGroupTail(product);
  if (tail && HITE_PRO_NATIVE_SECTIONS.includes(tail)) return tail;

  const name = String((product && product.name) || "").toLowerCase();
  const group = String((product && (product.group || product.group_name || "")) || "").toLowerCase();
  const hay = `${name} ${group}`;

  if (/\bsensor\b|\bdatchik\b|датчик/.test(hay)) return "\u0414\u0430\u0442\u0447\u0438\u043a\u0438";
  if (/\bkit\b|комплект/.test(hay)) return "\u041a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u044b";
  if (/\bswitch\b|исполнительн/.test(hay)) return "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430";
  if (/\bgateway\b|\bserver\b|шлюз|сервер/.test(hay)) return "\u0423\u043c\u043d\u044b\u0439 \u0434\u043e\u043c \u043f\u043e\u0434 \u043a\u043b\u044e\u0447";
  if (/\brelay\b|реле|диммер/.test(hay)) return "\u0411\u043b\u043e\u043a\u0438 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f";
  return "\u041f\u0440\u043e\u0447\u0435\u0435";
}

export function getBrandSubcategory(brandName, product) {
  if (isLarnitechBrand(brandName)) return getLarnitechNativeSubcategory(product);
  if (isHiteProBrand(brandName)) return getHiteProNativeSubcategory(product);
  if (isWirenBoardBrand(brandName)) {
    const stored = String((product && product.brandSubcategory) || "").trim();
    if (stored) return stored;
    const tail = getGroupTail(product);
    if (tail) return tail;
  }
  return getUnifiedBrandSubcategory(product);
}

function getBrandSubcategories(brandName, products) {
  if (isLarnitechBrand(brandName)) {
    const present = new Set((products || []).map((p) => getBrandSubcategory(brandName, p)));
    return LARNITECH_NATIVE_SECTIONS.filter((x) => present.has(x));
  }
  if (isHiteProBrand(brandName)) {
    const present = new Set((products || []).map((p) => getBrandSubcategory(brandName, p)));
    return HITE_PRO_NATIVE_SECTIONS.filter((x) => present.has(x));
  }
  return Array.from(new Set((products || []).map((p) => getBrandSubcategory(brandName, p)).filter(Boolean)));
}

function isVisibleBrand(brand) {
  const v = String(brand || "").trim();
  if (!v) return false;
  return !HIDDEN_BRAND_KEYS.has(normalizeBrandKey(v));
}

function getBrandLogo(brand) {
  const key = normalizeBrandKey(brand);
  if (!key) return "";
  if (BRAND_LOGO_BY_NAME.has(key)) return BRAND_LOGO_BY_NAME.get(key) || "";
  if (key.includes("larnitech")) return "/brand-logos/larnitech.svg";
  if (key.includes("loxone")) return "/brand-logos/loxone.svg";
  if (key.includes("hite") && key.includes("pro")) return "/brand-logos/hite-pro.svg";
  if (key.includes("wiren")) return "/brand-logos/wiren-board.svg";
  return "";
}

function getBrandLogoClass(brand) {
  const key = normalizeBrandKey(brand);
  if (!key) return "brand-logo";
  if (BRAND_LOGO_CLASS_BY_NAME.has(key)) return BRAND_LOGO_CLASS_BY_NAME.get(key) || "brand-logo";
  if (key.includes("larnitech")) return "brand-logo brand-logo-on-brand-bg brand-logo-larnitech";
  if (key.includes("loxone")) return "brand-logo brand-logo-on-brand-bg brand-logo-loxone";
  if (key.includes("hite") && key.includes("pro")) return "brand-logo brand-logo-on-brand-bg brand-logo-hite-pro";
  if (key.includes("wiren")) return "brand-logo brand-logo-on-brand-bg brand-logo-wiren-board";
  return "brand-logo";
}

function normalizeFilterFacetValue(key, raw) {
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
    if (/\bservice\b/.test(lower)) return "";
    if (lower.includes("беспровод") || /\bwireless\b/.test(lower) || /\brf\b/.test(lower)) return "беспроводная";
    if (lower.includes("провод") || /\bwired\b/.test(lower)) return "проводная";
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
    if (lower.includes("подрозет") || /\brecessed\b/i.test(value)) return "подрозетник";
    if (lower.includes("наклад") || /\bsurface\b/i.test(value) || /\bwall\b/i.test(value)) return "накладной";
    if (lower.includes("встраив")) return "встраиваемый";
    return value;
  }

  if (key === "channels") {
    const m = lower.match(/(\d+)/);
    if (m) {
      const n = Number(m[1]);
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

function formatBrandFacetValue(facetKey, rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return value;
  const normalized = normalizeFilterFacetValue(facetKey, value);
  const unitsOnly = new Set(["supplyVoltages", "nominalCurrents", "nominalPowers", "maxLoads"]);
  if (!unitsOnly.has(String(facetKey || ""))) return normalized;
  return normalized
    .replace(/\s*\u043a\u0412\u0442\b/gi, " kW")
    .replace(/\s*\u043a\u0412\b/gi, " kV")
    .replace(/\s*\u043c\u0412\u0442\b/gi, " mW")
    .replace(/\s*\u043c\u0412\b/gi, " mV")
    .replace(/\s*\u043c\u0410\b/gi, " mA")
    .replace(/\s*\u0412\u0442\b/gi, " W")
    .replace(/\s*\u0412\b/gi, " V")
    .replace(/\s*\u0410\b/gi, " A")
    .replace(/\s+/g, " ")
    .trim();
}

const facetHelpers = createFacetHelpers({
  normalizeValue: normalizeFilterFacetValue,
  formatValue: formatBrandFacetValue
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
  renderCheckGroup
} = facetHelpers;
function shouldShowFacetGroup(brandName, options, selectedSet, allowSingle = false) {
  const hasSelection = selectedSet instanceof Set && selectedSet.size > 0;
  const optionCount = Array.isArray(options) ? options.length : 0;
  return optionCount > 0 || hasSelection;
}

function compactFacetOptions(options, selectedSet) {
  const rows = Array.isArray(options) ? options : [];
  return rows.filter((row) => {
    const value = String((row && row.value) || "").trim();
    if (!value) return false;
    return true;
  });
}

function detectContext(selectedSub) {
  const sub = String(selectedSub || "").toLowerCase();
  return {
    sensors: /датчик|sensor|сенсор/.test(sub),
    controllers: /контроллер|controller|шлюз|gateway|сервер|plc/.test(sub),
    relays: /реле|relay|диммер|dimmer/.test(sub)
  };
}

function getDominantTopCategory(items) {
  const map = new Map();
  for (const item of items || []) {
    const key = String(item?.topCategory || "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  let best = "";
  let bestCnt = 0;
  for (const [key, cnt] of map.entries()) {
    if (cnt > bestCnt) {
      best = key;
      bestCnt = cnt;
    }
  }
  return best;
}

function getHiteProFacetProfile(selectedSub) {
  const subSlug = slugify(String(selectedSub || ""));
  const subRaw = String(selectedSub || "").toLowerCase();
  const isSensors = subSlug.includes("datchik") || subSlug.includes("sensor") || /датчик|sensor/.test(subRaw);
  const isRelayBlocks = subSlug.includes("blok") || subSlug.includes("upravlen") || /блок|управл/.test(subRaw);
  const isRadioSwitches = subSlug.includes("radio") || subSlug.includes("vyklyuch") || /радио|выключ/.test(subRaw);
  const isServer = subSlug.includes("server") || /сервер/.test(subRaw);
  const isKits = subSlug.includes("komplekt") || /комплект/.test(subRaw);
  const isOther = subSlug.includes("prochee") || /проч/.test(subRaw);

  if (isOther) {
    return {
      systemTypes: false,
      protocols: false,
      mountings: false,
      supplyVoltages: false,
      channels: false,
      nominalCurrents: false,
      nominalPowers: false,
      sensorTypes: false,
      indoorOutdoor: false,
      ipRatings: false,
      ioCounts: false,
      webInterfaces: false,
      scenarioSupports: false,
      loadTypes: false,
      maxLoads: false
    };
  }

  if (isSensors) {
    return {
      systemTypes: false,
      protocols: false,
      mountings: true,
      supplyVoltages: true,
      channels: false,
      nominalCurrents: false,
      nominalPowers: false,
      sensorTypes: true,
      indoorOutdoor: true,
      ipRatings: true,
      ioCounts: false,
      webInterfaces: false,
      scenarioSupports: false,
      loadTypes: false,
      maxLoads: false
    };
  }

  if (isRadioSwitches) {
    return {
      systemTypes: true,
      protocols: true,
      mountings: true,
      supplyVoltages: true,
      channels: true,
      nominalCurrents: false,
      nominalPowers: false,
      sensorTypes: false,
      indoorOutdoor: false,
      ipRatings: false,
      ioCounts: false,
      webInterfaces: false,
      scenarioSupports: true,
      loadTypes: false,
      maxLoads: false
    };
  }

  if (isRelayBlocks) {
    return {
      systemTypes: false,
      protocols: true,
      mountings: true,
      supplyVoltages: true,
      channels: true,
      nominalCurrents: true,
      nominalPowers: true,
      sensorTypes: false,
      indoorOutdoor: false,
      ipRatings: false,
      ioCounts: false,
      webInterfaces: false,
      scenarioSupports: false,
      loadTypes: true,
      maxLoads: true
    };
  }

  if (isServer) {
    return {
      systemTypes: false,
      protocols: true,
      mountings: true,
      supplyVoltages: true,
      channels: false,
      nominalCurrents: false,
      nominalPowers: false,
      sensorTypes: false,
      indoorOutdoor: false,
      ipRatings: false,
      ioCounts: true,
      webInterfaces: true,
      scenarioSupports: true,
      loadTypes: false,
      maxLoads: false
    };
  }

  if (isKits) {
    return {
      systemTypes: true,
      protocols: true,
      mountings: false,
      supplyVoltages: true,
      channels: true,
      nominalCurrents: false,
      nominalPowers: false,
      sensorTypes: true,
      indoorOutdoor: true,
      ipRatings: true,
      ioCounts: false,
      webInterfaces: false,
      scenarioSupports: false,
      loadTypes: false,
      maxLoads: false
    };
  }

  return {
    systemTypes: true,
    protocols: true,
    mountings: true,
    supplyVoltages: true,
    channels: true,
    nominalCurrents: true,
    nominalPowers: true,
    sensorTypes: true,
    indoorOutdoor: true,
    ipRatings: true,
    ioCounts: true,
    webInterfaces: true,
    scenarioSupports: true,
    loadTypes: true,
    maxLoads: true
  };
}

function resolveFacetVisibility(brandName, selectedSub, context) {
  if (isHiteProBrand(brandName)) return getHiteProFacetProfile(selectedSub);
  return {
    systemTypes: true,
    protocols: true,
    mountings: !isLarnitechBrand(brandName),
    supplyVoltages: true,
    channels: true,
    nominalCurrents: true,
    nominalPowers: true,
    sensorTypes: !!context.sensors,
    indoorOutdoor: !!context.sensors,
    ipRatings: !!context.sensors,
    ioCounts: !!context.controllers,
    webInterfaces: !!context.controllers,
    scenarioSupports: !!context.controllers,
    loadTypes: !!context.relays,
    maxLoads: !!context.relays
  };
}

function getEffectiveSystemType(brandName, selectedSub, product) {
  const base = String((product && product.systemType) || "").trim();
  if (!isLarnitechBrand(brandName)) return base;
  const subSlug = slugify(String(selectedSub || ""));
  if (subSlug === "wireless") return "беспроводная";
  if (subSlug === "din-reechnoe-oborudovanie") return base || "проводная";
  return base;
}

function getEffectiveMounting(brandName, selectedSub, product) {
  const base = String((product && product.mounting) || "").trim();
  if (!isLarnitechBrand(brandName)) return base;
  const subSlug = slugify(String(selectedSub || ""));
  if (subSlug.includes("podrozetn")) return "recessed";
  return base;
}

function getHiteProDerivedFacet(product, key) {
  const name = String((product && product.name) || "").toLowerCase();
  const article = String((product && (product.article || product.id)) || "").toLowerCase();
  const group = String((product && (product.group || product.group_name || "")) || "").toLowerCase();
  const raw = [name, article, group].join(" ");

  if (key === "systemType") return "wireless";

  if (key === "protocol") {
    if (/\bble\b|bluetooth/.test(raw)) return "BLE";
    if (/\bzigbee\b/.test(raw)) return "Zigbee";
    if (/\bwi-?fi\b/.test(raw)) return "Wi-Fi";
    if (/3g|4g|lte|gsm/.test(raw)) return "3G/4G";
    if (/radio|relay|switch|smart|sensor|dst|hpsw|hpcb/.test(raw)) return "RF";
    return "";
  }

  if (key === "mounting") {
    if (/\bdin\b|din-rail|rail/.test(raw)) return "DIN";
    if (/compact|hpcb|relay/.test(raw)) return "recessed";
    if (/switch|button|panel|remote|dst/.test(raw)) return "wall";
    if (/sensor|motion|water|checker/.test(raw)) return "surface";
    return "";
  }

  if (key === "channels") {
    const m = raw.match(/(?:relay|channel|ch)[- ]?(\d{1,2})/i);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return String(n);
    }
    if (/rgbw/.test(raw)) return "4";
    if (/dim/.test(raw)) return "1";
    return "";
  }

  if (key === "nominalCurrent") {
    const m = raw.match(/(\d+(?:[.,]\d+)?)\s*a\b/i);
    return m ? `${String(m[1]).replace(",", ".")}A` : "";
  }

  if (key === "supplyVoltage") {
    if (/-12\b|12v|12 v/.test(raw)) return "12V";
    if (/-24\b|24v|24 v/.test(raw)) return "24V";
    if (/220v|220 v|~220|ac220/.test(raw)) return "220V";
    return "";
  }

  if (key === "sensorType") {
    if (/motion/.test(raw)) return "motion";
    if (/water|leak/.test(raw)) return "leak";
    if (/temp|humidity/.test(raw)) return "temp/humidity";
    if (/open|door|window|checker/.test(raw)) return "open/close";
    if (/co2/.test(raw)) return "CO2";
    return "";
  }

  if (key === "indoorOutdoor") {
    if (/outdoor|ip65/.test(raw)) return "outdoor";
    if (/sensor|switch|remote|relay|module/.test(raw)) return "indoor";
    return "";
  }

  if (key === "ipRating") {
    const m = raw.match(/ip\s*([0-9]{2})/i);
    return m ? `IP${m[1]}` : "";
  }

  if (key === "scenarioSupport") {
    if (/switch|remote|button|scene|dst/.test(raw)) return "yes";
    return "";
  }

  if (key === "loadType") {
    if (/rgbw/.test(raw)) return "RGBW";
    if (/led/.test(raw)) return "LED";
    if (/dim/.test(raw)) return "dimmable";
    if (/relay/.test(raw)) return "relay";
    return "";
  }

  if (key === "maxLoad") {
    const m = raw.match(/(\d+(?:[.,]\d+)?)\s*a\b/i);
    return m ? `${String(m[1]).replace(",", ".")}A` : "";
  }

  if (key === "ioCount") {
    const ch = getHiteProDerivedFacet(product, "channels");
    const n = Number(ch);
    return Number.isFinite(n) && n > 0 ? `${n} output` : "";
  }

  return "";
}

function getWirenBoardDerivedFacet(product, key) {
  const name = String((product && product.name) || "").toLowerCase();
  const article = String((product && (product.article || product.id)) || "").toLowerCase();
  const group = String((product && (product.group || product.group_name || "")) || "").toLowerCase();
  const specs = String((product && product.specs) || "").toLowerCase();
  const attrs = Array.isArray(product && product.attributes)
    ? product.attributes.map((x) => `${x && x.name || ""} ${x && x.value || ""}`).join(" ")
    : "";
  const hay = `${name} ${article} ${group} ${specs} ${String(attrs).toLowerCase()}`;

  if (key === "systemType") {
    if (/wi-?fi|zigbee|z-wave|ble|bluetooth|4g|lte|gsm|rf/.test(hay)) return "гибридная";
    return "проводная";
  }

  if (key === "protocol") {
    if (/\bmodbus\b/.test(hay)) return "Modbus";
    if (/\bmqtt\b/.test(hay)) return "MQTT";
    if (/\bknx\b/.test(hay)) return "KNX";
    if (/\bbacnet\b/.test(hay)) return "BACnet";
    if (/\bopc\s*ua\b/.test(hay)) return "OPC UA";
    if (/\bsnmp\b/.test(hay)) return "SNMP";
    if (/\b1-?wire\b/.test(hay)) return "1-Wire";
    return "";
  }

  if (key === "mounting") {
    if (/\bdin\b|дин-рейк|din-рейк|din rail|rail/.test(hay)) return "DIN";
    if (/настенн|wall/.test(hay)) return "wall";
    if (/встраив|подрозет|recess/.test(hay)) return "recessed";
    return "";
  }

  if (key === "supplyVoltage") {
    if (/\b220\s*v\b|220в/.test(hay)) return "220V";
    if (/\b24\s*v\b|24в/.test(hay)) return "24V";
    if (/\b12\s*v\b|12в/.test(hay)) return "12V";
    if (/\b5\s*v\b|5в/.test(hay)) return "5V";
    return "";
  }

  if (key === "channels") {
    const m1 = hay.match(/(\d{1,2})\s*(?:канал|channel)/i);
    if (m1 && m1[1]) return String(Number(m1[1]));
    const m2 = hay.match(/(?:\bmr-?)(\d{1,2})x/i);
    if (m2 && m2[1]) return String(Number(m2[1]));
    return "";
  }

  if (key === "nominalCurrent" || key === "maxLoad") {
    const m = hay.match(/(\d+(?:[.,]\d+)?)\s*a\b/i);
    return m ? `${String(m[1]).replace(",", ".")}A` : "";
  }

  if (key === "nominalPower") {
    const m = hay.match(/(\d+(?:[.,]\d+)?)\s*w\b/i);
    return m ? `${String(m[1]).replace(",", ".")}W` : "";
  }

  if (key === "sensorType") {
    if (/температур|temperature/.test(hay)) return "temp/humidity";
    if (/протеч|leak/.test(hay)) return "leak";
    if (/движен|motion/.test(hay)) return "motion";
    if (/co2/.test(hay)) return "CO2";
    return "";
  }

  if (key === "indoorOutdoor") {
    if (/уличн|outdoor|ip65|ip67/.test(hay)) return "outdoor";
    if (/внутрен|indoor/.test(hay)) return "indoor";
    return "";
  }

  if (key === "ipRating") {
    const m = hay.match(/\bip\s*([0-9]{2})\b/i);
    return m ? `IP${m[1]}` : "";
  }

  if (key === "ioCount") {
    const m = hay.match(/(\d{1,2})\s*(?:вход|выход|input|output)/i);
    if (m && m[1]) return `${Number(m[1])} io`;
    return "";
  }

  if (key === "webInterface") {
    if (/web|веб|http/.test(hay)) return "yes";
    return "";
  }

  if (key === "scenarioSupport") {
    if (/сценар|automation|rule/.test(hay)) return "yes";
    return "";
  }

  if (key === "loadType") {
    if (/relay|реле/.test(hay)) return "relay";
    if (/dimmer|диммер/.test(hay)) return "dimmable";
    return "";
  }

  return "";
}

function normalizeFacetValueByKey(key, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (key === "channels") {
    const n = Number(raw);
    if (Number.isFinite(n) && n <= 0) return "";
  }

  if (key === "ioCount") {
    const m = raw.match(/^(\d+)\s*(output|in\/out|io)?$/i);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0) return "";
      const suffix = String(m[2] || "output").toLowerCase();
      if (suffix === "output") return `${n} output`;
      if (suffix === "in/out") return `${n} in/out`;
      if (suffix === "io") return `${n} io`;
    }
  }

  return raw;
}

function getFacetValue(brandName, selectedSub, product, key) {
  const p = product || {};
  if (key === "brand") return normalizeFacetValueByKey(key, normalizeBrandFacetValue(getProductBrand(p)));
  if (key === "systemType") {
    const base = getEffectiveSystemType(brandName, selectedSub, p);
    const derived = isHiteProBrand(brandName)
      ? getHiteProDerivedFacet(p, key)
      : (isWirenBoardBrand(brandName) ? getWirenBoardDerivedFacet(p, key) : "");
    return normalizeFacetValueByKey(key, base || derived);
  }
  if (key === "mounting") {
    const base = getEffectiveMounting(brandName, selectedSub, p);
    const derived = isHiteProBrand(brandName)
      ? getHiteProDerivedFacet(p, key)
      : (isWirenBoardBrand(brandName) ? getWirenBoardDerivedFacet(p, key) : "");
    return normalizeFacetValueByKey(key, base || derived);
  }

  const map = {
    protocol: p.protocol,
    supplyVoltage: normalizeMeasurementValue("voltage", p.supplyVoltage),
    channels: p.channels,
    nominalCurrent: normalizeMeasurementValue("current", p.nominalCurrent),
    nominalPower: normalizeMeasurementValue("power", p.nominalPower),
    sensorType: p.sensorType,
    indoorOutdoor: p.indoorOutdoor,
    ipRating: p.ipRating,
    ioCount: p.ioCount,
    webInterface: p.webInterface,
    scenarioSupport: p.scenarioSupport,
    loadType: p.loadType,
    maxLoad: p.maxLoad
  };

  const value = String(map[key] || "").trim();
  if (value) return normalizeFacetValueByKey(key, value);
  const derived = isHiteProBrand(brandName)
    ? getHiteProDerivedFacet(p, key)
    : (isWirenBoardBrand(brandName) ? getWirenBoardDerivedFacet(p, key) : "");
  return normalizeFacetValueByKey(key, derived);
}
export function renderBrandPage(state, appEl, brandSlug, renderProductCardFn, bindSearch) {
  const brands = [...new Set(state.products.map((p) => p.brand || "").filter(isVisibleBrand))];
  const brandName = brands.find((brand) => slugify(brand) === brandSlug);

  if (!brandName) {
    applySafeHtml(appEl, "<p>Бренд не найден</p>");
    return;
  }

  const brandProducts = state.products.filter((p) => p.brand === brandName);
  const subcategories = getBrandSubcategories(brandName, brandProducts);
  const visibleProducts = brandProducts.filter((p) => productMatchesSearch(p, state.search));
  const grouped = new Map();
  for (const product of brandProducts) {
    const sub = getBrandSubcategory(brandName, product);
    if (!grouped.has(sub)) grouped.set(sub, []);
    grouped.get(sub).push(product);
  }
  const effectiveSubcategories = subcategories.length
    ? subcategories
    : Array.from(grouped.keys()).filter(Boolean);

  function rankFeatured(products) {
    return products
      .slice()
      .sort((a, b) => {
        const aFeatured = Number(a?.isBrandFeatured || a?.is_brand_featured || 0) === 1 ? 1 : 0;
        const bFeatured = Number(b?.isBrandFeatured || b?.is_brand_featured || 0) === 1 ? 1 : 0;
        if (aFeatured !== bFeatured) return bFeatured - aFeatured;
        const aHasImage = a.image ? 1 : 0;
        const bHasImage = b.image ? 1 : 0;
        if (aHasImage !== bHasImage) return bHasImage - aHasImage;
        const aPrice = Number(a.price || 0);
        const bPrice = Number(b.price || 0);
        if (aPrice !== bPrice) return aPrice - bPrice;
        return String(a.name || "").localeCompare(String(b.name || ""), "ru");
      })
      .slice(0, 8);
  }

  const featured = rankFeatured(visibleProducts.length ? visibleProducts : brandProducts);
  const firstSub = effectiveSubcategories.find((x) => (grouped.get(x) || []).length) || effectiveSubcategories[0] || "";
  const firstSubToken = subcategoryRouteToken(firstSub);
  const allHref = firstSubToken ? `#/brands/${brandSlug}/${firstSubToken}` : `#/brands/${brandSlug}`;
  const brandTitle = safeText(brandName);

  applySafeHtml(appEl, `
    <div class="listing-top">
      <div class="brand-page-top">
        ${pageTitle(brandTitle)}
        ${searchRow(state.search)}
      </div>
      <div class="brand-mobile-toolbar">
        <div class="mobile-filters-bar">
          <a class="button button-outline mobile-categories-btn brand-sections-entry" href="${allHref}" aria-label="Разделы">
            <i class="fa-solid fa-bars" aria-hidden="true"></i>
            <span>Разделы</span>
          </a>
        </div>
        <section class="subcategory-grid subcategory-grid-inline">
          ${effectiveSubcategories.map((subcategory) => {
            const items = grouped.get(subcategory) || [];
            if (items.length === 0) return "";
            return `<a class="subcategory-chip" href="#/brands/${brandSlug}/${subcategoryRouteToken(subcategory)}">${safeText(subcategory)} (${items.length})</a>`;
          }).join("")}
        </section>
      </div>
    </div>
    <section class="brand-featured-block">
      <div class="brand-featured-head">
        <h3 class="brand-featured-title">\u0425\u0438\u0442\u044b \u0431\u0440\u0435\u043d\u0434\u0430</h3>
      </div>
      <section class="product-grid">
        ${featured.length ? featured.map((p) => renderProductCardFn(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("") : '<div class="note">\u0422\u043e\u0432\u0430\u0440\u044b \u043f\u043e\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b.<\/div>'}
      </section>
    </section>
  `);
  bindSearch();

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavorite(state, id);
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

export function renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCardFn, bindSearch) {
  const brands = [...new Set(state.products.map((p) => p.brand || "").filter(isVisibleBrand))];
  const brandName = brands.find((brand) => slugify(brand) === brandSlug);

  if (!brandName) {
    applySafeHtml(appEl, "<p>Бренд не найден</p>");
    return;
  }

  const brandProducts = state.products.filter((p) => p.brand === brandName);
  const subcategories = getBrandSubcategories(brandName, brandProducts);
  const sectionCounts = new Map();
  brandProducts.forEach((p) => {
    const candidates = [
      getBrandSubcategory(brandName, p),
      String((p && p.brandSubcategory) || "").trim(),
      String((p && p.subCategory) || "").trim(),
      getGroupTail(p)
    ];
    const first = candidates
      .map((v) => safeText(v))
      .find((v) => v);
    if (!first) return;
    sectionCounts.set(first, (sectionCounts.get(first) || 0) + 1);
  });
  let effectiveSubcategories = subcategories.length
    ? subcategories.filter((name) => (sectionCounts.get(name) || 0) > 0)
    : Array.from(sectionCounts.keys());
  if (!effectiveSubcategories.length) {
    effectiveSubcategories = Array.from(new Set(
      brandProducts
        .map((p) => safeText(String((p && (p.subCategory || p.group || p.group_name || "")) || "").split("/").pop()))
        .filter(Boolean)
    ));
  }
  const selectedSub = effectiveSubcategories.find((x) => isSameSubcategoryToken(x, subcategorySlug)) || "";
  const brandTitle = safeText(brandName);
  const bySub = selectedSub ? brandProducts.filter((p) => getBrandSubcategory(brandName, p) === selectedSub) : brandProducts;

  const facets = {
    brands: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "brand"), "brands"),
    systemTypes: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "systemType"), "systemTypes"),
    protocols: countMulti(bySub, (p) => getFacetValue(brandName, selectedSub, p, "protocol"), "protocols"),
    mountings: countMulti(bySub, (p) => getFacetValue(brandName, selectedSub, p, "mounting"), "mountings"),
    supplyVoltages: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "supplyVoltage"), "supplyVoltages"),
    channels: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "channels"), "channels"),
    nominalCurrents: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "nominalCurrent"), "nominalCurrents"),
    nominalPowers: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "nominalPower"), "nominalPowers"),
    sensorTypes: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "sensorType"), "sensorTypes"),
    indoorOutdoor: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "indoorOutdoor"), "indoorOutdoor"),
    ipRatings: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "ipRating"), "ipRatings"),
    ioCounts: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "ioCount"), "ioCounts"),
    webInterfaces: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "webInterface"), "webInterfaces"),
    scenarioSupports: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "scenarioSupport"), "scenarioSupports"),
    loadTypes: countMulti(bySub, (p) => getFacetValue(brandName, selectedSub, p, "loadType"), "loadTypes"),
    maxLoads: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "maxLoad"), "maxLoads")
  };

  const selected = {
    brands: new Set((state.filters.brands || []).map((x) => normalizeBrandFacetValue(x)).filter(Boolean)),
    systemTypes: new Set((state.filters.systemTypes || []).map((x) => normalizeFilterFacetValue("systemTypes", x)).filter(Boolean)),
    protocols: new Set((state.filters.protocols || []).map((x) => normalizeFilterFacetValue("protocols", x)).filter(Boolean)),
    mountings: new Set((state.filters.mountings || []).map((x) => normalizeFilterFacetValue("mountings", x)).filter(Boolean)),
    supplyVoltages: new Set(state.filters.supplyVoltages),
    channels: new Set((state.filters.channels || []).map((x) => normalizeFilterFacetValue("channels", x)).filter(Boolean)),
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

  const visibleFacets = {
    systemTypes: compactFacetOptions(facets.systemTypes, selected.systemTypes),
    protocols: compactFacetOptions(facets.protocols, selected.protocols),
    mountings: compactFacetOptions(facets.mountings, selected.mountings),
    supplyVoltages: compactFacetOptions(facets.supplyVoltages, selected.supplyVoltages),
    channels: compactFacetOptions(facets.channels, selected.channels),
    nominalCurrents: compactFacetOptions(facets.nominalCurrents, selected.nominalCurrents),
    nominalPowers: compactFacetOptions(facets.nominalPowers, selected.nominalPowers),
    sensorTypes: compactFacetOptions(facets.sensorTypes, selected.sensorTypes),
    indoorOutdoor: compactFacetOptions(facets.indoorOutdoor, selected.indoorOutdoor),
    ipRatings: compactFacetOptions(facets.ipRatings, selected.ipRatings),
    ioCounts: compactFacetOptions(facets.ioCounts, selected.ioCounts),
    webInterfaces: compactFacetOptions(facets.webInterfaces, selected.webInterfaces),
    scenarioSupports: compactFacetOptions(facets.scenarioSupports, selected.scenarioSupports),
    loadTypes: compactFacetOptions(facets.loadTypes, selected.loadTypes),
    maxLoads: compactFacetOptions(facets.maxLoads, selected.maxLoads)
  };
  const hasVisibleFacetOptions = Object.values(visibleFacets).some((list) => Array.isArray(list) && list.length > 0);
  const renderFacets = hasVisibleFacetOptions ? visibleFacets : facets;
  const allowSingleFacet = !hasVisibleFacetOptions;
  const dominantCategory = getDominantTopCategory(bySub);
  const facetProfile = getCategoryFacetProfile(dominantCategory);
  const profiledFacets = {
    ...renderFacets,
    channels: applyFacetProfile(renderFacets.channels, "channels", facetProfile),
    supplyVoltages: applyFacetProfile(renderFacets.supplyVoltages, "supplyVoltages", facetProfile),
    nominalCurrents: applyFacetProfile(renderFacets.nominalCurrents, "nominalCurrents", facetProfile),
    nominalPowers: applyFacetProfile(renderFacets.nominalPowers, "nominalPowers", facetProfile)
  };

  const minFacetPrice = bySub.length ? Math.floor(Math.min(...bySub.map((p) => Number(p.price || 0)))) : 0;
  const maxFacetPrice = bySub.length ? Math.ceil(Math.max(...bySub.map((p) => Number(p.price || 0)))) : 0;
  const minSelected = state.filters.minPrice !== "" ? Number(state.filters.minPrice) : null;
  const maxSelected = state.filters.maxPrice !== "" ? Number(state.filters.maxPrice) : null;
  const context = detectContext(selectedSub);
  const facetVisibility = resolveFacetVisibility(brandName, selectedSub, context);

  const filteredItems = bySub.filter((p) => {
    if (!productMatchesSearch(p, state.search)) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "brand"), selected.brands, "brands")) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "systemType"), selected.systemTypes, "systemTypes")) return false;
    if (!matchesMultiAll(getFacetValue(brandName, selectedSub, p, "protocol"), selected.protocols, "protocols")) return false;
    if (!matchesMulti(getFacetValue(brandName, selectedSub, p, "mounting"), selected.mountings, "mountings")) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "supplyVoltage"), selected.supplyVoltages, "supplyVoltages")) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "channels"), selected.channels, "channels")) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "nominalCurrent"), selected.nominalCurrents, "nominalCurrents")) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "nominalPower"), selected.nominalPowers, "nominalPowers")) return false;
    if (context.sensors) {
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "sensorType"), selected.sensorTypes)) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "indoorOutdoor"), selected.indoorOutdoor)) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "ipRating"), selected.ipRatings)) return false;
    }
    if (context.controllers) {
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "ioCount"), selected.ioCounts)) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "webInterface"), selected.webInterfaces)) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "scenarioSupport"), selected.scenarioSupports)) return false;
    }
    if (context.relays) {
      if (!matchesMulti(getFacetValue(brandName, selectedSub, p, "loadType"), selected.loadTypes)) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "maxLoad"), selected.maxLoads)) return false;
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

  applySafeHtml(appEl, `
    <div class="listing-top">
      <div class="brand-page-top">
        ${pageTitle(brandTitle)}
        ${searchRow(state.search)}
      </div>
      <div class="brand-mobile-toolbar">
        <div class="mobile-filters-bar">
          <button class="button button-outline mobile-categories-btn" id="brandOpenCategoryBrowserBtn" type="button" aria-label="Разделы">
            <i class="fa-solid fa-bars" aria-hidden="true"></i>
            <span>Разделы</span>
          </button>
          <button class="button button-outline mobile-sort-btn" id="brandOpenSortBtn" type="button" aria-label="Сортировка">
            <i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i>
          </button>
          <button class="button button-outline mobile-filters-btn" id="brandOpenFiltersBtn" type="button" aria-label="\u0424\u0438\u043b\u044c\u0442\u0440\u044b">
            <i class="fa-solid fa-sliders" aria-hidden="true"></i>
            <span class="mobile-filters-count" id="brandMobileFiltersCount" hidden>0</span>
          </button>
          <div class="mobile-selected-filters" id="brandMobileSelectedFilters"></div>
        </div>
        <section class="subcategory-grid subcategory-grid-inline">
          ${effectiveSubcategories.map((subcategory) => {
            const count = sectionCounts.get(subcategory) || 0;
            if (count === 0) return "";
            const active = selectedSub === subcategory ? "is-active" : "";
            return `<a class="subcategory-chip ${active}" href="#/brands/${brandSlug}/${subcategoryRouteToken(subcategory)}">${safeText(subcategory)}</a>`;
          }).join("")}
        </section>
      </div>
    </div>
    <div class="grid-layout">
      <section class="product-grid">
        ${items.length ? items.map((product) => renderProductCardFn(product, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("") : '<div class="note">Товары не найдены</div>'}
      </section>
      <aside class="filters" id="brandFiltersPanel">
        <div class="filters-popup-head">
          <h4>\u0424\u0438\u043b\u044c\u0442\u0440\u044b</h4>
          <button class="button button-plain filters-close-btn" id="brandCloseFiltersBtn" type="button" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">\u2715</button>
        </div>
        <h4>Фильтры</h4>
        <div class="filters-selected" id="brandSelectedFilters"></div>
        <fieldset class="filter-group">
          <legend>Цена, ₽ (пересчет)</legend>
          <div class="price-row">
            <input class="input" id="brandMinPriceFilter" type="number" min="${minFacetPrice}" placeholder="от ${minFacetPrice}" value="${state.filters.minPrice}" />
            <input class="input" id="brandMaxPriceFilter" type="number" min="${minFacetPrice}" placeholder="до ${maxFacetPrice}" value="${state.filters.maxPrice}" />
          </div>
        </fieldset>
        
        ${facetVisibility.systemTypes && shouldShowFacetGroup(brandName, profiledFacets.systemTypes, selected.systemTypes, allowSingleFacet) ? renderCheckGroup("Тип системы", "systemTypes", profiledFacets.systemTypes, selected.systemTypes) : ""}
        ${facetVisibility.protocols && shouldShowFacetGroup(brandName, profiledFacets.protocols, selected.protocols, allowSingleFacet) ? renderCheckGroup("Протокол", "protocols", profiledFacets.protocols, selected.protocols) : ""}
        ${facetVisibility.mountings && shouldShowFacetGroup(brandName, profiledFacets.mountings, selected.mountings, allowSingleFacet) ? renderCheckGroup("Монтаж", "mountings", profiledFacets.mountings, selected.mountings) : ""}
        ${facetVisibility.supplyVoltages && shouldShowFacetGroup(brandName, profiledFacets.supplyVoltages, selected.supplyVoltages, allowSingleFacet) ? renderCheckGroup("Напряжение питания", "supplyVoltages", profiledFacets.supplyVoltages, selected.supplyVoltages) : ""}
        ${facetVisibility.channels && shouldShowFacetGroup(brandName, profiledFacets.channels, selected.channels, allowSingleFacet) ? renderCheckGroup("Количество каналов", "channels", profiledFacets.channels, selected.channels) : ""}
        ${facetVisibility.nominalCurrents && shouldShowFacetGroup(brandName, profiledFacets.nominalCurrents, selected.nominalCurrents, allowSingleFacet) ? renderCheckGroup("Номинальный ток", "nominalCurrents", profiledFacets.nominalCurrents, selected.nominalCurrents) : ""}
        ${facetVisibility.nominalPowers && shouldShowFacetGroup(brandName, profiledFacets.nominalPowers, selected.nominalPowers, allowSingleFacet) ? renderCheckGroup("Номинальная мощность", "nominalPowers", profiledFacets.nominalPowers, selected.nominalPowers) : ""}
        ${facetVisibility.sensorTypes && shouldShowFacetGroup(brandName, profiledFacets.sensorTypes, selected.sensorTypes, allowSingleFacet) ? renderCheckGroup("Тип датчика", "sensorTypes", profiledFacets.sensorTypes, selected.sensorTypes) : ""}
        ${facetVisibility.indoorOutdoor && shouldShowFacetGroup(brandName, profiledFacets.indoorOutdoor, selected.indoorOutdoor, allowSingleFacet) ? renderCheckGroup("Внутренний / уличный", "indoorOutdoor", profiledFacets.indoorOutdoor, selected.indoorOutdoor) : ""}
        ${facetVisibility.ipRatings && shouldShowFacetGroup(brandName, profiledFacets.ipRatings, selected.ipRatings, allowSingleFacet) ? renderCheckGroup("\u041a\u043b\u0430\u0441\u0441 \u0437\u0430\u0449\u0438\u0442\u044b IP", "ipRatings", profiledFacets.ipRatings, selected.ipRatings) : ""}
        ${facetVisibility.ioCounts && shouldShowFacetGroup(brandName, profiledFacets.ioCounts, selected.ioCounts, allowSingleFacet) ? renderCheckGroup("Входы / выходы", "ioCounts", profiledFacets.ioCounts, selected.ioCounts) : ""}
        ${facetVisibility.webInterfaces && shouldShowFacetGroup(brandName, profiledFacets.webInterfaces, selected.webInterfaces, allowSingleFacet) ? renderCheckGroup("Web-интерфейс", "webInterfaces", profiledFacets.webInterfaces, selected.webInterfaces) : ""}
        ${facetVisibility.scenarioSupports && shouldShowFacetGroup(brandName, profiledFacets.scenarioSupports, selected.scenarioSupports, allowSingleFacet) ? renderCheckGroup("Поддержка сценариев", "scenarioSupports", profiledFacets.scenarioSupports, selected.scenarioSupports) : ""}
        ${facetVisibility.loadTypes && shouldShowFacetGroup(brandName, profiledFacets.loadTypes, selected.loadTypes, allowSingleFacet) ? renderCheckGroup("Тип нагрузки", "loadTypes", profiledFacets.loadTypes, selected.loadTypes) : ""}
        ${facetVisibility.maxLoads && shouldShowFacetGroup(brandName, profiledFacets.maxLoads, selected.maxLoads, allowSingleFacet) ? renderCheckGroup("Максимальная нагрузка", "maxLoads", profiledFacets.maxLoads, selected.maxLoads) : ""}
        <button class="button apply-filters-btn" id="brandApplyFiltersBtn" type="button">\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0442\u043e\u0432\u0430\u0440\u044b (${items.length})</button>
      </aside>
    </div>
    <aside class="category-browser-panel" id="brandCategoryBrowserPanel" aria-label="Навигатор разделов бренда">
      <div class="filters-popup-head category-browser-head">
        <h4>Разделы</h4>
        <button class="button button-plain filters-close-btn" id="brandCloseCategoryBrowserBtn" type="button" aria-label="Закрыть">\u2715</button>
      </div>
      <div class="category-browser-list">
        <section class="category-browser-group is-open">
          <a class="category-browser-sub ${selectedSub ? "" : "is-active"}" href="#/brands/${brandSlug}">Все товары бренда</a>
          ${effectiveSubcategories.length ? `
            <div class="category-browser-subs">
              ${effectiveSubcategories.map((subcategory) => {
                const active = selectedSub === subcategory ? "is-active" : "";
                return `<a class="category-browser-sub ${active}" href="#/brands/${brandSlug}/${subcategoryRouteToken(subcategory)}">${safeText(subcategory)}</a>`;
              }).join("")}
            </div>
          ` : ""}
        </section>
      </div>
    </aside>
    <aside class="sort-panel" id="brandSortPanel" aria-label="Сортировка">
      <div class="sort-panel-handle" aria-hidden="true"></div>
      <div class="sort-panel-head">
        <h4>Показывать сначала</h4>
        <button class="button button-plain filters-close-btn" id="brandCloseSortBtn" type="button" aria-label="Закрыть">\u2715</button>
      </div>
      <div class="sort-options">
        <label class="sort-option">
          <span>Популярные</span>
          <input type="radio" name="brandSortMode" value="popular" ${sortMode === "popular" ? "checked" : ""} />
        </label>
        <label class="sort-option">
          <span>Подешевле</span>
          <input type="radio" name="brandSortMode" value="cheaper" ${sortMode === "cheaper" ? "checked" : ""} />
        </label>
        <label class="sort-option">
          <span>Подороже</span>
          <input type="radio" name="brandSortMode" value="expensive" ${sortMode === "expensive" ? "checked" : ""} />
        </label>
      </div>
      <button class="button button-outline sort-cancel-btn" id="brandCancelSortBtn" type="button">Отменить</button>
    </aside>
    <div class="filters-backdrop" id="brandFiltersBackdrop" hidden></div>
    <div class="filters-backdrop" id="brandCategoryBrowserBackdrop" hidden></div>
    <div class="filters-backdrop" id="brandSortBackdrop" hidden></div>
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
  const buildSelected = (filtersSnapshot) => ({
    brands: new Set((filtersSnapshot.brands || []).map((x) => normalizeBrandFacetValue(x)).filter(Boolean)),
    systemTypes: new Set((filtersSnapshot.systemTypes || []).map((x) => normalizeFilterFacetValue("systemTypes", x)).filter(Boolean)),
    protocols: new Set((filtersSnapshot.protocols || []).map((x) => normalizeFilterFacetValue("protocols", x)).filter(Boolean)),
    mountings: new Set((filtersSnapshot.mountings || []).map((x) => normalizeFilterFacetValue("mountings", x)).filter(Boolean)),
    supplyVoltages: new Set(filtersSnapshot.supplyVoltages || []),
    channels: new Set((filtersSnapshot.channels || []).map((x) => normalizeFilterFacetValue("channels", x)).filter(Boolean)),
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
  });
  const countItemsForFilters = (filtersSnapshot) => {
    const selectedSnapshot = buildSelected(filtersSnapshot);
    const minLocal = filtersSnapshot.minPrice !== "" ? Number(filtersSnapshot.minPrice) : null;
    const maxLocal = filtersSnapshot.maxPrice !== "" ? Number(filtersSnapshot.maxPrice) : null;
    return bySub.filter((p) => {
      if (!productMatchesSearch(p, state.search)) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "brand"), selectedSnapshot.brands, "brands")) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "systemType"), selectedSnapshot.systemTypes, "systemTypes")) return false;
      if (!matchesMultiAll(getFacetValue(brandName, selectedSub, p, "protocol"), selectedSnapshot.protocols, "protocols")) return false;
      if (!matchesMulti(getFacetValue(brandName, selectedSub, p, "mounting"), selectedSnapshot.mountings, "mountings")) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "supplyVoltage"), selectedSnapshot.supplyVoltages, "supplyVoltages")) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "channels"), selectedSnapshot.channels, "channels")) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "nominalCurrent"), selectedSnapshot.nominalCurrents, "nominalCurrents")) return false;
      if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "nominalPower"), selectedSnapshot.nominalPowers, "nominalPowers")) return false;
      if (context.sensors) {
        if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "sensorType"), selectedSnapshot.sensorTypes)) return false;
        if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "indoorOutdoor"), selectedSnapshot.indoorOutdoor)) return false;
        if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "ipRating"), selectedSnapshot.ipRatings)) return false;
      }
      if (context.controllers) {
        if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "ioCount"), selectedSnapshot.ioCounts)) return false;
        if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "webInterface"), selectedSnapshot.webInterfaces)) return false;
        if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "scenarioSupport"), selectedSnapshot.scenarioSupports)) return false;
      }
      if (context.relays) {
        if (!matchesMulti(getFacetValue(brandName, selectedSub, p, "loadType"), selectedSnapshot.loadTypes)) return false;
        if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "maxLoad"), selectedSnapshot.maxLoads)) return false;
      }
      const price = Number(p.price || 0);
      if (minLocal !== null && price < minLocal) return false;
      if (maxLocal !== null && price > maxLocal) return false;
      return true;
    }).length;
  };
  const minPriceFilter = document.getElementById("brandMinPriceFilter");
  const maxPriceFilter = document.getElementById("brandMaxPriceFilter");
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
  const applyBtn = document.getElementById("brandApplyFiltersBtn");
  const selectedBox = document.getElementById("brandSelectedFilters");
  const mobileSelectedBox = document.getElementById("brandMobileSelectedFilters");
  const mobileFiltersCount = document.getElementById("brandMobileFiltersCount");
  const applyDraftFilters = () => {
    const draft = collectDraftFilters();
    filterKeys.forEach((key) => {
      state.filters[key] = Array.isArray(draft[key]) ? draft[key] : [];
    });
    state.filters.minPrice = draft.minPrice;
    state.filters.maxPrice = draft.maxPrice;
    renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCardFn, bindSearch);
  };
  const buildDraftChips = (draft) => {
    const chips = [];
    filterKeys.forEach((key) => {
      (draft[key] || []).forEach((value) => chips.push({ key, value, label: value }));
    });
    if (draft.minPrice) chips.push({ key: "minPrice", value: draft.minPrice, label: `от ${draft.minPrice}` });
    if (draft.maxPrice) chips.push({ key: "maxPrice", value: draft.maxPrice, label: `до ${draft.maxPrice}` });
    return chips;
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
              <span class="filter-chip-x">\u00d7</span>
            </button>
          `
        )
        .join("")}
    `;
    if (selectedBox) {
      selectedBox.innerHTML = `
      <button class="filter-chip filter-chip-clear" type="button" data-chip-clear-all>\u00d7</button>
        ${chipsMarkup}
      `;
    }
    if (mobileSelectedBox) {
      mobileSelectedBox.innerHTML = chipsMarkup;
    }

    const connectChipEvents = (box) => {
      if (!box) return;
      box.querySelectorAll("[data-chip-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
        const key = btn.dataset.chipRemove;
        const value = btn.dataset.chipValue || "";
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
        applyDraftFilters();
      });
        });
    };
    connectChipEvents(selectedBox);
    connectChipEvents(mobileSelectedBox);

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
      applyBtn.textContent = "\u041d\u0435\u0442 \u043f\u043e\u0434\u0445\u043e\u0434\u044f\u0449\u0438\u0445 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0439";
      applyBtn.classList.add("is-empty");
    } else {
      applyBtn.textContent = `\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0442\u043e\u0432\u0430\u0440\u044b (${count})`;
      applyBtn.classList.remove("is-empty");
    }
  };
  appEl.querySelectorAll("[data-filter-key]").forEach((input) => {
    input.addEventListener("change", () => {
      updateApplyButton();
      renderSelectedChips();
    });
  });
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

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      applyDraftFilters();
    });
  }

  const filtersPanel = document.getElementById("brandFiltersPanel");
  const openFiltersBtn = document.getElementById("brandOpenFiltersBtn");
  const closeFiltersBtn = document.getElementById("brandCloseFiltersBtn");
  const filtersBackdrop = document.getElementById("brandFiltersBackdrop");
  const categoryBrowserPanel = document.getElementById("brandCategoryBrowserPanel");
  const openCategoryBrowserBtn = document.getElementById("brandOpenCategoryBrowserBtn");
  const closeCategoryBrowserBtn = document.getElementById("brandCloseCategoryBrowserBtn");
  const categoryBrowserBackdrop = document.getElementById("brandCategoryBrowserBackdrop");
  const sortPanel = document.getElementById("brandSortPanel");
  const openSortBtn = document.getElementById("brandOpenSortBtn");
  const closeSortBtn = document.getElementById("brandCloseSortBtn");
  const cancelSortBtn = document.getElementById("brandCancelSortBtn");
  const sortBackdrop = document.getElementById("brandSortBackdrop");
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

  appEl.querySelectorAll('input[name="brandSortMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      const next = String(input.value || "popular");
      state.catalogSort = next;
      renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCardFn, bindSearch);
    });
  });

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavorite(state, id);
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

export function getBrandsList(state) {
  return [...new Set(state.products.map((p) => p.brand || "").filter(isVisibleBrand))];
}

export function renderBrandsBlock(state, slugifyFn, imageTagFn) {
  const brands = getBrandsList(state);
  return `
    <h2 class="h1">Бренды</h2>
    <div class="h1-line"></div>
    <section class="category-grid brands-grid">
      ${brands
        .map(
          (brand) => `
        <a class="category-card brand-card" href="#/brands/${slugifyFn(brand)}">
          ${imageTagFn(getBrandLogo(brand), brand, getBrandLogoClass(brand), PLACEHOLDER_IMAGE)}
        </a>
      `
        )
        .join("")}
    </section>
  `;
}
