import { PRODUCT_TYPE_DICTIONARY, KNOWN_BRANDS, SPEC_KEY_TRANSLATIONS, FUNCTIONAL_CATEGORY_OVERRIDES } from './config.js';
import { parseSpecsString, imageTag, formatPrice, normalizeVariantBaseName, splitBreadcrumbs, normText, getProductPriceView } from './utils.js';

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
  if (/(schema|scheme|wiring|diagram|pinout|connection|connect|\u0421\u2021\u0420\u00b5\u0421\u0402\u0421\u201a\u0420\u00b5\u0420\u00b6|\u0421\u0403\u0421\u2026\u0420\u00b5\u0420\u0458|\u0420\u0457\u0420\u0455\u0420\u0491\u0420\u0454\u0420\u00bb\u0421\u040b\u0421\u2021)/i.test(lower)) score -= 140;
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

// \u0420\u201d\u0420\u0455\u0420\u00b1\u0420\u00b0\u0420\u0406\u0420\u00bb\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5 \u0420\u0451\u0420\u00b5\u0421\u0402\u0420\u00b0\u0421\u0402\u0421\u2026\u0420\u0451\u0420\u0451 \u0420\u0454 \u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0491\u0421\u0453\u0420\u0454\u0421\u201a\u0421\u0453
export function withHierarchy(product) {
  const crumbs = splitBreadcrumbs(product.breadcrumbs);
  const overrideById = FUNCTIONAL_CATEGORY_OVERRIDES && FUNCTIONAL_CATEGORY_OVERRIDES.byId
    ? FUNCTIONAL_CATEGORY_OVERRIDES.byId
    : {};
  const overrideByArticle = FUNCTIONAL_CATEGORY_OVERRIDES && FUNCTIONAL_CATEGORY_OVERRIDES.byArticle
    ? FUNCTIONAL_CATEGORY_OVERRIDES.byArticle
    : {};
  const productId = String(product.id || "").trim();
  const article = String(product.article || "").trim();
  const normalizedTop = normText(product.commercialGroup || product.commercial_group || "");
  const normalizedSub = normText(product.commercialSubgroup || product.commercial_subgroup || "");
  const forcedTopCategory = normText(
    overrideById[productId] ||
    overrideByArticle[article] ||
    ""
  );
  const categoryField = forcedTopCategory || normalizedTop || normText(product.topCategory || product.category || "");
  const crumbTop = normText(crumbs[0] || "");
  const topCategory = categoryField || crumbTop || "Без категории";
  const groupRaw = normalizedSub || normText(product.group || product.group_name || "");
  const subField = normText(
    normalizedSub || product.subCategory || product.subcategory || product.brandSubcategory || product.brand_subcategory || ""
  );
  
  let subCategory;
  if (subField && subField.toLowerCase() !== topCategory.toLowerCase()) {
    subCategory = subField;
  } else if (crumbs.length > 1) {
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

// \u0420\u045f\u0420\u0455\u0420\u00bb\u0421\u0453\u0421\u2021\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5 \u0420\u00b7\u0420\u0405\u0420\u00b0\u0421\u2021\u0420\u00b5\u0420\u0405\u0420\u0451\u0421\u040f \u0420\u00b0\u0421\u201a\u0421\u0402\u0420\u0451\u0420\u00b1\u0421\u0453\u0421\u201a\u0420\u00b0 \u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0491\u0421\u0453\u0420\u0454\u0421\u201a\u0420\u00b0
export function getAttributeValue(product, attrName) {
  const key = String(attrName || "").toLowerCase();
  const attrs = Array.isArray(product.attributes) ? product.attributes : [];
  const row = attrs.find((x) => String(x.name || "").toLowerCase() === key);
  return row ? normText(row.value) : "";
}

// \u0420\u045b\u0420\u0457\u0421\u0402\u0420\u00b5\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5 \u0421\u201a\u0420\u0451\u0420\u0457\u0420\u00b0 \u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0491\u0421\u0453\u0420\u0454\u0421\u201a\u0420\u00b0
export function getProductType(product) {
  const fromAttr = getAttributeValue(product, "\u0420\u045e\u0420\u0451\u0420\u0457 \u0421\u201a\u0420\u0455\u0420\u0406\u0420\u00b0\u0421\u0402\u0420\u00b0") || getAttributeValue(product, "\u0420\u045c\u0420\u00b0\u0420\u00b7\u0420\u0405\u0420\u00b0\u0421\u2021\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5");
  if (fromAttr) return fromAttr;

  const name = String(product.name || "").toLowerCase();
  const found = PRODUCT_TYPE_DICTIONARY.find((x) => name.includes(x));
  if (found) return found[0].toUpperCase() + found.slice(1);
  return "\u0420\u045f\u0421\u0402\u0420\u0455\u0421\u2021\u0420\u00b5\u0420\u00b5";
}

// \u0420\u045b\u0420\u0457\u0421\u0402\u0420\u00b5\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5 \u0420\u00b1\u0421\u0402\u0420\u00b5\u0420\u0405\u0420\u0491\u0420\u00b0 \u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0491\u0421\u0453\u0420\u0454\u0421\u201a\u0420\u00b0
export function getProductBrand(product) {
  const fromAttr = getAttributeValue(product, "\u0420\u2018\u0421\u0402\u0420\u00b5\u0420\u0405\u0420\u0491");
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
  return "\u0411\u0435\u0437 \u0431\u0440\u0435\u043d\u0434\u0430";
}

export function getProductCountry(product) {
  const keys = [
    "\u0421\u0442\u0440\u0430\u043d\u0430",
    "Country",
    "Country of origin",
    "Origin country",
    "\u0421\u0442\u0440\u0430\u043d\u0430 \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0430"
  ];
  for (const key of keys) {
    const value = getAttributeValue(product, key);
    if (value) return value;
  }
  const direct = normText(product.country || product.originCountry || product.origin_country || "");
  if (direct) return direct;

  const brand = String(getProductBrand(product) || "").toLowerCase().trim();
  if (brand.includes("hite") && brand.includes("pro")) return "\u0420\u043e\u0441\u0441\u0438\u044f";
  if (brand.includes("wiren")) return "\u0420\u043e\u0441\u0441\u0438\u044f";
  if (brand.includes("loxone")) return "\u0410\u0432\u0441\u0442\u0440\u0438\u044f";
  if (brand.includes("larnitech")) return "\u0413\u0435\u0440\u043c\u0430\u043d\u0438\u044f";
  return "";
}

// \u0420\u0098\u0420\u00b7\u0420\u0406\u0420\u00bb\u0420\u00b5\u0421\u2021\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5 \u0420\u0451\u0420\u00b7\u0420\u0455\u0420\u00b1\u0421\u0402\u0420\u00b0\u0420\u00b6\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u2116 \u0420\u0456\u0420\u00b0\u0420\u00bb\u0420\u00b5\u0421\u0402\u0420\u00b5\u0420\u0451
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

// \u0420\u045f\u0420\u0455\u0420\u00bb\u0421\u0453\u0421\u2021\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5 \u0420\u0406\u0420\u00b0\u0421\u0402\u0420\u0451\u0420\u00b0\u0420\u0405\u0421\u201a\u0420\u0455\u0420\u0406 \u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0491\u0421\u0453\u0420\u0454\u0421\u201a\u0420\u00b0
export function getProductVariants(product, allProducts) {
  const isActive = (status) => {
    const s = String(status || "active").trim().toLowerCase();
    return s === "" || s === "active";
  };

  const base = normalizeVariantBaseName(product.name);
  if (!base) return [product];

  const variants = allProducts.filter((item) => {
    if (item.topCategory !== product.topCategory) return false;
    if (item.subCategory !== product.subCategory) return false;
    if (!isActive(item.status)) return false;
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

// \u0420\u045f\u0420\u0455\u0420\u00bb\u0421\u0453\u0421\u2021\u0420\u00b5\u0420\u0405\u0420\u0451\u0420\u00b5 \u0421\u0403\u0421\u201a\u0421\u0402\u0420\u0455\u0420\u0454 \u0421\u2026\u0420\u00b0\u0421\u0402\u0420\u00b0\u0420\u0454\u0421\u201a\u0420\u00b5\u0421\u0402\u0420\u0451\u0421\u0403\u0421\u201a\u0420\u0451\u0420\u0454
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
    return key === "\u0420\u00b1\u0421\u0402\u0420\u00b5\u0420\u0405\u0420\u0491" || key === "brand";
  }

  function isManufacturerKey(key) {
    return key === "\u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0451\u0420\u00b7\u0420\u0406\u0420\u0455\u0420\u0491\u0420\u0451\u0421\u201a\u0420\u00b5\u0420\u00bb\u0421\u040a" || key === "manufacturer" || key === "vendor";
  }

  function isFunctionKey(key) {
    return key.startsWith("\u0421\u201e\u0421\u0453\u0420\u0405\u0420\u0454\u0421\u2020") || key === "functions" || key === "function";
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
    ["\u0410\u0440\u0442\u0438\u043a\u0443\u043b", product.article || "-"],
    ["\u0411\u0440\u0435\u043d\u0434", getProductBrand(product)],
    ["\u0421\u0442\u0440\u0430\u043d\u0430", getProductCountry(product) || "-"],
    ["\u0413\u0440\u0443\u043f\u043f\u0430", product.group || "\u0411\u0435\u0437 \u0433\u0440\u0443\u043f\u043f\u044b"]
  ];

  if (Array.isArray(product.attributes) && product.attributes.length > 0) {
    return dedupeRows([...base, ...product.attributes.map((x) => [x.name, x.value])]);
  }

  const extra = [];
  let specsData = product.specs || "";
  
  // \u0420\u045f\u0421\u0402\u0420\u0455\u0420\u00b1\u0421\u0453\u0420\u00b5\u0420\u0458 \u0421\u0402\u0420\u00b0\u0421\u0403\u0420\u0457\u0420\u00b0\u0421\u0402\u0421\u0403\u0420\u0451\u0421\u201a\u0421\u040a \u0420\u0454\u0420\u00b0\u0420\u0454 JSON
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
      // \u0420\u2022\u0421\u0403\u0420\u00bb\u0420\u0451 \u0420\u0457\u0420\u00b0\u0421\u0402\u0421\u0403\u0420\u0451\u0420\u0405\u0420\u0456 \u0420\u0405\u0420\u00b5 \u0421\u0453\u0420\u0491\u0420\u00b0\u0420\u00bb\u0421\u0403\u0421\u040f, \u0420\u0451\u0421\u0403\u0420\u0457\u0420\u0455\u0420\u00bb\u0421\u040a\u0420\u00b7\u0421\u0453\u0420\u00b5\u0420\u0458 \u0421\u0403\u0421\u201a\u0420\u00b0\u0421\u0402\u0421\u2039\u0420\u2116 \u0421\u0403\u0420\u0457\u0420\u0455\u0421\u0403\u0420\u0455\u0420\u00b1
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
      if (!(key.startsWith("\u0421\u201e\u0421\u0453\u0420\u0405\u0420\u0454\u0421\u2020") || key === "functions" || key === "function")) continue;
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
    .split(/\r?\n|[\u0432\u0402\u045e\u0412\u00b7]/g)
    .map((x) => normText(x))
    .filter(Boolean);

  let inFunctionsBlock = false;
  for (const line of lines) {
    const l = line.toLowerCase();
    if (/^(\u0421\u201e\u0421\u0453\u0420\u0405\u0420\u0454\u0421\u2020|functions?)/.test(l)) {
      inFunctionsBlock = true;
      const tail = line.replace(/^(\u0421\u201e\u0421\u0453\u0420\u0405\u0420\u0454\u0421\u2020(?:\u0420\u0451\u0420\u0451)?|functions?)\s*[:\-]?\s*/i, "").trim();
      if (tail) {
        tail.split(/[;|]/g).forEach((part) => pushUnique(part));
      }
      continue;
    }
    if (inFunctionsBlock) {
      if (/^(\u0420\u0457\u0420\u00b0\u0421\u0402\u0420\u00b0\u0420\u0458\u0420\u00b5\u0421\u201a\u0421\u0402|\u0421\u2026\u0420\u00b0\u0421\u0402\u0420\u00b0\u0420\u0454\u0421\u201a\u0420\u00b5\u0421\u0402\u0420\u0451\u0421\u0403\u0421\u201a\u0420\u0451\u0420\u0454|\u0420\u0405\u0420\u00b0\u0420\u0457\u0421\u0402\u0421\u040f\u0420\u00b6|\u0420\u0457\u0420\u0451\u0421\u201a\u0420\u00b0\u0420\u0405\u0420\u0451\u0420\u00b5|\u0421\u201a\u0420\u0451\u0420\u0457|\u0420\u0454\u0420\u00bb\u0420\u00b0\u0421\u0403\u0421\u0403|\u0420\u0456\u0420\u00b0\u0420\u00b1\u0420\u00b0\u0421\u0402\u0420\u0451\u0421\u201a|\u0420\u0458\u0420\u00b0\u0421\u0403\u0421\u0403\u0420\u00b0)\b/i.test(l)) break;
      line.split(/[;|]/g).forEach((part) => pushUnique(part));
    }
  }

  return rows;
}

export function getUnifiedBrandSubcategory(product) {
  const allowed = new Set([
    "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u043b\u0435\u0440\u044b",
    "\u0420\u0435\u043b\u0435 \u0438 \u0434\u0438\u043c\u043c\u0435\u0440\u044b",
    "\u0414\u0430\u0442\u0447\u0438\u043a\u0438",
    "\u0422\u0435\u0440\u043c\u043e\u0441\u0442\u0430\u0442\u044b",
    "\u042d\u043d\u0435\u0440\u0433\u043e\u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433",
    "\u0410\u0443\u0434\u0438\u043e / Multiroom",
    "\u0410\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u044b"
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

  if (/\b(\u0442\u0435\u0440\u043c\u043e\u0441\u0442\u0430\u0442|thermostat)\b/.test(hay)) return "\u0422\u0435\u0440\u043c\u043e\u0441\u0442\u0430\u0442\u044b";
  if (/\b(\u0434\u0430\u0442\u0447\u0438\u043a|sensor|\u0441\u0435\u043d\u0441\u043e\u0440|motion|pir)\b/.test(hay)) return "\u0414\u0430\u0442\u0447\u0438\u043a\u0438";
  if (/\b(\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u043b\u0435\u0440|controller|gateway|\u0441\u0435\u0440\u0432\u0435\u0440|plc)\b/.test(hay)) return "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u043b\u0435\u0440\u044b";
  if (/\b(\u0440\u0435\u043b\u0435|relay|\u0434\u0438\u043c\u043c\u0435\u0440|dimmer)\b/.test(hay)) return "\u0420\u0435\u043b\u0435 \u0438 \u0434\u0438\u043c\u043c\u0435\u0440\u044b";
  if (/\b(\u044d\u043d\u0435\u0440\u0433\u043e\u043c\u043e\u043d\u0438\u0442\u043e\u0440|power meter|\u0441\u0447\u0435\u0442\u0447\u0438\u043a|meter|\u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433)\b/.test(hay)) return "\u042d\u043d\u0435\u0440\u0433\u043e\u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433";
  if (/\b(audio|multiroom|\u043c\u0443\u043b\u044c\u0442\u0438\u0440\u0443\u043c|\u0443\u0441\u0438\u043b\u0438\u0442\u0435\u043b\u044c|amp|\u043a\u043e\u043b\u043e\u043d\u043a)\b/.test(hay)) return "\u0410\u0443\u0434\u0438\u043e / Multiroom";
  return "\u0410\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u044b";
}

// Render storefront product card
export function renderProductCard(product, isFavoriteFn, placeholderImage) {
  const imgSrc = pickPrimaryImage(product, placeholderImage, { allowSoftFallback: true });
  const gallery = extractGalleryImages(product);
  const gallerySlides = gallery.length ? gallery : [imgSrc];
  const hasGallery = gallerySlides.length > 1;
  const isSoftSource = isSoftSourceImage(imgSrc);
  const isPuck = isPuckImage(imgSrc);
  const isDwHto7Preview = String(imgSrc || "")
    .toLowerCase()
    .includes("/images/larnitech_pdf/dw-hto7_p58.png");
  const brand = getProductBrand(product);
  const brandKey = String(brand || "").toLowerCase();
  const isLoxone = brandKey.includes("loxone");
  const isWirenBoard = brandKey.includes("wiren");
  const country = getProductCountry(product);
  const cardMeta = country ? `${brand} &middot; ${country}` : brand;
  const mediaClass = [
    "card-media",
    isSoftSource ? "is-soft-source" : "",
    isPuck ? "is-puck" : "",
    isDwHto7Preview ? "is-dw-hto7-preview" : "",
    isLoxone ? "is-loxone" : "",
    isWirenBoard ? "is-wiren" : "",
    brandKey.includes("larnitech") ? "is-larnitech" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const priceView = getProductPriceView(product);
  const cartQty = Number(product?.cartQty || 0);
  return `
    <a class="product-card" href="#/product/${product.id}" data-gallery-size="${gallerySlides.length}" data-gallery-index="0">
      ${product.is_extra ? '<div class="extra-badge" title="\u0420\u203a\u0420\u0451\u0421\u20ac\u0420\u0405\u0420\u0451\u0420\u2116 \u0421\u201a\u0420\u0455\u0420\u0406\u0420\u00b0\u0421\u0402">\u0432\u0459\u00a0</div>' : ''}
      <button class="fav-card-btn ${isFavoriteFn(product.id) ? "is-active" : ""}" type="button" data-fav-toggle="${product.id}" aria-label="Favorite">${
        isFavoriteFn(product.id)
          ? '<i class="fa-solid fa-heart" aria-hidden="true"></i>'
          : '<i class="fa-regular fa-heart" aria-hidden="true"></i>'
      }</button>
      <div class="${mediaClass}" data-media-brand="${brandKey}">
        <button class="card-buy-btn" type="button" data-card-buy="${product.id}" aria-label="Buy" title="Buy">
          <i class="fa-solid fa-cart-plus" aria-hidden="true"></i>
          <span class="card-buy-badge ${cartQty > 0 ? "" : "is-empty"}" data-card-buy-badge>${cartQty}</span>
        </button>
        <div class="card-media-track" data-card-gallery-track>
          ${gallerySlides
            .map(
              (src, index) => `
                <div class="card-media-slide ${index === 0 ? "is-active" : ""}">
                  ${imageTag(src, product.name, "", placeholderImage)}
                </div>
              `
            )
            .join("")}
        </div>
        ${hasGallery
          ? `
            <div class="card-media-dots" data-card-gallery-dots>
              ${gallerySlides
                .map(
                  (_, index) => `
                    <button
                      class="card-media-dot ${index === 0 ? "is-active" : ""}"
                      type="button"
                      data-card-gallery-dot="${index}"
                      aria-label="Show image ${index + 1}"
                    ></button>
                  `
                )
                .join("")}
            </div>
          `
          : ""}
      </div>
      <h3>${product.name}</h3>
      <div class="note card-meta">${cardMeta}</div>
      <div class="price">
        <span class="price-main">${priceView.main}</span>
        ${priceView.approxRub ? `<span class="price-approx">${priceView.approxRub}</span>` : ""}
      </div>
    </a>
  `;
}

export function bindProductCardGalleries(rootEl = document) {
  const root = rootEl || document;
  root.querySelectorAll(".product-card[data-gallery-size]").forEach((card) => {
    const size = Number(card.dataset.gallerySize || 0);
    if (!Number.isFinite(size) || size < 2) return;
    if (card.dataset.galleryBound === "1") return;

    const track = card.querySelector("[data-card-gallery-track]");
    const slides = Array.from(card.querySelectorAll(".card-media-slide"));
    const dots = Array.from(card.querySelectorAll("[data-card-gallery-dot]"));
    const media = card.querySelector(".card-media");
    if (!track || !media || dots.length < 2 || slides.length < 2) return;

    let index = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchDeltaX = 0;
    let touchDeltaY = 0;
    let touchActive = false;
    let swallowCardClick = false;

    const setIndex = (next) => {
      const clamped = Math.max(0, Math.min(size - 1, Number(next) || 0));
      index = clamped;
      card.dataset.galleryIndex = String(index);
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle("is-active", slideIndex === index);
      });
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
      });
    };

    dots.forEach((dot) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const dotIndex = Number(dot.dataset.cardGalleryDot || 0);
        setIndex(dotIndex);
      });
    });

    media.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) {
          touchActive = false;
          return;
        }
        if (event.target.closest("[data-card-buy], [data-fav-toggle], [data-card-gallery-dot]")) {
          touchActive = false;
          return;
        }
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchDeltaX = 0;
        touchDeltaY = 0;
        touchActive = true;
      },
      { passive: true }
    );

    media.addEventListener(
      "touchmove",
      (event) => {
        if (!touchActive || event.touches.length !== 1) return;
        const touch = event.touches[0];
        touchDeltaX = touch.clientX - touchStartX;
        touchDeltaY = touch.clientY - touchStartY;
      },
      { passive: true }
    );

    media.addEventListener(
      "touchend",
      () => {
        if (!touchActive) return;
        touchActive = false;
        const horizontal = Math.abs(touchDeltaX);
        const vertical = Math.abs(touchDeltaY);
        if (horizontal < 32 || horizontal <= vertical) return;
        if (touchDeltaX < 0) setIndex(index + 1);
        else setIndex(index - 1);
        swallowCardClick = true;
        setTimeout(() => {
          swallowCardClick = false;
        }, 250);
      },
      { passive: true }
    );

    card.addEventListener(
      "click",
      (event) => {
        if (!swallowCardClick) return;
        if (event.target.closest("[data-card-buy], [data-fav-toggle], [data-card-gallery-dot]")) return;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    card.dataset.galleryBound = "1";
    setIndex(0);
  });
}

