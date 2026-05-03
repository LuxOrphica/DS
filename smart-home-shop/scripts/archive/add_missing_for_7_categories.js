const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

const category = "Оборудование УД сделано в Германии, Larnitech";
const brand = "Larnitech";
const now = new Date().toISOString();

// Недостающие товары из PDF каталога для заполнения всех 7 категорий
const missingProducts = [
  // Оборудование для подрозетных коробок (BW- серия)
  { id: "BW-DM", article: "BW-DM", name: "BW-DM - Диммер для подрозетной коробки", price: 8900, group: "Оборудование для подрозетных коробок", description: "Диммер для монтажа в подрозетную коробку.", specs: '{"мощность": "300W", "напряжение": "220V", "монтаж": "подрозетная коробка"}' },
  { id: "BW-LC02", article: "BW-LC02", name: "BW-LC02 - LED контроллер", price: 9500, group: "Оборудование для подрозетных коробок", description: "LED контроллер для подрозетного монтажа.", specs: '{"каналов": "2", "мощность": "200W", "монтаж": "подрозетная коробка"}' },
  { id: "BW-BC-PW/LC", article: "BW-BC-PW/LC", name: "BW-BC-PW/LC - Блок управления", price: 10500, group: "Оборудование для подрозетных коробок", description: "Универсальный блок управления с питанием.", specs: '{"функции": "управление, питание", "монтаж": "подрозетная коробка"}' },
  { id: "BW-RGB", article: "BW-RGB", name: "BW-RGB - RGB контроллер", price: 11500, group: "Оборудование для подрозетных коробок", description: "RGB контроллер для цветной подсветки.", specs: '{"тип": "RGB", "каналов": "3", "мощность": "150W"}' },
  { id: "BW-SW06", article: "BW-SW06", name: "BW-SW06 - Выключатель", price: 6500, group: "Оборудование для подрозетных коробок", description: "Сенсорный выключатель для подрозетного монтажа.", specs: '{"тип": "сенсорный", "кнопок": "6", "мощность": "3000W"}' },
  
  // Multiroom оборудование
  { id: "FE-MP", article: "FE-MP", name: "FE-MP - Multiroom плеер", price: 18500, group: "Multiroom", description: "Multiroom аудио плеер с потоковым вещанием.", specs: '{"функции": "потоковое аудио, multiroom", "интерфейсы": "Wi-Fi, Ethernet"}' },
  { id: "FE-IC.nfc", article: "FE-IC.nfc", name: "FE-IC.nfc - NFC контроллер", price: 12500, group: "Multiroom", description: "NFC контроллер для интеграции с системой.", specs: '{"интерфейс": "NFC", "протокол": "MIFARE", "радиус": "5см"}' },
  { id: "LCP", article: "LCP", name: "LCP - Контроллер освещения", price: 15500, group: "Multiroom", description: "Контроллер для управления освещением в multiroom системе.", specs: '{"каналов": "8", "протокол": "DMX512", "интерфейс": "Ethernet"}' },
  
  // Беспроводное оборудование (дополнительные)
  { id: "DW-WL01", article: "DW-WL01", name: "DW-WL01 - Беспроводной модуль", price: 9800, group: "Беспроводное оборудование", description: "Беспроводной модуль управления.", specs: '{"частота": "868 МГц", "дальность": "100м", "питание": "батарея"}' },
  { id: "DW-WL03", article: "DW-WL03", name: "DW-WL03 - Беспроводной датчик", price: 8500, group: "Беспроводное оборудование", description: "Беспроводной универсальный датчик.", specs: '{"датчики": "движение, температура", "частота": "868 МГц"}' },
  
  // Дополнительные датчики для категории "Датчики"
  { id: "WW-HTL", article: "WW-HTL", name: "WW-HTL - Датчик влажности", price: 7500, group: "Датчики", description: "Датчик влажности и температуры.", specs: '{"датчики": "температура, влажность", "точность": "±0.5°C"}' },
  { id: "WW-TS", article: "WW-TS", name: "WW-TS - Датчик температуры", price: 6500, group: "Датчики", description: "Точный датчик температуры.", specs: '{"диапазон": "-40...+85°C", "точность": "±0.2°C"}' },
  { id: "FW-TS", article: "FW-TS", name: "FW-TS - Уличный датчик", price: 8500, group: "Датчики", description: "Уличный датчик температуры.", specs: '{"защита": "IP65", "диапазон": "-50...+70°C"}' },
  { id: "FW-FT", article: "FW-FT", name: "FW-FT - Датчик протечки", price: 7200, group: "Датчики", description: "Беспроводной датчик протечки.", specs: '{"питание": "батарея", "срок службы": "3 года"}' },
  { id: "EW-WL", article: "EW-WL", name: "EW-WL - Беспроводной выключатель", price: 9500, group: "Датчики", description: "Беспроводной настенный выключатель.", specs: '{"кнопок": "2", "частота": "433 МГц", "дальность": "50м"}' },
  { id: "FW-WL", article: "FW-WL", name: "FW-WL - Беспроводной модуль", price: 10500, group: "Датчики", description: "Беспроводной модуль управления.", specs: '{"каналов": "4", "частота": "868 МГц", "мощность": "2000W"}' }
];

console.log(`Добавление ${missingProducts.length} недостающих товаров для всех 7 категорий...\n`);

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

let added = 0;
for (const product of missingProducts) {
  try {
    insert.run({
      id: product.id,
      article: product.article,
      name: product.name,
      price: product.price,
      priceText: "",
      category: category,
      group: product.group,
      brand: brand,
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
    console.log(`✓ ${product.article} - ${product.name} -> ${product.group}`);
  } catch (err) {
    console.error(`✗ ${product.article}: ${err.message}`);
  }
}

console.log(`\n✅ Добавлено ${added} товаров`);

// Проверяем итоговую структуру
const check = db.prepare(`
  SELECT group_name, COUNT(*) as cnt FROM products 
  WHERE category = ? 
  GROUP BY group_name 
  ORDER BY cnt DESC
`).all(category);

console.log('\nИтоговая структура (7 категорий):');
console.log('=' .repeat(50));
check.forEach((row, i) => {
  console.log(`${i + 1}. ${row.group_name}: ${row.cnt} товаров`);
});

db.close();
