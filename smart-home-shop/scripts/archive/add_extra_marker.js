const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Добавление поля для отметки лишних товаров...\n');

// 1. Добавляем колонку is_extra если ее нет
try {
  db.prepare(`
    ALTER TABLE products ADD COLUMN is_extra INTEGER DEFAULT 0
  `).run();
  console.log('✓ Колонка is_extra добавлена');
} catch (err) {
  console.log('ℹ Колонка is_extra уже существует');
}

// 2. Помечаем лишние товары в DIN-реечном оборудовании
const extraInDIN = [
  'DE-GW-KNX', 'DE-IP-CAM', 'DE-LS', 'DE-MG-DALI', 'DE-TRV',
  'DW-DALI', 'DW-METERS', 'DW-PANEL', 'DW-R'
];

const category = "Оборудование УД сделано в Германии, Larnitech";

let marked = 0;
for (const article of extraInDIN) {
  try {
    const result = db.prepare(`
      UPDATE products 
      SET is_extra = 1 
      WHERE article = ? AND category = ?
    `).run(article, category);
    
    if (result.changes > 0) {
      marked++;
      console.log(`✓ Помечен как лишний: ${article}`);
    }
  } catch (err) {
    console.error(`✗ ${article}: ${err.message}`);
  }
}

console.log(`\n✅ Помечено: ${marked} лишних товаров`);

// 3. Проверяем результат
const check = db.prepare(`
  SELECT article, name, is_extra FROM products 
  WHERE category = ? AND group_name = 'DIN-реечное оборудование'
  ORDER BY is_extra DESC, article
`).all(category);

console.log('\nТовары в DIN-реечном оборудовании:');
console.log('=' .repeat(60));
check.forEach(p => {
  const status = p.is_extra ? '⚠ ЛИШНИЙ' : '✅';
  console.log(`  ${status} ${p.article} - ${p.name}`);
});

// 4. Общая статистика
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    SUM(is_extra) as extra_count,
    COUNT(*) - SUM(is_extra) as valid_count
  FROM products 
  WHERE category = ?
`).get(category);

console.log('\nСтатистика по категории:');
console.log(`  Всего товаров: ${stats.total}`);
console.log(`  Лишних товаров: ${stats.extra_count}`);
console.log(`  Валидных товаров: ${stats.valid_count}`);

db.close();