function clampScale(value) {
  return Math.max(0.78, Math.min(1.85, Number(value) || 1));
}

function pickScaleForCardMedia(brandKey, ratio) {
  const brand = String(brandKey || "").toLowerCase();
  const r = Number(ratio) || 1;
  let scale = 1;

  if (brand.includes("loxone")) {
    if (r < 0.5) scale = 1.85;
    else if (r < 0.75) scale = 1.72;
    else if (r < 0.95) scale = 1.52;
    else scale = 1.28;
    return clampScale(scale);
  }

  if (brand.includes("larnitech")) {
    if (r >= 0.9 && r <= 1.12) scale = 0.76;
    else if (r > 1.12) scale = 0.82;
    else scale = 0.86;
    return clampScale(scale);
  }

  if (brand.includes("wiren")) {
    if (r < 0.62) scale = 1.2;
    else if (r > 1.2) scale = 0.9;
    else scale = 0.96;
    return clampScale(scale);
  }

  if (r < 0.55) scale = 1.34;
  else if (r < 0.72) scale = 1.2;
  else if (r > 1.35) scale = 0.9;
  return clampScale(scale);
}

function applyCardMediaScale(img) {
  if (!img || !img.closest) return;
  const media = img.closest(".card-media");
  if (!media) return;
  const width = Number(img.naturalWidth) || 0;
  const height = Number(img.naturalHeight) || 0;
  if (width <= 0 || height <= 0) return;
  const brand = String(media.dataset.mediaBrand || "");
  const ratio = width / height;
  const scale = pickScaleForCardMedia(brand, ratio);
  media.style.setProperty("--card-media-scale", String(scale));
}

