#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/shop.db');
const db = new Database(dbPath);

// Products to delete
const toDelete = ['Slider', 'Антенны', 'Беспроводной умный дом'];

console.log('Deleting specified products...\n');

for (const productName of toDelete) {
  const result = db.prepare('DELETE FROM products WHERE name = ?').run(productName);
  console.log(`Deleted "${productName}": ${result.changes} record(s)`);
}

// Verify
const remaining = db.prepare('SELECT COUNT(*) as count FROM products').get();
console.log(`\nTotal products remaining: ${remaining.count}`);

// Show breakdown
const breakdown = db.prepare(`
  SELECT category, COUNT(*) as count
  FROM products
  GROUP BY category
  ORDER BY category
`).all();

console.log('\nProducts by category:');
for (const cat of breakdown) {
  console.log(`  ${cat.category}: ${cat.count}`);
}

db.close();
console.log('\n✅ Deletion complete');
