// Imports for application modules
import {
  state,
  appEl,
  cartQtyEl,
  miniCartEl,
  cartOpenBtn,
  PLACEHOLDER_IMAGE
} from './config.js';

import {
  formatPrice,
  slugify,
  parseJsonList,
  resetFacetFilters,
  productMatchesSearch,
  pageTitle,
  imageTag,
  setImageFallback as applyImageFallback,
  sanitizeCatalogProduct,
  applySafeHtml
} from './utils.js';

import {
  withHierarchy,
  renderProductCard
} from './products.js';

import {
  loadFavorites,
  toggleFavorite,
  renderFavoritesPage
} from './favorites.js';

import {
  changeQty,
  loadCart,
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

const LOGO_ACCENT_PALETTE = [
  { from: "#f87171", to: "#ef4444" }, // red 400 -> 500
  { from: "#fb923c", to: "#f97316" }, // orange
  { from: "#facc15", to: "#eab308" }, // yellow
  { from: "#a3e635", to: "#84cc16" }, // lime
  { from: "#4ade80", to: "#22c55e" }, // green
  { from: "#34d399", to: "#10b981" }, // emerald
  { from: "#2dd4bf", to: "#14b8a6" }, // teal
  { from: "#22d3ee", to: "#06b6d4" }  // cyan
];

function mixHexWithWhite(hex, ratio = 0.68) {
  const clean = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "#f5f5f4";
  const to = (part) => Number.parseInt(part, 16);
  const r = to(clean.slice(0, 2));
  const g = to(clean.slice(2, 4));
  const b = to(clean.slice(4, 6));
  const mix = (v) => Math.round(v + (255 - v) * ratio);
  const out = [mix(r), mix(g), mix(b)]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("");
  return `#${out}`;
}

function applyRandomLogoAccent() {
  const root = document.documentElement;
  if (!root || !LOGO_ACCENT_PALETTE.length) return;
  const index = Math.floor(Math.random() * LOGO_ACCENT_PALETTE.length);
  const pair = LOGO_ACCENT_PALETTE[index] || LOGO_ACCENT_PALETTE[0];
  root.style.setProperty("--brand-warm", pair.from);
  root.style.setProperty("--brand-warm-2", pair.to);
  root.style.setProperty("--brand-warm-soft", mixHexWithWhite(pair.from, 0.7));
  root.style.setProperty("--brand-warm-soft-2", mixHexWithWhite(pair.to, 0.75));
}


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
  const input = document.getElementById("headerSearchInput") || document.getElementById("searchInput");
  const clearBtn = document.getElementById("headerSearchClearBtn") || document.getElementById("searchClearBtn");
  if (!input) return;

  if (input.dataset.searchBound === "1") {
    input.value = state.search || "";
    if (clearBtn) clearBtn.hidden = !String(input.value || "").trim();
    return;
  }
  input.dataset.searchBound = "1";

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
  const searchFieldEl = input.closest(".search-field");
  let desktopDropdownEl = null;
  const apply = () => {
    state.search = input.value.trim();
    renderRoute();
  };
  const getSearchScope = () => {
    const path = String(location.pathname || "/catalog");
    const parts = path.replace(/^\//, "").split("/");
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

  function ensureDesktopDropdown() {
    if (!searchFieldEl) return null;
    if (desktopDropdownEl) return desktopDropdownEl;
    desktopDropdownEl = document.createElement("div");
    desktopDropdownEl.className = "desktop-search-suggestions";
    desktopDropdownEl.id = "desktopSearchSuggestions";
    desktopDropdownEl.hidden = true;
    searchFieldEl.appendChild(desktopDropdownEl);
    return desktopDropdownEl;
  }

  function closeDesktopDropdown() {
    if (!desktopDropdownEl) return;
    desktopDropdownEl.hidden = true;
    desktopDropdownEl.innerHTML = "";
  }

  function renderDesktopDropdown() {
    if (isMobileSearch()) {
      closeDesktopDropdown();
      return;
    }
    const q = String(input.value || "").trim();
    if (!q) {
      closeDesktopDropdown();
      return;
    }

    const scope = getSearchScope();
    const allMatches = scope.items.filter((p) => productMatchesSearch(p, q));
    const items = allMatches.slice(0, 8);
    const dropdown = ensureDesktopDropdown();
    if (!dropdown) return;

    const rows = items
      .map((p) => {
        const price = p.priceText || formatPrice(p.price);
        const img = p.image || PLACEHOLDER_IMAGE;
        return `
          <a class="desktop-search-hit" href="/product/${p.id}">
            <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" data-placeholder-src="${PLACEHOLDER_IMAGE}" />
            <div class="desktop-search-hit__meta">
              <div class="desktop-search-hit__title">${escapeHtml(p.name)}</div>
              <div class="desktop-search-hit__price">${escapeHtml(price)}</div>
            </div>
          </a>
        `;
      })
      .join("");

    applySafeHtml(
      dropdown,
      `
        <div class="desktop-search-suggestions__scope">${escapeHtml(scope.scopeLabel)}</div>
        <div class="desktop-search-suggestions__list">${rows || '<div class="desktop-search-empty">Ничего не найдено</div>'}</div>
        <button class="button desktop-search-show-all" id="desktopSearchShowAllBtn" type="button">
          Показать все результаты (${allMatches.length})
        </button>
      `
    );

    dropdown.hidden = false;

    dropdown.querySelectorAll('img[data-placeholder-src]').forEach((imgEl) => {
      if (imgEl.dataset.fallbackBound === "1") return;
      imgEl.dataset.fallbackBound = "1";
      const fallbackSrc = String(imgEl.getAttribute("data-placeholder-src") || PLACEHOLDER_IMAGE);
      if (imgEl.complete && Number(imgEl.naturalWidth) === 0) {
        applyImageFallback(imgEl, fallbackSrc);
        return;
      }
      imgEl.addEventListener("error", () => applyImageFallback(imgEl, fallbackSrc), { once: true });
    });

    const showAllBtn = dropdown.querySelector("#desktopSearchShowAllBtn");
    if (showAllBtn) {
      showAllBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeDesktopDropdown();
        apply();
      });
    }

    dropdown.querySelectorAll(".desktop-search-hit").forEach((link) => {
      link.addEventListener("click", () => {
        state.search = q;
        closeDesktopDropdown();
      });
    });
  }

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
            <input class="input search-input mobile-search-input" id="mobileSearchInput" placeholder="Введите название товара или артикул" autocomplete="off" autocapitalize="off" spellcheck="false" />
            <button class="search-clear-btn" id="mobileSearchClearBtn" type="button" aria-label="Очистить поиск" hidden>×</button>
          </div>
          <button class="mobile-search-cancel" id="mobileSearchCancelBtn" type="button" aria-label="Закрыть поиск" title="Закрыть поиск"><span class="material-symbols-rounded msi" aria-hidden="true">close</span></button>
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
            <a class="mobile-search-hit" href="/product/${p.id}">
              <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" data-placeholder-src="${PLACEHOLDER_IMAGE}" />
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
      resultsEl.querySelectorAll("img[data-placeholder-src]").forEach((imgEl) => {
        if (imgEl.dataset.fallbackBound === "1") return;
        imgEl.dataset.fallbackBound = "1";
        const fallbackSrc = String(imgEl.getAttribute("data-placeholder-src") || PLACEHOLDER_IMAGE);
        if (imgEl.complete && Number(imgEl.naturalWidth) === 0) {
          applyImageFallback(imgEl, fallbackSrc);
          return;
        }
        imgEl.addEventListener("error", () => applyImageFallback(imgEl, fallbackSrc), { once: true });
      });
      if (showAllBtn) {
        showAllBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          state.search = q;
          closeMobileOverlay(overlay);
          requestAnimationFrame(() => {
            renderRoute();
          });
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

  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (isMobileSearch()) {
        openMobileOverlay();
        return;
      }
      closeDesktopDropdown();
      apply();
    }
    if (event.key === "Escape" && !isMobileSearch()) {
      closeDesktopDropdown();
    }
  };

  input.onfocus = () => {
    if (isMobileSearch()) {
      openMobileOverlay();
      return;
    }
    renderDesktopDropdown();
  };

  input.onclick = () => {
    if (!isMobileSearch()) return;
    openMobileOverlay();
  };

  input.oninput = () => {
    if (isMobileSearch()) return;
    clearTimeout(debounceTimer);
    syncClearState(input.value);
    debounceTimer = setTimeout(renderDesktopDropdown, 120);
  };

  if (clearBtn) {
    clearBtn.onclick = () => {
      input.value = "";
      syncClearState("");
      closeDesktopDropdown();
      apply();
      input.focus();
    };
  }

  if (window.__desktopSearchOutsideHandler) {
    document.removeEventListener("pointerdown", window.__desktopSearchOutsideHandler, true);
  }
  window.__desktopSearchOutsideHandler = (event) => {
    if (isMobileSearch()) return;
    if (!searchFieldEl) return;
    if (searchFieldEl.contains(event.target)) return;
    closeDesktopDropdown();
  };
  document.addEventListener("pointerdown", window.__desktopSearchOutsideHandler, true);
}
function renderStaticPage(title, subtitle, bodyHtml) {
  applySafeHtml(appEl, `
    ${pageTitle(title)}
    <section class="static-page">
      ${bodyHtml}
    </section>
  `);
}

