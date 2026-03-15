#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/shop.db');
const db = new Database(dbPath);

console.log('Updating product groups to new structure...\n');

// Update Loxone products to new group structure
const updates = [
  // Модули управления (объединяем Освещение и Затенение)
  { name: 'Модуль управления светом Loxone', newGroup: 'Модули управления' },
  { name: 'Модуль управления жалюзи Loxone', newGroup: 'Модули управления' },
  
  // Датчики (из Безопасность)
  { name: 'Датчик движения Loxone', newGroup: 'Датчики' },
  { name: 'Датчик протечки Loxone', newGroup: 'Датчики' },
  
  // Остальные категории (переименовываются)
  { name: 'Audio Server Loxone', newGroup: 'Аудиосервер' },
  { name: 'Счетчик энергии Loxone', newGroup: 'Счетчик энергии' },
  { name: 'Термостат Loxone', newGroup: 'Термостат' },
  { name: 'Smart Door Lock Loxone', newGroup: 'Замок' },
];

for (const item of updates) {
  const result = db.prepare('UPDATE products SET group_name = ? WHERE name = ?').run(item.newGroup, item.name);
  console.log(`Updated: "${item.name}" → "${item.newGroup}" (${result.changes} rows)`);
}

// Also update Gateway products (шлюзы)
const gateways = [
  { name: 'Gateway (шлюз)', newGroup: 'Шлюзы', category: 'Беспроводное оборудование УД' },
  { name: 'DIN-Gateway', newGroup: 'Шлюзы', category: 'Беспроводное оборудование УД' },
];

for (const item of gateways) {
  const result = db.prepare('UPDATE products SET group_name = ? WHERE name = ? AND category = ?').run(item.newGroup, item.name, item.category);
  console.log(`Updated: "${item.name}" → "${item.newGroup}" (${result.changes} rows)`);
}

// Verify changes
console.log('\n📂 Updated structure:\n');
const categories = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();

for (const cat of categories) {
  console.log(`${cat.category}:`);
  const subCats = db.prepare('SELECT DISTINCT subcategory, COUNT(*) as cnt FROM products WHERE category = ? GROUP BY subcategory ORDER BY subcategory').all(cat.category);
  for (const sub of subCats) {
    console.log(`  - ${sub.subcategory}: ${sub.cnt} товаров`);
  }
  console.log('');
}

db.close();
console.log('✅ Update complete');
