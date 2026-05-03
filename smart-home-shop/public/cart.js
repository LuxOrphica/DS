import { PLACEHOLDER_IMAGE } from './config.js';
import { imageTag, applySafeHtml, fixMojibake, formatPriceByCurrency } from './utils.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ru-RU');
}

function getOrderStatusMeta(status) {
  const key = String(status || '').trim();
  const map = {
    new: { text: 'Новый', css: 'order-new' },
    in_work: { text: 'В работе', css: 'order-in-work' },
    paid: { text: 'Оплачен', css: 'order-paid' },
    shipped: { text: 'Отгружен', css: 'order-shipped' },
    completed: { text: 'Завершен', css: 'order-completed' },
    cancelled: { text: 'Отменен', css: 'order-cancelled' }
  };
  return map[key] || { text: key || '-', css: 'order-unknown' };
}

function getPaymentStatusMeta(status) {
  const key = String(status || '').trim();
  const map = {
    unpaid: { text: 'Не оплачен', css: 'payment-unpaid' },
    paid: { text: 'Оплачен', css: 'payment-paid' },
    partial: { text: 'Частично оплачен', css: 'payment-partial' },
    refund: { text: 'Возврат', css: 'payment-refund' }
  };
  return map[key] || { text: key || '-', css: 'payment-unknown' };
}

function getPaymentMethodLabel(method) {
  const key = String(method || '').trim();
  const map = {
    card_on_delivery: 'Картой при получении',
    cash_on_delivery: 'Наличными при получении',
    card: 'Картой',
    cash: 'Наличными',
    invoice: 'Счет',
    sbp: 'СБП'
  };
  return map[key] || key || '-';
}

function getDeliveryMethodLabel(method) {
  const key = String(method || '').trim();
  const map = {
    courier: 'Курьер',
    pickup: 'Самовывоз',
    transport: 'Транспортная компания'
  };
  return map[key] || key || '-';
}

function getOrderLinePrice(it, formatPrice) {
  const explicit = Number(it?.priceValue ?? it?.price);
  if (Number.isFinite(explicit) && explicit > 0) {
    return formatPriceByCurrency(explicit, it?.priceCurrency || 'RUB');
  }
  const rub = Number(it?.priceRub);
  if (Number.isFinite(rub) && rub > 0) return formatPrice(rub);
  return '-';
}

function getOrderDocumentTypeMeta(rawType, title = '') {
  const source = `${String(rawType || '').trim()} ${String(title || '').trim()}`.toLowerCase();
  if (source.includes('receipt') || source.includes('чек')) {
    return { key: 'receipt', label: 'Чек', icon: 'receipt_long' };
  }
  if (source.includes('invoice') || source.includes('счет') || source.includes('счёт')) {
    return { key: 'invoice', label: 'Счёт', icon: 'request_quote' };
  }
  if (source.includes('waybill') || source.includes('наклад')) {
    return { key: 'waybill', label: 'Накладная', icon: 'local_shipping' };
  }
  if (source.includes('upd') || source.includes('упд')) {
    return { key: 'upd', label: 'УПД', icon: 'description' };
  }
  if (source.includes('contract') || source.includes('договор')) {
    return { key: 'contract', label: 'Договор', icon: 'contract' };
  }
  if (source.includes('spec') || source.includes('специф')) {
    return { key: 'spec', label: 'Спецификация', icon: 'description' };
  }
  return { key: 'document', label: 'Документ', icon: 'picture_as_pdf' };
}

function getExpectedOrderDocuments(order) {
  const expected = [{ key: 'confirmation', label: 'Подтверждение заказа' }];
  const paymentMethod = String(order?.paymentMethod || '').trim();
  const paymentStatus = String(order?.paymentStatus || '').trim();
  const status = String(order?.status || '').trim();
  if (paymentMethod === 'invoice') expected.push({ key: 'invoice', label: 'Счёт' });
  if (paymentStatus === 'paid' || paymentStatus === 'partial') expected.push({ key: 'receipt', label: 'Чек' });
  if (status === 'shipped' || status === 'completed') expected.push({ key: 'waybill', label: 'Накладная' });
  return expected.filter((doc, index, arr) => arr.findIndex((x) => x.key === doc.key) === index);
}

function renderOrderDocumentsBlock(order) {
  const docs = Array.isArray(order?.orderDocuments) ? order.orderDocuments : [];
  const expected = getExpectedOrderDocuments(order);
  const actualItems = docs.length
    ? docs.map((doc) => {
        const meta = getOrderDocumentTypeMeta(doc?.type, doc?.title);
        const title = String(doc?.title || '').trim() || meta.label;
        return `
          <li class="order-doc-item">
            <a class="order-doc-link" href="${escapeHtml(doc?.url || '')}" target="_blank" rel="noopener noreferrer">
              <span class="material-symbols-rounded msi order-doc-icon" aria-hidden="true">picture_as_pdf</span>
              <span class="order-doc-copy">
                <span class="order-doc-title">${escapeHtml(title)}</span>
                <span class="order-doc-meta">${escapeHtml(meta.label)} · PDF</span>
              </span>
              <span class="order-doc-action">Скачать</span>
            </a>
          </li>
        `;
      }).join('')
    : '';
  const existingKeys = new Set(docs.map((doc) => getOrderDocumentTypeMeta(doc?.type, doc?.title).key));
  const expectedItems = expected
    .filter((item) => !existingKeys.has(item.key))
    .map((item) => `<li>${escapeHtml(item.label)}</li>`)
    .join('');
  return `
    <section class="order-card-block order-documents-block">
      <h3>Документы заказа</h3>
      ${actualItems
        ? `<ul class="order-doc-list">${actualItems}</ul>`
        : `<div class="note">Документы появятся после обработки заказа.</div>`}
      ${expectedItems
        ? `
      <div class="order-doc-hint">
        <div class="order-doc-hint-title">Обычно здесь появляются:</div>
        <ul class="order-doc-expected">${expectedItems}</ul>
      </div>
      `
        : ''}
    </section>
  `;
}

