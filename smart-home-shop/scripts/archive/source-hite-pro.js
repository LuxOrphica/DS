#!/usr/bin/env node
const https = require('https');
const { parse } = require('url');

const baseUrl = 'https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom';

// Simplified data - will populate from actual site
const categories = {
  'Радиовыключатели': [
    { name: 'Радиовыключатель Base-1', price: 1780, article: 'BASE-1', description: 'Беспроводной выключатель', specs: 'Питание: батарейка AA' },
    { name: 'Радиовыключатель SN-R1', price: 2980, article: 'SN-R1', description: 'Сенсорный беспроводной выключатель', specs: 'Питание: батарейка' },
    { name: 'Радиовыключатель LE-1', price: 2180, article: 'LE-1', description: 'Выключатель серии LE', specs: 'Радиочастота 868 MHz' },
  ],
  'Блоки управления': [
    { name: 'Блок управления Relay-1', price: 3080, article: 'RELAY-1', description: 'Одноканальный блок управления', specs: 'Выход: 16A' },
    { name: 'Блок управления Relay-2Q', price: 4780, article: 'RELAY-2Q', description: 'Двухканальный блок управления', specs: 'Выход: 16A х 2' },
    { name: 'Блок управления Relay-4M', price: 9980, article: 'RELAY-4M', description: 'Четырёхканальный блок управления', specs: 'Выход: 16A х 4' },
  ],
  'Датчики': [
    { name: 'Датчик протечки Smart Water', price: 2980, article: 'WATER-SENSOR', description: 'Датчик обнаружения протечки', specs: 'Радиус действия: 100м' },
    { name: 'Датчик температуры Smart Air', price: 2980, article: 'AIR-SENSOR', description: 'Датчик температуры и влажности', specs: 'Диапазон: -10..+60°C' },
    { name: 'Датчик движения Smart Motion', price: 2590, article: 'MOTION-SENSOR', description: 'Датчик движения и освещенности', specs: 'Ночной режим: 5лк' },
  ],
  'Сервер умного дома': [
    { name: 'Gateway (шлюз)', price: 5980, article: 'GATEWAY', description: 'Шлюз для управления системой', specs: 'WiFi, 8-16 каналов' },
    { name: 'DIN-Gateway', price: 6980, article: 'DIN-GATEWAY', description: 'Шлюз для установки на DIN-рейку', specs: 'Профессиональное исполнение' },
  ],
  'Комплекты': [
    { name: 'Комплект "Беспроводной выключатель 1 лин"', price: 4290, article: 'KIT-1', description: 'Готовый комплект для 1 линии', specs: 'Включает: выключатель + блок' },
    { name: 'Комплект "Умный свет для квартиры"', price: 12990, article: 'KIT-APT', description: 'Решение для облагораживания квартиры', specs: '3+ линии, выключатели, датчики' },
  ],
};

module.exports = {
  name: 'Hite Pro',
  description: 'Беспроводное оборудование умного дома (Россия)',
  url: baseUrl,
  categories,
  
  async fetchProducts() {
    const products = [];
    for (const [category, items] of Object.entries(categories)) {
      for (const item of items) {
        products.push({
          ...item,
          category: 'Беспроводное оборудование УД',
          group_name: category,
          brand: 'Hite Pro',
          image: 'https://via.placeholder.com/300x300?text=' + encodeURIComponent(item.name.substring(0, 20)),
          source_url: baseUrl,
        });
      }
    }
    return products;
  }
};
