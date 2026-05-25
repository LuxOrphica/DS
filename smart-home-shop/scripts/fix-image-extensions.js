#!/usr/bin/env node
// Updates .png to .webp for mirror images in Turso DB.
require("dotenv").config();
const { createClient } = require("@libsql/client");

const turso = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function main() {
  // Fix products.image
  const r1 = await turso.execute(
    `UPDATE products SET image = REPLACE(image, '.png', '.webp')
     WHERE image LIKE '%/mirror/%.png'`
  );
  console.log("products.image fixed:", r1.rowsAffected);

  // Fix products.gallery_json
  const rows = await turso.execute(
    `SELECT id, gallery_json FROM products WHERE gallery_json LIKE '%/mirror/%.png%'`
  );
  console.log("products with gallery to fix:", rows.rows.length);

  let gFixed = 0;
  const stmts = rows.rows.map(row => {
    const fixed = String(row.gallery_json).replace(/\/mirror\/([^"]+)\.png/g, "/mirror/$1.webp");
    gFixed++;
    return { sql: `UPDATE products SET gallery_json = :g WHERE id = :id`, args: { g: fixed, id: row.id } };
  });
  if (stmts.length) {
    for (let i = 0; i < stmts.length; i += 50) {
      await turso.batch(stmts.slice(i, i + 50), "write");
    }
  }
  console.log("products.gallery_json fixed:", gFixed);
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
