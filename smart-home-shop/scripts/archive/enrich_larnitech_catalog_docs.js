const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const CATALOG_SRC = path.join(ROOT, "larnitech_catalogue_04_23_web.pdf");
const PUBLIC_DOCS_DIR = path.join(ROOT, "public", "docs");
const CATALOG_PUBLIC_NAME = "larnitech_catalogue_04_23_web.pdf";
const CATALOG_PUBLIC_PATH = path.join(PUBLIC_DOCS_DIR, CATALOG_PUBLIC_NAME);
const CATALOG_PUBLIC_URL = `/docs/${CATALOG_PUBLIC_NAME}`;
const SPECS_JSON_PATH = path.join(ROOT, "data", "larnitech_detailed_specs.json");

function readPageMap() {
  if (!fs.existsSync(SPECS_JSON_PATH)) return new Map();
  const raw = fs.readFileSync(SPECS_JSON_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return new Map();
  }
  const map = new Map();
  if (!parsed || typeof parsed !== "object") return map;
  for (const [key, rec] of Object.entries(parsed)) {
    if (!rec || typeof rec !== "object") continue;
    const text = String(rec.text || "");
    const article = String(rec.article || key || "").trim();
    if (!article || !text) continue;
    const m = text.match(/^\s*(?:go to contents\s*)?(\d{1,3})\s*\n/i);
    if (!m) continue;
    const page = Number(m[1]);
    if (!Number.isFinite(page) || page <= 0 || page > 999) continue;
    const head = text.slice(0, 220);
    if (!head.includes(article)) continue;
    map.set(String(key), page);
    if (article) map.set(article, page);
  }
  return map;
}

function buildDocs(id, pageMap) {
  const page = pageMap.get(id);
  const title = page
    ? `Каталог Larnitech 2023, стр. ${page}`
    : "Каталог Larnitech 2023 (PDF)";
  const url = page ? `${CATALOG_PUBLIC_URL}#page=${page}` : CATALOG_PUBLIC_URL;
  return [
    {
      title,
      url,
      meta: "Официальный каталог оборудования Larnitech"
    }
  ];
}

function ensureCatalogInPublic() {
  if (!fs.existsSync(CATALOG_SRC)) {
    throw new Error(`catalog_not_found: ${CATALOG_SRC}`);
  }
  fs.mkdirSync(PUBLIC_DOCS_DIR, { recursive: true });
  fs.copyFileSync(CATALOG_SRC, CATALOG_PUBLIC_PATH);
}

function run() {
  ensureCatalogInPublic();
  const pageMap = readPageMap();
  const db = new Database(DB_PATH);
  const rows = db
    .prepare("SELECT id, documents_json FROM products WHERE brand = 'Larnitech'")
    .all();
  const update = db.prepare(
    "UPDATE products SET documents_json = @documentsJson, updated_at = @updatedAt WHERE id = @id"
  );
  const now = new Date().toISOString();
  const tx = db.transaction((items) => {
    let changed = 0;
    for (const row of items) {
      const docs = buildDocs(String(row.id || ""), pageMap);
      const next = JSON.stringify(docs);
      if (String(row.documents_json || "") === next) continue;
      update.run({ id: row.id, documentsJson: next, updatedAt: now });
      changed += 1;
    }
    return changed;
  });
  const changed = tx(rows);
  console.log(
    JSON.stringify(
      {
        ok: true,
        totalLarnitech: rows.length,
        updatedProducts: changed,
        catalogPublicUrl: CATALOG_PUBLIC_URL
      },
      null,
      2
    )
  );
  db.close();
}

run();
