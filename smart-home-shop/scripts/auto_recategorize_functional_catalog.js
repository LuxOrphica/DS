const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "shop.db");
const REPORT_PATH = path.join(__dirname, "..", "reports", "functional-recategorize.report.json");

const ROOT_AUTOMATION = "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0438 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f";
const SUBGROUP_ANTENNAS = "\u0410\u043d\u0442\u0435\u043d\u043d\u044b";
const BRAND_WB = "wiren board";
const BRAND_HITE = "hite pro";

function toNorm(v) {
  return String(v || "").trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function getRootDistribution(db, rootName) {
  const rows = db
    .prepare(
      `
      SELECT
        COALESCE(NULLIF(TRIM(commercial_subgroup), ''), NULLIF(TRIM(group_name), ''), '(empty)') AS subgroup,
        COUNT(*) AS count
      FROM products
      WHERE TRIM(COALESCE(commercial_group, category, '')) = @rootName
      GROUP BY subgroup
      ORDER BY count DESC, subgroup COLLATE NOCASE ASC
    `
    )
    .all({ rootName });
  return rows.map((r) => ({ subgroup: String(r.subgroup), count: Number(r.count || 0) }));
}

function isWbAntennaCandidate(row) {
  const brand = toNorm(row.brand);
  if (brand !== BRAND_WB) return false;

  const article = toNorm(row.article);
  const name = toNorm(row.name);
  const subgroup = toNorm(row.commercial_subgroup || row.group_name);

  if (subgroup === toNorm(SUBGROUP_ANTENNAS)) return false;
  if (article.includes("wbe2r-r-gps")) return false;
  if (article.startsWith("wbe") || subgroup.includes("\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u043b\u0435\u0440")) return false;
  if (name.includes("\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u043b\u0435\u0440")) return false;

  const directAntenna =
    article.includes("antenna") ||
    name.includes("\u0430\u043d\u0442\u0435\u043d\u043d") ||
    article.includes("gps-glonass");

  const wbAccessoryRadio =
    (article.includes("gsm") || article.includes("wifi") || article.includes("wi-fi") || article.includes("gps")) &&
    (name.includes("gsm") || name.includes("gps") || name.includes("wi-fi") || name.includes("bluetooth"));

  return directAntenna || wbAccessoryRadio;
}

function isHiteAntennaCandidate(row) {
  const brand = toNorm(row.brand);
  if (brand !== BRAND_HITE) return false;

  const article = toNorm(row.article);
  const name = toNorm(row.name);
  const subgroup = toNorm(row.commercial_subgroup || row.group_name);

  if (subgroup === toNorm(SUBGROUP_ANTENNAS)) return false;

  return (
    name.includes("\u0430\u043d\u0442\u0435\u043d\u043d") ||
    name.includes("wifi-\u0430\u043d\u0442\u0435\u043d") ||
    name.includes("3g/4g") ||
    article.includes("ant")
  );
}

function collectCandidates(db) {
  const rows = db
    .prepare(
      `
      SELECT
        id, article, name, brand, category, group_name, commercial_group, commercial_subgroup,
        COALESCE(updated_at, '') AS updated_at
      FROM products
      WHERE TRIM(COALESCE(brand, '')) <> ''
    `
    )
    .all();

  const candidates = [];
  for (const row of rows) {
    if (!isWbAntennaCandidate(row) && !isHiteAntennaCandidate(row)) continue;
    candidates.push({
      id: row.id,
      article: row.article || "",
      name: row.name || "",
      brand: row.brand || "",
      fromGroup: row.commercial_group || row.category || "",
      fromSubgroup: row.commercial_subgroup || row.group_name || "",
      toGroup: ROOT_AUTOMATION,
      toSubgroup: SUBGROUP_ANTENNAS
    });
  }
  return candidates;
}

function ensureRootInProductFunctionCategories(db, productId, rootName, ts) {
  db.prepare(
    `
    INSERT OR IGNORE INTO product_function_categories
    (product_id, category_name, is_primary, sort_order, created_at, updated_at)
    VALUES (@productId, @rootName, 1, 0, @ts, @ts)
  `
  ).run({ productId, rootName, ts });

  db.prepare(
    `
    UPDATE product_function_categories
    SET is_primary = CASE WHEN category_name = @rootName THEN 1 ELSE 0 END,
        updated_at = @ts
    WHERE product_id = @productId
  `
  ).run({ productId, rootName, ts });
}

function applyChanges(db, candidates) {
  const ts = nowIso();
  const updateStmt = db.prepare(
    `
    UPDATE products
    SET
      category = @toGroup,
      commercial_group = @toGroup,
      group_name = @toSubgroup,
      commercial_subgroup = @toSubgroup,
      updated_at = @ts
    WHERE id = @id
  `
  );

  const tx = db.transaction((list) => {
    let changed = 0;
    for (const item of list) {
      const info = updateStmt.run({
        id: item.id,
        toGroup: item.toGroup,
        toSubgroup: item.toSubgroup,
        ts
      });
      if (Number(info.changes || 0) > 0) {
        changed += 1;
        ensureRootInProductFunctionCategories(db, item.id, item.toGroup, ts);
      }
    }
    return changed;
  });

  return tx(candidates);
}

function main() {
  const applyMode = process.argv.includes("--apply");
  const db = new Database(DB_PATH);

  try {
    const before = getRootDistribution(db, ROOT_AUTOMATION);
    const candidates = collectCandidates(db);
    const willChange = candidates.length;
    let changed = 0;

    if (applyMode && willChange > 0) {
      changed = applyChanges(db, candidates);
    }

    const after = getRootDistribution(db, ROOT_AUTOMATION);
    const report = {
      mode: applyMode ? "apply" : "dry-run",
      dbPath: DB_PATH,
      generatedAt: nowIso(),
      summary: {
        candidates: willChange,
        changed
      },
      rules: [
        {
          code: "wb_antennas",
          description:
            "Wiren Board products with GSM/GPS/Wi-Fi/Bluetooth antenna markers are moved to subgroup '\u0410\u043d\u0442\u0435\u043d\u043d\u044b'."
        },
        {
          code: "hite_antennas",
          description:
            "Hite Pro products with antenna markers (\u0430\u043d\u0442\u0435\u043d\u043d\u0430, 3G/4G, WiFi-antenna) are moved to subgroup '\u0410\u043d\u0442\u0435\u043d\u043d\u044b'."
        }
      ],
      changesPreview: candidates.slice(0, 200),
      subgroupDistributionBefore: before,
      subgroupDistributionAfter: after
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

    console.log(`[functional-recategorize] mode=${report.mode}`);
    console.log(`[functional-recategorize] candidates=${willChange} changed=${changed}`);
    console.log(`[functional-recategorize] report=${REPORT_PATH}`);
  } finally {
    db.close();
  }
}

main();
