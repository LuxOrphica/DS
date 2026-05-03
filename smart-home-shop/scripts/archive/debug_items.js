const http = require('http');

function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

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
    
    // Симулируем переход в категорию "Проводное оборудование УД"
    const categoryName = "Проводное оборудование УД";
    const inCategory = productsWithHierarchy.filter((p) => p.topCategory === categoryName);
    const subCategories = [...new Set(inCategory.map((p) => p.subCategory))];
    
    console.log(`Категория: ${categoryName}`);
    console.log(`Товаров в категории: ${inCategory.length}`);
    console.log(`Подкатегории: ${subCategories.join(', ')}`);
    
    // Без выбранной подкатегории
    const selectedSub = "";
    const items = productsWithHierarchy.filter((p) => {
      const byCategory = p.topCategory === categoryName;
      const bySub = !selectedSub || p.subCategory === selectedSub;
      return byCategory && bySub;
    });
    
    console.log(`Товаров для отображения (без подкатегории): ${items.length}`);
    
    // С выбранной подкатегорией
    const selectedSub2 = "Контроллеры";
    const items2 = productsWithHierarchy.filter((p) => {
      const byCategory = p.topCategory === categoryName;
      const bySub = !selectedSub2 || p.subCategory === selectedSub2;
      return byCategory && bySub;
    });
    
    console.log(`Товаров для отображения (с подкатегорией "${selectedSub2}"): ${items2.length}`);
    console.log(`Примеры товаров: ${items2.slice(0, 3).map(p => p.name).join(', ')}`);
  });
});
