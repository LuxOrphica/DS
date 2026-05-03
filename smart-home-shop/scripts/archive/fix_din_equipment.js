const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Исправление категории "DIN-реечное оборудование"...\n');

// Товары из PDF оглавления для DIN-реечного оборудования (страницы 18-37)
const dinEquipment = [
  "DE-MG-plus", "DE-MG", "DE-GW",
  "DW-LC18", "DW-LC10", "DW-LC07",
  "DW-DM06", "DW-DM04", "DW-DM02",
  "DW-HC10", "DW-RGB03", "DW-BC03",
  "DW-WL02", "DW-SW16", "DW-RS485",
  "DW-RS232", "DW-UART", "DW-010",
  "DW-DALI2"
];

// Перемещаем товары в правильные категории
const relocations = {
  "DE-TRV": "Климат-контроль",
  "DW-HTO7": "Датчики", 
  "DW-PANEL": "Панели и комплекты",
  "DW-WLS": "Беспроводное оборудование",
  "DW-METERS": "Интерфейсы и модули",
  "DE-LS": "Управление освещением",
  "DE-IP-CAM": "Системные устройства",
  "DE-GW-KNX": "Системные устройства"
};

const category = "Оборудование УД сделано в Германии, Larnitech";

// 1. Перемещаем лишние товары из DIN-реечного оборудования
let moved = 0;
for (const [article, targetCategory] of Object.entries(relocations)) {
  try {
    const result = db.prepare(`
      UPDATE products 
      SET group_name = ? 
      WHERE article = ? AND category = ?
    `).run(targetCategory, article, category);
    
    if (result.changes > 0) {
      moved++;
      console.log(`✓ Перемещен: ${article} -> ${targetCategory}`);
    }
  } catch (err) {
    console.error(`✗ ${article}: ${err.message}`);
  }
}

// 2. Проверяем, что все товары из списка PDF в правильной категории
let verified = 0;
for (const article of dinEquipment) {
  try {
    const result = db.prepare(`
      UPDATE products 
      SET group_name = 'DIN-реечное оборудование' 
      WHERE article = ? AND category = ?
    `).run(article, category);
    
    if (result.changes > 0) {
      verified++;
      console.log(`✓ Проверен: ${article} -> DIN-реечное оборудование`);
    }
  } catch (err) {
    console.error(`✗ ${article}: ${err.message}`);
  }
}

console.log(`\n✅ Перемещено: ${moved} товаров`);
console.log(`✅ Проверено: ${verified} товаров`);

// Проверяем итоговую структуру
const check = db.prepare(`
  SELECT article, name FROM products 
  WHERE category = ? AND group_name = 'DIN-реечное оборудование'
  ORDER BY article
`).all(category);

console.log('\nТовары в категории "DIN-реечное оборудование" (из PDF):');
console.log('=' .repeat(60));
check.forEach(p => {
  console.log(`  ${p.article} - ${p.name}`);
});

console.log(`\nВсего: ${check.length} товаров (ожидается: ${dinEquipment.length})`);

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
