const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Перестройка каталога по новой структуре...\n');

// Новая структура категорий верхнего уровня
const mainCategories = [
  {
    name: "Освещение",
    slug: "lighting",
    description: "Системы управления освещением, диммеры, LED контроллеры",
    order: 1
  },
  {
    name: "Климат",
    slug: "climate", 
    description: "Управление отоплением, вентиляцией, кондиционированием",
    order: 2
  },
  {
    name: "Безопасность",
    slug: "security",
    description: "Системы безопасности, датчики, сигнализация",
    order: 3
  },
  {
    name: "Энергомониторинг",
    slug: "energy",
    description: "Контроль потребления энергии, счетчики, мониторы",
    order: 4
  },
  {
    name: "Управление и автоматизация",
    slug: "automation",
    description: "Контроллеры, шлюзы, системы автоматизации",
    order: 5
  },
  {
    name: "Аудио / Multiroom",
    slug: "audio",
    description: "Музыкальные системы, multiroom, аудио оборудование",
    order: 6
  },
  {
    name: "Комплекты",
    slug: "kits",
    description: "Готовые решения и наборы оборудования",
    order: 7
  },
  {
    name: "Монтаж",
    slug: "installation",
    description: "Монтажное оборудование, DIN-рейки, подрозетники",
    order: 8
  }
];

// Структура подкатегорий для брендов
const brandSubcategories = [
  "Контроллеры",
  "Реле и диммеры", 
  "Датчики",
  "Термостаты",
  "Энергомониторинг",
  "Аудио / Multiroom",
  "Аксессуары"
];

// Бренды
const brands = ["HitePro", "Wiren Board", "Loxone", "Larnitech"];

console.log("1. Создание новых категорий верхнего уровня...");

// Очищаем текущие категории
db.prepare("DELETE FROM categories").run();

// Вставляем новые категории верхнего уровня
const insertCategory = db.prepare(`
  INSERT INTO categories (id, name, slug, description, parent_id, order_index)
  VALUES (?, ?, ?, ?, ?, ?)
`);

mainCategories.forEach((cat, index) => {
  insertCategory.run(
    `cat_${cat.slug}`,
    cat.name,
    cat.slug,
    cat.description,
    null,
    cat.order
  );
  console.log(`✓ ${cat.name}`);
});

console.log("\n2. Создание брендов как подкатегорий...");

// Создаем бренды как подкатегории (пока без родителя)
const brandInsert = db.prepare(`
  INSERT INTO categories (id, name, slug, description, parent_id, order_index)
  VALUES (?, ?, ?, ?, ?, ?)
`);

brands.forEach((brand, index) => {
  brandInsert.run(
    `brand_${brand.toLowerCase().replace(/\s+/g, '_')}`,
    brand,
    brand.toLowerCase().replace(/\s+/g, '_'),
    `Продукция ${brand}`,
    null,
    index + 1
  );
  console.log(`✓ ${brand}`);
});

console.log("\n3. Создание подкатегорий для брендов...");

// Создаем подкатегории для каждого бренда
const subcatInsert = db.prepare(`
  INSERT INTO categories (id, name, slug, description, parent_id, order_index)
  VALUES (?, ?, ?, ?, ?, ?)
`);

brands.forEach(brand => {
  const brandId = `brand_${brand.toLowerCase().replace(/\s+/g, '_')}`;
  
  brandSubcategories.forEach((subcat, index) => {
    const subcatSlug = `${brand.toLowerCase().replace(/\s+/g, '_')}_${subcat.toLowerCase().replace(/\s+/g, '_')}`;
    const subcatId = `${brandId}_${subcat.toLowerCase().replace(/\s+/g, '_')}`;
    subcatInsert.run(
      subcatId,
      subcat,
      subcatSlug,
      `${subcat} для ${brand}`,
      brandId,
      index + 1
    );
  });
  console.log(`✓ ${brand} - ${brandSubcategories.length} подкатегорий`);
});

console.log("\n4. Обновление товаров с новой структурой категорий...");

