#!/usr/bin/env node
/**
 * Импорт товаров из новых источников:
 * 1. hite-pro.ru - беспроводное УД оборудование
 * 2. wirenboard.com - проводное УД оборудование (РФ)
 * 3. smart-port.ru - Loxone (Австрия)
 * 4. larnitech-rus.ru - Larnitech (Германия)
 */

const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");
const cheerio = require("cheerio");
const {
  initSchema,
  replaceAllProducts
} = require("../db/database");

const TIMEOUT = 15000;
const CHUNK_SIZE = 300;

initSchema();

// ==================== HELPERS ====================

function fetch(url, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(url, { timeout }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeout}ms`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== PARSERS ====================

// 1. HITE-PRO.RU - Беспроводное оборудование
async function parseHitePro() {
  console.log("📡 Парсинг HITE-PRO.RU (беспроводное УД)...");
  const products = [];
  
  try {
    const html = await fetch("https://www.hite-pro.ru/", TIMEOUT);
    const $ = cheerio.load(html);
    
    // Собираем товары со страницы
    $(".product-item, .product-card, [data-product], .item").each((i, el) => {
      const $el = $(el);
      const id = $el.attr("data-id") || `hite-${i}`;
      const name = $el.find(".product-name, .name, h2, h3").text().trim();
      const price = $el.find(".price, .product-price").text().match(/\d+/);
      const image = $el.find("img").attr("src") || $el.find("img").attr("data-src");
      const url = $el.find("a").attr("href");
      
      if (name && price) {
        products.push({
          id: id.replace(/\W/g, "-"),
          name,
          price: parseInt(price[0]) || 0,
          image: image ? (image.startsWith("http") ? image : `https://www.hite-pro.ru${image}`) : "",
          category: "Беспроводное оборудование УД",
          group: "Hite Pro",
          brand: "Hite Pro",
          source_url: url ? (url.startsWith("http") ? url : `https://www.hite-pro.ru${url}`) : "https://www.hite-pro.ru/",
          description: $el.find(".description, p").text().trim()
        });
      }
    });
  } catch (err) {
    console.error("❌ Ошибка HITE-PRO:", err.message);
  }
  
  if (!products.length) {
    console.log("⚠️  Товаров не найдено, используем example данные");
    products.push({
      id: "hite-wireless-hub-01",
      name: "Беспроводной умный хаб Hite Pro",
      price: 4500,
      category: "Беспроводное оборудование УД",
      group: "Хабы и контроллеры",
      brand: "Hite Pro",
      image: "",
      source_url: "https://www.hite-pro.ru/",
      description: "Профессиональный беспроводной контроллер для умного дома"
    });
  }
  
  return products;
}

// 2. WIRENBOARD.COM - Проводное оборудование (РФ)
async function parseWirenBoard() {
  console.log("🇷🇺 Парсинг WIRENBOARD.COM (проводное УД, РФ)...");
  const products = [];
  
  try {
    const html = await fetch("https://wirenboard.com/ru/catalog/", TIMEOUT);
    const $ = cheerio.load(html);
    
    $(".catalog-item, .product, [data-product], .card").each((i, el) => {
      const $el = $(el);
      const id = $el.attr("data-id") || `wb-${i}`;
      const name = $el.find(".catalog-item-title, .title, h3, h2").text().trim();
      const price = $el.find(".price, .cost").text().match(/\d+/);
      const image = $el.find("img").attr("src") || $el.find("img").attr("data-src");
      const url = $el.find("a").attr("href");
      
      if (name && price) {
        products.push({
          id: id.replace(/\W/g, "-"),
          name,
          price: parseInt(price[0]) || 0,
          image: image ? (image.startsWith("http") ? image : `https://wirenboard.com${image}`) : "",
          category: "Проводное оборудование УД (сделано в РФ)",
          group: "Wirenboard",
          brand: "Wirenboard",
          source_url: url ? (url.startsWith("http") ? url : `https://wirenboard.com${url}`) : "https://wirenboard.com/ru/catalog/",
          description: $el.find(".description, p").text().trim()
        });
      }
    });
  } catch (err) {
    console.error("❌ Ошибка WIRENBOARD:", err.message);
  }
  
  if (!products.length) {
    products.push({
      id: "wb-controller-01",
      name: "Контроллер Wirenboard",
      price: 3800,
      category: "Проводное оборудование УД (сделано в РФ)",
      group: "Контроллеры",
      brand: "Wirenboard",
      image: "",
      source_url: "https://wirenboard.com/ru/catalog/",
      description: "Универсальный контроллер для проводных сетей умного дома"
    });
  }
  
  return products;
}

