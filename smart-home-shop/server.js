const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config({ quiet: true });
const {
  initSchema,
  listProducts,
  listAdminProductsAdvanced,
  listAdminFilters,
  listBrandsAdmin,
  createBrandAdmin,
  updateBrandAdmin,
  deleteBrandAdmin,
  listFunctionalCategoriesAdmin,
  createFunctionalCategoryAdmin,
  updateFunctionalCategoryAdmin,
  deleteFunctionalCategoryAdmin,
  listBrandCategoriesAdmin,
  listBrandNativeCategoriesAdmin,
  createBrandCategoryAdmin,
  updateBrandCategoryAdmin,
  deleteBrandCategoryAdmin,
  listAttributesAdmin,
  createAttributeAdmin,
  updateAttributeAdmin,
  deleteAttributeAdmin,
  listCategoryAttributeTemplates,
  createCategoryAttributeTemplate,
  updateCategoryAttributeTemplate,
  deleteCategoryAttributeTemplate,
  getAdminProductDetails,
  createAdminProduct,
  updateAdminProduct,
  upsertAdminProduct,
  applyBulkAdminProducts,
  listProductVariantsAdmin,
  createProductVariantAdmin,
  updateProductVariantAdmin,
  deleteProductVariantAdmin,
  listProductMediaAdmin,
  saveProductMediaAdmin,
  listProductDocumentsAdmin,
  saveProductDocumentsAdmin,
  listProductTabsAdmin,
  createProductTabAdmin,
  updateProductTabAdmin,
  deleteProductTabAdmin,
  saveTabBlocksAdmin,
  listAdminAuditLog,
  listAdminOrders,
  listPublicOrdersByIds,
  listPublicOrdersByLookup,
  getAdminOrderById,
  updateAdminOrder,
  getLatestExchangeRate,
  upsertExchangeRate,
  recalculateProductPriceRub,
  rebuildCatalogConflicts,
  createOrder,
  getStats,
  dbPath
} = require("./db/database");
const { createExchangeRateService } = require("./services/exchange-rate-service");
const { registerPublicRoutes } = require("./routes/public-routes");
const { registerAdminRoutes } = require("./routes/admin-routes");
const { registerAdminSessionRoutes } = require("./routes/admin-session-routes");
const { registerPageRoutes } = require("./routes/page-routes");
const { createAdminAuthMiddleware } = require("./middleware/admin-auth");
const { createAdminSessionStore } = require("./services/admin-session-store");
const { createRequestContextMiddleware } = require("./middleware/request-context");
const { parseAllowedOrigins, createCorsOptions } = require("./middleware/cors-policy");
const { createApiRateLimitMiddleware } = require("./middleware/api-rate-limit");
const { createHelmetMiddleware } = require("./middleware/security-headers");

const app = express();
const port = Number(process.env.PORT || 3030);
const EUR_RUB_REFRESH_MS = 24 * 60 * 60 * 1000;
const disableAdminAuth = String(process.env.DISABLE_ADMIN_AUTH || "").trim() === "1";
const adminToken = String(process.env.ADMIN_TOKEN || "").trim();
const adminSessionTimeoutMs = Math.max(
  5 * 60 * 1000,
  Number(process.env.ADMIN_SESSION_TIMEOUT_MS || 30 * 60 * 1000)
);
const trustProxyRaw = String(process.env.TRUST_PROXY || "").trim();
const apiBodyLimit = String(process.env.API_BODY_LIMIT || "1mb").trim();
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS || "");
const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
const cspReportOnly = String(process.env.CSP_REPORT_ONLY || "").trim() === "1";

initSchema();

const exchangeRateService = createExchangeRateService({
  upsertExchangeRate,
  recalculateProductPriceRub
});
const adminSessionStore = createAdminSessionStore({ ttlMs: adminSessionTimeoutMs });

if (trustProxyRaw) {
  const trustProxy = trustProxyRaw === "1" ? true : Number.isFinite(Number(trustProxyRaw)) ? Number(trustProxyRaw) : trustProxyRaw;
  app.set("trust proxy", trustProxy);
}

const corsOptions = createCorsOptions({
  allowedOrigins,
  strictMode: isProduction
});

app.use(createRequestContextMiddleware({ enableLogs: true }));
app.use(createHelmetMiddleware({ reportOnly: cspReportOnly }));
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: apiBodyLimit, strict: true }));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json; charset=UTF-8");
  }
  next();
});

app.use(createApiRateLimitMiddleware({
  windowMs: Math.max(5_000, Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000)),
  maxRequests: Math.max(20, Number(process.env.API_RATE_LIMIT_MAX || 240))
}));

