const { assert, test } = require("../test-support/compat");
const fs = require("node:fs");
const path = require("node:path");

const loxone = require("../scripts/sync_loxone_smart_port_live");
const { assertParsedProduct } = require("../scripts/lib/parsed-product-schema");

const fixturesDir = path.join(__dirname, "fixtures", "loxone");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function readJsonFixture(name) {
  return JSON.parse(readFixture(name));
}

test("Loxone parser extracts category URLs and storepart ids from shop html", () => {
  const html = readFixture("shop.html");

  assert.deepEqual(loxone.extractShopCategoryUrls(html), [
    `${loxone.BASE}/shop/lighting`,
    `${loxone.BASE}/shop/climate`
  ]);
  assert.deepEqual(loxone.extractStorePartIds(html), ["518076158"]);
});

test("Loxone parser normalizes Tilda gallery, links, list items and characteristics", () => {
  const raw = readJsonFixture("product.json");

  assert.equal(loxone.parsePrice(raw.price), 149.9);
  assert.equal(loxone.parseArticleFromDescr(raw.descr), "100239");
  assert.deepEqual(loxone.parseGallery(raw.gallery, raw.editions), [
    `${loxone.BASE}/tild3634-6133-4638-b064-633231373464/rgbw-main.jpg`,
    "https://static.tildacdn.com/tild3533/rgbw-side.jpg",
    `${loxone.BASE}/tild3531/rgbw-edition.jpg`
  ]);
  assert.deepEqual(loxone.extractLinksFromHtml(raw.text), [
    { title: "Инструкция", url: `${loxone.BASE}/manuals/rgbw.pdf` }
  ]);
  assert.deepEqual(loxone.parseListItemsFromHtml(raw.text), ["4 канала PWM", "Tree interface"]);
  assert.deepEqual(loxone.parseCharacteristics(raw.characteristics), [
    { name: "Питание", value: "24 В DC" },
    { name: "Каналы", value: "4" }
  ]);
});

test("Loxone normalized product output matches shared parsed product schema", () => {
  const raw = readJsonFixture("product.json");
  const sectionByPartuid = new Map([["518076158", "Освещение"]]);
  const product = loxone.normalizeProduct(
    raw,
    {
      partuid: "518076158",
      sectionName: "Все",
      categoryUrl: `${loxone.BASE}/shop/lighting`
    },
    sectionByPartuid
  );

  const schemaPayload = {
    id: product.id,
    article: product.article,
    name: product.name,
    price: product.price,
    category: product.category,
    group_name: product.group_name,
    brand: product.brand,
    image: product.image,
    source_url: product.source_url,
    description: product.description,
    specs: product.specs,
    description_html: product.description_html,
    attributes_json: product.attributes_json,
    documents_json: product.documents_json,
    gallery_json: product.gallery_json,
    updated_at: new Date("2026-05-22T00:00:00.000Z").toISOString()
  };
  assertParsedProduct(schemaPayload, "Loxone fixture product");
  assert.equal(product.id, "LX-100239");
  assert.equal(product.article, "100239");
  assert.equal(product.category, "Освещение");
  assert.equal(product.group_name, "Loxone / Освещение");
  assert.equal(product.status, "active");
  assert.deepEqual(JSON.parse(product.attributes_json), [
    { name: "Питание", value: "24 В DC" },
    { name: "Каналы", value: "4" },
    { name: "Особенности", value: "4 канала PWM; Tree interface" }
  ]);
  assert.deepEqual(JSON.parse(product.documents_json), [
    { title: "Инструкция", url: `${loxone.BASE}/manuals/rgbw.pdf` }
  ]);
});
