"use strict";

const fs = require("fs");
const path = require("path");
const meta = require("../services/meta-tags");

// Инжектор серверных метатегов в SPA-оболочку (index.html).
// Соцсети (facebookexternalhit, TelegramBot, VK) и часть краулеров JS не исполняют —
// читают исходный HTML. Поэтому метатеги подставляются на сервере до отдачи страницы.
// На любой ошибке отдаём чистый index.html — страница не должна падать из-за метатегов.

function reqBaseUrl(req) {
  const envBase = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  return `${proto}://${host}`;
}

function xmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function injectMeta(html, headHtml) {
  const withoutTitle = html.replace(/[ \t]*<title>[\s\S]*?<\/title>\s*/i, "");
  if (/<\/head>/i.test(withoutTitle)) {
    return withoutTitle.replace(/<\/head>/i, `    ${headHtml}\n  </head>`);
  }
  return withoutTitle; // нет </head> — вернуть как есть, без падения
}

function registerMetaRoutes(app, { rootDir, loadProducts, ttlMs = 30_000 } = {}) {
  const indexPath = path.join(rootDir, "public", "index.html");
  let indexHtmlCache = null;

  function readIndexHtml() {
    if (indexHtmlCache == null) {
      indexHtmlCache = fs.readFileSync(indexPath, "utf8");
    }
    return indexHtmlCache;
  }

  // Снапшот витрины с TTL: цена свежая, но без запроса к БД на каждый хит.
  let snapshot = null;
  let refreshing = null;

  async function buildSnapshot() {
    const list = (await Promise.resolve(loadProducts())) || [];
    const byId = new Map();
    const brandCounts = new Map();
    const categoryCounts = new Map();
    for (const p of list) {
      byId.set(String(p.id), p);
      if (p.brand) brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1);
      const cat = p.primaryFunctionalCategory || p.category;
      if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
    return {
      at: Date.now(),
      list,
      byId,
      brandCounts,
      categoryCounts,
      activeProducts: list.length,
      brands: [...brandCounts.keys()].join(", ")
    };
  }

  async function getSnapshot() {
    const fresh = snapshot && Date.now() - snapshot.at < ttlMs;
    if (fresh) return snapshot;
    if (!refreshing) {
      refreshing = buildSnapshot()
        .then((snap) => {
          snapshot = snap;
          return snap;
        })
        .finally(() => {
          refreshing = null;
        });
    }
    // Если есть устаревший снапшот — отдаём его, обновление идёт в фоне.
    if (snapshot) return snapshot;
    return refreshing;
  }

  // Отдать index.html с подставленным <head>. На ошибке — чистый index.html.
  function sendWithMeta(req, res, buildHeadFn) {
    res.setHeader("Content-Type", "text/html; charset=UTF-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    try {
      const headHtml = buildHeadFn();
      const html = headHtml ? injectMeta(readIndexHtml(), headHtml) : readIndexHtml();
      return res.send(html);
    } catch {
      try {
        return res.send(readIndexHtml());
      } catch {
        return res.status(500).send("");
      }
    }
  }

  // Найти каноничное имя категории/бренда без учёта регистра.
  function matchKey(map, raw) {
    const needle = String(raw || "").trim().toLowerCase();
    for (const key of map.keys()) {
      if (String(key).toLowerCase() === needle) return key;
    }
    return null;
  }

  // ── Роуты (регистрируются ДО express.static, чтобы перехватить "/") ──────────

  const home = async (req, res) => {
    const snap = await getSnapshot().catch(() => null);
    sendWithMeta(req, res, () =>
      meta.homeMeta(reqBaseUrl(req), {
        activeProducts: snap ? snap.activeProducts : 0,
        brands: snap ? snap.brands : undefined
      })
    );
  };

  app.get("/", home);
  app.get("/catalog", home);

  app.get("/product/:id", async (req, res) => {
    const snap = await getSnapshot().catch(() => null);
    const product = snap ? snap.byId.get(String(req.params.id)) : null;
    if (!product) {
      // Неизвестный/неактивный товар — общий баннер сайта, без битого превью.
      return sendWithMeta(req, res, () =>
        meta.homeMeta(reqBaseUrl(req), {
          activeProducts: snap ? snap.activeProducts : 0,
          brands: snap ? snap.brands : undefined
        })
      );
    }
    sendWithMeta(req, res, () => meta.productMeta(reqBaseUrl(req), product));
  });

  app.get("/brand/:brand", async (req, res) => {
    const snap = await getSnapshot().catch(() => null);
    const canonicalBrand = snap ? matchKey(snap.brandCounts, req.params.brand) : null;
    const brand = canonicalBrand || req.params.brand;
    const count = snap && canonicalBrand ? snap.brandCounts.get(canonicalBrand) : 0;
    sendWithMeta(req, res, () =>
      meta.brandMeta(reqBaseUrl(req), { brand, count, path: `/brand/${encodeURIComponent(req.params.brand)}` })
    );
  });

  app.get("/catalog/:category", async (req, res) => {
    const snap = await getSnapshot().catch(() => null);
    const canonicalCat = snap ? matchKey(snap.categoryCounts, req.params.category) : null;
    const category = canonicalCat || req.params.category;
    const count = snap && canonicalCat ? snap.categoryCounts.get(canonicalCat) : 0;
    sendWithMeta(req, res, () =>
      meta.categoryMeta(reqBaseUrl(req), {
        category,
        count,
        path: `/catalog/${encodeURIComponent(req.params.category)}`
      })
    );
  });

  // ── robots.txt / sitemap.xml (для индексирования) ────────────────────────────

  app.get("/robots.txt", (req, res) => {
    const baseUrl = reqBaseUrl(req);
    const body = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin-legacy",
      "Disallow: /api/",
      "",
      `Sitemap: ${baseUrl}/sitemap.xml`,
      ""
    ].join("\n");
    res.setHeader("Content-Type", "text/plain; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(body);
  });

  app.get("/sitemap.xml", async (req, res) => {
    const baseUrl = reqBaseUrl(req);
    const snap = await getSnapshot().catch(() => null);

    const urls = [
      { loc: `${baseUrl}/`, priority: "1.0" },
      { loc: `${baseUrl}/catalog`, priority: "0.9" },
      { loc: `${baseUrl}/brands`, priority: "0.6" }
    ];
    if (snap) {
      for (const brand of snap.brandCounts.keys()) {
        urls.push({ loc: `${baseUrl}/brand/${encodeURIComponent(brand)}`, priority: "0.7" });
      }
      for (const category of snap.categoryCounts.keys()) {
        urls.push({ loc: `${baseUrl}/catalog/${encodeURIComponent(category)}`, priority: "0.7" });
      }
      for (const product of snap.list) {
        urls.push({ loc: `${baseUrl}/product/${encodeURIComponent(product.id)}`, priority: "0.8" });
      }
    }

    const body = urls
      .map((u) => `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    <priority>${u.priority}</priority>\n  </url>`)
      .join("\n");
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });
}

module.exports = { registerMetaRoutes };
