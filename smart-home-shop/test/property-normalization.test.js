const { assert, test } = require("../test-support/compat");
const fc = require("fast-check");
const {
  normalizeChannelsValue,
  normalizeMetricValue,
  normalizeOrderDocumentsInput,
  normalizeProtocolValue,
  normalizeText
} = require("../db/normalization");

test("property: normalizeText is trimmed and idempotent", () => {
  fc.assert(
    fc.property(fc.string(), (value) => {
      const once = normalizeText(value);
      const twice = normalizeText(once);
      assert.equal(once, twice);
      assert.equal(once, once.trim());
      assert.equal(/\s{2,}/.test(once), false);
    }),
    { numRuns: 300 }
  );
});

test("property: channel normalization accepts bounded positive counts only", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 180 }), (count) => {
      const normalized = normalizeChannelsValue(`${count} channels`);
      if (count >= 1 && count <= 128) {
        assert.equal(normalized, `${count} ch`);
      } else {
        assert.equal(normalized, "");
      }
    }),
    { numRuns: 250 }
  );
});

test("property: metric normalization never emits unknown units for known kinds", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("voltage", "current", "power"),
      fc.double({ min: 0.01, max: 10000, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom("V", "kV", "mV", "A", "mA", "W", "kW", "mW", "watts"),
      (kind, value, unit) => {
        const normalized = normalizeMetricValue(kind, `${value} ${unit}`);
        assert.equal(/\uFFFD/.test(normalized), false);
        if (normalized) {
          assert.match(normalized, /^(\d+(,\d+)? )?(V|kV|mV|A|mA|W|kW|mW)$/);
        }
      }
    ),
    { numRuns: 300 }
  );
});

test("property: protocol normalization deduplicates canonical protocols", () => {
  const protocols = ["modbus", "rs 485", "Wi fi", "zigbee", "mqtt", "knx", "ethernet"];
  fc.assert(
    fc.property(fc.array(fc.constantFrom(...protocols), { minLength: 0, maxLength: 20 }), (items) => {
      const normalized = normalizeProtocolValue(items.join(";"));
      const parts = normalized ? normalized.split(", ") : [];
      assert.equal(parts.length, new Set(parts).size);
      assert.equal(/\uFFFD/.test(normalized), false);
    }),
    { numRuns: 250 }
  );
});

test("property: order document normalization keeps only safe references", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          type: fc.string(),
          title: fc.string(),
          url: fc.oneof(
            fc.webUrl(),
            fc.string().map((value) => `/${value.replace(/^\/+/, "")}`),
            fc.string()
          )
        }),
        { maxLength: 30 }
      ),
      (docs) => {
        const normalized = normalizeOrderDocumentsInput(docs);
        for (const doc of normalized) {
          assert.match(doc.url, /^(https?:\/\/|\/)/);
          assert.ok(doc.title.trim().length > 0);
          assert.ok(["confirmation", "invoice", "receipt", "waybill", "upd"].includes(doc.type));
        }
      }
    ),
    { numRuns: 150 }
  );
});