const CARD_MEDIA_BG_DEFAULT = "rgb(255, 255, 255)";
const CARD_MEDIA_BG_CACHE = new Map();
const CARD_MEDIA_BG_PENDING = new Map();

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function rgbCss(r, g, b) {
  const rr = Math.max(0, Math.min(255, Math.round(Number(r) || 0)));
  const gg = Math.max(0, Math.min(255, Math.round(Number(g) || 0)));
  const bb = Math.max(0, Math.min(255, Math.round(Number(b) || 0)));
  return `rgb(${rr}, ${gg}, ${bb})`;
}

function samplePerimeterPixels(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(1, Math.round(Math.min(width, height) / 48));
  const depth = Math.max(1, Math.round(Math.min(width, height) * 0.06));
  const points = [];

  const pushAt = (x, y, edge) => {
    const xi = Math.max(0, Math.min(width - 1, x));
    const yi = Math.max(0, Math.min(height - 1, y));
    const offset = (yi * width + xi) * 4;
    points.push({
      r: data[offset],
      g: data[offset + 1],
      b: data[offset + 2],
      a: data[offset + 3],
      edge
    });
  };

  for (let d = 0; d < depth; d += 1) {
    for (let x = 0; x < width; x += step) {
      pushAt(x, d, "top");
      pushAt(x, height - 1 - d, "bottom");
    }
    for (let y = 0; y < height; y += step) {
      pushAt(d, y, "left");
      pushAt(width - 1 - d, y, "right");
    }
  }
  return points;
}

