#!/usr/bin/env node
/**
 * Очистка старых данных и импорт новой структуры
 */

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "shop.db");

console.log("\n🧹 Очистка старых данных...\n");

// Удаляем файлы БД
const filesToDelete = [
  dbPath,
  `${dbPath}-shm`,
  `${dbPath}-wal`
];

for (const file of filesToDelete) {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`✅ Удален: ${path.basename(file)}`);
    } catch (err) {
      console.error(`❌ Ошибка при удалении ${path.basename(file)}:`, err.message);
    }
  }
}

// Очищаем директорию import/
const importDir = path.join(dataDir, "import");
if (fs.existsSync(importDir)) {
  try {
    const files = fs.readdirSync(importDir);
    files.forEach((file) => {
      fs.unlinkSync(path.join(importDir, file));
    });
    console.log(`✅ Очищена директория: import/`);
  } catch (err) {
    console.error(`⚠️  Ошибка при очистке import/:`, err.message);
  }
}

console.log(`\n✨ Очистка завершена!\n`);
console.log("Теперь запустите: npm run import:new-structure\n");
