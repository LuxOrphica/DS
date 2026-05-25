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
      // keep polling while the test server starts
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(t) {
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
      CORS_ALLOWED_ORIGINS: testAllowedOrigins
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
    if (/favicon|Failed to load resource|fonts\.googleapis\.com|cdn\.jsdelivr\.net\/npm\/@fontsource/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

async function getVisibleCardIds(page) {
  return await page.$$eval(".product-grid .product-card[href]", (cards) =>
    cards.map((a) => {
      try {
        const url = new URL(a.href);
        return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
      } catch {
        return "";
      }
    }).filter(Boolean)
  );
}

async function selectSortMode(page, mode) {
  await page.locator(`input[name="sortMode"][value="${mode}"]`).evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function waitForCardIds(page, expectedIds, label) {
  await page.waitForFunction(
    ({ expected }) => {
      const actual = Array.from(document.querySelectorAll(".product-grid .product-card[href]"))
        .map((a) => {
          try {
            const url = new URL(a.href);
            return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
          } catch {
            return "";
          }
        })
        .filter(Boolean);
      return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
    },
    { expected: expectedIds },
    { timeout: 10000 }
  ).catch(async (error) => {
    const actual = await getVisibleCardIds(page);
    throw new Error(`${label}: card ids mismatch\nexpected=${JSON.stringify(expectedIds)}\nactual=${JSON.stringify(actual)}\n${error.message}`);
  });
}

async function assertNoUiCrash(page, errors, label) {
  const bodyText = await page.locator("body").innerText();
  assert.equal(/Ошибка интерфейса|РћС€РёР±РєР° РёРЅС‚РµСЂС„РµР№СЃР°/i.test(bodyText), false, `${label}: UI error banner rendered`);
  assert.deepEqual(errors, [], `${label}: unexpected browser errors\n${errors.join("\n")}`);
}

function priceRub(product) {
  const n = Number(product && product.price);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function protocolValues(product) {
  const values = String(product?.protocol || "")
    .split(/[;,|]+/g)
    .map((raw) => {
      const value = String(raw || "").trim();
      if (/rs[\s-]?485/i.test(value)) return "RS-485";
      if (/modbus/i.test(value)) return "Modbus";
      if (/ethernet/i.test(value)) return "Ethernet";
      if (/wi[\s-]?fi/i.test(value)) return "Wi-Fi";
      if (/zigbee/i.test(value)) return "Zigbee";
      if (/z[\s-]?wave/i.test(value)) return "Z-Wave";
      if (/dali/i.test(value)) return "DALI";
      if (/bluetooth|\bble\b/i.test(value)) return "BLE";
      if (/knx/i.test(value)) return "KNX";
      if (/mqtt/i.test(value)) return "MQTT";
      if (/\bcan\b/i.test(value)) return "CAN";
      return value;
    })
    .filter(Boolean);
  if (values.length) return values;
  const hay = `${product?.name || ""} ${product?.article || ""} ${product?.id || ""} ${product?.group || ""} ${product?.specs || ""}`.toLowerCase();
  if (/\bmodbus\b/.test(hay)) return ["Modbus"];
  if (/\bmqtt\b/.test(hay)) return ["MQTT"];
  if (/\bknx\b/.test(hay)) return ["KNX"];
  if (/\bbacnet\b/.test(hay)) return ["BACnet"];
  if (/\bopc\s*ua\b/.test(hay)) return ["OPC UA"];
  if (/\bsnmp\b/.test(hay)) return ["SNMP"];
  if (/\b1-?wire\b/.test(hay)) return ["1-Wire"];
  return [];
}

test("catalog filter matrix matches real product data", async (t) => {
  const { baseUrl } = await startServer(t);
  const productsRes = await fetch(`${baseUrl}/api/products`);
  assert.equal(productsRes.status, 200);
  const products = await productsRes.json();
  const byId = new Map(products.map((p) => [String(p.id || ""), p]));

  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = collectPageErrors(page);

  await page.goto(`${baseUrl}/catalog`, { waitUntil: "domcontentloaded" });
  await page.locator(".category-card[href]").first().waitFor({ state: "visible" });
  const categoryHrefs = await page.$$eval(".category-card[href]", (links) => links.map((a) => a.getAttribute("href")).filter(Boolean));

  let categoryHref = "";
  let baseIds = [];
  for (const href of categoryHrefs) {
    await page.goto(`${baseUrl}${href}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator(".product-grid .product-card").first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      continue;
    }
    const brandFilters = await page.locator('[data-filter-key="brands"]').count();
    const ids = await getVisibleCardIds(page);
    const priced = ids.map((id) => byId.get(id)).filter((p) => priceRub(p) != null);
    if (brandFilters >= 2 && ids.length >= 6 && priced.length >= 6) {
      categoryHref = href;
      baseIds = ids;
      break;
    }
  }

  assert.ok(categoryHref, "expected a catalog category with enough products, brand facets and prices");

  await t.test("brand facet filters visible cards and keeps the expected count", async () => {
    await page.goto(`${baseUrl}${categoryHref}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-grid .product-card").first().waitFor({ state: "visible" });
    const firstBrand = page.locator('[data-filter-key="brands"]').first();
    const brand = String(await firstBrand.getAttribute("value") || "");
    assert.ok(brand, "expected first brand facet to have value");

    await firstBrand.check();
    const expectedIds = baseIds.filter((id) => String(byId.get(id)?.brand || "") === brand);
    assert.ok(expectedIds.length > 0, `expected products for brand ${brand}`);
    await waitForCardIds(page, expectedIds, "brand filter");

    await page.locator(".filters-selected-top .filter-chip", { hasText: brand }).first().waitFor({ state: "visible" });
    await assertNoUiCrash(page, errors, "brand filter");
  });

  await t.test("multi-select protocol facet matches any selected value", async () => {
    await page.goto(`${baseUrl}${categoryHref}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-grid .product-card").first().waitFor({ state: "visible" });
    const protocolCount = await page.locator('[data-filter-key="protocols"]').count();
    if (protocolCount < 2) return;

    const selectedProtocols = [
      String(await page.locator('[data-filter-key="protocols"]').nth(0).getAttribute("value") || ""),
      String(await page.locator('[data-filter-key="protocols"]').nth(1).getAttribute("value") || "")
    ].filter(Boolean);
    const selected = new Set(selectedProtocols);
    const expectedIds = baseIds.filter((id) => protocolValues(byId.get(id)).some((value) => selected.has(value)));
    assert.ok(expectedIds.length > 0, `expected products for protocols ${selectedProtocols.join(", ")}`);

    await page.locator('[data-filter-key="protocols"]').nth(0).check();
    await page.locator('[data-filter-key="protocols"]').nth(1).check();
    await waitForCardIds(page, expectedIds, "multi protocol filter");
    await assertNoUiCrash(page, errors, "multi protocol filter");
  });

  await t.test("price range filters by ruble card price and clear chip restores listing", async () => {
    await page.goto(`${baseUrl}${categoryHref}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-grid .product-card").first().waitFor({ state: "visible" });
    const priced = baseIds
      .map((id) => ({ id, price: priceRub(byId.get(id)) }))
      .filter((row) => row.price != null)
      .sort((a, b) => a.price - b.price);
    const min = priced[Math.floor(priced.length / 3)].price;
    const max = priced[Math.ceil((priced.length * 2) / 3)].price;
    const expectedIds = baseIds.filter((id) => {
      const price = priceRub(byId.get(id));
      return price != null && price >= min && price <= max;
    });
    assert.ok(expectedIds.length > 0 && expectedIds.length < baseIds.length, `expected a narrowing price range, got ${expectedIds.length}/${baseIds.length}`);

    await page.fill("#minPriceFilter", String(min));
    await page.fill("#maxPriceFilter", String(max));
    await waitForCardIds(page, expectedIds, "price range filter");

    await page.locator("[data-chip-clear-all]").click();
    await waitForCardIds(page, baseIds, "clear all filters");
    await assertNoUiCrash(page, errors, "price range filter");
  });

  await t.test("price sort orders visible cards in both directions", async () => {
    await page.goto(`${baseUrl}${categoryHref}`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-grid .product-card").first().waitFor({ state: "visible" });
    const expectedCheap = [...baseIds].sort((a, b) => {
      const ap = priceRub(byId.get(a));
      const bp = priceRub(byId.get(b));
      if (ap == null && bp == null) return baseIds.indexOf(a) - baseIds.indexOf(b);
      if (ap == null) return 1;
      if (bp == null) return -1;
      if (ap !== bp) return ap - bp;
      return baseIds.indexOf(a) - baseIds.indexOf(b);
    });
    const expectedExpensive = [...baseIds].sort((a, b) => {
      const ap = priceRub(byId.get(a));
      const bp = priceRub(byId.get(b));
      if (ap == null && bp == null) return baseIds.indexOf(a) - baseIds.indexOf(b);
      if (ap == null) return 1;
      if (bp == null) return -1;
      if (ap !== bp) return bp - ap;
      return baseIds.indexOf(a) - baseIds.indexOf(b);
    });

    await selectSortMode(page, "cheaper");
    await waitForCardIds(page, expectedCheap, "cheap sort");
    await selectSortMode(page, "expensive");
    await waitForCardIds(page, expectedExpensive, "expensive sort");
    await assertNoUiCrash(page, errors, "price sort");
  });

  await t.test("brand page filters auto-apply and multi-select protocols as any value", async () => {
    await page.goto(`${baseUrl}/brands/wiren-board`, { waitUntil: "domcontentloaded" });
    await page.locator(".product-grid .product-card").first().waitFor({ state: "visible" });
    const brandHrefs = [
      "/brands/wiren-board",
      ...await page.$$eval('a[href^="/brands/wiren-board/"]', (links) =>
        Array.from(new Set(links.map((a) => a.getAttribute("href")).filter(Boolean)))
      )
    ];
    let brandBaseIds = [];
    let protocolCount = 0;
    for (const href of brandHrefs) {
      await page.goto(`${baseUrl}${href}`, { waitUntil: "domcontentloaded" });
      try {
        await page.locator(".product-grid .product-card").first().waitFor({ state: "visible", timeout: 5000 });
      } catch {
        continue;
      }
      protocolCount = await page.locator('[data-filter-key="protocols"]').count();
      if (protocolCount >= 2) {
        brandBaseIds = await getVisibleCardIds(page);
        break;
      }
    }
    assert.ok(protocolCount >= 2, "expected a Wiren Board brand section to expose protocol facets");

    const selectedProtocols = [
      String(await page.locator('[data-filter-key="protocols"]').nth(0).getAttribute("value") || ""),
      String(await page.locator('[data-filter-key="protocols"]').nth(1).getAttribute("value") || "")
    ].filter(Boolean);
    const selected = new Set(selectedProtocols);
    const expectedIds = brandBaseIds.filter((id) => protocolValues(byId.get(id)).some((value) => selected.has(value)));
    assert.ok(expectedIds.length > 0, `expected brand products for protocols ${selectedProtocols.join(", ")}`);

    const applyDisplay = await page.locator("#brandApplyFiltersBtn").evaluate((el) => getComputedStyle(el).display);
    assert.equal(applyDisplay, "none", "brand apply button should be hidden on desktop");
    await page.locator('[data-filter-key="protocols"]').nth(0).check();
    await page.locator('[data-filter-key="protocols"]').nth(1).check();
    await waitForCardIds(page, expectedIds, "brand multi protocol filter");
    await assertNoUiCrash(page, errors, "brand multi protocol filter");
  });

  assert.deepEqual(errors, [], `unexpected browser errors\n${errors.join("\n")}`);
});
