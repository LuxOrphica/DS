#!/usr/bin/env node
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');

const BASE = 'https://www.hite-pro.ru';
const START = `${BASE}/shop/c/besprovodnoj-umnyj-dom`;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'shop.db');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'products');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const TIMEOUT = 20000;

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': UA }, timeout: TIMEOUT }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ url: res.responseUrl || url, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function resolveUrl(base, href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return new URL(href, base).toString();
}

function downloadImage(url, outPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': UA }, timeout: TIMEOUT }, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const file = fs.createWriteStream(outPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function collectSubcategories() {
  const { body } = await fetchHtml(START);
  const $ = cheerio.load(body);
  const subs = new Map();
  $("a[href*='/shop/c/']").each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && text) {
      const url = resolveUrl(BASE, href);
      if (url.startsWith(START)) subs.set(url, text);
    }
  });
  const known = ['bloki-upravleniya','radiovyiklyuchateli','datchiki','server-umnogo-doma','komplekty'];
  for (const k of known) {
    const u = `${START}/${k}`;
    if (!subs.has(u)) subs.set(u, k.replace(/-/g,' '));
  }
  return Array.from(subs.entries()).map(([url, title]) => ({ url, title }));
}

async function collectProductLinks(categoryUrl) {
  const links = new Set();
  try {
    let page = 1;
    while (true) {
      const url = page === 1 ? categoryUrl : `${categoryUrl}?PAGEN_1=${page}`;
      const { body } = await fetchHtml(url);
      const $ = cheerio.load(body);
      $("a[href*='/shop/']").each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/shop/')) links.add(resolveUrl(BASE, href.split('#')[0]));
      });
      const next = $("a[rel='next'], a.pagination-next");
      if (next.length === 0) break;
      page++;
      if (page > 50) break;
      await new Promise(r => setTimeout(r, 600));
    }
  } catch (err) {
    console.error('collectProductLinks error', err.message);
  }
  return Array.from(links);
}

function parseSpecs($) {
  const specs = {};
  $('table, .specs, .characteristics').each((i, tbl) => {
    $(tbl).find('tr').each((j, tr) => {
      const tds = $(tr).find('td, th');
      if (tds.length >= 2) {
        const k = $(tds[0]).text().trim();
        const v = $(tds[1]).text().trim();
        if (k) specs[k] = v;
      }
    });
  });
  return specs;
}

async function parseProduct(url, categoryTitle) {
  try {
    const { body } = await fetchHtml(url);
    const $ = cheerio.load(body);
    const name = $('h1, .product-title').first().text().trim() || $('title').text().trim();
    let priceText = $('.price, .catalog-price, [class*="price"]').first().text() || '';
    const priceMatch = priceText.replace(/\s/g,'').match(/(\d+)/);
    const price = priceMatch ? Number(priceMatch[1]) : 0;
    const article = $('[data-sku], .sku, .article').first().text().trim() || '';
    const desc = $('.description, .product-description, #description').first().text().trim();
    const specs = parseSpecs($);
    const imgs = [];
    $('img').each((i, img) => {
      const src = $(img).attr('data-src') || $(img).attr('src') || '';
      if (src && (src.includes('/upload/') || src.includes('product') || src.match(/800|1024|1200/))) {
        imgs.push(resolveUrl(BASE, src));
      }
    });
    $('.gallery a, .photo a').each((i, a) => { const href = $(a).attr('href'); if (href) imgs.push(resolveUrl(BASE, href)); });
    const uniqImgs = Array.from(new Set(imgs)).slice(0,6);
    const localImages = [];
    for (let i=0;i<uniqImgs.length;i++){
      const imgUrl = uniqImgs[i];
      try {
        const fname = `${(article||name).replace(/[^a-z0-9]/gi,'_')}-${i}.jpg`;
        const out = path.join(IMAGES_DIR, fname);
        await downloadImage(imgUrl, out);
        localImages.push(`/images/products/${fname}`);
        await new Promise(r=>setTimeout(r,200));
      } catch (_e) {
      }
    }
    return {
      id: (article || name).replace(/[^a-z0-9]/gi,'_') + '_' + Math.floor(Math.random()*10000),
      article: article || name,
      name,
      price,
      category: 'Беспроводное оборудование УД',
      subcategory: categoryTitle,
      group: categoryTitle,
      brand: 'Hite Pro',
      image: localImages[0] || '',
      gallery: localImages,
      source_url: url,
      description: desc || '',
      specs: JSON.stringify(specs || {})
    };
  } catch (err) {
    console.error('parseProduct', url, err.message);
    return null;
  }
}

async function main(){
  console.log('Start HitePro catalog sync...');
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const insert = db.prepare(`INSERT OR REPLACE INTO products (id, article, name, price, category, group_name, brand, image, source_url, description, specs, gallery_json, updated_at) VALUES (@id,@article,@name,@price,@category,@group,@brand,@image,@sourceUrl,@description,@specs,@galleryJson,@updatedAt)`);
  const now = new Date().toISOString();

  const subs = await collectSubcategories();
  console.log('Found subcategories:', subs.map(s=>s.title).join(', '));

  for (const sub of subs) {
    console.log('\nProcessing subcategory:', sub.title, sub.url);
    const links = await collectProductLinks(sub.url);
    console.log('  product links:', links.length);
    for (const l of links) {
      const p = await parseProduct(l, sub.title);
      if (!p) continue;
      try {
        insert.run({
          id: p.id,
          article: p.article,
          name: p.name,
          price: p.price || null,
          category: p.category,
          group: p.group,
          brand: p.brand,
          image: p.image,
          sourceUrl: p.source_url,
          description: p.description,
          specs: p.specs,
          galleryJson: JSON.stringify(p.gallery || []),
          updatedAt: now
        });
        console.log('   saved:', p.name);
      } catch (e) {
        console.error('db save error', e.message);
      }
      await new Promise(r=>setTimeout(r,300));
    }
  }

  db.close();
  console.log('Sync finished. Images in public/images/products, DB:', DB_PATH);
}

main().catch(err=>{ console.error(err); process.exit(1); });
