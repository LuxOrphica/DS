const http = require('http');

function splitBreadcrumbs(value) {
  return String(value || "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.toLowerCase() !== "товары");
}

function withHierarchy(product) {
  const crumbs = splitBreadcrumbs(product.breadcrumbs);
  const topCategory = crumbs[0] || product.category || "Без категории";
  
  // Используем group для подкатегорий, если нет breadcrumbs
  let subCategory;
  if (crumbs.length > 1) {
    subCategory = crumbs[crumbs.length - 1];
  } else if (product.group && product.group !== topCategory) {
    subCategory = product.group;
  } else {
    subCategory = topCategory;
  }
  
  return { ...product, topCategory, subCategory };
}

http.get('http://localhost:3030/api/products', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const products = JSON.parse(data);
    const productsWithHierarchy = products.map(withHierarchy);
    
    // Группируем по категориям и подкатегориям
    const categories = {};
    productsWithHierarchy.forEach(p => {
      if (!categories[p.topCategory]) {
        categories[p.topCategory] = new Set();
      }
      categories[p.topCategory].add(p.subCategory);
    });
    
    console.log('Структура категорий:');
    Object.entries(categories).forEach(([category, subcats]) => {
      console.log(`\n${category}:`);
      Array.from(subcats).forEach(sub => {
        console.log(`  - ${sub}`);
      });
    });
  });
});
