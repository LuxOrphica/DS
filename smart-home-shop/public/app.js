// Imports for application modules
import {
  state,
  appEl,
  cartQtyEl,
  miniCartEl,
  cartOpenBtn,
  PLACEHOLDER_IMAGE,
  FAVORITES_STORAGE_KEY
} from './config.js';

import {
  formatPrice,
  slugify,
  normText,
  parseJsonList,
  resetFacetFilters,
  splitBreadcrumbs,
  uniqueSorted,
  facetCounts,
  productMatchesSearch,
  breadCrumbs,
  pageTitle,
  searchRow,
  imageTag,
  setImageFallback as applyImageFallback,
  normalizeVariantBaseName,
  parseSpecsString,
  sanitizeCatalogProduct,
  applySafeHtml
} from './utils.js';

import {
  withHierarchy,
  getAttributeValue,
  getProductBrand,
  getProductType,
  extractGalleryImages,
  getProductVariants,
  getSpecsRows,
  renderProductCard
} from './products.js';

import {
  loadFavorites,
  saveFavorites,
  isFavorite,
  toggleFavorite,
  renderFavoritesPage
} from './favorites.js';

import {
  addToCart,
  changeQty,
  getCartCount,
  getCartTotal,
  updateCartBadges,
  renderMiniCart,
  renderCartPage,
  renderOrdersCabinetPage
} from './cart.js';

import {
  renderCatalog,
  renderCategory,
  renderProduct
} from './renderers.js';

import {
  renderBrandPage,
  renderBrandSubcategoryPage,
  renderBrandsBlock,
  getBrandSubcategory
} from './brand-pages.js';


const HIDDEN_PRODUCT_IDS = new Set([
  "direction-larnitech",
  "direction-loxone",
  "service-networks",
  // Temporary hide: DE-IP-CAM card is currently mismatched with FE-IC.nfc content.
  "DE-IP-CAM",
  // Temporary hide: DE-LS card duplicates DW-LC07 content.
  "DE-LS",
  // Temporary hide: DW-R card is mismatched/ambiguous in current source data.
  "DW-R",
  // Legacy sensor aliases: merged to canonical SKU cards.
  "DW-LS01",
  "DW-LS02",
  "DW-LS03",
  "DW-WLS"
]);

const LEGACY_PRODUCT_REDIRECTS = new Map([
  ["DW-LS01", "EW-WL"],
  ["DW-LS02", "WW-TS"],
  ["DW-LS03", "FW-WL"],
  ["DW-WLS", "FW-WL"]
]);

function isHiddenProduct(product) {
  if (!product || typeof product !== "object") return false;
  const keys = [
    product.id,
    product.article,
    product.sku
  ].map((v) => String(v || "").trim()).filter(Boolean);
  return keys.some((k) => HIDDEN_PRODUCT_IDS.has(k));
}

function isStorefrontVisibleStatus(status) {
  const s = String(status || "active").trim().toLowerCase();
  return s === "" || s === "active";
}

function isStorefrontVisibleProduct(product) {
  if (!product || typeof product !== "object") return false;
  if (isHiddenProduct(product)) return false;
  if (!isStorefrontVisibleStatus(product.status)) return false;
  if (Number(product.is_extra || 0) === 1) return false;
  const entityType = String(product.entityType || product.entity_type || "product").trim().toLowerCase();
  if (entityType === "service" || entityType === "merch") return false;
  const normalizedSource = String(product.sourceCategory || product.source_category || "").trim();
  if (!normalizedSource) {
    const legacyCategory = String(product.category || "").trim().toLowerCase();
    if (legacyCategory === "услуги" || legacyCategory === "И?ерч") return false;
  }
  return true;
}

function canonicalProductId(rawId) {
  const id = String(rawId || "").trim();
  if (!id) return id;
  return LEGACY_PRODUCT_REDIRECTS.get(id) || id;
}

// Установка fallback для изображений глобально
window.setImageFallback = function setImageFallback(img) {
  applyImageFallback(img, PLACEHOLDER_IMAGE);
};

