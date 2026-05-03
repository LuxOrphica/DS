// Vercel serverless entry point
process.env.DB_PATH = process.env.DB_PATH || "/tmp/shop.db";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

module.exports = require("../server");
