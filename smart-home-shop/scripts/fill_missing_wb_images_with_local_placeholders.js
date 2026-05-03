#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const OUT_DIR = path.join(ROOT, "public", "images", "products", "mirror", "wb-fallback");
const OUT_PREFIX = "/images/products/mirror/wb-fallback/";

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSvg({ title, subtitle }) {
  const t = esc(title || "Wiren Board");
  const s = esc(subtitle || "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8edf7"/>
      <stop offset="100%" stop-color="#d8e1f2"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#bg)"/>
  <rect x="220" y="220" width="760" height="460" rx="24" fill="#ffffff" opacity="0.92"/>
  <text x="600" y="360" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#1e2a44">Wiren Board</text>
  <text x="600" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#2c3f68">${t}</text>
  <text x="600" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#5a6d90">${s}</text>
  <text x="600" y="565" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#7c8aa8">Локальная заглушка до получения оригинального фото</text>
</svg>`;
}

function safeName(raw) {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const db = new Database(DB_PATH);

  const rows = db.prepare(`
    SELECT id, article, name, image
    FROM products
    WHERE LOWER(COALESCE(brand, '')) LIKE '%wiren%'
      AND LOWER(COALESCE(image, '')) LIKE 'http%'
  `).all();

  if (!rows.length) {
    console.log("No remote Wiren Board images remain.");
    return;
  }

  const update = db.prepare(`
    UPDATE products
    SET image = @image,
        gallery_json = @galleryJson,
        updated_at = @updatedAt
    WHERE id = @id
  `);

  let updated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const base = safeName(row.id || row.article || row.name || "wb-item");
      const file = `${base}.svg`;
      const diskPath = path.join(OUT_DIR, file);
      if (!fs.existsSync(diskPath)) {
        const svg = buildSvg({ title: row.article || row.id, subtitle: row.name || "" });
        fs.writeFileSync(diskPath, svg, "utf8");
      }
      const localUrl = `${OUT_PREFIX}${file}`;
      update.run({
        id: row.id,
        image: localUrl,
        galleryJson: JSON.stringify([localUrl]),
        updatedAt: new Date().toISOString()
      });
      updated += 1;
    }
  });
  tx();

  console.log(JSON.stringify({ placeholdersApplied: updated }, null, 2));
}

main();
