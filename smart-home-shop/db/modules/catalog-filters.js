function createCatalogFiltersModule({
  db,
  listProducts,
  isServiceLikeRow,
  normalizeBrand,
  normalizeCategory,
  normalizeText,
  sanitizeProductRow,
  getFunctionalCategoriesByProductIds,
  hasActiveVariantConflict
}) {
  function listAdminFilters() {
    const rows = listProducts().filter((row) => !isServiceLikeRow(row));
    const brandMap = new Map();
    const categoryMap = new Map();
    const groupMap = new Map();
    const categoryGroupMap = new Map();
    const categoryRows = db.prepare(`
      SELECT pfc.product_id AS productId, pfc.category_name AS categoryName
      FROM product_function_categories pfc
      JOIN products p ON p.id = pfc.product_id
      WHERE LOWER(TRIM(COALESCE(p.category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')
        AND COALESCE(NULLIF(TRIM(p.status), ''), 'active') = 'active'
        AND COALESCE(p.is_extra, 0) <> 1
        AND COALESCE(p.is_active_normalized, 1) <> 0
        AND LOWER(TRIM(COALESCE(p.category, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')
        AND LOWER(TRIM(COALESCE(p.commercial_group, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')
        AND LOWER(TRIM(COALESCE(p.entity_type, 'product'))) NOT IN ('service', 'merch')
        AND LOWER(TRIM(COALESCE(p.brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')
        AND LOWER(TRIM(COALESCE(p.id, ''))) <> LOWER('service-networks')
    `).all();

    for (const row of rows) {
      const brand = normalizeBrand(row.brand);
      const group = normalizeText(row.group || "");
      if (brand) brandMap.set(brand, (brandMap.get(brand) || 0) + 1);
      if (group) groupMap.set(group, (groupMap.get(group) || 0) + 1);
    }
    for (const row of categoryRows) {
      const category = normalizeCategory(row.categoryName);
      if (!category) continue;
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    }

    const categoryGroupRows = db.prepare(`
      SELECT
        pfc.category_name AS categoryName,
        p.group_name AS groupName,
        COUNT(DISTINCT p.id) AS cnt
      FROM product_function_categories pfc
      JOIN products p ON p.id = pfc.product_id
      WHERE LOWER(TRIM(COALESCE(p.category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')
        AND COALESCE(NULLIF(TRIM(p.status), ''), 'active') = 'active'
        AND COALESCE(p.is_extra, 0) <> 1
        AND COALESCE(p.is_active_normalized, 1) <> 0
        AND LOWER(TRIM(COALESCE(p.category, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')
        AND LOWER(TRIM(COALESCE(p.commercial_group, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')
        AND LOWER(TRIM(COALESCE(p.entity_type, 'product'))) NOT IN ('service', 'merch')
        AND LOWER(TRIM(COALESCE(p.brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')
        AND LOWER(TRIM(COALESCE(p.id, ''))) <> LOWER('service-networks')
        AND TRIM(COALESCE(p.group_name, '')) <> ''
      GROUP BY pfc.category_name, p.group_name
    `).all();

    for (const row of categoryGroupRows) {
      const category = normalizeCategory(row.categoryName);
      const group = normalizeText(row.groupName || "");
      const count = Number(row.cnt || 0);
      if (!category || !group) continue;
      const list = categoryGroupMap.get(category) || [];
      list.push({ group_name: group, count });
      categoryGroupMap.set(category, list);
    }

    const asSorted = (map, key) =>
      [...map.entries()]
        .map(([value, count]) => ({ [key]: value, count }))
        .sort((a, b) => (b.count - a.count) || String(a[key]).localeCompare(String(b[key]), "ru"));

    const categoryGroups = [...categoryGroupMap.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ru"))
      .map(([category, groups]) => ({
        category,
        groups: (groups || [])
          .slice()
          .sort((a, b) => (b.count - a.count) || String(a.group_name).localeCompare(String(b.group_name), "ru"))
      }));

    return {
      brands: asSorted(brandMap, "brand"),
      categories: asSorted(categoryMap, "category"),
      groups: asSorted(groupMap, "group_name"),
      categoryGroups
    };
  }

  function listAdminProductsAdvanced(filters = {}) {
    const limit = Math.min(500, Math.max(1, Number(filters.limit || 50)));
    const offset = Math.max(0, Number(filters.offset || 0));

    const where = [
      "LOWER(TRIM(COALESCE(p.category, ''))) <> LOWER('\u0421\u0453\u0421\u0403\u0420\u00bb\u0421\u0453\u0420\u0456\u0420\u0451')",
      "LOWER(TRIM(COALESCE(p.category, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')",
      "LOWER(TRIM(COALESCE(p.commercial_group, ''))) NOT IN ('\u0443\u0441\u043b\u0443\u0433\u0438', '\u043c\u0435\u0440\u0447')",
      "LOWER(TRIM(COALESCE(p.entity_type, 'product'))) NOT IN ('service', 'merch')",
      "LOWER(TRIM(COALESCE(p.brand, ''))) <> LOWER('\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451')",
      "LOWER(TRIM(COALESCE(p.id, ''))) <> LOWER('service-networks')"
    ];
    const params = { limit, offset };
    if (filters.q) {
      where.push("(p.name LIKE @q OR p.article LIKE @q OR p.id LIKE @q)");
      params.q = `%${String(filters.q).trim()}%`;
    }
    if (filters.brand) {
      where.push("LOWER(TRIM(p.brand)) = LOWER(TRIM(@brand))");
      params.brand = normalizeBrand(String(filters.brand).trim());
    }
    if (filters.category) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM product_function_categories pfc
          WHERE pfc.product_id = p.id
            AND LOWER(TRIM(pfc.category_name)) = LOWER(TRIM(@category))
        )
      `);
      params.category = normalizeCategory(String(filters.category).trim());
    }
    if (filters.brandCategoryId) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM product_brand_categories pbc
          WHERE pbc.product_id = p.id
            AND pbc.brand_category_id = @brandCategoryId
        )
      `);
      params.brandCategoryId = Number(filters.brandCategoryId);
    }
    if (filters.brandSubcategory) {
      where.push("LOWER(TRIM(COALESCE(p.brand_subcategory, ''))) = LOWER(TRIM(@brandSubcategory))");
      params.brandSubcategory = normalizeText(String(filters.brandSubcategory).trim());
    }
    if (filters.group) {
      where.push("LOWER(TRIM(p.group_name)) = LOWER(TRIM(@group))");
      params.group = normalizeText(String(filters.group).trim());
    }
    if (filters.status) {
      where.push("p.status = @status");
      params.status = String(filters.status).trim();
    }
    if (filters.protocol) {
      where.push("p.protocol LIKE @protocol");
      params.protocol = `%${String(filters.protocol).trim()}%`;
    }
    if (filters.systemType) {
      where.push("p.system_type = @systemType");
      params.systemType = String(filters.systemType).trim();
    }
    if (filters.mounting) {
      where.push("p.mounting LIKE @mounting");
      params.mounting = `%${String(filters.mounting).trim()}%`;
    }
    if (filters.hasDocs === "1") {
      where.push("((p.documents_json IS NOT NULL AND p.documents_json <> '[]') OR EXISTS (SELECT 1 FROM product_documents d WHERE d.product_id = p.id))");
    } else if (filters.hasDocs === "0") {
      where.push("((p.documents_json IS NULL OR p.documents_json = '[]') AND NOT EXISTS (SELECT 1 FROM product_documents d WHERE d.product_id = p.id))");
    }
    if (filters.hasVariants === "1") {
      where.push("EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)");
    } else if (filters.hasVariants === "0") {
      where.push("NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)");
    }
    if (filters.hasPhotos === "1") {
      where.push(`
        (
          TRIM(COALESCE(p.image, '')) <> ''
          OR (p.gallery_json IS NOT NULL AND p.gallery_json <> '[]')
          OR EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
        )
      `);
    } else if (filters.hasPhotos === "0") {
      where.push(`
        (
          TRIM(COALESCE(p.image, '')) = ''
          AND (p.gallery_json IS NULL OR p.gallery_json = '[]')
          AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
        )
      `);
    }
    if (filters.is_extra === "1" || filters.is_extra === "0") {
      where.push("COALESCE(p.is_extra, 0) = @isExtra");
      params.isExtra = Number(filters.is_extra);
    }
    if (filters.minPrice !== undefined && filters.minPrice !== "") {
      where.push("COALESCE(p.price_rub, p.price, 0) >= @minPrice");
      params.minPrice = Number(filters.minPrice);
    }
    if (filters.maxPrice !== undefined && filters.maxPrice !== "") {
      where.push("COALESCE(p.price_rub, p.price, 0) <= @maxPrice");
      params.maxPrice = Number(filters.maxPrice);
    }
    if (filters.updatedFrom) {
      where.push("p.updated_at >= @updatedFrom");
      params.updatedFrom = String(filters.updatedFrom);
    }
    if (filters.updatedTo) {
      where.push("p.updated_at <= @updatedTo");
      params.updatedTo = String(filters.updatedTo);
    }
    if (filters.hasConflict === "1") {
      where.push("COALESCE(p.is_conflict, 0) = 1");
    } else if (filters.hasConflict === "0") {
      where.push("COALESCE(p.is_conflict, 0) = 0");
    }
    if (filters.variantConflict === "1") {
      where.push(`
        LOWER(TRIM(COALESCE(p.status, ''))) = 'active'
        AND EXISTS (
          SELECT 1
          FROM product_variants v
          WHERE v.product_id = p.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM product_variants v
          WHERE v.product_id = p.id
            AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
        )
      `);
    } else if (filters.variantConflict === "0") {
      where.push(`
        NOT (
          LOWER(TRIM(COALESCE(p.status, ''))) = 'active'
          AND EXISTS (
            SELECT 1
            FROM product_variants v
            WHERE v.product_id = p.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM product_variants v
            WHERE v.product_id = p.id
              AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
          )
        )
      `);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const baseSql = `
      FROM products p
      ${whereSql}
    `;

    const total = db.prepare(`SELECT COUNT(*) AS c ${baseSql}`).get(params).c;
    const products = db
      .prepare(`
        SELECT
          p.id,
          p.article,
          p.name,
          p.brand,
          p.category,
          p.group_name AS "group",
          p.status,
          p.price,
          p.image,
          p.updated_at AS updatedAt,
          COALESCE(p.is_extra, 0) AS is_extra,
          COALESCE(p.is_brand_featured, 0) AS isBrandFeatured,
          COALESCE(p.is_conflict, 0) AS isConflict,
          COALESCE(p.conflict_note, '') AS conflictNote,
          (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
          (
            SELECT COUNT(*)
            FROM product_variants v
            WHERE v.product_id = p.id
              AND LOWER(TRIM(COALESCE(v.status, ''))) = 'active'
          ) AS activeVariants,
          (
            (SELECT COUNT(*) FROM product_documents d WHERE d.product_id = p.id)
            + CASE WHEN p.documents_json IS NOT NULL AND p.documents_json <> '[]' THEN 1 ELSE 0 END
          ) AS documentsCount
        ${baseSql}
        ORDER BY p.updated_at DESC, p.name COLLATE NOCASE ASC
        LIMIT @limit OFFSET @offset
      `)
      .all(params)
      .map(sanitizeProductRow)
      .filter((row) => !isServiceLikeRow(row));

    const fmap = getFunctionalCategoriesByProductIds(products.map((r) => r.id));
    const mapped = products.map((row) => {
      const fc = fmap.get(String(row.id)) || [];
      const primary = (fc.find((x) => x.isPrimary)?.category) || row.category || "";
      const variants = Number(row.variants || 0);
      const activeVariants = Number(row.activeVariants || 0);
      return {
        ...row,
        variants,
        activeVariants,
        hasVariantConflict: hasActiveVariantConflict(row.status, variants, activeVariants),
        category: primary || "",
        primaryFunctionalCategory: primary || "",
        functionalCategories: fc.map((x) => x.category)
      };
    });

    return {
      products: mapped,
      pagination: {
        offset,
        limit,
        total,
        hasMore: offset + limit < total
      }
    };
  }

  return {
    listAdminFilters,
    listAdminProductsAdvanced
  };
}

module.exports = { createCatalogFiltersModule };
