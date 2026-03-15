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

  app.post("/api/admin/exchange-rate/refresh", async (req, res) => {
    const result = await refreshEurRubRate();
    if (!result.ok) return res.status(502).json({ ok: false, error: result.error });
    return res.json({ ok: true, eurRub: result.saved });
  });

  app.post("/api/admin/catalog/conflicts/rebuild", (req, res) => {
    try {
      const result = rebuildCatalogConflicts();
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  });

  app.get("/api/admin/filters", (req, res) => {
    res.json(listAdminFilters());
  });

  app.get("/api/admin/brands", (req, res) => {
    res.json({ brands: listBrandsAdmin() });
  });

  app.post("/api/admin/brands", (req, res) => {
    try {
      const brand = createBrandAdmin(req.body || {});
      res.status(201).json({ success: true, brand });
    } catch (error) {
      res.status(400).json({ success: false, error: error?.message || "Brand create failed" });
    }
  });

  app.patch("/api/admin/brands/:brandId", (req, res) => {
    const changes = updateBrandAdmin(req.params.brandId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Brand not found or unchanged" });
    res.json({ success: true, changes });
  });

  app.delete("/api/admin/brands/:brandId", (req, res) => {
    const changes = deleteBrandAdmin(req.params.brandId);
    if (!changes) return res.status(404).json({ success: false, error: "Brand not found" });
    res.json({ success: true });
  });

  app.get("/api/admin/functional-categories", (req, res) => {
    res.json({ categories: listFunctionalCategoriesAdmin() });
  });

  app.post("/api/admin/functional-categories", (req, res) => {
    try {
      const category = createFunctionalCategoryAdmin(req.body || {});
      res.status(201).json({ success: true, category });
    } catch (error) {
      res.status(400).json({ success: false, error: error?.message || "Category create failed" });
    }
  });

  app.patch("/api/admin/functional-categories/:categoryId", (req, res) => {
    const changes = updateFunctionalCategoryAdmin(req.params.categoryId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Category not found or unchanged" });
    res.json({ success: true, changes });
  });

  app.delete("/api/admin/functional-categories/:categoryId", (req, res) => {
    const changes = deleteFunctionalCategoryAdmin(req.params.categoryId);
    if (!changes) return res.status(404).json({ success: false, error: "Category not found" });
    res.json({ success: true });
  });

  app.get("/api/admin/brand-categories", (req, res) => {
    const brandId = req.query.brandId ?? null;
    res.json({ categories: listBrandCategoriesAdmin(brandId) });
  });

  app.get("/api/admin/brand-native-categories", (req, res) => {
    const brand = String(req.query.brand || "").trim();
    res.json({ brand, categories: listBrandNativeCategoriesAdmin(brand) });
  });

  app.post("/api/admin/brand-categories", (req, res) => {
    try {
      const category = createBrandCategoryAdmin(req.body || {});
      res.status(201).json({ success: true, category });
    } catch (error) {
      res.status(400).json({ success: false, error: error?.message || "Brand category create failed" });
    }
  });

  app.patch("/api/admin/brand-categories/:categoryId", (req, res) => {
    const changes = updateBrandCategoryAdmin(req.params.categoryId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Category not found or unchanged" });
    res.json({ success: true, changes });
  });

  app.delete("/api/admin/brand-categories/:categoryId", (req, res) => {
    const changes = deleteBrandCategoryAdmin(req.params.categoryId);
    if (!changes) return res.status(404).json({ success: false, error: "Category not found" });
    res.json({ success: true });
  });

  app.get("/api/admin/attributes", (req, res) => {
    res.json({ attributes: listAttributesAdmin() });
  });

  app.post("/api/admin/attributes", (req, res) => {
    try {
      const attribute = createAttributeAdmin(req.body || {});
      res.status(201).json({ success: true, attribute });
    } catch (error) {
      res.status(400).json({ success: false, error: error?.message || "Attribute create failed" });
    }
  });

  app.patch("/api/admin/attributes/:attributeId", (req, res) => {
    const changes = updateAttributeAdmin(req.params.attributeId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Attribute not found or unchanged" });
    res.json({ success: true, changes });
  });

  app.delete("/api/admin/attributes/:attributeId", (req, res) => {
    const changes = deleteAttributeAdmin(req.params.attributeId);
    if (!changes) return res.status(404).json({ success: false, error: "Attribute not found" });
    res.json({ success: true });
  });

  app.get("/api/admin/category-attribute-templates", (req, res) => {
    const categoryName = String(req.query.categoryName || "").trim();
    res.json({ templates: listCategoryAttributeTemplates(categoryName) });
  });

  app.post("/api/admin/category-attribute-templates", (req, res) => {
    try {
      const template = createCategoryAttributeTemplate(req.body || {});
      res.status(201).json({ success: true, template });
    } catch (error) {
      res.status(400).json({ success: false, error: error?.message || "Template create failed" });
    }
  });

  app.patch("/api/admin/category-attribute-templates/:templateId", (req, res) => {
    const changes = updateCategoryAttributeTemplate(req.params.templateId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Template not found or unchanged" });
    res.json({ success: true, changes });
  });

  app.delete("/api/admin/category-attribute-templates/:templateId", (req, res) => {
    const changes = deleteCategoryAttributeTemplate(req.params.templateId);
    if (!changes) return res.status(404).json({ success: false, error: "Template not found" });
    res.json({ success: true });
  });

  app.get("/api/admin/products", (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 50)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const q = String(req.query.q || "").trim();

    const result = listAdminProductsAdvanced({
      ...req.query,
      limit,
      offset,
      q
    });

    return res.json({
      ...result,
      rows: result.products,
      total: result.pagination.total
    });
  });

  app.get("/api/admin/products/:id", (req, res) => {
    const row = getAdminProductDetails(req.params.id);
    if (!row) return res.status(404).json({ error: "Product not found" });
    if (!row.group && row.groupName) row.group = row.groupName;
    res.json(row);
  });

  app.post("/api/admin/products", (req, res) => {
    try {
      const created = createAdminProduct(req.body || {});
      return res.status(201).json({ success: true, product: created });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      return res.status(status).json({ success: false, error: error?.message || "Create failed" });
    }
  });

  app.patch("/api/admin/products/:id", (req, res) => {
    try {
      const changes = updateAdminProduct(req.params.id, req.body || {});
      if (!changes) return res.status(404).json({ error: "Product not found or unchanged" });
      return res.json({ ok: true, changes });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      return res.status(status).json({ error: error?.message || "Update failed" });
    }
  });

  app.put("/api/admin/products/:id", (req, res) => {
    try {
      const ok = upsertAdminProduct(req.params.id, req.body || {});
      if (!ok) return res.status(404).json({ success: false, error: "Product not found or unchanged" });
      return res.json({ success: true });
    } catch (error) {
      const status = Number(error?.statusCode || 500);
      return res.status(status).json({ success: false, error: error?.message || "Save failed" });
    }
  });

  app.post("/api/admin/products/bulk", (req, res) => {
    const { action, productIds, data } = req.body || {};
    const result = applyBulkAdminProducts({ action, productIds, data });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message || "Operation failed" });
    }
    return res.json(result);
  });

  app.get("/api/admin/products/:id/variants", (req, res) => {
    const variants = listProductVariantsAdmin(req.params.id);
    res.json({ variants });
  });

  app.post("/api/admin/products/:id/variants", (req, res) => {
    const payload = req.body || {};
    if (!payload.sku) return res.status(400).json({ success: false, error: "SKU is required" });
    const variant = createProductVariantAdmin(req.params.id, payload);
    return res.status(201).json({ success: true, variant });
  });

  app.patch("/api/admin/variants/:variantId", (req, res) => {
    const changes = updateProductVariantAdmin(req.params.variantId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Variant not found or unchanged" });
    return res.json({ success: true, changes });
  });

  app.delete("/api/admin/variants/:variantId", (req, res) => {
    const changes = deleteProductVariantAdmin(req.params.variantId);
    if (!changes) return res.status(404).json({ success: false, error: "Variant not found" });
    return res.json({ success: true });
  });

  app.get("/api/admin/products/:id/media", (req, res) => {
    const media = listProductMediaAdmin(req.params.id);
    res.json({ media });
  });

  app.put("/api/admin/products/:id/media", (req, res) => {
    const media = Array.isArray(req.body?.media) ? req.body.media : [];
    const saved = saveProductMediaAdmin(req.params.id, media);
    res.json({ success: true, media: saved });
  });

  app.get("/api/admin/products/:id/documents", (req, res) => {
    const documents = listProductDocumentsAdmin(req.params.id);
    res.json({ documents });
  });

  app.put("/api/admin/products/:id/documents", (req, res) => {
    const documents = Array.isArray(req.body?.documents) ? req.body.documents : [];
    const saved = saveProductDocumentsAdmin(req.params.id, documents);
    res.json({ success: true, documents: saved });
  });

  app.get("/api/admin/products/:id/tabs", (req, res) => {
    const variantId = req.query.variantId ?? null;
    const tabs = listProductTabsAdmin(req.params.id, variantId);
    res.json({ tabs });
  });

  app.post("/api/admin/products/:id/tabs", (req, res) => {
    const payload = req.body || {};
    const created = createProductTabAdmin(req.params.id, payload);
    res.status(201).json({ success: true, tab: created });
  });

  app.patch("/api/admin/tabs/:tabId", (req, res) => {
    const changes = updateProductTabAdmin(req.params.tabId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Tab not found or unchanged" });
    return res.json({ success: true, changes });
  });

  app.delete("/api/admin/tabs/:tabId", (req, res) => {
    const changes = deleteProductTabAdmin(req.params.tabId);
    if (!changes) return res.status(404).json({ success: false, error: "Tab not found" });
    return res.json({ success: true });
  });

  app.put("/api/admin/tabs/:tabId/blocks", (req, res) => {
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const saved = saveTabBlocksAdmin(req.params.tabId, blocks);
    res.json({ success: true, blocks: saved });
  });

  app.get("/api/admin/orders", (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    res.json(listAdminOrders({
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
    }));
  });

  app.get("/api/admin/orders/:orderId", (req, res) => {
    const order = getAdminOrderById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, order });
  });

  app.patch("/api/admin/orders/:orderId", (req, res) => {
    const changes = updateAdminOrder(req.params.orderId, req.body || {});
    if (!changes) return res.status(404).json({ success: false, error: "Order not found or unchanged" });
    res.json({ success: true, changes });
  });

  app.get("/api/admin/audit-log", (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const entityType = String(req.query.entityType || "").trim();
    const action = String(req.query.action || "").trim();
    res.json(listAdminAuditLog({ limit, offset, entityType, action }));
  });
}

module.exports = { registerAdminRoutes };
