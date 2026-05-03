const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = "data/shop.db";
const OUT_DIR = "reports";
const OUT_MAIN = "functional_catalog_products.normalized.v2.csv";
const OUT_MAPPING = "category_mapping.csv";
const OUT_REPORT = "normalization_report.md";
const OUT_QC = "normalization_qc_report.md";

const DICTIONARIES = {
  entity_type: "dictionary_entity_type.csv",
  system_domain: "dictionary_system_domain.csv",
  device_type: "dictionary_device_type.csv",
  commercial_group: "dictionary_commercial_group.csv"
};

const NOW_ISO = new Date().toISOString();

function slugify(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function htmlDecode(input) {
  return String(input || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function cleanText(input) {
  return htmlDecode(String(input || "")).replace(/\s+/g, " ").trim();
}

function splitBreadcrumbs(raw) {
  return cleanText(raw)
    .split(/[>→|/]+/g)
    .map((x) => cleanText(x))
    .filter(Boolean);
}

function csvEsc(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

function normalizeBool(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "" || s === "active" || s === "активен" ? "true" : "false";
}

function extractProductNameRu(name) {
  const raw = cleanText(name);
  // Remove trailing english alias in parentheses if present.
  const noEnTail = raw.replace(/\s*\(([A-Za-z0-9\s\-&/.,+]+)\)\s*$/g, "").trim();
  return noEnTail || raw;
}

function extractProductNameEn(name) {
  const raw = cleanText(name);
  const m = raw.match(/\(([A-Za-z0-9\s\-&/.,+]+)\)\s*$/);
  return m ? cleanText(m[1]) : "";
}

function parseArticle(article) {
  const a = cleanText(article);
  if (!a) return { article: "", base_article: "", revision: "" };
  const revMatch = a.match(/^(.*?)[\s\-_]*(v\d+(?:\.\d+)?|rev\.?[a-z0-9]+)$/i);
  if (!revMatch) return { article: a, base_article: a, revision: "" };
  return {
    article: a,
    base_article: cleanText(revMatch[1]),
    revision: cleanText(revMatch[2])
  };
}

function deriveRawSub(row) {
  const top = cleanText(row.functional_category);
  const subField = cleanText(row.subcategory || row.brand_subcategory);
  const crumbs = splitBreadcrumbs(row.breadcrumbs);
  const groupRaw = cleanText(row.group_name);
  if (subField && subField.toLowerCase() !== top.toLowerCase()) return subField;
  if (crumbs.length > 1) return crumbs[crumbs.length - 1];
  if (groupRaw && groupRaw !== top) {
    if (groupRaw.includes("/")) return cleanText(groupRaw.split("/").pop() || groupRaw);
    return groupRaw;
  }
  return top;
}

function normalizeSub(top, rawSub, row) {
  const value = cleanText(rawSub);
  if (!value) return "";
  const lower = value.toLowerCase();
  const name = cleanText(row.name).toLowerCase();
  const article = cleanText(row.article).toLowerCase();
  const sourceTop = cleanText(row.product_top_category);
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

  if (top === "Аудио \/ Multiroom") {
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

function mapCommercialGroup(domainTop) {
  const top = cleanText(domainTop);
  const map = {
    "Управление и автоматизация": "Управление и автоматизация",
    "Освещение": "Освещение",
    "Климат": "Климат",
    "Безопасность": "Безопасность и доступ",
    "Энергомониторинг": "Энергия и учет",
    "Аудио / Multiroom": "Аудио и мультимедиа",
    "Проводное оборудование УД": "Сеть и инфраструктура",
    "Монтаж": "Монтаж и расходники",
    "Комплекты": "Комплекты",
    "Услуги": "Услуги",
    "Аксессуары": "Мерч"
  };
  return map[top] || "Монтаж и расходники";
}

function mapSystemDomain(commercialGroup, subgroup) {
  const g = cleanText(commercialGroup);
  const s = cleanText(subgroup).toLowerCase();
  if (g === "Управление и автоматизация") return "control_automation";
  if (g === "Освещение") return "lighting";
  if (g === "Климат") return "climate";
  if (g === "Безопасность и доступ") {
    if (/доступ|замок|домофон/.test(s)) return "access";
    return "security";
  }
  if (g === "Энергия и учет") return "energy";
  if (g === "Аудио и мультимедиа") return "audio_multimedia";
  if (g === "Сеть и инфраструктура") return "network_infrastructure";
  if (g === "Монтаж и расходники") return "installation";
  return "general";
}

function mapEntityType(row, commercialGroup, subgroup) {
  const g = cleanText(commercialGroup);
  const s = cleanText(subgroup).toLowerCase();
  const name = cleanText(row.name).toLowerCase();
  if (g === "Услуги" || /проектирован|монтаж|пусконалад|консалт|поддержк|обследован/.test(name)) return "service";
  if (g === "Мерч" || /поло|shirt|тапочк|мерч|сувенир/.test(name)) return "merch";
  if (g === "Комплекты" || /комплект|kit|bundle/.test(name)) return "kit";
  if (/software|license|лиценз|api|облачн|cloud/.test(name) || /софт|сервис/.test(s)) return "software";
  return "product";
}

function mapDeviceType(subgroup, name, entityType) {
  if (entityType === "service") return "service";
  if (entityType === "software") return "software";
  if (entityType === "merch") return "merch";
  if (entityType === "kit") return "kit";
  const s = cleanText(subgroup).toLowerCase();
  const n = cleanText(name).toLowerCase();
  if (/контроллер|минисервер|климат-контроллер/.test(s) || /controller|miniserver/.test(n)) return "controller";
  if (/реле/.test(s)) return "relay";
  if (/диммер/.test(s)) return "dimmer";
  if (/датчик/.test(s) || /sensor|detector/.test(n)) return "sensor";
  if (/панел|hmi|выключател/.test(s) || /touch/.test(n)) return "panel";
  if (/термостат/.test(s)) return "thermostat";
  if (/счетчик|мониторинг энергии/.test(s) || /meter/.test(n)) return "meter";
  if (/блоки питания|источники питания/.test(s) || /power supply/.test(n)) return "power_supply";
  if (/кабель/.test(s) || /cable/.test(n)) return "cable";
  if (/клеммы|коннектор|переходник|интерфейс/.test(s) || /connector|adapter|interface/.test(n)) return "connector";
  if (/крепеж|монтаж/.test(s) || /mount|holder|din/.test(n)) return "mount";
  if (/шлюз|gateway/.test(s) || /gateway/.test(n)) return "gateway";
  if (/привод|клапан/.test(s) || /actuator|valve/.test(n)) return "actuator";
  if (/switch|выключател/.test(n)) return "switch";
  return "other";
}

function virtualFunctionalCategory(sourceCategory, normalizedSub) {
  const top = cleanText(sourceCategory);
  if (top !== "Аксессуары") return top;
  if (normalizedSub === "Мерч") return "Аксессуары";
  if (normalizedSub === "Антенны") return "Управление и автоматизация";
  if (!normalizedSub) return "";
  return "Монтаж";
}

function buildNormalizationStatus(row) {
  const subgroup = cleanText(row.commercial_subgroup);
  if (!subgroup || subgroup.toLowerCase() === "прочее") {
    return {
      normalization_status: "needs_review",
      normalization_note: "Подгруппа временная или пустая, требуется ручная проверка."
    };
  }
  if (cleanText(row.source_category) !== cleanText(row.functional_category)) {
    return {
      normalization_status: "manual_override",
      normalization_note: "Категория изменена правилом нормализации."
    };
  }
  return {
    normalization_status: "normalized",
    normalization_note: ""
  };
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEsc(row[h])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function writeDictionary(outDir, dictName, values) {
  const filePath = path.join(outDir, DICTIONARIES[dictName]);
  const rows = values
    .filter(Boolean)
    .map((v) => ({ value: v }))
    .sort((a, b) => a.value.localeCompare(b.value, "ru"));
  writeCsv(filePath, ["value"], rows);
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
        p.breadcrumbs,
        p.status,
        p.updated_at
      FROM product_function_categories pfc
      JOIN products p ON p.id = pfc.product_id
      WHERE TRIM(COALESCE(pfc.category_name, '')) <> ''
    `)
    .all();

  const outRows = [];
  const mappingRows = [];
  let index = 1;
  for (const r of rows) {
    const sourceCategory = cleanText(r.functional_category);
    const sourceSub = cleanText(r.subcategory);
    const sourceLabel = cleanText(r.subcategory || r.brand_subcategory || r.group_name || deriveRawSub(r));
    const rawSub = deriveRawSub(r);
    const normalizedSub = normalizeSub(sourceCategory, rawSub, r);
    const functionalCategory = virtualFunctionalCategory(sourceCategory, normalizedSub);
    if (!functionalCategory || !normalizedSub) continue;

    const commercialGroup = mapCommercialGroup(functionalCategory);
    const commercialSubgroup = normalizedSub;
    const systemDomain = mapSystemDomain(commercialGroup, commercialSubgroup);
    const productNameRu = extractProductNameRu(r.name);
    const productNameEn = extractProductNameEn(r.name);
    const displayName = productNameRu || cleanText(r.name);
    const articleParsed = parseArticle(r.article);
    const entityType = mapEntityType(r, commercialGroup, commercialSubgroup);
    const deviceType = mapDeviceType(commercialSubgroup, r.name, entityType);
    const isActive = normalizeBool(r.status);

    const base = {
      entity_id: `ENT-${String(index).padStart(6, "0")}`,
      entity_type: entityType,
      brand: cleanText(r.brand),
      product_name_ru: productNameRu,
      product_name_en: productNameEn,
      display_name: displayName,
      article: articleParsed.article,
      base_article: articleParsed.base_article,
      revision: articleParsed.revision,
      system_domain: systemDomain,
      device_type: deviceType,
      commercial_group: commercialGroup,
      commercial_subgroup: commercialSubgroup,
      is_active: isActive,
      source_category: sourceCategory,
      source_subcategory: sourceSub || rawSub,
      source_label: sourceLabel || rawSub,
      functional_category: functionalCategory,
      normalization_status: "",
      normalization_note: "",
      created_at: NOW_ISO,
      updated_at: cleanText(r.updated_at) || NOW_ISO
    };
    const status = buildNormalizationStatus(base);
    base.normalization_status = status.normalization_status;
    base.normalization_note = status.normalization_note;
    outRows.push(base);

    mappingRows.push({
      old_functional_category: sourceCategory,
      old_functional_subcategory: sourceSub || rawSub,
      new_entity_type: entityType,
      new_system_domain: systemDomain,
      new_device_type: deviceType,
      new_commercial_group: commercialGroup,
      new_commercial_subgroup: commercialSubgroup,
      mapping_rule: `rule:${slugify(sourceCategory)}->${slugify(commercialGroup)}/${slugify(commercialSubgroup)}`,
      manual_flag: base.normalization_status === "manual_override" || base.normalization_status === "needs_review" ? "true" : "false"
    });

    index += 1;
  }

  outRows.sort((a, b) => {
    const g = a.commercial_group.localeCompare(b.commercial_group, "ru");
    if (g) return g;
    const sg = a.commercial_subgroup.localeCompare(b.commercial_subgroup, "ru");
    if (sg) return sg;
    return a.display_name.localeCompare(b.display_name, "ru");
  });

  const uniqueMapping = [];
  const seenMap = new Set();
  for (const r of mappingRows) {
    const key = [
      r.old_functional_category,
      r.old_functional_subcategory,
      r.new_entity_type,
      r.new_system_domain,
      r.new_device_type,
      r.new_commercial_group,
      r.new_commercial_subgroup
    ].join("|");
    if (seenMap.has(key)) continue;
    seenMap.add(key);
    uniqueMapping.push(r);
  }
  uniqueMapping.sort((a, b) => {
    const c = a.old_functional_category.localeCompare(b.old_functional_category, "ru");
    if (c) return c;
    const s = a.old_functional_subcategory.localeCompare(b.old_functional_subcategory, "ru");
    if (s) return s;
    return a.new_commercial_group.localeCompare(b.new_commercial_group, "ru");
  });

  const outDir = path.resolve(OUT_DIR);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  writeCsv(path.join(outDir, OUT_MAIN), [
    "entity_id",
    "entity_type",
    "brand",
    "product_name_ru",
    "product_name_en",
    "display_name",
    "article",
    "base_article",
    "revision",
    "system_domain",
    "device_type",
    "commercial_group",
    "commercial_subgroup",
    "is_active",
    "source_category",
    "source_subcategory",
    "source_label",
    "normalization_status",
    "normalization_note",
    "created_at",
    "updated_at"
  ], outRows);

  writeCsv(path.join(outDir, OUT_MAPPING), [
    "old_functional_category",
    "old_functional_subcategory",
    "new_entity_type",
    "new_system_domain",
    "new_device_type",
    "new_commercial_group",
    "new_commercial_subgroup",
    "mapping_rule",
    "manual_flag"
  ], uniqueMapping);

  writeDictionary(outDir, "entity_type", Array.from(new Set(outRows.map((x) => x.entity_type))));
  writeDictionary(outDir, "system_domain", Array.from(new Set(outRows.map((x) => x.system_domain))));
  writeDictionary(outDir, "device_type", Array.from(new Set(outRows.map((x) => x.device_type))));
  writeDictionary(outDir, "commercial_group", Array.from(new Set(outRows.map((x) => x.commercial_group))));

  const counts = (key) => {
    const m = new Map();
    for (const r of outRows) m.set(r[key], (m.get(r[key]) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };

  const report = [];
  report.push("# Отчет по нормализации каталога v2");
  report.push("");
  report.push(`- Дата: ${NOW_ISO}`);
  report.push(`- Всего нормализованных записей: ${outRows.length}`);
  report.push(`- Уникальных mapping-правил: ${uniqueMapping.length}`);
  report.push("");
  report.push("## Распределение по entity_type");
  counts("entity_type").forEach(([k, v]) => report.push(`- ${k}: ${v}`));
  report.push("");
  report.push("## Распределение по normalization_status");
  counts("normalization_status").forEach(([k, v]) => report.push(`- ${k}: ${v}`));
  report.push("");
  report.push("## Основные правила");
  report.push("- Аксессуары перераспределены: мерч остается в `Мерч`, антенны уходят в `Сеть/инфраструктуру` через `Управление и автоматизация`, остальное в `Монтаж и расходники`.");
  report.push("- Услуги, комплекты, ПО и мерч разделяются по `entity_type`.");
  report.push("- Для строк с подгруппой `Прочее` присваивается `needs_review`.");
  fs.writeFileSync(path.join(outDir, OUT_REPORT), report.join("\n"), "utf8");

  const qc = [];
  const requiredFields = [
    "entity_id",
    "entity_type",
    "display_name",
    "system_domain",
    "device_type",
    "commercial_group",
    "normalization_status"
  ];
  let missingRequired = 0;
  for (const r of outRows) {
    for (const f of requiredFields) {
      if (!cleanText(r[f])) {
        missingRequired += 1;
        break;
      }
    }
  }
  const needsReview = outRows.filter((x) => x.normalization_status === "needs_review");
  const otherShare = outRows.length ? (needsReview.length / outRows.length) * 100 : 0;
  qc.push("# QC-отчет нормализации");
  qc.push("");
  qc.push(`- Всего записей: ${outRows.length}`);
  qc.push(`- Записей с незаполненными обязательными полями: ${missingRequired}`);
  qc.push(`- needs_review: ${needsReview.length} (${otherShare.toFixed(2)}%)`);
  qc.push(`- manual_override: ${outRows.filter((x) => x.normalization_status === "manual_override").length}`);
  qc.push("");
  qc.push("## Проверка критических конфликтов");
  const badService = outRows.filter((x) => x.entity_type === "service" && x.commercial_group !== "Услуги");
  qc.push(`- Услуги вне группы 'Услуги': ${badService.length}`);
  const badMerch = outRows.filter((x) => x.entity_type === "merch" && x.commercial_group !== "Мерч");
  qc.push(`- Мерч вне группы 'Мерч': ${badMerch.length}`);
  const badHtml = outRows.filter((x) => /&amp;|&quot;|&#39;|&lt;|&gt;/.test(x.display_name));
  qc.push(`- HTML entities в display_name: ${badHtml.length}`);
  fs.writeFileSync(path.join(outDir, OUT_QC), qc.join("\n"), "utf8");

  console.log(`written: ${path.join(outDir, OUT_MAIN)}`);
  console.log(`written: ${path.join(outDir, OUT_MAPPING)}`);
  console.log(`written: ${path.join(outDir, DICTIONARIES.entity_type)}`);
  console.log(`written: ${path.join(outDir, DICTIONARIES.system_domain)}`);
  console.log(`written: ${path.join(outDir, DICTIONARIES.device_type)}`);
  console.log(`written: ${path.join(outDir, DICTIONARIES.commercial_group)}`);
  console.log(`written: ${path.join(outDir, OUT_REPORT)}`);
  console.log(`written: ${path.join(outDir, OUT_QC)}`);
  console.log(`rows: ${outRows.length}`);
}

main();
