const crypto = require("crypto");

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still consume time proportional to `a` to avoid length-based timing leak
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseBearerToken(authHeader) {
  const raw = String(authHeader || "").trim();
  if (!raw) return "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return String(m?.[1] || "").trim();
}

function parseCookies(cookieHeader) {
  const raw = String(cookieHeader || "");
  if (!raw) return {};

  return raw.split(";").reduce((acc, chunk) => {
    const [key, ...rest] = String(chunk || "").split("=");
    const name = String(key || "").trim();
    if (!name) return acc;
    acc[name] = decodeURIComponent(rest.join("=").trim());
    return acc;
  }, {});
}

function getAdminSessionId(req) {
  const cookies = parseCookies(req?.headers?.cookie);
  return String(cookies.admin_session || "").trim();
}

function createAdminAuthMiddleware({ adminToken = "", disableAuth = false, validateAdminSession = null } = {}) {
  const token = String(adminToken || "").trim();
  const authDisabled = Boolean(disableAuth);
  const hasSessionValidator = typeof validateAdminSession === "function";

  return function adminAuth(req, res, next) {
    if (authDisabled) return next();

    const incoming = parseBearerToken(req.headers.authorization);
    if (incoming && token && timingSafeEqual(incoming, token)) {
      req.adminAuth = { type: "token" };
      return next();
    }

    if (hasSessionValidator) {
      const sessionId = getAdminSessionId(req);
      if (sessionId) {
        const session = validateAdminSession(sessionId, { req });
        if (session) {
          req.adminAuth = { type: "session", session };
          return next();
        }
      }
    }

    if (!token && !hasSessionValidator) {
      return res.status(503).json({
        ok: false,
        error: "Admin auth is not configured. Set ADMIN_TOKEN or DISABLE_ADMIN_AUTH=1 for local dev."
      });
    }

    return res.status(401).json({ ok: false, error: "Unauthorized" });
  };
}

module.exports = {
  createAdminAuthMiddleware,
  parseBearerToken,
  parseCookies,
  getAdminSessionId
};