// Search binding
function bindSearch() {
  const input = document.getElementById("searchInput");
  const clearBtn = document.getElementById("searchClearBtn");
  if (!input) return;

  let debounceTimer = null;
  const isMobileSearch = () => window.matchMedia("(max-width: 980px)").matches;
  const escapeHtml = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const syncClearState = (value) => {
    if (!clearBtn) return;
    clearBtn.hidden = !String(value || "").trim();
  };
  const apply = () => {
    state.search = input.value.trim();
    renderRoute();
  };
  const quickMatches = (q, limit = 8) => {
    const query = String(q || "").trim();
    if (!query) return [];
    const scoped = getSearchScope().items;
    return scoped.filter((p) => productMatchesSearch(p, query)).slice(0, limit);
  };

  const getSearchScope = () => {
    const hash = String(location.hash || "#/catalog");
    const parts = hash.replace(/^#\/?/, "").split("/");
    const page = String(parts[0] || "");
    const all = Array.isArray(state.products) ? state.products : [];

    if (page === "brands" && parts[1]) {
      const brandSlug = slugify(decodeURIComponent(parts[1]));
      const subSlug = parts[2] ? slugify(decodeURIComponent(parts[2])) : "";
      const brandItems = all.filter((p) => slugify(String(p.brand || "")) === brandSlug);
      const brandName = brandItems[0]?.brand || decodeURIComponent(parts[1]);
      if (subSlug) {
        const subItems = brandItems.filter(
          (p) => slugify(String(getBrandSubcategory(brandName, p) || "")) === subSlug
        );
        const subLabel =
          subItems[0] ? String(getBrandSubcategory(brandName, subItems[0]) || "") : decodeURIComponent(parts[2] || "");
        return {
          items: subItems,
          scopeLabel: `Поиск: ${brandName} / ${subLabel || "раздел"}`
        };
      }
      return {
        items: brandItems,
        scopeLabel: `Поиск: ${brandName}`
      };
    }

    if (page === "catalog" && parts[1]) {
      const catSlug = slugify(decodeURIComponent(parts[1]));
      const subSlug = parts[2] ? slugify(decodeURIComponent(parts[2])) : "";
      const catItems = all.filter((p) => slugify(String(p.topCategory || p.category || "")) === catSlug);
      if (subSlug) {
        const subItems = catItems.filter((p) => slugify(String(p.subCategory || "")) === subSlug);
        return {
          items: subItems,
          scopeLabel: `Поиск: ${decodeURIComponent(parts[1])} / ${decodeURIComponent(parts[2])}`
        };
      }
      return {
        items: catItems,
        scopeLabel: `Поиск: ${decodeURIComponent(parts[1])}`
      };
    }

    return { items: all, scopeLabel: "Поиск по каталогу" };
  };

  function closeMobileOverlay(overlay, unlockBody = true) {
    if (!overlay) return;
    overlay.remove();
    if (unlockBody) document.body.classList.remove("mobile-search-open");
  }

  function openMobileOverlay() {
    const existing = document.getElementById("mobileSearchOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "mobileSearchOverlay";
    overlay.className = "mobile-search-overlay";
    overlay.innerHTML = `
      <div class="mobile-search-overlay__backdrop" data-close-mobile-search="1"></div>
      <div class="mobile-search-overlay__panel" role="dialog" aria-modal="true" aria-label="Поиск по каталогу">
        <div class="mobile-search-overlay__head">
          <div class="search-field mobile-search-field">
            <input class="input search-input mobile-search-input" id="mobileSearchInput" placeholder="Введите название товара или артикул" />
            <button class="search-clear-btn" id="mobileSearchClearBtn" type="button" aria-label="Очистить поиск" hidden>×</button>
          </div>
          <button class="mobile-search-cancel" id="mobileSearchCancelBtn" type="button" aria-label="Закрыть поиск" title="Закрыть поиск"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div class="mobile-search-overlay__results" id="mobileSearchResults"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("mobile-search-open");

    const mobileInput = overlay.querySelector("#mobileSearchInput");
    const mobileClearBtn = overlay.querySelector("#mobileSearchClearBtn");
    const mobileCancelBtn = overlay.querySelector("#mobileSearchCancelBtn");
    const resultsEl = overlay.querySelector("#mobileSearchResults");

    const renderResults = () => {
      const q = String(mobileInput.value || "").trim();
      const scope = getSearchScope();
      input.value = q;
      syncClearState(q);
      if (mobileClearBtn) mobileClearBtn.hidden = !q;

      if (!q) {
        applySafeHtml(resultsEl, "");
        return;
      }

      const allMatches = scope.items.filter((p) => productMatchesSearch(p, q));
      const items = allMatches.slice(0, 8);
      const rows = items
        .map((p) => {
          const price = p.priceText || formatPrice(p.price);
          const img = p.image || PLACEHOLDER_IMAGE;
          return `
            <a class="mobile-search-hit" href="#/product/${p.id}">
              <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'" />
              <div class="mobile-search-hit__meta">
                <div class="mobile-search-hit__title">${escapeHtml(p.name)}</div>
                <div class="mobile-search-hit__price">${escapeHtml(price)}</div>
              </div>
            </a>
          `;
        })
        .join("");

      applySafeHtml(
        resultsEl,
        `
          <div class="mobile-search-hits">${rows || '<div class="mobile-search-empty">Ничего не найдено</div>'}</div>
          <button class="button mobile-search-show-all" id="mobileSearchShowAllBtn" type="button">
            Показать все результаты (${allMatches.length})
          </button>
        `
      );

      const showAllBtn = resultsEl.querySelector("#mobileSearchShowAllBtn");
      if (showAllBtn) {
        showAllBtn.addEventListener("click", () => {
          state.search = q;
          closeMobileOverlay(overlay);
          renderRoute();
        });
      }

      resultsEl.querySelectorAll(".mobile-search-hit").forEach((link) => {
        link.addEventListener("click", () => {
          state.search = q;
          closeMobileOverlay(overlay);
        });
      });
    };

    mobileInput.value = input.value || "";
    renderResults();
    requestAnimationFrame(() => mobileInput.focus());

    mobileInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        state.search = String(mobileInput.value || "").trim();
        closeMobileOverlay(overlay);
        renderRoute();
      }
      if (event.key === "Escape") {
        closeMobileOverlay(overlay);
      }
    });

    mobileInput.addEventListener("input", renderResults);
    if (mobileClearBtn) {
      mobileClearBtn.addEventListener("click", () => {
        mobileInput.value = "";
        renderResults();
        mobileInput.focus();
      });
    }
    if (mobileCancelBtn) {
      mobileCancelBtn.addEventListener("click", () => closeMobileOverlay(overlay));
    }
    overlay.addEventListener("click", (event) => {
      if (event.target && event.target.dataset && event.target.dataset.closeMobileSearch === "1") {
        closeMobileOverlay(overlay);
      }
    });
  }

  input.readOnly = isMobileSearch();
  syncClearState(input.value);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (isMobileSearch()) {
        openMobileOverlay();
        return;
      }
      apply();
    }
  });

  input.addEventListener("focus", () => {
    if (!isMobileSearch()) return;
    openMobileOverlay();
  });

  input.addEventListener("click", () => {
    if (!isMobileSearch()) return;
    openMobileOverlay();
  });

  input.addEventListener("input", () => {
    if (isMobileSearch()) return;
    clearTimeout(debounceTimer);
    syncClearState(input.value);
    debounceTimer = setTimeout(apply, 220);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      syncClearState("");
      apply();
      input.focus();
    });
  }
}
function renderStaticPage(title, subtitle, bodyHtml) {
  applySafeHtml(appEl, `
    ${pageTitle(title)}
    <section class="static-page">
      ${bodyHtml}
    </section>
  `);
}

function renderBrandsOnlyPage() {
  applySafeHtml(appEl, `
    ${renderBrandsBlock(state, slugify, imageTag)}
  `);
}

function setupMobileMenu() {
  const menuBtn = document.getElementById("mobileMenuBtn");
  const mainNav = document.getElementById("mainNav");
  if (!menuBtn || !mainNav) return;

  const closeMenu = () => {
    mainNav.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");
  };

  menuBtn.addEventListener("click", () => {
    const nextOpen = !mainNav.classList.contains("is-open");
    mainNav.classList.toggle("is-open", nextOpen);
    menuBtn.setAttribute("aria-expanded", String(nextOpen));
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) closeMenu();
  });

  window.addEventListener("hashchange", closeMenu);
}

function syncMobileBottomNavActive() {
  const navLinks = Array.from(document.querySelectorAll(".mobile-bottom-nav .mobile-bottom-link"));
  if (!navLinks.length) return;
  const hash = String(location.hash || "#/catalog");
  const section = hash.replace(/^#\/?/, "").split("/")[0] || "catalog";
  const activeHrefBySection = new Map([
    ["catalog", "#/catalog"],
    ["product", "#/catalog"],
    ["favorites", "#/favorites"],
    ["orders", "#/orders"],
    ["cart", "#/cart"]
  ]);
  const activeHref = activeHrefBySection.get(section) || "#/catalog";

  navLinks.forEach((link) => {
    const isActive = String(link.getAttribute("href") || "") === activeHref;
    link.classList.toggle("is-active", isActive);
  });
}


function renderFatalError(error) {
  const message = String((error && (error.stack || error.message)) || error || "Unknown error");
  console.error("UI render error:", error);
  applySafeHtml(
    appEl,
    `<div class="note">\u041e\u0448\u0438\u0431\u043a\u0430 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430. \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0443.<br><small>${message}</small></div>`
  );
}

function safeRenderRoute() {
  try {
    renderRoute();
  } catch (error) {
    renderFatalError(error);
  }
}

function forceScrollTop() {
  window.scrollTo(0, 0);
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
}

// Основная функция И?аршрутизации
function renderRoute() {
  syncMobileBottomNavActive();
  const hash = location.hash || "#/catalog";
  const parts = hash.replace(/^#\/?/, "").split("/");

  if (parts[0] === "catalog" && !parts[1]) {
    state.currentCategorySlug = "";
    resetFacetFilters(state.filters);
    renderCatalog(state, appEl, bindSearch, (id) => toggleFavorite(state, id));
    return;
  }

  if (parts[0] === "brands" && parts[1]) {
    const brandSlug = decodeURIComponent(parts[1]);
    const brandRouteKey = `${brandSlug}/${parts[2] ? decodeURIComponent(parts[2]) : ""}`;
    if (state.currentBrandRouteKey !== brandRouteKey) {
      state.currentBrandRouteKey = brandRouteKey;
      resetFacetFilters(state.filters);
    }
    if (parts[2]) {
      const subcategorySlug = decodeURIComponent(parts[2]);
      renderBrandSubcategoryPage(state, appEl, brandSlug, subcategorySlug, renderProductCard, bindSearch);
    } else {
      renderBrandPage(state, appEl, brandSlug, renderProductCard, bindSearch);
    }
    return;
  }

  if (parts[0] === "brands" && !parts[1]) {
    state.currentBrandRouteKey = "";
    resetFacetFilters(state.filters);
    renderBrandsOnlyPage();
    return;
  }

  if (parts[0] === "catalog" && parts[1]) {
    const catSlug = decodeURIComponent(parts[1]);
    if (state.currentCategorySlug !== catSlug) {
      state.currentCategorySlug = catSlug;
      resetFacetFilters(state.filters);
    }
    const subPart = parts[2] ? decodeURIComponent(parts[2]) : "";
    renderCategory(state, appEl, catSlug, subPart, bindSearch, (id) => toggleFavorite(state, id));
    return;
  }

  if (parts[0] === "product" && parts[1]) {
    const rawId = decodeURIComponent(parts[1]);
    const canonicalId = canonicalProductId(rawId);
    if (canonicalId && canonicalId !== rawId) {
      location.hash = `#/product/${encodeURIComponent(canonicalId)}`;
      return;
    }
    renderProduct(state, appEl, canonicalId, (id) => toggleFavorite(state, id), miniCartEl, cartQtyEl);
    requestAnimationFrame(() => forceScrollTop());
    return;
  }

  if (parts[0] === "cart") {
    miniCartEl.classList.add("hidden");
    renderCartPage(state, appEl, changeQty, (state) => updateCartBadges(state, cartQtyEl), renderMiniCart, miniCartEl, imageTag, formatPrice);
    return;
  }

  if (parts[0] === "orders") {
    const initialQuery = parts[1] ? decodeURIComponent(parts[1]) : "";
    renderOrdersCabinetPage(state, appEl, formatPrice, initialQuery);
    return;
  }

  if (parts[0] === "favorites") {
    renderFavoritesPage(state, appEl, renderProductCard);
    return;
  }

  if (parts[0] === "design") {
    renderStaticPage(
      "Проектирование",
      "Проектные услуги",
      `
        <p>ПроектируеИ? инженерные решения под задачи частных доИ?ов и коИ?И?ерческих объектов: от концепции до готовой спецификации оборудования.</p>
        <ul>
          <li>Аудит задачи и подбор архитектуры систеИ?ы.</li>
          <li>Подготовка спецификации и ведоИ?ости по оборудованию.</li>
          <li>Подготовка сИ?еты и графика поставок.</li>
        </ul>
        <p class="note">Для старта проекта напишите в раздел контактов и приложите план поИ?ещения или ТЗ.</p>
      `
    );
    return;
  }
  if (parts[0] === "delivery") {
    renderStaticPage(
      "Доставка",
      "Условия поставки",
      `
        <p>ОрганизуеИ? доставку по Москве и регионаИ? России. Срок и стоиИ?ость рассчитываются отдельно по составу заказа и адресу.</p>
        <ul>
          <li>СаИ?овывоз по предварительноИ?у согласованию вреИ?ени выдачи.</li>
          <li>Курьерская доставка по городу в рабочие дни.</li>
          <li>Отправка транспортной коИ?панией по РФ.</li>
        </ul>
        <p>После офорИ?ления заказа И?енеджер свяжется для подтверждения сроков, стоиИ?ости и способа оплаты.</p>
      `
    );
    return;
  }
  if (parts[0] === "contacts") {
    renderStaticPage(
      "Контакты",
      "Свяжитесь с наИ?и",
      `
        <p><strong>Телефон:</strong> +7 965 277 5166</p>
        <p><strong>Email:</strong> sale@delaemseti.ru</p>
        <p><strong>РежиИ? работы:</strong> пн-пт, 10:00-19:00 (И?ск)</p>
        <p class="note">Если нужна консультация по подбору оборудования, укажите бренд, артикул или задачу проекта.</p>
      `
    );
    return;
  }
  location.hash = "#/catalog";
}

// Application bootstrap
async function init() {
  try {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    const response = await fetch("/api/products");
    const rawProducts = await response.json();
    const visibleProducts = rawProducts.filter((x) => isStorefrontVisibleProduct(x));
    console.log('DEBUG init: loaded', rawProducts.length, 'products, visible', visibleProducts.length);
    
    state.products = visibleProducts.map((x) => {
      const sanitized = sanitizeCatalogProduct({
        ...x,
        gallery: parseJsonList(x.galleryJson),
        attributes: parseJsonList(x.attributesJson),
        documents: parseJsonList(x.documentsJson)
      });
      return withHierarchy(sanitized);
    });

    loadFavorites(state);
    updateCartBadges(state, cartQtyEl);
    if (miniCartEl) miniCartEl.classList.add("hidden");
    setupMobileMenu();
    safeRenderRoute();

    // Global app event handlers
    window.addEventListener("hashchange", safeRenderRoute);
    window.addEventListener("error", (event) => renderFatalError(event.error || event.message || event));
    window.addEventListener("unhandledrejection", (event) => renderFatalError(event.reason || event));
    
    cartOpenBtn.addEventListener("click", () => {
      location.hash = "#/cart";
    });

  } catch (error) {
    console.error('Error initializing app:', error);
    applySafeHtml(appEl, `<p>Ошибка загрузки данных. Пожалуйста, обновите страницу.</p>`);
  }
}

// Запуск приложения
init();
