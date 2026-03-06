import {
  pageTitle,
  searchRow,
  imageTag,
  breadCrumbs,
  slugify,
  resetFacetFilters,
  uniqueSorted,
  productMatchesSearch,
  formatPrice,
  normalizeMeasurementValue
} from "./utils.js";
import {
  renderProductCard,
  getProductBrand,
  getProductType,
  extractGalleryImages,
  pickPrimaryImage,
  isSoftSourceImage,
  getProductVariants,
  getSpecsRows,
  getFunctionRows
} from "./products.js";
import { isFavorite } from "./favorites.js";
import { renderBrandsBlock, getBrandSubcategory } from "./brand-pages.js";
import { PLACEHOLDER_IMAGE } from "./config.js";
import { addToCart } from "./cart.js";

const CATALOG_CATEGORY_HERO_IMAGES = new Map([
  ["Управление и автоматизация", "/images/category-hero/control-automation.svg"],
  ["Монтаж", "/images/category-hero/mounting.svg"],
  ["Освещение", "/images/category-hero/lighting.svg"],
  ["Безопасность", "/images/category-hero/security.svg"],
  ["Климат", "/images/category-hero/climate.svg"],
  ["Энергомониторинг", "/images/category-hero/energy.svg"],
  ["????? / Multiroom", "/images/category-hero/audio-multiroom.svg"],
  ["Комплекты", "/images/category-hero/kits.svg"]
]);

const MAIN_CATALOG_SECTIONS = [
  "Управление и автоматизация",
  "Монтаж",
  "Освещение",
  "Безопасность",
  "Климат",
  "Аудио / Multiroom",
  "Энергомониторинг",
  "Комплекты"
];

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
  return `
    <fieldset class="filter-group">
      <legend>${title}</legend>
      <div class="filter-scroll">
        ${options
          .map(({ value, count }) => {
            const checked = selectedSet.has(value) ? "checked" : "";
            return `
              <label class="check-field">
                <input class="check-input" type="checkbox" value="${value}" data-filter-key="${key}" ${checked} />
                <span class="check-label">${value} <small>(${count})</small></span>
              </label>
            `;
          })
          .join("")}
      </div>
    </fieldset>
  `;
}

function detectContext(selectedSub) {
  const sub = String(selectedSub || "").toLowerCase();
  return {
    sensors: /датчик|sensor|сенсор/.test(sub),
    controllers: /контроллер|controller|шлюз|gateway|сервер|plc/.test(sub),
    relays: /реле|relay|диммер|dimmer/.test(sub)
  };
}

export function renderCatalog(state, appEl, bindSearch, toggleFavoriteFn) {
  const byTopCategory = new Map();
  for (const p of state.products) {
    const top = String((p && p.topCategory) || "").trim();
    if (!top || top === "Каталог") continue;
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

  appEl.innerHTML = `
    ${pageTitle("Товары")}
    ${searchRow(state.search)}
    ${
      state.search
        ? `
      <section class="product-grid">
        ${searchProducts.map((p) => renderProductCard(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("")}
      </section>
      ${searchProducts.length === 0 ? '<p class="note">По запросу ничего не найдено.</p>' : ""}
    `
        : `
      <section class="category-grid">
        ${visible
          .map(
            (c) => `
            <a class="category-card" href="#/catalog/${slugify(c.name)}">
              ${imageTag(c.image, c.name, "", PLACEHOLDER_IMAGE)}
              <h3>${c.name}</h3>
            </a>
          `
          )
          .join("")}
      </section>
      ${renderBrandsBlock(state, slugify, imageTag)}
    `
    }
  `;

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavoriteFn(id);
      btn.classList.toggle("is-active", isFavorite(state, id));
      btn.textContent = isFavorite(state, id) ? "♥" : "♡";
    });
  });
  bindSearch();
}

