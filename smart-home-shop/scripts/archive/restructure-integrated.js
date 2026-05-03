const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./data/shop.db');

const subcategories = {
  'Освещение': ['Lighting'],
  'Затенение/Шторы': ['Shading', 'Curtains'],
  'Климат': ['Thermostat'],
  'Безопасность': ['Sensors'],
  'Контроль доступа': ['Lock'],
  'Аудиосервер': ['Audio Server'],
  'Энергия': ['Energy Meter']
};

db.serialize(() => {
  console.log("Restructuring 'Интегрированное оборудование УД'...");

  Object.entries(subcategories).forEach(([subcategory, products]) => {
    products.forEach(product => {
      db.run(
        `UPDATE products SET subcategory = ? WHERE name LIKE ? AND category = 'Интегрированное оборудование УД'`,
        [subcategory, `%${product}%`],
        function (err) {
          if (err) {
            console.error(`Error updating product '${product}' to subcategory '${subcategory}':`, err.message);
          }
        }
      );
    });
  });

  console.log("Restructuring complete.");
});

db.close();