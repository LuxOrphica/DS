const { TextDecoder } = require("util");

const CP1251_DECODER = new TextDecoder("utf-8", { fatal: true });

const MOJIBAKE_BRAND_A = "\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458 \u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451";
const MOJIBAKE_BRAND_B = "\u0420\u0491\u0420\u00b5\u0420\u00bb\u0420\u00b0\u0420\u00b5\u0420\u0458\u0421\u0403\u0420\u00b5\u0421\u201a\u0420\u0451";
const CANONICAL_SERVICE_BRAND = "\u0414\u0435\u043b\u0430\u0435\u043c \u0441\u0435\u0442\u0438";

const MOJIBAKE_AUDIO = "\u0420\u00b0\u0421\u0453\u0420\u0491\u0420\u0451\u0420\u0455";
const MOJIBAKE_AUDIO_MULTI = "\u0420\u00b0\u0421\u0453\u0420\u0491\u0420\u0451\u0420\u0455 / multiroom";
const CANONICAL_AUDIO_MULTI = "\u0410\u0443\u0434\u0438\u043e \u0438 \u043c\u0443\u043b\u044c\u0442\u0438\u043c\u0435\u0434\u0438\u0430";
const CANONICAL_SECURITY_ACCESS = "\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c \u0438 \u0434\u043e\u0441\u0442\u0443\u043f";

const MOJIBAKE_WIRELESS = "\u0420\u00b1\u0420\u00b5\u0421\u0403\u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0406\u0420\u0455\u0420\u0491";
const MOJIBAKE_WIRED = "\u0420\u0457\u0421\u0402\u0420\u0455\u0420\u0406\u0420\u0455\u0420\u0491";
const CANONICAL_WIRELESS = "\u0411\u0435\u0441\u043f\u0440\u043e\u0432\u043e\u0434\u043d\u0430\u044f";
const CANONICAL_WIRED = "\u041f\u0440\u043e\u0432\u043e\u0434\u043d\u0430\u044f";

const MOJIBAKE_RECESSED = "\u0420\u0457\u0420\u0455\u0420\u0491\u0421\u0402\u0420\u0455\u0420\u00b7\u0420\u00b5\u0421\u201a";
const MOJIBAKE_SURFACE = "\u0420\u0405\u0420\u00b0\u0420\u0454\u0420\u00bb\u0420\u00b0\u0420\u0491";
const MOJIBAKE_EMBEDDED = "\u0420\u0406\u0421\u0403\u0421\u201a\u0421\u0402\u0420\u00b0\u0420\u0451\u0420\u0406";
const CANONICAL_RECESSED = "\u041f\u043e\u0434\u0440\u043e\u0437\u0435\u0442\u043d\u0438\u043a";
const CANONICAL_SURFACE = "\u041d\u0430\u043a\u043b\u0430\u0434\u043d\u043e\u0439";
const CANONICAL_EMBEDDED = "\u0412\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u043c\u044b\u0439";
const LEGACY_QUESTION_LABEL = "?????? ? ???????????";
const CANONICAL_INTERFACES_GROUP = "\u041a\u0430\u0431\u0435\u043b\u0438 \u0438 \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u043d\u0438\u043a\u0438";

function hasMojibakeMarkers(value) {
  const s = String(value || "");
  if (!s) return false;
  return /(?:\u0420[\u0400-\u04ff]|\u0421[\u0400-\u04ff]|\u00D0.|\u00D1.|\u00C3.|\uFFFD)/.test(s);
}

function cp1251ByteFromChar(ch) {
  const code = ch.charCodeAt(0);
  if (code <= 0x7f) return code;
  if (code === 0x0401) return 0xa8;
  if (code === 0x0451) return 0xb8;
  if (code >= 0x0410 && code <= 0x044f) return code - 0x350;
  if (code === 0x2116) return 0xb9;
  if (code === 0x2122) return 0x99;
  if (code === 0x2013) return 0x96;
  if (code === 0x2014) return 0x97;
  if (code === 0x2026) return 0x85;
  if (code === 0x201c) return 0x93;
  if (code === 0x201d) return 0x94;
  if (code === 0x2018) return 0x91;
  if (code === 0x2019) return 0x92;
  return null;
}

