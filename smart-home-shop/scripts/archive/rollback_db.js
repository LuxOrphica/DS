const Database = require('better-sqlite3');
const path = require('path');

console.log('Откат изменений в БД...\n');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

try {
  // Проверяем есть ли таблица categories
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='categories'
  `).get();
  
  if (tableExists) {
    db.prepare('DROP TABLE IF EXISTS categories').run();
    console.log('✓ Удалена таблица categories');
  } else {
    console.log('- Таблица categories не найдена');
  }
  
  // Проверяем есть ли поле is_extra
  try {
    db.prepare('SELECT is_extra FROM products LIMIT 1').get();
    // Если поле есть, удаляем его
    db.prepare('ALTER TABLE products DROP COLUMN is_extra').run();
    console.log('✓ Удалено поле is_extra');
  } catch (err) {
    console.log('- Поле is_extra не найдено');
  }
  
} catch (error) {
  console.log(`✗ Ошибка: ${error.message}`);
}

db.close();
console.log('\n✅ Откат БД завершен');
