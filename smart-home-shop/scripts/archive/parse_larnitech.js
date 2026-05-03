const http = require('https');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Список URL товаров для парсинга
const productUrls = [
  'https://larnitech-rus.ru/cat/tproduct/127318491-279602027734-de-mg-osnovnoi-shlyuz',
  // Добавить остальные URL товаров
];

// Функция для загрузки страницы
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Парсим товар
async function parseProduct(url) {
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    
    const product = {
      url: url,
      name: $('h1').text().trim(),
      description: $('.t-descr').text().trim(),
      images: [],
      docs: []
    };
    
    // Ищем фото
    $('.t-img, .t-bgimg').each((i, el) => {
      const src = $(el).attr('src') || $(el).css('background-image');
      if (src) {
        product.images.push(src.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1'));
      }
    });
    
    // Ищем ссылки на документацию
    $('a[href*="wiki"], a[href$=".pdf"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && (href.includes('wiki') || href.endsWith('.pdf'))) {
        product.docs.push({ url: href, title: text });
      }
    });
    
    console.log('Parsed:', product.name);
    console.log('Images:', product.images.length);
    console.log('Docs:', product.docs.length);
    
    return product;
  } catch (err) {
    console.error('Error parsing', url, err.message);
    return null;
  }
}

// Главная функция
async function main() {
  const results = [];
  
  for (const url of productUrls) {
    const product = await parseProduct(url);
    if (product) results.push(product);
    await new Promise(r => setTimeout(r, 1000)); // Задержка между запросами
  }
  
  // Сохраняем результаты
  const outputPath = path.join(__dirname, 'larnitech_parsed.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nСохранено ${results.length} товаров в ${outputPath}`);
}

main();
