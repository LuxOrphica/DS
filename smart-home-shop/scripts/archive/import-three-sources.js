#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/shop.db');

// Load sources
const sources = [
  require('./source-hite-pro.js'),
  require('./source-wirenboard.js'),
  require('./source-loxone.js'),
];

async function importCatalog() {
  console.log('Importing catalog from 3 main sources...\n');

  const db = new Database(dbPath);

  // Clear existing products
  const deleted = db.prepare('DELETE FROM products').run();
  console.log(`Cleared ${deleted.changes} existing products\n`);

  // Prepare insert statement
  const insert = db.prepare(`
    INSERT INTO products (
      article, name, price, description, specs, category, group_name, 
      brand, image, source_url, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  let totalProducts = 0;

  for (const source of sources) {
    console.log(`📦 Importing from: ${source.name}`);
    console.log(`   Description: ${source.description}`);

    try {
      const products = await source.fetchProducts();
      console.log(`   Found ${products.length} products\n`);

      for (const prod of products) {
        insert.run(
          prod.article || null,
          prod.name,
          prod.price || 0,
          prod.description || null,
          prod.specs ? JSON.stringify({ spec: prod.specs }) : null,
          prod.category,
          prod.group_name,
          prod.brand,
          prod.image,
          prod.source_url
        );
        totalProducts++;
      }

      // Show categories for this source
      const cats = [...new Set(products.map(p => p.group_name))];
      console.log(`   Categories: ${cats.join(', ')}`);
      console.log(`   Status: ✅ Imported\n`);

    } catch (err) {
      console.error(`   ❌ Error importing from ${source.name}:`, err.message);
    }
  }

  // Verify
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT category) as categories,
      COUNT(DISTINCT group_name) as groups,
      COUNT(DISTINCT brand) as brands
    FROM products
  `).get();

  console.log('\n📊 IMPORT SUMMARY');
  console.log('================');
  console.log(`Total products imported: ${stats.total}`);
  console.log(`Categories: ${stats.categories}`);
  console.log(`Subcategories: ${stats.groups}`);
  console.log(`Brands: ${stats.brands}`);

  // Show category breakdown
  console.log('\n📂 CATEGORY BREAKDOWN');
  console.log('====================');
  const catStats = db.prepare(`
    SELECT category, COUNT(*) as count, COUNT(DISTINCT group_name) as groups
    FROM products
    GROUP BY category
    ORDER BY count DESC
  `).all();

  for (const cat of catStats) {
    console.log(`${cat.category}: ${cat.count} products (${cat.groups} sub-categories)`);
  }

  // List all subcategories per main category
  console.log('\n📋 SUBCATEGORIES');
  console.log('================');
  const subCats = db.prepare(`
    SELECT DISTINCT category, group_name
    FROM products
    ORDER BY category, group_name
  `).all();

  let currentCat = null;
  for (const item of subCats) {
    if (item.category !== currentCat) {
      currentCat = item.category;
      console.log(`\n${currentCat}:`);
    }
    console.log(`  - ${item.group_name}`);
  }

  db.close();
  console.log('\n✅ CATALOG IMPORT COMPLETE');
  console.log('Ready to browse at: http://localhost:3030/#/catalog');
}

importCatalog().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
