const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./data/shop.db');

db.serialize(() => {
  console.log("Adding 'subcategory' column to 'products' table...");

  db.run(
    `ALTER TABLE products ADD COLUMN subcategory TEXT`,
    function (err) {
      if (err) {
        console.error("Error adding 'subcategory' column:", err.message);
      } else {
        console.log("'subcategory' column added successfully.");
      }
    }
  );
});

db.close();