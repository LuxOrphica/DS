const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = Number(addr && addr.port);
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

async function waitForHealth(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // keep polling while the server starts
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(t, env = {}) {
  const port = await getFreePort();
  const projectRoot = path.join(__dirname, "..");
  const allowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].join(",");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      TURSO_URL: "",
      TURSO_AUTH_TOKEN: "",
      PORT: String(port),
      CORS_ALLOWED_ORIGINS: allowedOrigins,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  t.after(() => {
    child.kill("SIGTERM");
  });

  const health = await waitForHealth(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.ok, true, `health payload: ${JSON.stringify(health)}\n${stderr}`);
  return { baseUrl: `http://127.0.0.1:${port}` };
}

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err && err.message ? err.message : err));
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon|Failed to load resource|fonts\.googleapis\.com/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

async function assertNoUiCrash(page, errors, label) {
  const bodyText = await page.locator("body").innerText();
  assert.equal(/interface error|ошибка интерфейса/i.test(bodyText), false, `${label}: UI error banner rendered`);
  assert.deepEqual(errors, [], `${label}: unexpected browser errors\n${errors.join("\n")}`);
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    assert.fail(`${url} failed with ${res.status}: ${body}`);
  }
  return await res.json();
}

async function createTestOrder(baseUrl) {
  const res = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customer: {
        name: "Admin UI Test",
        phone: "+7 (901) 111-22-33",
        address: "Admin UI Test Street 7",
        email: "admin-ui-test@example.com"
      },
      items: [{ id: "admin-ui-prd", name: "Admin UI Item", article: "UI-1", qty: 1, price: 4321, image: "" }],
      total: 4321,
      paymentMethod: "sbp",
      deliveryComment: ""
    })
  });
  assert.equal(res.status, 201);
  const json = await res.json();
  const orderId = String(json.orderId || "");
  assert.ok(orderId.startsWith("ORD-"));
  return orderId;
}

async function createDraftProductForAdminUi(baseUrl, token) {
  const productsData = await apiJson(`${baseUrl}/api/admin/products?limit=50&offset=0`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const products = Array.isArray(productsData.products) ? productsData.products : productsData.rows;
  assert.ok(Array.isArray(products) && products.length > 0, "admin products API should return seed products");

  let seed = null;
  for (const item of products) {
    if (!item || !item.id) continue;
    const detail = await apiJson(`${baseUrl}/api/admin/products/${encodeURIComponent(item.id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const brandCategoryIds = Array.isArray(detail.brandCategoryIds) ? detail.brandCategoryIds : [];
    if (detail.brand && detail.category && (brandCategoryIds.length || detail.primaryBrandCategoryId || detail.brandSubcategory)) {
      seed = detail;
      break;
    }
  }

  assert.ok(seed, "expected a seed product with brand/category bindings");

  const id = `admin-ui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const brandCategoryIds = Array.isArray(seed.brandCategoryIds) ? seed.brandCategoryIds : [];
  const payload = {
    id,
    name: "Admin UI Draft Product",
    article: `AUI-${Date.now()}`,
    brand: String(seed.brand || ""),
    category: String(seed.category || seed.primaryFunctionalCategory || ""),
    primaryFunctionalCategory: String(seed.primaryFunctionalCategory || seed.category || ""),
    functionalCategories: Array.isArray(seed.functionalCategories) && seed.functionalCategories.length
      ? seed.functionalCategories
      : [String(seed.category || "")].filter(Boolean),
    group: String(seed.group || seed.groupName || ""),
    brandCategoryIds,
    primaryBrandCategoryId: seed.primaryBrandCategoryId || brandCategoryIds[0] || null,
    brandSubcategory: String(seed.brandSubcategory || ""),
    price: 1000,
    status: "draft",
    image: "",
    sourceUrl: "https://example.test/admin-ui-source",
    description: "Created by admin UI smoke test",
    attributesJson: "[]",
    galleryJson: "[]",
    documentsJson: "[]"
  };

  const created = await apiJson(`${baseUrl}/api/admin/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  assert.equal(created.success, true);
  assert.equal(created.product.id, id);
  return { id, article: payload.article };
}

async function deleteAdminProduct(baseUrl, token, productId) {
  if (!productId) return;
  await fetch(`${baseUrl}/api/admin/products/bulk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ action: "delete", productIds: [productId] })
  });
}

async function loginAdmin(page, baseUrl, token) {
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await page.locator("#adminLoginGate").waitFor({ state: "visible" });
  await page.fill("#adminTokenInput", token);
  await page.click("#adminLoginBtn");
  await page.locator("#adminApp").waitFor({ state: "visible" });
  await page.locator("#productsTableBody tr").first().waitFor({ state: "visible" });
}

