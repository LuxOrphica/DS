const ui = {
  stats: document.getElementById("stats"),
  tabProducts: document.getElementById("tabProducts"),
  tabOrders: document.getElementById("tabOrders"),
  productsSection: document.getElementById("productsSection"),
  ordersSection: document.getElementById("ordersSection"),
  editorSection: document.getElementById("editorSection"),
  productsTbody: document.querySelector("#productsTable tbody"),
  ordersTbody: document.querySelector("#ordersTable tbody"),
  searchQ: document.getElementById("searchQ"),
  searchBtn: document.getElementById("searchBtn"),
  editForm: document.getElementById("editForm"),
  saveBtn: document.getElementById("saveBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  editMsg: document.getElementById("editMsg")
};

function fmtPrice(v) {
  const n = Number(v || 0);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} руб.`;
}

async function fetchJson(url, init = undefined) {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  return data;
}

function fillEditForm(product) {
  const set = (name, value) => {
    const el = ui.editForm.elements.namedItem(name);
    if (el) el.value = value ?? "";
  };

  set("id", product.id);
  set("article", product.article);
  set("name", product.name);
  set("price", product.price);
  set("priceText", product.priceText);
  set("category", product.category);
  set("groupName", product.groupName);
  set("brand", product.brand);
  set("image", product.image);
  set("sourceUrl", product.sourceUrl);
  set("description", product.description);
  set("specs", product.specs);
  set("attributesJson", product.attributesJson || "[]");
  set("documentsJson", product.documentsJson || "[]");
}

function getEditPayload() {
  const g = (name) => String(ui.editForm.elements.namedItem(name)?.value || "").trim();
  const attrsRaw = g("attributesJson") || "[]";
  const docsRaw = g("documentsJson") || "[]";

  JSON.parse(attrsRaw);
  JSON.parse(docsRaw);

  return {
    article: g("article"),
    name: g("name"),
    price: g("price"),
    priceText: g("priceText"),
    category: g("category"),
    groupName: g("groupName"),
    brand: g("brand"),
    image: g("image"),
    sourceUrl: g("sourceUrl"),
    description: g("description"),
    specs: g("specs"),
    attributesJson: attrsRaw,
    documentsJson: docsRaw
  };
}

function renderProducts(rows) {
  ui.productsTbody.innerHTML = rows
    .map(
      (p) => `
      <tr>
        <td>${p.id}</td>
        <td>${p.article || ""}</td>
        <td>
          <a href="${p.sourceUrl || "#"}" target="_blank" rel="noreferrer">${p.name}</a>
          ${Number(p.isConflict || 0) ? '<div class="no">Конфликт данных</div>' : ""}
        </td>
        <td>${p.category || ""}</td>
        <td>${fmtPrice(p.price)}</td>
        <td class="${p.hasDescription ? "ok" : "no"}">${p.hasDescription ? "Да" : "Нет"}</td>
        <td class="${p.hasDocs ? "ok" : "no"}">${p.hasDocs ? "Да" : "Нет"}</td>
        <td><button class="button button-outline" data-edit-id="${p.id}" type="button">Редактировать</button></td>
      </tr>
    `
    )
    .join("");
}

function renderOrders(rows) {
  ui.ordersTbody.innerHTML = rows
    .map(
      (o) => `
      <tr>
        <td>${o.id}</td>
        <td>${new Date(o.createdAt).toLocaleString("ru-RU")}</td>
        <td>${o.customerName}</td>
        <td>${o.customerPhone}</td>
        <td>${o.customerAddress}</td>
        <td>${o.paymentMethod}</td>
        <td>${o.itemCount}</td>
        <td>${fmtPrice(o.total)}</td>
        <td>${o.status}</td>
      </tr>
    `
    )
    .join("");
}

async function loadProducts() {
  const q = encodeURIComponent(ui.searchQ.value.trim());
  const data = await fetchJson(`/api/admin/products?limit=300&q=${q}`);
  renderProducts(data.rows || []);
  ui.stats.textContent = `Товаров: ${data.total ?? 0}`;
}

async function loadOrders() {
  const data = await fetchJson(`/api/admin/orders?limit=300`);
  renderOrders(data.rows || []);
  ui.stats.textContent = `Заказов: ${data.total ?? 0}`;
}

function showProducts() {
  ui.productsSection.style.display = "block";
  ui.ordersSection.style.display = "none";
}

function showOrders() {
  ui.productsSection.style.display = "none";
  ui.ordersSection.style.display = "block";
}

function showEditor(show) {
  ui.editorSection.style.display = show ? "block" : "none";
  if (!show) ui.editMsg.textContent = "";
}

async function openEditor(productId) {
  const product = await fetchJson(`/api/admin/products/${encodeURIComponent(productId)}`);
  fillEditForm(product);
  showEditor(true);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

async function saveEditor() {
  const id = String(ui.editForm.elements.namedItem("id")?.value || "").trim();
  if (!id) return;
  ui.editMsg.textContent = "";
  try {
    const payload = getEditPayload();
    await fetchJson(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    ui.editMsg.textContent = "Сохранено";
    await loadProducts();
  } catch (error) {
    ui.editMsg.textContent = error.message;
  }
}

ui.tabProducts.addEventListener("click", async () => {
  showProducts();
  await loadProducts();
});

ui.tabOrders.addEventListener("click", async () => {
  showOrders();
  await loadOrders();
});

ui.searchBtn.addEventListener("click", loadProducts);
ui.searchQ.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    loadProducts();
  }
});

ui.productsTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-edit-id]");
  if (!btn) return;
  await openEditor(btn.dataset.editId);
});

ui.saveBtn.addEventListener("click", saveEditor);
ui.cancelBtn.addEventListener("click", () => showEditor(false));

(async function init() {
  showProducts();
  showEditor(false);
  await loadProducts();
})();