function getDeliverySummary(order) {
  const method = getDeliveryMethodLabel(order?.deliveryMethod);
  if (method && method !== '-') return method;
  const comment = String(order?.deliveryComment || '').trim();
  if (comment) return comment;
  return 'Не указана';
}

function buildOrderImageResolvers(products) {
  const byId = new Map();
  const byArticle = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    if (!product || typeof product !== 'object') return;
    const image = String(product.image || '').trim();
    if (!image) return;
    const id = String(product.id || '').trim();
    const article = String(product.article || '').trim().toUpperCase();
    if (id && !byId.has(id)) byId.set(id, image);
    if (article && !byArticle.has(article)) byArticle.set(article, image);
  });
  return { byId, byArticle };
}

function getOrderItemImage(item, resolvers) {
  const direct = String(item?.image || '').trim();
  if (direct) return direct;
  const id = String(item?.productId || '').trim();
  if (id && resolvers.byId.has(id)) return resolvers.byId.get(id);
  const article = String(item?.article || '').trim().toUpperCase();
  if (article && resolvers.byArticle.has(article)) return resolvers.byArticle.get(article);
  return '';
}
function renderOrderBadge(meta) {
  return `<span class="order-status-badge ${meta.css}">${escapeHtml(fixMojibake(meta.text))}</span>`;
}

function showConfirmDialog({ title, text, confirmText = 'Удалить', cancelText = 'Отмена', onConfirm }) {
  let host = document.getElementById('cartConfirmHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'cartConfirmHost';
    document.body.appendChild(host);
  }
  host.className = 'cart-confirm-host';

  applySafeHtml(host, `
    <div class="cart-confirm-backdrop" data-confirm-cancel></div>
    <div class="cart-confirm-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      <div class="cart-confirm-actions">
        <button type="button" class="button button-outline" data-confirm-cancel>${escapeHtml(cancelText)}</button>
        <button type="button" class="button cart-confirm-danger" data-confirm-ok>${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `);

  const close = () => {
    if (!host) return;
    host.className = '';
    host.innerHTML = '';
  };

  host.querySelectorAll('[data-confirm-cancel]').forEach((btn) => {
    btn.addEventListener('click', close);
  });
  host.querySelectorAll('[data-confirm-ok]').forEach((btn) => {
    btn.addEventListener('click', () => {
      close();
      if (typeof onConfirm === 'function') onConfirm();
    });
  });
}

function showAddedToCartToast() {
  let host = document.getElementById('cartToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'cartToastHost';
    host.className = 'cart-toast-host';
    document.body.appendChild(host);
  }

  applySafeHtml(host, `
    <div class="cart-toast">
      <span>Товар успешно добавлен в корзину</span>
      <a href="/cart" class="cart-toast-link">Перейти в корзину</a>
    </div>
  `);

  host.classList.add('show');
  clearTimeout(showAddedToCartToast._timer);
  showAddedToCartToast._timer = setTimeout(() => {
    host.classList.remove('show');
  }, 2600);
}
showAddedToCartToast._timer = null;

const MY_ORDER_IDS_STORAGE_KEY = "smartHomeShopMyOrderIds";
const MY_ORDER_IDS_LIMIT = 20;

