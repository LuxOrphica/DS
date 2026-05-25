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
      TURSO_URL: "",
      TURSO_AUTH_TOKEN: "",
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
    .replace(/С‘/g, "e")
    .replace(/[^a-z0-9Р°-СЏ]+/gi, "-")
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
    /РћС€РёР±РєР° РёРЅС‚РµСЂС„РµР№СЃР°|Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎвЂћР ВµР в„–РЎРѓР В°/i.test(bodyText),
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

  const browser = await chromium.launch({ headless: true });
  async function newIsolatedPage(options) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const closePage = page.close.bind(page);
    page.close = async () => {
      await closePage();
      await context.close();
    };
    return page;
  }
  t.after(async () => {
    await browser.close();
  });

  await t.test("catalog page shows loading state while products API is pending", async () => {
    const page = await newIsolatedPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.route("**/api/products", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".app-loading").waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "catalog loading");
    await page.close();
  });

  await t.test("catalog page renders product grid", async () => {
    const page = await newIsolatedPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "catalog");
    await page.close();
  });

  await t.test("cart keeps added product after full page navigation", async () => {
    const page = await newIsolatedPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    const firstName = await page.locator(".product-card h3").first().innerText();
    await page.locator("[data-card-buy]").first().click();
    await page.waitForFunction(() => document.querySelector("#cartQty")?.textContent?.trim() === "1");
    await page.goto(`${baseUrl}/cart`, { waitUntil: "domcontentloaded" });
    await page.locator(".cart-item").first().waitFor({ state: "visible" });
    await page.locator(".qty-row strong").first().waitFor({ state: "visible" });
    const cartText = await page.locator("#app").innerText();
    assert.ok(cartText.includes(firstName.slice(0, 12)), "cart should contain product added before full navigation");
    await assertNoUiCrash(page, errors, "cart persisted");
    await page.close();
  });

  await t.test("brand page renders listing", async () => {
    const page = await newIsolatedPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/brands/${firstBrandSlug}`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").waitFor({ state: "visible" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "brand");
    await page.close();
  });

  await t.test("category page renders listing", async () => {
    const page = await newIsolatedPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".category-card").first().waitFor({ state: "visible" });
    const firstCategoryHref = await page.locator(".category-card").first().getAttribute("href");
    await page.goto(`${baseUrl}${firstCategoryHref}`, { waitUntil: "domcontentloaded" });
    await page.locator(".listing-top, .product-grid").first().waitFor({ state: "visible" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "category");
    await page.close();
  });

  await t.test("product page renders detail blocks", async () => {
    const page = await newIsolatedPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/product/${firstProduct.id}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-page").waitFor({ state: "visible" });
    await page.locator(".product-page .price-main").first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "product");
    await page.close();
  });

  await t.test("product buy flow reaches checkout validation", async () => {
    const page = await newIsolatedPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.addInitScript(() => localStorage.removeItem("smartHomeShopCart"));
    await page.goto(`${baseUrl}/product/${firstProduct.id}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-page").waitFor({ state: "visible" });
    await page.locator("#buyOneClick").click();
    await page.waitForURL("**/cart");
    await page.locator(".cart-item").first().waitFor({ state: "visible" });
    await page.locator("[data-mobile-checkout]").click();
    await page.locator(".checkout-modal-dialog").waitFor({ state: "visible" });
    await page.locator("#checkoutModalForm .cart-submit").click();
    await page.waitForFunction(() => {
      const invalid = document.querySelectorAll("#checkoutModalForm .input.is-invalid").length;
      return invalid >= 3;
    });
    await assertNoUiCrash(page, errors, "product buy flow");
    await page.close();
  });

  await t.test("checkout creates order and opens order detail", async () => {
    const page = await newIsolatedPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem("checkoutResetDone") === "1") return;
      sessionStorage.setItem("checkoutResetDone", "1");
      localStorage.removeItem("smartHomeShopCart");
      localStorage.removeItem("smartHomeShopMyOrderIds");
    });
    await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await page.locator("[data-card-buy]").first().click();
    await page.waitForFunction(() => document.querySelector("#cartQty")?.textContent?.trim() === "1");
    await page.goto(`${baseUrl}/cart`, { waitUntil: "domcontentloaded" });
    await page.locator(".cart-item").first().waitFor({ state: "visible" });
    await page.locator("[data-open-checkout]").first().click();
    await page.locator(".checkout-modal-dialog").waitFor({ state: "visible" });
    await page.locator('#checkoutModalForm input[name="name"]').fill("РўРµСЃС‚ РџРѕРєСѓРїР°С‚РµР»СЊ");
    await page.locator('#checkoutModalForm input[name="phone"]').fill("+7 (999) 123-45-67");
    await page.locator('#checkoutModalForm input[name="address"]').fill("РњРѕСЃРєРІР°, С‚РµСЃС‚РѕРІР°СЏ 1");
    await page.locator("#checkoutModalForm .cart-submit").click();
    await page.waitForFunction(() => /ORD-\d{8,}/.test(String(document.querySelector("#app")?.innerText || "")));
    const orderId = await page.evaluate(() => {
      const match = String(document.querySelector("#app")?.innerText || "").match(/ORD-\d{8,}/);
      return match ? match[0] : "";
    });
    assert.match(orderId, /^ORD-\d{8,}$/);
    await page.goto(`${baseUrl}/orders/${encodeURIComponent(orderId)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((id) => String(document.querySelector("#app")?.innerText || "").includes(id), orderId);
    await assertNoUiCrash(page, errors, "checkout create order");
    await page.close();
  });

  await t.test("search renders results instead of crashing", async () => {
    const page = await newIsolatedPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await page.waitForFunction(() => document.getElementById("headerSearchInput")?.dataset.searchBound === "1");
    const headerSearch = page.locator("#headerSearchInput");
    const searchTerm = String(firstProduct.name || "").split(/\s+/)[0] || "WB";
    await headerSearch.fill(searchTerm);
    await page.locator("#desktopSearchSuggestions").waitFor({ state: "visible", timeout: 10000 });
    await page.locator(".desktop-search-suggestions__list").waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "search");
    await page.close();
  });

  await t.test("mobile catalog search, sort and filters open usable panels", async () => {
    const page = await newIsolatedPage({
      viewport: { width: 390, height: 844 },
      isMobile: true
    });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
    await page.locator(".category-card").first().waitFor({ state: "visible" });
    await page.locator("#headerSearchInput").click();
    await page.locator(".mobile-search-overlay").waitFor({ state: "visible" });
    await page.locator("#mobileSearchInput").fill("loxone");
    await page.locator(".mobile-search-hit").first().waitFor({ state: "visible" });
    await page.locator("#mobileSearchCancelBtn").click();

    const firstCategoryHref = await page.locator(".category-card").first().getAttribute("href");
    await page.goto(`${baseUrl}${firstCategoryHref}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-card").first().waitFor({ state: "visible" });
    await page.locator("#openSortBtn").click();
    await page.locator("#sortPanel.is-open").waitFor({ state: "visible" });
    await page.locator("#closeSortBtn").click();
    await page.locator("#openFiltersBtn").click();
    await page.locator("#filtersPanel.is-open").waitFor({ state: "visible" });
    await page.locator("#applyFiltersBtn").waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "mobile catalog controls");
    await page.close();
  });

  await t.test("cart page renders empty or populated state", async () => {
    const page = await newIsolatedPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/cart`, { waitUntil: "domcontentloaded" });
    await page.locator(".cart-page").waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "cart");
    await page.close();
  });

  await t.test("orders page renders cabinet shell", async () => {
    const page = await newIsolatedPage({ viewport: { width: 390, height: 844 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/orders`, { waitUntil: "domcontentloaded" });
    await page.locator(".orders-cabinet").waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "orders");
    await page.close();
  });

  await t.test("admin products page boots and replaces loading counter", async () => {
    const page = await newIsolatedPage({ viewport: { width: 1440, height: 960 } });
    const errors = collectPageErrors(page);
    await page.goto(`${baseUrl}/admin#/products`, { waitUntil: "commit" });
    await page.locator("#adminApp").waitFor({ state: "visible" });
    await page.locator("#productsPage").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const el = document.getElementById("productsCount");
      return Boolean(el && !/Р—Р°РіСЂСѓР·РєР°/i.test(String(el.textContent || "")));
    });
    await assertNoUiCrash(page, errors, "admin products");
    await page.close();
  });

});
