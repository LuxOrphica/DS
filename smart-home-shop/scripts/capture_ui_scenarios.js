const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const REPORTS_ROOT = path.join(ROOT, "reports");

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "-",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join("");
}

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

async function waitForHealth(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Health check timeout for ${url}`);
}

async function startServer(env = {}) {
  const port = await getFreePort();
  const allowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].join(",");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DISABLE_ADMIN_AUTH: "1",
      CORS_ALLOWED_ORIGINS: allowedOrigins,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(`${baseUrl}/api/health`);

  return {
    baseUrl,
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => resolve(), 2500);
      }),
    getLogs: () => ({ stdout, stderr })
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
  if (/Ошибка интерфейса|Обновите страницу/i.test(bodyText)) {
    throw new Error(`${label}: UI error banner rendered`);
  }
  if (errors.length) {
    throw new Error(`${label}: unexpected browser errors\n${errors.join("\n")}`);
  }
}

async function captureScenario(browser, baseUrl, scenario, context) {
  const page = await browser.newPage({ viewport: scenario.viewport });
  const errors = collectPageErrors(page);
  const startedAt = Date.now();
  const result = {
    id: scenario.id,
    title: scenario.title,
    route: scenario.route,
    screenshot: scenario.screenshot,
    status: "FAIL",
    durationMs: 0,
    notes: [],
    errors: []
  };

  try {
    await scenario.run({ page, baseUrl, context });
    await assertNoUiCrash(page, errors, scenario.id);
    await page.screenshot({ path: scenario.screenshot, fullPage: true });
    result.status = "PASS";
    result.notes = scenario.notes || [];
  } catch (error) {
    result.errors.push(String(error && error.message ? error.message : error));
    try {
      await page.screenshot({ path: scenario.screenshot, fullPage: true });
    } catch {
      // ignore screenshot failure on hard crash
    }
  } finally {
    result.durationMs = Date.now() - startedAt;
    await page.close();
  }

  return result;
}

function mdEscape(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function main() {
  const runId = `ui-scenarios-${timestamp()}`;
  const outDir = path.join(REPORTS_ROOT, runId);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const productsRes = await fetch(`${server.baseUrl}/api/products`);
    const products = await productsRes.json();
    if (!Array.isArray(products) || !products.length) {
      throw new Error("Products API returned no products");
    }
    const firstProduct = products.find((p) => p && p.id && p.brand) || products[0];
    const firstBrandSlug = slugify(firstProduct.brand);
    const firstCategorySlug = slugify(firstProduct.topCategory || firstProduct.category);
    const firstSearchTerm = String(firstProduct.name || "").split(/\s+/)[0] || "WB";

    const context = {
      firstProduct,
      firstBrandSlug,
      firstCategorySlug,
      firstSearchTerm
    };

    const scenarios = [
      {
        id: "01-catalog-desktop",
        title: "Каталог: десктоп",
        route: "#/catalog",
        viewport: { width: 1440, height: 960 },
        screenshot: path.join(outDir, "01-catalog-desktop.png"),
        notes: ["Открывается сетка каталога", "Карточки товаров видимы"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/#/catalog`, { waitUntil: "domcontentloaded" });
          await page.locator(".product-card").first().waitFor({ state: "visible" });
        }
      },
      {
        id: "02-brand-mobile",
        title: "Бренд: мобильная страница",
        route: `#/brands/${firstBrandSlug}`,
        viewport: { width: 390, height: 844 },
        screenshot: path.join(outDir, "02-brand-mobile.png"),
        notes: ["Открывается экран бренда", "Видны карточки и верхний toolbar"],
        run: async ({ page, baseUrl, context }) => {
          await page.goto(`${baseUrl}/#/brands/${context.firstBrandSlug}`, { waitUntil: "domcontentloaded" });
          await page.locator("h1").waitFor({ state: "visible" });
          await page.locator(".product-card").first().waitFor({ state: "visible" });
        }
      },
      {
        id: "03-category-mobile",
        title: "Категория: мобильная страница",
        route: `#/catalog/${firstCategorySlug}`,
        viewport: { width: 390, height: 844 },
        screenshot: path.join(outDir, "03-category-mobile.png"),
        notes: ["Открывается экран категории", "Карточки товаров видимы"],
        run: async ({ page, baseUrl, context }) => {
          await page.goto(`${baseUrl}/#/catalog/${context.firstCategorySlug}`, { waitUntil: "domcontentloaded" });
          await page.locator(".product-card").first().waitFor({ state: "visible" });
        }
      },
      {
        id: "04-product-mobile",
        title: "Товар: мобильная карточка",
        route: `#/product/${firstProduct.id}`,
        viewport: { width: 390, height: 844 },
        screenshot: path.join(outDir, "04-product-mobile.png"),
        notes: ["Открывается страница товара", "Видны цена и основные CTA"],
        run: async ({ page, baseUrl, context }) => {
          await page.goto(`${baseUrl}/#/product/${context.firstProduct.id}`, { waitUntil: "domcontentloaded" });
          await page.locator(".product-page").waitFor({ state: "visible" });
          await page.locator(".product-page .price-main").first().waitFor({ state: "visible" });
        }
      },
      {
        id: "05-search-mobile",
        title: "Поиск: мобильная выдача",
        route: "#/catalog -> search",
        viewport: { width: 390, height: 844 },
        screenshot: path.join(outDir, "05-search-mobile.png"),
        notes: ["Поиск выдаёт карточки", "Открыт поисковый маршрут/режим"],
        run: async ({ page, baseUrl, context }) => {
          await page.goto(`${baseUrl}/#/catalog`, { waitUntil: "domcontentloaded" });
          const headerSearch = page.locator("#headerSearchInput");
          await headerSearch.evaluate((el, value) => {
            el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }, context.firstSearchTerm);
          await page.waitForFunction(() => Boolean(document.querySelector(".product-grid--search")), null, {
            timeout: 10000
          });
          await page.locator(".product-grid--search .product-card").first().waitFor({ state: "visible" });
        }
      },
      {
        id: "06-cart-mobile",
        title: "Корзина: мобильная страница",
        route: "#/cart",
        viewport: { width: 390, height: 844 },
        screenshot: path.join(outDir, "06-cart-mobile.png"),
        notes: ["Открывается экран корзины"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/#/cart`, { waitUntil: "domcontentloaded" });
          await page.locator(".cart-page").waitFor({ state: "visible" });
        }
      },
      {
        id: "07-orders-mobile",
        title: "Заказы: мобильный кабинет",
        route: "#/orders",
        viewport: { width: 390, height: 844 },
        screenshot: path.join(outDir, "07-orders-mobile.png"),
        notes: ["Открывается кабинет заказов"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/#/orders`, { waitUntil: "domcontentloaded" });
          await page.locator(".orders-cabinet").waitFor({ state: "visible" });
        }
      },
      {
        id: "08-admin-products",
        title: "Админка: список товаров",
        route: "/admin#/products",
        viewport: { width: 1440, height: 960 },
        screenshot: path.join(outDir, "08-admin-products.png"),
        notes: ["Грузится список товаров", "Счётчик заменяет Загрузка"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/admin#/products`, { waitUntil: "domcontentloaded" });
          await page.locator("#productsPage").waitFor({ state: "visible" });
          await page.waitForFunction(() => {
            const el = document.getElementById("productsCount");
            return Boolean(el && !/Загрузка/i.test(String(el.textContent || "")));
          });
        }
      },
      {
        id: "09-admin-product-editor",
        title: "Админка: редактор товара",
        route: "/admin#/products -> edit",
        viewport: { width: 1440, height: 960 },
        screenshot: path.join(outDir, "09-admin-product-editor.png"),
        notes: ["Открывается товар", "Видны вкладки редактора"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/admin#/products`, { waitUntil: "domcontentloaded" });
          const firstEditBtn = page.locator('#productsPage tbody tr button[aria-label="Редактировать"]').first();
          await firstEditBtn.waitFor({ state: "visible" });
          await firstEditBtn.click();
          await page.waitForFunction(() => /Редактирование:/i.test(String(document.querySelector("#adminApp")?.innerText || "")));
          await page.waitForFunction(() => {
            const text = String(document.querySelector("#adminApp")?.innerText || "");
            return /Основное/i.test(text) && /Варианты/i.test(text) && /Фото/i.test(text);
          });
        }
      },
      {
        id: "10-admin-product-tabs",
        title: "Админка: вкладки товара",
        route: "/admin#/products -> edit -> tabs",
        viewport: { width: 1440, height: 960 },
        screenshot: path.join(outDir, "10-admin-product-tabs.png"),
        notes: ["Переключение по вкладкам работает"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/admin#/products`, { waitUntil: "domcontentloaded" });
          const firstEditBtn = page.locator('#productsPage tbody tr button[aria-label="Редактировать"]').first();
          await firstEditBtn.waitFor({ state: "visible" });
          await firstEditBtn.click();
          await page.locator('.editor-tab[data-tab="photos"]').click();
          await page.waitForFunction(() => {
            const section = document.getElementById("photosSection");
            return Boolean(section && !section.hidden);
          });
        }
      },
      {
        id: "11-admin-orders",
        title: "Админка: заказы",
        route: "/admin#/orders",
        viewport: { width: 1440, height: 960 },
        screenshot: path.join(outDir, "11-admin-orders.png"),
        notes: ["Открывается страница заказов"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/admin#/orders`, { waitUntil: "domcontentloaded" });
          await page.locator("#ordersPage").waitFor({ state: "visible" });
        }
      },
      {
        id: "12-admin-categories",
        title: "Админка: категории",
        route: "/admin#/categories",
        viewport: { width: 1440, height: 960 },
        screenshot: path.join(outDir, "12-admin-categories.png"),
        notes: ["Открывается редактор категорий"],
        run: async ({ page, baseUrl }) => {
          await page.goto(`${baseUrl}/admin#/categories`, { waitUntil: "domcontentloaded" });
          await page.locator("#categoriesPage").waitFor({ state: "visible" });
        }
      }
    ];

    const results = [];
    for (const scenario of scenarios) {
      const res = await captureScenario(browser, server.baseUrl, scenario, context);
      results.push(res);
      const mark = res.status === "PASS" ? "PASS" : "FAIL";
      console.log(`${mark} ${res.id}`);
      if (res.errors.length) {
        console.log(res.errors.join("\n"));
      }
    }

    const logs = server.getLogs();
    const summary = {
      runId,
      generatedAt: new Date().toISOString(),
      baseUrl: server.baseUrl,
      passCount: results.filter((r) => r.status === "PASS").length,
      failCount: results.filter((r) => r.status === "FAIL").length,
      scenarios: results,
      serverLogs: logs
    };

    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(summary, null, 2), "utf8");

    const md = [
      `# UI Scenario Report`,
      ``,
      `- Run: \`${runId}\``,
      `- Base URL: \`${server.baseUrl}\``,
      `- PASS: **${summary.passCount}**`,
      `- FAIL: **${summary.failCount}**`,
      ``,
      `| Scenario | Status | Screenshot | Notes |`,
      `|---|---|---|---|`
    ];
    for (const item of results) {
      const relShot = path.basename(item.screenshot);
      const notes = item.status === "PASS" ? item.notes.join("; ") : item.errors.join(" ; ");
      md.push(`| ${mdEscape(item.title)} | ${item.status} | [${relShot}](${relShot}) | ${mdEscape(notes)} |`);
    }
    fs.writeFileSync(path.join(outDir, "report.md"), md.join("\n"), "utf8");

    console.log(`Report saved to ${outDir}`);
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
