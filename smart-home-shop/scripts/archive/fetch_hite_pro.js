const https = require("https");
const fs = require("fs");

const url = "https://www.hite-pro.ru/shop/c/besprovodnoj-umnyj-dom/bloki-upravleniya";

const options = {
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
    'Accept-Language': 'ru-RU,ru;q=0.9',
    'Accept-Encoding': 'gzip, deflate'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('hite-pro-blocks.html', data);
    console.log('✅ HTML загружен:', data.length, 'символов');
    
    // Ищем товары в разных форматах
    const selectors = [
      { name: 'data-product-id', regex: /data-product-id/g },
      { name: 'class=".*product', regex: /class="[^"]*product[^"]*"/g },
      { name: 'class-item', regex: /class="[^"]*item[^"]*"/g },
      { name: 'data-sku', regex: /data-sku/g }
    ];
    
    for (const sel of selectors) {
      const matches = data.match(sel.regex);
      if (matches) {
        console.log(`✅ ${sel.name}: найдено ${matches.length}`);
      }
    }
    
    // Ищем JSON данные
    if (data.includes('window.__') || data.includes('window.products')) {
      console.log('✅ Найдены JSON данные');
    }
    
    // Ищем цены и ссылки
    const prices = data.match(/\d{3,5}\s*р/g);
    if (prices) {
      console.log(`✅ Найдено цен: ${prices.length}`);
    }
    
    const links = data.match(/href="[^"]*\/shop\/[^"]*"/g);
    if (links) {
      console.log(`✅ Найдено ссылок на товары: ${Math.min(links.length, 50)}`);
      console.log("\nПримеры ссылок:");
      links.slice(0, 5).forEach(l => console.log("  " + l));
    }
  });
}).on('error', (e) => {
  console.error('❌ Ошибка:', e.message);
});
