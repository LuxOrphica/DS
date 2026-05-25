---
name: smart-home-checkout-orders-change
description: Use when changing smart-home-shop cart, checkout, order creation, order validation, customer order cabinet, order API routes, order schema, totals, contact fields, delivery/payment fields, or order persistence. Applies to public/cart.js, order-related public UI, routes/order-schema.js, route handlers, services, and test/orders-* or smoke tests.
---

# Smart Home Checkout Orders Change

Follow this workflow for cart, checkout, and order work. Keep `AGENTS.md` higher priority than this skill.

## Spec

- Identify the buyer journey being changed: add to cart, edit quantities, checkout submit, order lookup, admin order view, or persistence.
- Define acceptance criteria for totals, required fields, validation errors, success state, and saved order data.
- Note whether backward compatibility with existing order records matters.

## Build

- Keep client validation and server validation aligned.
- Prefer schema-level validation for order payloads when possible.
- Preserve cart storage behavior unless migration is part of the task.
- Avoid changing checkout copy, field names, or persistence format incidentally.

## Verify

Run:

```bash
npm run encoding:check
npm run check:encoding-ui
npm run lint
npm run typecheck
npm run test:unit -- test/orders-cabinet-ui.test.js
npm run test:node -- test/smoke.test.js
```

For shared order route/schema changes, also run:

```bash
npm test
```

## Review

Before finishing, check:

- Empty cart, quantity updates, remove item, and checkout submit still work.
- Required fields reject incomplete data with clear errors.
- Totals are calculated consistently between UI and backend.
- Existing orders can still be read if persistence/schema changed.
- Success and failure states are not confused in the UI.