function getStoredOrderIds() {
  try {
    const raw = localStorage.getItem(MY_ORDER_IDS_STORAGE_KEY);
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    const out = [];
    const seen = new Set();
    for (const value of parsed) {
      const id = String(value || "").trim();
      if (!/^ORD-\d{8,}$/.test(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= MY_ORDER_IDS_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}

function rememberOrderId(orderId) {
  const id = String(orderId || "").trim();
  if (!/^ORD-\d{8,}$/.test(id)) return;
  const next = [id, ...getStoredOrderIds().filter((x) => x !== id)].slice(0, MY_ORDER_IDS_LIMIT);
  try {
    localStorage.setItem(MY_ORDER_IDS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota/private mode issues
  }
}

export function addToCart(state, productId, cartQtyEl, miniCartEl, options = {}) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  const existing = state.cart.find((item) => item.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      article: product.article,
      price: Number(product.price || 0),
      priceRub: Number(product.price || 0),
      priceCurrency: String(product.priceCurrency || 'RUB').toUpperCase(),
      priceValue: Number(product.priceValue ?? product.price ?? 0),
      image: product.image,
      qty: 1
    });
  }

  state.lastOrder = null;
  updateCartBadges(state, cartQtyEl);
  if (miniCartEl) miniCartEl.classList.add('hidden');
  const showToast = options && options.showToast !== false;
  if (showToast) showAddedToCartToast();
}

export function changeQty(state, productId, delta) {
  const item = state.cart.find((it) => it.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((it) => it.id !== productId);
  }
}

export function getCartCount(state) {
  return state.cart.reduce((sum, item) => sum + item.qty, 0);
}

export function getCartQtyByProduct(state, productId) {
  const id = String(productId || "").trim();
  if (!id) return 0;
  const row = (state.cart || []).find((item) => String(item.id || "").trim() === id);
  return Number(row && row.qty) || 0;
}

export function getCartTotal(state) {
  return state.cart.reduce((sum, item) => sum + item.qty * item.price, 0);
}

export function syncCardBuyBadges(state, rootEl = document) {
  const root = rootEl || document;
  root.querySelectorAll("[data-card-buy]").forEach((btn) => {
    const id = String(btn.dataset.cardBuy || "").trim();
    const qty = getCartQtyByProduct(state, id);
    const badge = btn.querySelector("[data-card-buy-badge]");
    if (!badge) return;
    badge.textContent = String(qty);
    badge.classList.toggle("is-empty", qty < 1);
  });
}

export function updateCartBadges(state, cartQtyEl) {
  const count = getCartCount(state);
  if (cartQtyEl) {
    cartQtyEl.textContent = String(count);
    cartQtyEl.classList.toggle('is-empty', count < 1);
  }
  document.querySelectorAll('.js-cart-qty').forEach((el) => {
    el.textContent = String(count);
    el.classList.toggle('is-empty', count < 1);
  });
}

export function renderMiniCart(state, miniCartEl, imageTagFn) {
  if (state.cart.length === 0) {
    applySafeHtml(miniCartEl, `
      <div class="note">Корзина пустая</div>
      <div class="mini-actions">
        <button class="button button-plain" data-close-mini type="button">Продолжить покупки</button>
        <a class="button button-outline" href="/cart" data-close-mini>Оформить заказ</a>
      </div>
    `);
  } else {
    const first = state.cart[0];
    applySafeHtml(miniCartEl, `
      <div class="mini-row">
        ${imageTagFn(first.image, first.name, '', PLACEHOLDER_IMAGE)}
        <div>${first.name}</div>
        <div>${first.qty} шт</div>
      </div>
      <div class="mini-actions">
        <button class="button button-plain" data-close-mini type="button">Продолжить покупки</button>
        <a class="button button-outline" href="/cart" data-close-mini>Оформить заказ</a>
      </div>
    `);
  }

  miniCartEl.querySelectorAll('[data-close-mini]').forEach((btn) => {
    btn.addEventListener('click', () => miniCartEl.classList.add('hidden'));
  });
}

function renderCheckoutStepper(step) {
  const cls = (name) => {
    const active = step === name ? "is-active" : "";
    const done = step === "success" || (step === "checkout" && name === "cart") ? "is-done" : "";
    return `${active} ${done}`.trim();
  };
  return `
    <ol class="checkout-steps" aria-label="Этапы оформления">
      <li class="checkout-step ${cls("cart")}"><span>1</span> Корзина</li>
      <li class="checkout-step ${cls("checkout")}"><span>2</span> Оформление</li>
      <li class="checkout-step ${cls("success")}"><span>3</span> Заказ создан</li>
    </ol>
  `;
}

function setCheckoutMessage(el, text, type = "info") {
  if (!el) return;
  el.textContent = String(text || "");
  el.classList.remove("is-error", "is-success", "is-info");
  el.classList.add(type === "error" ? "is-error" : type === "success" ? "is-success" : "is-info");
}

function clearCheckoutErrors(formEl) {
  if (!formEl) return;
  formEl.querySelectorAll(".input").forEach((el) => el.classList.remove("is-invalid"));
  formEl.querySelectorAll("[data-field-error]").forEach((el) => {
    el.textContent = "";
    el.classList.remove("is-visible");
  });
}

function showCheckoutErrors(formEl, errors) {
  if (!formEl || !errors) return;
  for (const [field, message] of Object.entries(errors)) {
    const input = formEl.querySelector(`[name="${field}"]`);
    if (input) input.classList.add("is-invalid");
    const err = formEl.querySelector(`[data-field-error="${field}"]`);
    if (err) {
      err.textContent = String(message || "");
      err.classList.add("is-visible");
    }
  }
}

function validateCheckoutCustomer(customer) {
  const errors = {};
  const name = String(customer?.name || "").trim();
  const phone = String(customer?.phone || "").trim();
  const address = String(customer?.address || "").trim();
  const digits = phone.replace(/\D+/g, "");

  if (name.length < 2) errors.name = "Введите имя (минимум 2 символа).";
  if (digits.length < 10) errors.phone = "Укажите корректный телефон.";
  if (address.length < 5) errors.address = "Укажите адрес доставки.";

  return errors;
}

function formatPhoneMask(raw) {
  const digits = String(raw || "").replace(/\D+/g, "");
  const normalized = digits.startsWith("8")
    ? `7${digits.slice(1)}`
    : digits.startsWith("7")
      ? digits
      : `7${digits}`;
  const d = normalized.slice(0, 11);
  const p1 = d.slice(1, 4);
  const p2 = d.slice(4, 7);
  const p3 = d.slice(7, 9);
  const p4 = d.slice(9, 11);
  let out = "+7";
  if (p1) out += ` (${p1}`;
  if (p1.length === 3) out += ")";
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

function bindCheckoutRealtimeValidation(formEl, messageEl) {
  if (!formEl) return;
  const fields = ["name", "phone", "address"];
  const phoneEl = formEl.querySelector('input[name="phone"]');
  if (phoneEl) {
    phoneEl.addEventListener("input", () => {
      phoneEl.value = formatPhoneMask(phoneEl.value);
    });
    phoneEl.addEventListener("focus", () => {
      if (!String(phoneEl.value || "").trim()) phoneEl.value = "+7 ";
    });
  }

  const validateLive = () => {
    const customer = {
      name: String(formEl.querySelector('input[name="name"]')?.value || "").trim(),
      phone: String(formEl.querySelector('input[name="phone"]')?.value || "").trim(),
      address: String(formEl.querySelector('input[name="address"]')?.value || "").trim()
    };
    const errors = validateCheckoutCustomer(customer);
    clearCheckoutErrors(formEl);
    if (Object.keys(errors).length > 0) {
      showCheckoutErrors(formEl, errors);
      setCheckoutMessage(messageEl, "Заполните обязательные поля.", "error");
    } else {
      setCheckoutMessage(messageEl, "", "info");
    }
  };

  fields.forEach((f) => {
    const el = formEl.querySelector(`[name="${f}"]`);
    if (!el) return;
    el.addEventListener("blur", validateLive);
    el.addEventListener("input", () => {
      if (el.classList.contains("is-invalid")) validateLive();
    });
  });
}

function isStorefrontVisibleItem(product) {
  if (!product || typeof product !== "object") return false;
  const status = String(product.status || "active").trim().toLowerCase();
  if (!(status === "" || status === "active")) return false;
  if (Number(product.is_extra || 0) === 1) return false;
  return true;
}

function pickEmptyCartRecommendations(products, limit = 8) {
  const visible = (Array.isArray(products) ? products : []).filter(isStorefrontVisibleItem);
  if (!visible.length) return [];

  const byFlag = visible.filter((p) => Number(p?.isBrandFeatured || p?.is_brand_featured || 0) === 1);
  const byFlagSorted = byFlag
    .slice()
    .sort((a, b) => Number(b.updatedAt || b.updated_at || 0) - Number(a.updatedAt || a.updated_at || 0));

  const selected = [];
  const used = new Set();
  for (const p of byFlagSorted) {
    if (selected.length >= limit) break;
    const id = String(p?.id || "").trim();
    if (!id || used.has(id)) continue;
    selected.push(p);
    used.add(id);
  }

  const pool = visible
    .filter((p) => {
      const id = String(p?.id || "").trim();
      return id && !used.has(id);
    })
    .sort(() => Math.random() - 0.5);

  for (const p of pool) {
    if (selected.length >= limit) break;
    selected.push(p);
  }
  return selected.slice(0, limit);
}

export function renderCartPage(state, appEl, changeQtyFn, updateCartBadgesFn, renderMiniCartFn, miniCartEl, imageTagFn, formatPrice) {
  const itemsCount = getCartCount(state);
  const total = getCartTotal(state);
  const products = Array.isArray(state.products) ? state.products : [];
  const orderImageResolvers = buildOrderImageResolvers(products);
  const emptyCartRecommendations = pickEmptyCartRecommendations(products, 8);
  const checkoutStep = state.cart.length === 0 && state.lastOrder ? "success" : "cart";
  const goodsWord =
    itemsCount % 10 === 1 && itemsCount % 100 !== 11
      ? 'товар'
      : itemsCount % 10 >= 2 && itemsCount % 10 <= 4 && (itemsCount % 100 < 10 || itemsCount % 100 >= 20)
        ? 'товара'
        : 'товаров';

  applySafeHtml(appEl, `
    <section class="cart-page ${state.cart.length > 0 ? 'has-mobile-checkout-bar' : ''}">
      ${state.cart.length === 0 && !state.lastOrder ? '' : `
      <div class="cart-header">
        <div class="cart-title-row">
          <h1>Корзина</h1>
          <span>${itemsCount} ${goodsWord}</span>
        </div>
        ${
          state.cart.length > 0
            ? `
        <div class="cart-toolbar">
          <button class="button button-plain cart-toolbar-btn" type="button" data-toggle-all title="Выбрать все">
            <span class="material-symbols-rounded msi" aria-hidden="true">done_all</span>
            <span class="cart-toolbar-label">Выбрать все</span>
          </button>
          <button class="button button-plain cart-toolbar-btn" type="button" data-remove-selected title="Удалить выбранные">
            <span class="material-symbols-rounded msi" aria-hidden="true">delete_outline</span>
            <span class="cart-toolbar-label">Удалить выбранные</span>
          </button>
          <button class="button button-plain cart-toolbar-btn" type="button" data-clear-cart title="Удалить все">
            <span class="material-symbols-rounded msi" aria-hidden="true">delete</span>
            <span class="cart-toolbar-label">Удалить все</span>
          </button>
        </div>
          `
            : ""
        }
      </div>
      `}
      ${state.cart.length === 0 && !state.lastOrder ? '' : renderCheckoutStepper(checkoutStep)}

      ${
        state.cart.length === 0
          ? (state.lastOrder
              ? `
        <div class="cart-empty cart-success">
          <div class="order-feedback">
            <div><strong>Спасибо, заказ оформлен.</strong></div>
            <div>Номер заказа: <strong>${escapeHtml(state.lastOrder.orderId || '')}</strong></div>
            <div class="order-feedback-badges">
              ${renderOrderBadge(getOrderStatusMeta(state.lastOrder.status || 'new'))}
              ${renderOrderBadge(getPaymentStatusMeta(state.lastOrder.paymentStatus || 'unpaid'))}
            </div>
            <div class="note">Оплата: ${escapeHtml(getPaymentMethodLabel(state.lastOrder.paymentMethod || 'card_on_delivery'))}</div>
            <div class="mini-actions" style="margin-top:6px;">
              <a class="button button-outline" href="/orders/${encodeURIComponent(String(state.lastOrder.orderId || ''))}">Перейти в заказы</a>
              <a class="button button-plain" href="/catalog">Продолжить покупки</a>
            </div>
          </div>
        </div>
      `
              : `
        <div class="cart-empty-stack">
          <div class="cart-empty cart-empty-main">
            <div class="cart-empty-hero">
              <div class="cart-empty-copy">
                <h3 class="cart-empty-title">Корзина пуста</h3>
                <p class="cart-empty-text">Добавьте товары из каталога, чтобы собрать заказ и перейти к оформлению.</p>
              </div>
            </div>
            <div class="cart-empty-actions">
              <a class="button" href="/catalog">В каталог</a>
              <a class="button button-outline" href="/brands">Бренды</a>
            </div>
          </div>
          ${
            emptyCartRecommendations.length
              ? `
          <div class="cart-empty cart-empty-recommendations">
            <div class="cart-empty-products">
              <div class="cart-empty-reco-title">Популярные товары</div>
              <div class="cart-empty-products-grid">
                ${emptyCartRecommendations
                  .slice(0, 6)
                  .map((p) => `
                  <a class="cart-empty-product-card" href="/product/${encodeURIComponent(p.id)}">
                    <div class="cart-empty-product-image">
                      ${imageTagFn(p.image, p.name, '', PLACEHOLDER_IMAGE)}
                    </div>
                    <div class="cart-empty-product-name">${escapeHtml(p.name || '')}</div>
                    <div class="cart-empty-product-price">${formatPriceByCurrency(p.priceValue ?? p.price, p.priceCurrency)}</div>
                  </a>
                `)
                  .join("")}
              </div>
            </div>
          </div>
          `
              : ""
          }
        </div>
      `)
          : `
        <div class="cart-layout">
          <div class="cart-main">
            <div class="cart-list">
              ${state.cart
                .map(
                  (item) => `
                <article class="cart-item">
                  <div class="cart-item-check">
                    <input class="check-input" type="checkbox" checked data-select-item="${escapeHtml(item.id)}" aria-label="Выбран товар ${escapeHtml(item.name)}" />
                  </div>
                  <a class="cart-item-image" href="/product/${encodeURIComponent(item.id)}">
                    ${imageTagFn(item.image, item.name, '', PLACEHOLDER_IMAGE)}
                  </a>
                  <div class="cart-item-info">
                    <a class="cart-item-name" href="/product/${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a>
                    <div class="cart-item-sku">Артикул: ${escapeHtml(item.article || '-')}</div>
                    <div class="cart-item-price">
                      ${formatPriceByCurrency(item.priceValue ?? item.price, item.priceCurrency)} / шт
                      ${String(item.priceCurrency || 'RUB').toUpperCase() === 'EUR' ? `<span class="price-approx-inline">≈ ${formatPrice(item.priceRub ?? item.price)}</span>` : ''}
                    </div>
                  </div>
                  <div class="cart-item-controls">
                    <div class="qty-row">
                      <button class="qty-btn" type="button" data-delta="-1" data-id="${escapeHtml(item.id)}">−</button>
                      <strong>${item.qty}</strong>
                      <button class="qty-btn" type="button" data-delta="1" data-id="${escapeHtml(item.id)}">+</button>
                    </div>
                    <div class="cart-item-total">${formatPrice(item.price * item.qty)}</div>
                    <button class="button button-plain cart-remove" type="button" data-remove="${escapeHtml(item.id)}" aria-label="Удалить">
                      <span class="material-symbols-rounded msi" aria-hidden="true">delete</span>
                    </button>
                  </div>
                </article>
              `
                )
                .join('')}
            </div>
          </div>

                    <aside class="cart-side">
            <div class="cart-summary">
              <div class="summary-cta">
                <button class="button cart-submit" type="button" data-open-checkout>Перейти к оформлению</button>
              </div>
              <div class="note" style="margin-top:8px;">Контакты и оплата заполняются в окне оформления.</div>
              <div class="summary-line summary-total" style="margin-top:10px;">
                <span>Итого</span>
                <strong>${formatPrice(total)}</strong>
              </div>
            </div>
          </aside>
        </div>
      `
      }
      ${
        state.cart.length > 0
          ? `
      <div class="mobile-checkout-bar" role="region" aria-label="Быстрое оформление">
        <button class="mobile-checkout-btn" type="button" data-mobile-checkout>
          <span class="mobile-checkout-side">${itemsCount} ${goodsWord}</span>
          <span class="mobile-checkout-center">К оформлению</span>
          <span class="mobile-checkout-side mobile-checkout-side-right">${formatPrice(total)}</span>
        </button>
      </div>
      `
          : ""
      }
    </section>
  `);

  appEl.querySelectorAll('[data-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      changeQtyFn(state, btn.dataset.id, Number(btn.dataset.delta));
      updateCartBadgesFn(state);
      renderCartPage(state, appEl, changeQtyFn, updateCartBadgesFn, renderMiniCartFn, miniCartEl, imageTagFn, formatPrice);
      renderMiniCartFn(state, miniCartEl, imageTagFn);
    });
  });

  appEl.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cart = state.cart.filter((it) => it.id !== btn.dataset.remove);
      updateCartBadgesFn(state);
      renderCartPage(state, appEl, changeQtyFn, updateCartBadgesFn, renderMiniCartFn, miniCartEl, imageTagFn, formatPrice);
      renderMiniCartFn(state, miniCartEl, imageTagFn);
    });
  });

  appEl.querySelectorAll('[data-clear-cart]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showConfirmDialog({
        title: 'Удалить все товары?',
        text: 'Корзина будет полностью очищена.',
        confirmText: 'Удалить',
        onConfirm: () => {
          state.cart = [];
          state.lastOrder = null;
          updateCartBadgesFn(state);
          renderCartPage(state, appEl, changeQtyFn, updateCartBadgesFn, renderMiniCartFn, miniCartEl, imageTagFn, formatPrice);
          renderMiniCartFn(state, miniCartEl, imageTagFn);
        }
      });
    });
  });

  const itemChecks = Array.from(appEl.querySelectorAll('[data-select-item]'));
  const removeSelectedButtons = Array.from(appEl.querySelectorAll('[data-remove-selected]'));
  const toggleAllButtons = Array.from(appEl.querySelectorAll('[data-toggle-all]'));
  const getSelectedIds = () =>
    itemChecks
      .filter((el) => el.checked)
      .map((el) => String(el.dataset.selectItem || '').trim())
      .filter(Boolean);

  const syncSelectionUi = () => {
    const selected = getSelectedIds();
    const hasItems = itemChecks.length > 0;
    const allSelected = hasItems && selected.length === itemChecks.length;
    removeSelectedButtons.forEach((btn) => {
      btn.disabled = selected.length === 0;
      const span = btn.querySelector('.cart-toolbar-label');
      if (span) span.textContent = selected.length > 0 ? `Удалить выбранные (${selected.length})` : 'Удалить выбранные';
    });
    toggleAllButtons.forEach((btn) => {
      const span = btn.querySelector('.cart-toolbar-label');
      if (span) span.textContent = allSelected ? 'Снять выбор' : 'Выбрать все';
    });
  };

  itemChecks.forEach((cb) => cb.addEventListener('change', syncSelectionUi));

  toggleAllButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const selectedCount = getSelectedIds().length;
      const makeChecked = selectedCount !== itemChecks.length;
      itemChecks.forEach((cb) => {
        cb.checked = makeChecked;
      });
      syncSelectionUi();
    });
  });

  removeSelectedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const selectedIds = new Set(getSelectedIds());
      if (!selectedIds.size) return;
      showConfirmDialog({
        title: `Удалить выбранные товары (${selectedIds.size})?`,
        text: 'Эти позиции будут удалены из корзины.',
        confirmText: 'Удалить',
        onConfirm: () => {
          state.cart = state.cart.filter((it) => !selectedIds.has(String(it.id || '').trim()));
          updateCartBadgesFn(state);
          renderCartPage(state, appEl, changeQtyFn, updateCartBadgesFn, renderMiniCartFn, miniCartEl, imageTagFn, formatPrice);
          renderMiniCartFn(state, miniCartEl, imageTagFn);
        }
      });
    });
  });

  syncSelectionUi();

  const openCheckoutModal = () => {
    if (state.cart.length === 0) return;
    let host = document.getElementById('checkoutModalHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'checkoutModalHost';
      document.body.appendChild(host);
    }
    host.className = 'checkout-modal-host';

    applySafeHtml(host, `
      <div class="checkout-modal-backdrop" data-checkout-close></div>
      <div class="checkout-modal-dialog" role="dialog" aria-modal="true" aria-label="Оформление">
        <div class="checkout-modal-head">
          <h3>Оформление</h3>
          <button class="button button-plain checkout-modal-close" type="button" data-checkout-close aria-label="Закрыть">
            <span class="material-symbols-rounded msi" aria-hidden="true">close</span>
          </button>
        </div>
        <form class="cart-summary" id="checkoutModalForm" novalidate>
          <div class="summary-line summary-total">
            <span>${itemsCount} ${goodsWord}</span>
            <strong>${formatPrice(total)}</strong>
          </div>
          <div class="summary-block">
            <div class="summary-block-title">Контакты для заказа</div>
            <div class="summary-form">
              <div class="summary-field">
                <input class="input" name="name" placeholder="Имя" autocomplete="name" required />
                <div class="summary-field-error" data-field-error="name"></div>
              </div>
              <div class="summary-field">
                <input class="input" name="phone" placeholder="Телефон" autocomplete="tel" required />
                <div class="summary-field-error" data-field-error="phone"></div>
              </div>
              <div class="summary-field">
                <input class="input" name="address" placeholder="Адрес" autocomplete="street-address" required />
                <div class="summary-field-error" data-field-error="address"></div>
              </div>
            </div>
          </div>
          <fieldset class="summary-payment summary-block">
            <legend>Оплата</legend>
            <label class="radio-field"><input class="radio-input" type="radio" name="payment" value="card_on_delivery" checked /><span class="radio-label">Картой при получении</span></label>
            <label class="radio-field"><input class="radio-input" type="radio" name="payment" value="cash" /><span class="radio-label">Наличными</span></label>
            <label class="radio-field"><input class="radio-input" type="radio" name="payment" value="sbp" /><span class="radio-label">СБП (тест)</span></label>
          </fieldset>
          <div id="checkoutModalMessage" class="note checkout-message"></div>
          <button class="button cart-submit" type="submit">Подтвердить заказ</button>
        </form>
      </div>
    `);

    const closeModal = () => {
      if (!host) return;
      host.className = '';
      host.innerHTML = '';
    };
    host.querySelectorAll('[data-checkout-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });

    const modalForm = document.getElementById('checkoutModalForm');
    const modalMessageEl = document.getElementById('checkoutModalMessage');
    if (!modalForm || !modalMessageEl) return;

    bindCheckoutRealtimeValidation(modalForm, modalMessageEl);
    modalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearCheckoutErrors(modalForm);
      if (state.cart.length === 0) {
        setCheckoutMessage(modalMessageEl, 'Корзина пустая.', 'error');
        return;
      }

      const form = new FormData(event.target);
      const customer = {
        name: String(form.get('name') || '').trim(),
        phone: String(form.get('phone') || '').trim(),
        address: String(form.get('address') || '').trim()
      };
      const validationErrors = validateCheckoutCustomer(customer);
      if (Object.keys(validationErrors).length > 0) {
        showCheckoutErrors(modalForm, validationErrors);
        setCheckoutMessage(modalMessageEl, 'Проверьте поля формы перед отправкой.', 'error');
        return;
      }

      const payload = {
        customer,
        items: state.cart,
        total: getCartTotal(state),
        paymentMethod: String(form.get('payment') || 'card_on_delivery'),
        deliveryComment: ''
      };

      try {
        const submitBtn = modalForm.querySelector('.cart-submit');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Оформляем заказ...';
        }
        setCheckoutMessage(modalMessageEl, 'Отправляем заказ...', 'info');

        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(fixMojibake(data.error || 'Ошибка заказа'));
        }

        state.cart = [];
        state.lastOrder = {
          orderId: data.orderId || '',
          status: data.status || 'new',
          paymentStatus: data.paymentStatus || 'unpaid',
          paymentMethod: data.paymentMethod || 'card_on_delivery',
          deliveryMethod: data.deliveryMethod || ''
        };
        rememberOrderId(state.lastOrder.orderId);

        updateCartBadgesFn(state);
        renderMiniCartFn(state, miniCartEl, imageTagFn);
        closeModal();
        renderCartPage(state, appEl, changeQtyFn, updateCartBadgesFn, renderMiniCartFn, miniCartEl, imageTagFn, formatPrice);
      } catch (err) {
        setCheckoutMessage(modalMessageEl, fixMojibake(String(err?.message || 'Ошибка оформления')), 'error');
      } finally {
        const submitBtn = modalForm.querySelector('.cart-submit');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Подтвердить заказ';
        }
      }
    });
  };

  const openCheckoutSafe = () => {
    try {
      openCheckoutModal();
    } catch (error) {
      console.error("Checkout modal open failed", error);
    }
  };

  appEl.querySelectorAll('[data-mobile-checkout], [data-open-checkout]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCheckoutSafe();
    });
  });

  appEl.addEventListener('click', (event) => {
    const checkoutBtn = event.target.closest('[data-mobile-checkout], [data-open-checkout]');
    if (!checkoutBtn) return;
    event.preventDefault();
    event.stopPropagation();
    openCheckoutSafe();
  });

}

