const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Перераспределение товаров Larnitech по подкатегориям из PDF...\n');

// Структура подкатегорий из оглавления PDF (страницы 2-3)
const pdfCategoryStructure = {
  // DIN-реечное оборудование
  "Системные устройства": ["DE-MG", "DE-MG.plus", "DE-MG-P", "DE-GW", "DE-MG-DALI"],
  
  "LED контроллеры и диммеры": [
    "DW-LC18", "DW-LC10", "DW-LC07", 
    "DW-DM06", "DW-DM04", "DW-DM02",
    "DW-RGB03", "DE-LC-DMX"
  ],
  
  "Климат-контроль": [
    "DW-HC10", "DE-TRV", "DE-TRV-US",
    "DW-HT07", "DW-HT05"
  ],
  
  "Сенсоры и датчики": [
    "DW-LS01", "DW-LS02", "DW-LS03", "DW-WLS",
    "CW-CO2", "CW-HTMLII", "CW-MLI", "CW-M", "CW-MSD",
    "CW-MLI-II", "CW-M-II", "CW-MSD-II"
  ],
  
  "Интерфейсы и связь": [
    "DW-RS485", "DW-RS232", "DW-UART",
    "DW-DALI", "DW-DALI2", "DE-GW-KNX"
  ],
  
  "Модули ввода-вывода": [
    "DW-010", "DW-SW16", "DW-BC03", "DW-WL02", "DW-R"
  ],
  
  // Другие устройства
  "Панели управления": ["DW-PANEL", "DW-RC12"],
  "Беспроводное оборудование": ["DW-WL01", "DW-WL02", "DW-WLS", "DW-BC03"],
  "IP устройства": ["DE-IP-CAM"],
  "Metaforsa комплекты": ["METAFORSA-KIT", "METAFORSA", "METAFORSA-MFC14"],
  "Реле освещения": ["DE-LS", "DE-LS02", "DE-LS04", "DE-LS06"]
};

// Функция определения подкатегории по артикулу
function getSubCategory(article) {
  if (!article) return "Другое оборудование";
  
  for (const [subCat, products] of Object.entries(pdfCategoryStructure)) {
    for (const productCode of products) {
      if (article === productCode || 
          article.startsWith(productCode) || 
          productCode.startsWith(article)) {
        return subCat;
      }
    }
  }
  
  // Определяем по префиксу если точного совпадения не найдено
  if (article.startsWith('DE-MG')) return "Системные устройства";
  if (article.startsWith('DE-GW')) return "Системные устройства";
  if (article.startsWith('DW-LC') || article.startsWith('DW-DM') || article.startsWith('DW-RGB')) return "LED контроллеры и диммеры";
  if (article.startsWith('DE-LC') || article.startsWith('DE-LS')) return "Реле освещения";
  if (article.startsWith('DE-TRV')) return "Климат-контроль";
  if (article.startsWith('DW-HT') || article.startsWith('DW-HC')) return "Климат-контроль";
  if (article.startsWith('DW-LS') || article.startsWith('DW-WLS')) return "Сенсоры и датчики";
  if (article.startsWith('CW-')) return "Сенсоры и датчики";
  if (article.startsWith('DW-RS') || article.startsWith('DW-UART') || article.startsWith('DW-DALI') || article.startsWith('DE-GW-KNX')) return "Интерфейсы и связь";
  if (article.startsWith('DW-010') || article.startsWith('DW-SW') || article.startsWith('DW-R')) return "Модули ввода-вывода";
  if (article.startsWith('DW-BC') || article.startsWith('DW-WL')) return "Беспроводное оборудование";
  if (article.startsWith('DW-PANEL') || article.startsWith('DW-RC')) return "Панели управления";
  if (article.startsWith('DE-IP')) return "IP устройства";
  if (article.startsWith('METAFORSA')) return "Metaforsa комплекты";
  
  return "Другое оборудование";
}

// Получаем все товары Larnitech
const products = db.prepare(`
  SELECT id, article, name FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech'
`).all();

console.log(`Найдено ${products.length} товаров Larnitech\n`);

let updated = 0;
const distribution = {};

// Обновляем каждый товар
for (const product of products) {
  const article = product.article || product.id;
  const subCategory = getSubCategory(article);
  
  // Считаем распределение
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

// Выводим структуру
console.log('Структура подкатегорий Larnitech (по PDF каталогу):');
console.log('=' .repeat(50));

const sortedCategories = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sortedCategories) {
  console.log(`  📁 ${cat}: ${count} товаров`);
}

console.log('=' .repeat(50));
console.log(`\nВсего: ${products.length} товаров в ${sortedCategories.length} подкатегориях`);

db.close();
