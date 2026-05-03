const https = require('https');

const options = {
  hostname: 'localhost',
  port: 3030,
  path: '/api/products',
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const products = JSON.parse(data);
    console.log('Всего товаров:', products.length);
    
    // Показываем первые 3 товара с их структурой
    products.slice(0, 3).forEach((product, index) => {
      console.log(`\nТовар ${index + 1}:`);
      console.log('ID:', product.id);
      console.log('Name:', product.name);
      console.log('Category:', product.category);
      console.log('Breadcrumbs:', product.breadcrumbs);
      
      // Анализ breadcrumbs
      if (product.breadcrumbs) {
        const crumbs = product.breadcrumbs.split('/').map(x => x.trim()).filter(Boolean);
        console.log('Crumb array:', crumbs);
        console.log('Top category:', crumbs[0]);
        console.log('Sub category:', crumbs.length > 1 ? crumbs[crumbs.length - 1] : 'None');
      }
    });
    
    // Показываем уникальные категории
    const categories = [...new Set(products.map(p => p.category))];
    console.log('\nУникальные категории:', categories);
    
    // Показываем товары с breadcrumbs
    const withBreadcrumbs = products.filter(p => p.breadcrumbs);
    console.log('\nТоваров с breadcrumbs:', withBreadcrumbs.length);
  });
});

req.on('error', (e) => {
  console.error(`Проблема с запросом: ${e.message}`);
});

req.end();
