const fs = require("fs");
const path = require("path");
const {
  listBrandsAdmin,
  createBrandAdmin,
  listBrandCategoriesAdmin,
  createBrandCategoryAdmin
} = require("../db/database");

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("ru");
}

function loadNativeMap(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const map = new Map();
  if (!raw || typeof raw !== "object") return map;
  for (const [brandRaw, listRaw] of Object.entries(raw)) {
    const brand = String(brandRaw || "").trim();
    if (!brand) continue;
    const list = Array.isArray(listRaw) ? listRaw : [];
    const unique = Array.from(
      new Set(
        list
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      )
    );
    if (unique.length) map.set(brand, unique);
  }
  return map;
}

function main() {
  const sourcePath = path.join(__dirname, "..", "data", "brand-native-categories.json");
  if (!fs.existsSync(sourcePath)) {
    console.error(`[sync] source file not found: ${sourcePath}`);
    process.exit(1);
  }

  const nativeMap = loadNativeMap(sourcePath);
  const brands = listBrandsAdmin();
  const brandsByNormName = new Map(
    brands.map((b) => [normalizeText(b.name), { id: Number(b.id), name: String(b.name || "").trim() }])
  );

  let brandsCreated = 0;
  let categoriesCreated = 0;
  let categoriesSkipped = 0;

  for (const [brandName, categories] of nativeMap.entries()) {
    const normBrand = normalizeText(brandName);
    let brand = brandsByNormName.get(normBrand);
    if (!brand) {
      const created = createBrandAdmin({ name: brandName, status: "active" });
      brand = { id: Number(created.id), name: String(created.name || brandName).trim() };
      brandsByNormName.set(normBrand, brand);
      brandsCreated += 1;
      console.log(`[sync] brand created: ${brand.name} (#${brand.id})`);
    }

    const existing = listBrandCategoriesAdmin(brand.id);
    const existingNames = new Set(existing.map((c) => normalizeText(c.name)));
    let sortOrder = existing.length ? Math.max(...existing.map((c) => Number(c.sortOrder || 0))) + 10 : 10;

    for (const categoryName of categories) {
      const normCategory = normalizeText(categoryName);
      if (!normCategory || existingNames.has(normCategory)) {
        categoriesSkipped += 1;
        continue;
      }
      createBrandCategoryAdmin({
        brandId: brand.id,
        parentId: null,
        name: categoryName,
        slug: "",
        status: "active",
        sortOrder
      });
      sortOrder += 10;
      existingNames.add(normCategory);
      categoriesCreated += 1;
      console.log(`[sync] category created: ${brand.name} -> ${categoryName}`);
    }
  }

  console.log("");
  console.log("[sync] done");
  console.log(`[sync] brands created: ${brandsCreated}`);
  console.log(`[sync] categories created: ${categoriesCreated}`);
  console.log(`[sync] categories skipped (already existed): ${categoriesSkipped}`);
}

main();