app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === ".html") {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else if (ext === ".js" || ext === ".mjs" || ext === ".css") {
        // Short cache for app shell assets: better perf, still quick rollout of UI fixes.
        res.setHeader("Cache-Control", "public, max-age=600");
      } else if (
        ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" ||
        ext === ".webp" || ext === ".avif" || ext === ".svg" || ext === ".ico" ||
        ext === ".woff" || ext === ".woff2" || ext === ".ttf" || ext === ".otf"
      ) {
        res.setHeader("Cache-Control", "public, max-age=2592000");
      } else if (ext === ".json") {
        res.setHeader("Cache-Control", "public, max-age=300");
      }

      if (ext === ".html") res.setHeader("Content-Type", "text/html; charset=UTF-8");
      if (ext === ".js" || ext === ".mjs") res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
      if (ext === ".css") res.setHeader("Content-Type", "text/css; charset=UTF-8");
      if (ext === ".json") res.setHeader("Content-Type", "application/json; charset=UTF-8");
    }
  })
);

registerPublicRoutes(app, {
  dbPath,
  getStats,
  getLatestExchangeRate,
  listProducts,
  createOrder,
  listPublicOrdersByIds,
  listPublicOrdersByLookup
});

registerAdminSessionRoutes(app, {
  disableAdminAuth,
  adminToken,
  adminSessionStore,
  isProduction
});

app.use(
  "/api/admin",
  createAdminAuthMiddleware({
    adminToken,
    disableAuth: disableAdminAuth,
    validateAdminSession: (sessionId) => adminSessionStore.getSession(sessionId, { touch: true })
  })
);

registerAdminRoutes(app, {
  refreshEurRubRate: exchangeRateService.refreshEurRubRate,
  rebuildCatalogConflicts,
  listAdminFilters,
  listBrandsAdmin,
  createBrandAdmin,
  updateBrandAdmin,
  deleteBrandAdmin,
  listFunctionalCategoriesAdmin,
  createFunctionalCategoryAdmin,
  updateFunctionalCategoryAdmin,
  deleteFunctionalCategoryAdmin,
  listBrandCategoriesAdmin,
  listBrandNativeCategoriesAdmin,
  createBrandCategoryAdmin,
  updateBrandCategoryAdmin,
  deleteBrandCategoryAdmin,
  listAttributesAdmin,
  createAttributeAdmin,
  updateAttributeAdmin,
  deleteAttributeAdmin,
  listCategoryAttributeTemplates,
  createCategoryAttributeTemplate,
  updateCategoryAttributeTemplate,
  deleteCategoryAttributeTemplate,
  listAdminProductsAdvanced,
  getAdminProductDetails,
  createAdminProduct,
  updateAdminProduct,
  upsertAdminProduct,
  applyBulkAdminProducts,
  listProductVariantsAdmin,
  createProductVariantAdmin,
  updateProductVariantAdmin,
  deleteProductVariantAdmin,
  listProductMediaAdmin,
  saveProductMediaAdmin,
  listProductDocumentsAdmin,
  saveProductDocumentsAdmin,
  listProductTabsAdmin,
  createProductTabAdmin,
  updateProductTabAdmin,
  deleteProductTabAdmin,
  saveTabBlocksAdmin,
  listAdminOrders,
  getAdminOrderById,
  updateAdminOrder,
  listAdminAuditLog
});

registerPageRoutes(app, __dirname);

app.use((err, req, res, next) => {
  if (!err) return next();
  if (String(err.message || "").toLowerCase().includes("cors")) {
    return res.status(403).json({ ok: false, error: "CORS forbidden" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "Payload too large" });
  }
  console.error(`[${req.requestId || "-"}]`, err);
  return res.status(500).json({ ok: false, error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`Smart Home Shop server started: http://localhost:${port}`);
  console.log(`DB: ${dbPath}`);
  if (disableAdminAuth) {
    console.warn("ADMIN AUTH DISABLED (DISABLE_ADMIN_AUTH=1)");
  } else if (!adminToken) {
    console.warn("ADMIN_TOKEN is not set. /api/admin/* will return 503 until configured.");
  }
  if (isProduction && allowedOrigins.length === 0) {
    console.warn("CORS_ALLOWED_ORIGINS is empty in production mode: cross-origin browser requests will be blocked.");
  }
  if (cspReportOnly) {
    console.warn("CSP is running in report-only mode (CSP_REPORT_ONLY=1)");
  }

  exchangeRateService.refreshEurRubRate().then((result) => {
    if (result.ok) {
      console.log(`EUR/RUB updated: ${Number(result.saved?.rate || 0).toFixed(4)} (${result.saved?.effectiveDate || "-"})`);
    } else {
      console.warn(`EUR/RUB update skipped: ${result.error}`);
    }
  });

  const eurRubTimer = setInterval(() => {
    exchangeRateService.refreshEurRubRate().then((result) => {
      if (!result.ok) console.warn(`EUR/RUB update skipped: ${result.error}`);
    });
  }, EUR_RUB_REFRESH_MS);

  const gracefulShutdown = (signal) => {
    clearInterval(eurRubTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
    if (signal) {
      console.log(`Received ${signal}, shutting down...`);
    }
  };

  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
});

server.requestTimeout = Math.max(5_000, Number(process.env.REQUEST_TIMEOUT_MS || 30_000));
server.headersTimeout = Math.max(5_000, Number(process.env.HEADERS_TIMEOUT_MS || 35_000));
server.keepAliveTimeout = Math.max(1_000, Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5_000));
