const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Объединение подкатегорий в 6 основных категорий PDF...\n');

// 6 основных категорий по PDF каталогу
const mainCategories = [
  "Серия Metaforsa",
  "DIN-реечное оборудование", 
  "Оборудование для подрозетных коробок",
  "Датчики",
  "Multiroom",
  "Беспроводное оборудование"
];

// Распределение товаров из лишних подкатегорий в основные
const relocations = {
  "DE-LS": "DIN-реечное оборудование",  // Реле освещения -> DIN-реечное
  "DE-TRV": "DIN-реечное оборудование", // Климат-контроль -> DIN-реечное  
  "DW-PANEL": "DIN-реечное оборудование", // Панели -> DIN-реечное
  "DW-METERS": "DIN-реечное оборудование" // Интерфейсы -> DIN-реечное
};

const category = "Оборудование УД сделано в Германии, Larnitech";

// Перемещаем товары из лишних подкатегорий в основные
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

// Удаляем пустые подкатегории (если есть)
const emptyCategories = db.prepare(`
  SELECT DISTINCT group_name FROM products 
  WHERE category = ? AND group_name NOT IN (${mainCategories.map(() => '?').join(',')})
`).all(category, ...mainCategories);

console.log(`\n✅ Перемещено: ${moved} товаров`);

// Проверяем итоговую структуру
const finalStructure = db.prepare(`
  SELECT group_name, COUNT(*) as cnt FROM products 
  WHERE category = ? 
  GROUP BY group_name 
  ORDER BY cnt DESC
`).all(category);

console.log('\nИтоговая структура (6 категорий по PDF):');
console.log('=' .repeat(50));
finalStructure.forEach((row, i) => {
  console.log(`${i + 1}. ${row.group_name}: ${row.cnt} товаров`);
});

console.log('=' .repeat(50));
console.log(`\nВсего подкатегорий: ${finalStructure.length}`);
console.log(`Ожидается: 6 категорий`);

// Проверяем, что все основные категории присутствуют
const presentCategories = finalStructure.map(r => r.group_name);
const missingCategories = mainCategories.filter(cat => !presentCategories.includes(cat));

if (missingCategories.length > 0) {
  console.log(`\n⚠ Отсутствуют категории: ${missingCategories.join(', ')}`);
} else {
  console.log('\n✅ Все 6 основных категорий присутствуют!');
}

db.close();
