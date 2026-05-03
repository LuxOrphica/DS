const crypto = require("crypto");
const { parseBearerToken, getAdminSessionId } = require("../middleware/admin-auth");

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function setSessionCookie(res, sessionId, ttlMs, req, { forceSecure = false } = {}) {
  const maxAgeSec = Math.max(60, Math.floor(Number(ttlMs || 0) / 1000));
  const secure = forceSecure ||
    req.secure ||
    String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
  const parts = [
    `admin_session=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSec}`
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
}

function registerAdminSessionRoutes(app, deps) {
  const {
    disableAdminAuth = false,
    adminToken = "",
    adminSessionStore = null,
    isProduction = false
  } = deps || {};

  const authDisabled = Boolean(disableAdminAuth);
  const token = String(adminToken || "").trim();
  const store = adminSessionStore;

  app.get("/api/admin/session/status", (req, res) => {
    if (authDisabled) return res.json({ ok: true, authenticated: true, mode: "disabled" });

    const incoming = parseBearerToken(req.headers.authorization);
    if (token && incoming && timingSafeEqual(incoming, token)) {
      return res.json({ ok: true, authenticated: true, mode: "token" });
    }

    if (store) {
      const sessionId = getAdminSessionId(req);
      const session = sessionId ? store.getSession(sessionId, { touch: true }) : null;
      if (session) {
        return res.json({
          ok: true,
          authenticated: true,
          mode: "session",
          expiresAt: session.expiresAt
        });
      }
    }

    return res.status(401).json({ ok: false, authenticated: false, error: "Unauthorized" });
  });

  app.post("/api/admin/session/login", (req, res) => {
    if (authDisabled) {
      return res.json({ ok: true, authenticated: true, mode: "disabled" });
    }
    if (!token) {
      return res.status(503).json({
        ok: false,
        error: "Admin auth is not configured. Set ADMIN_TOKEN or DISABLE_ADMIN_AUTH=1 for local dev."
      });
    }
    if (!store) {
      return res.status(500).json({ ok: false, error: "Admin session store is not configured" });
    }

    const incoming = String(req.body?.token || "").trim();
    if (!incoming || !timingSafeEqual(incoming, token)) {
      const ip = req.ip || req.socket?.remoteAddress || "-";
      const requestId = req.requestId || "-";
      console.warn(`[${requestId}] Admin login failed from ${ip}`);
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const session = store.createSession({
      ip: req.ip || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || ""
    });
    setSessionCookie(res, session.id, store.ttlMs, req, { forceSecure: isProduction });
    return res.json({
      ok: true,
      authenticated: true,
      mode: "session",
      expiresAt: session.expiresAt
    });
  });

  app.post("/api/admin/session/logout", (req, res) => {
    if (!authDisabled && store) {
      const sessionId = getAdminSessionId(req);
      if (sessionId) store.revokeSession(sessionId);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  });
}

module.exports = {
  registerAdminSessionRoutes
};
