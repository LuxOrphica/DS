#!/usr/bin/env node
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/shop.db');
const jsonPath = path.join(__dirname, '../data/products.json');

console.log('Restoring original database from products.json...\n');

// Read products.json
const productsJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
console.log(`Loaded ${productsJson.length} products from products.json`);

// Open database
const db = new Database(dbPath);

// Clear all products
const deleted = db.prepare('DELETE FROM products').run();
console.log(`Deleted ${deleted.changes} old records from DB`);

// Prepare insert statement
const insert = db.prepare(`
  INSERT INTO products (
    article, name, price, description, specs, category, group_name, 
    brand, image, gallery_json, source_url, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

// Insert products from JSON
let inserted = 0;
for (const prod of productsJson) {
  insert.run(
    prod.article || null,
    prod.name,
    prod.price,
    prod.description || null,
    prod.specs ? JSON.stringify(prod.specs) : null,
    prod.category || null,
    prod.group || null,
    prod.brand || null,
    prod.image || null,
    null, // gallery_json
    null  // source_url
  );
  inserted++;
}

console.log(`\nInserted ${inserted} products from products.json`);

// Verify
const count = db.prepare('SELECT COUNT(*) as c FROM products').get();
console.log(`Total products in DB: ${count.c}`);

// Show unique categories
const categories = db.prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL').all();
console.log(`\nCategories (${categories.length}):`);
categories.forEach(c => console.log(`  - ${c.category}`));

db.close();
console.log('\n✓ Database restored to original state');
