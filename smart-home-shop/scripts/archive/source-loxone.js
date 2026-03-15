#!/usr/bin/env node

const baseUrl = 'https://smart-port.ru/shop';

const categories = {
  'Освещение': [
    { name: 'Модуль управления светом Loxone', price: 18900, article: 'LOXONE-LIGHT', description: 'Управление интеллектуальным освещением', specs: 'До 8 каналов' },
  ],
  'Затенение/Шторы': [
    { name: 'Модуль управления жалюзи Loxone', price: 14900, article: 'LOXONE-BLIND', description: 'Управление рольставнями и жалюзи', specs: 'Поддержка позиционирования' },
  ],
  'Климат': [
    { name: 'Термостат Loxone', price: 8990, article: 'LOXONE-THERMO', description: 'Управление температурой с автоматизацией', specs: 'Wifi + проводное подключение' },
  ],
  'Безопасность': [
    { name: 'Датчик движения Loxone', price: 2890, article: 'LOXONE-MOTION', description: 'Датчик движения и освещенности', specs: 'Wireless / проводной' },
    { name: 'Датчик протечки Loxone', price: 3490, article: 'LOXONE-WATER', description: 'Защита от протечек', specs: 'Беспроводной датчик' },
  ],
  'Контроль доступа': [
    { name: 'Smart Door Lock Loxone', price: 12900, article: 'LOXONE-LOCK', description: 'Электронный замок для управления доступом', specs: 'WiFi, NFC, RFID' },
  ],
  'Аудиосервер': [
    { name: 'Audio Server Loxone', price: 24900, article: 'LOXONE-AUDIO', description: 'Центральный аудиосервер для всего дома', specs: 'Мультизонное воспроизведение' },
  ],
  'Энергия': [
    { name: 'Счетчик энергии Loxone', price: 11900, article: 'LOXONE-ENERGY', description: 'Мониторинг энергопотребления', specs: 'Modbus, WiFi' },
  ],
};

module.exports = {
  name: 'Loxone (Smart Port)',
  description: 'Интегрированное оборудование умного дома (Австрия)',
  url: baseUrl,
  categories,

  async fetchProducts() {
    const products = [];
    for (const [category, items] of Object.entries(categories)) {
      for (const item of items) {
        products.push({
          ...item,
          category: 'Интегрированное оборудование УД',
          group_name: category,
          brand: 'Loxone',
          image: 'https://via.placeholder.com/300x300?text=' + encodeURIComponent(item.name.substring(0, 20)),
          source_url: baseUrl,
        });
      }
    }
    return products;
  }
};