function tryFixCp1251Utf8Mojibake(value) {
  if (!hasMojibakeMarkers(value)) return value;
  const bytes = [];
  for (const ch of String(value || "")) {
    const b = cp1251ByteFromChar(ch);
    if (b === null) return value;
    bytes.push(b);
  }
  try {
    const decoded = CP1251_DECODER.decode(new Uint8Array(bytes));
    if (!decoded) return value;
    return hasMojibakeMarkers(decoded) ? value : decoded;
  } catch {
    return value;
  }
}

function normalizeText(value) {
  const normalized = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === LEGACY_QUESTION_LABEL) return CANONICAL_INTERFACES_GROUP;
  return normalized;
}

function fixMojibake(value) {
  if (typeof value !== "string") return value;
  return normalizeText(tryFixCp1251Utf8Mojibake(value));
}

function normalizeScalar(value) {
  if (value == null || typeof value !== "string") return value;
  return fixMojibake(value);
}

function normalizeBrand(rawBrand) {
  const fixed = normalizeText(fixMojibake(rawBrand));
  const key = fixed.toLowerCase();
  if (!key) return "";
  if (key === "hite pro" || key === "hitepro" || key === "hite-pro" || key === "hite") return "Hite Pro";
  if (key === "wiren board" || key === "wirenboard" || key === "wiren-board") return "Wiren Board";
  if (key === "loxone") return "Loxone";
  if (key === "larnitech") return "Larnitech";
  if (key === MOJIBAKE_BRAND_A.toLowerCase() || key === MOJIBAKE_BRAND_B.toLowerCase()) return CANONICAL_SERVICE_BRAND;
  return fixed;
}

function normalizeCategory(rawCategory) {
  const fixed = normalizeText(fixMojibake(rawCategory));
  if (!fixed) return "";
  const key = fixed.toLowerCase();
  if (
    key === "audio" ||
    key === MOJIBAKE_AUDIO.toLowerCase() ||
    key === "audio / multiroom" ||
    key === MOJIBAKE_AUDIO_MULTI.toLowerCase() ||
    key === "аудио / multiroom"
  ) {
    return CANONICAL_AUDIO_MULTI;
  }
  if (key === "безопасность") return CANONICAL_SECURITY_ACCESS;
  return fixed;
}

function normalizeSystemType(raw) {
  const value = normalizeText(fixMojibake(raw));
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.includes(MOJIBAKE_WIRELESS.toLowerCase()) || /\bwireless\b/.test(lower) || /\brf\b/.test(lower)) return CANONICAL_WIRELESS;
  if (lower.includes(MOJIBAKE_WIRED.toLowerCase()) || /\bwired\b/.test(lower)) return CANONICAL_WIRED;
  return value;
}

function normalizeProtocolToken(raw) {
  const value = normalizeText(fixMojibake(raw));
  if (!value) return "";
  if (/rs[\s-]?485/i.test(value)) return "RS-485";
  if (/modbus/i.test(value)) return "Modbus";
  if (/ethernet/i.test(value)) return "Ethernet";
  if (/wi[\s-]?fi/i.test(value)) return "Wi-Fi";
  if (/zigbee/i.test(value)) return "Zigbee";
  if (/z[\s-]?wave/i.test(value)) return "Z-Wave";
  if (/dali/i.test(value)) return "DALI";
  if (/bluetooth|\bble\b/i.test(value)) return "BLE";
  if (/knx/i.test(value)) return "KNX";
  if (/mqtt/i.test(value)) return "MQTT";
  if (/\bcan\b/i.test(value)) return "CAN";
  return value;
}

function normalizeProtocolValue(raw) {
  const tokens = String(raw || "")
    .split(/[;,|]+/g)
    .map((x) => normalizeProtocolToken(x))
    .filter(Boolean);
  return [...new Set(tokens)].join(", ");
}

function normalizeMountingToken(raw) {
  const value = normalizeText(fixMojibake(raw));
  if (!value) return "";
  const lower = value.toLowerCase();
  if (/din/i.test(value)) return "DIN";
  if (lower.includes(MOJIBAKE_RECESSED.toLowerCase()) || /\brecessed\b/.test(lower)) return CANONICAL_RECESSED;
  if (lower.includes(MOJIBAKE_SURFACE.toLowerCase()) || /\bsurface\b/.test(lower) || /\bwall\b/.test(lower)) return CANONICAL_SURFACE;
  if (lower.includes(MOJIBAKE_EMBEDDED.toLowerCase())) return CANONICAL_EMBEDDED;
  return value;
}

