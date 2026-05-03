#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const TARGET_DIR = path.join(ROOT, "public", "images", "products", "mirror");
const TARGET_URL_PREFIX = "/images/products/mirror/";
const TIMEOUT_MS = Number(process.env.IMG_MIRROR_TIMEOUT_MS || 12000);
const MAX_BYTES = Number(process.env.IMG_MIRROR_MAX_BYTES || 12 * 1024 * 1024);
const CONCURRENCY = Math.max(1, Number(process.env.IMG_MIRROR_CONCURRENCY || 8));

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isImageContentType(contentType) {
  return /^image\//i.test(String(contentType || "").trim());
}

function extFromContentType(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("image/jpeg")) return ".jpg";
  if (ct.includes("image/png")) return ".png";
  if (ct.includes("image/webp")) return ".webp";
  if (ct.includes("image/avif")) return ".avif";
  if (ct.includes("image/gif")) return ".gif";
  if (ct.includes("image/svg")) return ".svg";
  return "";
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname || "";
    const ext = path.extname(pathname).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  } catch {}
  return "";
}

function fileNameForUrl(url, contentType) {
  const hash = crypto.createHash("sha1").update(String(url)).digest("hex");
  const ext = extFromContentType(contentType) || extFromUrl(url) || ".jpg";
  return `${hash}${ext}`;
}

async function downloadImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; smart-home-shop/1.0)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!isImageContentType(contentType)) {
      return { ok: false, reason: "not_image" };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return { ok: false, reason: "empty_body" };
    if (bytes.length > MAX_BYTES) return { ok: false, reason: "too_large" };

    const filename = fileNameForUrl(url, contentType);
    const fullPath = path.join(TARGET_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, bytes);
    }

    return { ok: true, localUrl: `${TARGET_URL_PREFIX}${filename}` };
  } catch (error) {
    const reason = String(error && error.name === "AbortError" ? "timeout" : error && error.message ? error.message : "fetch_error");
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runOne() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  const threads = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne());
  await Promise.all(threads);
  return results;
}

function parseGallery(raw) {
  try {
    const value = JSON.parse(String(raw || "[]"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeUrlValue(v) {
  return String(v || "").trim();
}

async function main() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  const db = new Database(DB_PATH);

  const rows = db.prepare("SELECT id, image, gallery_json AS galleryJson FROM products").all();
  const allRemote = new Set();
  for (const row of rows) {
    const img = normalizeUrlValue(row.image);
    if (isRemoteUrl(img)) allRemote.add(img);
    const gallery = parseGallery(row.galleryJson);
    for (const url of gallery) {
      const u = normalizeUrlValue(url);
      if (isRemoteUrl(u)) allRemote.add(u);
    }
  }

  const remoteUrls = Array.from(allRemote);
  console.log(`Remote URLs detected: ${remoteUrls.length}`);
  if (!remoteUrls.length) {
    console.log("Nothing to mirror.");
    return;
  }

  let done = 0;
  const urlToLocal = new Map();
  const failed = [];
  await mapWithConcurrency(
    remoteUrls,
    async (url) => {
      const result = await downloadImage(url);
      done += 1;
      if (result.ok) {
        urlToLocal.set(url, result.localUrl);
      } else {
        failed.push({ url, reason: result.reason });
      }
      if (done % 25 === 0 || done === remoteUrls.length) {
        console.log(`Processed ${done}/${remoteUrls.length}`);
      }
    },
    CONCURRENCY
  );

  const update = db.prepare(`
    UPDATE products
    SET image = @image,
        gallery_json = @galleryJson,
        updated_at = @updatedAt
    WHERE id = @id
  `);
  const tx = db.transaction((payloads) => {
    for (const p of payloads) update.run(p);
  });

  const now = new Date().toISOString();
  const updates = [];
  let imageChanged = 0;
  let galleryChanged = 0;

  for (const row of rows) {
    const currentImage = normalizeUrlValue(row.image);
    const currentGallery = parseGallery(row.galleryJson);

    let nextImage = currentImage;
    if (isRemoteUrl(currentImage) && urlToLocal.has(currentImage)) {
      nextImage = urlToLocal.get(currentImage);
      if (nextImage !== currentImage) imageChanged += 1;
    }

    let galleryTouched = false;
    const nextGallery = currentGallery.map((entry) => {
      const current = normalizeUrlValue(entry);
      if (isRemoteUrl(current) && urlToLocal.has(current)) {
        const mapped = urlToLocal.get(current);
        if (mapped !== current) galleryTouched = true;
        return mapped;
      }
      return current;
    });

    if (galleryTouched) galleryChanged += 1;

    if (nextImage !== currentImage || galleryTouched) {
      updates.push({
        id: row.id,
        image: nextImage,
        galleryJson: JSON.stringify(nextGallery),
        updatedAt: now
      });
    }
  }

  if (updates.length) tx(updates);

  const summary = {
    productsTotal: rows.length,
    remoteUrlsTotal: remoteUrls.length,
    mirroredOk: urlToLocal.size,
    mirroredFailed: failed.length,
    productsUpdated: updates.length,
    imageChanged,
    galleryChanged
  };
  console.log(JSON.stringify(summary, null, 2));

  if (failed.length) {
    const reportPath = path.join(ROOT, "reports", "image-mirror-failed.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(failed, null, 2));
    console.log(`Failed list saved: ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
