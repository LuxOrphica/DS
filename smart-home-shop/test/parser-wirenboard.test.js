const { assert, test } = require("../test-support/compat");
const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");

const wirenboard = require("../scripts/sync_wirenboard_live");
const { assertParsedProduct } = require("../scripts/lib/parsed-product-schema");

const fixturesDir = path.join(__dirname, "fixtures", "wirenboard");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

test("Wiren Board parser extracts catalog cards with current subcategory", () => {
  const html = readFixture("catalog.html");
  const cards = wirenboard.parseCatalogList(html);

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], {
    link: `${wirenboard.BASE}/ru/product/wb-mr6c-v3/`,
    slug: "wb-mr6c-v3",
    name: "WB-MR6C v.3 модуль реле",
    image: `${wirenboard.BASE}/storage/catalog/wb-mr6c-v3.png`,
    price: 6300,
    subcategory: "Контроллеры"
  });
});

test("Wiren Board parser extracts ecommerce detail, gallery and attributes", () => {
  const html = readFixture("product.html");
  const pageUrl = `${wirenboard.BASE}/ru/product/wb-mr6c-v3/`;
  const $ = cheerio.load(html);

  assert.deepEqual(wirenboard.parseEcommerceDetail(html), {
    name: "WB-MR6C v.3 модуль реле",
    price: "6300",
    category: "Контроллеры"
  });
  assert.deepEqual(wirenboard.extractGallery($, pageUrl), [
    `${wirenboard.BASE}/storage/catalog/wb-mr6c-main.png`
  ]);
  assert.deepEqual(wirenboard.extractAttributesFromProductPage($), [
    { name: "Протокол", value: "Modbus RTU" },
    { name: "Питание", value: "12-24 В DC" },
    { name: "Релейные выходы", value: "6 каналов; До 16 А" },
    { name: "Интерфейс", value: "RS-485" }
  ]);
});

test("Wiren Board parsed product output matches shared parsed product schema", () => {
  const catalogHtml = readFixture("catalog.html");
  const productHtml = readFixture("product.html");
  const card = wirenboard.parseCatalogList(catalogHtml)[0];
  const $ = cheerio.load(productHtml);
  const ecom = wirenboard.parseEcommerceDetail(productHtml);
  const gallery = wirenboard.extractGallery($, card.link);
  const attributes = wirenboard.extractAttributesFromProductPage($);
  const article = wirenboard.extractArticleFromName(ecom.name, card.slug);
  const topCategory = wirenboard.categoryToTopCategory(card.subcategory);

  const product = {
    id: wirenboard.buildId(article, card.link),
    article,
    name: ecom.name,
    price: wirenboard.parsePrice($(".product-description__price .price").first().text()),
    category: topCategory,
    group_name: `Wiren Board / ${card.subcategory}`,
    brand: wirenboard.BRAND,
    image: gallery[0],
    source_url: card.link,
    description: wirenboard.stripHtml($(".product-description__holder").first().html()),
    specs: attributes.map((x) => `${x.name}: ${x.value}`).join("; "),
    description_html: wirenboard.toText($(".product-description__holder").first().html()),
    attributes_json: JSON.stringify(attributes),
    documents_json: "[]",
    gallery_json: JSON.stringify(gallery),
    updated_at: new Date("2026-05-22T00:00:00.000Z").toISOString()
  };

  assertParsedProduct(product, "Wiren Board fixture product");
  assert.equal(product.id, "WB-WB-MR6C-V3");
  assert.equal(product.article, "WB-MR6C");
  assert.equal(product.category, "Управление и автоматизация");
});
