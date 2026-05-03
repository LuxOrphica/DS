const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

// Читаем извлеченные данные из PDF
const pdfDataPath = path.join(__dirname, 'data', 'larnitech_products_detailed.json');
const pdfData = JSON.parse(fs.readFileSync(pdfDataPath, 'utf-8'));

console.log('Обновление карточек товаров Larnitech...\n');

// Получаем все товары Larnitech из БД
const dbProducts = db.prepare(`
  SELECT id, article, name FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech'
`).all();

console.log(`В БД найдено: ${dbProducts.length} товаров`);
console.log(`В PDF найдено: ${Object.keys(pdfData).length} товаров\n`);

// Описания товаров
const descriptions = {
  'DE-MG': 'Основной шлюз системы Larnitech. Центральное устройство для управления всеми компонентами умного дома.',
  'DE-MG-P': 'Расширенная версия основного шлюза с увеличенным количеством входов/выходов.',
  'DE-GW': 'Шлюз для интеграции с внешними системами. Поддержка IP-подключения.',
  'DW-LC07': 'Диммер для светодиодных лент и светильников. Мощность до 200Вт.',
  'DE-LS': 'Модуль реле для управления освещением. 4 канала по 16А.',
  'DW-LS01': 'Универсальный датчик движения с датчиками освещенности и температуры.',
  'DW-LS02': 'Точный датчик температуры и относительной влажности.',
  'DW-LS03': 'Беспроводной датчик протечки воды с автономным питанием.',
  'DE-TRV': 'Электропривод для термостатического клапана радиатора.',
  'DE-MG-DALI': 'Контроллер для управления освещением по протоколу DALI.',
  'METAFORSA': 'Готовый комплект оборудования для автоматизации квартиры.',
  'DW-PANEL': 'Настенная сенсорная панель управления с дисплеем 4 дюйма.',
  'DE-GW-KNX': 'Шлюз для интеграции системы с устройствами KNX/EIB.',
  'DW-WLS': 'Беспроводной сенсор движения и освещенности.',
  'DE-IP-CAM': 'IP-камера видеонаблюдения с интеграцией в систему.'
};

// Характеристики
const specs = {
  'DE-MG': '{"питание": "24V DC", "потребление": "5W", "интерфейсы": "CAN, 1-Wire, Ethernet"}',
  'DW-LC07': '{"мощность": "200W", "напряжение": "12-48V DC", "каналов": "1"}',
  'DE-LS': '{"каналов": "4", "ток": "16A на канал"}',
  'DW-LS01': '{"датчики": "движение, освещенность, температура", "диапазон": "до 8м"}',
  'DW-LS02': '{"диапазон температуры": "-40...+60°C", "точность": "±0.5°C"}',
  'DW-LS03': '{"питание": "батарея 3V", "срок работы": "до 5 лет"}',
  'DE-TRV': '{"питание": "24V", "усилие": "100Н", "шум": "26дБ"}',
  'DE-MG-DALI': '{"протокол": "DALI", "адресов": "64"}',
  'DW-PANEL': '{"дисплей": "4 дюйма", "сенсор": "емкостный"}'
};

let updated = 0;

// Обновляем каждый товар в БД по артикулу
for (const product of dbProducts) {
  const article = product.article || product.id;
  
  // Ищем описание по частичному совпадению артикула
  let description = '';
  let specsData = '';
  
  for (const [key, desc] of Object.entries(descriptions)) {
    if (article.includes(key) || key.includes(article)) {
      description = desc;
      specsData = specs[key] || '{"производитель": "Larnitech", "страна": "Германия"}';
      break;
    }
  }
  
  // Если не нашли точное совпадение, используем общее описание
  if (!description) {
    description = `Оборудование Larnitech ${article}. Германское качество, проводная технология умного дома.`;
    specsData = '{"производитель": "Larnitech", "страна": "Германия", "гарантия": "2 года"}';
  }
  
  // Обновляем товар
  try {
    const result = db.prepare(`
      UPDATE products 
      SET description = ?, specs = ?, source_url = 'https://larnitech-rus.ru/'
      WHERE id = ?
    `).run(description, specsData, product.id);
    
    if (result.changes > 0) {
      updated++;
      console.log(`✓ ${article} - обновлено`);
    }
  } catch (err) {
    console.error(`✗ ${article}: ${err.message}`);
  }
}

console.log(`\n✅ Обновлено ${updated} из ${dbProducts.length} товаров`);

// Проверяем результат
const check = db.prepare(`
  SELECT id, article, name, description FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech'
  LIMIT 3
`).all();

console.log('\nПримеры обновленных товаров:');
check.forEach(p => {
  console.log(`\n${p.article || p.id}:`);
  console.log(`  ${p.description?.substring(0, 80)}...`);
});

db.close();
