import { FAVORITES_STORAGE_KEY } from './config.js';
import { parseJsonList, pageTitle } from './utils.js';
import { rebalanceProductCardMedia, bindProductCardGalleries } from './products.js';
import { PLACEHOLDER_IMAGE } from './config.js';
import { addToCart, syncCardBuyBadges } from './cart.js';

// Загрузка избранного из localStorage
export function loadFavorites(state) {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const list = parseJsonList(raw);
    state.favorites = Array.from(new Set(list.map(String)));
  } catch {
    state.favorites = [];
  }
}

// Сохранение избранного в localStorage
export function saveFavorites(state) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites));
  } catch {
    // ignore storage errors
  }
}

// Проверка находится ли товар в избранном
export function isFavorite(state, productId) {
  return state.favorites.includes(String(productId));
}

// Переключение состояния избранного
export function toggleFavorite(state, productId) {
  const id = String(productId);
  if (isFavorite(state, id)) {
    state.favorites = state.favorites.filter((x) => x !== id);
  } else {
    state.favorites.push(id);
  }
  saveFavorites(state);
}

// Рендеринг страницы избранного
export function renderFavoritesPage(state, appEl, renderProductCard) {
  const items = state.products.filter((p) => isFavorite(state, p.id));
  appEl.innerHTML = `
    ${pageTitle("Избранное")}
    ${
      items.length
        ? `
      <section class="product-grid">
        ${items
          .map((p) => renderProductCard(p, (id) => isFavorite(state, id), PLACEHOLDER_IMAGE))
          .join("")}
      </section>
    `
        : `<p class="note">Пока пусто. Добавьте товары в избранное на карточке товара.</p>`
    }
  `;

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavorite(state, id);
      renderFavoritesPage(state, appEl, renderProductCard);
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
