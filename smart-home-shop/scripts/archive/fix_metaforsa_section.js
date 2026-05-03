const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Исправление раздела "Серия Metaforsa"...\n');

// 1. Добавляем недостающие товары из раздела Metaforsa
const metaforsaProducts = [
  { id: "METAFORSA-MF-14", article: "METAFORSA-MF-14", name: "Metaforsa2 MF-14", price: 45000, group: "Серия Metaforsa", description: "Готовый комплект Metaforsa2 MF-14 для автоматизации квартиры.", specs: '{"комплектация": "контроллер, датчики, блок питания", "каналов": "14", "управление": "облачное/локальное"}' },
  { id: "METAFORSA-MFC-14", article: "METAFORSA-MFC-14", name: "Metaforsa2 Cloud MFC-14", price: 55000, group: "Серия Metaforsa", description: "Готовый комплект Metaforsa2 Cloud MFC-14 с облачным управлением.", specs: '{"комплектация": "контроллер, датчики, блок питания", "каналов": "14", "облако": "встроено"}' }
];

const insert = db.prepare(`
  INSERT OR REPLACE INTO products (
    id, article, name, price, price_text, category, group_name, brand, image,
    source_url, description, specs, breadcrumbs, description_html, 
    gallery_json, attributes_json, documents_json, updated_at
  ) VALUES (
    @id, @article, @name, @price, @priceText, @category, @group, @brand, @image,
    @sourceUrl, @description, @specs, @breadcrumbs, @descriptionHtml, 
    @galleryJson, @attributesJson, @documentsJson, @updatedAt
  )
`);

const now = new Date().toISOString();
const category = "Оборудование УД сделано в Германии, Larnitech";

// Добавляем недостающие товары
let added = 0;
for (const product of metaforsaProducts) {
  try {
    insert.run({
      id: product.id,
      article: product.article,
      name: product.name,
      price: product.price,
      priceText: "",
      category: category,
      group: product.group,
      brand: "Larnitech",
      image: "",
      sourceUrl: "https://larnitech-rus.ru/",
      description: product.description,
      specs: product.specs,
      breadcrumbs: "",
      descriptionHtml: "",
      galleryJson: "[]",
      attributesJson: "[]",
      documentsJson: "[]",
      updatedAt: now
    });
    added++;
    console.log(`✓ Добавлен: ${product.article} - ${product.name}`);
  } catch (err) {
    console.error(`✗ ${product.article}: ${err.message}`);
  }
}

// 2. Перемещаем товары из раздела Metaforsa в правильную категорию
const metaforsaItems = [
  "DW-HT07", "DW-HT05", "DW-RC12"
];

let updated = 0;
for (const article of metaforsaItems) {
  try {
    const result = db.prepare(`
      UPDATE products 
      SET group_name = 'Серия Metaforsa' 
      WHERE article = ? AND category = ?
    `).run(article, category);
    
    if (result.changes > 0) {
      updated++;
      console.log(`✓ Перемещен: ${article} -> Серия Metaforsa`);
    }
  } catch (err) {
    console.error(`✗ ${article}: ${err.message}`);
  }
}

console.log(`\n✅ Добавлено: ${added} товаров`);
console.log(`✅ Перемещено: ${updated} товаров`);

// Проверяем итоговую структуру категории Metaforsa
const check = db.prepare(`
  SELECT article, name FROM products 
  WHERE category = ? AND group_name = 'Серия Metaforsa'
  ORDER BY article
`).all(category);

console.log('\nТовары в категории "Серия Metaforsa":');
console.log('=' .repeat(50));
check.forEach(p => {
  console.log(`  ${p.article} - ${p.name}`);
});

// Проверяем общую структуру всех категорий
const allCategories = db.prepare(`
  SELECT group_name, COUNT(*) as cnt FROM products 
  WHERE category = ? 
  GROUP BY group_name 
  ORDER BY cnt DESC
`).all(category);

console.log('\nОбщая структура всех категорий:');
console.log('=' .repeat(50));
allCategories.forEach((row, i) => {
  console.log(`${i + 1}. ${row.group_name}: ${row.cnt} товаров`);
});

db.close();
