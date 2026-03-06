import { BRAND_STANDARD_SUBCATEGORIES, PLACEHOLDER_IMAGE } from "./config.js";
import { slugify, pageTitle, imageTag, searchRow, productMatchesSearch, resetFacetFilters, normalizeMeasurementValue } from "./utils.js";
import { renderProductCard, getUnifiedBrandSubcategory, getProductBrand } from "./products.js";
import { isFavorite, toggleFavorite } from "./favorites.js";

const HIDDEN_BRAND_KEYS = new Set([
  "делаем сети"
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
  "Серия Metaforsa",
  "DIN-реечное оборудование",
  "Оборудование для подрозетных коробок",
  "Датчики",
  "Multiroom",
  "Wireless",
  "Прочее"
];

const HITE_PRO_NATIVE_SECTIONS = [
  "Радиовыключатели",
  "Блоки управления",
  "Датчики",
  "Сервер умного дома",
  "Комплекты",
  "Умные замки",
  "Сопутствующие товары",
  "Системы усиления 3G/4G",
  "Реле и диммеры",
  "Контроллеры",
  "Аксессуары",
  "Термостаты",
  "Прочее"
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
  const isSensorByName = /ДАТЧИК|SENSOR|SENSORS|TEMPERATURE|HUMIDITY|CO2|MOTION|LEAK/i.test(name);
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
    return "Серия Metaforsa";
  }

  if (article.startsWith("BW")) return "Оборудование для подрозетных коробок";

  if (isExplicitSensorSku || isSensorByName) {
    return "Датчики";
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

  if (article.startsWith("DE") || article.startsWith("DW")) return "DIN-реечное оборудование";

  return "Прочее";
}

function getHiteProNativeSubcategory(product) {
  const tail = getGroupTail(product);
  if (tail && HITE_PRO_NATIVE_SECTIONS.includes(tail)) return tail;

  const name = String((product && product.name) || "").toLowerCase();
  const group = String((product && (product.group || product.group_name || "")) || "").toLowerCase();
  const hay = `${name} ${group}`;

  if (/\bsensor\b|\bdatchik\b|датчик/.test(hay)) return "Датчики";
  if (/\bkit\b|комплект/.test(hay)) return "Комплекты";
  if (/\bswitch\b|выключател/.test(hay)) return "Радиовыключатели";
  if (/\bgateway\b|\bserver\b|сервер|шлюз/.test(hay)) return "Сервер умного дома";
  if (/\brelay\b|реле|диммер/.test(hay)) return "Блоки управления";
  return "Прочее";
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

function splitMulti(raw) {
  return String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function countSingle(items, getter) {
  const map = new Map();
  for (const item of items) {
    const value = String(getter(item) || "").trim();
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "ru"));
}

function countMulti(items, getter) {
  const map = new Map();
  for (const item of items) {
    for (const value of splitMulti(getter(item))) {
      map.set(value, (map.get(value) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "ru"));
}

function matchesSingle(raw, selectedSet) {
  if (selectedSet.size === 0) return true;
  const value = String(raw || "").trim();
  return value ? selectedSet.has(value) : false;
}

function matchesMulti(raw, selectedSet) {
  if (selectedSet.size === 0) return true;
  return splitMulti(raw).some((value) => selectedSet.has(value));
}

function matchesMultiAll(raw, selectedSet) {
  if (selectedSet.size === 0) return true;
  const own = new Set(splitMulti(raw));
  for (const value of selectedSet) {
    if (!own.has(value)) return false;
  }
  return true;
}

function renderCheckGroup(title, key, options, selectedSet) {
  if (!options.length) return "";
  const formatFacetValue = (facetKey, value) => {
    const v = String(value || "").trim();
    if (!v) return v;
    const map = {
      wireless: "беспроводная",
      wall: "настенный",
      recessed: "подрозетник",
      surface: "накладной",
      indoor: "внутренний",
      outdoor: "уличный",
      yes: "да",
      relay: "релейная",
      dimmable: "диммируемая",
      motion: "движение",
      leak: "протечка",
      "temp/humidity": "температура/влажность",
      "open/close": "открытие/закрытие"
    };
    const direct = map[v.toLowerCase()];
    if (direct) return direct;
    if (facetKey === "protocol" && v === "RF") return "радио (RF)";
    return v;
  };
  return `
    <fieldset class="filter-group">
      <legend>${title}</legend>
      <div class="filter-scroll">
        ${options
          .map(({ value, count }) => {
            const checked = selectedSet.has(value) ? "checked" : "";
            const display = formatFacetValue(key, value);
            return `
              <label class="check-field">
                <input class="check-input" type="checkbox" value="${value}" data-filter-key="${key}" ${checked} />
                <span class="check-label">${display} <small>(${count})</small></span>
              </label>
            `;
          })
          .join("")}
      </div>
    </fieldset>
  `;
}

function shouldShowFacetGroup(brandName, options, selectedSet, allowSingle = false) {
  const hasSelection = selectedSet instanceof Set && selectedSet.size > 0;
  const optionCount = Array.isArray(options) ? options.length : 0;
  return optionCount > (allowSingle ? 0 : 1) || hasSelection;
}

function compactFacetOptions(options, selectedSet) {
  const selected = selectedSet instanceof Set ? selectedSet : new Set();
  const rows = Array.isArray(options) ? options : [];
  return rows.filter((row) => {
    const value = String((row && row.value) || "").trim();
    const count = Number((row && row.count) || 0);
    if (!value) return false;
    if (selected.has(value)) return true;
    return count > 1;
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

function getHiteProFacetProfile(selectedSub) {
  const subSlug = slugify(String(selectedSub || ""));
  const subRaw = String(selectedSub || "").toLowerCase();
  const isSensors = subSlug.includes("datchik") || subSlug.includes("sensor") || /датчик|sensor/.test(subRaw);
  const isRelayBlocks = subSlug.includes("blok") || subSlug.includes("upravlen") || /блок|управл/.test(subRaw);
  const isRadioSwitches = subSlug.includes("radio") || subSlug.includes("vyklyuch") || /радио|выключ/.test(subRaw);
  const isServer = subSlug.includes("server") || /сервер/.test(subRaw);
  const isKits = subSlug.includes("komplekt") || /комплект/.test(subRaw);
  const isOther = subSlug.includes("prochee") || /РїСЂРѕС‡/.test(subRaw);

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
    appEl.innerHTML = "<p>Бренд не найден</p>";
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

  appEl.innerHTML = `
    ${pageTitle(brandName)}
    ${searchRow(state.search)}
    <section class="subcategory-grid">
      ${effectiveSubcategories.map((subcategory) => {
        const items = grouped.get(subcategory) || [];
        if (items.length === 0) return "";
        return `<a class="subcategory-chip" href="#/brands/${brandSlug}/${subcategoryRouteToken(subcategory)}">${subcategory} (${items.length})</a>`;
      }).join("")}
    </section>
    <section class="brand-featured-block">
      <div class="brand-featured-head">
        <h3 class="brand-featured-title">Хиты бренда</h3>
        <a class="button button-outline js-brand-view-all" data-target="${allHref}" href="${allHref}">Смотреть все</a>
      </div>
      <section class="product-grid">
        ${featured.length ? featured.map((p) => renderProductCardFn(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("") : '<div class="note">Товары пока не найдены.</div>'}
      </section>
    </section>
  `;
  bindSearch();

  appEl.querySelectorAll(".js-brand-view-all").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = String(link.getAttribute("data-target") || link.getAttribute("href") || "").trim();
      if (!target) return;
      event.preventDefault();
      if (location.hash !== target) {
        location.hash = target;
        return;
      }
      // Force rerender when hash is unchanged.
      location.hash = "";
      setTimeout(() => {
        location.hash = target;
      }, 0);
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
      btn.textContent = active ? "♥" : "♡";
    });
  });
}

export function renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCardFn, bindSearch) {
  const brands = [...new Set(state.products.map((p) => p.brand || "").filter(isVisibleBrand))];
  const brandName = brands.find((brand) => slugify(brand) === brandSlug);

  if (!brandName) {
    appEl.innerHTML = "<p>Бренд не найден</p>";
    return;
  }

  const brandProducts = state.products.filter((p) => p.brand === brandName);
  const subcategories = getBrandSubcategories(brandName, brandProducts);
  const effectiveSubcategories = subcategories.length
    ? subcategories
    : Array.from(new Set(brandProducts.map((p) => getBrandSubcategory(brandName, p)).filter(Boolean)));
  const selectedSub = effectiveSubcategories.find((x) => isSameSubcategoryToken(x, subcategorySlug)) || "";
  const bySub = selectedSub ? brandProducts.filter((p) => getBrandSubcategory(brandName, p) === selectedSub) : brandProducts;

  const facets = {
    brands: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "brand")),
    systemTypes: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "systemType")),
    protocols: countMulti(bySub, (p) => getFacetValue(brandName, selectedSub, p, "protocol")),
    mountings: countMulti(bySub, (p) => getFacetValue(brandName, selectedSub, p, "mounting")),
    supplyVoltages: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "supplyVoltage")),
    channels: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "channels")),
    nominalCurrents: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "nominalCurrent")),
    nominalPowers: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "nominalPower")),
    sensorTypes: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "sensorType")),
    indoorOutdoor: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "indoorOutdoor")),
    ipRatings: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "ipRating")),
    ioCounts: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "ioCount")),
    webInterfaces: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "webInterface")),
    scenarioSupports: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "scenarioSupport")),
    loadTypes: countMulti(bySub, (p) => getFacetValue(brandName, selectedSub, p, "loadType")),
    maxLoads: countSingle(bySub, (p) => getFacetValue(brandName, selectedSub, p, "maxLoad"))
  };

  const selected = {
    brands: new Set((state.filters.brands || []).map((x) => normalizeBrandFacetValue(x)).filter(Boolean)),
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

  const minFacetPrice = bySub.length ? Math.floor(Math.min(...bySub.map((p) => Number(p.price || 0)))) : 0;
  const maxFacetPrice = bySub.length ? Math.ceil(Math.max(...bySub.map((p) => Number(p.price || 0)))) : 0;
  const minSelected = state.filters.minPrice !== "" ? Number(state.filters.minPrice) : null;
  const maxSelected = state.filters.maxPrice !== "" ? Number(state.filters.maxPrice) : null;
  const context = detectContext(selectedSub);
  const facetVisibility = resolveFacetVisibility(brandName, selectedSub, context);

  const items = bySub.filter((p) => {
    if (!productMatchesSearch(p, state.search)) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "brand"), selected.brands)) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "systemType"), selected.systemTypes)) return false;
    if (!matchesMultiAll(getFacetValue(brandName, selectedSub, p, "protocol"), selected.protocols)) return false;
    if (!matchesMulti(getFacetValue(brandName, selectedSub, p, "mounting"), selected.mountings)) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "supplyVoltage"), selected.supplyVoltages)) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "channels"), selected.channels)) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "nominalCurrent"), selected.nominalCurrents)) return false;
    if (!matchesSingle(getFacetValue(brandName, selectedSub, p, "nominalPower"), selected.nominalPowers)) return false;
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

  appEl.innerHTML = `
    ${pageTitle(brandName)}
    ${searchRow(state.search)}
    <section class="subcategory-grid">
      ${effectiveSubcategories.map((subcategory) => {
        const count = brandProducts.filter((p) => getBrandSubcategory(brandName, p) === subcategory).length;
        if (count === 0) return "";
        const active = selectedSub === subcategory ? "is-active" : "";
        return `<a class="subcategory-chip ${active}" href="#/brands/${brandSlug}/${subcategoryRouteToken(subcategory)}">${subcategory}</a>`;
      }).join("")}
    </section>
    <div class="grid-layout">
      <section class="product-grid">
        ${items.length ? items.map((product) => renderProductCardFn(product, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("") : '<div class="note">Товары не найдены</div>'}
      </section>
      <aside class="filters">
        <h4>Фильтры</h4>
        <fieldset class="filter-group">
          <legend>Цена, руб.</legend>
          <div class="price-row">
            <input class="input" id="brandMinPriceFilter" type="number" min="${minFacetPrice}" placeholder="от ${minFacetPrice}" value="${state.filters.minPrice}" />
            <input class="input" id="brandMaxPriceFilter" type="number" min="${minFacetPrice}" placeholder="до ${maxFacetPrice}" value="${state.filters.maxPrice}" />
          </div>
        </fieldset>
        
        ${facetVisibility.systemTypes && shouldShowFacetGroup(brandName, renderFacets.systemTypes, selected.systemTypes, allowSingleFacet) ? renderCheckGroup("Тип системы", "systemTypes", renderFacets.systemTypes, selected.systemTypes) : ""}
        ${facetVisibility.protocols && shouldShowFacetGroup(brandName, renderFacets.protocols, selected.protocols, allowSingleFacet) ? renderCheckGroup("Протокол", "protocols", renderFacets.protocols, selected.protocols) : ""}
        ${facetVisibility.mountings && shouldShowFacetGroup(brandName, renderFacets.mountings, selected.mountings, allowSingleFacet) ? renderCheckGroup("Монтаж", "mountings", renderFacets.mountings, selected.mountings) : ""}
        ${facetVisibility.supplyVoltages && shouldShowFacetGroup(brandName, renderFacets.supplyVoltages, selected.supplyVoltages, allowSingleFacet) ? renderCheckGroup("Напряжение питания", "supplyVoltages", renderFacets.supplyVoltages, selected.supplyVoltages) : ""}
        ${facetVisibility.channels && shouldShowFacetGroup(brandName, renderFacets.channels, selected.channels, allowSingleFacet) ? renderCheckGroup("Количество каналов", "channels", renderFacets.channels, selected.channels) : ""}
        ${facetVisibility.nominalCurrents && shouldShowFacetGroup(brandName, renderFacets.nominalCurrents, selected.nominalCurrents, allowSingleFacet) ? renderCheckGroup("Номинальный ток", "nominalCurrents", renderFacets.nominalCurrents, selected.nominalCurrents) : ""}
        ${facetVisibility.nominalPowers && shouldShowFacetGroup(brandName, renderFacets.nominalPowers, selected.nominalPowers, allowSingleFacet) ? renderCheckGroup("Номинальная мощность", "nominalPowers", renderFacets.nominalPowers, selected.nominalPowers) : ""}
        ${facetVisibility.sensorTypes && shouldShowFacetGroup(brandName, renderFacets.sensorTypes, selected.sensorTypes, allowSingleFacet) ? renderCheckGroup("Тип датчика", "sensorTypes", renderFacets.sensorTypes, selected.sensorTypes) : ""}
        ${facetVisibility.indoorOutdoor && shouldShowFacetGroup(brandName, renderFacets.indoorOutdoor, selected.indoorOutdoor, allowSingleFacet) ? renderCheckGroup("Внутренний / уличный", "indoorOutdoor", renderFacets.indoorOutdoor, selected.indoorOutdoor) : ""}
        ${facetVisibility.ipRatings && shouldShowFacetGroup(brandName, renderFacets.ipRatings, selected.ipRatings, allowSingleFacet) ? renderCheckGroup("Степень защиты IP", "ipRatings", renderFacets.ipRatings, selected.ipRatings) : ""}
        ${facetVisibility.ioCounts && shouldShowFacetGroup(brandName, renderFacets.ioCounts, selected.ioCounts, allowSingleFacet) ? renderCheckGroup("Входы / выходы", "ioCounts", renderFacets.ioCounts, selected.ioCounts) : ""}
        ${facetVisibility.webInterfaces && shouldShowFacetGroup(brandName, renderFacets.webInterfaces, selected.webInterfaces, allowSingleFacet) ? renderCheckGroup("Web-интерфейс", "webInterfaces", renderFacets.webInterfaces, selected.webInterfaces) : ""}
        ${facetVisibility.scenarioSupports && shouldShowFacetGroup(brandName, renderFacets.scenarioSupports, selected.scenarioSupports, allowSingleFacet) ? renderCheckGroup("Поддержка сценариев", "scenarioSupports", renderFacets.scenarioSupports, selected.scenarioSupports) : ""}
        ${facetVisibility.loadTypes && shouldShowFacetGroup(brandName, renderFacets.loadTypes, selected.loadTypes, allowSingleFacet) ? renderCheckGroup("Тип нагрузки", "loadTypes", renderFacets.loadTypes, selected.loadTypes) : ""}
        ${facetVisibility.maxLoads && shouldShowFacetGroup(brandName, renderFacets.maxLoads, selected.maxLoads, allowSingleFacet) ? renderCheckGroup("Максимальная нагрузка", "maxLoads", renderFacets.maxLoads, selected.maxLoads) : ""}
        <button class="button button-outline" id="brandResetFiltersBtn" type="button">Сбросить</button>
      </aside>
    </div>
  `;

  bindSearch();

  appEl.querySelectorAll("[data-filter-key]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.filterKey;
      if (!key || !Array.isArray(state.filters[key])) return;
      const value = input.value;
      if (input.checked) {
        if (!state.filters[key].includes(value)) state.filters[key].push(value);
      } else {
        state.filters[key] = state.filters[key].filter((x) => x !== value);
      }
      renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCardFn, bindSearch);
    });
  });

  const minPriceFilter = document.getElementById("brandMinPriceFilter");
  const maxPriceFilter = document.getElementById("brandMaxPriceFilter");
  const applyPrice = () => {
    state.filters.minPrice = minPriceFilter?.value?.trim?.() || "";
    state.filters.maxPrice = maxPriceFilter?.value?.trim?.() || "";
    renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCardFn, bindSearch);
  };
  if (minPriceFilter) minPriceFilter.addEventListener("change", applyPrice);
  if (maxPriceFilter) maxPriceFilter.addEventListener("change", applyPrice);

  const resetBtn = document.getElementById("brandResetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetFacetFilters(state.filters);
      renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCardFn, bindSearch);
    });
  }

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavorite(state, id);
      const active = isFavorite(state, id);
      btn.classList.toggle("is-active", active);
      btn.textContent = active ? "♥" : "♡";
    });
  });
}

export function getBrandsList(state) {
  return [...new Set(state.products.map((p) => p.brand || "").filter(isVisibleBrand))];
}

export function renderBrandsBlock(state, slugifyFn, imageTagFn) {
  const brands = getBrandsList(state);
  return `
    <h2 class="h1" style="margin-top: 3rem;">Бренды</h2>
    <div class="h1-line"></div>
    <section class="category-grid">
      ${brands
        .map(
          (brand) => `
        <a class="category-card" href="#/brands/${slugifyFn(brand)}">
          ${imageTagFn(getBrandLogo(brand), brand, getBrandLogoClass(brand), PLACEHOLDER_IMAGE)}
          <h3>${brand}</h3>
        </a>
      `
        )
        .join("")}
    </section>
  `;
}


