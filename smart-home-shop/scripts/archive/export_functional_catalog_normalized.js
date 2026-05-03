const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = "data/shop.db";
const OUT_CSV = "reports/functional_catalog_products.normalized.csv";
const OUT_JSON = "reports/functional_catalog_products.normalized.grouped.json";

const ORDER = {
  "Управление и автоматизация": [
    "Минисерверы и расширения",
    "Контроллеры",
    "Реле и диммеры",
    "Шторы",
    "Датчики",
    "HMI",
    "Аксессуары",
    "Комплектующие",
    "Управление",
    "Софт и сервисы",
    "Прочее"
  ],
  "Освещение": [
    "Светильники",
    "Реле и диммеры",
    "Выключатели и панели",
    "Датчики",
    "LED-ленты",
    "Контроллеры освещения",
    "Аксессуары",
    "Прочее"
  ],
  "Монтаж": [
    "Кабель и провода",
    "Крепеж",
    "Монтажные элементы",
    "Аксессуары",
    "Прочее"
  ],
  "Безопасность": [
    "Датчики",
    "Контроль доступа",
    "Сирены и тревожные устройства",
    "Кнопки и брелоки",
    "Аксессуары",
    "Прочее"
  ],
  "Климат": [
    "Термостаты",
    "Датчики климата",
    "Управление кондиционерами",
    "Приводы и клапаны",
    "Контроллеры климата",
    "Аксессуары",
    "Прочее"
  ],
  "Энергомониторинг": ["Электросчетчики", "Прочее"],
  "Аудио / Multiroom": ["Multiroom", "Аудио", "Прочее"],
  "Комплекты": ["Готовые комплекты", "Наборы для освещения", "Наборы управления", "Наборы датчиков", "Прочее"],
  "Аксессуары": ["Блоки питания", "Антенны", "Клеммы и коннекторы", "Крепеж и монтаж", "Кабели и переходники", "Мерч", "Прочее"]
};

