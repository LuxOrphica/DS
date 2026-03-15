const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "data", "shop.db");
const db = new Database(dbPath, { timeout: 10000 });

// Curated names from Larnitech PDF catalog pages/spec blocks.
// Format: article -> canonical title (without article prefix).
const NAME_BY_ARTICLE = new Map([
  ["DW-HT07", "7-канальный модуль расширений"],
  ["DW-HT05", "5-канальный модуль"],
  ["DW-RC12", "12-канальный модуль"],
  ["DW-HC10", "10-канальный контроллер температуры"],
  ["DW-SW16", "16-канальный адаптер кнопок"],
  ["DW-DALI", "2-канальный адаптер DALI"],
  ["DW-DM02", "2-канальный диммер"],
  ["DW-DM04", "4-канальный диммер"],
  ["DW-DM06", "6-канальный диммер"],
  ["DW-RS232", "RS232 адаптер интерфейса"],
  ["DW-RS485", "RS485 адаптер интерфейса"],
  ["DW-RGB03", "9-канальный RGBW контроллер"],
  ["DW-WL02", "Модуль защиты от протечки воды"],
  ["DW-BC03", "3-канальный модуль штор"],
  ["DE-GW", "Шлюз CAN/Ethernet"],
  ["CW-MSD", "Миниатюрный датчик движения"],
  ["CW-MLI", "Микро-датчик 3-в-1"],
  ["CW-HTMLII", "Датчик 5-в-1"],
  ["DW-METERS", "Модуль AMR Meter Reading"]
]);

function norm(value) {
  return String(value || "").trim().toUpperCase();
}

function buildName(article, title) {
  return `${article} - ${title}`;
}

function run() {
  const rows = db
    .prepare(
      `
      SELECT id, article, name
      FROM products
      WHERE brand='Larnitech'
      ORDER BY article
    `
    )
    .all();

  const update = db.prepare(
    `
      UPDATE products
      SET name = @name, updated_at = @updatedAt
      WHERE id = @id
    `
  );

  const now = new Date().toISOString();
  const changed = [];
  const tx = db.transaction((items) => {
    for (const row of items) {
      const article = norm(row.article);
      const title = NAME_BY_ARTICLE.get(article);
      if (!title) continue;
      const nextName = buildName(article, title);
      if (String(row.name || "").trim() === nextName) continue;
      update.run({
        id: row.id,
        name: nextName,
        updatedAt: now
      });
      changed.push({
        id: row.id,
        article,
        from: row.name,
        to: nextName
      });
    }
  });
  tx(rows);

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned: rows.length,
        changed: changed.length,
        items: changed
      },
      null,
      2
    )
  );
}

run();
