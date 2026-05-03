const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'shop.db');
const db = new Database(dbPath);

const category = "Оборудование УД сделано в Германии, Larnitech";
const brand = "Larnitech";
const now = new Date().toISOString();

// Товары Larnitech на основе их каталога
const larnitechProducts = [
  {
    id: "DE-MG",
    article: "DE-MG",
    name: "DE-MG - Модуль управления",
    price: 28500,
    group: "DIN оборудование",
    description: "Многофункциональный модуль управления для DIN-рейки. Поддержка различных протоколов.",
    specs: '{"channels": "8", "mounting": "DIN-рейка", "protocol": "CAN, 1-Wire"}'
  },
  {
    id: "DE-MG-PLUS",
    article: "DE-MG-plus",
    name: "DE-MG Plus - Расширенный модуль управления",
    price: 32500,
    group: "DIN оборудование",
    description: "Расширенная версия модуля управления с дополнительными входами/выходами.",
    specs: '{"channels": "16", "mounting": "DIN-рейка", "protocol": "CAN, 1-Wire, RS485"}'
  },
  {
    id: "DE-GW",
    article: "DE-GW",
    name: "DE-GW - Шлюз",
    price: 19500,
    group: "Системные устройства",
    description: "Шлюз для интеграции системы Larnitech с внешними сервисами.",
    specs: '{"interfaces": "Ethernet, WiFi", "protocol": "TCP/IP"}'
  },
  {
    id: "DW-LC07",
    article: "DW-LC07",
    name: "DW-LC07 - Диммер LED",
    price: 12500,
    group: "Диммеры",
    description: "Диммер для светодиодных лент и светильников.",
    specs: '{"power": "200W", "voltage": "12-48V", "type": "LED"}'
  },
  {
    id: "DE-LS",
    article: "DE-LS",
    name: "DE-LS - Реле освещения",
    price: 11500,
    group: "Реле",
    description: "Модуль реле для управления освещением.",
    specs: '{"channels": "4", "current": "16A", "mounting": "DIN-рейка"}'
  },
  {
    id: "DW-LS01",
    article: "DW-LS01",
    name: "DW-LS01 - Датчик движения",
    price: 8500,
    group: "Сенсоры",
    description: "Универсальный датчик движения с измерением освещенности и температуры.",
    specs: '{"functions": "Движение, освещенность, температура", "mounting": "Потолочный"}'
  },
  {
    id: "DW-LS02",
    article: "DW-LS02",
    name: "DW-LS02 - Датчик температуры и влажности",
    price: 7800,
    group: "Сенсоры",
    description: "Датчик измерения температуры и относительной влажности.",
    specs: '{"temperature": "-40...+60°C", "humidity": "0-100%", "protocol": "1-Wire"}'
  },
  {
    id: "DW-LS03",
    article: "DW-LS03",
    name: "DW-LS03 - Датчик протечки",
    price: 5200,
    group: "Контроль протечек",
    description: "Беспроводной датчик обнаружения протечки воды.",
    specs: '{"power": "Батарея 3V", "wireless": "до 100м", "battery": "5 лет"}'
  },
  {
    id: "DE-TRV",
    article: "DE-TRV",
    name: "DE-TRV - Термостат клапан",
    price: 14500,
    group: "Управление климатом",
    description: "Электропривод для термостатического клапана радиатора.",
    specs: '{"voltage": "24V", "torque": "100Н", "noise": "26дБ"}'
  },
  {
    id: "DE-MG-DALI",
    article: "DE-MG-DALI",
    name: "DE-MG DALI - Контроллер DALI",
    price: 22500,
    group: "Светодиодные контроллеры",
    description: "Контроллер для управления DALI-устройствами.",
    specs: '{"protocol": "DALI", "channels": "64", "interface": "CAN"}'
  },
  {
    id: "METAFORSA-KIT",
    article: "METAFORSA-KIT",
    name: "Metaforsa - Готовый набор для квартиры",
    price: 125000,
    group: "Metaforsa",
    description: "Комплект оборудования для автоматизации типовой квартиры.",
    specs: '{"devices": "12", "area": "до 80м²", "install": "2-3 дня"}'
  },
  {
    id: "DW-PANEL",
    article: "DW-PANEL",
    name: "DW-Panel - Панель управления",
    price: 28500,
    group: "Панели управления",
    description: "Настенная сенсорная панель управления системой.",
    specs: '{"display": "4 дюйма", "touch": "Емкостный", "mounting": "Встраиваемый"}'
  },
  {
    id: "DE-GW-KNX",
    article: "DE-GW-KNX",
    name: "DE-GW KNX - Шлюз KNX",
    price: 24500,
    group: "KNX оборудование",
    description: "Шлюз для интеграции с системами KNX.",
    specs: '{"protocol": "KNX/EIB", "interface": "TP, IP"}'
  },
  {
    id: "DW-WLS",
    article: "DW-WLS",
    name: "DW-WLS - Беспроводной сенсор",
    price: 9500,
    group: "Беспроводное оборудование",
    description: "Беспроводной датчик движения и освещенности.",
    specs: '{"battery": "3 года", "range": "до 100м", "frequency": "868 МГц"}'
  },
  {
    id: "DE-IP-CAM",
    article: "DE-IP-CAM",
    name: "DE-IP-CAM - IP камера",
    price: 18500,
    group: "IP устройства",
    description: "IP-камера видеонаблюдения с интеграцией в систему.",
    specs: '{"resolution": "2MP", "angle": "110°", "night": "ИК-подсветка"}'
  }
];

console.log(`Добавление ${larnitechProducts.length} товаров Larnitech...`);

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
for (const product of larnitechProducts) {
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
    console.log(`✓ ${product.name}`);
  } catch (err) {
    console.error(`✗ ${product.name}: ${err.message}`);
  }
}

console.log(`\nДобавлено ${added} товаров Larnitech`);
db.close();
