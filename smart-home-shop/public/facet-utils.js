function parseFacetNumericValue(key, value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = Number(String(match[0]).replace(",", "."));
  if (!Number.isFinite(n)) return null;

  if (key === "supplyVoltages") {
    if (text.includes("kv")) return n * 1000;
    if (text.includes("mv")) return n / 1000;
    return n;
  }
  if (key === "nominalCurrents") {
    if (text.includes("ma")) return n / 1000;
    return n;
  }
  if (key === "nominalPowers" || key === "maxLoads") {
    if (text.includes("kw")) return n * 1000;
    if (text.includes("mw")) return n / 1000;
    return n;
  }
  if (key === "channels" || key === "ioCounts" || key === "ipRatings") {
    return n;
  }
  return null;
}

function compareFacetOptionsByKey(a, b, key = "") {
  const left = String(a?.value || "").trim();
  const right = String(b?.value || "").trim();
  const ln = parseFacetNumericValue(key, left);
  const rn = parseFacetNumericValue(key, right);
  if (ln != null && rn != null && ln !== rn) return rn - ln;
  if (ln != null && rn == null) return -1;
  if (ln == null && rn != null) return 1;
  return left.localeCompare(right, "ru", { numeric: true });
}

function splitMulti(raw, normalizeValue, key = "") {
  const out = String(raw || "")
    .split(/[;,|]+/g)
    .map((x) => normalizeValue(key, x))
    .filter(Boolean);
  return Array.from(new Set(out));
}

function countSingle(items, getter, normalizeValue, key = "") {
  const map = new Map();
  for (const item of items) {
    const value = normalizeValue(key, getter(item));
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compareFacetOptionsByKey(a, b, key));
}

function countMulti(items, getter, normalizeValue, key = "") {
  const map = new Map();
  for (const item of items) {
    for (const value of splitMulti(getter(item), normalizeValue, key)) {
      map.set(value, (map.get(value) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compareFacetOptionsByKey(a, b, key));
}

function matchesSingle(raw, selectedSet, normalizeValue, key = "") {
  if (selectedSet.size === 0) return true;
  const value = normalizeValue(key, raw);
  return value ? selectedSet.has(value) : false;
}

function matchesMulti(raw, selectedSet, normalizeValue, key = "") {
  if (selectedSet.size === 0) return true;
  return splitMulti(raw, normalizeValue, key).some((value) => selectedSet.has(value));
}

function matchesMultiAll(raw, selectedSet, normalizeValue, key = "") {
  if (selectedSet.size === 0) return true;
  const own = new Set(splitMulti(raw, normalizeValue, key));
  for (const value of selectedSet) {
    if (!own.has(value)) return false;
  }
  return true;
}

function renderCheckGroup(title, key, options, selectedSet, formatValue) {
  if (!options.length) return "";
  const scrollClass = options.length >= 15
    ? "filter-scroll is-three-col"
    : options.length >= 6
      ? "filter-scroll is-two-col"
      : "filter-scroll";
  return `
    <fieldset class="filter-group">
      <legend>${title}</legend>
      <div class="${scrollClass}">
        ${options
          .map(({ value, count }) => {
            const checked = selectedSet.has(value) ? "checked" : "";
            const display = formatValue(key, value);
            return `
              <label class="check-field">
                <input class="check-input" type="checkbox" value="${value}" data-filter-key="${key}" ${checked} />
                <span class="check-label">${display} <small>(${count})</small></span>
              </label>
            `;
          })
          .join("")}
      </div>
    </fieldset>
  `;
}

function detectContext(selectedSub) {
  const sub = String(selectedSub || "").toLowerCase();
  return {
    sensors: /датчик|sensor|сенсор/.test(sub),
    controllers: /контроллер|controller|шлюз|gateway|сервер|plc/.test(sub),
    relays: /реле|relay|диммер|dimmer/.test(sub)
  };
}

export function createFacetHelpers({ normalizeValue, formatValue }) {
  const normalize = typeof normalizeValue === "function" ? normalizeValue : (_k, v) => String(v || "").trim();
  const format = typeof formatValue === "function" ? formatValue : (_k, v) => String(v || "").trim();

  return {
    splitMulti: (raw, key = "") => splitMulti(raw, normalize, key),
    parseFacetNumericValue,
    compareFacetOptionsByKey,
    countSingle: (items, getter, key = "") => countSingle(items, getter, normalize, key),
    countMulti: (items, getter, key = "") => countMulti(items, getter, normalize, key),
    matchesSingle: (raw, selectedSet, key = "") => matchesSingle(raw, selectedSet, normalize, key),
    matchesMulti: (raw, selectedSet, key = "") => matchesMulti(raw, selectedSet, normalize, key),
    matchesMultiAll: (raw, selectedSet, key = "") => matchesMultiAll(raw, selectedSet, normalize, key),
    renderCheckGroup: (title, key, options, selectedSet) => renderCheckGroup(title, key, options, selectedSet, format),
    detectContext
  };
}