// Функция определения новой категории для товара
function determineNewCategory(product) {
  const name = (product.name || '').toLowerCase();
  const article = (product.article || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const brand = (product.brand || '').toLowerCase();
  
  // Определяем бренд
  let detectedBrand = "Прочие";
  if (brand.includes("larnitech")) detectedBrand = "Larnitech";
  else if (brand.includes("wiren") || brand.includes("wb")) detectedBrand = "Wiren Board";
  else if (brand.includes("loxone")) detectedBrand = "Loxone";
  else if (brand.includes("hite") || brand.includes("hitepro")) detectedBrand = "HitePro";
  
  // Определяем категорию на основе ключевых слов
  if (name.includes("свет") || name.includes("диммер") || name.includes("ламп") || 
      article.includes("dw-lc") || article.includes("dw-dm") || article.includes("dw-rgb") ||
      description.includes("освещ") || description.includes("диммиров")) {
    return { main: "Освещение", brand: detectedBrand, subcat: "Реле и диммеры" };
  }
  
  if (name.includes("климат") || name.includes("температур") || name.includes("отопление") ||
      name.includes("вентиляция") || name.includes("кондицион") || article.includes("de-trv") ||
      article.includes("dw-hc") || article.includes("dw-ht")) {
    return { main: "Климат", brand: detectedBrand, subcat: "Термостаты" };
  }
  
  if (name.includes("безопасност") || name.includes("сигнализаци") || name.includes("охрана") ||
      name.includes("датчик") || article.includes("cw-") || article.includes("dw-ls")) {
    return { main: "Безопасность", brand: detectedBrand, subcat: "Датчики" };
  }
  
  if (name.includes("энерг") || name.includes("счетчик") || name.includes("мониторинг") ||
      article.includes("dw-meters")) {
    return { main: "Энергомониторинг", brand: detectedBrand, subcat: "Энергомониторинг" };
  }
  
  if (name.includes("контроллер") || name.includes("шлюз") || name.includes("automation") ||
      article.includes("de-mg") || article.includes("de-gw")) {
    return { main: "Управление и автоматизация", brand: detectedBrand, subcat: "Контроллеры" };
  }
  
  if (name.includes("аудио") || name.includes("музык") || name.includes("multiroom") ||
      article.includes("fe-mp") || article.includes("lcp")) {
    return { main: "Аудио / Multiroom", brand: detectedBrand, subcat: "Аудио / Multiroom" };
  }
  
  if (name.includes("комплект") || name.includes("набор") || article.includes("metaforsa")) {
    return { main: "Комплекты", brand: detectedBrand, subcat: "Аксессуары" };
  }
  
  if (name.includes("монтаж") || name.includes("din") || name.includes("подрозетник") ||
      article.includes("bw-") || article.includes("dw-010") || article.includes("dw-sw")) {
    return { main: "Монтаж", brand: detectedBrand, subcat: "Аксессуары" };
  }
  
  // По умолчанию
  return { main: "Управление и автоматизация", brand: detectedBrand, subcat: "Контроллеры" };
}

// Обновляем все товары
const products = db.prepare("SELECT id, name, article, description, brand FROM products").all();
let updated = 0;

products.forEach(product => {
  const newCat = determineNewCategory(product);
  
  try {
    db.prepare(`
      UPDATE products 
      SET category = ?, group_name = ?
      WHERE id = ?
    `).run(newCat.main, `${newCat.brand} / ${newCat.subcat}`, product.id);
    
    updated++;
  } catch (err) {
    console.error(`Ошибка обновления товара ${product.id}:`, err.message);
  }
});

console.log(`\n✅ Обновлено ${updated} товаров`);

// Проверяем результат
const stats = db.prepare(`
  SELECT category, COUNT(*) as count 
  FROM products 
  GROUP BY category 
  ORDER BY count DESC
`).all();

console.log("\n📊 Статистика по новым категориям:");
console.log("=" .repeat(40));
stats.forEach(stat => {
  console.log(`${stat.category}: ${stat.count} товаров`);
});

console.log("\n🎉 Перестройка каталога завершена!");
console.log("\nСледующие шаги:");
console.log("1. Настроить фильтры для каждой категории");
console.log("2. Создать атрибуты для брендов");
console.log("3. Настроить скрытие пустых категорий");

db.close();
