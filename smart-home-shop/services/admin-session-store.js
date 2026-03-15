const crypto = require("crypto");

function createAdminSessionStore({ ttlMs = 30 * 60 * 1000 } = {}) {
  const ttl = Math.max(60_000, Number(ttlMs || 0));
  const sessions = new Map();

  function now() {
    return Date.now();
  }

  function sweepExpired(currentTs = now()) {
    for (const [id, session] of sessions.entries()) {
      if (!session || Number(session.expiresAt || 0) <= currentTs) {
        sessions.delete(id);
      }
    }
  }

  function createSession(meta = {}) {
    const ts = now();
    const id = crypto.randomBytes(32).toString("hex");
    const session = {
      id,
      createdAt: ts,
      lastSeenAt: ts,
      expiresAt: ts + ttl,
      meta: {
        ip: String(meta.ip || "").trim(),
        userAgent: String(meta.userAgent || "").trim()
      }
    };
    sessions.set(id, session);
    sweepExpired(ts);
    return session;
  }

  function getSession(id, { touch = true } = {}) {
    const sessionId = String(id || "").trim();
    if (!sessionId) return null;
    const ts = now();
    const session = sessions.get(sessionId);
    if (!session) return null;
    if (Number(session.expiresAt || 0) <= ts) {
      sessions.delete(sessionId);
      return null;
    }
    if (touch) {
      session.lastSeenAt = ts;
      session.expiresAt = ts + ttl;
      sessions.set(sessionId, session);
    }
    return { ...session };
  }

  function revokeSession(id) {
    const sessionId = String(id || "").trim();
    if (!sessionId) return false;
    return sessions.delete(sessionId);
  }

  return {
    ttlMs: ttl,
    createSession,
    getSession,
    revokeSession,
    sweepExpired
  };
}

module.exports = {
  createAdminSessionStore
};
