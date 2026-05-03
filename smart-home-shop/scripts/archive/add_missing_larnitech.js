const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

const category = "Оборудование УД сделано в Германии, Larnitech";
const brand = "Larnitech";
const now = new Date().toISOString();

// Оставшиеся товары из PDF каталога
const missingProducts = [
  // Диммеры
  { id: "DW-DM04", article: "DW-DM04", name: "DW-DM04 - 4-канальный диммер", price: 14500, group: "Диммеры", description: "4-канальный диммер для LED лент с независимым управлением каждым каналом.", specs: '{"каналов": "4", "тип": "LED диммер", "управление": "независимое"}' },
  { id: "DW-DM06", article: "DW-DM06", name: "DW-DM06 - 6-канальный диммер", price: 18500, group: "Диммеры", description: "6-канальный профессиональный диммер для управления освещением.", specs: '{"каналов": "6", "тип": "LED диммер", "применение": "профессиональное"}' },
  { id: "DW-DM02", article: "DW-DM02", name: "DW-DM02 - 2-канальный диммер", price: 11500, group: "Диммеры", description: "2-канальный диммер для светодиодных лент.", specs: '{"каналов": "2", "тип": "LED диммер"}' },
  
  // DALI контроллеры
  { id: "DW-DALI2", article: "DW-DALI2", name: "DW-DALI2 - DALI2 контроллер", price: 16500, group: "Светодиодные контроллеры", description: "Контроллер с расширенной функциональностью DALI2.", specs: '{"протокол": "DALI2", "функции": "расширенные"}' },
  { id: "DW-DALI", article: "DW-DALI", name: "DW-DALI - DALI контроллер", price: 14500, group: "Светодиодные контроллеры", description: "Базовый DALI контроллер для управления освещением.", specs: '{"протокол": "DALI", "адресов": "64"}' },
  
  // LED контроллеры
  { id: "DW-LC10", article: "DW-LC10", name: "DW-LC10 - 10-канальный LED контроллер", price: 21500, group: "Светодиодные контроллеры", description: "10-канальный контроллер для профессионального управления LED освещением.", specs: '{"каналов": "10", "тип": "LED контроллер"}' },
  { id: "DW-LC18", article: "DW-LC18", name: "DW-LC18 - 18-канальный LED контроллер", price: 28500, group: "Светодиодные контроллеры", description: "18-канальный светодиодный контроллер для сложных инсталляций.", specs: '{"каналов": "18", "тип": "LED контроллер"}' },
  { id: "DW-RGB03", article: "DW-RGB03", name: "DW-RGB03 - RGB LED контроллер", price: 12500, group: "Светодиодные контроллеры", description: "Контроллер для RGB LED лент с поддержкой цветных сценариев.", specs: '{"тип": "RGB контроллер", "режимы": "цветные сценарии"}' },
  
  // Климат
  { id: "DW-HT07", article: "DW-HT07", name: "DW-HT07 - Датчик температуры/влажности", price: 8500, group: "Управление климатом", description: "Датчик температуры и влажности с дисплеем для визуального контроля.", specs: '{"датчики": "температура, влажность", "дисплей": "есть"}' },
  { id: "DW-HT05", article: "DW-HT05", name: "DW-HT05 - Комнатный датчик", price: 7200, group: "Управление климатом", description: "Компактный датчик температуры и влажности для помещений.", specs: '{"датчики": "температура, влажность", "тип": "комнатный"}' },
  { id: "DW-HC10", article: "DW-HC10", name: "DW-HC10 - Контроллер климатической системы", price: 22500, group: "Управление климатом", description: "Контроллер для управления отоплением, вентиляцией и кондиционированием.", specs: '{"функции": "отопление, вентиляция, кондиционирование", "каналов": "10"}' },
  
  // Реле и выключатели
  { id: "DW-SW16", article: "DW-SW16", name: "DW-SW16 - Модуль реле 16A", price: 9800, group: "Реле", description: "Модуль реле с током коммутации до 16А.", specs: '{"ток": "16A", "тип": "реле"}' },
  { id: "DW-010", article: "DW-010", name: "DW-010 - Блок расширения", price: 11200, group: "Системные устройства", description: "Блок расширения для увеличения количества входов/выходов системы.", specs: '{"функция": "расширение", "тип": "блок расширения"}' },
  
  // Шлюзы и интерфейсы
  { id: "DW-RS232", article: "DW-RS232", name: "DW-RS232 - RS232 шлюз", price: 13500, group: "Системные устройства", description: "Шлюз для интеграции устройств с RS232 интерфейсом.", specs: '{"интерфейс": "RS232", "тип": "шлюз"}' },
  { id: "DW-RS485", article: "DW-RS485", name: "DW-RS485 - RS485 шлюз", price: 13500, group: "Системные устройства", description: "Шлюз для подключения устройств по протоколу RS485.", specs: '{"интерфейс": "RS485", "тип": "шлюз"}' },
  { id: "DW-UART", article: "DW-UART", name: "DW-UART - UART интерфейс", price: 9500, group: "Системные устройства", description: "Модуль UART интерфейса для подключения внешних устройств.", specs: '{"интерфейс": "UART", "тип": "модуль"}' },
  
  // Беспроводные устройства
  { id: "DW-WL02", article: "DW-WL02", name: "DW-WL02 - Радиодатчик", price: 8900, group: "Беспроводное оборудование", description: "Радиодатчик для беспроводной системы Larnitech.", specs: '{"тип связи": "радио", "частота": "868 МГц"}' },
  { id: "DW-BC03", article: "DW-BC03", name: "DW-BC03 - Беспроводной контроллер", price: 12500, group: "Беспроводное оборудование", description: "Беспроводной контроллер для управления устройствами.", specs: '{"тип связи": "беспроводная", "функция": "контроллер"}' },
  
  // Пульты
  { id: "DW-RC12", article: "DW-RC12", name: "DW-RC12 - Пульт управления", price: 6500, group: "Панели управления", description: "Пульт дистанционного управления системой с 12 кнопками.", specs: '{"кнопок": "12", "тип": "пульт"}' },
  
  // Счетчики
  { id: "DW-METERS", article: "DW-METERS", name: "DW-METERS - Модуль учета", price: 14500, group: "Электросчетчики", description: "Модуль для учета электропотребления.", specs: '{"функция": "учет электроэнергии", "тип": "счетчик"}' },
  
  // Метеостанции
  { id: "CW-HTMLII", article: "CW-HTMLII", name: "CW-HTMLII - Метеостанция", price: 18500, group: "Сенсоры", description: "Метеостанция с веб-интерфейсом для мониторинга погоды.", specs: '{"функции": "метеостанция", "интерфейс": "веб"}' },
  { id: "CW-CO2", article: "CW-CO2", name: "CW-CO2 - Датчик CO2", price: 12500, group: "Сенсоры", description: "Датчик уровня углекислого газа с индикацией качества воздуха.", specs: '{"датчик": "CO2", "функция": "качество воздуха"}' },
  { id: "CW-MSD", article: "CW-MSD", name: "CW-MSD - Мульти-сенсор", price: 16500, group: "Сенсоры", description: "Мультифункциональный сенсор для комплексного мониторинга.", specs: '{"функции": "мульти-сенсор", "параметры": "несколько"}' },
  { id: "CW-M", article: "CW-M", name: "CW-M - Компактный сенсор", price: 11500, group: "Сенсоры", description: "Компактный многофункциональный сенсор.", specs: '{"тип": "компактный", "функции": "мульти"}' },
  { id: "DW-R", article: "DW-R", name: "DW-R - Универсальный приемник", price: 7800, group: "Системные устройства", description: "Универсальный приемник сигналов для системы.", specs: '{"тип": "приемник", "функция": "универсальная"}' },
  
  // Погодные станции - модификации
  { id: "CW-MLI-II", article: "CW-MLI-II", name: "CW-MLI-II - Метеостанция MLI II", price: 22500, group: "Сенсоры", description: "Улучшенная версия метеостанции MLI с расширенными функциями.", specs: '{"тип": "метеостанция", "версия": "II"}' },
  { id: "CW-M-II", article: "CW-M-II", name: "CW-M-II - Компактный сенсор II", price: 13500, group: "Сенсоры", description: "Вторая версия компактного сенсора с улучшенными характеристиками.", specs: '{"тип": "сенсор", "версия": "II"}' },
  { id: "CW-MSD-II", article: "CW-MSD-II", name: "CW-MSD-II - Мульти-сенсор II", price: 19500, group: "Сенсоры", description: "Улучшенный мульти-сенсор второго поколения.", specs: '{"тип": "мульти-сенсор", "версия": "II"}' },
  { id: "DW-HTO7", article: "DW-HTO7", name: "DW-HTO7 - Наружный датчик", price: 9500, group: "Управление климатом", description: "Датчик температуры и влажности для наружного монтажа.", specs: '{"датчики": "температура, влажность", "установка": "наружная"}' }
];

