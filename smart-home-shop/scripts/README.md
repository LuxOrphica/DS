# Scripts

## Operational scripts (use via `npm run ...`)
- `start_server_safe.js`
- `encoding-hygiene.js`
- `audit_catalog_quality.js`
- `clean_catalog_quality.js`
- `audit_catalog_integrity.js`
- `normalize_catalog_attributes.js`
- `import_*.js` and `sync_*_live.js` (data import/update pipeline)

## Maintenance scripts
- `fix-encoding.js`, `fix-mojibake.js` (compat wrappers over `encoding-hygiene.js --write`)
- `cleanup_larnitech_functions_and_descriptions.js`
- `normalize_catalog_v2_export.js`, `export_functional_catalog_normalized.js`
- `audit_and_mark_structure_conflicts.js`, `audit_category_browser_structure.js`

## Inventory/audit
- `audit_scripts_inventory.js` (builds `reports/scripts_inventory_audit.{json,md}`)

## Rule
- New one-off scripts should be either:
  - moved to `scripts/archive/` after use, or
  - wired into `package.json` if they are part of regular workflow.
