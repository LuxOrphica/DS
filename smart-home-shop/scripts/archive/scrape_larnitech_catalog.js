const http = require('https');
const fs = require('fs');
const path = require('path');

// Загрузка страницы
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? require('https') : require('http');
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Парсим список товаров из каталога
async function parseCatalog() {
  const catalogUrl = 'https://larnitech-rus.ru/cat';
  const html = await fetchPage(catalogUrl);
  
  // Ищем ссылки на товары /cat/tproduct/
  const productUrls = [];
  const regex = /href="(\/cat\/tproduct\/[^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const fullUrl = 'https://larnitech-rus.ru' + match[1];
    if (!productUrls.includes(fullUrl)) {
      productUrls.push(fullUrl);
    }
  }
  
  console.log(`Найдено ${productUrls.length} товаров`);
  return productUrls;
}

// Парсим детали товара
async function parseProduct(url) {
  try {
    const html = await fetchPage(url);
    
    // Извлекаем название
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const name = titleMatch ? titleMatch[1].trim() : '';
    
    // Извлекаем артикул из URL
    const idMatch = url.match(/-([^-]+)$/);
    const article = idMatch ? idMatch[1] : '';
    
    // Ищем фото
    const images = [];
    const imgRegex = /src="([^"]+\.(?:jpg|jpeg|png|gif|webp))"/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      let imgUrl = imgMatch[1];
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      if (imgUrl.startsWith('/')) imgUrl = 'https://larnitech-rus.ru' + imgUrl;
      if (!images.includes(imgUrl) && !imgUrl.includes('thumb')) {
        images.push(imgUrl);
      }
    }
    
    // Ищем ссылку на документацию
    const docMatch = html.match(/href="([^"]*wiki[^"]*)"/);
    const docUrl = docMatch ? 
      (docMatch[1].startsWith('http') ? docMatch[1] : 'https://larnitech-rus.ru' + docMatch[1]) 
      : null;
    
    // Ищем описание
    const descMatch = html.match(/t-descr[^>]*>([^<]+)<\/div>/);
    const description = descMatch ? descMatch[1].trim() : '';
    
    return {
      url,
      article,
      name,
      description,
      images: images.slice(0, 5), // Берем первые 5 фото
      docUrl,
      sourceUrl: url
    };
  } catch (err) {
    console.error('Ошибка парсинга', url, err.message);
    return null;
  }
}

// Главная функция
async function main() {
  console.log('Начинаем парсинг каталога Larnitech...\n');
  
  // Получаем список товаров
  const productUrls = await parseCatalog();
  
  // Парсим каждый товар
  const products = [];
  for (let i = 0; i < productUrls.length; i++) {
    const url = productUrls[i];
    console.log(`[${i + 1}/${productUrls.length}] Парсим: ${url}`);
    
    const product = await parseProduct(url);
    if (product) {
      products.push(product);
      console.log(`  ✓ ${product.name}`);
      console.log(`    Фото: ${product.images.length}`);
      console.log(`    Док: ${product.docUrl || 'нет'}`);
    }
    
    // Задержка между запросами
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Сохраняем результаты
  const outputPath = path.join(__dirname, 'data', 'larnitech_products_full.json');
  fs.writeFileSync(outputPath, JSON.stringify(products, null, 2));
  
  console.log(`\n✅ Готово! Сохранено ${products.length} товаров`);
  console.log(`📁 Файл: ${outputPath}`);
}

main().catch(console.error);