function pickMediaBackgroundColor(samples) {
  const sideSamples = samples.filter((p) => p.edge === "left" || p.edge === "right");
  const source = sideSamples.length >= 12 ? sideSamples : samples;
  const opaque = source.filter((p) => Number(p.a) >= 190);
  if (opaque.length < 8) return CARD_MEDIA_BG_DEFAULT;

  let pureWhiteCount = 0;
  const candidates = [];
  for (const p of opaque) {
    const max = Math.max(p.r, p.g, p.b);
    const min = Math.min(p.r, p.g, p.b);
    const diff = max - min;
    const luma = 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
    const pureWhite = luma >= 250 && diff <= 8;
    const pureBlack = luma <= 10 && diff <= 10;
    if (pureWhite) pureWhiteCount += 1;
    if (!pureWhite && !pureBlack) candidates.push(p);
  }

  const pureWhiteRatio = pureWhiteCount / opaque.length;
  if (pureWhiteRatio >= 0.82) return CARD_MEDIA_BG_DEFAULT;

  const pool = candidates.length >= 10 ? candidates : opaque;
  if (!pool.length) return CARD_MEDIA_BG_DEFAULT;

  const medR = median(pool.map((p) => p.r));
  const medG = median(pool.map((p) => p.g));
  const medB = median(pool.map((p) => p.b));
  const maxDistanceSq = 72 * 72;
  const denoised = pool.filter((p) => {
    const dr = p.r - medR;
    const dg = p.g - medG;
    const db = p.b - medB;
    return (dr * dr + dg * dg + db * db) <= maxDistanceSq;
  });
  const finalPool = denoised.length >= 6 ? denoised : pool;
  const lumas = finalPool
    .map((p) => (0.2126 * p.r) + (0.7152 * p.g) + (0.0722 * p.b))
    .sort((a, b) => a - b);
  const lightCutoff = lumas[Math.max(0, Math.floor((lumas.length - 1) * 0.85))];
  const brightnessTrimmed = finalPool.filter((p) => {
    const l = (0.2126 * p.r) + (0.7152 * p.g) + (0.0722 * p.b);
    return l <= lightCutoff;
  });
  const avgPool = brightnessTrimmed.length >= 6 ? brightnessTrimmed : finalPool;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (const p of avgPool) {
    sumR += p.r;
    sumG += p.g;
    sumB += p.b;
  }
  const avgR = sumR / avgPool.length;
  const avgG = sumG / avgPool.length;
  const avgB = sumB / avgPool.length;
  const avgMax = Math.max(avgR, avgG, avgB);
  const avgMin = Math.min(avgR, avgG, avgB);
  const avgDiff = avgMax - avgMin;
  const avgLuma = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;
  // Keep truly white backgrounds white; keep light neutral gray as gray.
  if (avgLuma >= 252 && avgDiff <= 7) return CARD_MEDIA_BG_DEFAULT;
  return rgbCss(avgR, avgG, avgB);
}

