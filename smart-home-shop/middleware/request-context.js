const crypto = require("crypto");

function createRequestContextMiddleware({ enableLogs = true } = {}) {
  const shouldLog = Boolean(enableLogs);
  return function requestContext(req, res, next) {
    const incoming = String(req.headers["x-request-id"] || "").trim();
    const id = incoming || crypto.randomUUID();
    req.requestId = id;
    res.setHeader("X-Request-Id", id);

    if (!shouldLog) return next();

    const started = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - started;
      const line = JSON.stringify({
        at: new Date().toISOString(),
        requestId: id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        ip: req.ip || ""
      });
      console.log(line);
    });

    return next();
  };
}

module.exports = {
  createRequestContextMiddleware
};
