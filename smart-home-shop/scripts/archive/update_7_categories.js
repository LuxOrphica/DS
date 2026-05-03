const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Обновление названий подкатегорий по PDF каталогу...\n');

// 7 категорий как в PDF каталоге (страницы 2-3 оглавление)
const pdfCategories = {
  "Серия Metaforsa": [
    "METAFORSA-KIT", "METAFORSA", "METAFORSA-MFC14"
  ],
  
  "DIN-реечное оборудование": [
    // Системные устройства
    "DE-MG", "DE-MG.plus", "DE-MG-P", "DE-GW", "DE-MG-DALI", "DE-GW-KNX",
    // LED контроллеры и диммеры
    "DW-LC18", "DW-LC10", "DW-LC07", "DW-DM06", "DW-DM04", "DW-DM02",
    "DW-RGB03", "DE-LC-DMX", "DW-DALI", "DW-DALI2",
    // Реле
    "DE-LS", "DE-LS02", "DE-LS04", "DE-LS06",
    // Климат-контроль
    "DW-HC10", "DE-TRV", "DE-TRV-US", "DW-HT07", "DW-HT05", "DW-HTO7",
    // Интерфейсы и модули
    "DW-RS485", "DW-RS232", "DW-UART", "DW-010", "DW-SW16", "DW-BC03",
    "DW-WL02", "DW-WL01", "DW-R", "DW-METERS", "DW-WLS",
    // Панели
    "DW-PANEL", "DW-RC12",
    // IP устройства
    "DE-IP-CAM"
  ],
  
  "Оборудование для подрозетных коробок": [
    // BW- серия из оглавления
    "BW-DM", "BW-LC02", "BW-BC-PW/LC", "BW-RGB", "BW-SW06", "BW-SW24V",
    "BW-LSA", "BW-IO", "BW-AC", "BW-RS485", "BW-RS232", "BW-UART", "BW-010"
  ],
  
  "Датчики": [
    // CW- серия
    "CW-CO2", "CW-HTMLII", "CW-MLI", "CW-M", "CW-MSD",
    "CW-MLI-II", "CW-M-II", "CW-MSD-II",
    // DW- датчики
    "DW-LS01", "DW-LS02", "DW-LS03", "DW-WLS",
    // WW, FW, EW датчики
    "WW-HTL", "WW-TS", "FW-TS", "FW-FT", "EW-WL", "FW-WL"
  ],
  
  "Multiroom": [
    "FE-MP", "FE-IC.nfc", "LCP"
  ],
  
  "Беспроводное оборудование": [
    "DW-WL01", "DW-WL02", "DW-WLS", "DW-BC03"
  ]
};

// Функция определения подкатегории
function getSubCategory(article) {
  if (!article) return "Другое оборудование";
  
  for (const [subCat, products] of Object.entries(pdfCategories)) {
    for (const productCode of products) {
      if (article === productCode || 
          article.startsWith(productCode) || 
          productCode.startsWith(article)) {
        return subCat;
      }
    }
  }
  
  // Определяем по префиксу
  if (article.startsWith('METAFORSA')) return "Серия Metaforsa";
  if (article.startsWith('DE-') || article.startsWith('DW-') || article.startsWith('DE-IP')) return "DIN-реечное оборудование";
  if (article.startsWith('BW-')) return "Оборудование для подрозетных коробок";
  if (article.startsWith('CW-') || article.startsWith('WW-') || article.startsWith('FW-') || article.startsWith('EW-')) return "Датчики";
  if (article.startsWith('FE-') || article.startsWith('LCP')) return "Multiroom";
  if (article.startsWith('DW-WL')) return "Беспроводное оборудование";
  
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
console.log('Структура категории Larnitech (7 подкатегорий как в PDF):');
console.log('=' .repeat(60));

const sortedCategories = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
sortedCategories.forEach(([cat, count], index) => {
  console.log(`${index + 1}. ${cat}: ${count} товаров`);
});

console.log('=' .repeat(60));
console.log(`\nВсего: ${products.length} товаров в ${sortedCategories.length} подкатегориях`);
console.log('\nСоответствие разделам PDF каталога:');
console.log('  1. Серия Metaforsa = Metaforsa комплекты');
console.log('  2. DIN-реечное оборудование = DE-*, DW-* (кроме WL)');
console.log('  3. Оборудование для подрозетных коробок = BW-*');
console.log('  4. Датчики = CW-*, WW-*, FW-*, EW-*');
console.log('  5. Multiroom = FE-*, LCP');
console.log('  6. Беспроводное оборудование = DW-WL*');

db.close();
