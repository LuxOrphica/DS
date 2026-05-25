function createExchangeRateService({ upsertExchangeRate, recalculateProductPriceRub }) {
  async function fetchEurRubRateFromCbr() {
    const response = await fetch("https://www.cbr.ru/scripts/XML_daily.asp");
    if (!response.ok) throw new Error(`CBR HTTP ${response.status}`);
    const xml = await response.text();
    const eurBlock = xml.match(/<Valute[^>]*ID="R01239"[\s\S]*?<\/Valute>/i);
    if (!eurBlock) throw new Error("EUR block not found in CBR XML");
    const valueMatch = eurBlock[0].match(/<Value>([^<]+)<\/Value>/i);
    const nominalMatch = eurBlock[0].match(/<Nominal>([^<]+)<\/Nominal>/i);
    const dateMatch = xml.match(/Date="([^"]+)"/i);
    const rawValue = String(valueMatch?.[1] || "").replace(",", ".").trim();
    const rawNominal = String(nominalMatch?.[1] || "").replace(",", ".").trim();
    const value = Number(rawValue);
    const nominal = Number(rawNominal || "1");
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(nominal) || nominal <= 0) {
      throw new Error("Invalid EUR/RUB rate payload from CBR");
    }

    let effectiveDate = new Date().toISOString().slice(0, 10);
    if (dateMatch?.[1]) {
      const parts = String(dateMatch[1]).split(".");
      if (parts.length === 3) {
        const [dd, mm, yyyy] = parts;
        effectiveDate = `${yyyy}-${mm}-${dd}`;
      }
    }

    return {
      rate: value / nominal,
      effectiveDate
    };
  }

  async function refreshEurRubRate() {
    try {
      const payload = await fetchEurRubRateFromCbr();
      const saved = await Promise.resolve(upsertExchangeRate({
        base: "EUR",
        quote: "RUB",
        rate: payload.rate,
        effectiveDate: payload.effectiveDate,
        source: "cbr.ru"
      }));
      await Promise.resolve(recalculateProductPriceRub(Number(saved?.rate || payload.rate)));
      return { ok: true, saved };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  return {
    refreshEurRubRate
  };
}

module.exports = { createExchangeRateService };
