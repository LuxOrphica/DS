const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const projectRoot = path.join(__dirname, "..");
const dbPath = path.join(projectRoot, "data", "shop.db");

const KNOWN_WARNING_BUDGETS = {
  missingLocalImages: 0,
  missingGalleryLocalImages: 0,
  suspectedMojibakeRows: 0,
  missingSourceUrls: 0,
  contentHardArtifacts: 0
};

function openDb() {
  assert.equal(fs.existsSync(dbPath), true, "data/shop.db must exist for catalog integrity tests");
  return new Database(dbPath, { readonly: true, timeout: 10_000 });
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function isActiveStorefrontProduct(row) {
  const status = text(row.status || "active").toLowerCase();
  const entityType = text(row.entity_type || "product").toLowerCase();
  return (status === "" || status === "active") &&
    entityType !== "service" &&
    entityType !== "merch" &&
    Number(row.is_extra || 0) !== 1;
}

function parseJsonField(row, field) {
  const raw = text(row[field]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { __parseError: String(error && error.message ? error.message : error) };
  }
}

function hasHardEncodingMarker(value) {
  return /(?:\uFFFD|cid:\d+|\(cid:\d+\))/i.test(String(value || ""));
}

function hasSuspectedMojibake(value) {
  const source = String(value || "");
  return /(?:\u0420.|\u0421.){3,}|\u00c3.|\u00d0.|\u00d1.|\ufffd/u.test(source);
}

function isCatalogReference(value) {
  const ref = text(value);
  return /^https?:\/\//i.test(ref) || ref.startsWith("/");
}

function localPublicPath(value) {
  const ref = text(value);
  if (!ref.startsWith("/")) return "";
  return ref.split("#")[0].split("?")[0].replace(/^\/+/, "");
}

function getProducts(db) {
  return db
    .prepare(`
      SELECT
        id, article, name, brand, category, group_name, image, source_url,
        description, specs, status, entity_type, is_extra,
        price, price_currency, price_rub,
        attributes_json, documents_json, gallery_json
      FROM products
      ORDER BY id
    `)
    .all();
}

test("catalog database has products and unique ids", () => {
  const db = openDb();
  try {
    const rows = getProducts(db);
    assert.ok(rows.length > 0, "catalog should contain products");

    const counts = new Map();
    for (const row of rows) {
      const id = text(row.id);
      assert.ok(id, `product id is empty for article=${text(row.article)}`);
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    const duplicates = Array.from(counts.entries()).filter(([, count]) => count > 1);
    assert.deepEqual(duplicates, [], `duplicate product ids: ${JSON.stringify(duplicates.slice(0, 20))}`);
  } finally {
    db.close();
  }
});

test("active storefront products have required merchandising fields", () => {
  const db = openDb();
  try {
    const rows = getProducts(db).filter(isActiveStorefrontProduct);
    const missing = [];

    for (const row of rows) {
      for (const field of ["id", "name", "brand", "category"]) {
        if (!text(row[field])) {
          missing.push({ id: text(row.id), field });
        }
      }
    }

    assert.deepEqual(missing, [], `missing required fields: ${JSON.stringify(missing.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("active storefront products use known storefront categories", () => {
  const db = openDb();
  try {
    const allowedCategories = new Set([
      "Управление и автоматизация",
      "Монтаж и расходники",
      "Освещение",
      "Безопасность и доступ",
      "Климат",
      "Аудио и мультимедиа",
      "Энергия и учет",
      "Комплекты"
    ]);
    const rows = getProducts(db).filter(isActiveStorefrontProduct);
    const unknown = rows
      .filter((row) => !allowedCategories.has(text(row.category)))
      .map((row) => ({ id: text(row.id), category: text(row.category) }));

    assert.deepEqual(unknown, [], `unknown storefront categories: ${JSON.stringify(unknown.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("catalog json fields are valid JSON when present", () => {
  const db = openDb();
  try {
    const rows = getProducts(db);
    const invalid = [];

    for (const row of rows) {
      for (const field of ["attributes_json", "documents_json", "gallery_json"]) {
        const parsed = parseJsonField(row, field);
        if (parsed && parsed.__parseError) {
          invalid.push({ id: text(row.id), field, error: parsed.__parseError });
        }
      }
    }

    assert.deepEqual(invalid, [], `invalid JSON fields: ${JSON.stringify(invalid.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("active storefront source links are valid catalog references", () => {
  const db = openDb();
  try {
    const bad = [];

    for (const row of getProducts(db).filter(isActiveStorefrontProduct)) {
      const sourceUrl = text(row.source_url);
      if (!isCatalogReference(sourceUrl) || /\s/.test(sourceUrl) || hasHardEncodingMarker(sourceUrl)) {
        bad.push({ id: text(row.id), source_url: sourceUrl });
      }

      const localPath = localPublicPath(sourceUrl);
      if (localPath && !fs.existsSync(path.join(projectRoot, "public", localPath))) {
        bad.push({ id: text(row.id), source_url: sourceUrl, reason: "missing local source file" });
      }
    }

    assert.deepEqual(bad, [], `bad source references: ${JSON.stringify(bad.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("active storefront brands keep source coverage", () => {
  const db = openDb();
  try {
    const byBrand = new Map();

    for (const row of getProducts(db).filter(isActiveStorefrontProduct)) {
      const brand = text(row.brand);
      if (!byBrand.has(brand)) byBrand.set(brand, { total: 0, sourced: 0 });
      const item = byBrand.get(brand);
      item.total += 1;
      if (text(row.source_url)) item.sourced += 1;
    }

    const missing = Array.from(byBrand.entries())
      .filter(([, item]) => item.total > 0 && item.sourced !== item.total)
      .map(([brand, item]) => ({ brand, total: item.total, sourced: item.sourced }));

    assert.deepEqual(missing, [], `brand source coverage gaps: ${JSON.stringify(missing)}`);
  } finally {
    db.close();
  }
});

test("catalog gallery entries are usable references", () => {
  const db = openDb();
  try {
    const bad = [];

    for (const row of getProducts(db).filter(isActiveStorefrontProduct)) {
      const gallery = parseJsonField(row, "gallery_json");
      if (gallery == null) continue;
      if (!Array.isArray(gallery)) {
        bad.push({ id: text(row.id), reason: "gallery_json is not an array" });
        continue;
      }

      const seen = new Set();
      for (const image of gallery) {
        const imagePath = text(image);
        if (!isCatalogReference(imagePath) || hasHardEncodingMarker(imagePath)) {
          bad.push({ id: text(row.id), image: imagePath, reason: "bad gallery reference" });
        }
        if (seen.has(imagePath)) {
          bad.push({ id: text(row.id), image: imagePath, reason: "duplicate gallery reference" });
        }
        seen.add(imagePath);
      }
    }

    assert.deepEqual(bad, [], `bad gallery entries: ${JSON.stringify(bad.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("catalog documents have titles and reachable references", () => {
  const db = openDb();
  try {
    const bad = [];

    for (const row of getProducts(db).filter(isActiveStorefrontProduct)) {
      const docs = parseJsonField(row, "documents_json");
      if (docs == null) continue;
      if (!Array.isArray(docs)) {
        bad.push({ id: text(row.id), reason: "documents_json is not an array" });
        continue;
      }

      const seen = new Set();
      for (const doc of docs) {
        const title = text(doc && doc.title);
        const url = text(doc && doc.url);
        if (!title || hasHardEncodingMarker(title)) {
          bad.push({ id: text(row.id), url, reason: "bad document title" });
        }
        if (!isCatalogReference(url) || hasHardEncodingMarker(url)) {
          bad.push({ id: text(row.id), url, reason: "bad document url" });
        }
        const localPath = localPublicPath(url);
        if (localPath && !fs.existsSync(path.join(projectRoot, "public", localPath))) {
          bad.push({ id: text(row.id), url, reason: "missing local document file" });
        }
        if (seen.has(url)) {
          bad.push({ id: text(row.id), url, reason: "duplicate document url" });
        }
        seen.add(url);
      }
    }

    assert.deepEqual(bad, [], `bad document entries: ${JSON.stringify(bad.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("active storefront product prices and currencies are sane", () => {
  const db = openDb();
  try {
    const rows = getProducts(db).filter(isActiveStorefrontProduct);
    const bad = [];

    for (const row of rows) {
      const price = Number(row.price);
      const priceRub = Number(row.price_rub);
      const currency = text(row.price_currency || "RUB").toUpperCase() || "RUB";
      if (!Number.isFinite(price) || price < 0) bad.push({ id: text(row.id), field: "price", value: row.price });
      if (!Number.isFinite(priceRub) || priceRub < 0) bad.push({ id: text(row.id), field: "price_rub", value: row.price_rub });
      if (!["RUB", "EUR"].includes(currency)) bad.push({ id: text(row.id), field: "price_currency", value: currency });
    }

    assert.deepEqual(bad, [], `bad prices/currencies: ${JSON.stringify(bad.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("catalog has no hard encoding artifacts in storefront identity fields", () => {
  const db = openDb();
  try {
    const fields = ["name", "brand", "category", "group_name"];
    const bad = [];

    for (const row of getProducts(db)) {
      for (const field of fields) {
        if (hasHardEncodingMarker(row[field])) {
          bad.push({ id: text(row.id), field });
        }
      }
    }

    assert.deepEqual(bad, [], `hard encoding artifacts in identity fields: ${JSON.stringify(bad.slice(0, 30))}`);
  } finally {
    db.close();
  }
});

test("known catalog quality warning budgets do not grow", () => {
  const db = openDb();
  try {
    const rows = getProducts(db);
    const activeProducts = rows.filter(isActiveStorefrontProduct);

    const missingLocalImages = activeProducts.filter((row) => {
      const image = text(row.image);
      if (!image.startsWith("/")) return false;
      return !fs.existsSync(path.join(projectRoot, "public", image.replace(/^\/+/, "")));
    });

    const suspectedMojibakeRows = rows.filter((row) =>
      ["name", "category", "group_name", "description", "specs"].some((field) => hasSuspectedMojibake(row[field]))
    );

    const missingSourceUrls = activeProducts.filter((row) => !text(row.source_url));

    const missingGalleryLocalImages = [];
    for (const row of rows) {
      const gallery = parseJsonField(row, "gallery_json");
      if (!Array.isArray(gallery)) continue;
      for (const image of gallery) {
        const imagePath = text(image);
        if (!imagePath.startsWith("/")) continue;
        if (!fs.existsSync(path.join(projectRoot, "public", imagePath.replace(/^\/+/, "")))) {
          missingGalleryLocalImages.push({ id: text(row.id), image: imagePath });
        }
      }
    }

    const contentHardArtifacts = [];
    for (const row of rows) {
      for (const field of ["description", "specs"]) {
        if (hasHardEncodingMarker(row[field])) {
          contentHardArtifacts.push({ id: text(row.id), field });
        }
      }
    }

    assert.ok(
      missingLocalImages.length <= KNOWN_WARNING_BUDGETS.missingLocalImages,
      `missing local images grew: ${missingLocalImages.length} > ${KNOWN_WARNING_BUDGETS.missingLocalImages}`
    );
    assert.ok(
      missingGalleryLocalImages.length <= KNOWN_WARNING_BUDGETS.missingGalleryLocalImages,
      `missing gallery local images grew: ${missingGalleryLocalImages.length} > ${KNOWN_WARNING_BUDGETS.missingGalleryLocalImages}`
    );
    assert.ok(
      suspectedMojibakeRows.length <= KNOWN_WARNING_BUDGETS.suspectedMojibakeRows,
      `suspected mojibake rows grew: ${suspectedMojibakeRows.length} > ${KNOWN_WARNING_BUDGETS.suspectedMojibakeRows}`
    );
    assert.ok(
      missingSourceUrls.length <= KNOWN_WARNING_BUDGETS.missingSourceUrls,
      `missing source_url rows grew: ${missingSourceUrls.length} > ${KNOWN_WARNING_BUDGETS.missingSourceUrls}`
    );
    assert.ok(
      contentHardArtifacts.length <= KNOWN_WARNING_BUDGETS.contentHardArtifacts,
      `description/spec hard artifacts grew: ${contentHardArtifacts.length} > ${KNOWN_WARNING_BUDGETS.contentHardArtifacts}`
    );
  } finally {
    db.close();
  }
});
