const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

// Структура подкатегорий Larnitech на основе их каталога
const larnitechCategories = {
  "DE-MG": "Системные устройства",
  "DE-MG-P": "Системные устройства",
  "DE-LC02": "Диммеры",
  "DE-LC04": "Диммеры",
  "DE-LC07": "Диммеры",
  "DE-LS02": "Реле",
  "DE-LS04": "Реле",
  "DE-LS06": "Реле",
  "DE-LC-DMX": "Светодиодные контроллеры",
  "DE-LC-DALI": "Светодиодные контроллеры",
  "DW-LS01": "Сенсоры",
  "DW-LS02": "Сенсоры",
  "DW-LS03": "Контроль протечек",
  "DW-LS04": "Сенсоры",
  "DW-LS05": "Сенсоры",
  "DE-TRV": "Управление климатом",
  "DE-TRV-US": "Управление климатом",
  "METAFORSA": "Metaforsa",
  "DW-LS06": "Панели управления",
  "DW-PANEL": "Панели управления",
  "DE-GW-KNX": "KNX оборудование",
  "DW-WL01": "Беспроводное оборудование",
  "DW-WL02": "Беспроводное оборудование",
  "DE-IP-CAM": "IP устройства"
};

console.log('Обновление подкатегорий товаров Larnitech...\n');

// Получаем все товары Larnitech
const products = db.prepare(`
  SELECT id, article, name, group_name FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech'
`).all();

console.log(`Найдено ${products.length} товаров Larnitech`);

let updated = 0;

// Обновляем каждый товар
for (const product of products) {
  const article = product.article || '';
  const id = product.id || '';
  
  // Определяем подкатегорию по артикулу
  let subCategory = "Другое оборудование";
  
  for (const [prefix, category] of Object.entries(larnitechCategories)) {
    if (article.startsWith(prefix) || id.startsWith(prefix)) {
      subCategory = category;
      break;
    }
  }
  
  // Обновляем в БД
  try {
    const result = db.prepare(`
      UPDATE products SET group_name = ? WHERE id = ?
    `).run(subCategory, id);
    
    if (result.changes > 0) {
      updated++;
      console.log(`✓ ${article || id} → ${subCategory}`);
    }
  } catch (err) {
    console.error(`✗ ${article || id}: ${err.message}`);
  }
}

console.log(`\nОбновлено ${updated} товаров`);

// Проверяем результат
const check = db.prepare(`
  SELECT group_name, COUNT(*) as count 
  FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech'
  GROUP BY group_name
`).all();

console.log('\nСтруктура подкатегорий:');
check.forEach(row => {
  console.log(`  - ${row.group_name}: ${row.count} товаров`);
});

db.close();
