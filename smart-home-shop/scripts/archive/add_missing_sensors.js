const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Добавление недостающих датчиков из раздела "Датчики"...\n');

// Недостающие товары из раздела "Датчики" (страницы 52-62)
const missingSensors = [
  { id: "CW-MLI", article: "CW-MLI", name: "CW-MLI / CW-M - Метеостанция", price: 18500, description: "Комбинированная метеостанция с веб-интерфейсом.", specs: '{"функции": "температура, влажность, давление, CO2", "дисплей": "TFT", "интерфейс": "веб"}' },
  { id: "WW-HTL", article: "WW-HTL", name: "WW-HTL - Датчик влажности и температуры", price: 7500, description: "Датчик для измерения влажности и температуры.", specs: '{"датчики": "температура, влажность", "точность": "±0.5°C, ±3%", "интерфейс": "1-Wire"}' },
  { id: "WW-TS", article: "WW-TS", name: "WW-TS - Датчик температуры", price: 6500, description: "Точный датчик температуры для помещений.", specs: '{"диапазон": "-40...+85°C", "точность": "±0.2°C", "интерфейс": "1-Wire"}' },
  { id: "FW-TS", article: "FW-TS", name: "FW-TS - Уличный датчик температуры", price: 8500, description: "Уличный датчик температуры в защитном корпусе.", specs: '{"защита": "IP65", "диапазон": "-50...+70°C", "точность": "±0.3°C"}' },
  { id: "FW-FT", article: "FW-FT", name: "FW-FT - Датчик протечки", price: 7200, description: "Беспроводной датчик протечки воды.", specs: '{"питание": "батарея 3V", "срок службы": "3 года", "радиосвязь": "868 МГц"}' },
  { id: "EW-WL", article: "EW-WL", name: "EW-WL - Беспроводной выключатель", price: 9500, description: "Беспроводной настенный выключатель.", specs: '{"кнопок": "2", "частота": "433 МГц", "дальность": "50м", "питание": "батарея"}' },
  { id: "FW-WL", article: "FW-WL", name: "FW-WL - Беспроводной модуль управления", price: 10500, description: "Беспроводной модуль управления освещением.", specs: '{"каналов": "4", "частота": "868 МГц", "мощность": "2000W", "питание": "220V"}' }
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
for (const product of missingSensors) {
  try {
    insert.run({
      id: product.id,
      article: product.article,
      name: product.name,
      price: product.price,
      priceText: "",
      category: category,
      group: "Датчики",
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

console.log(`\n✅ Добавлено ${added} датчиков`);

// Проверяем результат
const check = db.prepare(`
  SELECT article, name FROM products 
  WHERE category = ? AND group_name = 'Датчики'
  ORDER BY article
`).all(category);

console.log('\nВсе товары в категории "Датчики":');
console.log('=' .repeat(60));
check.forEach(p => {
  console.log(`  ${p.article} - ${p.name}`);
});

// Проверяем соответствие списку из PDF
const pdfList = ["CW-CO2", "CW-HTMLII", "CW-MLI", "CW-M", "CW-MSD", "WW-HTL", "WW-TS", "FW-TS", "FW-FT", "EW-WL", "FW-WL"];
const found = check.filter(p => pdfList.includes(p.article));
console.log(`\nИз PDF списка найдено: ${found.length}/${pdfList.length} товаров`);

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
