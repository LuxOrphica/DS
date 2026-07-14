"use strict";

// Генерирует дефолтную OG-картинку (1200x630) в тон витрины:
// тёмный камень + лаймовый акцент, вордмарк «делаемСЕТИ».
// Используется как og:image для главной и товаров без собственного фото.
//
// Запуск: node scripts/generate_og_image.js
// Требует sharp (есть в devDependencies).

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT = path.join(__dirname, "..", "public", "og-image-main.png");
const W = 1200;
const H = 630;

const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const brands = "Loxone · Wiren Board · Hite Pro · Larnitech";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c1917"/>
      <stop offset="1" stop-color="#292524"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- лаймовая акцентная полоса слева -->
  <rect x="0" y="0" width="14" height="${H}" fill="#a3e635"/>

  <!-- сетка-точки как отсылка к «сетям» -->
  <g fill="#3f3b38">
    ${Array.from({ length: 6 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) =>
        `<circle cx="${820 + c * 38}" cy="${90 + r * 38}" r="3"/>`
      ).join("")
    ).join("\n    ")}
  </g>

  <!-- вордмарк -->
  <text x="90" y="330" font-family="${FONT}" font-size="128" font-weight="700" letter-spacing="-2">
    <tspan fill="#e7e5e4">делаем</tspan><tspan fill="#a3e635">СЕТИ</tspan>
  </text>

  <!-- подзаголовок -->
  <text x="94" y="410" font-family="${FONT}" font-size="46" font-weight="500" fill="#a8a29e">
    Оборудование умного дома
  </text>

  <!-- бренды -->
  <text x="94" y="470" font-family="${FONT}" font-size="28" font-weight="400" fill="#78716c">
    ${esc(brands)}
  </text>

  <!-- домен -->
  <text x="90" y="575" font-family="${FONT}" font-size="32" font-weight="600" fill="#a3e635">
    delaemseti.shop
  </text>
</svg>`;

async function main() {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(OUT, png);
  const meta = await sharp(png).metadata();
  console.log(JSON.stringify({ ok: true, out: OUT, width: meta.width, height: meta.height, bytes: png.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
