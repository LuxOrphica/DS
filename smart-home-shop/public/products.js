import { PRODUCT_TYPE_DICTIONARY, KNOWN_BRANDS, SPEC_KEY_TRANSLATIONS } from './config.js';
import { parseSpecsString, imageTag, formatPrice, normalizeVariantBaseName, splitBreadcrumbs, normText } from './utils.js';

function imagePriority(url) {
  const raw = String(url || "").trim();
  if (!raw) return -9999;
  const lower = raw.toLowerCase();
  let score = 0;

  if (lower.includes("/images/products/")) score += 120;
  // PDF-derived crops/schemes should be fallback-only.
  if (lower.includes("/images/larnitech_pdf/")) score -= 40;
  if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(lower)) score += 10;

  if (/(photo|main|hero|front|product|render)/i.test(lower)) score += 30;
  if (/(schema|scheme|wiring|diagram|pinout|connection|connect|чертеж|схем|подключ)/i.test(lower)) score -= 140;
  if (/(manual|instruction|datasheet|catalog|catalogue)/i.test(lower)) score -= 50;
  if (/\.svg(\?|$)/i.test(lower)) score -= 25;

  return score;
}

export function isSoftSourceImage(url) {
  return String(url || "").toLowerCase().includes("/images/larnitech_pdf/");
}

function isBadSoftSourceImage(url) {
  const lower = String(url || "").toLowerCase();
  // Known catalog-page scans that should not be used as product photo.
  return (
    lower.endsWith("/dw-r_p15.png") ||
    lower.endsWith("/dw-ls01_p61.png") ||
    lower.endsWith("/de-ip-cam_p65.png")
  );
}

function isPuckImage(url) {
  const lower = String(url || "").toLowerCase();
  return lower.includes("ww-htl.png");
}

function normalizeSourceImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  // Wiren Board often returns tiny _ipx thumbnails (e.g. h_120&q_70),
  // which become blurry in catalog cards. Request a larger transformed image.
  if (raw.includes("wirenboard.com/_ipx/")) {
    return raw.replace(/\/_ipx\/[^/]+\/\//i, "/_ipx/h_900&q_90&f_webp//");
  }
  return raw;
}

// Добавление иерархии к продукту
export function withHierarchy(product) {
  const crumbs = splitBreadcrumbs(product.breadcrumbs);
  const topCategory = crumbs[0] || product.category || "Без категории";
  const groupRaw = normText(product.group || product.group_name || "");
  
  let subCategory;
  if (crumbs.length > 1) {
    subCategory = crumbs[crumbs.length - 1];
  } else if (groupRaw && groupRaw !== topCategory) {
    if (groupRaw.includes("/")) {
      const tail = normText(groupRaw.split("/").pop());
      subCategory = tail || groupRaw;
    } else {
      subCategory = groupRaw;
    }
  } else {
    subCategory = topCategory;
  }
  
  return { ...product, topCategory, subCategory };
}

// Получение значения атрибута продукта
export function getAttributeValue(product, attrName) {
  const key = String(attrName || "").toLowerCase();
  const attrs = Array.isArray(product.attributes) ? product.attributes : [];
  const row = attrs.find((x) => String(x.name || "").toLowerCase() === key);
  return row ? normText(row.value) : "";
}

// Определение типа продукта
export function getProductType(product) {
  const fromAttr = getAttributeValue(product, "Тип товара") || getAttributeValue(product, "Назначение");
  if (fromAttr) return fromAttr;

  const name = String(product.name || "").toLowerCase();
  const found = PRODUCT_TYPE_DICTIONARY.find((x) => name.includes(x));
  if (found) return found[0].toUpperCase() + found.slice(1);
  return "Прочее";
}

// Определение бренда продукта
export function getProductBrand(product) {
  const fromAttr = getAttributeValue(product, "Бренд");
  if (fromAttr) return fromAttr;

  const name = normText(product.name);
  const lower = name.toLowerCase();
  for (const b of KNOWN_BRANDS) {
    if (lower.includes(b.toLowerCase())) {
      return b;
    }
  }

  const fallback = normText(product.brand);
  if (fallback && fallback.length <= 30 && !/[0-9]/.test(fallback)) return fallback;
  return "Без бренда";
}

