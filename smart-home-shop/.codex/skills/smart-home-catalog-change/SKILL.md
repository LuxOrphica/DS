---
name: smart-home-catalog-change
description: Use when changing smart-home-shop catalog data, product importers, parsers, normalization, filters, images, brand/category sync, catalog integrity checks, or golden snapshots. Applies to scripts/import_*.js, scripts/sync_*.js, scripts/normalize_*.js, public catalog rendering, routes that serve catalog data, and tests under test/catalog-* or parser-*.
---

# Smart Home Catalog Change

Follow this workflow for catalog work. Keep `AGENTS.md` higher priority than this skill.

## Spec

- State which data source, brand, category, or product surface changes.
- Identify whether the change affects persisted data, generated snapshots, or only runtime rendering.
- Define acceptance criteria around product count, required fields, prices, images, filters, and category placement.

## Build

- Prefer targeted edits to importers, normalizers, routes, or renderers.
- Do not run broad rewrite, formatter, or encoding-fix passes unless explicitly requested.
- Preserve UTF-8 and use surgical patches for JS, HTML, CSS, JSON, Markdown, SQL, and YAML.
- Treat generated catalog data and snapshots as intentional artifacts: update them only when the behavior change requires it.

## Verify

Run the smallest relevant set first, then broaden if the touched surface is shared:

```bash
npm run encoding:check
npm run check:encoding-ui
npm run lint
npm run typecheck
npm run audit:catalog
npm run test:golden
npm test
```

Use parser-specific tests when touching one vendor:

```bash
npm run test:unit -- test/parser-hite.test.js
npm run test:unit -- test/parser-larnitech.test.js
npm run test:unit -- test/parser-loxone.test.js
npm run test:unit -- test/parser-wirenboard.test.js
```

## Review

Before finishing, check:

- Product identity fields remain stable unless migration is intentional.
- Prices, currency/exchange behavior, availability, images, docs, and characteristics still render.
- Filters and category counts match the changed data model.
- Golden snapshot changes are explained in the final response.
