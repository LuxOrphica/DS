---
name: smart-home-release-gate
description: Use before declaring smart-home-shop work ready to ship, deploy, merge, or hand off. Applies after code, UI, catalog, data, config, dependency, test, or deployment changes when final verification, risk review, and a concise ship log are needed.
---

# Smart Home Release Gate

Use this as the final gate after implementation. Keep `AGENTS.md` higher priority than this skill.

## Required Checks

Run the project gates unless the user explicitly limits verification:

```bash
npm run encoding:check
npm run check:encoding-ui
npm run verify
```

For dependency or server/security-sensitive changes, also run:

```bash
npm run security:audit
```

## Runtime Sanity

When the change affects UI or routing, start the app and inspect the relevant path:

```bash
npm run start
```

Default local URL:

```text
http://localhost:3030
```

Check the exact surface touched: storefront, product card/page, cart, checkout, order cabinet, or admin.

## Ship Log

Before final response, summarize:

- What changed.
- What was verified, including failed or skipped checks.
- Any catalog snapshot/data changes.
- Any remaining risk or follow-up that matters.
