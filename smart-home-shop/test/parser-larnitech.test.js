const fs = require("fs");
const path = require("path");
const { assert, test } = require("../test-support/compat");

const {
  absoluteUrl,
  chooseMatch,
  extractStorepartsFromHtml,
  findWikiLink,
  normalizeImageUrl,
  parseGallery,
  parsePrice,
  parseSitemapUrls,
  skuCandidates,
  stripHtml
} = require("../scripts/archive/sync_larnitech_site_catalog");

const fixturesDir = path.join(__dirname, "fixtures", "larnitech");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

test("Larnitech parser extracts storepart ids from page html", () => {
  const html = readFixture("site.html");
  const parts = [...extractStorepartsFromHtml(html)].sort();

  assert.deepEqual(parts, ["754959572690", "951849075984"]);
});

test("Larnitech parser reads sitemap urls", () => {
  const urls = parseSitemapUrls(`
    <urlset>
      <url><loc>https://larnitech-rus.ru/products/dw-dali2</loc></url>
      <url><loc>https://larnitech-rus.ru/products/metaforsa-2</loc></url>
    </urlset>
  `);

  assert.deepEqual(urls, [
    "https://larnitech-rus.ru/products/dw-dali2",
    "https://larnitech-rus.ru/products/metaforsa-2"
  ]);
});

test("Larnitech parser normalizes Tilda price, gallery and description", () => {
  const product = JSON.parse(readFixture("product.json"));

  assert.equal(parsePrice(product.price), 12345.67);
  assert.equal(stripHtml(product.descr), "DALI gateway module");
  assert.deepEqual(parseGallery(product.gallery), [
    "https://static.tildacdn.com/tildabc/photo.png",
    "https://static.tildacdn.com/tildabc/photo-2.png"
  ]);
  assert.equal(normalizeImageUrl("//optim.tildacdn.com/tildabc/photo.png"), "https://static.tildacdn.com/tildabc/photo.png");
});

test("Larnitech parser resolves wiki links from hrefs and escaped scripts", () => {
  const html = readFixture("site.html");

  assert.equal(absoluteUrl("/wiki/metaforsa-2", "https://larnitech-rus.ru/products/x"), "https://larnitech-rus.ru/wiki/metaforsa-2");
  assert.equal(findWikiLink(html, "https://larnitech-rus.ru/products/x"), "https://larnitech-rus.ru/wiki/metaforsa-2");
  assert.equal(findWikiLink('window.docs="https:\\/\\/wiki.larnitech.com\\/page\\/dw-dali2"', "https://larnitech-rus.ru/"), "https://wiki.larnitech.com/page/dw-dali2");
});

test("Larnitech parser matches site SKU to existing catalog rows", () => {
  const rows = [
    { id: "larnitech-metaforsa", article: "MF-14", name: "Metaforsa" },
    { id: "larnitech-dw-dali", article: "DW-DALI", name: "DALI gateway" }
  ];
  const byNorm = new Map(rows.map((row) => [row.article.toLowerCase().replace(/[^a-z0-9]+/g, ""), [row]]));

  assert.deepEqual(skuCandidates("DW-DALI2"), ["dwdali2", "dw", "dali2", "dwdali"]);
  assert.equal(chooseMatch("DW-DALI2", rows, byNorm), rows[1]);
});
