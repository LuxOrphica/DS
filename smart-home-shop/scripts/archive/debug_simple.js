const http = require('http');

http.get('http://localhost:3030/api/products', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const products = JSON.parse(data);
    console.log('Всего товаров:', products.length);
    
    const sample = products.slice(0, 3);
    sample.forEach((p, i) => {
      console.log(`\nТовар ${i+1}:`);
      console.log('Name:', p.name);
      console.log('Category:', p.category);
      console.log('Breadcrumbs:', p.breadcrumbs);
    });
    
    const categories = [...new Set(products.map(p => p.category))];
    console.log('\nУникальные категории:', categories);
    
    // Проверяем breadcrumbs
    const withBreadcrumbs = products.filter(p => p.breadcrumbs);
    console.log('\nТоваров с breadcrumbs:', withBreadcrumbs.length);
    
    if (withBreadcrumbs.length > 0) {
      console.log('\nПример breadcrumbs:');
      withBreadcrumbs.slice(0, 3).forEach(p => {
        console.log(`${p.name}: "${p.breadcrumbs}"`);
      });
    }
  });
});
