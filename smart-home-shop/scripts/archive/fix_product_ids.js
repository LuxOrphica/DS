const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Исправляем ID товаров...');

// Получаем все товары
const products = db.prepare('SELECT rowid, article, name FROM products').all();
console.log(`Найдено товаров: ${products.length}`);

// Обновляем каждый товар
products.forEach(product => {
  let newId;
  
  // Используем article если есть, иначе генерируем из name
  if (product.article) {
    newId = product.article;
  } else {
    // Генерируем ID из name
    newId = product.name
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  // Обновляем товар
  const result = db.prepare('UPDATE products SET id = ? WHERE rowid = ?').run(newId, product.rowid);
  
  console.log(`Товар "${product.name}" -> ID: ${newId} (изменено: ${result.changes})`);
});

console.log('Готово!');

// Проверяем результат
const withIds = db.prepare('SELECT COUNT(*) as count FROM products WHERE id IS NOT NULL').get();
console.log(`Товаров с ID теперь: ${withIds.count}`);

db.close();
