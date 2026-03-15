function createApiRateLimitMiddleware({ windowMs = 60_000, maxRequests = 240 } = {}) {
  const bucket = new Map();

  return function apiRateLimit(req, res, next) {
    if (!req.path.startsWith("/api/")) return next();

    const now = Date.now();
    const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
    const row = bucket.get(ip) || { ts: now, n: 0 };

    if (now - row.ts > windowMs) {
      row.ts = now;
      row.n = 0;
    }

    row.n += 1;
    bucket.set(ip, row);

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - row.n)));

    if (row.n > maxRequests) {
      return res.status(429).json({ ok: false, error: "Too many API requests. Try again later." });
    }

    return next();
  };
}

module.exports = {
  createApiRateLimitMiddleware
};
