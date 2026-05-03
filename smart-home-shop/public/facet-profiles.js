function parseFacetNumeric(value, unitPattern) {
  const m = String(value || "").match(/(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/);
  if (!m) return null;
  const n = Number(String(m[1]).replace(",", "."));
  const u = String(m[2] || "").toLowerCase();
  if (!Number.isFinite(n)) return null;
  if (unitPattern && !unitPattern.test(u)) return null;
  return { n, u };
}

export function getCategoryFacetProfile(categoryName) {
  const key = String(categoryName || "").trim();
  const defaults = {
    channels: [1, 64],
    supplyVoltages: [0.5, 400],
    nominalCurrents: [0.05, 200],
    nominalPowers: [0.1, 20000]
  };
  const profiles = {
    "Управление и автоматизация": { channels: [1, 128], supplyVoltages: [1, 400], nominalCurrents: [0.05, 100], nominalPowers: [0.1, 5000] },
    "Освещение": { channels: [1, 32], supplyVoltages: [1, 400], nominalCurrents: [0.05, 63], nominalPowers: [0.1, 10000] },
    "Безопасность и доступ": { channels: [1, 8], supplyVoltages: [1, 250], nominalCurrents: [0.01, 32], nominalPowers: [0.05, 2000] },
    "Климат": { channels: [1, 16], supplyVoltages: [1, 400], nominalCurrents: [0.05, 63], nominalPowers: [0.1, 5000] },
    "Аудио и мультимедиа": { channels: [1, 16], supplyVoltages: [1, 250], nominalCurrents: [0.05, 32], nominalPowers: [0.1, 2000] },
    "Монтаж и расходники": { channels: [1, 16], supplyVoltages: [1, 250], nominalCurrents: [0.05, 32], nominalPowers: [0.1, 5000] },
    "Энергия и учет": { channels: [1, 32], supplyVoltages: [1, 400], nominalCurrents: [0.05, 100], nominalPowers: [0.1, 5000] },
    "Комплекты": { channels: [1, 16], supplyVoltages: [1, 250], nominalCurrents: [0.05, 63], nominalPowers: [0.1, 5000] }
  };
  return profiles[key] || defaults;
}

export function applyFacetProfile(options, facetKey, profile) {
  const rows = Array.isArray(options) ? options : [];
  if (!profile) return rows;
  if (facetKey === "channels") {
    const [min, max] = profile.channels || [1, 64];
    return rows.filter((row) => {
      const n = Number(String(row?.value || "").replace(/[^\d]/g, ""));
      return Number.isFinite(n) && n >= min && n <= max;
    });
  }
  if (facetKey === "supplyVoltages") {
    const [min, max] = profile.supplyVoltages || [0.5, 400];
    return rows.filter((row) => {
      const p = parseFacetNumeric(row?.value, /^(v|mv|kv)$/);
      if (!p) return false;
      const asV = p.u === "mv" ? p.n / 1000 : (p.u === "kv" ? p.n * 1000 : p.n);
      return asV >= min && asV <= max;
    });
  }
  if (facetKey === "nominalCurrents") {
    const [min, max] = profile.nominalCurrents || [0.05, 200];
    return rows.filter((row) => {
      const p = parseFacetNumeric(row?.value, /^(a|ma)$/);
      if (!p) return false;
      const asA = p.u === "ma" ? p.n / 1000 : p.n;
      return asA >= min && asA <= max;
    });
  }
  if (facetKey === "nominalPowers") {
    const [min, max] = profile.nominalPowers || [0.1, 20000];
    return rows.filter((row) => {
      const p = parseFacetNumeric(row?.value, /^(w|mw|kw)$/);
      if (!p) return false;
      const asW = p.u === "mw" ? p.n / 1000 : (p.u === "kw" ? p.n * 1000 : p.n);
      return asW >= min && asW <= max;
    });
  }
  return rows;
}
