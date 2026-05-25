const Sentry = require("@sentry/node");

function initSentry({
  dsn = process.env.SENTRY_DSN,
  environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
  release = process.env.SENTRY_RELEASE || ""
} = {}) {
  const normalizedDsn = String(dsn || "").trim();
  if (!normalizedDsn) {
    return {
      enabled: false,
      captureException() {}
    };
  }

  Sentry.init({
    dsn: normalizedDsn,
    environment,
    release: release || undefined,
    tracesSampleRate: Math.max(0, Math.min(1, Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0)))
  });

  return {
    enabled: true,
    captureException(error, req) {
      Sentry.captureException(error, {
        tags: {
          requestId: req?.requestId || "",
          method: req?.method || "",
          route: req?.route?.path || req?.path || ""
        },
        extra: {
          url: req?.originalUrl || req?.url || "",
          ip: req?.ip || ""
        }
      });
    }
  };
}

module.exports = {
  initSentry
};