// Извлечение изображений галереи
export function extractGalleryImages(product) {
  const urls = [];
  const fromGallery = Array.isArray(product.gallery) ? product.gallery : [];
  for (const url of fromGallery) {
    if (url) urls.push(normalizeSourceImageUrl(url));
  }
  if (product.image) urls.push(normalizeSourceImageUrl(product.image));

  const html = String(product.descriptionHtml || "");
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRegex.exec(html)) !== null) {
    if (m[1]) urls.push(normalizeSourceImageUrl(m[1]));
  }

  const attrs = Array.isArray(product.attributes) ? product.attributes : [];
  for (const attr of attrs) {
    const val = String(attr.value || "").trim();
    if (/^https?:\/\//i.test(val) && /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(val)) {
      urls.push(normalizeSourceImageUrl(val));
    }
  }

  const unique = [];
  const seen = new Set();
  for (const url of urls) {
    const key = String(url).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  const clean = unique.filter((src) => !isBadSoftSourceImage(src));
  const ranked = (clean.length ? clean : unique).slice();
  ranked.sort((a, b) => imagePriority(b) - imagePriority(a));
  return ranked.slice(0, 8);
}

export function pickPrimaryImage(product, placeholderImage, options = {}) {
  const ranked = extractGalleryImages(product);
  const allowSoftFallback = options && options.allowSoftFallback === true;
  const preferred = ranked.find((src) => !isSoftSourceImage(src));
  if (preferred) return preferred;
  if (allowSoftFallback) {
    const soft = ranked.find((src) => isSoftSourceImage(src) && !isBadSoftSourceImage(src));
    if (soft) return soft;
    return placeholderImage;
  }
  return placeholderImage;
}

// Получение вариантов продукта
export function getProductVariants(product, allProducts) {
  const base = normalizeVariantBaseName(product.name);
  if (!base) return [product];

  const variants = allProducts.filter((item) => {
    if (item.topCategory !== product.topCategory) return false;
    if (item.subCategory !== product.subCategory) return false;
    return normalizeVariantBaseName(item.name) === base;
  });

  const rows = variants.length ? variants : [product];
  const seen = new Set();
  return rows
    .filter((x) => {
      const id = String(x.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
}

// Получение строк характеристик
export function getSpecsRows(product) {
  function normalizeSpecKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.:;,]/g, "")
      .trim();
  }

  function normalizeSpecValue(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function isBrandKey(key) {
    return key === "бренд" || key === "brand";
  }

  function isManufacturerKey(key) {
    return key === "производитель" || key === "manufacturer" || key === "vendor";
  }

  function isFunctionKey(key) {
    return key.startsWith("функц") || key === "functions" || key === "function";
  }

  function dedupeRows(rows) {
    let brandValueNorm = "";
    for (const row of rows) {
      const key = normalizeSpecKey(Array.isArray(row) ? row[0] : "");
      if (!isBrandKey(key)) continue;
      brandValueNorm = normalizeSpecValue(Array.isArray(row) ? row[1] : "");
      if (brandValueNorm) break;
    }

    const out = [];
    const seen = new Set();
    for (const row of rows) {
      const key = normalizeSpecKey(Array.isArray(row) ? row[0] : "");
      const valueNorm = normalizeSpecValue(Array.isArray(row) ? row[1] : "");
      if (!key || seen.has(key)) continue;
      if (isFunctionKey(key)) continue;
      if (isManufacturerKey(key) && brandValueNorm && valueNorm && valueNorm === brandValueNorm) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }

  const base = [
    ["Артикул", product.article || "-"],
    ["Бренд", getProductBrand(product)],
    ["Группа", product.group || "Без группы"]
  ];

  if (Array.isArray(product.attributes) && product.attributes.length > 0) {
    return dedupeRows([...base, ...product.attributes.map((x) => [x.name, x.value])]);
  }

  const extra = [];
  let specsData = product.specs || "";
  
  // Пробуем распарсить как JSON
  if (specsData.trim().startsWith("{") || specsData.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(specsData);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([key, value]) => {
          const translatedKey = SPEC_KEY_TRANSLATIONS[key] || key;
          extra.push([translatedKey, String(value)]);
        });
      }
    } catch (e) {
      console.error('Error parsing specs data:', e);
      // Если парсинг не удался, используем старый способ
      parseSpecsString(specsData, extra);
    }
  } else {
    parseSpecsString(specsData, extra);
  }

  return dedupeRows([...base, ...extra]);
}

