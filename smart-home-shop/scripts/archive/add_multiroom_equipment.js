const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Добавление оборудования Multiroom...\n');

// Товары из раздела "Multiroom" (страницы 63-68)
const multiroomProducts = [
  { id: "FE-MP", article: "FE-MP", name: "FE-MP - Multiroom плеер", price: 18500, description: "Multiroom аудио плеер с потоковым вещанием и поддержкой различных форматов.", specs: '{"функции": "потоковое аудио, multiroom", "интерфейсы": "Wi-Fi, Ethernet, Bluetooth", "форматы": "MP3, FLAC, WAV", "зоны": "до 8"}' },
  { id: "FE-IC.nfc", article: "FE-IC.nfc", name: "FE-IC.nfc - NFC контроллер", price: 12500, description: "NFC контроллер для интеграции с системой умного дома.", specs: '{"интерфейс": "NFC", "протокол": "MIFARE", "радиус действия": "5см", "интеграция": "система управления доступом"}' },
  { id: "LCP", article: "LCP", name: "LCP - Контроллер освещения", price: 15500, description: "Контроллер для управления освещением в multiroom системе.", specs: '{"каналов": "8", "протокол": "DMX512", "интерфейс": "Ethernet, RS485", "управление": "сценарии, таймеры"}' }
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

let added = 0;
for (const product of multiroomProducts) {
  try {
    insert.run({
      id: product.id,
      article: product.article,
      name: product.name,
      price: product.price,
      priceText: "",
      category: category,
      group: "Multiroom",
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
    console.log(`✓ ${product.article} - ${product.name}`);
  } catch (err) {
    console.error(`✗ ${product.article}: ${err.message}`);
  }
}

console.log(`\n✅ Добавлено ${added} товаров Multiroom`);

// Проверяем результат
const check = db.prepare(`
  SELECT article, name FROM products 
  WHERE category = ? AND group_name = 'Multiroom'
  ORDER BY article
`).all(category);

console.log('\nТовары в категории "Multiroom":');
console.log('=' .repeat(50));
check.forEach(p => {
  console.log(`  ${p.article} - ${p.name}`);
});

// Проверяем общую структуру
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