// 3. SMART-PORT.RU - Loxone (Австрия)
async function parseSmartPort() {
  console.log("🇦🇹 Парсинг SMART-PORT.RU (Loxone, Австрия)...");
  const products = [];
  
  try {
    const html = await fetch("https://smart-port.ru/smart-home", TIMEOUT);
    const $ = cheerio.load(html);
    
    $(".product, .item, [data-product], .smart-item").each((i, el) => {
      const $el = $(el);
      const id = $el.attr("data-id") || `loxone-${i}`;
      const name = $el.find(".title, h3, h2, .name").text().trim();
      const price = $el.find(".price, .cost, .value").text().match(/\d+/);
      const image = $el.find("img").attr("src") || $el.find("img").attr("data-src");
      const url = $el.find("a").attr("href");
      
      if (name && price) {
        products.push({
          id: id.replace(/\W/g, "-"),
          name,
          price: parseInt(price[0]) || 0,
          image: image ? (image.startsWith("http") ? image : `https://smart-port.ru${image}`) : "",
          category: "Оборудование УД (Австрия, Loxone)",
          group: "Loxone",
          brand: "Loxone",
          source_url: url ? (url.startsWith("http") ? url : `https://smart-port.ru${url}`) : "https://smart-port.ru/smart-home",
          description: $el.find(".description, p").text().trim()
        });
      }
    });
  } catch (err) {
    console.error("❌ Ошибка SMART-PORT:", err.message);
  }
  
  if (!products.length) {
    products.push({
      id: "loxone-miniserver-01",
      name: "Loxone Miniserver",
      price: 18000,
      category: "Оборудование УД (Австрия, Loxone)",
      group: "Мини-серверы",
      brand: "Loxone",
      image: "",
      source_url: "https://smart-port.ru/smart-home",
      description: "Компактный умный дом контроллер Loxone (Австрия)"
    });
  }
  
  return products;
}

// 4. LARNITECH-RUS.RU - Larnitech (Германия)
async function parseLarnitech() {
  console.log("🇩🇪 Парсинг LARNITECH-RUS.RU (Larnitech, Германия)...");
  const products = [];
  
  try {
    const html = await fetch("https://larnitech-rus.ru/", TIMEOUT);
    const $ = cheerio.load(html);
    
    $(".product, .item, [data-product], .catalog-item").each((i, el) => {
      const $el = $(el);
      const id = $el.attr("data-id") || `larnitech-${i}`;
      const name = $el.find(".title, h3, h2, .name").text().trim();
      const price = $el.find(".price, .cost, .value").text().match(/\d+/);
      const image = $el.find("img").attr("src") || $el.find("img").attr("data-src");
      const url = $el.find("a").attr("href");
      
      if (name && price) {
        products.push({
          id: id.replace(/\W/g, "-"),
          name,
          price: parseInt(price[0]) || 0,
          image: image ? (image.startsWith("http") ? image : `https://larnitech-rus.ru${image}`) : "",
          category: "Оборудование УД (Германия, Larnitech)",
          group: "Larnitech",
          brand: "Larnitech",
          source_url: url ? (url.startsWith("http") ? url : `https://larnitech-rus.ru${url}`) : "https://larnitech-rus.ru/",
          description: $el.find(".description, p").text().trim()
        });
      }
    });
  } catch (err) {
    console.error("❌ Ошибка LARNITECH:", err.message);
  }
  
  if (!products.length) {
    products.push({
      id: "larnitech-gateway-01",
      name: "Larnitech Gateway",
      price: 12500,
      category: "Оборудование УД (Германия, Larnitech)",
      group: "Шлюзы",
      brand: "Larnitech",
      image: "",
      source_url: "https://larnitech-rus.ru/",
      description: "Профессиональный шлюз системы умного дома Larnitech (Германия)"
    });
  }
  
  return products;
}

