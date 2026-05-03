#!/usr/bin/env node
const Database = require("better-sqlite3");

const db = new Database("data/shop.db");

const MAP = {
  "LX-100013": { cg: "Энергия и учет", csg: "Мониторинг энергии", et: "product" },
  "LX-100115": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100119": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100121": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100124": { cg: "Энергия и учет", csg: "Мониторинг энергии", et: "product" },
  "LX-100151": { cg: "Энергия и учет", csg: "Мониторинг энергии", et: "product" },
  "LX-100526": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100527": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100535": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100536": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100566": { cg: "Энергия и учет", csg: "Счетчики", et: "product" },
  "LX-100567": { cg: "Энергия и учет", csg: "Счетчики", et: "product" },
  "LX-100617": { cg: "Энергия и учет", csg: "Блоки питания", et: "product" },
  "LX-100652": { cg: "Энергия и учет", csg: "Счетчики", et: "product" },
  "LX-100677": { cg: "Энергия и учет", csg: "Реле нагрузки", et: "product" },
  "LX-100678": { cg: "Энергия и учет", csg: "Мониторинг энергии", et: "product" },
  "LX-100679": { cg: "Энергия и учет", csg: "Мониторинг энергии", et: "product" },
  "LX-100680": { cg: "Энергия и учет", csg: "Мониторинг энергии", et: "product" },
  "LX-100681": { cg: "Энергия и учет", csg: "Мониторинг энергии", et: "product" },
  "LX-100694": { cg: "Энергия и учет", csg: "Счетчики", et: "product" },

  "LX-100618": { cg: "Климат", csg: "Управление кондиционерами", et: "product" },
  "LX-200154": { cg: "Климат", csg: "Датчики климата", et: "product" },
  "LX-200203": { cg: "Климат", csg: "Датчики климата", et: "product" },
  "LX-200280": { cg: "Монтаж и расходники", csg: "Клеммы и коннекторы", et: "product" },
  "LX-200308": { cg: "Мерч", csg: "Одежда", et: "merch" },

  "LX-334660084062": { cg: "Безопасность и доступ", csg: "Контроль доступа", et: "product" },
  "LX-475183233492": { cg: "Безопасность и доступ", csg: "Контроль доступа", et: "product" },
  "LX-878938886332": { cg: "Безопасность и доступ", csg: "Контроль доступа", et: "product" },

  "LX-610043": { cg: "Аудио и мультимедиа", csg: "Акустика", et: "product" },
  "LX-610110": { cg: "Аудио и мультимедиа", csg: "Акустика", et: "product" },
  "LX-610111": { cg: "Аудио и мультимедиа", csg: "Акустика", et: "product" },
  "LX-610165": { cg: "Аудио и мультимедиа", csg: "Акустика", et: "product" },

  "LX-625183233492": { cg: "Услуги", csg: "Консалтинг", et: "service" },
  "LX-625183179761": { cg: "Услуги", csg: "Консалтинг", et: "service" },
  "LX-893432609362": { cg: "Услуги", csg: "Консалтинг", et: "service" }
};

const selectMissing = db.prepare(`
  SELECT id
  FROM products
  WHERE LOWER(TRIM(COALESCE(entity_type, 'product'))) NOT IN ('service', 'merch')
    AND (TRIM(COALESCE(commercial_group, '')) = '' OR TRIM(COALESCE(commercial_subgroup, '')) = '')
`);

const updateProduct = db.prepare(`
  UPDATE products
  SET
    commercial_group = @cg,
    commercial_subgroup = @csg,
    brand_subcategory = @csg,
    category = @cg,
    group_name = @csg,
    entity_type = @et,
    normalization_status = 'manual_override',
    normalization_note = @note,
    updated_at = @now
  WHERE id = @id
`);

const deletePfc = db.prepare("DELETE FROM product_function_categories WHERE product_id = ?");
const insertPfc = db.prepare(`
  INSERT OR REPLACE INTO product_function_categories (
    product_id, category_name, is_primary, sort_order, created_at, updated_at
  ) VALUES (?, ?, 1, 0, ?, ?)
`);

const countRemaining = db.prepare(`
  SELECT COUNT(*) AS c
  FROM products
  WHERE LOWER(TRIM(COALESCE(entity_type, 'product'))) NOT IN ('service', 'merch')
    AND (TRIM(COALESCE(commercial_group, '')) = '' OR TRIM(COALESCE(commercial_subgroup, '')) = '')
`);

const listRemaining = db.prepare(`
  SELECT id, article, name, category, group_name
  FROM products
  WHERE LOWER(TRIM(COALESCE(entity_type, 'product'))) NOT IN ('service', 'merch')
    AND (TRIM(COALESCE(commercial_group, '')) = '' OR TRIM(COALESCE(commercial_subgroup, '')) = '')
  ORDER BY id
`);

const now = new Date().toISOString();
let changed = 0;
const unresolved = [];

const tx = db.transaction(() => {
  const rows = selectMissing.all();
  for (const row of rows) {
    const id = String(row.id || "").trim();
    const mapped = MAP[id];
    if (!mapped) {
      unresolved.push(id);
      continue;
    }
    const info = updateProduct.run({
      id,
      cg: mapped.cg,
      csg: mapped.csg,
      et: mapped.et,
      note: "manual mapping from normalization backlog (batch 2026-03-13)",
      now
    });
    if (info.changes > 0) changed += info.changes;

    deletePfc.run(id);
    if (mapped.et === "product") {
      insertPfc.run(id, mapped.cg, now, now);
    }
  }
});

tx();

const remaining = countRemaining.get().c;
console.log(
  JSON.stringify(
    {
      changed,
      unresolved: unresolved.length,
      unresolvedIds: unresolved,
      remaining,
      remainingItems: listRemaining.all()
    },
    null,
    2
  )
);