test("admin UI supports login, catalog editor read path, dictionaries and order workflow", async (t) => {
  const token = "admin-ui-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });
  const orderId = await createTestOrder(baseUrl);
  const productsData = await apiJson(`${baseUrl}/api/admin/products?limit=20&offset=0`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const products = Array.isArray(productsData.products) ? productsData.products : productsData.rows;
  const product = products.find((row) => row && row.id && row.name && row.article) || products[0];
  assert.ok(product && product.id, "admin products API should return a product for UI test");

  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const errors = collectPageErrors(page);

  await loginAdmin(page, baseUrl, token);
  await assertNoUiCrash(page, errors, "admin login/products boot");

  await page.fill("#searchInput", String(product.article || product.id));
  await page.locator(`button[data-product-action="edit"][data-id="${product.id}"]`).waitFor({ state: "visible" });
  await page.selectOption("#brandFilter", String(product.brand || ""));
  await page.locator(`button[data-product-action="edit"][data-id="${product.id}"]`).waitFor({ state: "visible" });

  await page.click(`button[data-product-action="edit"][data-id="${product.id}"]`);
  await page.locator("#productEditPage").waitFor({ state: "visible" });
  await assert.equal(await page.locator("#productName").inputValue(), String(product.name || ""));
  await assert.equal(await page.locator("#productArticle").inputValue(), String(product.article || ""));

  await page.click('.editor-tab[data-tab="photos"]');
  await page.locator("#photosPane.active").waitFor({ state: "visible" });
  await page.locator("#mediaTableBody tr").first().waitFor({ state: "visible" });

  await page.click('.editor-tab[data-tab="documents"]');
  await page.locator("#documentsPane.active").waitFor({ state: "visible" });
  await page.locator("#documentsTableBody tr").first().waitFor({ state: "visible" });

  await page.click("#backToProductsBtn");
  await page.locator("#productsPage").waitFor({ state: "visible" });

  await page.goto(`${baseUrl}/admin#/categories`, { waitUntil: "domcontentloaded" });
  await page.locator("#functionalTreeBody tr").first().waitFor({ state: "visible" });
  await page.click('[data-taxonomy-tab="brands"]');
  await page.locator("#brandsTreeBody tr").first().waitFor({ state: "visible" });

  await page.goto(`${baseUrl}/admin#/settings`, { waitUntil: "domcontentloaded" });
  await page.locator("#templateCategoryName option").nth(1).waitFor({ state: "attached" });

  await page.goto(`${baseUrl}/admin#/orders`, { waitUntil: "domcontentloaded" });
  await page.locator("#ordersTableBody tr").first().waitFor({ state: "visible" });
  await page.fill("#ordersSearchInput", orderId);
  await page.locator("#ordersTableBody").getByText(orderId).waitFor({ state: "visible" });
  await page.locator("#ordersTableBody tr", { hasText: orderId }).locator('button[data-order-action="details"]').click();
  await page.locator("#orderModal").waitFor({ state: "visible" });
  await page.selectOption("#orderModalStatus", "in_work");
  await page.selectOption("#orderModalPaymentStatus", "paid");
  await page.fill("#orderModalManager", "Admin UI QA");
  await page.click("#saveOrderModalBtn");
  await page.locator("#orderModal").waitFor({ state: "hidden" });

  const orderDetail = await apiJson(`${baseUrl}/api/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(orderDetail.order.status, "in_work");
  assert.equal(orderDetail.order.paymentStatus, "paid");
  assert.equal(orderDetail.order.manager, "Admin UI QA");

  await assertNoUiCrash(page, errors, "admin UI workflow");
});

test("admin UI edits a draft product and saves media/documents", async (t) => {
  const token = "admin-ui-edit-token";
  const { baseUrl } = await startServer(t, { ADMIN_TOKEN: token });
  const draft = await createDraftProductForAdminUi(baseUrl, token);

  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const errors = collectPageErrors(page);

  try {
    await loginAdmin(page, baseUrl, token);
    await page.fill("#searchInput", draft.article);
    await page.locator(`button[data-product-action="edit"][data-id="${draft.id}"]`).waitFor({ state: "visible" });
    await page.click(`button[data-product-action="edit"][data-id="${draft.id}"]`);
    await page.locator("#productEditPage").waitFor({ state: "visible" });

    const editedName = "Admin UI Draft Product Edited";
    await page.fill("#productName", editedName);
    await page.fill("#productPrice", "2345");
    await page.fill("#productDescription", "Updated through admin UI test");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/admin/products/${draft.id}`) && res.request().method() === "PUT"),
      page.click("#saveProductBtn")
    ]);
    await page.locator("#productsPage").waitFor({ state: "visible" });

    let detail = await apiJson(`${baseUrl}/api/admin/products/${encodeURIComponent(draft.id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(detail.name, editedName);
    assert.equal(Number(detail.price), 2345);
    assert.equal(detail.description, "Updated through admin UI test");

    await page.fill("#searchInput", draft.article);
    await page.locator(`button[data-product-action="edit"][data-id="${draft.id}"]`).waitFor({ state: "visible" });
    await page.click(`button[data-product-action="edit"][data-id="${draft.id}"]`);
    await page.locator("#productEditPage").waitFor({ state: "visible" });

    await page.click('.editor-tab[data-tab="photos"]');
    await page.click("#addMediaRowBtn");
    await page.locator("#mediaTableBody .media-url").last().fill("/images/products/placeholder.svg");
    await page.locator("#mediaTableBody .media-label").last().fill("Admin UI cover");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/admin/products/${draft.id}/media`) && res.request().method() === "PUT"),
      page.click("#saveMediaBtn")
    ]);

    await page.click('.editor-tab[data-tab="documents"]');
    await page.click("#addDocumentRowBtn");
    await page.locator("#documentsTableBody .doc-title").last().fill("Admin UI manual");
    await page.locator("#documentsTableBody .doc-type").last().fill("manual");
    await page.locator("#documentsTableBody .doc-lang").last().fill("ru");
    await page.locator("#documentsTableBody .doc-url").last().fill("/docs/admin-ui-manual.pdf");
    await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/admin/products/${draft.id}/documents`) && res.request().method() === "PUT"),
      page.click("#saveDocumentsBtn")
    ]);

    detail = await apiJson(`${baseUrl}/api/admin/products/${encodeURIComponent(draft.id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.ok(detail.media.some((item) => item.url === "/images/products/placeholder.svg" && item.label === "Admin UI cover"));
    assert.ok(detail.documents.some((item) => item.title === "Admin UI manual" && item.url === "/docs/admin-ui-manual.pdf"));

    await assertNoUiCrash(page, errors, "admin product edit/media/documents workflow");
  } finally {
    await browser.close();
    await deleteAdminProduct(baseUrl, token, draft.id);
  }
});
