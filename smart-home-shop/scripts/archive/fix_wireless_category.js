const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Исправление категории Беспроводное оборудование...\n');

const category = "Оборудование УД сделано в Германии, Larnitech";

// 1. Перемещаем все DW-WL* в Беспроводное оборудование
const res1 = db.prepare(`
  UPDATE products 
  SET group_name = 'Беспроводное оборудование' 
  WHERE category = ? AND article LIKE 'DW-WL%'
`).run(category);

console.log(`✓ Перемещено DW-WL*: ${res1.changes} товаров`);

// 2. Перемещаем DE-GW-KNX и DE-IP-CAM обратно в DIN-реечное оборудование
const res2 = db.prepare(`
  UPDATE products 
  SET group_name = 'DIN-реечное оборудование' 
  WHERE category = ? AND article IN ('DE-GW-KNX', 'DE-IP-CAM')
`).run(category);

console.log(`✓ Перемещено DE-*: ${res2.changes} товаров`);

// 3. Проверяем итоговое распределение
const check = db.prepare(`
  SELECT article, name, group_name 
  FROM products 
  WHERE category = ? AND (article LIKE 'DW-WL%' OR article = 'BT-CAN' OR article = 'DE-GW-KNX' OR article = 'DE-IP-CAM')
  ORDER BY group_name, article
`).all(category);

console.log('\nИтоговое распределение:');
console.log('=' .repeat(50));
check.forEach(p => {
  console.log(`${p.article} -> ${p.group_name}`);
});

// 4. Проверяем итоговую структуру всех категорий
const finalStructure = db.prepare(`
  SELECT group_name, COUNT(*) as cnt FROM products 
  WHERE category = ? 
  GROUP BY group_name 
  ORDER BY cnt DESC
`).all(category);

console.log('\nИтоговая структура всех категорий:');
console.log('=' .repeat(50));
finalStructure.forEach((row, i) => {
  console.log(`${i + 1}. ${row.group_name}: ${row.cnt} товаров`);
});

// 5. Проверяем что в Беспроводном оборудовании
const wireless = db.prepare(`
  SELECT article, name FROM products 
  WHERE category = ? AND group_name = 'Беспроводное оборудование'
  ORDER BY article
`).all(category);

console.log('\nТовары в категории "Беспроводное оборудование":');
console.log('=' .repeat(50));
wireless.forEach(p => {
  console.log(`  ${p.article} - ${p.name}`);
});

db.close();