export function renderCategory(state, appEl, categorySlug, subCategorySlug, bindSearch, toggleFavoriteFn) {
  const normalizedSlug = slugify(decodeURIComponent(String(categorySlug || "")));
  const categoryName = state.products.map((p) => p.topCategory).find((name) => slugify(name) === normalizedSlug);
  if (!categoryName) {
    appEl.innerHTML = "<p>Категория не найдена</p>";
    return;
  }

  const inCategory = state.products.filter((p) => p.topCategory === categoryName);
  const subCategories = uniqueSorted(inCategory.map((p) => p.subCategory));
  const normalizedSubSlug = slugify(decodeURIComponent(String(subCategorySlug || "")));
  const selectedSub = normalizedSubSlug ? subCategories.find((name) => slugify(name) === normalizedSubSlug) || "" : "";
  const facetBase = inCategory.filter((p) => !selectedSub || p.subCategory === selectedSub);

  const facets = {
    brands: countSingle(facetBase, (p) => getProductBrand(p)),
    systemTypes: countSingle(facetBase, (p) => p.systemType),
    protocols: countMulti(facetBase, (p) => p.protocol),
    mountings: countMulti(facetBase, (p) => p.mounting),
    supplyVoltages: countSingle(facetBase, (p) => normalizeMeasurementValue("voltage", p.supplyVoltage)),
    channels: countSingle(facetBase, (p) => p.channels),
    nominalCurrents: countSingle(facetBase, (p) => normalizeMeasurementValue("current", p.nominalCurrent)),
    nominalPowers: countSingle(facetBase, (p) => normalizeMeasurementValue("power", p.nominalPower)),
    sensorTypes: countSingle(facetBase, (p) => p.sensorType),
    indoorOutdoor: countSingle(facetBase, (p) => p.indoorOutdoor),
    ipRatings: countSingle(facetBase, (p) => p.ipRating),
    ioCounts: countSingle(facetBase, (p) => p.ioCount),
    webInterfaces: countSingle(facetBase, (p) => p.webInterface),
    scenarioSupports: countSingle(facetBase, (p) => p.scenarioSupport),
    loadTypes: countMulti(facetBase, (p) => p.loadType),
    maxLoads: countSingle(facetBase, (p) => p.maxLoad)
  };

  const selected = {
    brands: new Set(state.filters.brands),
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

  const minFacetPrice = facetBase.length ? Math.floor(Math.min(...facetBase.map((p) => Number(p.price || 0)))) : 0;
  const maxFacetPrice = facetBase.length ? Math.ceil(Math.max(...facetBase.map((p) => Number(p.price || 0)))) : 0;
  const minSelected = state.filters.minPrice !== "" ? Number(state.filters.minPrice) : null;
  const maxSelected = state.filters.maxPrice !== "" ? Number(state.filters.maxPrice) : null;
  const context = detectContext(selectedSub);

  const items = facetBase.filter((p) => {
    if (!productMatchesSearch(p, state.search)) return false;
    if (!matchesSingle(getProductBrand(p), selected.brands)) return false;
    if (!matchesSingle(p.systemType, selected.systemTypes)) return false;
    if (!matchesMultiAll(p.protocol, selected.protocols)) return false;
    if (!matchesMulti(p.mounting, selected.mountings)) return false;
    if (!matchesSingle(normalizeMeasurementValue("voltage", p.supplyVoltage), selected.supplyVoltages)) return false;
    if (!matchesSingle(p.channels, selected.channels)) return false;
    if (!matchesSingle(normalizeMeasurementValue("current", p.nominalCurrent), selected.nominalCurrents)) return false;
    if (!matchesSingle(normalizeMeasurementValue("power", p.nominalPower), selected.nominalPowers)) return false;

    if (context.sensors) {
      if (!matchesSingle(p.sensorType, selected.sensorTypes)) return false;
      if (!matchesSingle(p.indoorOutdoor, selected.indoorOutdoor)) return false;
      if (!matchesSingle(p.ipRating, selected.ipRatings)) return false;
    }
    if (context.controllers) {
      if (!matchesSingle(p.ioCount, selected.ioCounts)) return false;
      if (!matchesSingle(p.webInterface, selected.webInterfaces)) return false;
      if (!matchesSingle(p.scenarioSupport, selected.scenarioSupports)) return false;
    }
    if (context.relays) {
      if (!matchesMulti(p.loadType, selected.loadTypes)) return false;
      if (!matchesSingle(p.maxLoad, selected.maxLoads)) return false;
    }

    const price = Number(p.price || 0);
    if (minSelected !== null && price < minSelected) return false;
    if (maxSelected !== null && price > maxSelected) return false;
    return true;
  });

  appEl.innerHTML = `
    ${breadCrumbs([
      { label: "Товары", href: "#/catalog" },
      { label: categoryName, href: `#/catalog/${slugify(categoryName)}` },
      ...(selectedSub ? [{ label: selectedSub }] : [])
    ])}
    ${searchRow(state.search)}
    
    <div class="grid-layout">
      <section class="product-grid">
        ${items.length ? items.map((p) => renderProductCard(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE)).join("") : '<div class="note">Товары не найдены</div>'}
      </section>
      <aside class="filters">
        <h4>Фильтры</h4>
        <fieldset class="filter-group">
          <legend>Цена, руб.</legend>
          <div class="price-row">
            <input class="input" id="minPriceFilter" type="number" min="${minFacetPrice}" placeholder="РѕС' ${minFacetPrice}" value="${state.filters.minPrice}" />
            <input class="input" id="maxPriceFilter" type="number" min="${minFacetPrice}" placeholder="РґРѕ ${maxFacetPrice}" value="${state.filters.maxPrice}" />
          </div>
        </fieldset>
        ${renderCheckGroup("Бренд", "brands", facets.brands, selected.brands)}
        ${renderCheckGroup("Тип системы", "systemTypes", facets.systemTypes, selected.systemTypes)}
        ${renderCheckGroup("Протокол", "protocols", facets.protocols, selected.protocols)}
        ${renderCheckGroup("Монтаж", "mountings", facets.mountings, selected.mountings)}
        ${renderCheckGroup("Напряжение питания", "supplyVoltages", facets.supplyVoltages, selected.supplyVoltages)}
        ${renderCheckGroup("Количество каналов", "channels", facets.channels, selected.channels)}
        ${renderCheckGroup("Номинальный ток", "nominalCurrents", facets.nominalCurrents, selected.nominalCurrents)}
        ${renderCheckGroup("Номинальная мощность", "nominalPowers", facets.nominalPowers, selected.nominalPowers)}
        ${context.sensors ? renderCheckGroup("Тип датчика", "sensorTypes", facets.sensorTypes, selected.sensorTypes) : ""}
        ${context.sensors ? renderCheckGroup("Внутренний / уличный", "indoorOutdoor", facets.indoorOutdoor, selected.indoorOutdoor) : ""}
        ${context.sensors ? renderCheckGroup("Степень защиты IP", "ipRatings", facets.ipRatings, selected.ipRatings) : ""}
        ${context.controllers ? renderCheckGroup("Входы / выходы", "ioCounts", facets.ioCounts, selected.ioCounts) : ""}
        ${context.controllers ? renderCheckGroup("Web-интерфейс", "webInterfaces", facets.webInterfaces, selected.webInterfaces) : ""}
        ${context.controllers ? renderCheckGroup("Поддержка сценариев", "scenarioSupports", facets.scenarioSupports, selected.scenarioSupports) : ""}
        ${context.relays ? renderCheckGroup("Тип нагрузки", "loadTypes", facets.loadTypes, selected.loadTypes) : ""}
        ${context.relays ? renderCheckGroup("Максимальная нагрузка", "maxLoads", facets.maxLoads, selected.maxLoads) : ""}
        <button class="button button-outline" id="resetFiltersBtn" type="button">Сбросить</button>
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
      renderCategory(state, appEl, categorySlug, subCategorySlug, bindSearch, toggleFavoriteFn);
    });
  });

  const minPriceFilter = document.getElementById("minPriceFilter");
  const maxPriceFilter = document.getElementById("maxPriceFilter");
  const applyPrice = () => {
    state.filters.minPrice = minPriceFilter?.value?.trim?.() || "";
    state.filters.maxPrice = maxPriceFilter?.value?.trim?.() || "";
    renderCategory(state, appEl, categorySlug, subCategorySlug, bindSearch, toggleFavoriteFn);
  };
  if (minPriceFilter) minPriceFilter.addEventListener("change", applyPrice);
  if (maxPriceFilter) maxPriceFilter.addEventListener("change", applyPrice);

  const resetBtn = document.getElementById("resetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetFacetFilters(state.filters);
      renderCategory(state, appEl, categorySlug, subCategorySlug, bindSearch, toggleFavoriteFn);
    });
  }

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavoriteFn(id);
      btn.classList.toggle("is-active", isFavorite(state, id));
      btn.textContent = isFavorite(state, id) ? "♥" : "♡";
    });
  });
}

