# Security Hardening

This project includes a baseline hardening profile for local and production-like deployments.

## Enabled controls

- `helmet` security headers with active CSP policy
- strict CORS policy via `CORS_ALLOWED_ORIGINS`
- `X-Request-Id` generation/propagation for each request
- structured request logging without raw PII payloads
- global API rate limiting for `/api/*`
- dedicated lookup rate limiting for `/api/orders/lookup`
- admin API bearer auth (`/api/admin/*`)
- request body size limits and HTTP server timeouts

## Required environment variables

- `ADMIN_TOKEN` for protected admin routes
- `DISABLE_ADMIN_AUTH=1` only for local development
- `CORS_ALLOWED_ORIGINS` (comma separated)
- `CSP_REPORT_ONLY` to switch CSP into report-only mode during rollout

## Recommended production values

- `TRUST_PROXY=1` when behind a reverse proxy
- `NODE_ENV=production` to enforce strict CORS behavior
- `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS` tuned to traffic profile
- `REQUEST_TIMEOUT_MS` and `HEADERS_TIMEOUT_MS` aligned with proxy/gateway timeouts

## Security checks

Run locally:

```bash
npm run verify
npm run security:audit
```

CI runs both verify and smoke API checks.

## Dependency posture

- Runtime SQLite driver uses `better-sqlite3`.
- Legacy `sqlite3` dependency was removed from production dependency graph to reduce transitive vulnerability surface.
