const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Объединение подкатегорий в 6 групп как в PDF каталоге...\n');

// 6 подкатегорий как в PDF каталоге Larnitech
const sixCategories = {
  "Системные устройства": [
    "DE-MG", "DE-MG.plus", "DE-MG-P", "DE-GW", "DE-MG-DALI", 
    "DE-IP-CAM", "DE-GW-KNX"
  ],
  
  "Управление освещением": [
    // LED контроллеры и диммеры
    "DW-LC18", "DW-LC10", "DW-LC07", "DW-DM06", "DW-DM04", "DW-DM02",
    "DW-RGB03", "DE-LC-DMX", "DW-DALI", "DW-DALI2",
    // Реле
    "DE-LS", "DE-LS02", "DE-LS04", "DE-LS06"
  ],
  
  "Климат-контроль": [
    "DW-HC10", "DE-TRV", "DE-TRV-US",
    "DW-HT07", "DW-HT05", "DW-HTO7"
  ],
  
  "Сенсоры и датчики": [
    "DW-LS01", "DW-LS02", "DW-LS03", "DW-WLS",
    "CW-CO2", "CW-HTMLII", "CW-MLI", "CW-M", "CW-MSD",
    "CW-MLI-II", "CW-M-II", "CW-MSD-II"
  ],
  
  "Интерфейсы и модули": [
    // Интерфейсы
    "DW-RS485", "DW-RS232", "DW-UART",
    // Модули ввода-вывода
    "DW-010", "DW-SW16", "DW-BC03", "DW-WL02", "DW-WL01", "DW-R",
    "DW-METERS", "DW-WLS"
  ],
  
  "Панели и комплекты": [
    "DW-PANEL", "DW-RC12", "METAFORSA-KIT", "METAFORSA", "METAFORSA-MFC14"
  ]
};

// Функция определения подкатегории
function getSubCategory(article) {
  if (!article) return "Другое оборудование";
  
  for (const [subCat, products] of Object.entries(sixCategories)) {
    for (const productCode of products) {
      if (article === productCode || 
          article.startsWith(productCode) || 
          productCode.startsWith(article)) {
        return subCat;
      }
    }
  }
  
  // Определяем по префиксу
  if (article.startsWith('DE-MG') || article.startsWith('DE-GW') || article.startsWith('DE-IP')) return "Системные устройства";
  if (article.startsWith('DW-LC') || article.startsWith('DW-DM') || article.startsWith('DW-RGB') || article.startsWith('DE-LC') || article.startsWith('DE-LS') || article.startsWith('DW-DALI')) return "Управление освещением";
  if (article.startsWith('DE-TRV') || article.startsWith('DW-HT') || article.startsWith('DW-HC')) return "Климат-контроль";
  if (article.startsWith('DW-LS') || article.startsWith('DW-WLS') || article.startsWith('CW-')) return "Сенсоры и датчики";
  if (article.startsWith('DW-RS') || article.startsWith('DW-UART') || article.startsWith('DW-010') || article.startsWith('DW-SW') || article.startsWith('DW-BC') || article.startsWith('DW-WL') || article.startsWith('DW-R') || article.startsWith('DW-METERS')) return "Интерфейсы и модули";
  if (article.startsWith('DW-PANEL') || article.startsWith('DW-RC') || article.startsWith('METAFORSA')) return "Панели и комплекты";
  
  return "Другое оборудование";
}

// Получаем все товары Larnitech
const products = db.prepare(`
  SELECT id, article, name FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech'
`).all();

console.log(`Найдено ${products.length} товаров\n`);

let updated = 0;
const distribution = {};

for (const product of products) {
  const article = product.article || product.id;
  const subCategory = getSubCategory(article);
  
  distribution[subCategory] = (distribution[subCategory] || 0) + 1;
  
  try {
    const result = db.prepare(`
      UPDATE products SET group_name = ? WHERE id = ?
    `).run(subCategory, product.id);
    
    if (result.changes > 0) {
      updated++;
    }
  } catch (err) {
    console.error(`✗ ${article}: ${err.message}`);
  }
}

console.log(`✅ Обновлено ${updated} товаров\n`);
console.log('Структура категории Larnitech (6 подкатегорий как в PDF):');
console.log('=' .repeat(55));

const sortedCategories = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
sortedCategories.forEach(([cat, count], index) => {
  console.log(`${index + 1}. ${cat}: ${count} товаров`);
});

console.log('=' .repeat(55));
console.log(`\nВсего: ${products.length} товаров в ${sortedCategories.length} подкатегориях`);
console.log('\nСоответствие разделам PDF каталога:');
console.log('  1. Системные устройства = DE-MG, DE-GW, камеры');
console.log('  2. Управление освещением = LED контроллеры, диммеры, реле');
console.log('  3. Климат-контроль = Термостаты, датчики климата');
console.log('  4. Сенсоры и датчики = DW-LS, CW- (из раздела "Датчики")');
console.log('  5. Интерфейсы и модули = RS, UART, модули ввода-вывода');
console.log('  6. Панели и комплекты = Панели управления, Metaforsa');

db.close();
