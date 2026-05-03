const { initSchema, getStats, dbPath } = require("../db/database");

initSchema();
const stats = getStats();

console.log("DB initialized");
console.log(`Path: ${dbPath}`);
console.log(`Products: ${stats.products}`);
console.log(`Orders: ${stats.orders}`);
