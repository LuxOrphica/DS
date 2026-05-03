function parseAllowedOrigins(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function createCorsOptions({ allowedOrigins = [], strictMode = false } = {}) {
  const whitelist = new Set(allowedOrigins);
  const isStrict = Boolean(strictMode);

  return {
    origin(origin, callback) {
      // Same-origin or non-browser clients
      if (!origin) return callback(null, true);

      if (whitelist.has(origin)) return callback(null, true);

      if (!isStrict && whitelist.size === 0) {
        // Local/dev fallback only.
        return callback(null, true);
      }

      return callback(new Error("CORS origin is not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    credentials: false,
    maxAge: 600
  };
}

module.exports = {
  parseAllowedOrigins,
  createCorsOptions
};
