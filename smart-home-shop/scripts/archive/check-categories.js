#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/shop.db');
const db = new Database(dbPath);

// Check all categories and their subcategories
const categories = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();

for (const cat of categories) {
  console.log(`\n📂 ${cat.category}:`);
  
  const subCats = db.prepare('SELECT group_name, COUNT(*) as cnt FROM products WHERE category = ? GROUP BY group_name ORDER BY group_name').all(cat.category);
  
  for (const sub of subCats) {
    console.log(`   - ${sub.group_name}: ${sub.cnt} товаров`);
  }
}

db.close();
