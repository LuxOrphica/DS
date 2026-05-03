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

async function waitForHealth(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(t, env = {}) {
  const port = await getFreePort();
  const projectRoot = path.join(__dirname, "..");
  const testAllowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].join(",");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      CORS_ALLOWED_ORIGINS: testAllowedOrigins,
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

  return {
    baseUrl: `http://127.0.0.1:${port}`
  };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err && err.message ? err.message : err));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        !/favicon|Failed to load resource/i.test(text) &&
        !/violates the following Content Security Policy directive/i.test(text) &&
        !/fonts\.googleapis\.com|cdn\.jsdelivr\.net\/npm\/@fontsource/i.test(text)
      ) {
        errors.push(text);
      }
    }
  });
  return errors;
}

async function assertNoUiCrash(page, errors, label) {
  const bodyText = await page.locator("body").innerText();
  assert.equal(
    /Ошибка интерфейса|РћС€РёР±РєР° РёРЅС‚РµСЂС„РµР№СЃР°/i.test(bodyText),
    false,
    `${label}: UI error banner rendered`
  );
  assert.deepEqual(errors, [], `${label}: unexpected browser errors\n${errors.join("\n")}`);
}

test("ui smoke: critical storefront and admin routes render", async (t) => {
  const { baseUrl } = await startServer(t, {
    DISABLE_ADMIN_AUTH: "1"
  });

  const productsRes = await fetch(`${baseUrl}/api/products`);
  assert.equal(productsRes.status, 200);
  const products = await productsRes.json();
  assert.ok(Array.isArray(products) && products.length > 0, "products api should return at least one product");
  const firstProduct = products.find((p) => p && p.id && p.brand) || products[0];
  const firstBrandSlug = slugify(firstProduct.brand);
  const firstCategorySlug = slugify(firstProduct.topCategory || firstProduct.category);

  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });

  await t.test("catalog page renders product grid", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/#/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "catalog");
    await page.close();
  });

  await t.test("brand page renders listing", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/#/brands/${firstBrandSlug}`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").waitFor({ state: "visible" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "brand");
    await page.close();
  });

  await t.test("category page renders listing", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/#/catalog/${firstCategorySlug}`, { waitUntil: "domcontentloaded" });
    await page.locator(".listing-top, .product-grid").first().waitFor({ state: "visible" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "category");
    await page.close();
  });

  await t.test("product page renders detail blocks", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/#/product/${firstProduct.id}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-page").waitFor({ state: "visible" });
    await page.locator(".product-page .price-main").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "product");
    await page.close();
  });

  await t.test("search renders results instead of crashing", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/#/catalog`, { waitUntil: "domcontentloaded" });
    const headerSearch = page.locator("#headerSearchInput");
    const searchTerm = String(firstProduct.name || "").split(/\s+/)[0] || "WB";
    await headerSearch.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, searchTerm);
    await page.waitForFunction(() => Boolean(document.querySelector(".product-grid--search")), null, {
      timeout: 10000
    });
    await page.locator(".product-grid--search .product-card").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "search");
    await page.close();
  });

  await t.test("cart page renders empty or populated state", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/#/cart`, { waitUntil: "domcontentloaded" });
    await page.locator(".cart-page").waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "cart");
    await page.close();
  });

  await t.test("orders page renders cabinet shell", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/#/orders`, { waitUntil: "domcontentloaded" });
    await page.locator(".orders-cabinet").waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "orders");
    await page.close();
  });

  await t.test("admin products page boots and replaces loading counter", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/admin#/products`, { waitUntil: "domcontentloaded" });
    await page.locator("#adminApp").waitFor({ state: "visible" });
    await page.locator("#productsPage").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const el = document.getElementById("productsCount");
      return Boolean(el && !/Загрузка/i.test(String(el.textContent || "")));
    });
    await assertNoUiCrash(page, errors, "admin products");
    await page.close();
  });

  await t.test("admin product editor opens and shows tabs", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/admin#/products`, { waitUntil: "domcontentloaded" });
    const firstEditBtn = page.locator('#productsPage tbody tr button[aria-label="Редактировать"]').first();
    await firstEditBtn.waitFor({ state: "visible" });
    await firstEditBtn.click();
    await page.waitForFunction(() =>
      /Редактирование:/i.test(String(document.querySelector("#adminApp")?.innerText || ""))
    );
    await page.waitForFunction(() => {
      const text = String(document.querySelector("#adminApp")?.innerText || "");
      return /Основное/i.test(text) && /Варианты/i.test(text) && /Фото/i.test(text);
    });
    await assertNoUiCrash(page, errors, "admin product editor");
    await page.close();
  });

  await t.test("admin orders page renders table", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/admin#/orders`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      /Каталог → Заказы/i.test(String(document.querySelector("#adminApp")?.innerText || ""))
    );
    await assertNoUiCrash(page, errors, "admin orders");
    await page.close();
  });

  await t.test("admin categories page renders editor", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/admin#/categories`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      /Каталог → Категории/i.test(String(document.querySelector("#adminApp")?.innerText || ""))
    );
    await assertNoUiCrash(page, errors, "admin categories");
    await page.close();
  });
});
