function createApiRateLimitMiddleware({
  windowMs = 60_000,
  maxRequests = 240,
  maxTrackedIps = 10_000,
  sweepIntervalMs = 30_000
} = {}) {
  const bucket = new Map();
  let lastSweepTs = 0;

  function sweepStale(now) {
    if (now - lastSweepTs < sweepIntervalMs) return;
    lastSweepTs = now;
    for (const [key, row] of bucket.entries()) {
      if (!row || now - Number(row.ts || 0) > windowMs) {
        bucket.delete(key);
      }
    }
  }

  function evictOldest() {
    if (bucket.size <= maxTrackedIps) return;
    let oldestKey = "";
    let oldestTs = Number.POSITIVE_INFINITY;
    for (const [key, row] of bucket.entries()) {
      const ts = Number(row?.ts || 0);
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestKey = key;
      }
    }
    if (oldestKey) bucket.delete(oldestKey);
  }

  return function apiRateLimit(req, res, next) {
    if (!req.path.startsWith("/api/")) return next();

    const now = Date.now();
    sweepStale(now);
    const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
    const row = bucket.get(ip) || { ts: now, n: 0 };

    if (now - row.ts > windowMs) {
      row.ts = now;
      row.n = 0;
    }

    row.n += 1;
    bucket.set(ip, row);
    evictOldest();

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
