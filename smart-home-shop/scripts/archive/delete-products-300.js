#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/shop.db');
const db = new Database(dbPath);

// Find products with price 300 (including floating point variations)
const rows = db.prepare('SELECT id, name, price FROM products WHERE price >= 299 AND price <= 301 ORDER BY name').all();

console.log('Products with price ~300:\n');
rows.forEach(r => {
  console.log(`ID ${r.id}: ${r.name} - ${r.price}р`);
});

console.log(`\nTotal: ${rows.length} products`);

if (rows.length > 0) {
  console.log('\nDeleting these products...');
  const result = db.prepare('DELETE FROM products WHERE price >= 299 AND price <= 301').run();
  console.log(`Deleted: ${result.changes}`);
  
  const remaining = db.prepare('SELECT COUNT(*) as c FROM products').get();
  console.log(`Remaining products: ${remaining.c}`);
}

db.close();
