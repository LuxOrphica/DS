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
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(t) {
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
      DISABLE_ADMIN_AUTH: "1"
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
  return `http://127.0.0.1:${port}`;
}

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err && err.message ? err.message : err));
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (
      /favicon|Failed to load resource/i.test(text) ||
      /violates the following Content Security Policy directive/i.test(text) ||
      /fonts\.googleapis\.com|cdn\.jsdelivr\.net\/npm\/@fontsource/i.test(text)
    ) {
      return;
    }
    errors.push(text);
  });
  return errors;
}

async function assertNoUiCrash(page, errors, label) {
  const bodyText = await page.locator("body").innerText();
  assert.equal(/Ошибка интерфейса|Error initializing app/i.test(bodyText), false, `${label}: UI error banner rendered`);
  assert.deepEqual(errors, [], `${label}: unexpected browser errors\n${errors.join("\n")}`);
}

function uniqueBy(items, getKey) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function clientNavigate(page, href) {
  await page.evaluate((nextHref) => {
    window.history.pushState({}, "", nextHref);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, href);
}

function pickProductSamples(products, limit = 36) {
  const visible = (Array.isArray(products) ? products : []).filter((product) => {
    if (!product || !product.id) return false;
    const status = String(product.status || "active").trim().toLowerCase();
    return (status === "" || status === "active") && Number(product.is_extra || product.isExtra || 0) !== 1;
  });

  const selected = [];
  const push = (product) => {
    if (!product || selected.length >= limit) return;
    if (selected.some((item) => item.id === product.id)) return;
    selected.push(product);
  };

  visible.slice(0, 12).forEach(push);

  const byBrand = new Map();
  for (const product of visible) {
    const brand = String(product.brand || "").trim();
    if (brand && !byBrand.has(brand)) byBrand.set(brand, product);
  }
  Array.from(byBrand.values()).forEach(push);

  visible.filter((p) => String(p.priceCurrency || "").toUpperCase() === "EUR").slice(0, 6).forEach(push);
  visible.filter((p) => String(p.documentsJson || p.documents_json || "[]") !== "[]").slice(0, 6).forEach(push);
  visible.filter((p) => String(p.galleryJson || p.gallery_json || "[]") !== "[]").slice(0, 6).forEach(push);

  for (const product of visible) {
    if (selected.length >= limit) break;
    push(product);
  }

  return selected.slice(0, limit);
}

test("catalog crawl: all storefront category and subcategory links render", async (t) => {
  const baseUrl = await startServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  const errors = collectPageErrors(page);

  await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
  await page.locator(".category-card").first().waitFor({ state: "visible" });

  const topLinks = await page.$$eval(".category-card[href]", (links) =>
    links.map((link) => ({
      href: link.getAttribute("href"),
      label: String(link.textContent || "").replace(/\s+/g, " ").trim()
    }))
  );

  assert.ok(topLinks.length >= 5, `expected category links, got ${topLinks.length}`);

  const allLinks = uniqueBy(topLinks, (item) => item.href);
  for (const top of topLinks) {
    await clientNavigate(page, top.href);
    await page.locator(".listing-top, .product-grid").first().waitFor({ state: "visible" });
    const subLinks = await page.$$eval(".subcategory-sidebar-link[href]", (links) =>
      links.map((link) => ({
        href: link.getAttribute("href"),
        label: String(link.textContent || "").replace(/\s+/g, " ").trim()
      }))
    );
    for (const link of subLinks) allLinks.push(link);
  }

  const links = uniqueBy(
    allLinks.filter((item) => item.href && item.href.startsWith("/catalog/")),
    (item) => item.href
  );
  assert.ok(links.length >= topLinks.length, `expected catalog links, got ${links.length}`);

  const failures = [];
  for (const link of links) {
    const label = `${link.label || link.href} (${link.href})`;
    try {
      await clientNavigate(page, link.href);
      await page.locator(".listing-top, .product-grid").first().waitFor({ state: "visible", timeout: 10_000 });
      const state = await page.evaluate(() => ({
        productCards: document.querySelectorAll(".product-card").length,
        hasEmptyState: /Товары не найдены|Ничего не найдено/i.test(String(document.querySelector("#app")?.innerText || ""))
      }));
      if (state.productCards < 1 && !state.hasEmptyState) {
        failures.push(`${label}: no products and no empty state`);
      }
    } catch (error) {
      failures.push(`${label}: ${error && error.message ? error.message : error}`);
    }
  }

  await assertNoUiCrash(page, errors, "catalog crawl");
  assert.deepEqual(failures, [], `catalog link failures:\n${failures.join("\n")}`);
  await context.close();
});

test("catalog crawl: representative product pages render core commerce controls", async (t) => {
  const baseUrl = await startServer(t);
  const productsRes = await fetch(`${baseUrl}/api/products`);
  assert.equal(productsRes.status, 200);
  const products = await productsRes.json();
  const samples = pickProductSamples(products);
  assert.ok(samples.length >= 20, `expected representative product samples, got ${samples.length}`);

  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  const errors = collectPageErrors(page);
  const failures = [];

  await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
  await page.locator(".product-card").first().waitFor({ state: "visible" });

  for (const product of samples) {
    const label = `${product.name || product.id} (${product.id})`;
    try {
      await clientNavigate(page, `/product/${encodeURIComponent(product.id)}`);
      await page.locator(".product-page").waitFor({ state: "visible", timeout: 10_000 });
      await page.locator(".product-page .price-main").first().waitFor({ state: "visible", timeout: 10_000 });
      await page.locator("#buyOneClick").waitFor({ state: "visible", timeout: 10_000 });
      await page.locator("#productAddToCartBtn, #productQtyCta").first().waitFor({ state: "attached", timeout: 10_000 });
      const state = await page.evaluate(() => ({
        title: String(document.querySelector(".product-title")?.textContent || document.querySelector("h1")?.textContent || "").trim(),
        images: document.querySelectorAll(".product-page img").length
      }));
      if (!state.title) failures.push(`${label}: missing product title`);
      if (state.images < 1) failures.push(`${label}: missing image or placeholder`);
    } catch (error) {
      failures.push(`${label}: ${error && error.message ? error.message : error}`);
    }
  }

  await assertNoUiCrash(page, errors, "product sample crawl");
  assert.deepEqual(failures, [], `product page failures:\n${failures.join("\n")}`);
  await context.close();
});