function normalizeMountingValue(raw) {
  const tokens = String(raw || "")
    .split(/[;,|]+/g)
    .map((x) => normalizeMountingToken(x))
    .filter(Boolean);
  return [...new Set(tokens)].join(", ");
}

function normalizeChannelsValue(raw) {
  const match = String(raw || "").match(/(\d+)/);
  if (!match) return "";
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1 || n > 128) return "";
  return `${n} ch`;
}

function normalizeMetricValue(kind, raw) {
  const value = normalizeText(fixMojibake(raw));
  if (!value) return "";
  const m = value.match(/(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z\u0400-\u04FF]+)/);
  if (!m) return value;

  const n = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";

  const unitRaw = String(m[2] || "").toLowerCase();
  const normalizedNum = String(Math.round(n * 100) / 100).replace(".", ",");

  if (kind === "voltage") {
    if (/^(kv|\u043a\u0432)/.test(unitRaw)) return `${normalizedNum} kV`;
    if (/^(mv|\u043c\u0432)/.test(unitRaw)) return `${normalizedNum} mV`;
    if (/^(v|\u0432)/.test(unitRaw)) return `${normalizedNum} V`;
    return "";
  }
  if (kind === "current") {
    if (/^(ma|\u043c\u0430)/.test(unitRaw)) return `${normalizedNum} mA`;
    if (/^(a|\u0430)/.test(unitRaw)) return `${normalizedNum} A`;
    return "";
  }
  if (kind === "power") {
    if (/^(kw|\u043a\u0432\u0442)/.test(unitRaw)) return `${normalizedNum} kW`;
    if (/^(mw|\u043c\u0432\u0442)/.test(unitRaw)) return `${normalizedNum} mW`;
    if (/^(w|\u0432\u0442)/.test(unitRaw)) return `${normalizedNum} W`;
    return "";
  }
  return "";
}

function normalizeTechnicalPatchValues(input = {}) {
  const out = {};
  if (Object.prototype.hasOwnProperty.call(input, "systemType")) out.systemType = normalizeSystemType(input.systemType);
  if (Object.prototype.hasOwnProperty.call(input, "protocol")) out.protocol = normalizeProtocolValue(input.protocol);
  if (Object.prototype.hasOwnProperty.call(input, "mounting")) out.mounting = normalizeMountingValue(input.mounting);
  if (Object.prototype.hasOwnProperty.call(input, "supplyVoltage")) out.supplyVoltage = normalizeMetricValue("voltage", input.supplyVoltage);
  if (Object.prototype.hasOwnProperty.call(input, "channels")) out.channels = normalizeChannelsValue(input.channels);
  if (Object.prototype.hasOwnProperty.call(input, "nominalCurrent")) out.nominalCurrent = normalizeMetricValue("current", input.nominalCurrent);
  if (Object.prototype.hasOwnProperty.call(input, "nominalPower")) out.nominalPower = normalizeMetricValue("power", input.nominalPower);
  return out;
}

function normalizeOrderDocumentsInput(input) {
  const allowedTypes = new Set(["confirmation", "invoice", "receipt", "waybill", "upd"]);
  const source = Array.isArray(input) ? input : [];
  const out = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const title = normalizeText(fixMojibake(item.title || item.name || ""));
    const url = normalizeText(String(item.url || ""));
    const rawType = normalizeText(fixMojibake(item.type || ""));
    if (!url) continue;
    if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) continue;
    const type = allowedTypes.has(rawType) ? rawType : "confirmation";
    out.push({
      type,
      title: title || "Документ",
      url
    });
  }
  return out;
}

function normalizeIntBool(value) {
  if (value === true || value === 1 || value === "1" || value === "true") return 1;
  return 0;
}

module.exports = {
  fixMojibake,
  hasMojibakeMarkers,
  normalizeBrand,
  normalizeCategory,
  normalizeChannelsValue,
  normalizeIntBool,
  normalizeMetricValue,
  normalizeMountingValue,
  normalizeOrderDocumentsInput,
  normalizeProtocolValue,
  normalizeScalar,
  normalizeSystemType,
  normalizeTechnicalPatchValues,
  normalizeText,
  tryFixCp1251Utf8Mojibake
};
