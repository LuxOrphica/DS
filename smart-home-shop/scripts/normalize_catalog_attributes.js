const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "data", "shop.db");
const db = new Database(dbPath, { timeout: 10000 });

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has("--dry-run");
const FORCE_OVERWRITE = argv.has("--force-overwrite");

function hasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((r) => r.name === column);
}

function addColumnIfMissing(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const BRAND_SUBCATEGORIES = [
  "Контроллеры",
  "Реле и диммеры",
  "Датчики",
  "Термостаты",
  "Энергомониторинг",
  "Аудио / Multiroom",
  "Аксессуары"
];

function text(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function parseJsonList(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSpecs(specs) {
  const out = [];
  String(specs || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((part) => {
      const idx = part.indexOf(":");
      if (idx > 0) {
        out.push({ name: text(part.slice(0, idx)), value: text(part.slice(idx + 1)) });
      }
    });
  return out;
}

function isEmptyValue(value) {
  return String(value || "").trim() === "";
}

function shouldWriteField(currentValue, nextValue) {
  const current = String(currentValue || "").trim();
  const next = String(nextValue || "").trim();
  if (!next) return false;
  if (FORCE_OVERWRITE) return current !== next;
  if (!current) return true;
  return false;
}

function collectText(product) {
  const attrs = parseJsonList(product.attributes_json);
  const specsRows = parseSpecs(product.specs);
  const chunks = [
    product.name,
    product.category,
    product.group_name,
    product.brand,
    product.description,
    ...attrs.flatMap((a) => [a.name, a.value]),
    ...specsRows.flatMap((s) => [s.name, s.value])
  ];
  return lower(chunks.filter(Boolean).join(" | "));
}

function firstMatch(source, regexes) {
  for (const r of regexes) {
    const m = source.match(r);
    if (m?.[1]) return text(m[1].replace(",", "."));
  }
  return "";
}

function detectBrandSubcategory(product, source) {
  if (/\b(термостат|thermostat)\b/.test(source)) return "Термостаты";
  if (/\b(датчик|sensor|сенсор|motion|pir)\b/.test(source)) return "Датчики";
  if (/\b(контроллер|controller|gateway|сервер|plc)\b/.test(source)) return "Контроллеры";
  if (/\b(реле|relay|диммер|dimmer)\b/.test(source)) return "Реле и диммеры";
  if (/\b(энергомонитор|power meter|счетчик|meter|мониторинг)\b/.test(source)) return "Энергомониторинг";
  if (/\b(audio|multiroom|мультирум|усилитель|amp|колонк)\b/.test(source)) return "Аудио / Multiroom";

  const g = lower(product.group_name);
  if (g.includes("контрол")) return "Контроллеры";
  if (g.includes("датчик")) return "Датчики";
  if (g.includes("термостат")) return "Термостаты";
  if (g.includes("реле") || g.includes("диммер")) return "Реле и диммеры";
  if (g.includes("энерго")) return "Энергомониторинг";
  if (g.includes("аудио") || g.includes("multiroom")) return "Аудио / Multiroom";

  return "Аксессуары";
}

function detectSystemType(source, brand) {
  if (/\b(zigbee|wi[-\s]?fi|rf|radio|беспровод)\b/.test(source)) return "беспроводная";
  if (/\b(knx|modbus|rs-485|ethernet|провод)\b/.test(source)) return "проводная";
  const b = lower(brand);
  if (b.includes("hite")) return "беспроводная";
  if (b.includes("wiren") || b.includes("loxone") || b.includes("larnitech")) return "проводная";
  return "";
}

function detectProtocol(source) {
  const protocols = [];
  const dict = [
    ["KNX", /\bknx\b/],
    ["Modbus", /\bmodbus\b/],
    ["Zigbee", /\bzigbee\b/],
    ["Wi-Fi", /\bwi[-\s]?fi\b/],
    ["BLE", /\bble\b|bluetooth/],
    ["RF", /\brf\b|radio/],
    ["RS-485", /\brs[-\s]?485\b/],
    ["DALI", /\bdali\b/],
    ["Ethernet", /\bethernet\b|lan\b/],
    ["MQTT", /\bmqtt\b/]
  ];
  for (const [name, rx] of dict) {
    if (rx.test(source)) protocols.push(name);
  }
  return protocols.join(", ");
}

function detectMounting(source) {
  const tags = [];
  if (/\bdin\b|дин/.test(source)) tags.push("DIN");
  if (/подрозет|встраив/.test(source)) tags.push("подрозетник");
  if (/наклад|настенн|surface/.test(source)) tags.push("накладной");
  return tags.join(", ");
}

function detectSensorType(source) {
  if (!/\b(датчик|sensor|сенсор)\b/.test(source)) return "";
  if (/\b(движ|motion|pir)\b/.test(source)) return "движения";
  if (/\b(температ|temperature)\b/.test(source)) return "температуры";
  if (/\b(влажн|humidity)\b/.test(source)) return "влажности";
  if (/\b(протеч|water leak)\b/.test(source)) return "протечки";
  if (/\b(открыт|геркон|door|window)\b/.test(source)) return "открытия";
  return "прочий";
}

function detectIndoorOutdoor(source) {
  if (/\b(улич|наруж|outdoor)\b/.test(source)) return "уличный";
  if (/\b(внутр|indoor)\b/.test(source)) return "внутренний";
  return "";
}

function detectWebInterface(source) {
  if (/\b(web[-\s]?интерфейс|web interface|http interface)\b/.test(source)) return "да";
  return "";
}

function detectScenarioSupport(source) {
  if (/\b(сценар|automation|logic)\b/.test(source)) return "да";
  return "";
}

function detectLoadType(source) {
  const types = [];
  if (/\bled\b/.test(source)) types.push("LED");
  if (/\b(резистив|resistive)\b/.test(source)) types.push("резистивная");
  if (/\b(индуктив|inductive)\b/.test(source)) types.push("индуктивная");
  if (/\b(емкост|capacitive)\b/.test(source)) types.push("емкостная");
  return types.join(", ");
}

function normalizeProduct(product) {
  const source = collectText(product);
  const supplyVoltage = firstMatch(source, [
    /(\d{1,3}(?:[.,]\d+)?\s*(?:vdc|vac|v|в))/i,
    /(\d{1,3}(?:[.,]\d+)?\s*-\s*\d{1,3}(?:[.,]\d+)?\s*(?:vdc|vac|v|в))/i
  ]);
  const channels = firstMatch(source, [
    /(\d+\s*канал\w*)/i,
    /(\d+\s*ch)/i,
    /(\d+\s*x\d+\s*a)/i
  ]);
  const nominalCurrent = firstMatch(source, [/(\d+(?:[.,]\d+)?\s*a)/i]);
  const nominalPower = firstMatch(source, [/(\d+(?:[.,]\d+)?\s*(?:w|вт))/i]);
  const ipRating = firstMatch(source, [/\b(ip\d{2})\b/i]).toUpperCase();
  const ioCount = firstMatch(source, [
    /(\d+\s*in\s*\/\s*\d+\s*out)/i,
    /(\d+\s*di\s*\/\s*\d+\s*do)/i,
    /(\d+\s*вход\w*\s*\/\s*\d+\s*выход\w*)/i
  ]);
  const maxLoad = firstMatch(source, [/(max[^;,.]*\d+(?:[.,]\d+)?\s*(?:w|вт|a))/i]);

  return {
    brandSubcategory: detectBrandSubcategory(product, source),
    systemType: detectSystemType(source, product.brand),
    protocol: detectProtocol(source),
    mounting: detectMounting(source),
    supplyVoltage,
    channels,
    nominalCurrent,
    nominalPower,
    sensorType: detectSensorType(source),
    indoorOutdoor: detectIndoorOutdoor(source),
    ipRating,
    ioCount,
    webInterface: detectWebInterface(source),
    scenarioSupport: detectScenarioSupport(source),
    loadType: detectLoadType(source),
    maxLoad
  };
}

function main() {
  [
    ["brand_subcategory", "TEXT DEFAULT ''"],
    ["system_type", "TEXT DEFAULT ''"],
    ["protocol", "TEXT DEFAULT ''"],
    ["mounting", "TEXT DEFAULT ''"],
    ["supply_voltage", "TEXT DEFAULT ''"],
    ["channels", "TEXT DEFAULT ''"],
    ["nominal_current", "TEXT DEFAULT ''"],
    ["nominal_power", "TEXT DEFAULT ''"],
    ["sensor_type", "TEXT DEFAULT ''"],
    ["indoor_outdoor", "TEXT DEFAULT ''"],
    ["ip_rating", "TEXT DEFAULT ''"],
    ["io_count", "TEXT DEFAULT ''"],
    ["web_interface", "TEXT DEFAULT ''"],
    ["scenario_support", "TEXT DEFAULT ''"],
    ["load_type", "TEXT DEFAULT ''"],
    ["max_load", "TEXT DEFAULT ''"]
  ].forEach(([name, def]) => addColumnIfMissing("products", name, def));

  const rows = db
    .prepare(
      `
      SELECT
        id, name, category, group_name, brand, description, specs, attributes_json,
        brand_subcategory, system_type, protocol, mounting, supply_voltage, channels,
        nominal_current, nominal_power, sensor_type, indoor_outdoor, ip_rating, io_count,
        web_interface, scenario_support, load_type, max_load
      FROM products
      ORDER BY name COLLATE NOCASE ASC
    `
    )
    .all();

  const update = db.prepare(`
    UPDATE products
    SET
      brand_subcategory = @brandSubcategory,
      system_type = @systemType,
      protocol = @protocol,
      mounting = @mounting,
      supply_voltage = @supplyVoltage,
      channels = @channels,
      nominal_current = @nominalCurrent,
      nominal_power = @nominalPower,
      sensor_type = @sensorType,
      indoor_outdoor = @indoorOutdoor,
      ip_rating = @ipRating,
      io_count = @ioCount,
      web_interface = @webInterface,
      scenario_support = @scenarioSupport,
      load_type = @loadType,
      max_load = @maxLoad,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  const fieldMap = {
    brandSubcategory: "brand_subcategory",
    systemType: "system_type",
    protocol: "protocol",
    mounting: "mounting",
    supplyVoltage: "supply_voltage",
    channels: "channels",
    nominalCurrent: "nominal_current",
    nominalPower: "nominal_power",
    sensorType: "sensor_type",
    indoorOutdoor: "indoor_outdoor",
    ipRating: "ip_rating",
    ioCount: "io_count",
    webInterface: "web_interface",
    scenarioSupport: "scenario_support",
    loadType: "load_type",
    maxLoad: "max_load"
  };

  const perFieldChanges = Object.fromEntries(Object.keys(fieldMap).map((key) => [key, 0]));
  let rowsToUpdate = 0;

  const updates = rows.map((row) => {
    const normalized = normalizeProduct(row);
    const next = {};
    let changed = false;

    for (const [outKey, columnName] of Object.entries(fieldMap)) {
      const currentValue = row[columnName];
      const nextValue = normalized[outKey];
      if (shouldWriteField(currentValue, nextValue)) {
        next[outKey] = nextValue;
        perFieldChanges[outKey] += 1;
        changed = true;
      } else {
        next[outKey] = String(currentValue || "").trim();
      }
    }
    if (changed) rowsToUpdate += 1;
    return { id: row.id, changed, next };
  });

  if (!DRY_RUN) {
    const now = new Date().toISOString();
    const tx = db.transaction((items) => {
      for (const item of items) {
        if (!item.changed) continue;
        update.run({
          id: item.id,
          ...item.next,
          updatedAt: now
        });
      }
    });
    tx(updates);
  }

  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN brand_subcategory <> '' THEN 1 ELSE 0 END) AS withSubcategory,
        SUM(CASE WHEN protocol <> '' THEN 1 ELSE 0 END) AS withProtocol,
        SUM(CASE WHEN mounting <> '' THEN 1 ELSE 0 END) AS withMounting
      FROM products
    `
    )
    .get();

  console.log(DRY_RUN ? "Normalize catalog attributes (dry-run)" : "Normalized catalog attributes");
  console.log({
    mode: DRY_RUN ? "dry-run" : "apply",
    overwriteMode: FORCE_OVERWRITE ? "force-overwrite" : "only-empty",
    totalRows: rows.length,
    rowsToUpdate
  });
  console.log("Field changes:", perFieldChanges);
  console.log(stats);
  const bySub = db
    .prepare(
      `SELECT brand_subcategory AS sub, COUNT(*) AS c FROM products GROUP BY brand_subcategory ORDER BY c DESC`
    )
    .all();
  console.log("Brand subcategories:", bySub);
  console.log("Expected subcategory set:", BRAND_SUBCATEGORIES.join(", "));
}

main();
