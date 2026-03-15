const Database = require("better-sqlite3");

const DB_PATH = "data/shop.db";

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
  "Энергомониторинг": [
    "Электросчетчики",
    "Прочее"
  ],
  "Аудио / Multiroom": [
    "Multiroom",
    "Аудио",
    "Прочее"
  ],
  "Комплекты": [
    "Готовые комплекты",
    "Наборы для освещения",
    "Наборы управления",
    "Наборы датчиков",
    "Прочее"
  ],
  "Аксессуары": [
    "Блоки питания",
    "Антенны",
    "Клеммы и коннекторы",
    "Крепеж и монтаж",
    "Кабели и переходники",
    "Мерч",
    "Прочее"
  ]
};

function splitBreadcrumbs(raw) {
  return String(raw || "")
    .split(/[>→|/]+/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function deriveSub(row) {
  const top = String(row.category || "").trim();
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

function normalize(top, sub, row) {
  const value = String(sub || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  const name = String(row.name || "").toLowerCase();
  const article = String(row.article || "").toLowerCase();
  const hay = `${lower} ${name} ${article}`;

  if (top === "Управление и автоматизация") {
    if (/магазин\s+loxone.*энергия|сетев.*карт.*холодильник|отдых\s*и\s*spa/i.test(value)) return "";
    if (lower === "реле" || lower === "диммеры" || lower === "реле и диммеры") return "Реле и диммеры";
    if (lower.includes("модули для контроллер")) return "Контроллеры";
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
    if (/кабел|провод|interface|интерфейс|rs-?232|rs-?485|uart/i.test(hay)) return "Кабель и провода";
    if (/креп|кроншт|держател/i.test(hay)) return "Крепеж";
    if (/короб|din|рейк|щит|подрозет|блок|модул|адаптер|выключател|sw\d+/i.test(hay)) return "Монтажные элементы";
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
    if (/вся продукц|^6\)$/.test(lower)) return "";
    if (/блок питания|power supply|adapter 24v|24v.*a\b|type e,f|flush-mounted power/i.test(hay)) return "Блоки питания";
    if (/antenna|антенн|sma/i.test(hay)) return "Антенны";
    if (/клемм|terminal|connector|link \(25|24v \(25|tree \(25/i.test(hay)) return "Клеммы и коннекторы";
    if (/креплен|подставк|wallmount|mount|holder/i.test(hay)) return "Крепеж и монтаж";
    if (/кабел|переходник|uart|rs-?232|rs-?485|probe/i.test(hay)) return "Кабели и переходники";
    if (/поло|тапочк|fanshirt|shirt|merch/i.test(hay)) return "Мерч";
    return value;
  }

  return value;
}

function sortKeys(top, keys) {
  const order = ORDER[top] || [];
  if (!order.length) return [...keys].sort((a, b) => a.localeCompare(b, "ru"));
  const idx = new Map(order.map((x, i) => [x, i]));
  return [...keys].sort((a, b) => {
    const ai = idx.has(a) ? idx.get(a) : Number.MAX_SAFE_INTEGER;
    const bi = idx.has(b) ? idx.get(b) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    if (a === "Прочее") return 1;
    if (b === "Прочее") return -1;
    return a.localeCompare(b, "ru");
  });
}

function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare("SELECT id, article, name, category, subcategory, group_name, breadcrumbs, brand_subcategory FROM products")
    .all();

  const tops = Array.from(new Set(rows.map((r) => String(r.category || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru")
  );

  console.log("# Category Browser Structure Audit");
  console.log("");
  tops.forEach((top) => {
    const list = rows
      .filter((r) => String(r.category || "").trim() === top)
      .map((r) => normalize(top, deriveSub(r), r))
      .filter(Boolean);
    const counts = new Map();
    list.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
    const keys = sortKeys(top, counts.keys());

    console.log(`## ${top} (${list.length})`);
    if (!keys.length) {
      console.log("- [empty]");
      console.log("");
      return;
    }
    keys.forEach((k) => console.log(`- ${k}: ${counts.get(k)}`));
    console.log("");
  });
}

main();
