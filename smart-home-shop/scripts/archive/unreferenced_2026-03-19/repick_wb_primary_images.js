#!/usr/bin/env node
"use strict";

const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const fs = require('fs');

function uniq(list) {
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const s = String(x || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function scoreImage(url, slug) {
  const u = String(url || '').toLowerCase();
  let score = 0;
  if (!u) return -9999;
  if (u.includes('wirenboard.com')) score += 8;
  if (u.includes('/_ipx/')) score += 12;
  if (/\.(png|jpe?g|webp|avif)(\?|$)/.test(u)) score += 8;
  if (slug && u.includes('/' + slug.toLowerCase() + '/')) score += 90;
  if (/(main|front|top|full[-_]?face|fullface|side\d?|3[-_]?4|product|photo|hero)/.test(u)) score += 80;
  if (/(web[_-]?ui|dashboard|register|technical|characteristics|diagram|scheme|schema|wiring|button|interface|modbus|config|configuration|indication|table|manual|datasheet|quality_control|certificates|logo)/.test(u)) score -= 140;
  const m = u.match(/w_(\d+)/);
  if (m) {
    const w = Number(m[1]);
    if (w && w < 500) score -= 20;
    if (w && w >= 1000) score += 10;
  }
  return score;
}

function slugFromSource(url) {
  try {
    const p = new URL(String(url || '')).pathname;
    const parts = p.split('/').filter(Boolean);
    return String(parts[parts.length - 1] || '').toLowerCase();
  } catch {
    return '';
  }
}

async function main() {
  const db = new Database('data/shop.db');
  const rows = db.prepare(`
    SELECT id, name, brand, image, source_url AS sourceUrl, gallery_json AS galleryJson
    FROM products
    WHERE lower(coalesce(brand,'')) like '%wiren%'
      AND source_url LIKE 'https://wirenboard.com/%'
    ORDER BY name
  `).all();

  console.log('WB rows:', rows.length);
  if (!rows.length) return;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const update = db.prepare('UPDATE products SET image=@image, gallery_json=@galleryJson, updated_at=@updatedAt WHERE id=@id');
  const now = new Date().toISOString();

  let scanned = 0;
  let updated = 0;
  const report = [];

  for (const row of rows) {
    scanned++;
    const sourceUrl = String(row.sourceUrl || '').trim();
    const slug = slugFromSource(sourceUrl);
    if (!sourceUrl) continue;

    try {
      await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1200);

      const rawImgs = await page.$$eval('img', (els) => els.map((e) => e.getAttribute('src') || '').filter(Boolean));
      const candidates = uniq(
        rawImgs
          .map((x) => {
            try { return new URL(x, window.location.href).toString(); } catch { return x; }
          })
          .filter((x) => x.includes('wirenboard.com') || x.startsWith('/_ipx/'))
          .map((x) => (x.startsWith('/_ipx/') ? 'https://wirenboard.com' + x : x))
      );

      if (!candidates.length) {
        report.push({ id: row.id, status: 'no_candidates', sourceUrl });
        continue;
      }

      const ranked = candidates
        .map((u) => ({ url: u, score: scoreImage(u, slug) }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best || best.score < 25) {
        report.push({ id: row.id, status: 'low_score', best: best ? best.url : '', score: best ? best.score : -999 });
        continue;
      }

      let gallery = [];
      try {
        const g = JSON.parse(String(row.galleryJson || '[]'));
        gallery = Array.isArray(g) ? g : [];
      } catch {
        gallery = [];
      }
      const nextGallery = uniq([best.url, ...gallery]);

      if (String(row.image || '') !== best.url || JSON.stringify(nextGallery) !== JSON.stringify(gallery)) {
        update.run({ id: row.id, image: best.url, galleryJson: JSON.stringify(nextGallery), updatedAt: now });
        updated++;
        report.push({ id: row.id, status: 'updated', best: best.url, score: best.score });
      } else {
        report.push({ id: row.id, status: 'unchanged', best: best.url, score: best.score });
      }

      if (scanned % 15 === 0 || scanned === rows.length) {
        console.log(`scanned ${scanned}/${rows.length}, updated ${updated}`);
      }
    } catch (e) {
      report.push({ id: row.id, status: 'error', error: String((e && e.message) || e) });
    }
  }

  await browser.close();

  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/wb-primary-image-repick-report.json', JSON.stringify({ scanned, updated, report }, null, 2));
  console.log('done', { scanned, updated, report: 'reports/wb-primary-image-repick-report.json' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});