console.log(`Добавление ${missingProducts.length} отсутствующих товаров Larnitech...\n`);

const insert = db.prepare(`
  INSERT OR REPLACE INTO products (
    id, article, name, price, price_text, category, group_name, brand, image,
    source_url, description, specs, breadcrumbs, description_html, 
    gallery_json, attributes_json, documents_json, updated_at
  ) VALUES (
    @id, @article, @name, @price, @priceText, @category, @group, @brand, @image,
    @sourceUrl, @description, @specs, @breadcrumbs, @descriptionHtml, 
    @galleryJson, @attributesJson, @documentsJson, @updatedAt
  )
`);

let added = 0;
for (const product of missingProducts) {
  try {
    insert.run({
      id: product.id,
      article: product.article,
      name: product.name,
      price: product.price,
      priceText: "",
      category: category,
      group: product.group,
      brand: brand,
      image: "",
      sourceUrl: "https://larnitech-rus.ru/",
      description: product.description,
      specs: product.specs,
      breadcrumbs: "",
      descriptionHtml: "",
      galleryJson: "[]",
      attributesJson: "[]",
      documentsJson: "[]",
      updatedAt: now
    });
    added++;
    console.log(`✓ ${product.article} - ${product.name}`);
  } catch (err) {
    console.error(`✗ ${product.article}: ${err.message}`);
  }
}

console.log(`\n✅ Добавлено ${added} товаров Larnitech`);

// Проверяем итоговое количество
const total = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE category = ?`).get(category);
console.log(`\n📊 Всего в категории: ${total.cnt} товаров`);

db.close();
