const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

console.log('Создание таблицы categories...\n');

// Создаем таблицу categories
db.prepare(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    parent_id TEXT,
    order_index INTEGER DEFAULT 0,
    image TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE CASCADE
  )
`).run();

console.log('✅ Таблица categories создана');

// Создаем индексы
db.prepare(`CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(order_index)`).run();

console.log('✅ Индексы созданы');

db.close();
