const pino = require("pino");

function createLogger(name, bindings = {}) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || "info",
    base: {
      app: "smart-home-shop",
      ...bindings
    }
  });
}

module.exports = {
  createLogger
};
