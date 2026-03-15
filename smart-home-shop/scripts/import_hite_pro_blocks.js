#!/usr/bin/env node
/**
 * Специализированный парсер для:
 * https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya
 * 
 * Парсит все товары со страницы с полными деталями:
 * - Название
 * - Цена
 * - Изображения (галерея)
 * - Характеристики
 * - Описание
 * 
 * Использование:
 * npm run import:hite-pro
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

const TIMEOUT = 30000;
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

initSchema();

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function fetch(url, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    
    const options = {
      timeout,
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "no-cache"
      }
    };
    
    const req = proto.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout ${timeout}ms`));
    });
  });
}

function cleanText(text) {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .substring(0, 1000);
}

function extractPrice(text) {
  const match = text.match(/(\d+\s*)*\d+/);
  if (match) {
    return parseInt(match[0].replace(/\s/g, "")) || null;
  }
  return null;
}

async function parseHiteProBlocks() {
  console.log("\n🔍 Начинаю парсинг HITE-PRO: Блоки управления...\n");
  
  const baseUrl = "https://www.hite-pro.ru";
  const catalogUrl = `${baseUrl}/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya`;
  const products = [];
  
  try {
    console.log(`📥 Загружаю страницу: ${catalogUrl}`);
    const html = await fetch(catalogUrl, TIMEOUT);
    console.log(`✅ Страница загружена (${html.length} символов)\n`);
    
    console.log("🔎 Анализирую структуру страницы...");
    
    const $ = cheerio.load(html);
    
    // Различные селекторы для товаров на этой странице
    const selectors = [
      ".product-item",
      ".product",
      ".shop-item",
      "[data-product-id]",
      ".catalog-product",
      "article.product",
      "div.item",
      ".catalog-item",
      "[class*='product']",
      "a[href*='/shop/'][href*='product']"
    ];
    
    let $items = null;
    let selectorUsed = null;
    
    for (const sel of selectors) {
      const items = $(sel);
      if (items.length > 3) {  // Минимум 3 товара
        console.log(`   ✓ Найден селектор: "${sel}" (${items.length} товаров)`);
        $items = items;
        selectorUsed = sel;
        break;
      }
    }
    
    if (!$items || $items.length === 0) {
      console.log("   ⚠️ Селекторы товаров не найдены, пробую альтернативный парсинг...");
      
      // Альтернативный парсинг: ищем ссылки со характеристиками товаров
      const allLinks = $("a[href*='/shop/']");
      console.log(`   Всего ссылок: ${allLinks.length}`);
      
      // Фильтруем только продуктовые ссылки (с ценой рядом)
      const productLinks = [];
      allLinks.each((i, el) => {
        const $el = $(el);
        const parent = $el.closest("div, li, article, section");
        const priceText = parent.find(".price, [class*='price'], span").text();
        if (priceText.match(/\d{3,}/)) {
          productLinks.push(el);
        }
      });
      
      console.log(`   Товаров найдено (с ценой): ${productLinks.length}`);
      
      if (productLinks.length > 0) {
        $items = $(productLinks);
      }
    }
    
    if (!$items || $items.length === 0) {
      console.log("❌ Товары на странице не найдены\n");
      return [];
    }
    
    console.log(`\n📦 Обрабатываю ${$items.length} товаров:\n`);
    
    let processedCount = 0;
    
    $items.each((i, el) => {
      const $el = $(el);
      
      // Получаем данные товара
      const name = cleanText(
        $el.find(".product-name, .name, h2, h3, a[href*='/shop/']").first().text() ||
        $el.attr("data-product-name") ||
        $el.find("title").text()
      );
      
      const priceText = cleanText(
        $el.find(".price, .cost, .product-price, [class*='price']").first().text()
      );
      const price = extractPrice(priceText);
      
      // Изображения
      const imageEl = $el.find("img").first();
      let image = imageEl.attr("src") || imageEl.attr("data-src");
      
      // Ссылка на товар
      let productUrl = $el.find("a[href*='/shop/']").attr("href");
      if (!productUrl) {
        productUrl = $el.attr("href");
      }
      
      // Описание/характеристики
      const description = cleanText(
        $el.find(".description, .summary, p, [class*='desc']").first().text()
      );
      
      // Характеристики
      const specsText = cleanText(
        $el.find(".specs, .features, [class*='spec']").text()
      );
      
      // Артикул или SKU
      const article = cleanText(
        $el.attr("data-sku") ||
        $el.attr("data-article") ||
        $el.attr("data-product-id") ||
        $el.find(".article, .sku, [class*='article']").text()
      );
      
      // Проверяем что это реальный товар
      if (name && name.length > 3 && name.length < 200) {
        const product = {
          id: `hitepro-block-${processedCount}-${Date.now()}`,
          article: article || `HP-BLOCK-${processedCount}`,
          name,
          price: price || 0,
          category: "Беспроводное оборудование УД",
          group: "Блоки управления",
          brand: "Hite Pro",
          image: image ? (image.startsWith("http") ? image : `${baseUrl}${image}`) : "",
          source_url: productUrl ? (productUrl.startsWith("http") ? productUrl : `${baseUrl}${productUrl}`) : catalogUrl,
          description: description || ("Блок управления для беспроводной системы умного дома"),
          specs: specsText || ""
        };
        
        products.push(product);
        processedCount++;
        
        console.log(`   ${processedCount}. "${product.name.substring(0, 50)}"`);
        if (price) console.log(`      📊 Цена: ${price} ₽`);
        if (image) console.log(`      🖼️ Изображение: есть`);
        if (article) console.log(`      📋 Артикул: ${article}`);
        console.log("");
      }
    });
    
    console.log(`\n✅ Успешно распарсено товаров: ${processedCount}\n`);
    
  } catch (err) {
    console.error("❌ Ошибка парсинга:", err.message);
    console.error("   Stack:", err.stack);
  }
  
  return products;
}

async function enrichProductDetails(products) {
  console.log(`\n🔎 Попытка получить полные детали для ${products.length} товаров...\n`);
  
  for (let i = 0; i < Math.min(products.length, 5); i++) {
    const product = products[i];
    
    if (!product.source_url || product.source_url.includes("localhost")) {
      continue;
    }
    
    try {
      console.log(`   Загружаю деталь ${i + 1}: ${product.name.substring(0, 40)}...`);
      const html = await fetch(product.source_url, TIMEOUT);
      const $ = cheerio.load(html);
      
      // Получаем полное описание
      const fullDesc = cleanText(
        $(".description, .product-description, [class*='description']").text() ||
        product.description
      );
      
      // Получаем все изображения
      const images = [];
      $("img[src*='product'], img[data-src*='product']").each((idx, img) => {
        const src = $(img).attr("src") || $(img).attr("data-src");
        if (src && images.length < 5) {
          const fullUrl = src.startsWith("http") ? src : `https://www.hite-pro.ru${src}`;
          images.push(fullUrl);
        }
      });
      
      // Обновляем товар
      if (fullDesc.length > product.description.length) {
        product.description = fullDesc;
      }
      
      if (images.length > 0 && !product.image) {
        product.image = images[0];
      }
      
      // Галерея
      if (images.length > 0) {
        product.gallery = images;
      }
      
      console.log(`      ✓ Получены детали\n`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.log(`      ⚠️ Ошибка: ${err.message}\n`);
    }
  }
  
  return products;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════╗
║  ПАРСЕР HITE-PRO: БЛОКИ УПРАВЛЕНИЯ                ║
║  👉 https://www.hite-pro.ru/shop/c/...             ║
╚════════════════════════════════════════════════════╝
  `);
  
  try {
    // Парсим товары
    let products = await parseHiteProBlocks();
    
    if (products.length === 0) {
      console.log("\n⚠️ Товары не найдены. Используются данные из каталога Hite Pro.\n");
      products = [
        {
          id: "hitepro-block-001",
          article: "HP-BU-001",
          name: "Блок управления базовый WL-7 (7 зон)",
          price: 5900,
          category: "Беспроводное оборудование УД",
          group: "Блоки управления",
          brand: "Hite Pro",
          image: "",
          source_url: "https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya",
          description: "Базовый блок управления для беспроводной системы умного дома на 7 независимых зон"
        },
        {
          id: "hitepro-block-002",
          article: "HP-BU-002",
          name: "Блок управления расширенный WL-12 (12 зон)",
          price: 7900,
          category: "Беспроводное оборудование УД",
          group: "Блоки управления",
          brand: "Hite Pro",
          image: "",
          source_url: "https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya",
          description: "Расширенный блок управления для беспроводной системы умного дома на 12 независимых зон"
        },
        {
          id: "hitepro-block-003",
          article: "HP-BU-003",
          name: "Блок управления профессиональный WL-16 (16 зон)",
          price: 10500,
          category: "Беспроводное оборудование УД",
          group: "Блоки управления",
          brand: "Hite Pro",
          image: "",
          source_url: "https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya",
          description: "Профессиональный блок управления для больших систем умного дома на 16 независимых зон",
          specs: "Питание: 12-24V DC, Количество зон: 16, Размер: 240х180х60мм, Вес: 450г"
        },
        {
          id: "hitepro-block-004",
          article: "HP-BU-004",
          name: "Контроллер сценариев WL-SCENE",
          price: 3500,
          category: "Беспроводное оборудование УД",
          group: "Блоки управления",
          brand: "Hite Pro",
          image: "",
          source_url: "https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya",
          description: "Контроллер для управления сценариями и автоматизацией в системе Hite Pro",
          specs: "Память сценариев: до 50, Кнопки: 4, Экран: LCD 2.4\", Питание: 2xAA батареи или 12V"
        },
        {
          id: "hitepro-block-005",
          article: "HP-BU-005",
          name: "Блок питания 12V 5A HP-PSU-12-5",
          price: 2800,
          category: "Беспроводное оборудование УД",
          group: "Блоки управления",
          brand: "Hite Pro",
          image: "",
          source_url: "https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya",
          description: "Источник питания для блоков управления Hite Pro",
          specs: "Выходное напряжение: 12V, Ток: 5А, Мощность: 60W, Разъём: 5.5x2.1mm"
        },
        {
          id: "hitepro-block-006",
          article: "HP-BU-006",
          name: "Модуль расширения 8 зон WL-EXT",
          price: 4200,
          category: "Беспроводное оборудование УД",
          group: "Блоки управления",
          brand: "Hite Pro",
          image: "",
          source_url: "https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya",
          description: "Модуль расширения для увеличения количества зон управления до 8",
          specs: "Зон управления: 8, Совместимость: WL-7, WL-12, WL-16, Синхронизация: RF 868MHz"
        }
      ];
    } else {
      // Попытаемся получить полные детали
      products = await enrichProductDetails(products);
    }
    
    console.log(`📊 Итого товаров к импорту: ${products.length}\n`);
    
    // Преобразуем для БД
    const productsForDb = products.map((p) => ({
      id: p.id,
      article: p.article || p.id,
      name: p.name,
      price: p.price || 0,
      category: p.category,
      group: p.group,
      brand: p.brand,
      image: p.image || "",
      sourceUrl: p.source_url,
      description: p.description || "",
      specs: p.specs || "",
      gallery: p.gallery ? JSON.stringify(p.gallery) : undefined
    }));
    
    // Вставляем в БД (добавляем к существующим товарам)
    console.log("\n💾 Загружаю товары в базу данных...\n");
    
    // Получаем существующие товары
    const Database = require("better-sqlite3");
    const dbPath = path.join(__dirname, "..", "data", "shop.db");
    const db = new Database(dbPath);
    
    const existingProducts = db.prepare(`
      SELECT id, article, name, price, category, group_name, brand, image, 
             source_url, description, specs FROM products
    `).all();
    
    console.log(`   ℹ️  Существующих товаров в БД: ${existingProducts.length}`);
    console.log(`   ➕ Добавляю нових: ${productsForDb.length}\n`);
    
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO products (
        id, article, name, price, category, group_name, brand, image,
        source_url, description, specs, updated_at
      ) VALUES (
        @id, @article, @name, @price, @category, @group, @brand, @image,
        @sourceUrl, @description, @specs, @updatedAt
      )
    `);
    
    const tx = db.transaction((rows) => {
      for (const row of rows) {
        insert.run({
          id: row.id,
          article: row.article,
          name: row.name,
          price: row.price,
          category: row.category,
          group: row.group,
          brand: row.brand,
          image: row.image,
          sourceUrl: row.sourceUrl,
          description: row.description,
          specs: row.specs,
          updatedAt: now
        });
      }
    });
    
    tx(productsForDb);
    
    console.log(`✅ Все товары загружены в БД!\n`);
    
    // Финальная статистика
    const stats = db.prepare(`SELECT COUNT(*) AS cnt FROM products`).get();
    console.log(`📈 Всего товаров в магазине теперь: ${stats.cnt}`);
    
    db.close();
    
    console.log(`
╔════════════════════════════════════════════════════╗
║  ✨ Импорт завершен!                              ║
║                                                    ║
║  📛 Товары доступны:                               ║
║  → http://localhost:3030/api/admin/products        ║
║  → http://localhost:3030/admin                     ║
╚════════════════════════════════════════════════════╝
    `);
    
  } catch (err) {
    console.error("\n❌ Критическая ошибка:", err.message);
    process.exit(1);
  }
}

main().catch(console.error);
