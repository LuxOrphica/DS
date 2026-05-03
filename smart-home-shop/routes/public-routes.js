function createLookupLimiter({
  windowMs = 60_000,
  maxRequests = 20,
  maxTrackedIps = 5_000,
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

  return function lookupLimiter(req, res, next) {
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
    if (row.n > maxRequests) {
      return res.status(429).json({ ok: false, error: "Too many lookup requests. Try again later." });
    }
    return next();
  };
}

function maskPhone(phone) {
  const s = String(phone || "");
  const digits = s.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskEmail(email) {
  const s = String(email || "").trim();
  if (!s.includes("@")) return "";
  const [user, domain] = s.split("@");
  if (!user || !domain) return "";
  return `${user.slice(0, 1)}***@${domain}`;
}

function maskAddress(address) {
  const s = String(address || "").trim();
  if (!s) return "";
  return `${s.slice(0, 8)}...`;
}

function toPublicOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    id: order.id,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    deliveryMethod: order.deliveryMethod,
    deliveryComment: order.deliveryComment,
    total: order.total,
    customerName: `${String(order.customerName || "").slice(0, 1)}***`,
    customerPhoneMasked: maskPhone(order.customerPhone),
    customerEmailMasked: maskEmail(order.customerEmail),
    customerAddressMasked: maskAddress(order.customerAddress),
    itemsCount: items.length,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      image: item.image,
      name: item.name,
      article: item.article,
      qty: item.qty,
      price: item.price,
      priceValue: item.priceValue,
      priceCurrency: item.priceCurrency,
      priceRub: item.priceRub
    }))
  };
}

function registerPublicRoutes(app, deps) {
  const {
    dbPath,
    getStats,
    getLatestExchangeRate,
    listProducts,
    createOrder,
    listPublicOrdersByIds,
    listPublicOrdersByLookup
  } = deps;

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      dbPath,
      stats: getStats(),
      eurRubRate: getLatestExchangeRate("EUR", "RUB") || null,
      now: new Date().toISOString()
    });
  });

  app.get("/api/exchange-rate", (req, res) => {
    const eurRub = getLatestExchangeRate("EUR", "RUB");
    res.json({ eurRub });
  });

  app.get("/api/products", (req, res) => {
    res.json(listProducts());
  });

  app.post("/api/orders", (req, res) => {
    const { customer, items, total, paymentMethod, deliveryComment } = req.body || {};

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return res.status(400).json({ error: "Please provide name, phone and address." });
    }

    if (String(customer.name).trim().length > 200) {
      return res.status(400).json({ error: "Name is too long." });
    }
    if (String(customer.phone).trim().length > 50) {
      return res.status(400).json({ error: "Phone is too long." });
    }
    if (String(customer.address).trim().length > 500) {
      return res.status(400).json({ error: "Address is too long." });
    }
    if (customer.email && String(customer.email).trim().length > 254) {
      return res.status(400).json({ error: "Email is too long." });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    if (items.length > 200) {
      return res.status(400).json({ error: "Too many items in cart." });
    }

    const order = createOrder({
      customer,
      items,
      total,
      paymentMethod,
      deliveryComment
    });

    return res.status(201).json({
      ok: true,
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      deliveryMethod: order.deliveryMethod,
      message: "Order accepted. We'll contact you shortly."
    });
  });

  const lookupLimiter = createLookupLimiter({
    windowMs: Math.max(5_000, Number(process.env.PUBLIC_LOOKUP_WINDOW_MS || 60_000)),
    maxRequests: Math.max(1, Number(process.env.PUBLIC_LOOKUP_RATE_LIMIT || 20))
  });

  app.get("/api/orders/lookup", lookupLimiter, (req, res) => {
    const query = String(req.query.query || "").trim();
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
    if (query.length < 4) {
      return res.status(400).json({ ok: false, error: "Provide at least 4 characters for search." });
    }
    const data = listPublicOrdersByLookup({ query, limit });
    const publicRows = (Array.isArray(data.rows) ? data.rows : []).map(toPublicOrder);
    return res.json({ ok: true, rows: publicRows, total: publicRows.length });
  });

  app.get("/api/orders/mine", lookupLimiter, (req, res) => {
    const idsRaw = String(req.query.ids || "").trim();
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
    const ids = idsRaw
      .split(",")
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, limit);
    if (!ids.length) return res.json({ ok: true, rows: [], total: 0 });
    const data = listPublicOrdersByIds({ ids, limit });
    const publicRows = (Array.isArray(data.rows) ? data.rows : []).map(toPublicOrder);
    return res.json({ ok: true, rows: publicRows, total: publicRows.length });
  });
}

module.exports = { registerPublicRoutes };