function getCardMediaImageKey(img) {
  const raw = String(img?.currentSrc || img?.getAttribute?.("src") || "").trim();
  return raw || "";
}

function setCardMediaBackground(media, color) {
  const next = String(color || CARD_MEDIA_BG_DEFAULT);
  media.style.setProperty("--card-media-bg", next);
}

function computeCardMediaBackgroundFromImage(img) {
  const width = Number(img?.naturalWidth) || 0;
  const height = Number(img?.naturalHeight) || 0;
  if (width < 2 || height < 2) return CARD_MEDIA_BG_DEFAULT;

  const maxSide = 110;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvasWidth = Math.max(8, Math.round(width * scale));
  const canvasHeight = Math.max(8, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return CARD_MEDIA_BG_DEFAULT;

  try {
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
    const samples = samplePerimeterPixels(ctx, canvasWidth, canvasHeight);
    return pickMediaBackgroundColor(samples);
  } catch {
    return CARD_MEDIA_BG_DEFAULT;
  }
}

function applyCardMediaBackgroundFromImage(img) {
  if (!img || !img.closest) return;
  const media = img.closest(".card-media");
  if (!media) return;

  const key = getCardMediaImageKey(img);
  if (!key) {
    setCardMediaBackground(media, CARD_MEDIA_BG_DEFAULT);
    return;
  }
  if (CARD_MEDIA_BG_CACHE.has(key)) {
    setCardMediaBackground(media, CARD_MEDIA_BG_CACHE.get(key));
    return;
  }

  let pending = CARD_MEDIA_BG_PENDING.get(key);
  if (!pending) {
    pending = Promise.resolve().then(() => {
      const color = computeCardMediaBackgroundFromImage(img);
      CARD_MEDIA_BG_CACHE.set(key, color);
      CARD_MEDIA_BG_PENDING.delete(key);
      return color;
    });
    CARD_MEDIA_BG_PENDING.set(key, pending);
  }
  pending
    .then((color) => setCardMediaBackground(media, color))
    .catch(() => setCardMediaBackground(media, CARD_MEDIA_BG_DEFAULT));
}

function bindCardMediaLoadingState(rootEl = document) {
  const root = rootEl || document;
  root.querySelectorAll(".product-card .card-media").forEach((media) => {
    media.classList.add("is-loading");
    media.classList.remove("is-loaded");
    setCardMediaBackground(media, CARD_MEDIA_BG_DEFAULT);
  });
  root.querySelectorAll(".product-card .card-media img").forEach((img) => {
    const media = img.closest(".card-media");
    if (!media) return;
    const markLoaded = () => {
      media.classList.remove("is-loading");
      media.classList.add("is-loaded");
      applyCardMediaBackgroundFromImage(img);
    };
    if (img.complete && Number(img.naturalWidth) > 0) {
      markLoaded();
      return;
    }
    if (img.dataset.mediaLoadingStateBound === "1") return;
    img.dataset.mediaLoadingStateBound = "1";
    img.addEventListener("load", markLoaded, { once: true });
  });
}

function prioritizeDesktopAboveFoldImages(rootEl = document) {
  if (typeof window === "undefined") return;
  if (window.innerWidth < 1024) return;

  const root = rootEl || document;
  const cards = Array.from(root.querySelectorAll(".product-card")).slice(0, 8);
  cards.forEach((card) => {
    const img = card.querySelector(".card-media-slide img, .card-media img");
    if (!img) return;
    img.setAttribute("loading", "eager");
    img.setAttribute("fetchpriority", "high");
    img.setAttribute("decoding", "async");
    card.dataset.priorityImage = "1";
  });
}

export function rebalanceProductCardMedia(rootEl = document) {
  const root = rootEl || document;
  bindCardMediaLoadingState(root);
  root.querySelectorAll(".product-card .card-media img").forEach((img) => {
    if (img.complete) {
      applyCardMediaScale(img);
      return;
    }
    if (img.dataset.mediaScaleBound === "1") return;
    img.dataset.mediaScaleBound = "1";
    img.addEventListener("load", () => applyCardMediaScale(img), { once: true });
  });
  prioritizeDesktopAboveFoldImages(root);
}