const LEGAL_PAGE_CONFIG = {
  "offer": {
    title: "Публичная оферта",
    subtitle: "Условия заключения договора",
    path: "legal/offer.html"
  },
  "privacy": {
    title: "Политика персональных данных",
    subtitle: "Правила обработки и хранения данных",
    path: "legal/privacy.html"
  },
  "payment-delivery": {
    title: "Оплата и доставка",
    subtitle: "Условия оплаты и отгрузки",
    path: "legal/payment-delivery.html"
  },
  "returns-exchange": {
    title: "Возврат и обмен",
    subtitle: "Условия возврата и гарантийных обращений",
    path: "legal/returns-exchange.html"
  },
  "requisites": {
    title: "Реквизиты",
    subtitle: "Юридическая и платежная информация",
    path: "legal/requisites.html"
  }
};

function renderLegalPage(slug) {
  const config = LEGAL_PAGE_CONFIG[String(slug || "").trim()];
  if (!config) return false;

  renderStaticPage(
    config.title,
    config.subtitle,
    `<p class="note">Загрузка...</p>`
  );

  const legalUrl = new URL(config.path, new URL("./", import.meta.url));
  fetch(legalUrl, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load legal page: ${response.status}`);
      return response.text();
    })
    .then((html) => {
      renderStaticPage(config.title, config.subtitle, html);
    })
    .catch((error) => {
      console.error("Failed to render legal page", slug, error);
      renderStaticPage(
        config.title,
        config.subtitle,
        `<p class="note">Страница временно недоступна. Пожалуйста, напишите на <a href="mailto:sale@delaemseti.ru">sale@delaemseti.ru</a>.</p>`
      );
    });
  return true;
}

function renderBrandsOnlyPage() {
  applySafeHtml(appEl, `
    ${renderBrandsBlock(state, slugify, imageTag)}
  `);
}

function getCatalogMenuCategories() {
  const grouped = new Map();
  (Array.isArray(state.products) ? state.products : []).forEach((p) => {
    const top = String(p?.topCategory || p?.category || "").trim();
    if (!top) return;
    const sub = String(p?.subCategory || "").trim();
    if (!grouped.has(top)) grouped.set(top, new Set());
    if (sub) grouped.get(top).add(sub);
  });

  const CATEGORY_ORDER = [
    "Управление и автоматизация",
    "Монтаж и расходники",
    "Освещение",
    "Безопасность и доступ",
    "Климат",
    "Аудио и мультимедиа",
    "Энергия и учет",
    "Комплекты"
  ];
  const orderIndex = new Map(CATEGORY_ORDER.map((name, i) => [name, i]));

  return Array.from(grouped.entries())
    .map(([name, subSet]) => ({ name, subs: Array.from(subSet).sort((a, b) => a.localeCompare(b, "ru")) }))
    .filter((cat) => orderIndex.has(cat.name))
    .sort((a, b) => {
      const ai = orderIndex.has(a.name) ? orderIndex.get(a.name) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.name) ? orderIndex.get(b.name) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, "ru");
    });
}

function setupMobileMenu() {
  const menuBtn = document.getElementById("mobileMenuBtn");
  const mainNav = document.getElementById("mainNav");
  if (!menuBtn || !mainNav) return;
  const menuBtnIcon = menuBtn.querySelector(".msi");

  const catalogOpenBtn = mainNav.querySelector("[data-nav-catalog-open]");
  const catalogPanel = mainNav.querySelector(".main-nav-catalog-panel");
  const escapeHtml = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  if (catalogPanel) {
    const categories = getCatalogMenuCategories();
    applySafeHtml(
      catalogPanel,
      `
        <div class="filters-popup-head main-nav-catalog-panel-head">
          <button type="button" class="main-nav-catalog-back" data-nav-catalog-back aria-label="Назад">
            <span class="material-symbols-rounded msi" aria-hidden="true">arrow_back</span>
          </button>
          <h4 class="main-nav-catalog-title">Каталог</h4>
        </div>
        <div class="main-nav-catalog-list">
          ${categories
            .map((cat) => `
              <section class="main-nav-catalog-group">
                <button type="button" class="main-nav-catalog-toggle" aria-expanded="false">
                  <span class="main-nav-catalog-main">${escapeHtml(cat.name)}</span>
                  <span class="material-symbols-rounded msi main-nav-catalog-chevron" aria-hidden="true">expand_more</span>
                </button>
                <div class="main-nav-catalog-subs">
                  <a href="/catalog/${slugify(cat.name)}" class="main-nav-catalog-sub main-nav-catalog-sub--all">Все товары категории</a>
                  ${cat.subs
                    .slice(0, 8)
                    .map((sub) => `<a href="/catalog/${slugify(cat.name)}/${slugify(sub)}" class="main-nav-catalog-sub">${escapeHtml(sub)}</a>`)
                    .join("")}
                </div>
              </section>
            `)
            .join("")}
        </div>
      `
    );
  }

  const closeMenu = () => {
    mainNav.classList.remove("is-open");
    mainNav.classList.remove("is-catalog-view");
    if (catalogPanel) catalogPanel.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Открыть меню");
    if (menuBtnIcon) menuBtnIcon.textContent = "menu";
  };

  const openCatalogView = () => {
    if (!catalogPanel) return;
    mainNav.classList.add("is-catalog-view");
    catalogPanel.hidden = false;
  };

  const closeCatalogView = () => {
    mainNav.classList.remove("is-catalog-view");
    if (catalogPanel) catalogPanel.hidden = true;
  };

  menuBtn.addEventListener("click", () => {
    const nextOpen = !mainNav.classList.contains("is-open");
    mainNav.classList.toggle("is-open", nextOpen);
    if (!nextOpen) closeCatalogView();
    menuBtn.setAttribute("aria-expanded", String(nextOpen));
    menuBtn.setAttribute("aria-label", nextOpen ? "Закрыть меню" : "Открыть меню");
    if (menuBtnIcon) menuBtnIcon.textContent = nextOpen ? "close" : "menu";
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  if (catalogOpenBtn) {
    catalogOpenBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openCatalogView();
    });
  }

  const backBtn = mainNav.querySelector("[data-nav-catalog-back]");
  if (backBtn) {
    backBtn.addEventListener("click", (event) => {
      event.preventDefault();
      closeCatalogView();
    });
  }

  mainNav.querySelectorAll(".main-nav-catalog-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".main-nav-catalog-group");
      if (!group) return;
      const isOpen = group.classList.contains("is-open");
      mainNav.querySelectorAll(".main-nav-catalog-group").forEach((el) => {
        el.classList.remove("is-open");
        const toggle = el.querySelector(".main-nav-catalog-toggle");
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        group.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) closeMenu();
  });

  window.addEventListener("popstate", closeMenu);
}

function setupCatalogMegaMenu() {
  const catalogBtn = document.querySelector(".header-catalog-btn");
  const megaWrap = document.getElementById("catalogMegaWrap");
  const megaMenu = document.getElementById("catalogMegaMenu");
  if (!catalogBtn || !megaWrap || !megaMenu) return;

  const isDesktop = () => window.matchMedia("(min-width: 981px)").matches;

  const categories = getCatalogMenuCategories();

  const escapeHtml = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const columns = [[], [], [], []];
  categories.forEach((cat, index) => {
    columns[index % 4].push(cat);
  });

  const blocksMarkup = columns
    .map((column) => `
      <div class="catalog-mega-col">
        ${column
          .map((cat) => `
            <div class="catalog-mega-block">
              <a class="catalog-mega-title" href="/catalog/${slugify(cat.name)}">${escapeHtml(cat.name)}</a>
              <ul class="catalog-mega-list">
                ${cat.subs
                  .slice(0, 10)
                  .map((sub) => `<li><a href="/catalog/${slugify(cat.name)}/${slugify(sub)}">${escapeHtml(sub)}</a></li>`)
                  .join("")}
              </ul>
            </div>
          `)
          .join("")}
      </div>
    `)
    .join("");
  applySafeHtml(megaMenu, `<div class="catalog-mega-grid">${blocksMarkup}</div>`);

  const close = () => {
    megaWrap.hidden = true;
    catalogBtn.classList.remove("is-open");
    catalogBtn.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    if (!isDesktop()) return;
    megaWrap.hidden = false;
    catalogBtn.classList.add("is-open");
    catalogBtn.setAttribute("aria-expanded", "true");
  };

  catalogBtn.setAttribute("aria-expanded", "false");
  catalogBtn.addEventListener("click", (event) => {
    if (!isDesktop()) return;
    event.preventDefault();
    if (megaWrap.hidden) open();
    else close();
  });

  document.addEventListener("click", (event) => {
    if (megaWrap.hidden) return;
    const target = event.target;
    if (target instanceof Node && (megaWrap.contains(target) || catalogBtn.contains(target))) return;
    close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  megaMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("a")) close();
  });

  window.addEventListener("resize", () => {
    if (!isDesktop()) close();
  });

  window.addEventListener("popstate", close);
}

function syncMobileBottomNavActive() {
  const navLinks = Array.from(document.querySelectorAll(".mobile-bottom-nav .mobile-bottom-link"));
  if (!navLinks.length) return;
  const section = String(location.pathname || "/catalog").replace(/^\//, "").split("/")[0] || "catalog";
  const activeHrefBySection = new Map([
    ["catalog", "/catalog"],
    ["product", "/catalog"],
    ["favorites", "/favorites"],
    ["orders", "/orders"],
    ["cart", "/cart"]
  ]);
  const activeHref = activeHrefBySection.get(section) || "/catalog";

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
    `<div class="note">Ошибка интерфейса. Обновите страницу.<br><small>${message}</small></div>`
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

// Основная функция маршрутизации
function renderRoute() {
  syncMobileBottomNavActive();
  const parts = String(location.pathname || "/catalog").replace(/^\//, "").split("/");

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
      history.pushState({}, "", `/product/${encodeURIComponent(canonicalId)}`);
      renderRoute();
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
        <p>Организуем доставку по Москве и регионам России. Срок и стоимость рассчитываются отдельно по составу заказа и адресу.</p>
        <ul>
          <li>Самовывоз по предварительному согласованию времени выдачи.</li>
          <li>Курьерская доставка по городу в рабочие дни.</li>
          <li>Отправка транспортной компанией по РФ.</li>
        </ul>
        <p>После оформления заказа менеджер свяжется для подтверждения сроков, стоимости и способа оплаты.</p>
      `
    );
    return;
  }
  if (LEGAL_PAGE_CONFIG[parts[0]]) {
    renderLegalPage(parts[0]);
    return;
  }
  if (parts[0] === "contacts") {
    renderStaticPage(
      "Контакты",
      "Свяжитесь с нами",
      `
        <p><strong>Телефон:</strong> +7 965 277 5166</p>
        <p><strong>Email:</strong> sale@delaemseti.ru</p>
        <p><strong>Режим работы:</strong> пн-пт, 10:00-19:00 (мск)</p>
        <p class="note">Если нужна консультация по подбору оборудования, укажите бренд, артикул или задачу проекта.</p>
      `
    );
    return;
  }
  if (location.pathname === "/" || location.pathname === "") {
    history.replaceState({}, "", "/catalog");
  }
  renderRoute();
}

