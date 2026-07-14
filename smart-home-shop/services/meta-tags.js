"use strict";

// Автогенерация метатегов из данных БД.
// Чистый модуль без I/O: на вход — товар/страница, на выходе — строка <head>.
// Цель: адекватные рынку метатеги + Open Graph + Schema.org (лучшие практики),
// генерируемые на каждый запрос, чтобы цена и наличие всегда были свежими.

const SITE = {
  name: "Делаем сети",
  // Дефолтная картинка для соцсетей (1200x630). Заменить на реальную при наличии.
  defaultImage: "/og-image-main.png",
  locale: "ru_RU"
};

// Ограничения по лучшим практикам (символы).
const TITLE_MAX = 60;
const DESC_MAX = 160;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Экранирование для значений внутри JSON-LD (JSON.stringify уже даёт валидный JSON;
// дополнительно закрываем </script> чтобы не разорвать тег).
function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function stripHtml(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Обрезка по границе слова с многоточием.
function truncate(value, max) {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s.,;:!-]+$/, "") + "…";
}

function clampTitle(value) {
  const text = stripHtml(value);
  return text.length <= TITLE_MAX ? text : truncate(text, TITLE_MAX);
}

function absUrl(baseUrl, pathOrUrl) {
  const val = String(pathOrUrl || "").trim();
  if (!val) return "";
  if (/^https?:\/\//i.test(val)) return val;
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return base + (val.startsWith("/") ? val : "/" + val);
}

// Рублёвая цена: 1 033 252 ₽ (пробел-разделитель тысяч, без копеек).
function formatRub(value) {
  const num = Math.round(Number(value) || 0);
  return num.toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
}

// Сборка блока <head> из готовых полей.
function buildHead(meta) {
  const {
    title,
    description,
    canonical,
    image,
    imageAlt,
    ogType = "website",
    extra = [],
    jsonLd = null
  } = meta;

  const lines = [];
  lines.push(`<title>${escapeHtml(title)}</title>`);
  lines.push(`<meta name="description" content="${escapeHtml(description)}" />`);
  if (canonical) lines.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  lines.push(`<meta name="robots" content="index, follow" />`);

  // Open Graph
  lines.push(`<meta property="og:site_name" content="${escapeHtml(SITE.name)}" />`);
  lines.push(`<meta property="og:locale" content="${SITE.locale}" />`);
  lines.push(`<meta property="og:type" content="${ogType}" />`);
  lines.push(`<meta property="og:title" content="${escapeHtml(title)}" />`);
  lines.push(`<meta property="og:description" content="${escapeHtml(description)}" />`);
  if (canonical) lines.push(`<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  if (image) {
    lines.push(`<meta property="og:image" content="${escapeHtml(image)}" />`);
    lines.push(`<meta property="og:image:width" content="1200" />`);
    lines.push(`<meta property="og:image:height" content="630" />`);
    if (imageAlt) lines.push(`<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />`);
  }

  // Twitter
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  lines.push(`<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  if (image) lines.push(`<meta name="twitter:image" content="${escapeHtml(image)}" />`);

  for (const tag of extra) lines.push(tag);

  if (jsonLd) {
    lines.push(`<script type="application/ld+json">${jsonLdSafe(jsonLd)}</script>`);
  }

  return lines.join("\n    ");
}

// ── Страницы ────────────────────────────────────────────────────────────────

function homeMeta(baseUrl, stats = {}) {
  const count = Number(stats.activeProducts || stats.products || 0);
  const brands = stats.brands || "Loxone, Wiren Board, Hite Pro, Larnitech";
  const countText = count ? `${count} товаров` : "Каталог оборудования";
  return buildHead({
    title: clampTitle(`${SITE.name} | Оборудование умного дома`),
    description: truncate(
      `Каталог оборудования для умного дома: ${countText} от ${brands}. ` +
      `Выключатели, датчики, контроллеры, климат, безопасность. Выбери и купи онлайн.`,
      DESC_MAX
    ),
    canonical: absUrl(baseUrl, "/"),
    image: absUrl(baseUrl, SITE.defaultImage),
    imageAlt: `${SITE.name} — оборудование умного дома`,
    ogType: "website"
  });
}

function categoryMeta(baseUrl, { category, count, path } = {}) {
  const name = String(category || "").trim();
  const countText = count ? `${count} товаров` : "товары";
  return buildHead({
    title: clampTitle(`${name} для умного дома | ${SITE.name}`),
    description: truncate(
      `${name}: ${countText} для умного дома. ` +
      `Сравни по цене и характеристикам, выбери и купи онлайн.`,
      DESC_MAX
    ),
    canonical: absUrl(baseUrl, path || `/catalog/${encodeURIComponent(name)}`),
    image: absUrl(baseUrl, SITE.defaultImage),
    ogType: "website"
  });
}

function brandMeta(baseUrl, { brand, count, path } = {}) {
  const name = String(brand || "").trim();
  const countText = count ? `${count} товаров` : "товары";
  return buildHead({
    title: clampTitle(`${name} — оборудование умного дома | ${SITE.name}`),
    description: truncate(
      `${countText} бренда ${name} в каталоге: освещение, климат, ` +
      `безопасность, управление. Выбери и купи онлайн.`,
      DESC_MAX
    ),
    canonical: absUrl(baseUrl, path || `/brand/${encodeURIComponent(name)}`),
    image: absUrl(baseUrl, SITE.defaultImage),
    ogType: "website"
  });
}

function productMeta(baseUrl, product) {
  const id = product.id;
  const name = String(product.name || "").trim();
  const brand = String(product.brand || "").trim();
  const category = String(product.primaryFunctionalCategory || product.category || "").trim();
  const priceNum = Math.round(Number(product.price) || 0); // price = price_rub (в рублях)
  const hasPrice = priceNum > 0;
  const priceText = hasPrice ? formatRub(priceNum) : "";
  const canonical = absUrl(baseUrl, `/product/${encodeURIComponent(id)}`);
  const image = absUrl(baseUrl, product.image || SITE.defaultImage);

  // Title: override из БД (meta_title) → иначе авто. Держим в пределах лимита.
  const autoTitle = hasPrice
    ? `${name} — ${priceText} | ${SITE.name}`
    : `${name} — ${brand || "умный дом"} | ${SITE.name}`;
  const title = clampTitle(product.metaTitle || autoTitle);

  // Description: override → иначе из описания товара + цена.
  const baseDesc = product.metaDescription
    ? product.metaDescription
    : (stripHtml(product.description) ||
       `${name}${brand ? " от " + brand : ""} для умного дома.`);
  const priceSuffix = hasPrice ? ` Цена ${priceText}. Доставка по России.` : " Доставка по России.";
  const description = truncate(
    product.metaDescription ? baseDesc : (truncate(baseDesc, DESC_MAX - priceSuffix.length) + priceSuffix),
    DESC_MAX
  );

  // Schema.org Product с ценой в offers (требование Google Merchant / Rich Results).
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name,
    description: truncate(baseDesc, 300),
    image: image ? [image] : undefined,
    sku: String(product.article || id || ""),
    brand: brand ? { "@type": "Brand", name: brand } : undefined,
    category: category || undefined
  };
  if (hasPrice) {
    jsonLd.offers = {
      "@type": "Offer",
      url: canonical,
      price: String(priceNum),
      priceCurrency: "RUB",
      availability: "https://schema.org/InStock"
    };
  }

  const extra = [];
  if (hasPrice) {
    extra.push(`<meta property="product:price:amount" content="${priceNum}" />`);
    extra.push(`<meta property="product:price:currency" content="RUB" />`);
  }

  return buildHead({
    title,
    description,
    canonical,
    image,
    imageAlt: name,
    ogType: "product",
    extra,
    jsonLd
  });
}

module.exports = {
  SITE,
  escapeHtml,
  stripHtml,
  truncate,
  clampTitle,
  absUrl,
  formatRub,
  buildHead,
  homeMeta,
  categoryMeta,
  brandMeta,
  productMeta
};
