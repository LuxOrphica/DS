#!/usr/bin/env node

const baseUrl = 'https://wirenboard.com/ru/catalog/';

const categories = {
  'Контроллеры': [
    { name: 'Wiren Board 7', price: 18900, article: 'WB7', description: 'Универсальный контроллер на базе Linux', specs: 'Ethernet, RS-485, WiFi' },
    { name: 'Wiren Board 6.8', price: 14900, article: 'WB68', description: 'Компактный контроллер для автоматизации', specs: 'До 16 каналов ввода-вывода' },
  ],
  'Модули для контроллеров': [
    { name: 'Модуль расширения RS-485', price: 2490, article: 'WB-EXT-485', description: 'Модуль для интеграции устройств по RS-485', specs: 'Поддержка Modbus RTU' },
    { name: 'Модуль ввода-вывода 8 портов', price: 4890, article: 'WB-IO-8', description: 'Стыкуемый модуль на DIN-рейке', specs: '8 цифровых портов' },
  ],
  'Реле': [
    { name: 'Реле WB-MR-2x16', price: 3290, article: 'WB-MR-2x16', description: 'Двухканальное реле Modbus RTU', specs: '2 канала х 16A' },
    { name: 'Реле WB-MR-4x16', price: 4890, article: 'WB-MR-4x16', description: 'Четырёхканальное реле', specs: '4 канала х 16A' },
  ],
  'Электросчетчики': [
    { name: 'Счетчик WB-MAP96', price: 8990, article: 'WB-MAP96', description: 'Многофункциональный счетчик электроэнергии', specs: 'Трехфазный, измеритель мощности' },
  ],
  'Датчики': [
    { name: 'Датчик температуры DS18B20', price: 590, article: 'TEMP-DS18B20', description: 'Цифровой датчик температуры 1-Wire', specs: 'Диапазон: -55..+125°C' },
    { name: 'Датчик CO2', price: 12900, article: 'CO2-SENSOR', description: 'Датчик углекислого газа', specs: 'NDIR сенсор, Modbus RTU' },
  ],
  'Диммеры': [
    { name: 'Диммер WB-DIMMER', price: 2190, article: 'WB-DIMMER', description: 'Светорегулятор для светодиодов', specs: 'PWM управление' },
  ],
};

module.exports = {
  name: 'Wirenboard',
  description: 'Проводное оборудование умного дома (Россия, open source)',
  url: baseUrl,
  categories,

  async fetchProducts() {
    const products = [];
    for (const [category, items] of Object.entries(categories)) {
      for (const item of items) {
        products.push({
          ...item,
          category: 'Проводное оборудование УД',
          group_name: category,
          brand: 'Wiren Board',
          image: 'https://via.placeholder.com/300x300?text=' + encodeURIComponent(item.name.substring(0, 20)),
          source_url: baseUrl,
        });
      }
    }
    return products;
  }
};