export function renderProduct(state, appEl, productId, toggleFavoriteFn, miniCartEl, cartQtyEl) {
  const p = state.products.find((item) => item.id === productId);
  if (!p) {
    appEl.innerHTML = "<p>Товар не найден</p>";
    return;
  }

  const categorySlug = slugify(p.topCategory || p.category);
  const subCategorySlug = slugify(p.subCategory || p.category);
  const groupRaw = String(p.group || p.group_name || "").trim();
  const groupParts = groupRaw.split("/").map((x) => String(x || "").trim()).filter(Boolean);
  const brandFromGroup = groupParts.length >= 2 ? groupParts[0] : "";
  const subFromGroup = groupParts.length >= 2 ? groupParts[groupParts.length - 1] : "";
  const brandSubcategory = p.brand ? String(getBrandSubcategory(p.brand, p) || "").trim() : "";
  const subForCrumbs = brandSubcategory || subFromGroup || "";
  const sameBrandInGroup =
    !!brandFromGroup &&
    String(brandFromGroup).toLowerCase() === String(p.brand || "").toLowerCase();
  // Brand-first breadcrumbs for brand pages (same behavior as Larnitech),
  // even when source group does not explicitly include brand prefix.
  const hasBrandRouteCrumbs = !!p.brand && (!!subForCrumbs || sameBrandInGroup);
  const brandSlug = hasBrandRouteCrumbs ? slugify(p.brand) : "";
  const brandSubSlug = subForCrumbs ? slugify(subForCrumbs) : "";
  const gallery = extractGalleryImages(p);
  const mainImage = pickPrimaryImage(p, PLACEHOLDER_IMAGE, { allowSoftFallback: true });
  const mainPhotoClass = isSoftSourceImage(mainImage) ? "photo is-soft-source" : "photo";
  const variants = getProductVariants(p, state.products);

  appEl.innerHTML = `
    ${breadCrumbs(
      hasBrandRouteCrumbs
        ? [
            { label: "\u0422\u043e\u0432\u0430\u0440\u044b", href: "#/catalog" },
            { label: p.brand, href: `#/brands/${brandSlug}` },
            ...(subForCrumbs
              ? [{ label: subForCrumbs, href: `#/brands/${brandSlug}/${brandSubSlug}` }]
              : []),
            { label: p.name }
          ]
        : [
            { label: "\u0422\u043e\u0432\u0430\u0440\u044b", href: "#/catalog" },
            { label: p.topCategory || p.category, href: `#/catalog/${categorySlug}` },
            ...(p.subCategory && p.subCategory !== (p.topCategory || p.category)
              ? [{ label: p.subCategory, href: `#/catalog/${categorySlug}/${subCategorySlug}` }]
              : []),
            { label: p.name }
          ]
    )}
    <section class="product-page">
      <div class="product-gallery">
        <div class="product-main-photo">
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
        <div class="product-head-row">
          <div class="sku">Артикул: ${p.article || "-"}</div>
          <button class="button button-plain favorite-btn ${isFavorite(state, p.id) ? "is-active" : ""}" id="favoriteBtn" type="button">${
            isFavorite(state, p.id) ? "В избранном" : "В избранное"
          }</button>
        </div>
        <h2>${p.name}</h2>
        <div class="price">${formatPrice(p.price)}${Number(p.price) > 0 ? " / шт" : ""}</div>
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
          <button class="button button-outline" id="buyOneClick">Купить в 1 клик</button>
          <button class="button" id="addToCartBtn">В корзину</button>
        </div>
        <div class="product-tabs">
          <div class="product-tabs-head">
            <button class="product-tab is-active" type="button" data-tab-btn="description">Описание</button>
            <button class="product-tab" type="button" data-tab-btn="specs">Характеристики</button>
            <button class="product-tab" type="button" data-tab-btn="functions">Функции</button>
            <button class="product-tab" type="button" data-tab-btn="connection">Подключение</button>
            <button class="product-tab" type="button" data-tab-btn="documents">Документы</button>
          </div>
          <div class="product-tabs-body">
            <div class="tab-pane" data-tab-pane="description">
              <div class="desc" style="margin-bottom:10px;">${p.description || "Описание отсутствует."}</div>
            </div>
            <div class="tab-pane" data-tab-pane="specs" hidden>
              <h4>Технические характеристики</h4>
              <table class="spec-table">
                <thead><tr><th>Параметр</th><th>Значение</th></tr></thead>
                <tbody>
                  ${getSpecsRows(p)
                    .map((row) => `<tr><td class="spec-name">${row[0]}</td><td>${row[1]}</td></tr>`)
                    .join("")}
                </tbody>
              </table>
            </div>
            <div class="tab-pane" data-tab-pane="functions" hidden>
              <h4>Функции и возможности</h4>
              <div class="functions-list">
                ${getFunctionRows(p).length ? `<ul>${getFunctionRows(p).map((line) => `<li>${line}</li>`).join("")}</ul>` : '<div class="note">Функции будут добавлены позже.</div>'}
              </div>
            </div>
            <div class="tab-pane" data-tab-pane="connection" hidden>
              <h4>Пример подключения</h4>
              <div class="note">Схемы подключения доступны в технической документации.</div>
            </div>
            <div class="tab-pane" data-tab-pane="documents" hidden>
              <h4>Документация</h4>
              <div class="docs-list" style="margin-bottom:10px;">
                ${
                  p.documents?.length
                    ? p.documents
                        .map(
                          (d) => `
                    <div class="doc-item">
                      <a href="${d.url}" target="_blank" rel="noreferrer">${d.title || "Документ"}</a>
                      <div class="note">${d.meta || ""}</div>
                    </div>
                  `
                        )
                        .join("")
                    : '<div class="note">Документы не добавлены.</div>'
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  appEl.querySelectorAll("[data-gallery-thumb]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.dataset.src || "";
      const main = appEl.querySelector(".product-main-photo img");
      if (main && src) {
        main.src = src;
        main.classList.toggle("is-soft-source", isSoftSourceImage(src));
      }
      appEl.querySelectorAll("[data-gallery-thumb]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  const variantSelect = document.getElementById("variantSelect");
  if (variantSelect) {
    variantSelect.addEventListener("change", () => {
      const nextId = String(variantSelect.value || "");
      if (nextId && nextId !== String(p.id)) location.hash = `#/product/${encodeURIComponent(nextId)}`;
    });
  }

  const favoriteBtn = document.getElementById("favoriteBtn");
  if (favoriteBtn) {
    favoriteBtn.addEventListener("click", () => {
      toggleFavoriteFn(p.id);
      favoriteBtn.classList.toggle("is-active", isFavorite(state, p.id));
      favoriteBtn.textContent = isFavorite(state, p.id) ? "В избранном" : "В избранное";
    });
  }

  const addToCartBtn = document.getElementById("addToCartBtn");
  if (addToCartBtn) {
    addToCartBtn.addEventListener("click", () => {
      addToCart(state, p.id, cartQtyEl, miniCartEl);
      miniCartEl.classList.remove("hidden");
    });
  }

  const buyOneClickBtn = document.getElementById("buyOneClick");
  if (buyOneClickBtn) {
    buyOneClickBtn.addEventListener("click", () => {
      addToCart(state, p.id, cartQtyEl, miniCartEl);
      location.hash = "#/cart";
    });
  }

  const tabButtons = Array.from(document.querySelectorAll("[data-tab-btn]"));
  const tabPanes = Array.from(document.querySelectorAll("[data-tab-pane]"));
  function activateTab(tabName) {
    tabButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tabBtn === tabName));
    tabPanes.forEach((pane) => {
      pane.hidden = pane.dataset.tabPane !== tabName;
    });
  }
  tabButtons.forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tabBtn)));
  activateTab("description");
}
