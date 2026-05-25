# AGENTS

## Primary Rule (Read First)

For any task, always follow the safe path:

1. Strictly forbidden: massive re-save operations (bulk rewrite of many lines/files without direct necessity).
2. No risky file rewrite methods for source files.
3. Mandatory gate after any edits:
   - `node scripts/encoding-hygiene.js --check`
4. If the gate fails, stop and fix encoding first.

Non-negotiable:
- Do not use `encoding-hygiene.js --write` unless the user explicitly requests it.
- Do not run bulk format/replace passes across source files as a "quick fix".
- Prefer surgical edits only (minimal diff, exact target lines).

## Encoding Contract (Mandatory)

1. All text files must remain `UTF-8`:
   - `*.js`, `*.html`, `*.css`, `*.json`, `*.md`, `*.sql`, `*.yml`, `*.yaml`.
2. It is forbidden to rewrite source files via shell redirection:
   - do not use PowerShell `>` / `>>` / `Set-Content` for source code files.
   - use safe editor save or repository scripts that explicitly preserve UTF-8.
   - do not use one-shot full-file rewrite commands for source files when a targeted patch is possible.
3. Before finishing any task, the agent must run:
   - `npm run encoding:check`
   - `npm run check:encoding-ui`
4. Delivery is forbidden if at least one check fails.
5. If mojibake is detected (`Р`, `С`, `Ð`, `Ñ` artifacts), the agent must:
   - stop feature work,
   - clean affected files,
   - rerun checks,
   - verify UI text visually in touched and neighboring blocks.

## UI Safety Contract

1. Any change in admin UI must include a quick visual sanity pass:
   - no broken Cyrillic,
   - no missing sections,
   - no dead controls in changed blocks.
2. For interactive filters/forms:
   - avoid duplicate triggers (button + auto-apply) unless explicitly required.
   - prefer clear control semantics (buttons look like buttons, inputs like inputs).

## Project Workflow Skills

Local workflow skills live in `.codex/skills/`. Use them as task-specific gates on top of this file:

- `smart-home-catalog-change`: catalog data, importers, parsers, normalization, images, filters, and golden snapshots.
- `smart-home-admin-ui-change`: admin HTML/JS/CSS, admin flows, forms, filters, and admin API interactions.
- `smart-home-checkout-orders-change`: cart, checkout, order validation, order persistence, and customer order cabinet.
- `smart-home-release-gate`: final verification before declaring work ready to ship, deploy, merge, or hand off.

Order of authority: user request, this `AGENTS.md`, then the relevant local skill. If a skill conflicts with this file, follow this file.