export function renderOrdersCabinetPage(state, appEl, formatPrice, initialQuery = '') {
  const prefill = String(initialQuery || '').trim();
  const products = Array.isArray(state?.products) ? state.products : [];
  const orderImageResolvers = buildOrderImageResolvers(products);
  applySafeHtml(appEl, `
    <section class="orders-cabinet">
      <div class="orders-cabinet-header">
        <h1>Заказы</h1>
      </div>
      <div id="ordersLookupMessage" class="note" style="margin-top:2px;"></div>
      <div id="ordersLookupResults" class="orders-results"></div>
    </section>
  `);

  const msg = document.getElementById('ordersLookupMessage');
  const results = document.getElementById('ordersLookupResults');
  if (!msg || !results) return;

  const parseApiJson = async (response) => {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      const body = await response.text();
      const shortBody = String(body || '').slice(0, 120).toLowerCase();
      if (shortBody.includes('<!doctype') || shortBody.includes('<html')) {
        throw new Error('Server returned HTML instead of API JSON. Restart backend and refresh page.');
      }
      throw new Error(`Unexpected API response format (HTTP ${response.status})`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`Invalid JSON response (HTTP ${response.status})`);
    }
  };

  const buildOrderHistory = (statusHistory) => {
    const historyRows = [];
    const seenHistoryRows = new Set();
    (Array.isArray(statusHistory) ? statusHistory : []).slice().reverse().forEach((h) => {
      const status = String(h?.status || '').trim();
      const paymentStatus = String(h?.paymentStatus || '').trim();
      const key = `${String(h?.at || '')}|${status}|${paymentStatus}`;
      if (seenHistoryRows.has(key)) return;
      seenHistoryRows.add(key);
      historyRows.push(h);
    });
    return historyRows;
  };

  const renderOrderOverviewCard = (order) => {
    const statusMeta = getOrderStatusMeta(order.status);
    const paymentMeta = getPaymentStatusMeta(order.paymentStatus);
    const items = Array.isArray(order.items) ? order.items : [];
    const firstItem = items[0] || {};
    const firstItemImage = getOrderItemImage(firstItem, orderImageResolvers);
    const moreCount = Math.max(0, items.length - 1);
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const previewName = firstItem.name
      ? `${escapeHtml(firstItem.name)}${moreCount > 0 ? ` <span class="order-preview-more">+ ещё ${moreCount}</span>` : ''}`
      : 'Состав заказа';
    return `
      <article class="order-card order-card--overview">
        <div class="order-card-head">
          <div>
            <div class="order-id">${escapeHtml(order.id || '')}</div>
            <div class="note">${escapeHtml(formatDateTime(order.createdAt))}</div>
          </div>
          <div class="order-card-badges">
            ${renderOrderBadge(statusMeta)}
            ${renderOrderBadge(paymentMeta)}
          </div>
        </div>

        <div class="order-overview">
          <a class="order-overview-thumb" href="/orders/${encodeURIComponent(String(order.id || ''))}">
            ${imageTag(firstItemImage, firstItem.name || order.id || '', '', PLACEHOLDER_IMAGE)}
          </a>
          <div class="order-overview-main">
            <a class="order-overview-title" href="/orders/${encodeURIComponent(String(order.id || ''))}">${previewName}</a>
            <div class="order-overview-meta">
              <span>Позиций: ${items.length}</span>
              <span>Товаров: ${totalQty}</span>
            </div>
          </div>
          <div class="order-overview-side">
            <div class="order-overview-total">${escapeHtml(formatPrice(order.total))}</div>
            <a class="button button-outline order-overview-link" href="/orders/${encodeURIComponent(String(order.id || ''))}">Открыть заказ</a>
          </div>
        </div>
      </article>
    `;
  };

  const renderOrderDetailCard = (order) => {
    const statusMeta = getOrderStatusMeta(order.status);
    const paymentMeta = getPaymentStatusMeta(order.paymentStatus);
    const items = Array.isArray(order.items) ? order.items : [];
    const historyRows = buildOrderHistory(order.statusHistory);
    const historyPairs = new Set(historyRows.map((h) => `${String(h?.status || '').trim()}|${String(h?.paymentStatus || '').trim()}`));
    const hasStatusChanges = historyPairs.size > 1;
    const itemsHtml = items.length
      ? items.map((it) => `
          <tr>
            <td class="orders-lines-product">
              <div class="orders-lines-product-wrap">
                <div class="orders-lines-thumb">${imageTag(getOrderItemImage(it, orderImageResolvers), it.name || '', '', PLACEHOLDER_IMAGE)}</div>
                <div>
                  <div class="orders-lines-name">${escapeHtml(it.name || '')}</div>
                </div>
              </div>
            </td>
            <td>${escapeHtml(it.article || '-')}</td>
            <td>${Number(it.qty || 1)}</td>
            <td>${escapeHtml(getOrderLinePrice(it, formatPrice))}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4">Нет позиций</td></tr>';
    const historyHtml = historyRows
      .map((h) => `
          <div class="order-history-row">
            <span>${escapeHtml(formatDateTime(h.at))}</span>
            <span>${renderOrderBadge(getOrderStatusMeta(h.status))}</span>
            <span>${renderOrderBadge(getPaymentStatusMeta(h.paymentStatus))}</span>
          </div>
        `)
      .join('');

    return `
      <article class="order-card order-card--detail">
        <div class="order-card-head">
          <div>
            <div class="order-id">${escapeHtml(order.id || '')}</div>
            <div class="note">${escapeHtml(formatDateTime(order.createdAt))}</div>
          </div>
          <div class="order-card-badges">
            ${renderOrderBadge(statusMeta)}
            ${renderOrderBadge(paymentMeta)}
          </div>
        </div>

        <div class="order-card-meta">
          <div><strong>Оплата:</strong> ${escapeHtml(getPaymentMethodLabel(order.paymentMethod))}</div>
          <div><strong>Доставка:</strong> ${escapeHtml(getDeliverySummary(order))}</div>
          <div><strong>Сумма:</strong> ${escapeHtml(formatPrice(order.total))}</div>
          <div><strong>Адрес:</strong> ${escapeHtml(order.customerAddressMasked || order.customerAddress || '-')}</div>
        </div>

        <div class="order-card-block">
          <h3>Состав заказа</h3>
          <table class="orders-lines">
            <thead><tr><th>Товар</th><th>Артикул</th><th>Кол-во</th><th>Цена</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>

        <div class="order-card-grid">
          ${renderOrderDocumentsBlock(order)}
          ${hasStatusChanges
            ? `
          <section class="order-card-block">
            <h3>История статусов</h3>
            <div class="order-history">${historyHtml}</div>
          </section>
          `
            : ''}
        </div>
      </article>
    `;
  };

  const renderRows = (rows) => {
    if (!Array.isArray(rows) || !rows.length) {
      applySafeHtml(results, '<div class="note">Заказы не найдены.</div>');
      return;
    }
    const isDetailMode = prefill.length >= 4;
    if (isDetailMode) {
      const exact = rows.find((row) => String(row.id || '').toLowerCase() === prefill.toLowerCase()) || rows[0];
      applySafeHtml(results, `
        <div class="orders-detail-nav">
          <a class="button button-outline" href="/orders">Ко всем заказам</a>
        </div>
        ${renderOrderDetailCard(exact)}
      `);
      return;
    }
    applySafeHtml(results, rows.map(renderOrderOverviewCard).join(''));
  };

  const runLookup = async () => {
    const query = prefill;
    if (query.length < 4) {
      msg.textContent = 'Заказы не найдены.';
      results.innerHTML = '';
      return;
    }

    msg.textContent = 'Загрузка...';
    try {
      const r = await fetch(`/api/orders/lookup?query=${encodeURIComponent(query)}&limit=20`);
      const data = await parseApiJson(r);
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      msg.textContent = prefill.length >= 4 ? '' : `Найдено заказов: ${Number(data.total || 0)}.`;
      renderRows(data.rows || []);
    } catch (error) {
      msg.textContent = fixMojibake(String(error.message || 'Ошибка поиска заказов'));
      results.innerHTML = '';
    }
  };

  const runMineLookup = async () => {
    const ids = getStoredOrderIds();
    if (!ids.length) {
      msg.textContent = 'На этом устройстве пока нет локальных заказов.';
      results.innerHTML = '';
      return;
    }

    msg.textContent = 'Загружаем ваши заказы...';
    try {
      const r = await fetch(`/api/orders/mine?ids=${encodeURIComponent(ids.join(','))}&limit=20`);
      const data = await parseApiJson(r);
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      msg.textContent = `Заказов на этом устройстве: ${Number(data.total || 0)}.`;
      renderRows(data.rows || []);
    } catch (error) {
      msg.textContent = fixMojibake(String(error.message || 'Не удалось загрузить заказы'));
      results.innerHTML = '';
    }
  };

  if (prefill.length >= 4) runLookup();
  else runMineLookup();
}
