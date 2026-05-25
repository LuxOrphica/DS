function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function resolveValue(value) {
  return await Promise.resolve(value);
}

function registerAdminRoutes(app, deps) {
  const {
    refreshEurRubRate,
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
  } = deps;

  app.post("/api/admin/exchange-rate/refresh", asyncRoute(async (req, res) => {
    const result = await resolveValue(refreshEurRubRate());
    if (!result.ok) return res.status(502).json({ ok: false, error: result.error });
    return res.json({ ok: true, eurRub: result.saved });
  }));

  app.post("/api/admin/catalog/conflicts/rebuild", asyncRoute(async (req, res) => {
    const result = await resolveValue(rebuildCatalogConflicts());
    return res.json({ ok: true, ...result });
  }));

  app.get("/api/admin/filters", asyncRoute(async (req, res) => {
    res.json(await resolveValue(listAdminFilters()));
  }));

  app.get("/api/admin/brands", asyncRoute(async (req, res) => {
    res.json({ brands: await resolveValue(listBrandsAdmin()) });
  }));

  app.post("/api/admin/brands", asyncRoute(async (req, res) => {
    const brand = await resolveValue(createBrandAdmin(req.body || {}));
    res.status(201).json({ success: true, brand });
  }));

  app.patch("/api/admin/brands/:brandId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateBrandAdmin(req.params.brandId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Brand not found or unchanged" });
    res.json({ success: true, changes });
  }));

  app.delete("/api/admin/brands/:brandId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(deleteBrandAdmin(req.params.brandId));
    if (!changes) return res.status(404).json({ success: false, error: "Brand not found" });
    res.json({ success: true });
  }));

  app.get("/api/admin/functional-categories", asyncRoute(async (req, res) => {
    res.json({ categories: await resolveValue(listFunctionalCategoriesAdmin()) });
  }));

  app.post("/api/admin/functional-categories", asyncRoute(async (req, res) => {
    const category = await resolveValue(createFunctionalCategoryAdmin(req.body || {}));
    res.status(201).json({ success: true, category });
  }));

  app.patch("/api/admin/functional-categories/:categoryId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateFunctionalCategoryAdmin(req.params.categoryId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Category not found or unchanged" });
    res.json({ success: true, changes });
  }));

  app.delete("/api/admin/functional-categories/:categoryId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(deleteFunctionalCategoryAdmin(req.params.categoryId));
    if (!changes) return res.status(404).json({ success: false, error: "Category not found" });
    res.json({ success: true });
  }));

  app.get("/api/admin/brand-categories", asyncRoute(async (req, res) => {
    const brandId = req.query.brandId ?? null;
    res.json({ categories: await resolveValue(listBrandCategoriesAdmin(brandId)) });
  }));

  app.get("/api/admin/brand-native-categories", asyncRoute(async (req, res) => {
    const brand = String(req.query.brand || "").trim();
    res.json({ brand, categories: await resolveValue(listBrandNativeCategoriesAdmin(brand)) });
  }));

  app.post("/api/admin/brand-categories", asyncRoute(async (req, res) => {
    const category = await resolveValue(createBrandCategoryAdmin(req.body || {}));
    res.status(201).json({ success: true, category });
  }));

  app.patch("/api/admin/brand-categories/:categoryId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateBrandCategoryAdmin(req.params.categoryId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Category not found or unchanged" });
    res.json({ success: true, changes });
  }));

  app.delete("/api/admin/brand-categories/:categoryId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(deleteBrandCategoryAdmin(req.params.categoryId));
    if (!changes) return res.status(404).json({ success: false, error: "Category not found" });
    res.json({ success: true });
  }));

  app.get("/api/admin/attributes", asyncRoute(async (req, res) => {
    res.json({ attributes: await resolveValue(listAttributesAdmin()) });
  }));

  app.post("/api/admin/attributes", asyncRoute(async (req, res) => {
    const attribute = await resolveValue(createAttributeAdmin(req.body || {}));
    res.status(201).json({ success: true, attribute });
  }));

  app.patch("/api/admin/attributes/:attributeId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateAttributeAdmin(req.params.attributeId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Attribute not found or unchanged" });
    res.json({ success: true, changes });
  }));

  app.delete("/api/admin/attributes/:attributeId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(deleteAttributeAdmin(req.params.attributeId));
    if (!changes) return res.status(404).json({ success: false, error: "Attribute not found" });
    res.json({ success: true });
  }));

  app.get("/api/admin/category-attribute-templates", asyncRoute(async (req, res) => {
    const categoryName = String(req.query.categoryName || "").trim();
    res.json({ templates: await resolveValue(listCategoryAttributeTemplates(categoryName)) });
  }));

  app.post("/api/admin/category-attribute-templates", asyncRoute(async (req, res) => {
    const template = await resolveValue(createCategoryAttributeTemplate(req.body || {}));
    res.status(201).json({ success: true, template });
  }));

  app.patch("/api/admin/category-attribute-templates/:templateId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateCategoryAttributeTemplate(req.params.templateId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Template not found or unchanged" });
    res.json({ success: true, changes });
  }));

  app.delete("/api/admin/category-attribute-templates/:templateId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(deleteCategoryAttributeTemplate(req.params.templateId));
    if (!changes) return res.status(404).json({ success: false, error: "Template not found" });
    res.json({ success: true });
  }));

  app.get("/api/admin/products", asyncRoute(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 50)));
    const offset = Math.min(100_000, Math.max(0, Number(req.query.offset || 0)));
    const q = String(req.query.q || "").trim();
    const result = await resolveValue(listAdminProductsAdvanced({ ...req.query, limit, offset, q }));
    return res.json({
      ...result,
      rows: result.products,
      total: result.pagination.total
    });
  }));

  app.get("/api/admin/products/:id", asyncRoute(async (req, res) => {
    const row = await resolveValue(getAdminProductDetails(req.params.id));
    if (!row) return res.status(404).json({ error: "Product not found" });
    if (!row.group && row.groupName) row.group = row.groupName;
    res.json(row);
  }));

  app.post("/api/admin/products", asyncRoute(async (req, res) => {
    const created = await resolveValue(createAdminProduct(req.body || {}));
    return res.status(201).json({ success: true, product: created });
  }));

  app.patch("/api/admin/products/:id", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateAdminProduct(req.params.id, req.body || {}));
    if (!changes) return res.status(404).json({ error: "Product not found or unchanged" });
    return res.json({ ok: true, changes });
  }));

  app.put("/api/admin/products/:id", asyncRoute(async (req, res) => {
    const ok = await resolveValue(upsertAdminProduct(req.params.id, req.body || {}));
    if (!ok) return res.status(404).json({ success: false, error: "Product not found or unchanged" });
    return res.json({ success: true });
  }));

  app.post("/api/admin/products/bulk", asyncRoute(async (req, res) => {
    const { action, productIds, data } = req.body || {};
    const result = await resolveValue(applyBulkAdminProducts({ action, productIds, data }));
    if (!result.success) return res.status(400).json({ success: false, error: result.message || "Operation failed" });
    return res.json(result);
  }));

  app.get("/api/admin/products/:id/variants", asyncRoute(async (req, res) => {
    res.json({ variants: await resolveValue(listProductVariantsAdmin(req.params.id)) });
  }));

  app.post("/api/admin/products/:id/variants", asyncRoute(async (req, res) => {
    const payload = req.body || {};
    if (!payload.sku) return res.status(400).json({ success: false, error: "SKU is required" });
    const variant = await resolveValue(createProductVariantAdmin(req.params.id, payload));
    return res.status(201).json({ success: true, variant });
  }));

  app.patch("/api/admin/variants/:variantId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateProductVariantAdmin(req.params.variantId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Variant not found or unchanged" });
    return res.json({ success: true, changes });
  }));

  app.delete("/api/admin/variants/:variantId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(deleteProductVariantAdmin(req.params.variantId));
    if (!changes) return res.status(404).json({ success: false, error: "Variant not found" });
    return res.json({ success: true });
  }));

  app.get("/api/admin/products/:id/media", asyncRoute(async (req, res) => {
    res.json({ media: await resolveValue(listProductMediaAdmin(req.params.id)) });
  }));

  app.put("/api/admin/products/:id/media", asyncRoute(async (req, res) => {
    const media = Array.isArray(req.body?.media) ? req.body.media : [];
    const saved = await resolveValue(saveProductMediaAdmin(req.params.id, media));
    res.json({ success: true, media: saved });
  }));

  app.get("/api/admin/products/:id/documents", asyncRoute(async (req, res) => {
    res.json({ documents: await resolveValue(listProductDocumentsAdmin(req.params.id)) });
  }));

  app.put("/api/admin/products/:id/documents", asyncRoute(async (req, res) => {
    const documents = Array.isArray(req.body?.documents) ? req.body.documents : [];
    const saved = await resolveValue(saveProductDocumentsAdmin(req.params.id, documents));
    res.json({ success: true, documents: saved });
  }));

  app.get("/api/admin/products/:id/tabs", asyncRoute(async (req, res) => {
    const variantId = req.query.variantId ?? null;
    res.json({ tabs: await resolveValue(listProductTabsAdmin(req.params.id, variantId)) });
  }));

  app.post("/api/admin/products/:id/tabs", asyncRoute(async (req, res) => {
    const created = await resolveValue(createProductTabAdmin(req.params.id, req.body || {}));
    res.status(201).json({ success: true, tab: created });
  }));

  app.patch("/api/admin/tabs/:tabId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateProductTabAdmin(req.params.tabId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Tab not found or unchanged" });
    return res.json({ success: true, changes });
  }));

  app.delete("/api/admin/tabs/:tabId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(deleteProductTabAdmin(req.params.tabId));
    if (!changes) return res.status(404).json({ success: false, error: "Tab not found" });
    return res.json({ success: true });
  }));

  app.put("/api/admin/tabs/:tabId/blocks", asyncRoute(async (req, res) => {
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const saved = await resolveValue(saveTabBlocksAdmin(req.params.tabId, blocks));
    res.json({ success: true, blocks: saved });
  }));

  app.get("/api/admin/orders", asyncRoute(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const offset = Math.min(100_000, Math.max(0, Number(req.query.offset || 0)));
    res.json(await resolveValue(listAdminOrders({
      limit,
      offset,
      search: String(req.query.search || "").trim(),
      status: String(req.query.status || "").trim(),
      paymentStatus: String(req.query.paymentStatus || "").trim(),
      paymentMethod: String(req.query.paymentMethod || "").trim(),
      manager: String(req.query.manager || "").trim(),
      deliveryMethod: String(req.query.deliveryMethod || "").trim(),
      dateFrom: String(req.query.dateFrom || "").trim(),
      dateTo: String(req.query.dateTo || "").trim()
    })));
  }));

  app.get("/api/admin/orders/:orderId", asyncRoute(async (req, res) => {
    const order = await resolveValue(getAdminOrderById(req.params.orderId));
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, order });
  }));

  app.patch("/api/admin/orders/:orderId", asyncRoute(async (req, res) => {
    const changes = await resolveValue(updateAdminOrder(req.params.orderId, req.body || {}));
    if (!changes) return res.status(404).json({ success: false, error: "Order not found or unchanged" });
    res.json({ success: true, changes });
  }));

  app.get("/api/admin/audit-log", asyncRoute(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const offset = Math.min(100_000, Math.max(0, Number(req.query.offset || 0)));
    const entityType = String(req.query.entityType || "").trim();
    const action = String(req.query.action || "").trim();
    res.json(await resolveValue(listAdminAuditLog({ limit, offset, entityType, action })));
  }));
}

module.exports = { registerAdminRoutes };