function splitBreadcrumbs(raw) {
  return String(raw || "")
    .split(/[>→|/]+/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function deriveRawSub(row) {
  const top = String(row.functional_category || "").trim();
  const subField = String(row.subcategory || row.brand_subcategory || "").trim();
  const crumbs = splitBreadcrumbs(row.breadcrumbs);
  const groupRaw = String(row.group_name || "").trim();
  if (subField && subField.toLowerCase() !== top.toLowerCase()) return subField;
  if (crumbs.length > 1) return crumbs[crumbs.length - 1];
  if (groupRaw && groupRaw !== top) {
    if (groupRaw.includes("/")) return String(groupRaw.split("/").pop() || "").trim() || groupRaw;
    return groupRaw;
  }
  return top;
}

function normalizeSub(top, rawSub, row) {
  const value = String(rawSub || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  const name = String(row.name || "").toLowerCase();
  const article = String(row.article || "").toLowerCase();
  const sourceTop = String(row.product_top_category || "").trim();
  const hay = `${lower} ${name} ${article}`;

  const getAccessoriesBucket = () => {
    if (/вся продукц|^6\)$/.test(lower)) return "";
    if (/блок питания|power supply|adapter 24v|24v.*a\b|type e,f|flush-mounted power/i.test(hay)) return "Блоки питания";
    if (/antenna|антенн|sma/i.test(hay)) return "Антенны";
    if (/клемм|terminal|connector|link \(25|24v \(25|tree \(25/i.test(hay)) return "Клеммы и коннекторы";
    if (/креплен|подставк|wallmount|mount|holder/i.test(hay)) return "Крепеж и монтаж";
    if (/кабел|переходник|uart|rs-?232|rs-?485|probe/i.test(hay)) return "Кабели и переходники";
    if (/поло|тапочк|fanshirt|shirt|merch/i.test(hay)) return "Мерч";
    return value;
  };

  if (top === "Управление и автоматизация") {
    if (/магазин\s+loxone.*энергия|сетев.*карт.*холодильник|отдых\s*и\s*spa/i.test(value)) return "";
    if (lower === "реле" || lower === "диммеры" || lower === "реле и диммеры") return "Реле и диммеры";
    if (lower.includes("модули для контроллер")) return "Контроллеры";
    if (sourceTop === "Аксессуары") {
      const bucket = getAccessoriesBucket();
      if (bucket === "Антенны") return "Комплектующие";
      if (bucket) return "Аксессуары";
    }
    return value;
  }

  if (top === "Освещение") {
    if (/аудио\s*\/\s*multiroom/i.test(value)) return "";
    if (/реле|диммер|dimmer/i.test(hay)) return "Реле и диммеры";
    if (/выключател|touch|кнопк|panel|switch/i.test(hay)) return "Выключатели и панели";
    if (/датчик|detector|presence\s*sensor/i.test(hay)) return "Датчики";
    if (/лента|strip|warm white led|rgbw led/i.test(hay) || lower.startsWith("б (warm white")) return "LED-ленты";
    if (/светильник|spot|ceiling|pendulum|lamp/i.test(hay)) return "Светильники";
    if (/extension|dali|controller|контроллер/i.test(hay)) return "Контроллеры освещения";
    if (/аксессуар|adapter|креплен|mount/i.test(hay)) return "Аксессуары";
    return value;
  }

  if (top === "Монтаж") {
    if (sourceTop === "Аксессуары") {
      const bucket = getAccessoriesBucket();
      if (bucket === "Кабели и переходники") return "Кабель и провода";
      if (bucket === "Блоки питания" || bucket === "Клеммы и коннекторы" || bucket === "Крепеж и монтаж") return "Монтажные элементы";
    }
    if (/кабел|провод|interface|интерфейс|rs-?232|rs-?485|uart/i.test(hay)) return "Кабель и провода";
    if (/креп|кроншт|держател/i.test(hay)) return "Крепеж";
    if (/короб|din|рейк|щит|подрозет|блок|модул|адаптер|выключател|sw\d+|клемм|terminal|connector/i.test(hay)) return "Монтажные элементы";
    if (/аксессуар|adapter|антенн/i.test(hay)) return "Аксессуары";
    return value;
  }

  if (top === "Безопасность") {
    if (/датчик|detector|sensor|smoke|water|window|door|геркон|presence/i.test(hay)) return "Датчики";
    if (/доступ|access|lock|замок|считывател|intercom|домофон|nfc|rfid|code touch/i.test(hay)) return "Контроль доступа";
    if (/сирен|alarm|тревож/i.test(hay)) return "Сирены и тревожные устройства";
    if (/button|кнопк|брелок|wrist/i.test(hay)) return "Кнопки и брелоки";
    if (/аксессуар|adapter|антенн/i.test(hay)) return "Аксессуары";
    return value;
  }

  if (top === "Климат") {
    if (/термостат|thermostat/i.test(hay)) return "Термостаты";
    if (/датчик|sensor|weather|метео|temperature|humidity/i.test(hay)) return "Датчики климата";
    if (/ac control|кондиционер|климат|ir control|mitsubishi|daikin|fujitsu|gree|toshiba|sinclair/i.test(hay)) return "Управление кондиционерами";
    if (/valve|клапан|привод|actuator|va\d+/i.test(hay)) return "Приводы и клапаны";
    if (/controller|контроллер|extension|расширение|froling|internorm/i.test(hay)) return "Контроллеры климата";
    if (/аксессуар|adapter/i.test(hay)) return "Аксессуары";
    return value;
  }

  if (top === "Энергомониторинг") {
    if (/счетчик|meter|энерго|power meter|modbus meter/i.test(hay)) return "Электросчетчики";
    return value;
  }

  if (top === "Аудио / Multiroom") {
    if (/multiroom|music server|audioserver/i.test(hay)) return "Multiroom";
    if (/audio|speaker|sound|amp|усилител|колонк|динам/i.test(hay)) return "Аудио";
    return value;
  }

  if (top === "Комплекты") {
    if (/реле|диммер|light|освещ/i.test(hay)) return "Наборы для освещения";
    if (/контроллер|server|mini|управлен/i.test(hay)) return "Наборы управления";
    if (/датчик|sensor|detect/i.test(hay)) return "Наборы датчиков";
    if (/комплект|kit|bundle/i.test(hay)) return "Готовые комплекты";
    return value;
  }

  if (top === "Аксессуары") {
    return getAccessoriesBucket();
  }

  return value;
}

function getVirtualFunctionalCategory(row, normalizedSub) {
  const top = String(row.functional_category || "").trim();
  if (top !== "Аксессуары") return top;
  if (normalizedSub === "Мерч") return "Аксессуары";
  if (normalizedSub === "Антенны") return "Управление и автоматизация";
  if (!normalizedSub) return "";
  return "Монтаж";
}

function csvEsc(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const c = a.functional_category.localeCompare(b.functional_category, "ru");
    if (c) return c;
    const order = ORDER[a.functional_category] || [];
    const ai = order.indexOf(a.functional_subcategory);
    const bi = order.indexOf(b.functional_subcategory);
    if (ai !== bi) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    const s = a.functional_subcategory.localeCompare(b.functional_subcategory, "ru");
    if (s) return s;
    return a.product_name.localeCompare(b.product_name, "ru");
  });
}

function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare(`
      SELECT
        pfc.category_name AS functional_category,
        p.id AS product_id,
        p.article,
        p.name,
        p.brand,
        p.category AS product_top_category,
        p.subcategory,
        p.group_name,
        p.brand_subcategory,
        p.breadcrumbs
      FROM product_function_categories pfc
      JOIN products p ON p.id = pfc.product_id
      WHERE TRIM(COALESCE(pfc.category_name, '')) <> ''
    `)
    .all();

  const out = [];
  for (const row of rows) {
    const top = String(row.functional_category || "").trim();
    const rawSub = deriveRawSub(row);
    const normalizedSub = normalizeSub(top, rawSub, row);
    const virtualTop = getVirtualFunctionalCategory(row, normalizedSub);
    if (!virtualTop || !normalizedSub) continue;
    out.push({
      functional_category: virtualTop,
      functional_subcategory: normalizedSub,
      product_name: row.name,
      product_id: row.product_id,
      article: row.article,
      brand: row.brand,
      source_functional_category: row.functional_category,
      raw_subcategory: rawSub
    });
  }

  sortRows(out);

  const csvHeader = [
    "functional_category",
    "functional_subcategory",
    "product_name",
    "product_id",
    "article",
    "brand",
    "source_functional_category",
    "raw_subcategory"
  ];
  const csvLines = [csvHeader.join(",")];
  for (const r of out) {
    csvLines.push([
      csvEsc(r.functional_category),
      csvEsc(r.functional_subcategory),
      csvEsc(r.product_name),
      csvEsc(r.product_id),
      csvEsc(r.article),
      csvEsc(r.brand),
      csvEsc(r.source_functional_category),
      csvEsc(r.raw_subcategory)
    ].join(","));
  }

  const grouped = {};
  for (const r of out) {
    grouped[r.functional_category] ||= {};
    grouped[r.functional_category][r.functional_subcategory] ||= [];
    grouped[r.functional_category][r.functional_subcategory].push({
      id: r.product_id,
      article: r.article,
      brand: r.brand,
      name: r.product_name,
      sourceFunctionalCategory: r.source_functional_category,
      rawSubcategory: r.raw_subcategory
    });
  }

  const csvPath = path.resolve(OUT_CSV);
  const jsonPath = path.resolve(OUT_JSON);
  fs.writeFileSync(csvPath, csvLines.join("\n"), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify(grouped, null, 2), "utf8");

  console.log(`written: ${csvPath}`);
  console.log(`written: ${jsonPath}`);
  console.log(`rows: ${out.length}`);
}

main();
