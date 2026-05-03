const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

// Детальные характеристики по типам товаров (как в PDF)
const detailedSpecs = {
  'DE-MG': {
    specs: JSON.stringify({
      "Количество релейных каналов": "10",
      "Количество димируемых каналов": "4",
      "Количество ШИМ-выходов": "до 8 (совмещены со входами)",
      "Дискретные входы": "24",
      "Цифровые входы": "4",
      "Входное напряжение": "0-250 V",
      "Тип напряжения": "AC/DC",
      "Макс. нагрузка на канал": "16А",
      "Макс. нагрузка на димируемый канал": "0.5А (110W at 220V)",
      "Питание": "23...27.5 V DC",
      "Максимальный ток (24V)": "0.5 А",
      "Тип шины": "CAN",
      "Макс. длина шины CAN": "800 м (витая пара 5 cat)",
      "Тип монтажа": "DIN-рейка (EN 60715)",
      "Материал корпуса": "ABS",
      "Класс защиты": "IP40",
      "Температурный диапазон": "-10...+50 °C",
      "Габариты": "9.5U, 162x90x58 мм",
      "Масса": "300 г"
    }),
    functions: JSON.stringify([
      "10 универсальных выходов поддерживают: освещение, NC/NO клапаны отопления, шторы, 1 и 2-полярные привода ворот, 1 и 2-полярные клапаны, NC/NO замки, фанкойлы",
      "4 диммируемых канала",
      "24 дискретных входа с поддержкой: кнопок, переключателей, герконов, датчиков утечки, датчиков движения",
      "8 входов конвертируются в ШИМ выходы для LED/RGB управления",
      "4 цифровых входа для 8 датчиков температуры",
      "Порт расширения CAN",
      "Контакты реле с покрытием AgSnO2 нормированы на пусковой ток 80А",
      "Облачное/локальное подключение и управление всеми системами дома",
      "Голосовое управление (Алиса, Alexa, Google Home, Siri подключается дополнительно)"
    ])
  },
  'DE-GW': {
    specs: JSON.stringify({
      "Интерфейсы": "Ethernet, CAN, 1-Wire",
      "Питание": "24V DC",
      "Потребление": "3W",
      "Тип монтажа": "DIN-рейка",
      "Габариты": "6 модулей",
      "Класс защиты": "IP20"
    }),
    functions: JSON.stringify([
      "Подключение к облаку Larnitech",
      "Удаленное управление через приложение",
      "IP-интеграция с внешними системами",
      "Сохранение и накопление системных данных"
    ])
  },
  'DW-LC07': {
    specs: JSON.stringify({
      "Мощность": "200W",
      "Напряжение": "12-48V DC",
      "Каналов": "1",
      "Тип": "LED диммер",
      "Технология": "MOSFET",
      "Монтаж": "DIN-рейка 2 модуля"
    }),
    functions: JSON.stringify([
      "Плавное регулирование яркости",
      "Без мерцания",
      "Совместим с LED лентами",
      "Управление через CAN шину"
    ])
  },
  'DW-LS01': {
    specs: JSON.stringify({
      "Датчики": "движение, освещенность, температура",
      "Диапазон обнаружения": "до 8м",
      "Угол обзора": "120°",
      "Питание": "12-24V",
      "Интерфейс": "1-Wire",
      "Монтаж": "встраиваемый/накладной"
    }),
    functions: JSON.stringify([
      "Обнаружение движения",
      "Измерение освещенности",
      "Измерение температуры",
      "Интеграция в сценарии"
    ])
  },
  'DW-LS02': {
    specs: JSON.stringify({
      "Диапазон температуры": "-40...+60°C",
      "Точность температуры": "±0.5°C",
      "Точность влажности": "±3%",
      "Протокол": "1-Wire",
      "Питание": "паразитное/внешнее 3-5V"
    }),
    functions: JSON.stringify([
      "Точное измерение температуры",
      "Измерение относительной влажности",
      "Мониторинг климата",
      "Управление отоплением/кондиционированием"
    ])
  },
  'DW-LS03': {
    specs: JSON.stringify({
      "Тип питания": "батарея 3V CR2032",
      "Срок работы": "до 5 лет",
      "Радиосвязь": "868 МГц",
      "Дальность": "до 100м",
      "Класс защиты": "IP65"
    }),
    functions: JSON.stringify([
      "Обнаружение протечки воды",
      "Беспроводная передача сигнала",
      "Автономное питание",
      "Интеграция с системой безопасности"
    ])
  },
  'DE-TRV': {
    specs: JSON.stringify({
      "Питание": "24V AC/DC",
      "Усилие": "100Н",
      "Шум": "26дБ",
      "Время срабатывания": "2-5 мин",
      "Тип": "электропривод",
      "Применение": "термостатический клапан"
    }),
    functions: JSON.stringify([
      "Автоматическое регулирование температуры",
      "Бесшумная работа",
      "Интеграция с системой климат-контроля",
      "Управление через приложение"
    ])
  },
  'METAFORSA': {
    specs: JSON.stringify({
      "Комплектация": "основной блок, датчики, блок питания",
      "Каналов": "10 релейных + 4 диммируемых",
      "Входы": "24 дискретных + 4 цифровых",
      "Подключение": "облачное/локальное",
      "Голосовое управление": "Алиса, Alexa, Google Home"
    }),
    functions: JSON.stringify([
      "Готовый комплект для квартиры",
      "Управление светом",
      "Управление климатом",
      "Сценарии автоматизации",
      "Удаленный доступ"
    ])
  }
};

console.log('Обновление детальных характеристик товаров Larnitech...\n');

const products = db.prepare(`
  SELECT id, article, name FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech'
`).all();

let updated = 0;

for (const product of products) {
  const article = product.article || product.id;
  
  // Ищем характеристики по артикулу
  let specsData = null;
  let functionsData = null;
  
  for (const [key, data] of Object.entries(detailedSpecs)) {
    if (article.includes(key) || key.includes(article)) {
      specsData = data.specs;
      functionsData = data.functions;
      break;
    }
  }
  
  if (specsData) {
    try {
      // Обновляем specs и добавляем функции в attributes
      const result = db.prepare(`
        UPDATE products 
        SET specs = ?, attributes_json = ?, 
            description = COALESCE(description, '') || '\n\nФункции: ' || ?
        WHERE id = ?
      `).run(specsData, functionsData, functionsData, product.id);
      
      if (result.changes > 0) {
        updated++;
        console.log(`✓ ${article} - обновлено`);
      }
    } catch (err) {
      console.error(`✗ ${article}: ${err.message}`);
    }
  } else {
    // Если не нашли точное совпадение, добавляем базовые характеристики
    const basicSpecs = JSON.stringify({
      "Производитель": "Larnitech",
      "Страна": "Германия",
      "Гарантия": "2 года",
      "Артикул": article
    });
    
    try {
      db.prepare(`UPDATE products SET specs = ? WHERE id = ?`).run(basicSpecs, product.id);
    } catch (err) {
      console.error(`✗ ${article}: ${err.message}`);
    }
  }
}

console.log(`\n✅ Обновлено ${updated} товаров`);

// Проверяем результат
const check = db.prepare(`
  SELECT article, specs FROM products 
  WHERE category = 'Оборудование УД сделано в Германии, Larnitech' AND specs IS NOT NULL
  LIMIT 3
`).all();

console.log('\nПримеры обновленных товаров:');
check.forEach(p => {
  const specs = JSON.parse(p.specs || '{}');
  console.log(`\n${p.article}:`);
  console.log('  Характеристик:', Object.keys(specs).length);
});

db.close();
