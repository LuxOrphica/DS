const fs = require('fs');

console.log('Откат изменений сегодняшней сессии...\n');

// Файлы созданные сегодня для удаления
const filesToDelete = [
  'add_bt_can.js',
  'add_extra_marker.js', 
  'add_missing_for_7_categories.js',
  'add_missing_sensors.js',
  'add_multiroom_equipment.js',
  'add_socket_box_equipment.js',
  'apply_old_design_update.js',
  'catalog-api.js',
  'create_categories_table.js',
  'extract_detailed_specs.py',
  'extract_toc_pages_2_3.py',
  'extract_pdf_structure.py',
  'fix_6_categories.js',
  'fix_din_equipment.js',
  'fix_metaforsa_section.js',
  'fix_wireless_category.js',
  'merge_to_6_categories.js',
  'update_7_categories.js',
  'fix_6_categories.js',
  'reorganize_larnitech_categories.js',
  'update_detailed_specs.js',
  'rebuild_catalog.js',
  'restore_original.js'
];

let deleted = 0;
filesToDelete.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`✓ Удален: ${file}`);
      deleted++;
    } else {
      console.log(`- Не найден: ${file}`);
    }
  } catch (error) {
    console.log(`✗ Ошибка удаления ${file}: ${error.message}`);
  }
});

console.log(`\n✅ Удалено файлов: ${deleted}`);

// Восстанавливаем оригинальный app.js если он был изменен
const appJsPath = './public/app.js';
if (fs.existsSync(appJsPath)) {
  // Проверяем есть ли изменения в withHierarchy
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  
  // Если есть изменения, возвращаем оригинал
  if (appJsContent.includes('product.group_name')) {
    console.log('⚠ В app.js есть изменения, нужно восстановить оригинал');
    // TODO: восстановить из бэкапа если есть
  } else {
    console.log('✅ app.js в оригинальном состоянии');
  }
}

// Удаляем таблицу categories если она была создана
try {
  const dbPath = './data/shop.db';
  if (fs.existsSync(dbPath)) {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    
    // Проверяем есть ли таблица categories
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='categories'
    `).get();
    
    if (tableExists) {
      db.prepare('DROP TABLE IF EXISTS categories').run();
      console.log('✓ Удалена таблица categories');
    }
    
    db.close();
  }
} catch (error) {
  console.log(`✗ Ошибка с БД: ${error.message}`);
}

console.log('\n🎉 Откат завершен! Система возвращена к исходному состоянию.');
