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

async function createOrderThroughUi(page, baseUrl) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("ordersCabinetResetDone") === "1") return;
    sessionStorage.setItem("ordersCabinetResetDone", "1");
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
  await page.locator('#checkoutModalForm input[name="name"]').fill("Ui Cabinet Test");
  await page.locator('#checkoutModalForm input[name="phone"]').fill("+7 (912) 345-67-89");
  await page.locator('#checkoutModalForm input[name="address"]').fill("Moscow Test Street 42");
  await page.locator("#checkoutModalForm .cart-submit").click();
  await page.waitForFunction(() => /ORD-\d{8,}/.test(String(document.querySelector("#app")?.innerText || "")));
  return await page.evaluate(() => {
    const match = String(document.querySelector("#app")?.innerText || "").match(/ORD-\d{8,}/);
    return match ? match[0] : "";
  });
}

test("orders cabinet UI shows created local order and masks public detail", async (t) => {
  const baseUrl = await startServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = collectPageErrors(page);

  const orderId = await createOrderThroughUi(page, baseUrl);
  assert.match(orderId, /^ORD-\d{8,}$/);

  await page.goto(`${baseUrl}/orders`, { waitUntil: "domcontentloaded" });
  await page.locator(".orders-cabinet").waitFor({ state: "visible" });
  await page.waitForFunction((id) => String(document.querySelector("#app")?.innerText || "").includes(id), orderId);
  await page.locator(`a[href="/orders/${orderId}"]`).first().waitFor({ state: "visible" });

  await page.goto(`${baseUrl}/orders/${encodeURIComponent(orderId)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((id) => String(document.querySelector("#app")?.innerText || "").includes(id), orderId);
  const detailText = await page.locator("#app").innerText();
  assert.equal(detailText.includes("+7 (912) 345-67-89"), false, "order detail must not expose full phone");
  assert.equal(detailText.includes("79123456789"), false, "order detail must not expose normalized full phone");
  assert.equal(detailText.includes("Moscow Test Street 42"), false, "order detail must not expose full address");

  const phoneLookupRes = await fetch(`${baseUrl}/api/orders/lookup?query=${encodeURIComponent("79123456789")}&limit=20`);
  assert.equal(phoneLookupRes.status, 200);
  const phoneLookup = await phoneLookupRes.json();
  assert.equal(phoneLookup.ok, true);
  const foundByPhone = Array.isArray(phoneLookup.rows) ? phoneLookup.rows.find((row) => row && row.id === orderId) : null;
  assert.ok(foundByPhone, "phone lookup should find created order");
  assert.equal("customerPhone" in foundByPhone, false, "phone lookup API must not expose raw phone");
  assert.equal("customerAddress" in foundByPhone, false, "phone lookup API must not expose raw address");

  await assertNoUiCrash(page, errors, "orders cabinet ui");
  await context.close();
});
