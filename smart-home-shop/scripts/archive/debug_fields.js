const http = require('http');

http.get('http://localhost:3030/api/products', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const products = JSON.parse(data);
    
    // Показываем все поля первого товара
    const firstProduct = products[0];
    console.log('Поля товара:');
    Object.keys(firstProduct).forEach(key => {
      console.log(`${key}: ${firstProduct[key]}`);
    });
    
    // Показываем group_name для всех товаров
    console.log('\nGroup names:');
    const groupNames = [...new Set(products.map(p => p.group_name).filter(Boolean))];
    console.log('Уникальные group_name:', groupNames);
    
    // Показываем бренды
    console.log('\nБренды:');
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
    console.log('Уникальные бренды:', brands);
  });
});
