const https = require('https');

https.get('https://larnitech-rus.ru/cat', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Ищем все ссылки на товары
    const matches = data.match(/tproduct[^"']*/g);
    console.log('Найденные ссылки на товары:');
    const unique = [...new Set(matches)];
    unique.slice(0, 20).forEach(m => console.log(m));
    console.log(`\nВсего уникальных: ${unique.length}`);
    
    // Ищем JS-код, который может загружать товары
    const jsLoad = data.includes('window.__NUXT__') || data.includes('tstore');
    console.log('\nДинамическая загрузка:', jsLoad ? 'Да' : 'Нет');
    
    // Ищем JSON с данными товаров
    const jsonData = data.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/);
    if (jsonData) {
      console.log('Найдены данные в JSON формате');
      try {
        const parsed = JSON.parse(jsonData[1]);
        console.log('Структура данных:', Object.keys(parsed));
      } catch(e) {}
    }
  });
});
