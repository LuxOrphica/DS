---
name: smart-home-admin-ui-change
description: Use when changing smart-home-shop admin UI, admin pages, admin scripts, admin styles, admin API interactions, forms, filters, product/category/order management controls, or admin visual behavior. Applies especially to public/admin-new.html, public/admin-new.js, public/styles.css, routes/admin-like endpoints, and test/admin-*.
---

# Smart Home Admin UI Change

Follow this workflow for admin UI work. Keep `AGENTS.md` higher priority than this skill.

## Spec

- Name the admin workflow being changed: products, categories, orders, filters, bulk actions, or settings.
- Identify the user action, expected result, empty state, loading/error state, and validation behavior.
- Call out any Cyrillic text touched or adjacent to touched blocks.

## Build

- Make minimal edits in the specific admin block.
- Avoid duplicate triggers such as auto-apply plus button submit unless the task asks for both.
- Keep controls semantically clear: buttons behave as commands, inputs as data entry, filters as filters.
- Preserve existing admin state, selectors, API contracts, and event delegation patterns unless the change requires otherwise.

## Verify

Run:

```bash
npm run encoding:check
npm run check:encoding-ui
npm run lint
npm run typecheck
npm run test:unit -- test/admin-ui.test.js
npm run test:node -- test/admin-api.test.js
```

For broader admin changes, also run:

```bash
npm test
```

## Visual Sanity

Open the changed admin surface locally when practical and check:

- No broken Cyrillic or mojibake in touched and neighboring blocks.
- No missing sections, clipped text, overlapping controls, or dead buttons.
- Changed filters/forms can complete the intended workflow once.
- Errors are visible and do not leave the UI in a misleading success state.
