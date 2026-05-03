#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "shop.db");
const OUT_DIR = path.join(ROOT, "public", "images", "products", "mirror", "wb-wiki");
const OUT_PREFIX = "/images/products/mirror/wb-wiki/";
const WIKI_BASE = "https://wiki.wirenboard.com";

const TARGETS = [
  {
    id: "WB-GSM-ANTENNA-RIGHT-ANGLE",
    img: "/wiki/images/thumb/b/b9/FS-JS4G-WD-2.png/200px-FS-JS4G-WD-2.png"
  },
  {
    id: "WB-GSM-ANTENNA-4G-108MM",
    img: "/wiki/images/thumb/1/1e/BW4GJWX108-9KJ-2.png/200px-BW4GJWX108-9KJ-2.png"
  },
  {
    id: "WB-GSM-ANTENNA-4G-195MM",
    img: "/wiki/images/thumb/c/ce/BW4GJWX195-13KJ.png/200px-BW4GJWX195-13KJ.png"
  },
  {
    id: "WB-GSM-ANTENNA-STRAIGHT",
    img: "/wiki/images/thumb/1/1e/BW4GJWX108-9KJ-2.png/200px-BW4GJWX108-9KJ-2.png"
  },
  {
    id: "WB-4G-VNESNAA-VYNOSNAA",
    img: "/wiki/images/thumb/c/cf/JCG821.png/200px-JCG821.png"
  }
];

function abs(url) {
  const v = String(url || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("/")) return `${WIKI_BASE}${v}`;
  return `${WIKI_BASE}/${v}`;
}

function ext(url) {
  try {
    return path.extname(new URL(url).pathname || "") || ".png";
  } catch {
    return ".png";
  }
}

function localName(id, sourceUrl) {
  const hash = crypto.createHash("sha1").update(String(sourceUrl)).digest("hex").slice(0, 12);
  return `${String(id).replace(/[^a-zA-Z0-9_-]+/g, "_")}-${hash}${ext(sourceUrl)}`;
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; smart-home-shop/1.0)",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    }
  });
  if (!response.ok) return null;
  const ct = String(response.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) return null;
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  const update = db.prepare(`
    UPDATE products
    SET image = @image,
        gallery_json = @galleryJson,
        updated_at = @updatedAt
    WHERE id = @id
  `);

  let updated = 0;
  for (const target of TARGETS) {
    const sourceUrl = abs(target.img);
    const bytes = await fetchBytes(sourceUrl);
    if (!bytes || !bytes.length) continue;

    const file = localName(target.id, sourceUrl);
    const diskPath = path.join(OUT_DIR, file);
    fs.writeFileSync(diskPath, bytes);
    const localUrl = `${OUT_PREFIX}${file}`;

    update.run({
      id: target.id,
      image: localUrl,
      galleryJson: JSON.stringify([localUrl]),
      updatedAt: new Date().toISOString()
    });
    updated += 1;
    console.log(`Updated ${target.id} -> ${localUrl}`);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