export function getFunctionRows(product) {
  const attrs = Array.isArray(product && product.attributes) ? product.attributes : [];
  const rows = [];
  const seen = new Set();

  function normKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.:;,]/g, "")
      .trim();
  }

  for (const a of attrs) {
    if (a && typeof a === "string") {
      const value = normText(a);
      if (!value) continue;
      const dedupeKey = value.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push(value);
      continue;
    }

    if (a && typeof a === "object") {
      const key = normKey(a.name);
      const value = normText(a.value);
      if (!value) continue;
      if (!(key.startsWith("функц") || key === "functions" || key === "function")) continue;
      const dedupeKey = value.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push(value);
    }
  }

  if (rows.length > 0) return rows;

  function pushUnique(line) {
    const v = normText(line);
    if (!v) return;
    if (v.length < 4) return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    rows.push(v);
  }

  const specsText = String(product && product.specs || "");
  const descText = String(product && product.description || "");
  const fallbackText = `${specsText}\n${descText}`;
  const lines = fallbackText
    .split(/\r?\n|[•·]/g)
    .map((x) => normText(x))
    .filter(Boolean);

  let inFunctionsBlock = false;
  for (const line of lines) {
    const l = line.toLowerCase();
    if (/^(функц|functions?)/.test(l)) {
      inFunctionsBlock = true;
      const tail = line.replace(/^(функц(?:ии)?|functions?)\s*[:\-]?\s*/i, "").trim();
      if (tail) {
        tail.split(/[;|]/g).forEach((part) => pushUnique(part));
      }
      continue;
    }
    if (inFunctionsBlock) {
      if (/^(параметр|характеристик|напряж|питание|тип|класс|габарит|масса)\b/i.test(l)) break;
      line.split(/[;|]/g).forEach((part) => pushUnique(part));
    }
  }

  return rows;
}

export function getUnifiedBrandSubcategory(product) {
  const allowed = new Set([
    "Контроллеры",
    "Реле и диммеры",
    "Датчики",
    "Термостаты",
    "Энергомониторинг",
    "РђСѓРґРёРѕ / Multiroom",
    "Аксессуары"
  ]);

  const stored = normText(product.brandSubcategory || "");
  if (allowed.has(stored)) return stored;

  const group = normText(product.group || "");
  const byGroup = group.includes("/")
    ? normText(group.split("/").pop())
    : group;
  if (allowed.has(byGroup)) return byGroup;

  const hay = [
    product.name,
    product.group,
    product.category,
    product.specs,
    ...(Array.isArray(product.attributes) ? product.attributes.flatMap((a) => [a.name, a.value]) : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(термостат|thermostat)\b/.test(hay)) return "Термостаты";
  if (/\b(датчик|sensor|сенсор|motion|pir)\b/.test(hay)) return "Датчики";
  if (/\b(контроллер|controller|gateway|сервер|plc)\b/.test(hay)) return "Контроллеры";
  if (/\b(реле|relay|диммер|dimmer)\b/.test(hay)) return "Реле и диммеры";
  if (/\b(энергомонитор|power meter|счетчик|meter|мониторинг)\b/.test(hay)) return "Энергомониторинг";
  if (/\b(audio|multiroom|мультирум|усилитель|amp|колонк)\b/.test(hay)) return "Аудио / Multiroom";
  return "Аксессуары";
}

// Создание карточки продукта
export function renderProductCard(product, isFavoriteFn, placeholderImage) {
  const imgSrc = pickPrimaryImage(product, placeholderImage, { allowSoftFallback: true });
  const isSoftSource = isSoftSourceImage(imgSrc);
  const isPuck = isPuckImage(imgSrc);
  return `
    <a class="product-card" href="#/product/${product.id}">
      ${product.is_extra ? '<div class="extra-badge" title="Лишний товар">⚠</div>' : ''}
      <button class="fav-card-btn ${isFavoriteFn(product.id) ? "is-active" : ""}" type="button" data-fav-toggle="${product.id}" aria-label="Избранное">${
        isFavoriteFn(product.id) ? "♥" : "♡"
      }</button>
      <div class="card-media ${isSoftSource ? "is-soft-source" : ""} ${isPuck ? "is-puck" : ""}">
        ${imageTag(imgSrc, product.name, "", placeholderImage)}
      </div>
      <h3>${product.name}</h3>
      <div class="note">Артикул: ${product.article || product.id || "-"}</div>
      <div class="price">${formatPrice(product.price)}${Number(product.price) > 0 ? " / шт" : ""}</div>
    </a>
  `;
}
