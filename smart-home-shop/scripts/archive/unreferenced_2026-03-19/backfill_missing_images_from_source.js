#!/usr/bin/env node
"use strict";

const Database = require("better-sqlite3");
const cheerio = require("cheerio");

const db = new Database("data/shop.db");

function toText(v) {
  return String(v || "").trim();
}

function toAbsUrl(url, base) {
  const raw = toText(url);
  if (!raw) return "";
  try {
    return new URL(raw, base).toString();
  } catch (_) {
    return "";
  }
}

function normalizeToken(v) {
  return toText(v)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .trim();
}

function dedupe(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const s = toText(item);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseGallery(raw) {
  try {
    const data = JSON.parse(String(raw || "[]"));
    return Array.isArray(data) ? data.map((x) => toText(x)).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return await res.text();
}

function scoreImageUrl(url, row) {
  const u = toText(url).toLowerCase();
  let score = 0;

  if (/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(u)) score += 8;
  if (u.includes("/_ipx/")) score += 6;
  if (u.includes("/storage/cache/")) score += 5;
  if (u.includes("tildacdn")) score += 4;

  const badWords = [
    "dashboard",
    "webui",
    "screenshot",
    "interface",
    "register",
    "schema",
    "diagram",
    "wiring",
    "manual",
    "instruction",
    "datasheet",
    "catalog",
    "logo",
    "favicon",
    "icon"
  ];
  for (const w of badWords) {
    if (u.includes(w)) score -= 18;
  }

  if (/[?&](w|h)=\d{1,3}\b/i.test(u)) score -= 8;
  if (/[-_/](32|48|64|80|96|120|128|150|160)x(32|48|64|80|96|120|128|150|160)\b/i.test(u)) score -= 8;

  const tokens = [
    normalizeToken(row.article).replace(/\s+/g, ""),
    normalizeToken(row.name).split(" ")[0],
    normalizeToken(row.name).split(" ")[1],
    normalizeToken(row.brand)
  ].filter(Boolean);

  for (const token of tokens) {
    if (!token || token.length < 3) continue;
    if (u.includes(token)) score += 7;
  }

  return score;
}

function extractCandidates(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];

  const selectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[itemprop="image"]',
    'link[rel="image_src"]',
    ".t-slds__item img",
    ".js-product-img",
    ".woocommerce-product-gallery__image a",
    ".woocommerce-product-gallery__wrapper img",
    "img"
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const src = toText($(el).attr("content") || $(el).attr("href") || $(el).attr("data-original") || $(el).attr("data-src") || $(el).attr("src"));
      const abs = toAbsUrl(src, baseUrl);
      if (!abs) return;
      if (!/^https?:\/\//i.test(abs)) return;
      if (!/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(abs) && !abs.includes("/_ipx/") && !abs.includes("/storage/cache/")) return;
      out.push(abs);
    });
  }

  $("a[href]").each((_, el) => {
    const href = toAbsUrl($(el).attr("href"), baseUrl);
    if (!href) return;
    if (/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(href)) out.push(href);
  });

  return dedupe(out);
}

function pickBest(candidates, row) {
  if (!candidates.length) return "";
  const scored = candidates.map((url) => ({ url, score: scoreImageUrl(url, row) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0] ? scored[0].url : "";
}

async function main() {
  const rows = db
    .prepare(
      `SELECT id, article, name, brand, source_url AS sourceUrl, image, gallery_json AS galleryJson
       FROM products
       WHERE IFNULL(TRIM(image),'')='' AND IFNULL(TRIM(source_url),'')<>''`
    )
    .all();

  const update = db.prepare(
    `UPDATE products
     SET image=@image, gallery_json=@galleryJson, updated_at=@updatedAt
     WHERE id=@id`
  );

  const report = [];
  let updated = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      if (row.id === "direction-larnitech") {
        const fixed = "/brand-logos/larnitech.svg";
        const nextGallery = dedupe([fixed, ...parseGallery(row.galleryJson)]);
        update.run({ id: row.id, image: fixed, galleryJson: JSON.stringify(nextGallery), updatedAt: now });
        updated += 1;
        report.push({ id: row.id, status: "ok", image: fixed, note: "brand_logo" });
        continue;
      }

      const html = await fetchHtml(row.sourceUrl);
      const candidates = extractCandidates(html, row.sourceUrl);
      const best = pickBest(candidates, row);

      if (!best) {
        report.push({ id: row.id, status: "skip", reason: "no_candidates" });
        continue;
      }

      const nextGallery = dedupe([best, ...parseGallery(row.galleryJson)]);
      update.run({
        id: row.id,
        image: best,
        galleryJson: JSON.stringify(nextGallery),
        updatedAt: now
      });
      updated += 1;
      report.push({ id: row.id, status: "ok", image: best, candidates: candidates.length });
    } catch (error) {
      report.push({ id: row.id, status: "fail", reason: String(error && error.message ? error.message : error) });
    }
  }

  console.log(JSON.stringify({ scanned: rows.length, updated, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
