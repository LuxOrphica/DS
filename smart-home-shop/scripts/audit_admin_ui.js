"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "reports", "admin-ui-audit");
const REPORT_PATH = path.join(REPORT_DIR, "admin-ui-audit.json");
const TOKEN = process.env.ADMIN_AUDIT_TOKEN || "admin-audit-token";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForHealth(baseUrl, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // keep polling while server starts
    }
    await sleep(250);
  }
  throw new Error(`Health check timeout for ${baseUrl}/api/health`);
}

async function startServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      TURSO_URL: "",
      TURSO_AUTH_TOKEN: "",
      PORT: String(port),
      ADMIN_TOKEN: TOKEN,
      CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl);
    return { baseUrl, child, stderr: () => stderr };
  } catch (error) {
    child.kill("SIGTERM");
    error.message = `${error.message}\n${stderr}`;
    throw error;
  }
}

function hasMojibake(text) {
  return /(?:\u0420.|\u0421.){3,}|\uFFFD|\u00C3.|\u00D0.|\u00D1.|(?:в[†–Џњ])/u.test(String(text || ""));
}

async function pageMetrics(page) {
  return await page.evaluate(() => {
    const bodyText = document.body.innerText || "";
    const visibleButtons = Array.from(document.querySelectorAll("button, a.btn, .nav-link"))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const emptyControlNodes = Array.from(document.querySelectorAll("button, a.btn"))
      .filter((el) => {
        const label = [
          el.textContent,
          el.getAttribute("aria-label"),
          el.getAttribute("title")
        ].map((value) => String(value || "").replace(/\s+/g, " ").trim()).find(Boolean);
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !label;
      });
    const emptyControlSamples = emptyControlNodes.slice(0, 10).map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: String(el.className || ""),
      id: String(el.id || ""),
      action: String(el.getAttribute("data-product-action") || el.getAttribute("data-order-action") || ""),
      html: String(el.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 180)
    }));

    const overflowing = [];
    for (const el of Array.from(document.querySelectorAll("main, section, table, .table-wrapper, .search-strip, .admin-header-content"))) {
      if (el.scrollWidth > el.clientWidth + 2) {
        overflowing.push({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || ""),
          id: String(el.id || ""),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth
        });
      }
    }

    return {
      title: document.title,
      textLength: bodyText.length,
      mojibakeLines: bodyText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => /(?:Р.|С.){3,}|�|Ã.|Ð.|Ñ.|(?:в[†–Џњ])/u.test(line))
        .slice(0, 20),
      visibleButtons: visibleButtons.slice(0, 60),
      emptyControls: emptyControlNodes.length,
      emptyControlSamples,
      overflowing
    };
  });
}

async function capture(page, name, report, errors) {
  await page.screenshot({ path: path.join(REPORT_DIR, `${name}.png`), fullPage: true });
  const metrics = await pageMetrics(page);
  report.screens.push({
    name,
    url: page.url(),
    screenshot: path.join("reports", "admin-ui-audit", `${name}.png`).replace(/\\/g, "/"),
    consoleErrors: errors.splice(0),
    ...metrics,
    hasMojibake: metrics.mojibakeLines.some(hasMojibake),
    hasHorizontalOverflow: metrics.overflowing.length > 0
  });
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    baseUrl: server.baseUrl,
    screens: [],
    issues: []
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err && err.message ? err.message : err)));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (/favicon|Failed to load resource|fonts\.googleapis\.com/i.test(text)) return;
      errors.push(text);
    });

    await page.goto(`${server.baseUrl}/admin`, { waitUntil: "domcontentloaded" });
    await page.locator("#adminLoginGate").waitFor({ state: "visible" });
    await page.fill("#adminTokenInput", TOKEN);
    await page.click("#adminLoginBtn");
    await page.locator("#adminApp").waitFor({ state: "visible" });
    await page.locator("#productsTableBody tr").first().waitFor({ state: "visible" });
    await capture(page, "products", report, errors);

    await page.goto(`${server.baseUrl}/admin#/categories`, { waitUntil: "domcontentloaded" });
    await page.locator("#categoriesPage").waitFor({ state: "visible" });
    await page.locator("#functionalTreeBody tr").first().waitFor({ state: "visible" });
    await capture(page, "categories", report, errors);

    await page.goto(`${server.baseUrl}/admin#/orders`, { waitUntil: "domcontentloaded" });
    await page.locator("#ordersPage").waitFor({ state: "visible" });
    await page.locator("#ordersTableBody tr").first().waitFor({ state: "visible" });
    await capture(page, "orders", report, errors);

    await page.goto(`${server.baseUrl}/admin#/settings`, { waitUntil: "domcontentloaded" });
    await page.locator("#settingsPage").waitFor({ state: "visible" });
    await page.locator("#categoryAttributeTemplatesBody").waitFor({ state: "visible" });
    await capture(page, "settings", report, errors);

    await page.goto(`${server.baseUrl}/admin#/products`, { waitUntil: "domcontentloaded" });
    await page.locator("#productsTableBody tr").first().waitFor({ state: "visible" });
    const firstEdit = page.locator('button[data-product-action="edit"]').first();
    if (await firstEdit.count()) {
      await firstEdit.click();
      await page.locator("#productEditPage").waitFor({ state: "visible" });
      await capture(page, "product-edit-main", report, errors);
      for (const tab of ["variants", "photos", "documents", "attributes", "content"]) {
        const tabButton = page.locator(`.editor-tab[data-tab="${tab}"]`);
        if (!(await tabButton.count())) continue;
        await tabButton.click();
        await capture(page, `product-edit-${tab}`, report, errors);
      }
    }

    for (const screen of report.screens) {
      if (screen.consoleErrors.length) {
        report.issues.push({ severity: "error", screen: screen.name, code: "console_errors", details: screen.consoleErrors });
      }
      if (screen.hasMojibake) {
        report.issues.push({ severity: "error", screen: screen.name, code: "visible_mojibake", details: screen.mojibakeLines });
      }
      if (screen.hasHorizontalOverflow) {
        report.issues.push({ severity: "warning", screen: screen.name, code: "horizontal_overflow", details: screen.overflowing });
      }
      if (screen.emptyControls > 0) {
        report.issues.push({ severity: "warning", screen: screen.name, code: "empty_visible_controls", count: screen.emptyControls, details: screen.emptyControlSamples });
      }
    }

    report.ok = !report.issues.some((issue) => issue.severity === "error");
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({
      ok: report.ok,
      screens: report.screens.length,
      issues: report.issues.length,
      reportFile: REPORT_PATH
    }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await browser.close();
    server.child.kill("SIGTERM");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
