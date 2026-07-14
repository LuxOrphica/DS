const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn } = require("node:child_process");
const path = require("node:path");

const meta = require("../services/meta-tags");

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
      // keep polling while server starts
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(t) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, TURSO_URL: "", TURSO_AUTH_TOKEN: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForHealth(`http://127.0.0.1:${port}/api/health`);
  return { baseUrl: `http://127.0.0.1:${port}` };
}

// ── Pure builder unit tests ──────────────────────────────────────────────────

test("productMeta puts price in Schema offers as RUB, not the source currency", () => {
  const html = meta.productMeta("https://delaemseti.shop", {
    id: "LX-1",
    article: "1",
    name: "Тестовый датчик",
    brand: "Loxone",
    category: "Безопасность и доступ",
    price: 2490, // price = price_rub (в рублях), даже если исходная валюта EUR
    priceCurrency: "EUR",
    description: "Датчик движения для умного дома",
    image: "/images/x.jpg"
  });
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.offers["@type"], "Offer");
  assert.equal(ld.offers.price, "2490");
  assert.equal(ld.offers.priceCurrency, "RUB");
  assert.doesNotMatch(html, /EUR/);
  assert.match(html, /property="og:type" content="product"/);
});

test("productMeta escapes HTML and keeps a single title", () => {
  const html = meta.productMeta("https://delaemseti.shop", {
    id: "X-2",
    name: 'Реле <b>"Умное"</b>',
    brand: "Wiren Board",
    price: 0,
    description: "Описание <script>alert(1)</script> тут"
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;b&gt;/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
});

test("truncate respects word boundary and max length", () => {
  const out = meta.truncate("один два три четыре пять шесть семь", 20);
  assert.ok(out.length <= 21, `len=${out.length}`);
  assert.match(out, /…$/);
});

// ── End-to-end injection tests ───────────────────────────────────────────────

test("home page is served with generated meta tags", async (t) => {
  const { baseUrl } = await startServer(t);
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Делаем сети \| Оборудование умного дома<\/title>/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /rel="canonical"/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  // SPA-оболочка не сломана
  assert.match(html, /<div id="app">/);
  assert.match(html, /src="\/app\.js"/);
});

test("product page injects product meta with RUB price and JSON-LD", async (t) => {
  const { baseUrl } = await startServer(t);
  // берём любой активный товар из витрины
  const list = await (await fetch(`${baseUrl}/api/products`)).json();
  const products = Array.isArray(list) ? list : list.products || list.rows || [];
  const withPrice = products.find((p) => Number(p.price) > 0) || products[0];
  assert.ok(withPrice, "no products to test");

  const res = await fetch(`${baseUrl}/product/${encodeURIComponent(withPrice.id)}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /property="og:type" content="product"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /"priceCurrency":"RUB"/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
});

test("unknown product falls back to site meta without breaking", async (t) => {
  const { baseUrl } = await startServer(t);
  const res = await fetch(`${baseUrl}/product/NO-SUCH-ID-12345`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Делаем сети/);
  assert.match(html, /<div id="app">/);
});
