#!/usr/bin/env node
// Compresses product mirror images in-place to WebP/JPEG, max 800px wide
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "../public/images/products/mirror");
const MAX_WIDTH = 800;
const WEBP_QUALITY = 78;
const JPEG_QUALITY = 82;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

async function compress(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!EXTS.has(ext)) return null;

  const statBefore = fs.statSync(filePath).size;
  const tmp = filePath + ".tmp";

  try {
    const img = sharp(filePath).resize({ width: MAX_WIDTH, withoutEnlargement: true });
    if (ext === ".webp") {
      await img.webp({ quality: WEBP_QUALITY }).toFile(tmp);
    } else if (ext === ".png") {
      await img.webp({ quality: WEBP_QUALITY }).toFile(tmp);
      // rename to .webp
      const newPath = filePath.replace(/\.png$/i, ".webp");
      fs.renameSync(tmp, newPath);
      fs.unlinkSync(filePath);
      return { from: statBefore, to: fs.statSync(newPath).size };
    } else {
      await img.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(tmp);
    }
    fs.renameSync(tmp, filePath);
    return { from: statBefore, to: fs.statSync(filePath).size };
  } catch (_e) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    return null;
  }
}

async function main() {
  const files = walk(SRC_DIR);
  const imgs = files.filter(f => EXTS.has(path.extname(f).toLowerCase()));
  console.log(`Found ${imgs.length} images in ${SRC_DIR}`);

  let totalBefore = 0, totalAfter = 0, done = 0;
  for (const f of imgs) {
    const r = await compress(f);
    if (r) {
      totalBefore += r.from;
      totalAfter += r.to;
    }
    done++;
    if (done % 100 === 0) process.stdout.write(`\r${done}/${imgs.length}...`);
  }
  console.log(`\nDone. ${(totalBefore/1024/1024).toFixed(1)} MB -> ${(totalAfter/1024/1024).toFixed(1)} MB`);
}

main().catch(e => { console.error(e); process.exit(1); });