// Application bootstrap
async function init() {
  try {
    applySafeHtml(appEl, `
      <section class="app-loading" aria-live="polite">
        <div class="app-loading__head">
          <span class="app-loading__spinner" aria-hidden="true"></span>
          <h1>Загружаем каталог</h1>
        </div>
        <p>Подтягиваем товары, цены и изображения.</p>
      </section>
    `);
    applyRandomLogoAccent();
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    const response = await fetch("/api/products");
    const rawProducts = await response.json();
    const visibleProducts = rawProducts.filter((x) => isStorefrontVisibleProduct(x));

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
    loadCart(state, state.products);
    updateCartBadges(state, cartQtyEl);
    if (miniCartEl) miniCartEl.classList.add("hidden");
    setupMobileMenu();
    setupCatalogMegaMenu();
    safeRenderRoute();

    // Global app event handlers
    window.addEventListener("popstate", safeRenderRoute);
    window.addEventListener("error", (event) => renderFatalError(event.error || event.message || event));
    window.addEventListener("unhandledrejection", (event) => renderFatalError(event.reason || event));
    
    cartOpenBtn.addEventListener("click", () => {
      history.pushState({}, "", "/cart");
      safeRenderRoute();
    });

    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("/admin")) return;
      if (!href.startsWith("/")) return;
      event.preventDefault();
      if (location.pathname !== href) {
        history.pushState({}, "", href);
        safeRenderRoute();
      }
    });

  } catch (error) {
    console.error('Error initializing app:', error);
    applySafeHtml(appEl, `<p>Ошибка загрузки данных. Пожалуйста, обновите страницу.</p>`);
  }
}

// Запуск приложения
init();
