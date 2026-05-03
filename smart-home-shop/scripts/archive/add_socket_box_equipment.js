const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Добавление оборудования для подрозетных коробок (BW- серия)...\n');

// Товары из раздела "Оборудование для подрозетных коробок" (страницы 38-51)
const socketBoxProducts = [
  { id: "BW-DM", article: "BW-DM", name: "BW-DM - Диммер для подрозетной коробки", price: 8900, description: "Диммер для монтажа в стандартную подрозетную коробку.", specs: '{"мощность": "300W", "напряжение": "220V", "монтаж": "подрозетная коробка", "тип": "сенсорный"}' },
  { id: "BW-LC02", article: "BW-LC02", name: "BW-LC02 - LED контроллер", price: 9500, description: "LED контроллер для подрозетного монтажа.", specs: '{"каналов": "2", "мощность": "200W", "монтаж": "подрозетная коробка", "управление": "сенсорное"}' },
  { id: "BW-BC-PW/LC", article: "BW-BC-PW/LC", name: "BW-BC-PW/LC - Блок управления с питанием", price: 10500, description: "Универсальный блок управления со встроенным блоком питания.", specs: '{"функции": "управление, питание", "мощность": "50W", "монтаж": "подрозетная коробка"}' },
  { id: "BW-RGB", article: "BW-RGB", name: "BW-RGB - RGB контроллер", price: 11500, description: "RGB контроллер для цветной подсветки.", specs: '{"тип": "RGB", "каналов": "3", "мощность": "150W", "управление": "сенсорное"}' },
  { id: "BW-SW06", article: "BW-SW06", name: "BW-SW06 - Сенсорный выключатель", price: 6500, description: "Сенсорный выключатель на 6 кнопок.", specs: '{"тип": "сенсорный", "кнопок": "6", "мощность": "3000W", "подсветка": "LED"}' },
  { id: "BW-SW24V", article: "BW-SW24V", name: "BW-SW24V - Выключатель 24V", price: 7200, description: "Выключатель для систем с питанием 24V.", specs: '{"напряжение": "24V", "мощность": "1000W", "тип": "сенсорный"}' },
  { id: "BW-LSA", article: "BW-LSA", name: "BW-LSA - Акустический датчик", price: 8500, description: "Акустический датчик для управления голосом.", specs: '{"тип": "акустический", "чувствительность": "регулируемая", "интерфейс": "1-Wire"}' },
  { id: "BW-IO", article: "BW-IO", name: "BW-IO - Модуль ввода-вывода", price: 9800, description: "Универсальный модуль ввода-вывода.", specs: '{"входы": "4", "выходы": "4", "тип": "универсальный", "монтаж": "подрозетная коробка"}' },
  { id: "BW-AC", article: "BW-AC", name: "BW-AC - Адаптер переменного тока", price: 5500, description: "Адаптер для подключения к сети переменного тока.", specs: '{"вход": "220V AC", "выход": "24V DC", "мощность": "50W", "защита": "короткое замыкание"}' },
  { id: "BW-RS485", article: "BW-RS485", name: "BW-RS485 - RS485 интерфейс", price: 12500, description: "Интерфейс для подключения устройств по RS485.", specs: '{"интерфейс": "RS485", "скорость": "9600-115200", "монтаж": "подрозетная коробка"}' },
  { id: "BW-RS232", article: "BW-RS232", name: "BW-RS232 - RS232 интерфейс", price: 11500, description: "Интерфейс для подключения устройств по RS232.", specs: '{"интерфейс": "RS232", "скорость": "9600-115200", "монтаж": "подрозетная коробка"}' },
  { id: "BW-UART", article: "BW-UART", name: "BW-UART - UART интерфейс", price: 10500, description: "UART интерфейс для подключения внешних устройств.", specs: '{"интерфейс": "UART", "скорость": "9600-115200", "монтаж": "подрозетная коробка"}' },
  { id: "BW-010", article: "BW-010", name: "BW-010 - Блок расширения", price: 13500, description: "Блок расширения для увеличения количества входов/выходов.", specs: '{"функция": "расширение", "входы": "8", "выходы": "8", "монтаж": "подрозетная коробка"}' }
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
for (const product of socketBoxProducts) {
  try {
    insert.run({
      id: product.id,
      article: product.article,
      name: product.name,
      price: product.price,
      priceText: "",
      category: category,
      group: "Оборудование для подрозетных коробок",
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

console.log(`\n✅ Добавлено ${added} товаров`);

// Проверяем результат
const check = db.prepare(`
  SELECT article, name FROM products 
  WHERE category = ? AND group_name = 'Оборудование для подрозетных коробок'
  ORDER BY article
`).all(category);

console.log('\nТовары в категории "Оборудование для подрозетных коробок":');
console.log('=' .repeat(60));
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
