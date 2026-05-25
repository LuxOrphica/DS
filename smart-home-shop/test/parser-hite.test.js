const { assert, test } = require("../test-support/compat");
const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");

const hite = require("../scripts/sync_hite_shop_live");
const { assertParsedProduct } = require("../scripts/lib/parsed-product-schema");

const fixturesDir = path.join(__dirname, "fixtures", "hite");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

test("Hite parser extracts product cards from category html", () => {
  const html = readFixture("category.html");
  const cards = hite.extractCardsFromCategoryPage(`${hite.BASE}/shop/c/radiovyklyuchateli`, html);

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], {
    name: "Радиовыключатель SN-R1",
    link: `${hite.BASE}/shop/goods/radiovyklyuchatel-sn-r1`,
    image: `${hite.BASE}/wp-content/uploads/sn-r1.jpg`,
    sku: "SN-R1",
    price: 4990,
    slug: "radiovyklyuchatel-sn-r1"
  });
});

test("Hite parser extracts gallery and specs from product html", () => {
  const html = readFixture("product.html");
  const pageUrl = `${hite.BASE}/shop/goods/radiovyklyuchatel-sn-r1`;
  const $ = cheerio.load(html);

  assert.equal(hite.parsePrice($(".summary .price").first().text()), 4990);
  assert.deepEqual(hite.extractSpecsFromProductPage($), [
    { name: "Количество каналов", value: "1" },
    { name: "Питание", value: "CR2032" }
  ]);
  assert.deepEqual(hite.extractGalleryFromProductPage($, pageUrl), [
    `${hite.BASE}/wp-content/uploads/sn-r1-main.jpg`,
    `${hite.BASE}/wp-content/uploads/sn-r1-side.jpg`
  ]);
});

test("Hite parsed product output matches shared parsed product schema", () => {
  const html = readFixture("product.html");
  const pageUrl = `${hite.BASE}/shop/goods/radiovyklyuchatel-sn-r1`;
  const $ = cheerio.load(html);
  const attributes = hite.extractSpecsFromProductPage($);
  const gallery = hite.extractGalleryFromProductPage($, pageUrl);
  const article = "SN-R1";

  const product = {
    id: hite.makeId(article, "radiovyklyuchatel-sn-r1"),
    article,
    name: hite.toText($("h1.product_title").first().text()),
    price: hite.parsePrice($(".summary .price").first().text()),
    category: hite.inferCategory("Радиовыключатели", "Радиовыключатель SN-R1"),
    group_name: "HitePro / Радиовыключатели",
    brand: hite.BRAND,
    image: gallery[0],
    source_url: pageUrl,
    description: hite.stripHtml($("#tab-description").html()),
    specs: attributes.map((x) => `${x.name}: ${x.value}`).join("; "),
    description_html: hite.toText($("#tab-description").html()),
    attributes_json: JSON.stringify(attributes),
    documents_json: "[]",
    gallery_json: JSON.stringify(gallery),
    updated_at: new Date("2026-05-22T00:00:00.000Z").toISOString()
  };

  assertParsedProduct(product, "Hite fixture product");
  assert.equal(product.id, "SN-R1");
  assert.equal(product.category, "Управление и автоматизация");
});
