const http = require('http');

http.get('http://localhost:3030/api/products', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const products = JSON.parse(data);
    console.log('Проверка ID товаров:');
    products.slice(0, 5).forEach((p, i) => {
      console.log(`Товар ${i+1}:`);
      console.log('  ID:', p.id);
      console.log('  Article:', p.article);
      console.log('  Name:', p.name);
    });
    
    const nullIds = products.filter(p => p.id === null);
    console.log(`\nТоваров с ID = null: ${nullIds.length}`);
    
    const withIds = products.filter(p => p.id);
    console.log(`Товаров с корректным ID: ${withIds.length}`);
  });
});