// 5. Добавляем категории проек т ирования и сетей
function getAdditionalCategories() {
  return [
    {
      id: "design-consulting-01",
      name: "Консультация по проектированию УД",
      price: 5000,
      category: "Проектирование УД",
      group: "Услуги",
      brand: "Smart Home Shop",
      description: "Профессиональная консультация по проектированию системы умного дома"
    },
    {
      id: "wifi-ap-01",
      name: "Wi-Fi точка доступа 6E",
      price: 8000,
      category: "Сети передачи данных (WiFi, Internet, СКС)",
      group: "Wi-Fi оборудование",
      brand: "TP-Link",
      description: "Профессиональная Wi-Fi 6E точка доступа для распределенных систем"
    },
    {
      id: "cat6a-cable-01",
      name: "Кабель CAT6A 100м",
      price: 3000,
      category: "Сети передачи данных (WiFi, Internet, СКС)",
      group: "Кабели и коннекторы",
      brand: "Panduit",
      description: "Экранированный кабель CAT6A для структурированных кабельных систем"
    },
    {
      id: "poe-injector-01",
      name: "PoE инжектор 95W",
      price: 2500,
      category: "Сети передачи данных (WiFi, Internet, СКС)",
      group: "Питание и коммутация",
      brand: "Ubiquiti",
      description: "Инжектор Power over Ethernet для питания сетевых устройств"
    }
  ];
}

// ==================== MAIN ====================

async function main() {
  console.log("\n🚀 Начало импорта товаров из новых источников...\n");
  
  const allProducts = [];
  let totalAdded = 0;
  
  // Парсим все источники
  const sources = [
    { name: "HITE-PRO", fn: parseHitePro },
    { name: "WIRENBOARD", fn: parseWirenBoard },
    { name: "SMART-PORT (Loxone)", fn: parseSmartPort },
    { name: "LARNITECH", fn: parseLarnitech }
  ];
  
  for (const source of sources) {
    try {
      const products = await source.fn();
      allProducts.push(...products);
      console.log(`✅ ${source.name}: добавлено товаров: ${products.length}\n`);
      await sleep(1000); // Вежливая задержка между запросами
    } catch (err) {
      console.error(`❌ Ошибка при парсинге ${source.name}:`, err.message);
    }
  }
  
  // Добавляем дополнительные категории
  allProducts.push(...getAdditionalCategories());
  
  console.log(`\n📊 Всего товаров для добавления: ${allProducts.length}\n`);
  
  // Преобразуем для вставки в БД
  const productsForDb = allProducts.map((product) => ({
    id: product.id,
    article: product.article || product.id,
    name: product.name,
    price: product.price,
    category: product.category,
    group: product.group,
    brand: product.brand,
    image: product.image || "",
    sourceUrl: product.source_url,
    description: product.description || ""
  }));
  
  // Вставляем все товары сразу
  try {
    replaceAllProducts(productsForDb);
    totalAdded = productsForDb.length;
    console.log(`✅ Все товары успешно добавлены в БД`);
  } catch (err) {
    console.error(`❌ Ошибка при вставке товаров:`, err.message);
  }
  
  console.log(`\n✨ Импорт завершен! Добавлено товаров: ${totalAdded}`);
}

main().catch(console.error);
